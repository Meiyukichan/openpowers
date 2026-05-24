/**
 * @fileoverview Tests for ui command module
 * @author Meiyuki <meiyukichan@163.com>
 * @copyright 2026 Meiyuki
 */

import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import { Command } from 'commander';

// ---- mocks ----

const { isPortInUseMock, killPortProcessMock, waitForPortFreeMock } = vi.hoisted(() => ({
  isPortInUseMock: vi.fn(),
  killPortProcessMock: vi.fn(),
  waitForPortFreeMock: vi.fn(),
}));

vi.mock('../utils/port-manager.js', () => ({
  isPortInUse: isPortInUseMock,
  killPortProcess: killPortProcessMock,
  waitForPortFree: waitForPortFreeMock,
}));

const { execSyncMock, spawnMock, unrefMock } = vi.hoisted(() => {
  const unref = vi.fn();
  return {
    execSyncMock: vi.fn(),
    spawnMock: vi.fn<(_cmd: string, _args: string[], _opts: Record<string, unknown>) => ({ unref: () => void })>(() => ({ unref })),
    unrefMock: unref,
  };
});

vi.mock('child_process', () => ({
  execSync: execSyncMock,
  spawn: spawnMock,
}));

const { existsSyncMock } = vi.hoisted(() => ({
  existsSyncMock: vi.fn(),
}));

vi.mock('fs', () => ({
  default: {
    existsSync: existsSyncMock,
  },
}));

const { loggerMock } = vi.hoisted(() => ({
  loggerMock: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock('../utils/logger.js', () => ({
  logger: loggerMock,
}));

// ---- helpers ----

type UiModule = typeof import('./ui.js');

let registerUiCommand: UiModule['registerUiCommand'];
let runUi: UiModule['runUi'];

beforeAll(async () => {
  const mod = await import('./ui.js');
  registerUiCommand = mod.registerUiCommand;
  runUi = mod.runUi;
});

beforeEach(() => {
  vi.clearAllMocks();
  isPortInUseMock.mockResolvedValue(false);
  killPortProcessMock.mockResolvedValue(undefined);
  waitForPortFreeMock.mockResolvedValue(undefined);
  existsSyncMock.mockReturnValue(true);
});

// ---- test suites ----

describe('registerUiCommand', () => {
  it('should export registerUiCommand as a named function', () => {
    expect(registerUiCommand).toBeDefined();
    expect(typeof registerUiCommand).toBe('function');
  });

  it('should register ui command on the program', () => {
    const program = new Command();
    registerUiCommand(program);
    const subcommands = program.commands.map((cmd) => cmd.name());
    expect(subcommands).toContain('ui');
  });

  it('should register ui command with --restart option', () => {
    const program = new Command();
    registerUiCommand(program);
    const uiCmd = program.commands.find((cmd) => cmd.name() === 'ui');
    expect(uiCmd).toBeDefined();
    const options = uiCmd!.options.map((opt) => opt.long);
    expect(options).toContain('--restart');
  });
});

describe('runUi', () => {
  it('should spawn server on port 3939 when port is free', async () => {
    isPortInUseMock.mockResolvedValue(false);

    await runUi({ restart: false });

    expect(isPortInUseMock).toHaveBeenCalledWith(3939);
    expect(spawnMock).toHaveBeenCalled();
    const spawnArgs = (spawnMock as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as unknown[];
    expect(String(spawnArgs[1])).toContain('entry.js');
    const spawnOpts = spawnArgs[2] as { env: Record<string, string> };
    expect(spawnOpts.env.OPENPOWERS_UI_PORT).toBe('3939');
  });

  it('should open browser after spawning server', async () => {
    isPortInUseMock.mockResolvedValue(false);

    await runUi({ restart: false });

    expect(execSyncMock).toHaveBeenCalled();
    const args = execSyncMock.mock.calls[0][0] as string;
    expect(args).toContain('http://localhost:3939/openpowers/ui');
  });

  it('should not restart when port is already occupied (without --restart)', async () => {
    isPortInUseMock.mockResolvedValue(true);

    await runUi({ restart: false });

    // Should just open browser, not spawn server
    expect(killPortProcessMock).not.toHaveBeenCalled();
    expect(spawnMock).not.toHaveBeenCalled();
    expect(execSyncMock).toHaveBeenCalled();
    const args = execSyncMock.mock.calls[0][0] as string;
    expect(args).toContain('http://localhost:3939/openpowers/ui');
  });

  it('should kill, wait for port free, then spawn on --restart', async () => {
    isPortInUseMock.mockResolvedValue(false);

    await runUi({ restart: true });

    // Call order: kill → wait → spawn
    expect(killPortProcessMock).toHaveBeenCalledWith(3939);
    expect(waitForPortFreeMock).toHaveBeenCalledWith(3939);
    expect(spawnMock).toHaveBeenCalled();
    const spawnArgs = (spawnMock as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as unknown[];
    const spawnOpts = spawnArgs[2] as { env: Record<string, string> };
    expect(spawnOpts.env.OPENPOWERS_UI_PORT).toBe('3939');
  });

  it('should not call isPortInUse on --restart (uses waitForPortFree instead)', async () => {
    isPortInUseMock.mockResolvedValue(false);

    await runUi({ restart: true });

    // --restart path should NOT call isPortInUse
    expect(isPortInUseMock).not.toHaveBeenCalled();
    expect(killPortProcessMock).toHaveBeenCalledWith(3939);
    expect(waitForPortFreeMock).toHaveBeenCalledWith(3939);
    expect(spawnMock).toHaveBeenCalled();
  });

  it('should show retry message when port is not released in time on --restart', async () => {
    waitForPortFreeMock.mockRejectedValue(new Error('Port 3939 is still occupied after 15000ms'));

    const stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

    await runUi({ restart: true });

    expect(waitForPortFreeMock).toHaveBeenCalledWith(3939);
    expect(spawnMock).not.toHaveBeenCalled();
    expect(stdoutSpy).toHaveBeenCalledWith(
      expect.stringContaining('not been released yet'),
    );

    stdoutSpy.mockRestore();
  });

  it('should show message when dist/client/ does not exist', async () => {
    isPortInUseMock.mockResolvedValue(false);
    existsSyncMock.mockReturnValue(false);

    const stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

    await runUi({ restart: false });

    expect(stdoutSpy).toHaveBeenCalledWith(
      expect.stringContaining('not been built'),
    );

    stdoutSpy.mockRestore();
  });

  it('should not show missing-build message when dist/client/ exists', async () => {
    isPortInUseMock.mockResolvedValue(false);
    existsSyncMock.mockReturnValue(true);

    const stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

    await runUi({ restart: false });

    const calls = stdoutSpy.mock.calls.flat();
    const buildWarning = calls.filter((c) => typeof c === 'string' && c.includes('not been built'));
    expect(buildWarning).toHaveLength(0);

    stdoutSpy.mockRestore();
  });
});
