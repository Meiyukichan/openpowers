/**
 * @fileoverview Tests for ui command module
 * @author Meiyuki <meiyukichan@163.com>
 * @copyright 2026 Meiyuki
 */

import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import { Command } from 'commander';

// ---- mocks ----

const { isPortInUseMock, killPortProcessMock, waitForPortFreeMock, gracefulShutdownMock } = vi.hoisted(() => ({
  isPortInUseMock: vi.fn(),
  killPortProcessMock: vi.fn(),
  waitForPortFreeMock: vi.fn(),
  gracefulShutdownMock: vi.fn(),
}));

vi.mock('../utils/port-manager.js', () => ({
  isPortInUse: isPortInUseMock,
  killPortProcess: killPortProcessMock,
  waitForPortFree: waitForPortFreeMock,
  gracefulShutdown: gracefulShutdownMock,
}));

const { execSyncMock } = vi.hoisted(() => ({
  execSyncMock: vi.fn(),
}));

vi.mock('child_process', () => ({
  execSync: execSyncMock,
}));

const { startBackendServiceMock } = vi.hoisted(() => ({
  startBackendServiceMock: vi.fn<(port: number) => string>(),
}));

vi.mock('../server/service-manager.js', () => ({
  startBackendService: startBackendServiceMock,
  UI_PORT: 3939,
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
  gracefulShutdownMock.mockResolvedValue(undefined);
  startBackendServiceMock.mockReturnValue('http://localhost:3939/furina/ui');
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
  it('should call startBackendService on port 3939 when port is free', async () => {
    isPortInUseMock.mockResolvedValue(false);

    await runUi({ restart: false });

    expect(isPortInUseMock).toHaveBeenCalledWith(3939);
    expect(startBackendServiceMock).toHaveBeenCalledWith(3939);
  });

  it('should open browser after starting backend service', async () => {
    isPortInUseMock.mockResolvedValue(false);

    await runUi({ restart: false });

    expect(startBackendServiceMock).toHaveBeenCalledWith(3939);
    expect(execSyncMock).toHaveBeenCalled();
    const args = execSyncMock.mock.calls[0][0] as string;
    expect(args).toContain('http://localhost:3939/furina/ui');
  });

  it('should not restart when port is already occupied (without --restart)', async () => {
    isPortInUseMock.mockResolvedValue(true);

    await runUi({ restart: false });

    // Should just open browser, not start backend service
    expect(killPortProcessMock).not.toHaveBeenCalled();
    expect(startBackendServiceMock).not.toHaveBeenCalled();
    expect(execSyncMock).toHaveBeenCalled();
    const args = execSyncMock.mock.calls[0][0] as string;
    expect(args).toContain('http://localhost:3939/furina/ui');
  });

  it('should call gracefulShutdown and then start backend on --restart', async () => {
    await runUi({ restart: true });

    // Call order: gracefulShutdown → start backend
    expect(gracefulShutdownMock).toHaveBeenCalledWith(3939);
    expect(startBackendServiceMock).toHaveBeenCalledWith(3939);
  });

  it('should not call isPortInUse or killPortProcess directly on --restart', async () => {
    await runUi({ restart: true });

    // --restart path should use gracefulShutdown, not direct kill/isPortInUse
    expect(isPortInUseMock).not.toHaveBeenCalled();
    expect(killPortProcessMock).not.toHaveBeenCalled();
    expect(waitForPortFreeMock).not.toHaveBeenCalled();
    expect(gracefulShutdownMock).toHaveBeenCalledWith(3939);
    expect(startBackendServiceMock).toHaveBeenCalledWith(3939);
  });

  it('should propagate gracefulShutdown error to caller on --restart', async () => {
    const shutdownError = new Error('Port 3939 is still occupied after 15000ms');
    gracefulShutdownMock.mockRejectedValue(shutdownError);

    await expect(runUi({ restart: true })).rejects.toThrow('Port 3939 is still occupied after 15000ms');
    expect(gracefulShutdownMock).toHaveBeenCalledWith(3939);
    expect(startBackendServiceMock).not.toHaveBeenCalled();
  });

  it('should open browser after graceful restart', async () => {
    await runUi({ restart: true });

    expect(gracefulShutdownMock).toHaveBeenCalledWith(3939);
    expect(startBackendServiceMock).toHaveBeenCalledWith(3939);
    expect(execSyncMock).toHaveBeenCalled();
    const args = execSyncMock.mock.calls[0][0] as string;
    expect(args).toContain('http://localhost:3939/furina/ui');
  });
});
