/**
 * @fileoverview Tests for remove command module
 * @author Meiyuki <meiyukichan@163.com>
 * @copyright 2026 Meiyuki
 */

import { describe, it, expect, vi } from 'vitest';
import { Command } from 'commander';

describe('src/commands/remove.ts', () => {
  it('should export registerRemoveCommand as a named function', async () => {
    const { registerRemoveCommand } = await import('./remove.js');
    expect(registerRemoveCommand).toBeDefined();
    expect(typeof registerRemoveCommand).toBe('function');
  });

  it('should register remove command on the program', async () => {
    const { registerRemoveCommand } = await import('./remove.js');
    const program = new Command();
    registerRemoveCommand(program);
    const subcommands = program.commands.map((cmd) => cmd.name());
    expect(subcommands).toContain('remove');
  });

  it('should output correct message when remove command executes', async () => {
    const { registerRemoveCommand } = await import('./remove.js');
    const program = new Command();
    registerRemoveCommand(program);

    const logSpy = vi.spyOn(console, 'log');
    program.parse(['node', 'test', 'remove']);
    expect(logSpy).toHaveBeenCalledWith('openpowers 插件已卸载（mock）');
    logSpy.mockRestore();
  });
});
