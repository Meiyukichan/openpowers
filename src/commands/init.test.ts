/**
 * @fileoverview Tests for init command module
 * @author Meiyuki <meiyukichan@163.com>
 * @copyright 2026 Meiyuki
 */

import { describe, it, expect, vi } from 'vitest';
import { Command } from 'commander';

describe('src/commands/init.ts', () => {
  it('should export registerInitCommand as a named function', async () => {
    const { registerInitCommand } = await import('./init.js');
    expect(registerInitCommand).toBeDefined();
    expect(typeof registerInitCommand).toBe('function');
  });

  it('should register init command on the program', async () => {
    const { registerInitCommand } = await import('./init.js');
    const program = new Command();
    registerInitCommand(program);
    const subcommands = program.commands.map((cmd) => cmd.name());
    expect(subcommands).toContain('init');
  });

  it('should output correct message when init command executes', async () => {
    const { registerInitCommand } = await import('./init.js');
    const program = new Command();
    registerInitCommand(program);

    const logSpy = vi.spyOn(console, 'log');
    program.parse(['node', 'test', 'init']);
    expect(logSpy).toHaveBeenCalledWith('openpowers 初始化成功（mock）');
    logSpy.mockRestore();
  });
});
