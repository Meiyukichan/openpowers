/**
 * @fileoverview Tests for schedule/index.ts registerScheduleCommand
 * @author Meiyuki <meiyukichan@163.com>
 * @copyright 2026 Meiyuki
 */

import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import { Command } from 'commander';

// ---- mocks ----

const { isPortInUseMock } = vi.hoisted(() => ({
  isPortInUseMock: vi.fn<(port: number) => Promise<boolean>>(),
}));

vi.mock('../../utils/port-manager.js', () => ({
  isPortInUse: isPortInUseMock,
}));

const { sendApiRequestMock } = vi.hoisted(() => ({
  sendApiRequestMock: vi.fn<(port: number, method: string, path: string) => Promise<void>>(),
}));

vi.mock('../schedule/request.js', () => ({
  sendApiRequest: sendApiRequestMock,
}));

// ---- helpers ----

type ScheduleIndexModule = typeof import('./index.js');

let registerScheduleCommand: ScheduleIndexModule['registerScheduleCommand'];

beforeAll(async () => {
  const mod = await import('./index.js');
  registerScheduleCommand = mod.registerScheduleCommand;
});

beforeEach(() => {
  vi.clearAllMocks();
  isPortInUseMock.mockResolvedValue(false);
  sendApiRequestMock.mockResolvedValue(undefined);
  process.exitCode = undefined;
});

// ---- test suites ----

describe('registerScheduleCommand', () => {
  it('should export registerScheduleCommand as a named function', () => {
    expect(registerScheduleCommand).toBeDefined();
    expect(typeof registerScheduleCommand).toBe('function');
  });

  it('should register schedule command on the program', () => {
    const program = new Command();
    registerScheduleCommand(program);
    const subcommands = program.commands.map((cmd) => cmd.name());
    expect(subcommands).toContain('schedule');
  });

  it('should have description mentioning restart and stop', () => {
    const program = new Command();
    registerScheduleCommand(program);
    const scheduleCmd = program.commands.find((cmd) => cmd.name() === 'schedule');
    expect(scheduleCmd).toBeDefined();
    expect(scheduleCmd!.description()).toContain('scheduler');
  });

  it('should register restart and stop as subcommands of schedule', () => {
    const program = new Command();
    registerScheduleCommand(program);
    const scheduleCmd = program.commands.find((cmd) => cmd.name() === 'schedule');
    expect(scheduleCmd).toBeDefined();
    const subCommandNames = scheduleCmd!.commands.map((cmd) => cmd.name());
    expect(subCommandNames).toContain('restart');
    expect(subCommandNames).toContain('stop');
  });

  it('should show schedule in program help output', () => {
    const program = new Command();
    program.name('furina');
    registerScheduleCommand(program);

    let helpOutput = '';
    const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
      const str = typeof chunk === 'string' ? chunk : chunk.toString();
      helpOutput += str;
      return true;
    });

    try {
      program.outputHelp();
      expect(helpOutput).toContain('schedule');
    } finally {
      writeSpy.mockRestore();
    }
  });
});

describe('schedule restart subcommand', () => {
  it('should output not-running message and set exitCode=1 when server not running', async () => {
    isPortInUseMock.mockResolvedValue(false);
    const writeSpy = vi.spyOn(process.stdout, 'write');

    const program = new Command();
    program.exitOverride();
    registerScheduleCommand(program);

    const originalExitCode = process.exitCode;

    try {
      try {
        await program.parseAsync(['schedule', 'restart'], { from: 'user' });
      } catch {
        // commander exits on error
      }

      const output = writeSpy.mock.calls.map((c) => String(c[0])).join('');
      expect(output).toContain('Furina server is not running');
      expect(output).toContain('furina launch');
      expect(process.exitCode).toBe(1);
    } finally {
      process.exitCode = originalExitCode;
      writeSpy.mockRestore();
    }
  });

  it('should call POST /furina/api/schedule/restart when server is running', async () => {
    isPortInUseMock.mockResolvedValue(true);
    const writeSpy = vi.spyOn(process.stdout, 'write');

    const program = new Command();
    program.exitOverride();
    registerScheduleCommand(program);

    try {
      await program.parseAsync(['schedule', 'restart'], { from: 'user' });
    } catch {
      // commander exits on error
    }

    expect(sendApiRequestMock).toHaveBeenCalledTimes(1);
    expect(sendApiRequestMock).toHaveBeenCalledWith(3939, 'POST', '/furina/api/schedule/restart');

    const output = writeSpy.mock.calls.map((c) => String(c[0])).join('');
    expect(output).toContain('Scheduler restarted');

    // exitCode should remain undefined (Node.js default = exit code 0)
    expect(process.exitCode).toBeUndefined();

    writeSpy.mockRestore();
  });

  it('should output error and set exitCode=1 when API request fails', async () => {
    isPortInUseMock.mockResolvedValue(true);
    sendApiRequestMock.mockRejectedValue(new Error('Connection refused'));
    const stderrSpy = vi.spyOn(process.stderr, 'write');

    const program = new Command();
    program.exitOverride();
    registerScheduleCommand(program);

    const originalExitCode = process.exitCode;

    try {
      try {
        await program.parseAsync(['schedule', 'restart'], { from: 'user' });
      } catch {
        // commander exits on error
      }

      const stderrOutput = stderrSpy.mock.calls.map((c) => String(c[0])).join('');
      expect(stderrOutput).toContain('Failed to restart scheduler');
      expect(process.exitCode).toBe(1);
    } finally {
      process.exitCode = originalExitCode;
      stderrSpy.mockRestore();
    }
  });
});

describe('schedule stop subcommand', () => {
  it('should output not-running message and set exitCode=1 when server not running', async () => {
    isPortInUseMock.mockResolvedValue(false);
    const writeSpy = vi.spyOn(process.stdout, 'write');

    const program = new Command();
    program.exitOverride();
    registerScheduleCommand(program);

    const originalExitCode = process.exitCode;

    try {
      try {
        await program.parseAsync(['schedule', 'stop'], { from: 'user' });
      } catch {
        // commander exits on error
      }

      const output = writeSpy.mock.calls.map((c) => String(c[0])).join('');
      expect(output).toContain('Furina server is not running');
      expect(output).toContain('furina launch');
      expect(process.exitCode).toBe(1);
    } finally {
      process.exitCode = originalExitCode;
      writeSpy.mockRestore();
    }
  });

  it('should call DELETE /furina/api/schedule when server is running', async () => {
    isPortInUseMock.mockResolvedValue(true);
    const writeSpy = vi.spyOn(process.stdout, 'write');

    const program = new Command();
    program.exitOverride();
    registerScheduleCommand(program);

    try {
      await program.parseAsync(['schedule', 'stop'], { from: 'user' });
    } catch {
      // commander exits on error
    }

    expect(sendApiRequestMock).toHaveBeenCalledTimes(1);
    expect(sendApiRequestMock).toHaveBeenCalledWith(3939, 'DELETE', '/furina/api/schedule');

    const output = writeSpy.mock.calls.map((c) => String(c[0])).join('');
    expect(output).toContain('Scheduler stopped');

    // exitCode should remain undefined (Node.js default = exit code 0)
    expect(process.exitCode).toBeUndefined();

    writeSpy.mockRestore();
  });

  it('should output error and set exitCode=1 when API request fails', async () => {
    isPortInUseMock.mockResolvedValue(true);
    sendApiRequestMock.mockRejectedValue(new Error('Connection refused'));
    const stderrSpy = vi.spyOn(process.stderr, 'write');

    const program = new Command();
    program.exitOverride();
    registerScheduleCommand(program);

    const originalExitCode = process.exitCode;

    try {
      try {
        await program.parseAsync(['schedule', 'stop'], { from: 'user' });
      } catch {
        // commander exits on error
      }

      const stderrOutput = stderrSpy.mock.calls.map((c) => String(c[0])).join('');
      expect(stderrOutput).toContain('Failed to stop scheduler');
      expect(process.exitCode).toBe(1);
    } finally {
      process.exitCode = originalExitCode;
      stderrSpy.mockRestore();
    }
  });
});
