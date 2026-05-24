/**
 * @fileoverview Tests for recover command module
 * @author Meiyuki <meiyukichan@163.com>
 * @copyright 2026 Meiyuki
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Command } from 'commander';

const {
  mockRestoreClaudeSettings,
} = vi.hoisted(() => ({
  mockRestoreClaudeSettings: vi.fn(),
}));

vi.mock('../server/claude-settings.js', () => ({
  restoreClaudeSettings: mockRestoreClaudeSettings,
}));

type RegisterRecoverCmdFn = (program: Command) => void;

describe('src/commands/recover.ts', () => {
  let registerRecoverCommand: RegisterRecoverCmdFn;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockRestoreClaudeSettings.mockReset();
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

    const mod = await import('./recover.js');
    registerRecoverCommand = mod.registerRecoverCommand;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('registerRecoverCommand', () => {
    it('should export registerRecoverCommand as a named function', () => {
      expect(registerRecoverCommand).toBeDefined();
      expect(typeof registerRecoverCommand).toBe('function');
    });

    it('should register recover command on the program', () => {
      const program = new Command();
      registerRecoverCommand(program);
      const subcommands = program.commands.map((cmd) => cmd.name());
      expect(subcommands).toContain('recover');
    });
  });

  describe('recover command action', () => {
    it('should call restoreClaudeSettings and output success message when backup exists', () => {
      mockRestoreClaudeSettings.mockReturnValue(true);
      const program = new Command();
      registerRecoverCommand(program);
      program.parse(['node', 'test', 'recover']);
      expect(mockRestoreClaudeSettings).toHaveBeenCalledTimes(1);
      expect(process.stdout.write).toHaveBeenCalledWith(
        expect.stringContaining('restored'),
      );
    });

    it('should call restoreClaudeSettings and output warning when no backup found', () => {
      mockRestoreClaudeSettings.mockReturnValue(false);
      const program = new Command();
      registerRecoverCommand(program);
      program.parse(['node', 'test', 'recover']);
      expect(mockRestoreClaudeSettings).toHaveBeenCalledTimes(1);
      expect(process.stdout.write).toHaveBeenCalledWith(
        expect.stringContaining('No backup'),
      );
    });

    it('should not call process.exit on success', () => {
      mockRestoreClaudeSettings.mockReturnValue(true);
      const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {
        // do nothing
      }) as never);
      const program = new Command();
      registerRecoverCommand(program);
      program.parse(['node', 'test', 'recover']);
      expect(exitSpy).not.toHaveBeenCalled();
      exitSpy.mockRestore();
    });

    it('should not call process.exit when no backup found', () => {
      mockRestoreClaudeSettings.mockReturnValue(false);
      const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {
        // do nothing
      }) as never);
      const program = new Command();
      registerRecoverCommand(program);
      program.parse(['node', 'test', 'recover']);
      expect(exitSpy).not.toHaveBeenCalled();
      exitSpy.mockRestore();
    });
  });
});
