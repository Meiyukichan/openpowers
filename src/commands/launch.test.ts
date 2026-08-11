/**
 * @fileoverview Tests for launch command module
 * @author Meiyuki <meiyukichan@163.com>
 * @copyright 2026 Meiyuki
 */

import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import { Command } from 'commander';

// ---- mocks ----

const { isPortInUseMock } = vi.hoisted(() => ({
  isPortInUseMock: vi.fn(),
}));

vi.mock('../utils/port-manager.js', () => ({
  isPortInUse: isPortInUseMock,
}));

const { startBackendServiceMock } = vi.hoisted(() => ({
  startBackendServiceMock: vi.fn<(port: number) => string>(),
}));

vi.mock('../server/service-manager.js', () => ({
  startBackendService: startBackendServiceMock,
  UI_PORT: 3939,
}));

// ---- helpers ----

type LaunchModule = typeof import('./launch.js');

let registerLaunchCommand: LaunchModule['registerLaunchCommand'];
let runLaunch: LaunchModule['runLaunch'];

beforeAll(async () => {
  const mod = await import('./launch.js');
  registerLaunchCommand = mod.registerLaunchCommand;
  runLaunch = mod.runLaunch;
});

beforeEach(() => {
  vi.clearAllMocks();
  isPortInUseMock.mockResolvedValue(false);
  startBackendServiceMock.mockReturnValue('http://localhost:3939/furina/ui');
});

// ---- test suites ----

describe('registerLaunchCommand', () => {
  it('should export registerLaunchCommand as a named function', () => {
    expect(registerLaunchCommand).toBeDefined();
    expect(typeof registerLaunchCommand).toBe('function');
  });

  it('should register launch command on the program', () => {
    const program = new Command();
    registerLaunchCommand(program);
    const subcommands = program.commands.map((cmd) => cmd.name());
    expect(subcommands).toContain('launch');
  });

  it('should have description "Start the Furina backend server"', () => {
    const program = new Command();
    registerLaunchCommand(program);
    const launchCmd = program.commands.find((cmd) => cmd.name() === 'launch');
    expect(launchCmd).toBeDefined();
    expect(launchCmd!.description()).toBe('Start the Furina backend server');
  });
});

describe('runLaunch', () => {
  it('should export runLaunch as a named function', async () => {
    const mod = await import('./launch.js');
    expect(mod.runLaunch).toBeDefined();
    expect(typeof mod.runLaunch).toBe('function');
  });

  it('should call startBackendService on port 3939 when port is free', async () => {
    isPortInUseMock.mockResolvedValue(false);

    await runLaunch();

    expect(isPortInUseMock).toHaveBeenCalledWith(3939);
    expect(startBackendServiceMock).toHaveBeenCalledWith(3939);
  });

  it('should output "Furina server is already running" when port is occupied', async () => {
    isPortInUseMock.mockResolvedValue(true);
    const writeSpy = vi.spyOn(process.stdout, 'write');

    await runLaunch();

    expect(startBackendServiceMock).not.toHaveBeenCalled();
    const output = writeSpy.mock.calls.map((c) => c[0]).join('');
    expect(output).toContain('Furina server is already running');
    writeSpy.mockRestore();
  });

  it('should not start backend service when port is occupied', async () => {
    isPortInUseMock.mockResolvedValue(true);

    await runLaunch();

    expect(startBackendServiceMock).not.toHaveBeenCalled();
  });
});
