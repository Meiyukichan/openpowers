/**
 * @fileoverview Tests for claude-settings (Claude settings.json utility functions)
 * @author Meiyuki <meiyukichan@163.com>
 * @copyright 2026 Meiyuki
 */

import path from 'path';
import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';

// ---- mocks for claude-settings file I/O ----

const {
  readFileSyncMock,
  writeFileSyncMock,
  existsSyncMock,
  mkdirSyncMock,
  copyFileSyncMock,
} = vi.hoisted(() => ({
  readFileSyncMock: vi.fn(),
  writeFileSyncMock: vi.fn(),
  existsSyncMock: vi.fn(),
  mkdirSyncMock: vi.fn(),
  copyFileSyncMock: vi.fn(),
}));

vi.mock('fs', () => ({
  default: {
    readFileSync: readFileSyncMock,
    writeFileSync: writeFileSyncMock,
    existsSync: existsSyncMock,
    mkdirSync: mkdirSyncMock,
    copyFileSync: copyFileSyncMock,
  },
}));

const { homedirMock } = vi.hoisted(() => ({
  homedirMock: vi.fn(() => '/mock/home'),
}));

vi.mock('os', () => ({
  default: {
    homedir: homedirMock,
  },
}));

const { loggerMock } = vi.hoisted(() => ({
  loggerMock: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock('../utils/logger.js', () => ({
  logger: loggerMock,
}));

// ---- dynamic imports ----

type ClaudeSettingsModule = typeof import('./claude-settings.js');

let mod: ClaudeSettingsModule;

beforeAll(async () => {
  mod = await import('./claude-settings.js');
});

// ---- constants ----

const CLAUDE_DIR = path.join('/mock/home', '.claude');
const SETTINGS_FILE = path.join(CLAUDE_DIR, 'settings.json');
const FURINA_DIR = path.join('/mock/home', '.furina');
const BACKUP_FILE = path.join(FURINA_DIR, 'settings.bak.json');

// ---- helpers ----

function mockFileExists(filePath: string): void {
  existsSyncMock.mockImplementation((p: string) => p === filePath);
}

function mockFileNotExists(): void {
  existsSyncMock.mockReturnValue(false);
}

function mockReadFile(content: string): void {
  readFileSyncMock.mockReturnValue(content);
}

beforeEach(() => {
  vi.clearAllMocks();
  existsSyncMock.mockReturnValue(false);
});

// ---- readClaudeSettings ----

describe('readClaudeSettings', () => {
  it('should return parsed JSON when file exists', () => {
    mockFileExists(SETTINGS_FILE);
    mockReadFile(JSON.stringify({ env: { KEY: 'value' }, permissions: {} }));

    const result = mod.readClaudeSettings();

    expect(result).toEqual({ env: { KEY: 'value' }, permissions: {} });
  });

  it('should return empty object when file does not exist', () => {
    mockFileNotExists();

    const result = mod.readClaudeSettings();

    expect(result).toEqual({});
  });

  it('should return empty object and log warning when JSON is malformed', () => {
    mockFileExists(SETTINGS_FILE);
    mockReadFile('not-valid-json{{{');

    const result = mod.readClaudeSettings();

    expect(result).toEqual({});
    expect(loggerMock.warn).toHaveBeenCalledWith(
      expect.stringContaining('Invalid JSON'),
    );
  });

  it('should return empty object and log error when read fails with non-SyntaxError', () => {
    mockFileExists(SETTINGS_FILE);
    readFileSyncMock.mockImplementation(() => {
      throw new Error('EACCES: permission denied');
    });

    const result = mod.readClaudeSettings();

    expect(result).toEqual({});
    expect(loggerMock.error).toHaveBeenCalledWith(
      expect.stringContaining('Failed to read'),
    );
    expect(loggerMock.warn).not.toHaveBeenCalled();
  });
});

// ---- writeClaudeSettings ----

describe('writeClaudeSettings', () => {
  it('should create file and parent directories when they do not exist', () => {
    mockFileNotExists();
    const data = { env: { ANTHROPIC_BASE_URL: 'http://localhost:3939' } };

    mod.writeClaudeSettings(data);

    expect(mkdirSyncMock).toHaveBeenCalledWith(CLAUDE_DIR, { recursive: true });
    expect(writeFileSyncMock).toHaveBeenCalledTimes(1);
    const [filePath, content] = writeFileSyncMock.mock.calls[0];
    expect(filePath).toBe(SETTINGS_FILE);
    expect(JSON.parse(content)).toEqual(data);
    // Verify indent=2
    expect(content).toBe(JSON.stringify(data, null, 2));
  });

  it('should overwrite existing file with new JSON data', () => {
    mockFileExists(SETTINGS_FILE);
    const oldData = { env: { OLD_KEY: 'old' } };
    const newData = { env: { NEW_KEY: 'new' } };

    mod.writeClaudeSettings(newData);

    expect(writeFileSyncMock).toHaveBeenCalledTimes(1);
    const [filePath, content] = writeFileSyncMock.mock.calls[0];
    expect(filePath).toBe(SETTINGS_FILE);
    expect(JSON.parse(content)).toEqual(newData);
  });
});

// ---- backupClaudeSettings ----

describe('backupClaudeSettings', () => {
  it('should copy settings.json to backup file when source exists', () => {
    mockFileExists(SETTINGS_FILE);

    mod.backupClaudeSettings();

    expect(mkdirSyncMock).toHaveBeenCalledWith(FURINA_DIR, { recursive: true });
    expect(copyFileSyncMock).toHaveBeenCalledWith(SETTINGS_FILE, BACKUP_FILE);
  });

  it('should log warning and do nothing when source does not exist', () => {
    mockFileNotExists();

    mod.backupClaudeSettings();

    expect(copyFileSyncMock).not.toHaveBeenCalled();
    expect(loggerMock.warn).toHaveBeenCalledWith(
      expect.stringContaining('does not exist'),
    );
  });
});

// ---- restoreClaudeSettings ----

describe('restoreClaudeSettings', () => {
  it('should copy backup to settings.json and return true when backup exists', () => {
    mockFileExists(BACKUP_FILE);

    const result = mod.restoreClaudeSettings();

    expect(result).toBe(true);
    expect(mkdirSyncMock).toHaveBeenCalledWith(CLAUDE_DIR, { recursive: true });
    expect(copyFileSyncMock).toHaveBeenCalledWith(BACKUP_FILE, SETTINGS_FILE);
  });

  it('should return false and log warning when backup file does not exist', () => {
    mockFileNotExists();

    const result = mod.restoreClaudeSettings();

    expect(result).toBe(false);
    expect(copyFileSyncMock).not.toHaveBeenCalled();
    expect(loggerMock.warn).toHaveBeenCalledWith(
      expect.stringContaining('not found'),
    );
  });
});

// ---- getProxyEnv ----

describe('getProxyEnv', () => {
  it('should return fixed proxy env with all required fields', () => {
    const result = mod.getProxyEnv();

    expect(result).toEqual({
      ANTHROPIC_BASE_URL: 'http://localhost:3939',
      ANTHROPIC_AUTH_TOKEN: 'sk-1234',
      CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1',
      DISABLE_ERROR_REPORTING: '1',
      DISABLE_NON_ESSENTIAL_MODEL_CALLS: '1',
      DISABLE_TELEMETRY: '1',
      NO_PROXY: 'localhost',
    });
  });
});

// ---- getProviderEnv ----

describe('getProviderEnv', () => {
  it('should return env with all model fields populated from provider', () => {
    const provider = {
      baseUrl: 'https://api.example.com',
      apiKey: 'sk-test-key',
      defaultModel: 'default-model-id',
      sonnetModel: 'sonnet-model-id',
      opusModel: 'opus-model-id',
      haikuModel: 'haiku-model-id',
    };

    const result = mod.getProviderEnv(provider);

    expect(result).toEqual({
      ANTHROPIC_BASE_URL: 'https://api.example.com',
      ANTHROPIC_AUTH_TOKEN: 'sk-test-key',
      ANTHROPIC_MODEL: 'default-model-id',
      ANTHROPIC_DEFAULT_HAIKU_MODEL: 'haiku-model-id',
      ANTHROPIC_DEFAULT_SONNET_MODEL: 'sonnet-model-id',
      ANTHROPIC_DEFAULT_OPUS_MODEL: 'opus-model-id',
      CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1',
      DISABLE_ERROR_REPORTING: '1',
      DISABLE_NON_ESSENTIAL_MODEL_CALLS: '1',
      DISABLE_TELEMETRY: '1',
      NO_PROXY: 'localhost',
    });
  });

  it('should produce empty string values for empty model fields', () => {
    const provider = {
      baseUrl: 'https://api.example.com',
      apiKey: 'sk-test-key',
      defaultModel: '',
      sonnetModel: '',
      opusModel: '',
      haikuModel: '',
    };

    const result = mod.getProviderEnv(provider);

    expect(result.ANTHROPIC_MODEL).toBe('');
    expect(result.ANTHROPIC_DEFAULT_HAIKU_MODEL).toBe('');
    expect(result.ANTHROPIC_DEFAULT_SONNET_MODEL).toBe('');
    expect(result.ANTHROPIC_DEFAULT_OPUS_MODEL).toBe('');
    // Telemetry flags should still be present
    expect(result.CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC).toBe('1');
    expect(result.DISABLE_TELEMETRY).toBe('1');
  });

  it('should set env fields from baseUrl and apiKey', () => {
    const provider = {
      baseUrl: 'https://custom.api.com/v1',
      apiKey: 'sk-custom-key',
      defaultModel: 'dm',
      sonnetModel: 'sm',
      opusModel: 'om',
      haikuModel: 'hm',
    };

    const result = mod.getProviderEnv(provider);

    expect(result.ANTHROPIC_BASE_URL).toBe('https://custom.api.com/v1');
    expect(result.ANTHROPIC_AUTH_TOKEN).toBe('sk-custom-key');
  });
});

// ---- writeEnvToClaudeSettings ----

describe('writeEnvToClaudeSettings', () => {
  it('should replace only env key and preserve other top-level keys', () => {
    mockFileExists(SETTINGS_FILE);
    mockReadFile(JSON.stringify({
      permissions: { allow: ['npm'] },
      env: { OLD_VAR: 'old' },
      hooks: { PostToolUse: [] },
    }));
    const newEnv = { ANTHROPIC_BASE_URL: 'http://localhost:3939' };

    mod.writeEnvToClaudeSettings(newEnv);

    expect(writeFileSyncMock).toHaveBeenCalledTimes(1);
    const [, content] = writeFileSyncMock.mock.calls[0];
    const written = JSON.parse(content);
    expect(written.env).toEqual(newEnv);
    expect(written.permissions).toEqual({ allow: ['npm'] });
    expect(written.hooks).toEqual({ PostToolUse: [] });
  });

  it('should create new file with only env key when settings.json does not exist', () => {
    mockFileNotExists();
    const newEnv = { ANTHROPIC_BASE_URL: 'http://localhost:3939' };

    mod.writeEnvToClaudeSettings(newEnv);

    expect(writeFileSyncMock).toHaveBeenCalledTimes(1);
    const [, content] = writeFileSyncMock.mock.calls[0];
    const written = JSON.parse(content);
    expect(written).toEqual({ env: newEnv });
    expect(written.permissions).toBeUndefined();
  });

  it('should handle empty settings file as empty object', () => {
    mockFileExists(SETTINGS_FILE);
    mockReadFile(JSON.stringify({}));
    const newEnv = { ANTHROPIC_BASE_URL: 'http://localhost:3939' };

    mod.writeEnvToClaudeSettings(newEnv);

    const [, content] = writeFileSyncMock.mock.calls[0];
    const written = JSON.parse(content);
    expect(written.env).toEqual(newEnv);
  });
});
