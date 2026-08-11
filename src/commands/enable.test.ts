/**
 * @fileoverview Tests for enable command module
 * @author Meiyuki <meiyukichan@163.com>
 * @copyright 2026 Meiyuki
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Command } from 'commander';

const {
  mockSetEnableFurinaProxy,
  mockIsPortInUse,
  mockStartBackendService,
  mockGetNeverClaudeSettings,
  mockSetNeverClaudeSettings,
} = vi.hoisted(() => ({
  mockSetEnableFurinaProxy: vi.fn(),
  mockIsPortInUse: vi.fn(),
  mockStartBackendService: vi.fn(),
  mockGetNeverClaudeSettings: vi.fn(),
  mockSetNeverClaudeSettings: vi.fn(),
}));

vi.mock('../server/providers-store.js', () => ({
  setEnableFurinaProxy: mockSetEnableFurinaProxy,
  getNeverClaudeSettings: mockGetNeverClaudeSettings,
  setNeverClaudeSettings: mockSetNeverClaudeSettings,
}));

vi.mock('../utils/port-manager.js', () => ({
  isPortInUse: mockIsPortInUse,
}));

vi.mock('../server/service-manager.js', () => ({
  startBackendService: mockStartBackendService,
  UI_PORT: 3939,
}));

// proxy env used by tests for verification
const MOCK_PROXY_ENV: Record<string, string> = {
  ANTHROPIC_BASE_URL: 'http://localhost:3939',
  ANTHROPIC_AUTH_TOKEN: 'sk-1234',
  CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1',
  DISABLE_ERROR_REPORTING: '1',
  DISABLE_NON_ESSENTIAL_MODEL_CALLS: '1',
  DISABLE_TELEMETRY: '1',
  NO_PROXY: 'localhost',
};

const {
  mockGetProxyEnv,
  mockWriteEnvToClaudeSettings,
  mockBackupClaudeSettings,
} = vi.hoisted(() => ({
  mockGetProxyEnv: vi.fn(() => ({ ...MOCK_PROXY_ENV })),
  mockWriteEnvToClaudeSettings: vi.fn(),
  mockBackupClaudeSettings: vi.fn(),
}));

vi.mock('../server/claude-settings.js', () => ({
  getProxyEnv: mockGetProxyEnv,
  writeEnvToClaudeSettings: mockWriteEnvToClaudeSettings,
  backupClaudeSettings: mockBackupClaudeSettings,
}));

type RunEnableFn = () => Promise<void>;
type RegisterEnableCmdFn = (program: Command) => void;

describe('src/commands/enable.ts', () => {
  let runEnable: RunEnableFn;
  let registerEnableCommand: RegisterEnableCmdFn;

  beforeEach(async () => {
    vi.clearAllMocks();

    mockIsPortInUse.mockReset();
    mockStartBackendService.mockReset();
    mockSetEnableFurinaProxy.mockReset();
    mockGetNeverClaudeSettings.mockReset();
    mockSetNeverClaudeSettings.mockReset();
    mockGetProxyEnv.mockReset();
    mockWriteEnvToClaudeSettings.mockReset();
    mockBackupClaudeSettings.mockReset();

    vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    vi.spyOn(process, 'exit').mockImplementation((() => {
      // do nothing, just record
    }) as never);

    // Default: service already running
    mockIsPortInUse.mockResolvedValue(true);
    mockStartBackendService.mockReturnValue('http://localhost:3939/furina/ui');
    // Default: neverClaudeSettings is true (first-time enable)
    mockGetNeverClaudeSettings.mockReturnValue(true);
    // getProxyEnv must return the env object
    mockGetProxyEnv.mockReturnValue({ ...MOCK_PROXY_ENV });

    const mod = await import('./enable.js');
    runEnable = mod.runEnable;
    registerEnableCommand = mod.registerEnableCommand;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('registerEnableCommand', () => {
    it('should export registerEnableCommand as a named function', () => {
      expect(registerEnableCommand).toBeDefined();
      expect(typeof registerEnableCommand).toBe('function');
    });

    it('should register enable command on the program', () => {
      const program = new Command();
      registerEnableCommand(program);
      const subcommands = program.commands.map((cmd) => cmd.name());
      expect(subcommands).toContain('enable');
    });
  });

  describe('runEnable', () => {
    describe('service already running', () => {
      it('should call setEnableFurinaProxy with true', async () => {
        await runEnable();
        expect(mockSetEnableFurinaProxy).toHaveBeenCalledWith(true);
        expect(mockSetEnableFurinaProxy).toHaveBeenCalledTimes(1);
      });

      it('should NOT call startBackendService', async () => {
        await runEnable();
        expect(mockStartBackendService).not.toHaveBeenCalled();
      });

      it('should output a success message', async () => {
        await runEnable();
        expect(process.stdout.write).toHaveBeenCalledWith(
          expect.stringContaining('enabled'),
        );
      });

      it('should not use console.log', async () => {
        const consoleLogSpy = vi.spyOn(console, 'log');
        await runEnable();
        expect(consoleLogSpy).not.toHaveBeenCalled();
        consoleLogSpy.mockRestore();
      });
    });

    describe('service not running, starts successfully', () => {
      beforeEach(() => {
        mockIsPortInUse.mockReset();
        mockIsPortInUse
          .mockResolvedValueOnce(false)  // service not running
          .mockResolvedValueOnce(true);  // started successfully
      });

      it('should call startBackendService then setEnableFurinaProxy', async () => {
        await runEnable();
        expect(mockStartBackendService).toHaveBeenCalledWith(3939);
        expect(mockSetEnableFurinaProxy).toHaveBeenCalledWith(true);
      });

      it('should check isPortInUse twice', async () => {
        await runEnable();
        expect(mockIsPortInUse).toHaveBeenCalledTimes(2);
      });
    });

    describe('service not running, fails to start', () => {
      beforeEach(() => {
        vi.useFakeTimers();
        mockIsPortInUse.mockReset();
        mockIsPortInUse.mockResolvedValue(false);  // never starts
      });

      afterEach(() => {
        vi.useRealTimers();
      });

      async function runAndDrainTimers(): Promise<void> {
        const promise = runEnable();
        await vi.advanceTimersByTimeAsync(10000);
        await promise.catch(() => { /* expected - process.exit throws */ });
      }

      it('should exit with code 1 after timeout', async () => {
        await expect(runAndDrainTimers()).resolves.toBeUndefined();
        expect(process.exit).toHaveBeenCalledWith(1);
      });

      it('should NOT call setEnableFurinaProxy', async () => {
        await runAndDrainTimers();
        expect(mockSetEnableFurinaProxy).not.toHaveBeenCalled();
      });

      it('should call startBackendService', async () => {
        await runAndDrainTimers();
        expect(mockStartBackendService).toHaveBeenCalledWith(3939);
      });

      it('should output error to stderr', async () => {
        const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
        await runAndDrainTimers();
        expect(stderrSpy).toHaveBeenCalled();
      });
    });

    describe('setEnableFurinaProxy throws', () => {
      beforeEach(() => {
        mockSetEnableFurinaProxy.mockImplementation(() => {
          throw new Error('disk full');
        });
      });

      it('should exit with code 1', async () => {
        await runEnable();
        expect(process.exit).toHaveBeenCalledWith(1);
      });

      it('should output error to stderr', async () => {
        const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
        try { await runEnable(); } catch { /* expected */ }
        expect(stderrSpy).toHaveBeenCalled();
      });
    });

    // ---- NEW: claude settings sync behavior ----

    describe('claude settings sync after enabling proxy', () => {
      it('should backup and clear neverClaudeSettings when flag is true (first write)', async () => {
        mockGetNeverClaudeSettings.mockReturnValue(true);

        await runEnable();

        expect(mockBackupClaudeSettings).toHaveBeenCalledTimes(1);
        expect(mockSetNeverClaudeSettings).toHaveBeenCalledWith(false);
      });

      it('should skip backup and setNeverClaudeSettings when flag is already false', async () => {
        mockGetNeverClaudeSettings.mockReturnValue(false);

        await runEnable();

        expect(mockBackupClaudeSettings).not.toHaveBeenCalled();
        expect(mockSetNeverClaudeSettings).not.toHaveBeenCalled();
      });

      it('should call writeEnvToClaudeSettings with proxy env after enabling', async () => {
        await runEnable();

        expect(mockWriteEnvToClaudeSettings).toHaveBeenCalledTimes(1);
        expect(mockWriteEnvToClaudeSettings).toHaveBeenCalledWith(MOCK_PROXY_ENV);
      });

      it('should still output success even if sync functions throw', async () => {
        mockBackupClaudeSettings.mockImplementation(() => {
          throw new Error('backup failed');
        });

        await runEnable();

        expect(process.stdout.write).toHaveBeenCalledWith(
          expect.stringContaining('enabled'),
        );
      });
    });
  });
});
