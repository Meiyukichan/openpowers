/**
 * @fileoverview Tests for ui command module
 * @author Meiyuki <meiyukichan@163.com>
 * @copyright 2026 Meiyuki
 */

import { describe, it, expect, vi } from 'vitest';
import { Command } from 'commander';

describe('src/commands/ui.ts', () => {
  it('should export registerUiCommand as a named function', async () => {
    const { registerUiCommand } = await import('./ui.js');
    expect(registerUiCommand).toBeDefined();
    expect(typeof registerUiCommand).toBe('function');
  });

  it('should register ui command on the program', async () => {
    const { registerUiCommand } = await import('./ui.js');
    const program = new Command();
    registerUiCommand(program);
    const subcommands = program.commands.map((cmd) => cmd.name());
    expect(subcommands).toContain('ui');
  });

  it('should output correct message when ui command executes', async () => {
    const { registerUiCommand } = await import('./ui.js');
    const program = new Command();
    registerUiCommand(program);

    const stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    program.parse(['node', 'test', 'ui']);
    expect(stdoutSpy).toHaveBeenCalledWith('正在打开 openpowers UI...（mock）\n');
    stdoutSpy.mockRestore();
  });
});
