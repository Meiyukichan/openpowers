/**
 * @fileoverview Tests for enable command module
 * @author Meiyuki <meiyukichan@163.com>
 * @copyright 2026 Meiyuki
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Command } from 'commander';

const {
  mockSetEnableOpenpowersProxy,
  mockIsPortInUse,
  mockStartBackendService,
} = vi.hoisted(() => ({
  mockSetEnableOpenpowersProxy: vi.fn(),
  mockIsPortInUse: vi.fn(),
  mockStartBackendService: vi.fn(),
}));

vi.mock('../server/providers-store.js', () => ({
  setEnableOpenpowersProxy: mockSetEnableOpenpowersProxy,
}));

vi.mock('../utils/port-manager.js', () => ({
  isPortInUse: mockIsPortInUse,
}));

vi.mock('../server/service-manager.js', () => ({
  startBackendService: mockStartBackendService,
  UI_PORT: 3939,
}));

type RunEnableFn = () => Promise<void>;
type RegisterEnableCmdFn = (program: Command) => void;

describe('src/commands/enable.ts', () => {
  let runEnable: RunEnableFn;
  let registerEnableCommand: RegisterEnableCmdFn;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockIsPortInUse.mockReset();
    mockStartBackendService.mockReset();
    mockSetEnableOpenpowersProxy.mockReset();

    vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    vi.spyOn(process, 'exit').mockImplementation((() => {
      // do nothing, just record
    }) as never);

    // Default: service already running
    mockIsPortInUse.mockResolvedValue(true);
    mockStartBackendService.mockReturnValue('http://localhost:3939/openpowers/ui');

    const mod = await import('./enable.js');
    runEnable = mod.runEnable;
    registerEnableCommand = mod.registerEnableCommand;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('registerEnableCommand', () => {
    it('should export registerEnableCommand as a named function', () => {
      expect(registerEnableCommand).toBeDefined();
      expect(typeof registerEnableCommand).toBe('function');
    });

    it('should register enable command on the program', () => {
      const program = new Command();
      registerEnableCommand(program);
      const subcommands = program.commands.map((cmd) => cmd.name());
      expect(subcommands).toContain('enable');
    });
  });

  describe('runEnable', () => {
    describe('service already running', () => {
      it('should call setEnableOpenpowersProxy with true', async () => {
        await runEnable();
        expect(mockSetEnableOpenpowersProxy).toHaveBeenCalledWith(true);
        expect(mockSetEnableOpenpowersProxy).toHaveBeenCalledTimes(1);
      });

      it('should NOT call startBackendService', async () => {
        await runEnable();
        expect(mockStartBackendService).not.toHaveBeenCalled();
      });

      it('should output a success message', async () => {
        await runEnable();
        expect(process.stdout.write).toHaveBeenCalledWith(
          expect.stringContaining('enabled'),
        );
      });

      it('should not use console.log', async () => {
        const consoleLogSpy = vi.spyOn(console, 'log');
        await runEnable();
        expect(consoleLogSpy).not.toHaveBeenCalled();
        consoleLogSpy.mockRestore();
      });
    });

    describe('service not running, starts successfully', () => {
      beforeEach(() => {
        mockIsPortInUse.mockReset();
        mockIsPortInUse
          .mockResolvedValueOnce(false)  // service not running
          .mockResolvedValueOnce(true);  // started successfully
      });

      it('should call startBackendService then setEnableOpenpowersProxy', async () => {
        await runEnable();
        expect(mockStartBackendService).toHaveBeenCalledWith(3939);
        expect(mockSetEnableOpenpowersProxy).toHaveBeenCalledWith(true);
      });

      it('should check isPortInUse twice', async () => {
        await runEnable();
        expect(mockIsPortInUse).toHaveBeenCalledTimes(2);
      });
    });

    describe('service not running, fails to start', () => {
      beforeEach(() => {
        vi.useFakeTimers();
        mockIsPortInUse.mockReset();
        mockIsPortInUse.mockResolvedValue(false);  // never starts
      });

      afterEach(() => {
        vi.useRealTimers();
      });

      async function runAndDrainTimers(): Promise<void> {
        const promise = runEnable();
        await vi.advanceTimersByTimeAsync(10000);
        await promise.catch(() => { /* expected - process.exit throws */ });
      }

      it('should exit with code 1 after timeout', async () => {
        await expect(runAndDrainTimers()).resolves.toBeUndefined();
        expect(process.exit).toHaveBeenCalledWith(1);
      });

      it('should NOT call setEnableOpenpowersProxy', async () => {
        await runAndDrainTimers();
        expect(mockSetEnableOpenpowersProxy).not.toHaveBeenCalled();
      });

      it('should call startBackendService', async () => {
        await runAndDrainTimers();
        expect(mockStartBackendService).toHaveBeenCalledWith(3939);
      });

      it('should output error to stderr', async () => {
        const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
        await runAndDrainTimers();
        expect(stderrSpy).toHaveBeenCalled();
      });
    });

    describe('setEnableOpenpowersProxy throws', () => {
      beforeEach(() => {
        mockSetEnableOpenpowersProxy.mockImplementation(() => {
          throw new Error('disk full');
        });
      });

      it('should exit with code 1', async () => {
        await expect(runEnable()).rejects.toThrow('process.exit called with code 1');
      });

      it('should output error to stderr', async () => {
        const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
        try { await runEnable(); } catch { /* expected */ }
        expect(stderrSpy).toHaveBeenCalled();
      });
    });
  });
});
