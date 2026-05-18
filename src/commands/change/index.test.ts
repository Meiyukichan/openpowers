/**
 * @fileoverview Tests for change/index.ts registerChangeCommand
 * @author Meiyuki <meiyukichan@163.com>
 * @copyright 2026 Meiyuki
 */

import { describe, it, expect } from 'vitest';
import { Command } from 'commander';

describe('src/commands/change/index.ts', () => {
  let registerChangeCommand: (program: Command) => void;

  it('should export registerChangeCommand as a named function', async () => {
    const mod = await import('./index.js');
    registerChangeCommand = mod.registerChangeCommand;
    expect(registerChangeCommand).toBeDefined();
    expect(typeof registerChangeCommand).toBe('function');
  });

  it('should register change as a parent command with five subcommands', async () => {
    const mod = await import('./index.js');
    registerChangeCommand = mod.registerChangeCommand;
    const program = new Command();
    registerChangeCommand(program);

    const changeCmd = program.commands.find((cmd) => cmd.name() === 'change');
    expect(changeCmd).toBeDefined();

    const subCommandNames = changeCmd!.commands.map((cmd) => cmd.name());
    expect(subCommandNames).toContain('list');
    expect(subCommandNames).toContain('new');
    expect(subCommandNames).toContain('status');
    expect(subCommandNames).toContain('instruction');
    expect(subCommandNames).toContain('feature');
  });

  it('should register new subcommand with required --desc option', async () => {
    const mod = await import('./index.js');
    registerChangeCommand = mod.registerChangeCommand;
    const program = new Command();
    registerChangeCommand(program);

    const changeCmd = program.commands.find((cmd) => cmd.name() === 'change');
    const newCmd = changeCmd!.commands.find((cmd) => cmd.name() === 'new');
    expect(newCmd).toBeDefined();
    // Commander v14+ uses requiredOption
    const descOption = newCmd!.options.find((o) => o.long === '--desc');
    expect(descOption).toBeDefined();
    expect(descOption!.mandatory).toBe(true);
  });
});
