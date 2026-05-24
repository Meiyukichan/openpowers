/**
 * @fileoverview Tests for config.ts registerConfigCommand
 * @author Meiyuki <meiyukichan@163.com>
 * @copyright 2026 Meiyuki
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Command } from 'commander';
import type { OpenPowersConfig } from '../utils/config.js';

// Mock the config utility before any imports
vi.mock('../utils/config.js', () => ({
  loadConfig: vi.fn(),
  queryConfig: (config: Record<string, unknown>, keyPath: string): unknown => {
    const parts = keyPath.split('.');
    let node: unknown = config;
    for (const part of parts) {
      if (node === null || node === undefined) return undefined;
      if (typeof node !== 'object' || Array.isArray(node)) return undefined;
      node = (node as Record<string, unknown>)[part];
    }
    return node;
  },
}));

describe('src/commands/config.ts', () => {
  let registerConfigCommand: (program: Command) => void;
  let stdoutCalls: string[];

  beforeEach(() => {
    stdoutCalls = [];
    vi.spyOn(process.stdout, 'write').mockImplementation(
      (chunk: unknown) => {
        stdoutCalls.push(String(chunk));
        return true;
      },
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should export registerConfigCommand as a named function', async () => {
    const mod = await import('./config.js');
    registerConfigCommand = mod.registerConfigCommand;
    expect(registerConfigCommand).toBeDefined();
    expect(typeof registerConfigCommand).toBe('function');
  });

  it('should register config as a parent command with list and show subcommands', async () => {
    const mod = await import('./config.js');
    registerConfigCommand = mod.registerConfigCommand;
    const program = new Command();
    registerConfigCommand(program);

    const configCmd = program.commands.find((cmd) => cmd.name() === 'config');
    expect(configCmd).toBeDefined();

    const subCommandNames = configCmd!.commands.map((cmd) => cmd.name());
    expect(subCommandNames).toContain('list');
    expect(subCommandNames).toContain('show');
  });

  it('config list should output merged config as formatted JSON', async () => {
    const { loadConfig } = await import('../utils/config.js');
    const mockConfig = { language: 'chinese', switchProviders: { workflow: 'default', explore: 'default', propose: 'default', plan: 'default', review: 'default', coding: 'default', finalize: 'default' } };
    vi.mocked(loadConfig).mockReturnValue(mockConfig as unknown as OpenPowersConfig);

    const mod = await import('./config.js');
    registerConfigCommand = mod.registerConfigCommand;
    const program = new Command();
    registerConfigCommand(program);

    await program.parseAsync(['config', 'list'], { from: 'user' });

    const output = stdoutCalls.join('');
    expect(output).toBe(JSON.stringify(mockConfig, null, 2) + '\n');
  });

  it('config show should print key=value for non-object values on separate lines', async () => {
    const { loadConfig } = await import('../utils/config.js');
    const mockConfig = {
      language: 'chinese',
      switchProviders: { workflow: 'default', explore: 'default', propose: 'default', plan: 'default', review: 'default', coding: 'default', finalize: 'default' },
      project: { sourcecode: './' },
    };
    vi.mocked(loadConfig).mockReturnValue(mockConfig as unknown as OpenPowersConfig);

    const mod = await import('./config.js');
    registerConfigCommand = mod.registerConfigCommand;
    const program = new Command();
    registerConfigCommand(program);

    await program.parseAsync(['config', 'show', 'language', 'switchProviders.workflow', 'project.sourcecode'], { from: 'user' });

    const output = stdoutCalls.join('');
    const lines = output.trim().split('\n');
    expect(lines).toHaveLength(3);
    expect(lines[0]).toBe('language=chinese');
    expect(lines[1]).toBe('switchProviders.workflow=default');
    expect(lines[2]).toBe('project.sourcecode=./');
  });

  it('config show should print JSON for plain object values', async () => {
    const { loadConfig } = await import('../utils/config.js');
    const mockConfig = { project: { sourcecode: './' } };
    vi.mocked(loadConfig).mockReturnValue(mockConfig as OpenPowersConfig);

    const mod = await import('./config.js');
    registerConfigCommand = mod.registerConfigCommand;
    const program = new Command();
    registerConfigCommand(program);

    await program.parseAsync(['config', 'show', 'project'], { from: 'user' });

    const output = stdoutCalls.join('');
    expect(output).toBe('project=' + JSON.stringify(mockConfig.project) + '\n');
  });

  it('config show should print key=None for keys that do not exist', async () => {
    const { loadConfig } = await import('../utils/config.js');
    const mockConfig = { language: 'chinese' };
    vi.mocked(loadConfig).mockReturnValue(mockConfig as OpenPowersConfig);

    const mod = await import('./config.js');
    registerConfigCommand = mod.registerConfigCommand;
    const program = new Command();
    registerConfigCommand(program);

    await program.parseAsync(['config', 'show', 'nonexistent.key'], { from: 'user' });

    const output = stdoutCalls.join('');
    expect(output).toBe('nonexistent.key=None\n');
  });

  it('config show should print JSON stringified value for array values', async () => {
    const { loadConfig } = await import('../utils/config.js');
    const mockConfig = { project: { repositories: [{ path: '/test' }] } };
    vi.mocked(loadConfig).mockReturnValue(mockConfig as OpenPowersConfig);

    const mod = await import('./config.js');
    registerConfigCommand = mod.registerConfigCommand;
    const program = new Command();
    registerConfigCommand(program);

    await program.parseAsync(['config', 'show', 'project.repositories'], { from: 'user' });

    const output = stdoutCalls.join('');
    expect(output).toBe('project.repositories=' + JSON.stringify(mockConfig.project.repositories) + '\n');
  });

  it('config show should handle mixed output: non-object, object, missing keys', async () => {
    const { loadConfig } = await import('../utils/config.js');
    const mockConfig = {
      language: 'chinese',
      switchProviders: { workflow: 'default', explore: 'default', propose: 'default', plan: 'default', review: 'default', coding: 'default', finalize: 'default' },
      project: { sourcecode: './', references: [] },
    };
    vi.mocked(loadConfig).mockReturnValue(mockConfig as unknown as OpenPowersConfig);

    const mod = await import('./config.js');
    registerConfigCommand = mod.registerConfigCommand;
    const program = new Command();
    registerConfigCommand(program);

    await program.parseAsync(
      ['config', 'show', 'language', 'switchProviders', 'nonexistent.key', 'project.references'],
      { from: 'user' },
    );

    const output = stdoutCalls.join('');
    const lines = output.trim().split('\n');
    expect(lines).toHaveLength(4);
    expect(lines[0]).toBe('language=chinese');
    expect(lines[1]).toBe('switchProviders=' + JSON.stringify(mockConfig.switchProviders));
    expect(lines[2]).toBe('nonexistent.key=None');
    expect(lines[3]).toBe('project.references=' + JSON.stringify(mockConfig.project.references));
  });
});
