/**
 * @fileoverview Tests for disable command module
 * @author Meiyuki <meiyukichan@163.com>
 * @copyright 2026 Meiyuki
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Command } from 'commander';

const { mockSetEnableOpenpowersProxy } = vi.hoisted(() => ({
  mockSetEnableOpenpowersProxy: vi.fn(),
}));

vi.mock('../server/providers-store.js', () => ({
  setEnableOpenpowersProxy: mockSetEnableOpenpowersProxy,
}));

type RunDisableFn = () => void;
type RegisterDisableCmdFn = (program: Command) => void;

describe('src/commands/disable.ts', () => {
  let runDisable: RunDisableFn;
  let registerDisableCommand: RegisterDisableCmdFn;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    vi.spyOn(process, 'exit').mockImplementation(((code: number) => {
      throw new Error(`process.exit called with code ${code}`);
    }) as never);

    const mod = await import('./disable.js');
    runDisable = mod.runDisable;
    registerDisableCommand = mod.registerDisableCommand;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('registerDisableCommand', () => {
    it('should export registerDisableCommand as a named function', () => {
      expect(registerDisableCommand).toBeDefined();
      expect(typeof registerDisableCommand).toBe('function');
    });

    it('should register disable command on the program', () => {
      const program = new Command();
      registerDisableCommand(program);
      const subcommands = program.commands.map((cmd) => cmd.name());
      expect(subcommands).toContain('disable');
    });
  });

  describe('runDisable', () => {
    it('should call setEnableOpenpowersProxy with false', () => {
      runDisable();
      expect(mockSetEnableOpenpowersProxy).toHaveBeenCalledWith(false);
      expect(mockSetEnableOpenpowersProxy).toHaveBeenCalledTimes(1);
    });

    it('should output a success message via process.stdout.write', () => {
      runDisable();
      expect(process.stdout.write).toHaveBeenCalledWith(
        expect.stringContaining('disabled')
      );
    });

    it('should call process.exit(1) when setEnableOpenpowersProxy throws', () => {
      mockSetEnableOpenpowersProxy.mockImplementationOnce(() => {
        throw new Error('file system error');
      });

      expect(() => runDisable()).toThrow('process.exit called with code 1');
    });

    it('should output error message when setEnableOpenpowersProxy throws', () => {
      const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
      mockSetEnableOpenpowersProxy.mockImplementationOnce(() => {
        throw new Error('disk full');
      });

      try {
        runDisable();
      } catch {
        // expected
      }

      expect(stderrSpy).toHaveBeenCalled();
    });

    it('should not use console.log', () => {
      const consoleLogSpy = vi.spyOn(console, 'log');

      runDisable();

      expect(consoleLogSpy).not.toHaveBeenCalled();
      consoleLogSpy.mockRestore();
    });
  });
});
