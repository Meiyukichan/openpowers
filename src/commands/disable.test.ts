/**
 * @fileoverview Tests for disable command module
 * @author Meiyuki <meiyukichan@163.com>
 * @copyright 2026 Meiyuki
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Command } from 'commander';

// ---- hoisted mocks ----

const {
  mockSetEnableFurinaProxy,
  mockGetActiveProvider,
} = vi.hoisted(() => ({
  mockSetEnableFurinaProxy: vi.fn(),
  mockGetActiveProvider: vi.fn(() => null),
}));

vi.mock('../server/providers-store.js', () => ({
  setEnableFurinaProxy: mockSetEnableFurinaProxy,
  getActiveProvider: mockGetActiveProvider,
}));

const {
  mockGetProviderEnv,
  mockWriteEnvToClaudeSettings,
  mockRestoreClaudeSettings,
} = vi.hoisted(() => ({
  mockGetProviderEnv: vi.fn(),
  mockWriteEnvToClaudeSettings: vi.fn(),
  mockRestoreClaudeSettings: vi.fn(() => true),
}));

vi.mock('../server/claude-settings.js', () => ({
  getProviderEnv: mockGetProviderEnv,
  writeEnvToClaudeSettings: mockWriteEnvToClaudeSettings,
  restoreClaudeSettings: mockRestoreClaudeSettings,
}));

// ---- types ----

type RunDisableFn = () => void;
type RegisterDisableCmdFn = (program: Command) => void;

// ---- sample provider ----

const sampleProvider = {
  id: 'prov-1',
  name: 'TestProvider',
  baseUrl: 'https://api.test.com',
  apiKey: 'sk-test',
  defaultModel: 'default-model',
  haikuModel: 'haiku-model',
  sonnetModel: 'sonnet-model',
  opusModel: 'opus-model',
};

const sampleProviderEnv: Record<string, string> = {
  ANTHROPIC_BASE_URL: 'https://api.test.com',
  ANTHROPIC_AUTH_TOKEN: 'sk-test',
  ANTHROPIC_MODEL: 'default-model',
  ANTHROPIC_DEFAULT_HAIKU_MODEL: 'haiku-model',
  ANTHROPIC_DEFAULT_SONNET_MODEL: 'sonnet-model',
  ANTHROPIC_DEFAULT_OPUS_MODEL: 'opus-model',
  CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1',
  DISABLE_ERROR_REPORTING: '1',
  DISABLE_NON_ESSENTIAL_MODEL_CALLS: '1',
  DISABLE_TELEMETRY: '1',
  NO_PROXY: 'localhost',
};

describe('src/commands/disable.ts', () => {
  let runDisable: RunDisableFn;
  let registerDisableCommand: RegisterDisableCmdFn;

  beforeEach(async () => {
    vi.clearAllMocks();

    vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    vi.spyOn(process, 'exit').mockImplementation(((code: number) => {
      throw new Error(`process.exit called with code ${code}`);
    }) as never);

    // Defaults for sync-related mocks
    mockGetActiveProvider.mockReturnValue(null);
    mockRestoreClaudeSettings.mockReturnValue(true);

    const mod = await import('./disable.js');
    runDisable = mod.runDisable;
    registerDisableCommand = mod.registerDisableCommand;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('registerDisableCommand', () => {
    it('should export registerDisableCommand as a named function', () => {
      expect(registerDisableCommand).toBeDefined();
      expect(typeof registerDisableCommand).toBe('function');
    });

    it('should register disable command on the program', () => {
      const program = new Command();
      registerDisableCommand(program);
      const subcommands = program.commands.map((cmd) => cmd.name());
      expect(subcommands).toContain('disable');
    });
  });

  describe('runDisable', () => {
    it('should call setEnableFurinaProxy with false', () => {
      runDisable();
      expect(mockSetEnableFurinaProxy).toHaveBeenCalledWith(false);
      expect(mockSetEnableFurinaProxy).toHaveBeenCalledTimes(1);
    });

    it('should output a success message via process.stdout.write', () => {
      runDisable();
      expect(process.stdout.write).toHaveBeenCalledWith(
        expect.stringContaining('disabled')
      );
    });

    it('should call process.exit(1) when setEnableFurinaProxy throws', () => {
      mockSetEnableFurinaProxy.mockImplementationOnce(() => {
        throw new Error('file system error');
      });

      expect(() => runDisable()).toThrow('process.exit called with code 1');
    });

    it('should output error message when setEnableFurinaProxy throws', () => {
      const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
      mockSetEnableFurinaProxy.mockImplementationOnce(() => {
        throw new Error('disk full');
      });

      try {
        runDisable();
      } catch {
        // expected
      }

      expect(stderrSpy).toHaveBeenCalled();
    });

    it('should not use console.log', () => {
      const consoleLogSpy = vi.spyOn(console, 'log');

      runDisable();

      expect(consoleLogSpy).not.toHaveBeenCalled();
      consoleLogSpy.mockRestore();
    });
  });

  // ---- NEW: claude settings sync behavior ----

  describe('claude settings sync after disabling proxy', () => {
    describe('with active provider', () => {
      beforeEach(() => {
        mockGetActiveProvider.mockReturnValue(sampleProvider as any);
        mockGetProviderEnv.mockReturnValue(sampleProviderEnv);
      });

      it('should write provider env to Claude settings', () => {
        runDisable();

        expect(mockGetActiveProvider).toHaveBeenCalledTimes(1);
        expect(mockGetProviderEnv).toHaveBeenCalledWith(sampleProvider);
        expect(mockWriteEnvToClaudeSettings).toHaveBeenCalledWith(sampleProviderEnv);
      });

      it('should NOT call restoreClaudeSettings', () => {
        runDisable();

        expect(mockRestoreClaudeSettings).not.toHaveBeenCalled();
      });
    });

    describe('without active provider', () => {
      beforeEach(() => {
        mockGetActiveProvider.mockReturnValue(null);
      });

      it('should call restoreClaudeSettings', () => {
        runDisable();

        expect(mockRestoreClaudeSettings).toHaveBeenCalledTimes(1);
        expect(mockWriteEnvToClaudeSettings).not.toHaveBeenCalled();
        expect(mockGetProviderEnv).not.toHaveBeenCalled();
      });
    });

    it('should still output success even if sync functions throw', () => {
      mockRestoreClaudeSettings.mockImplementation(() => {
        throw new Error('restore failed');
      });

      runDisable();

      expect(process.stdout.write).toHaveBeenCalledWith(
        expect.stringContaining('disabled'),
      );
    });
  });
});
