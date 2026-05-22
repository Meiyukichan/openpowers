/**
 * @fileoverview Tests for agents.ts registerAgentsCommand
 * @author Meiyuki <meiyukichan@163.com>
 * @copyright 2026 Meiyuki
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Command } from 'commander';
import type { Provider } from '../server/providers-store.js';
import type { SessionSettings } from '../utils/session.js';

// Mock providers-store
const mockProviders: Provider[] = [
  {
    id: 'p1',
    name: 'Anthropic',
    defaultModel: 'claude-sonnet-4-20250514',
    sonnetModel: 'claude-sonnet-4-20250514',
    opusModel: 'claude-opus-4-20250514',
    haikuModel: 'claude-haiku-3-5-20241022',
    createdAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'p2',
    name: 'OpenAI',
    defaultModel: 'gpt-4o',
    sonnetModel: 'gpt-4-turbo',
    opusModel: 'gpt-4',
    haikuModel: 'gpt-4o-mini',
    createdAt: '2026-01-01T00:00:00.000Z',
  },
];

const mockDefaultProvider: Provider = {
  id: 'p1',
  name: 'Anthropic',
  defaultModel: 'claude-sonnet-4-20250514',
  sonnetModel: 'claude-sonnet-4-20250514',
  opusModel: 'claude-opus-4-20250514',
  haikuModel: 'claude-haiku-3-5-20241022',
  createdAt: '2026-01-01T00:00:00.000Z',
};

vi.mock('../server/providers-store.js', () => ({
  loadProviders: vi.fn(),
  getDefaultProvider: vi.fn(),
  getProviderByModels: vi.fn(),
  getEnableOpenpowersProxy: vi.fn(),
}));

// Mock session utils
const mockReadSessionSettings = vi.fn();
const mockWriteSessionSettings = vi.fn();
const mockGetSessionFilePath = vi.fn();

vi.mock('../utils/session.js', () => ({
  readSessionSettings: mockReadSessionSettings,
  writeSessionSettings: mockWriteSessionSettings,
  getSessionFilePath: mockGetSessionFilePath,
}));

// Mock config
const mockSwitchProviders: Record<string, string> = {
  workflow: 'default',
  explore: 'default',
  propose: 'default',
  plan: 'default',
  review: 'default',
  coding: 'default',
  finalize: 'default',
};

vi.mock('../utils/config.js', () => ({
  loadConfig: vi.fn(() => ({ switchProviders: mockSwitchProviders } as unknown as Record<string, unknown>)),
}));

// Mock logger
vi.mock('../utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

// Mock fs
import fs from 'fs';
vi.mock('fs', () => ({
  default: {
    existsSync: vi.fn(),
    mkdirSync: vi.fn(),
    writeFileSync: vi.fn(),
    readFileSync: vi.fn(),
  },
}));

describe('src/commands/agents.ts', () => {
  let registerAgentsCommand: (program: Command) => void;
  let stdoutCalls: string[];
  let stderrCalls: string[];

  beforeEach(() => {
    stdoutCalls = [];
    stderrCalls = [];
    vi.spyOn(process.stdout, 'write').mockImplementation(
      (chunk: unknown) => {
        stdoutCalls.push(String(chunk));
        return true;
      },
    );
    vi.spyOn(process.stderr, 'write').mockImplementation(
      (chunk: unknown) => {
        stderrCalls.push(String(chunk));
        return true;
      },
    );
    vi.spyOn(process, 'exit').mockImplementation((code?: number) => {
      throw new Error(`process.exit(${code})`);
    });
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // -----------------------------------------------------------------------
  // Acceptance Criteria 1: agents command group registration
  // -----------------------------------------------------------------------

  it('should export registerAgentsCommand as a named function', async () => {
    const mod = await import('./agents.js');
    registerAgentsCommand = mod.registerAgentsCommand;
    expect(registerAgentsCommand).toBeDefined();
    expect(typeof registerAgentsCommand).toBe('function');
  });

  it('should register agents parent command with list, show, switch, init subcommands', async () => {
    const mod = await import('./agents.js');
    registerAgentsCommand = mod.registerAgentsCommand;
    const program = new Command();
    registerAgentsCommand(program);

    const agentsCmd = program.commands.find((cmd) => cmd.name() === 'agents');
    expect(agentsCmd).toBeDefined();

    const subCommandNames = agentsCmd!.commands.map((cmd) => cmd.name());
    expect(subCommandNames).toContain('list');
    expect(subCommandNames).toContain('show');
    expect(subCommandNames).toContain('switch');
    expect(subCommandNames).toContain('init');
  });

  // -----------------------------------------------------------------------
  // Acceptance Criteria 2: agents list without --session (provider table)
  // -----------------------------------------------------------------------

  it('agents list should output provider table with Name/default/sonnet/opus/haiku columns', async () => {
    const { loadProviders } = await import('../server/providers-store.js');
    vi.mocked(loadProviders).mockReturnValue(mockProviders);

    const mod = await import('./agents.js');
    registerAgentsCommand = mod.registerAgentsCommand;
    const program = new Command();
    registerAgentsCommand(program);

    try {
      await program.parseAsync(['agents', 'list'], { from: 'user' });
    } catch {
      // ignore exit
    }

    const output = stdoutCalls.join('');
    expect(output).toContain('Name');
    expect(output).toContain('default');
    expect(output).toContain('sonnet');
    expect(output).toContain('opus');
    expect(output).toContain('haiku');
    expect(output).toContain('Anthropic');
    expect(output).toContain('claude-sonnet-4-20250514');
    expect(output).toContain('OpenAI');
    expect(output).toContain('gpt-4o');
    expect(output).toContain('gpt-4o-mini');
  });

  it('agents list with empty providers should output header row only', async () => {
    const { loadProviders } = await import('../server/providers-store.js');
    vi.mocked(loadProviders).mockReturnValue([]);

    const mod = await import('./agents.js');
    registerAgentsCommand = mod.registerAgentsCommand;
    const program = new Command();
    registerAgentsCommand(program);

    try {
      await program.parseAsync(['agents', 'list'], { from: 'user' });
    } catch {
      // ignore exit
    }

    const output = stdoutCalls.join('');
    expect(output).toContain('Name');
    expect(output).toContain('default');
    expect(output).toContain('sonnet');
    expect(output).toContain('opus');
    expect(output).toContain('haiku');
    // No provider data rows, but may have separator
  });

  // -----------------------------------------------------------------------
  // Acceptance Criteria 3: agents list --session (stage-model table)
  // -----------------------------------------------------------------------

  it('agents list --session <id> should output stage/model table', async () => {
    const { loadProviders, getDefaultProvider } = await import('../server/providers-store.js');
    vi.mocked(loadProviders).mockReturnValue(mockProviders);
    vi.mocked(getDefaultProvider).mockReturnValue(mockDefaultProvider);

    mockReadSessionSettings.mockReturnValue({
      sessionId: 'test-session',
      cwd: '/test',
      currentProvider: 'default',
      switchProviders: {
        workflow: 'default',
        explore: 'claude-sonnet-4-20250514',
        propose: 'default',
        plan: 'gpt-4-turbo',
        review: 'default',
        coding: 'default',
        finalize: 'default',
      },
    });

    const mod = await import('./agents.js');
    registerAgentsCommand = mod.registerAgentsCommand;
    const program = new Command();
    registerAgentsCommand(program);

    try {
      await program.parseAsync(['agents', 'list', '--session', 'test-session'], { from: 'user' });
    } catch {
      // ignore exit
    }

    const output = stdoutCalls.join('');
    expect(output).toContain('stage');
    expect(output).toContain('model');
    expect(output).toContain('workflow');
    expect(output).toContain('explore');
    // 'default' should be resolved to active provider's defaultModel
    expect(output).toContain('claude-sonnet-4-20250514');
    expect(output).toContain('gpt-4-turbo');
  });

  // -----------------------------------------------------------------------
  // Acceptance Criteria 4: agents list --session file not found
  // -----------------------------------------------------------------------

  it('agents list --session <id> should output error when file not found', async () => {
    mockReadSessionSettings.mockReturnValue(null);

    const mod = await import('./agents.js');
    registerAgentsCommand = mod.registerAgentsCommand;
    const program = new Command();
    registerAgentsCommand(program);

    try {
      await program.parseAsync(['agents', 'list', '--session', 'nonexistent'], { from: 'user' });
    } catch {
      // ignore exit
    }

    const output = stderrCalls.join('');
    expect(output).toContain('not found');
  });

  // -----------------------------------------------------------------------
  // Acceptance Criteria 5: agents show <name> without --session
  // -----------------------------------------------------------------------

  it('agents show <name> without --session should output error requiring --session', async () => {
    const mod = await import('./agents.js');
    registerAgentsCommand = mod.registerAgentsCommand;
    const program = new Command();
    registerAgentsCommand(program);

    try {
      await program.parseAsync(['agents', 'show', 'workflow'], { from: 'user' });
    } catch {
      // ignore exit
    }

    const output = stderrCalls.join('');
    expect(output).toContain('--session');
  });

  // -----------------------------------------------------------------------
  // Acceptance Criteria 6: agents show default resolves to defaultModel
  // -----------------------------------------------------------------------

  it('agents show default --session <id> should resolve to active provider defaultModel', async () => {
    const { getDefaultProvider } = await import('../server/providers-store.js');
    vi.mocked(getDefaultProvider).mockReturnValue(mockDefaultProvider);

    mockReadSessionSettings.mockReturnValue({
      sessionId: 'test-session',
      cwd: '/test',
      currentProvider: 'default',
      switchProviders: {
        workflow: 'default',
        explore: 'claude-sonnet-4-20250514',
        propose: 'default',
        plan: 'default',
        review: 'default',
        coding: 'default',
        finalize: 'default',
      },
    });

    const mod = await import('./agents.js');
    registerAgentsCommand = mod.registerAgentsCommand;
    const program = new Command();
    registerAgentsCommand(program);

    try {
      await program.parseAsync(['agents', 'show', 'default', '--session', 'test-session'], { from: 'user' });
    } catch {
      // ignore exit
    }

    const output = stdoutCalls.join('');
    expect(output).toContain('claude-sonnet-4-20250514');
  });

  // -----------------------------------------------------------------------
  // Acceptance Criteria 7: agents show invalid name
  // -----------------------------------------------------------------------

  it('agents show invalid --session <id> should output unsupported name error', async () => {
    const { getDefaultProvider } = await import('../server/providers-store.js');
    vi.mocked(getDefaultProvider).mockReturnValue(mockDefaultProvider);

    mockReadSessionSettings.mockReturnValue({
      sessionId: 'test-session',
      cwd: '/test',
      currentProvider: 'default',
      switchProviders: {
        workflow: 'default',
        explore: 'claude-sonnet-4-20250514',
        propose: 'default',
        plan: 'default',
        review: 'default',
        coding: 'default',
        finalize: 'default',
      },
    });

    const mod = await import('./agents.js');
    registerAgentsCommand = mod.registerAgentsCommand;
    const program = new Command();
    registerAgentsCommand(program);

    try {
      await program.parseAsync(['agents', 'show', 'invalid-stage', '--session', 'test-session'], { from: 'user' });
    } catch {
      // ignore exit
    }

    const output = stderrCalls.join('');
    expect(output).toContain('not supported');
  });

  // -----------------------------------------------------------------------
  // Acceptance Criteria 8: agents switch --session updates currentProvider
  // -----------------------------------------------------------------------

  it('agents switch <name> --session <id> should update currentProvider and output success', async () => {
    const sessionSettings: SessionSettings = {
      sessionId: 'test-session',
      cwd: '/test',
      currentProvider: 'default',
      switchProviders: {
        workflow: 'default',
        explore: 'claude-sonnet-4-20250514',
        propose: 'default',
        plan: 'default',
        review: 'default',
        coding: 'default',
        finalize: 'default',
      },
    };

    mockReadSessionSettings.mockReturnValue({ ...sessionSettings });
    mockGetSessionFilePath.mockReturnValue('/home/user/.openpowers/sessions/test-session/settings.json');

    const mod = await import('./agents.js');
    registerAgentsCommand = mod.registerAgentsCommand;
    const program = new Command();
    registerAgentsCommand(program);

    try {
      await program.parseAsync(['agents', 'switch', 'explore', '--session', 'test-session'], { from: 'user' });
    } catch {
      // ignore exit
    }

    // Check that writeSessionSettings was called with updated currentProvider
    expect(mockWriteSessionSettings).toHaveBeenCalledWith(
      'test-session',
      expect.objectContaining({ currentProvider: 'explore' }),
    );

    const output = stdoutCalls.join('');
    expect(output).toContain('explore');
  });

  // -----------------------------------------------------------------------
  // Acceptance Criteria 9: agents switch without --session
  // -----------------------------------------------------------------------

  it('agents switch <name> without --session should output error', async () => {
    const mod = await import('./agents.js');
    registerAgentsCommand = mod.registerAgentsCommand;
    const program = new Command();
    registerAgentsCommand(program);

    try {
      await program.parseAsync(['agents', 'switch', 'explore'], { from: 'user' });
    } catch {
      // ignore exit
    }

    const output = stderrCalls.join('');
    expect(output).toContain('--session');
  });

  // -----------------------------------------------------------------------
  // Acceptance Criteria 10: agents switch file not found
  // -----------------------------------------------------------------------

  it('agents switch --session <id> should output failure when file not found', async () => {
    mockReadSessionSettings.mockReturnValue(null);

    const mod = await import('./agents.js');
    registerAgentsCommand = mod.registerAgentsCommand;
    const program = new Command();
    registerAgentsCommand(program);

    try {
      await program.parseAsync(['agents', 'switch', 'explore', '--session', 'test-session'], { from: 'user' });
    } catch {
      // ignore exit
    }

    const output = stderrCalls.join('');
    expect(output).toContain('no configuration file');
  });

  // -----------------------------------------------------------------------
  // Acceptance Criteria 11: agents switch invalid name
  // -----------------------------------------------------------------------

  it('agents switch invalid --session <id> should output unsupported name error', async () => {
    mockReadSessionSettings.mockReturnValue({
      sessionId: 'test-session',
      cwd: '/test',
      currentProvider: 'default',
      switchProviders: {
        workflow: 'default',
        explore: 'default',
        propose: 'default',
        plan: 'default',
        review: 'default',
        coding: 'default',
        finalize: 'default',
      },
    });

    const mod = await import('./agents.js');
    registerAgentsCommand = mod.registerAgentsCommand;
    const program = new Command();
    registerAgentsCommand(program);

    try {
      await program.parseAsync(['agents', 'switch', 'invalid', '--session', 'test-session'], { from: 'user' });
    } catch {
      // ignore exit
    }

    const output = stderrCalls.join('');
    expect(output).toContain('not supported');
  });

  // -----------------------------------------------------------------------
  // Acceptance Criteria 12: agents init empty sessionId
  // -----------------------------------------------------------------------

  it('agents init with empty sessionId should output error', async () => {
    const mod = await import('./agents.js');
    registerAgentsCommand = mod.registerAgentsCommand;
    const program = new Command();
    registerAgentsCommand(program);

    try {
      await program.parseAsync(['agents', 'init', '--session', '', '--cwd', '/some/path'], { from: 'user' });
    } catch {
      // ignore exit
    }

    const output = stderrCalls.join('');
    expect(output.toLowerCase()).toContain('session');
  });

  // -----------------------------------------------------------------------
  // Acceptance Criteria 13: agents init non-existent cwd
  // -----------------------------------------------------------------------

  it('agents init with non-existent cwd should output error', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);

    const mod = await import('./agents.js');
    registerAgentsCommand = mod.registerAgentsCommand;
    const program = new Command();
    registerAgentsCommand(program);

    try {
      await program.parseAsync(['agents', 'init', '--session', 'abc', '--cwd', '/nonexistent'], { from: 'user' });
    } catch {
      // ignore exit
    }

    const output = stderrCalls.join('');
    expect(output).toContain('not exist');
  });

  // -----------------------------------------------------------------------
  // Acceptance Criteria 14: agents init proxy disabled
  // -----------------------------------------------------------------------

  it('agents init with proxy disabled should output reject message', async () => {
    const { getEnableOpenpowersProxy } = await import('../server/providers-store.js');
    vi.mocked(getEnableOpenpowersProxy).mockReturnValue(false);
    vi.mocked(fs.existsSync).mockReturnValue(true);

    const mod = await import('./agents.js');
    registerAgentsCommand = mod.registerAgentsCommand;
    const program = new Command();
    registerAgentsCommand(program);

    try {
      await program.parseAsync(['agents', 'init', '--session', 'abc', '--cwd', '/valid'], { from: 'user' });
    } catch {
      // ignore exit
    }

    const output = stderrCalls.join('');
    expect(output).toContain('代理未开启');
  });

  // -----------------------------------------------------------------------
  // Acceptance Criteria 15: agents init success
  // -----------------------------------------------------------------------

  it('agents init should create settings.json and output success with file path', async () => {
    const { getEnableOpenpowersProxy, getProviderByModels } = await import('../server/providers-store.js');
    vi.mocked(getEnableOpenpowersProxy).mockReturnValue(true);
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(getProviderByModels).mockReturnValue({});

    const filePath = '/home/user/.openpowers/sessions/abc/settings.json';
    mockGetSessionFilePath.mockReturnValue(filePath);

    const mod = await import('./agents.js');
    registerAgentsCommand = mod.registerAgentsCommand;
    const program = new Command();
    registerAgentsCommand(program);

    try {
      await program.parseAsync(['agents', 'init', '--session', 'abc', '--cwd', '/valid'], { from: 'user' });
    } catch {
      // ignore exit
    }

    expect(mockWriteSessionSettings).toHaveBeenCalledWith(
      'abc',
      expect.objectContaining({
        sessionId: 'abc',
        cwd: '/valid',
        currentProvider: 'default',
      }),
    );

    const output = stdoutCalls.join('');
    expect(output).toContain(filePath);
  });

  // -----------------------------------------------------------------------
  // Acceptance Criteria 16: agents init invalid model replaced with default
  // -----------------------------------------------------------------------

  it('agents init should replace model names not in providers with default', async () => {
    const { getEnableOpenpowersProxy, getProviderByModels } = await import('../server/providers-store.js');
    const { loadConfig } = await import('../utils/config.js');

    vi.mocked(getEnableOpenpowersProxy).mockReturnValue(true);
    vi.mocked(fs.existsSync).mockReturnValue(true);

    // Override loadConfig to return switchProviders with:
    // - a valid model name that exists in providers
    // - an invalid model name that does NOT exist in providers
    // - some 'default' values that should remain unchanged
    vi.mocked(loadConfig).mockReturnValue({
      switchProviders: {
        workflow: 'default',
        explore: 'claude-sonnet-4-20250514',
        propose: 'invalid-model',
        plan: 'default',
        review: 'default',
        coding: 'default',
        finalize: 'default',
      },
    } as unknown as Record<string, unknown>);

    // Valid model found, invalid model not found
    vi.mocked(getProviderByModels).mockReturnValue({
      'claude-sonnet-4-20250514': mockDefaultProvider,
      'invalid-model': null,
    });

    mockGetSessionFilePath.mockReturnValue('/home/user/.openpowers/sessions/abc/settings.json');

    const mod = await import('./agents.js');
    registerAgentsCommand = mod.registerAgentsCommand;
    const program = new Command();
    registerAgentsCommand(program);

    try {
      await program.parseAsync(['agents', 'init', '--session', 'abc', '--cwd', '/valid'], { from: 'user' });
    } catch {
      // ignore exit
    }

    // Verify writeSessionSettings was called with correctly validated switchProviders:
    // - 'default' values remain 'default'
    // - valid model name 'claude-sonnet-4-20250514' is preserved
    // - invalid model name 'invalid-model' is replaced with 'default'
    expect(mockWriteSessionSettings).toHaveBeenCalledWith(
      'abc',
      expect.objectContaining({
        sessionId: 'abc',
        cwd: '/valid',
        currentProvider: 'default',
        switchProviders: {
          workflow: 'default',
          explore: 'claude-sonnet-4-20250514',
          propose: 'default',
          plan: 'default',
          review: 'default',
          coding: 'default',
          finalize: 'default',
        },
      }),
    );
  });
});
