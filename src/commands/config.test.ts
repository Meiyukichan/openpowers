/**
 * @fileoverview Tests for config.ts registerConfigCommand
 * @author Meiyuki <meiyukichan@163.com>
 * @copyright 2026 Meiyuki
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Command } from 'commander';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// Mock the config utility before any imports.
// loadConfig and queryConfig are stubbed (config list/show tests don't
// exercise the real config loader). readUserConfig / writeUserConfig /
// setUserConfigValue are passed through from the real module so that
// `config mode` and `config set` exercise real disk I/O against a tmp
// directory, which is exactly what we want to verify.
vi.mock('../utils/config.js', async () => {
  const actual = await vi.importActual<typeof import('../utils/config.js')>('../utils/config.js');
  return {
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
    readUserConfig: actual.readUserConfig,
    writeUserConfig: actual.writeUserConfig,
    setUserConfigValue: actual.setUserConfigValue,
    setDefaultConfigValue: vi.fn(),
  };
});

/** Resolves the absolute path the CLI writes to when cwd is mocked to tmpDir. */
function tmpConfigFile(tmpDir: string): string {
  return path.join(tmpDir, '.claude', 'openpowers.json');
}

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
    vi.mocked(loadConfig).mockReturnValue(mockConfig as unknown as import('../utils/config.js').OpenPowersConfig);

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
    vi.mocked(loadConfig).mockReturnValue(mockConfig as unknown as import('../utils/config.js').OpenPowersConfig);

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
    vi.mocked(loadConfig).mockReturnValue(mockConfig as import('../utils/config.js').OpenPowersConfig);

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
    vi.mocked(loadConfig).mockReturnValue(mockConfig as import('../utils/config.js').OpenPowersConfig);

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
    vi.mocked(loadConfig).mockReturnValue(mockConfig as import('../utils/config.js').OpenPowersConfig);

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
    vi.mocked(loadConfig).mockReturnValue(mockConfig as unknown as import('../utils/config.js').OpenPowersConfig);

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

// ---------------------------------------------------------------------------
// MODE_PRESETS constant
// ---------------------------------------------------------------------------

describe('MODE_PRESETS constant', () => {
  it('should be exported from src/commands/config.ts', async () => {
    const mod = await import('./config.js');
    expect((mod as unknown as { MODE_PRESETS?: unknown }).MODE_PRESETS).toBeDefined();
  });

  it('should deep-equal the lite preset values', async () => {
    const mod = await import('./config.js');
    const MODE_PRESETS = (mod as unknown as { MODE_PRESETS: Record<string, unknown> }).MODE_PRESETS;
    expect(MODE_PRESETS.lite).toEqual({
      experimental: {
        explore: false,
        review: { openpowers: false, specs: false, code: false },
      },
    });
  });

  it('should deep-equal the standard preset values', async () => {
    const mod = await import('./config.js');
    const MODE_PRESETS = (mod as unknown as { MODE_PRESETS: Record<string, unknown> }).MODE_PRESETS;
    expect(MODE_PRESETS.standard).toEqual({
      experimental: {
        explore: true,
        review: { openpowers: false, specs: false, code: true },
      },
    });
  });

  it('should deep-equal the max preset values', async () => {
    const mod = await import('./config.js');
    const MODE_PRESETS = (mod as unknown as { MODE_PRESETS: Record<string, unknown> }).MODE_PRESETS;
    expect(MODE_PRESETS.max).toEqual({
      experimental: {
        explore: true,
        review: { openpowers: true, specs: true, code: true },
      },
    });
  });
});

// ---------------------------------------------------------------------------
// config mode <mode>
// ---------------------------------------------------------------------------

describe('config mode <mode> subcommand', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpowers-mode-'));
    vi.spyOn(process, 'cwd').mockReturnValue(tmpDir);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (tmpDir && fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('mode lite should create .claude/openpowers.json with the lite preset (2-space indent + trailing newline)', async () => {
    const mod = await import('./config.js');
    const program = new Command();
    mod.registerConfigCommand(program);

    await program.parseAsync(['config', 'mode', 'lite'], { from: 'user' });

    const filePath = tmpConfigFile(tmpDir);
    expect(fs.existsSync(filePath)).toBe(true);
    const raw = fs.readFileSync(filePath, 'utf-8');
    expect(raw).toBe(
      JSON.stringify(
        {
          experimental: {
            explore: false,
            review: { openpowers: false, specs: false, code: false },
          },
        },
        null,
        2,
      ) + '\n',
    );
  });

  it('mode standard should create the user config with the standard preset', async () => {
    const mod = await import('./config.js');
    const program = new Command();
    mod.registerConfigCommand(program);

    await program.parseAsync(['config', 'mode', 'standard'], { from: 'user' });

    const filePath = tmpConfigFile(tmpDir);
    const raw = fs.readFileSync(filePath, 'utf-8');
    expect(raw).toBe(
      JSON.stringify(
        {
          experimental: {
            explore: true,
            review: { openpowers: false, specs: false, code: true },
          },
        },
        null,
        2,
      ) + '\n',
    );
  });

  it('mode max should create the user config with the max preset', async () => {
    const mod = await import('./config.js');
    const program = new Command();
    mod.registerConfigCommand(program);

    await program.parseAsync(['config', 'mode', 'max'], { from: 'user' });

    const filePath = tmpConfigFile(tmpDir);
    const raw = fs.readFileSync(filePath, 'utf-8');
    expect(raw).toBe(
      JSON.stringify(
        {
          experimental: {
            explore: true,
            review: { openpowers: true, specs: true, code: true },
          },
        },
        null,
        2,
      ) + '\n',
    );
  });

  it('mode standard should preserve unrelated user keys (e.g. language=chinese)', async () => {
    const claudeDir = path.join(tmpDir, '.claude');
    fs.mkdirSync(claudeDir, { recursive: true });
    const filePath = path.join(claudeDir, 'openpowers.json');
    fs.writeFileSync(
      filePath,
      JSON.stringify({ experimental: { websearch: false }, language: 'chinese' }, null, 2) + '\n',
      'utf-8',
    );

    const mod = await import('./config.js');
    const program = new Command();
    mod.registerConfigCommand(program);

    await program.parseAsync(['config', 'mode', 'standard'], { from: 'user' });

    const raw = fs.readFileSync(filePath, 'utf-8');
    expect(raw).toBe(
      JSON.stringify(
        {
          experimental: {
            websearch: false,
            explore: true,
            review: { openpowers: false, specs: false, code: true },
          },
          language: 'chinese',
        },
        null,
        2,
      ) + '\n',
    );
  });

  it('mode ultra (invalid value) should exit non-zero, write nothing, and list valid values in the error', async () => {
    const stderrCalls: string[] = [];
    vi.spyOn(process.stderr, 'write').mockImplementation((chunk: unknown) => {
      stderrCalls.push(String(chunk));
      return true;
    });

    const mod = await import('./config.js');
    const program = new Command();
    mod.registerConfigCommand(program);

    let caught: unknown = null;
    try {
      await program.parseAsync(['config', 'mode', 'ultra'], { from: 'user' });
    } catch (e) {
      caught = e;
    }

    expect(caught).toBeDefined();
    const filePath = tmpConfigFile(tmpDir);
    expect(fs.existsSync(filePath)).toBe(false);

    const stderr = stderrCalls.join('');
    // The error message must list the valid values
    expect(stderr).toMatch(/lite/);
    expect(stderr).toMatch(/standard/);
    expect(stderr).toMatch(/max/);
  });

  it('mode should create the .claude directory automatically when missing', async () => {
    // tmpDir is empty; .claude should not yet exist
    const claudeDir = path.join(tmpDir, '.claude');
    expect(fs.existsSync(claudeDir)).toBe(false);

    const mod = await import('./config.js');
    const program = new Command();
    mod.registerConfigCommand(program);

    await program.parseAsync(['config', 'mode', 'lite'], { from: 'user' });

    expect(fs.existsSync(claudeDir)).toBe(true);
    expect(fs.existsSync(path.join(claudeDir, 'openpowers.json'))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// config set <key> <value>
// ---------------------------------------------------------------------------

describe('config set <key> <value> subcommand', () => {
  let tmpDir: string;
  let stdoutCalls: string[];

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpowers-set-'));
    vi.spyOn(process, 'cwd').mockReturnValue(tmpDir);
    stdoutCalls = [];
    vi.spyOn(process.stdout, 'write').mockImplementation((chunk: unknown) => {
      stdoutCalls.push(String(chunk));
      return true;
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (tmpDir && fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('set experimental.explore false should store boolean false (not string "false")', async () => {
    const mod = await import('./config.js');
    const program = new Command();
    mod.registerConfigCommand(program);

    await program.parseAsync(['config', 'set', 'experimental.explore', 'false'], { from: 'user' });

    const filePath = tmpConfigFile(tmpDir);
    const raw = fs.readFileSync(filePath, 'utf-8');
    expect(raw).toBe(JSON.stringify({ experimental: { explore: false } }, null, 2) + '\n');
    // Make sure we did NOT store the string "false"
    expect(raw).not.toContain('"false"');
  });

  it('set experimental.budget 0 should store JSON number 0 (not string "0")', async () => {
    const mod = await import('./config.js');
    const program = new Command();
    mod.registerConfigCommand(program);

    await program.parseAsync(['config', 'set', 'experimental.budget', '0'], { from: 'user' });

    const filePath = tmpConfigFile(tmpDir);
    const raw = fs.readFileSync(filePath, 'utf-8');
    expect(raw).toBe(JSON.stringify({ experimental: { budget: 0 } }, null, 2) + '\n');
    // Stored value must be the number 0 — JSON serializes it without quotes
    expect(JSON.parse(raw).experimental.budget).toBe(0);
  });

  it('set language chinese should store the string "chinese"', async () => {
    const mod = await import('./config.js');
    const program = new Command();
    mod.registerConfigCommand(program);

    await program.parseAsync(['config', 'set', 'language', 'chinese'], { from: 'user' });

    const filePath = tmpConfigFile(tmpDir);
    const raw = fs.readFileSync(filePath, 'utf-8');
    expect(raw).toBe(JSON.stringify({ language: 'chinese' }, null, 2) + '\n');
  });

  it('set experimental.review.openpowers true should create intermediate objects on an empty file', async () => {
    const mod = await import('./config.js');
    const program = new Command();
    mod.registerConfigCommand(program);

    await program.parseAsync(
      ['config', 'set', 'experimental.review.openpowers', 'true'],
      { from: 'user' },
    );

    const filePath = tmpConfigFile(tmpDir);
    const raw = fs.readFileSync(filePath, 'utf-8');
    expect(raw).toBe(
      JSON.stringify({ experimental: { review: { openpowers: true } } }, null, 2) + '\n',
    );
  });

  it('set experimental.tag v1.2.3-rc should store the literal string (not parsed as number)', async () => {
    const mod = await import('./config.js');
    const program = new Command();
    mod.registerConfigCommand(program);

    await program.parseAsync(['config', 'set', 'experimental.tag', 'v1.2.3-rc'], { from: 'user' });

    const filePath = tmpConfigFile(tmpDir);
    const raw = fs.readFileSync(filePath, 'utf-8');
    expect(raw).toBe(JSON.stringify({ experimental: { tag: 'v1.2.3-rc' } }, null, 2) + '\n');
    expect(JSON.parse(raw).experimental.tag).toBe('v1.2.3-rc');
  });

  it('set with whitespace-padded booleans and numbers should still infer types', async () => {
    const mod = await import('./config.js');
    const program = new Command();
    mod.registerConfigCommand(program);

    await program.parseAsync(
      ['config', 'set', 'experimental.explore', '   true  '],
      { from: 'user' },
    );

    const filePath = tmpConfigFile(tmpDir);
    const raw = fs.readFileSync(filePath, 'utf-8');
    expect(JSON.parse(raw).experimental.explore).toBe(true);
  });

  it('set with -42 should store the negative number', async () => {
    const mod = await import('./config.js');
    const program = new Command();
    mod.registerConfigCommand(program);

    await program.parseAsync(
      ['config', 'set', 'experimental.offset', '-42'],
      { from: 'user' },
    );

    const filePath = tmpConfigFile(tmpDir);
    const raw = fs.readFileSync(filePath, 'utf-8');
    expect(JSON.parse(raw).experimental.offset).toBe(-42);
  });

  it('set with 3.14 should store the float number', async () => {
    const mod = await import('./config.js');
    const program = new Command();
    mod.registerConfigCommand(program);

    await program.parseAsync(
      ['config', 'set', 'experimental.factor', '3.14'],
      { from: 'user' },
    );

    const filePath = tmpConfigFile(tmpDir);
    const raw = fs.readFileSync(filePath, 'utf-8');
    expect(JSON.parse(raw).experimental.factor).toBe(3.14);
  });

  it('set with 01 or 2026-06-01 should be stored as strings', async () => {
    const mod = await import('./config.js');
    const program = new Command();
    mod.registerConfigCommand(program);

    await program.parseAsync(
      ['config', 'set', 'experimental.leading', '01'],
      { from: 'user' },
    );
    await program.parseAsync(
      ['config', 'set', 'language', '2026-06-01'],
      { from: 'user' },
    );

    const filePath = tmpConfigFile(tmpDir);
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    expect(parsed.experimental.leading).toBe('01');
    expect(parsed.language).toBe('2026-06-01');
  });

  it('set should overwrite only the targeted key, preserving unrelated user keys', async () => {
    const claudeDir = path.join(tmpDir, '.claude');
    fs.mkdirSync(claudeDir, { recursive: true });
    const filePath = path.join(claudeDir, 'openpowers.json');
    fs.writeFileSync(
      filePath,
      JSON.stringify({ experimental: { websearch: false }, language: 'chinese' }, null, 2) + '\n',
      'utf-8',
    );

    const mod = await import('./config.js');
    const program = new Command();
    mod.registerConfigCommand(program);

    await program.parseAsync(
      ['config', 'set', 'experimental.explore', 'true'],
      { from: 'user' },
    );

    const raw = fs.readFileSync(filePath, 'utf-8');
    expect(raw).toBe(
      JSON.stringify(
        {
          experimental: { websearch: false, explore: true },
          language: 'chinese',
        },
        null,
        2,
      ) + '\n',
    );
  });

  it('set should print the stored key=value pair', async () => {
    const mod = await import('./config.js');
    const program = new Command();
    mod.registerConfigCommand(program);

    await program.parseAsync(
      ['config', 'set', 'language', 'chinese'],
      { from: 'user' },
    );

    const output = stdoutCalls.join('');
    expect(output).toMatch(/language=chinese/);
  });

  it('set -g should call setDefaultConfigValue instead of writing to user config', async () => {
    const { setDefaultConfigValue } = await import('../utils/config.js');
    vi.mocked(setDefaultConfigValue).mockReturnValue('0 3 * * *');

    const mod = await import('./config.js');
    const program = new Command();
    mod.registerConfigCommand(program);

    await program.parseAsync(
      ['config', 'set', '-g', 'enhancement.memory.schedule', '0 3 * * *'],
      { from: 'user' },
    );

    // Should call setDefaultConfigValue, not write user config
    expect(setDefaultConfigValue).toHaveBeenCalledWith('enhancement.memory.schedule', '0 3 * * *');
    const filePath = tmpConfigFile(tmpDir);
    expect(fs.existsSync(filePath)).toBe(false);

    // Should print the stored key=value pair with (global) indicator
    const output = stdoutCalls.join('');
    expect(output).toMatch(/enhancement.memory.schedule=0 3 \* \* \* \(global\)/);
  });

  it('set --global should work as alias for -g', async () => {
    const { setDefaultConfigValue } = await import('../utils/config.js');
    vi.mocked(setDefaultConfigValue).mockReturnValue('0 4 * * *');

    const mod = await import('./config.js');
    const program = new Command();
    mod.registerConfigCommand(program);

    await program.parseAsync(
      ['config', 'set', '--global', 'enhancement.memory.schedule', '0 4 * * *'],
      { from: 'user' },
    );

    expect(setDefaultConfigValue).toHaveBeenCalledWith('enhancement.memory.schedule', '0 4 * * *');
  });

  it('set without -g should continue writing to user config', async () => {
    const mod = await import('./config.js');
    const program = new Command();
    mod.registerConfigCommand(program);

    await program.parseAsync(
      ['config', 'set', 'language', 'english'],
      { from: 'user' },
    );

    // User config file should exist
    const filePath = tmpConfigFile(tmpDir);
    expect(fs.existsSync(filePath)).toBe(true);
  });
});
