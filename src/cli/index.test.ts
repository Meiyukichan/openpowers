/**
 * @fileoverview Tests for CLI command registration module
 * @author Meiyuki <meiyukichan@163.com>
 * @copyright 2026 Meiyuki
 */

import { describe, it, expect } from 'vitest';
import { Command } from 'commander';

describe('src/cli/index.ts', () => {
  it('should export a program that is a Command instance', async () => {
    const { program } = await import('./index.js');
    expect(program).toBeInstanceOf(Command);
  });

  it('should have version set from package.json', async () => {
    const { program } = await import('./index.js');
    expect(program.version()).toBe('1.0.3');
  });

  it('should register all 13 subcommands (init, ui, active, launch, remove, recover, change, config, enable, disable, agents, schedule, migrate)', async () => {
    const { program } = await import('./index.js');
    const names = program.commands.map((cmd) => cmd.name());
    expect(names.length).toBe(13);
    expect(names).toContain('init');
    expect(names).toContain('ui');
    expect(names).toContain('active');
    expect(names).toContain('launch');
    expect(names).toContain('remove');
    expect(names).toContain('recover');
    expect(names).toContain('change');
    expect(names).toContain('config');
    expect(names).toContain('enable');
    expect(names).toContain('disable');
    expect(names).toContain('agents');
    expect(names).toContain('schedule');
    expect(names).toContain('migrate');
  });
});
