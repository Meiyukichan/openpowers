/**
 * @fileoverview Tests for enable command module
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

type RunEnableFn = () => void;
type RegisterEnableCmdFn = (program: Command) => void;

describe('src/commands/enable.ts', () => {
  let runEnable: RunEnableFn;
  let registerEnableCommand: RegisterEnableCmdFn;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    vi.spyOn(process, 'exit').mockImplementation(((code: number) => {
      throw new Error(`process.exit called with code ${code}`);
    }) as never);

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
    it('should call setEnableOpenpowersProxy with true', () => {
      runEnable();
      expect(mockSetEnableOpenpowersProxy).toHaveBeenCalledWith(true);
      expect(mockSetEnableOpenpowersProxy).toHaveBeenCalledTimes(1);
    });

    it('should output a success message via process.stdout.write', () => {
      runEnable();
      expect(process.stdout.write).toHaveBeenCalledWith(
        expect.stringContaining('enabled')
      );
    });

    it('should call process.exit(1) when setEnableOpenpowersProxy throws', () => {
      mockSetEnableOpenpowersProxy.mockImplementationOnce(() => {
        throw new Error('file system error');
      });

      expect(() => runEnable()).toThrow('process.exit called with code 1');
      expect(process.stderr.write).toBeDefined();
    });

    it('should output error message when setEnableOpenpowersProxy throws', () => {
      const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
      mockSetEnableOpenpowersProxy.mockImplementationOnce(() => {
        throw new Error('disk full');
      });

      try {
        runEnable();
      } catch {
        // expected
      }

      expect(stderrSpy).toHaveBeenCalled();
    });

    it('should not use console.log', () => {
      const consoleLogSpy = vi.spyOn(console, 'log');

      runEnable();

      expect(consoleLogSpy).not.toHaveBeenCalled();
      consoleLogSpy.mockRestore();
    });
  });
});
