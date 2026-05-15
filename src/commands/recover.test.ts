/**
 * @fileoverview Tests for recover command module
 * @author Meiyuki <meiyukichan@163.com>
 * @copyright 2026 Meiyuki
 */

import { describe, it, expect, vi } from 'vitest';
import { Command } from 'commander';

describe('src/commands/recover.ts', () => {
  it('should export registerRecoverCommand as a named function', async () => {
    const { registerRecoverCommand } = await import('./recover.js');
    expect(registerRecoverCommand).toBeDefined();
    expect(typeof registerRecoverCommand).toBe('function');
  });

  it('should register recover command on the program', async () => {
    const { registerRecoverCommand } = await import('./recover.js');
    const program = new Command();
    registerRecoverCommand(program);
    const subcommands = program.commands.map((cmd) => cmd.name());
    expect(subcommands).toContain('recover');
  });

  it('should output correct message when recover command executes', async () => {
    const { registerRecoverCommand } = await import('./recover.js');
    const program = new Command();
    registerRecoverCommand(program);

    const logSpy = vi.spyOn(console, 'log');
    program.parse(['node', 'test', 'recover']);
    expect(logSpy).toHaveBeenCalledWith('claude 配置已还原（mock）');
    logSpy.mockRestore();
  });
});
