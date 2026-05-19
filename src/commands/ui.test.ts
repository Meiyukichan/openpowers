/**
 * @fileoverview Tests for ui command module
 * @author Meiyuki <meiyukichan@163.com>
 * @copyright 2026 Meiyuki
 */

import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import { Command } from 'commander';

// ---- mocks ----

const { isPortInUseMock, killPortProcessMock } = vi.hoisted(() => ({
  isPortInUseMock: vi.fn(),
  killPortProcessMock: vi.fn(),
}));

vi.mock('../utils/port-manager.js', () => ({
  isPortInUse: isPortInUseMock,
  killPortProcess: killPortProcessMock,
}));

const mockListenFn = vi.fn();
const mockApp = {
  listen: mockListenFn,
};

const { createAppMock } = vi.hoisted(() => ({
  createAppMock: vi.fn(),
}));

vi.mock('../server/index.js', () => ({
  createApp: createAppMock,
}));

const { execSyncMock } = vi.hoisted(() => ({
  execSyncMock: vi.fn(),
}));

vi.mock('child_process', () => ({
  execSync: execSyncMock,
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
  createAppMock.mockReturnValue(mockApp);
  mockListenFn.mockImplementation((_port: number, cb: () => void) => {
    cb();
    return { close: vi.fn() };
  });
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
  it('should start server on port 3939 when port is free', async () => {
    isPortInUseMock.mockResolvedValue(false);

    await runUi({ restart: false });

    expect(isPortInUseMock).toHaveBeenCalledWith(3939);
    expect(createAppMock).toHaveBeenCalled();
    expect(mockListenFn).toHaveBeenCalledWith(3939, expect.any(Function));
  });

  it('should open browser after server starts', async () => {
    isPortInUseMock.mockResolvedValue(false);

    await runUi({ restart: false });

    expect(execSyncMock).toHaveBeenCalled();
    const args = execSyncMock.mock.calls[0][0] as string;
    expect(args).toContain('http://localhost:3939/ui');
  });

  it('should not restart when port is already occupied (without --restart)', async () => {
    isPortInUseMock.mockResolvedValue(true);

    await runUi({ restart: false });

    // Should just open browser, not start server
    expect(killPortProcessMock).not.toHaveBeenCalled();
    expect(createAppMock).not.toHaveBeenCalled();
    expect(mockListenFn).not.toHaveBeenCalled();
    expect(execSyncMock).toHaveBeenCalled();
    const args = execSyncMock.mock.calls[0][0] as string;
    expect(args).toContain('http://localhost:3939/ui');
  });

  it('should kill existing process on --restart before starting', async () => {
    isPortInUseMock.mockResolvedValue(false);

    await runUi({ restart: true });

    expect(killPortProcessMock).toHaveBeenCalledWith(3939);
    expect(createAppMock).toHaveBeenCalled();
    expect(mockListenFn).toHaveBeenCalledWith(3939, expect.any(Function));
  });

  it('should start server on --restart even when port was occupied', async () => {
    // After killing the process, the port becomes free
    isPortInUseMock.mockResolvedValue(false);

    await runUi({ restart: true });

    expect(killPortProcessMock).toHaveBeenCalledWith(3939);
    expect(createAppMock).toHaveBeenCalled();
    expect(mockListenFn).toHaveBeenCalledWith(3939, expect.any(Function));
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
