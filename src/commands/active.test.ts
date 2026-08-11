/**
 * @fileoverview Tests for active command module
 * @author Meiyuki <meiyukichan@163.com>
 * @copyright 2026 Meiyuki
 */

import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import { Command } from 'commander';

// ---- mocks ----

const { isPortInUseMock } = vi.hoisted(() => ({
  isPortInUseMock: vi.fn<(port: number) => Promise<boolean>>(),
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

type ActiveModule = typeof import('./active.js');

let registerActiveCommand: ActiveModule['registerActiveCommand'];
let runActive: ActiveModule['runActive'];

beforeAll(async () => {
  const mod = await import('./active.js');
  registerActiveCommand = mod.registerActiveCommand;
  runActive = mod.runActive;
});

beforeEach(() => {
  vi.clearAllMocks();
  isPortInUseMock.mockResolvedValue(false);
  startBackendServiceMock.mockReturnValue('http://localhost:3939/furina/ui');
});

// ---- test suites ----

describe('registerActiveCommand', () => {
  it('should export registerActiveCommand as a named function', () => {
    expect(registerActiveCommand).toBeDefined();
    expect(typeof registerActiveCommand).toBe('function');
  });

  it('should register active command on the program', () => {
    const program = new Command();
    registerActiveCommand(program);
    const subcommands = program.commands.map((cmd) => cmd.name());
    expect(subcommands).toContain('active');
  });

  it('should show active in program help output', () => {
    const program = new Command();
    program.name('furina');
    registerActiveCommand(program);

    // Capture help output and verify it contains "active"
    let helpOutput = '';
    const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
      const str = typeof chunk === 'string' ? chunk : chunk.toString();
      helpOutput += str;
      return true;
    });

    try {
      program.outputHelp();
      expect(helpOutput).toContain('active');
    } finally {
      writeSpy.mockRestore();
    }
  });
});

describe('runActive', () => {
  it('should write "Furina service is active" to stdout when port is occupied', async () => {
    isPortInUseMock.mockResolvedValue(true);

    const stdoutSpy = vi.spyOn(process.stdout, 'write');
    const stderrSpy = vi.spyOn(process.stderr, 'write');

    try {
      await runActive();

      expect(isPortInUseMock).toHaveBeenCalledWith(3939);
      expect(startBackendServiceMock).not.toHaveBeenCalled();

      const stdoutCalls = stdoutSpy.mock.calls
        .map((call) => String(call[0]))
        .join('');
      expect(stdoutCalls).toContain('Furina service is active');

      // stderr should NOT contain the starting message in this path
      const stderrCalls = stderrSpy.mock.calls
        .map((call) => String(call[0]))
        .join('');
      expect(stderrCalls).not.toContain('Furina service is starting');
    } finally {
      stdoutSpy.mockRestore();
      stderrSpy.mockRestore();
    }
  });

  it('should call startBackendService and write starting message to stderr when port is free', async () => {
    isPortInUseMock.mockResolvedValue(false);

    const stdoutSpy = vi.spyOn(process.stdout, 'write');
    const stderrSpy = vi.spyOn(process.stderr, 'write');

    try {
      // Save and restore exitCode to avoid side effects
      const originalExitCode = process.exitCode;

      await runActive();

      expect(isPortInUseMock).toHaveBeenCalledWith(3939);
      expect(startBackendServiceMock).toHaveBeenCalledWith(3939);
      expect(startBackendServiceMock).toHaveBeenCalledTimes(1);
      expect(process.exitCode).toBe(1);

      const stderrCalls = stderrSpy.mock.calls
        .map((call) => String(call[0]))
        .join('');
      expect(stderrCalls).toContain('Furina service is starting, please exit the workflow and retry');

      // stdout should NOT contain the "active" message in this path
      const stdoutCalls = stdoutSpy.mock.calls
        .map((call) => String(call[0]))
        .join('');
      expect(stdoutCalls).not.toContain('Furina service is active');

      // Restore exitCode
      process.exitCode = originalExitCode;
    } finally {
      stdoutSpy.mockRestore();
      stderrSpy.mockRestore();
    }
  });

  it('should write "Failed to start service:" to stderr when runActive throws, via registered command action', async () => {
    isPortInUseMock.mockResolvedValue(false);
    const boomError = new Error('boom');
    startBackendServiceMock.mockImplementation(() => {
      throw boomError;
    });

    const stderrSpy = vi.spyOn(process.stderr, 'write');
    const originalExitCode = process.exitCode;

    try {
      const program = new Command();
      program.exitOverride();
      registerActiveCommand(program);

      // Invoke the registered action via parseAsync — this exercises the real catch block
      await program.parseAsync(['active'], { from: 'user' });

      expect(process.exitCode).toBe(1);

      const stderrCalls = stderrSpy.mock.calls
        .map((call) => String(call[0]))
        .join('');
      expect(stderrCalls).toContain('Failed to start service:');
      expect(stderrCalls).toContain('boom');
    } finally {
      process.exitCode = originalExitCode;
      stderrSpy.mockRestore();
    }
  });

  it('should never call process.exit', async () => {
    const exitSpy = vi.spyOn(process, 'exit');

    try {
      // Test port occupied path
      isPortInUseMock.mockResolvedValue(true);
      await runActive();
      expect(exitSpy).not.toHaveBeenCalled();

      // Test port free path
      isPortInUseMock.mockResolvedValue(false);
      startBackendServiceMock.mockReturnValue('http://localhost:3939/furina/ui');
      await runActive();
      expect(exitSpy).not.toHaveBeenCalled();
    } finally {
      exitSpy.mockRestore();
    }
  });
});
