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
    // Reset mock implementations so mockResolvedValueOnce chains from previous tests don't leak
    mockIsPortInUse.mockReset();
    mockStartBackendService.mockReset();
    mockSetEnableOpenpowersProxy.mockReset();

    vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    vi.spyOn(process, 'exit').mockImplementation(((code: number) => {
      throw new Error(`process.exit called with code ${code}`);
    }) as never);

    // Default mocks for the success path:
    // isPortInUse initially false (port free), then true after startBackendService
    mockIsPortInUse
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true);
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
    it('should call setEnableOpenpowersProxy with true', async () => {
      await runEnable();
      expect(mockSetEnableOpenpowersProxy).toHaveBeenCalledWith(true);
      expect(mockSetEnableOpenpowersProxy).toHaveBeenCalledTimes(1);
    });

    it('should call startBackendService with UI_PORT when port is free', async () => {
      await runEnable();
      expect(mockStartBackendService).toHaveBeenCalledWith(3939);
      expect(mockStartBackendService).toHaveBeenCalledTimes(1);
    });

    it('should check isPortInUse before and after starting service', async () => {
      await runEnable();
      expect(mockIsPortInUse).toHaveBeenCalledTimes(2);
      expect(mockIsPortInUse).toHaveBeenCalledWith(3939);
    });

    it('should output a success message via process.stdout.write', async () => {
      await runEnable();
      expect(process.stdout.write).toHaveBeenCalledWith(
        expect.stringContaining('enabled')
      );
    });

    it('should call process.exit(1) when setEnableOpenpowersProxy throws', async () => {
      mockSetEnableOpenpowersProxy.mockImplementationOnce(() => {
        throw new Error('file system error');
      });

      await expect(runEnable()).rejects.toThrow('process.exit called with code 1');
    });

    it('should output error message when setEnableOpenpowersProxy throws', async () => {
      const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
      mockSetEnableOpenpowersProxy.mockImplementationOnce(() => {
        throw new Error('disk full');
      });

      try {
        await runEnable();
      } catch {
        // expected
      }

      expect(stderrSpy).toHaveBeenCalled();
    });

    it('should not use console.log', async () => {
      const consoleLogSpy = vi.spyOn(console, 'log');

      await runEnable();

      expect(consoleLogSpy).not.toHaveBeenCalled();
      consoleLogSpy.mockRestore();
    });

    // New test: port already in use before enable
    it('should reject when the UI port is already in use', async () => {
      // Override the default mock: port is in use from the start
      mockIsPortInUse.mockReset();
      mockIsPortInUse.mockResolvedValue(true);

      await expect(runEnable()).rejects.toThrow('process.exit called with code 1');

      // setEnableOpenpowersProxy must NOT be called
      expect(mockSetEnableOpenpowersProxy).not.toHaveBeenCalled();
    });

    it('should output error message when the UI port is already in use', async () => {
      const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
      mockIsPortInUse.mockReset();
      mockIsPortInUse.mockResolvedValue(true);

      try {
        await runEnable();
      } catch {
        // expected
      }

      expect(stderrSpy).toHaveBeenCalled();
    });

    // New test: service fails to start (port still not in use after startBackendService)
    it('should exit with code 1 when backend service fails to start', async () => {
      // Override: port is free initially, but still free after startBackendService
      mockIsPortInUse.mockReset();
      mockIsPortInUse
        .mockResolvedValueOnce(false)  // before start: free
        .mockResolvedValueOnce(false); // after start: still free (service didn't start)

      await expect(runEnable()).rejects.toThrow('process.exit called with code 1');

      // setEnableOpenpowersProxy WAS called (it runs before startBackendService)
      expect(mockSetEnableOpenpowersProxy).toHaveBeenCalledWith(true);
      // startBackendService WAS called
      expect(mockStartBackendService).toHaveBeenCalledWith(3939);
    });

    it('should output error message when backend service fails to start', async () => {
      const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
      mockIsPortInUse.mockReset();
      mockIsPortInUse
        .mockResolvedValueOnce(false)
        .mockResolvedValueOnce(false);

      try {
        await runEnable();
      } catch {
        // expected
      }

      expect(stderrSpy).toHaveBeenCalled();
    });
  });
});
