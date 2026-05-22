/**
 * @fileoverview Tests for session settings read/write utilities
 * @author Meiyuki <meiyukichan@163.com>
 * @copyright 2026 Meiyuki
 */

import path from 'path';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SessionSettings } from './session.js';

// ---- mocks for session file I/O ----

const { existsSyncMock, mkdirSyncMock, readFileSyncMock, writeFileSyncMock } = vi.hoisted(() => ({
  existsSyncMock: vi.fn(),
  mkdirSyncMock: vi.fn(),
  readFileSyncMock: vi.fn(),
  writeFileSyncMock: vi.fn(),
}));

vi.mock('fs', () => ({
  default: {
    existsSync: existsSyncMock,
    mkdirSync: mkdirSyncMock,
    readFileSync: readFileSyncMock,
    writeFileSync: writeFileSyncMock,
  },
}));

const mockHomeDir = '/mock/home/user';

vi.mock('os', () => ({
  default: {
    homedir: vi.fn(() => mockHomeDir),
  },
}));

// ---- test data ----

const sampleSettings: SessionSettings = {
  sessionId: 'test-session-001',
  cwd: '/mock/project',
  currentProvider: 'mimo',
  switchProviders: {
    explore: 'minimax',
    plan: 'glm',
    review: 'deepseek',
    coding: 'minimax',
    finalize: 'deepseek',
  },
};

// ---- describe blocks ----

describe('getSessionFilePath', () => {
  let getSessionFilePath: (sessionId: string) => string;

  beforeAll(async () => {
    const mod = await import('./session.js');
    getSessionFilePath = mod.getSessionFilePath;
  });

  it('should return the correct cross-platform path for a given session id', () => {
    const result = getSessionFilePath('test-session-001');
    const expected = path.join(mockHomeDir, '.openpowers', 'sessions', 'test-session-001', 'settings.json');
    expect(result).toBe(expected);
  });
});

describe('readSessionSettings', () => {
  let readSessionSettings: (sessionId: string) => SessionSettings | null;

  beforeAll(async () => {
    const mod = await import('./session.js');
    readSessionSettings = mod.readSessionSettings;
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return null when the settings file does not exist', () => {
    existsSyncMock.mockReturnValue(false);

    const result = readSessionSettings('nonexistent-session');

    expect(result).toBeNull();
    expect(existsSyncMock).toHaveBeenCalledTimes(1);
    // Should never attempt to read a non-existent file
    expect(readFileSyncMock).not.toHaveBeenCalled();
  });

  it('should return parsed SessionSettings object when the file exists', () => {
    existsSyncMock.mockReturnValue(true);
    readFileSyncMock.mockReturnValue(JSON.stringify(sampleSettings));

    const result = readSessionSettings('test-session-001');

    expect(result).toEqual(sampleSettings);
    expect(existsSyncMock).toHaveBeenCalledTimes(1);
    expect(readFileSyncMock).toHaveBeenCalledTimes(1);
  });
});

describe('writeSessionSettings', () => {
  let writeSessionSettings: (sessionId: string, settings: SessionSettings) => void;

  beforeAll(async () => {
    const mod = await import('./session.js');
    writeSessionSettings = mod.writeSessionSettings;
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should create the directory recursively and write the file when directory does not exist', () => {
    existsSyncMock.mockReturnValue(false);

    writeSessionSettings('test-session-001', sampleSettings);

    const expectedDir = path.join(mockHomeDir, '.openpowers', 'sessions', 'test-session-001');
    const expectedPath = path.join(expectedDir, 'settings.json');

    // Directory should be created recursively
    expect(mkdirSyncMock).toHaveBeenCalledWith(expectedDir, { recursive: true });
    // File should be written with formatted JSON (indent=2)
    expect(writeFileSyncMock).toHaveBeenCalledWith(
      expectedPath,
      JSON.stringify(sampleSettings, null, 2),
      'utf-8',
    );
  });

  it('should overwrite the file when it already exists', () => {
    existsSyncMock.mockReturnValue(true);

    writeSessionSettings('test-session-001', sampleSettings);

    const expectedDir = path.join(mockHomeDir, '.openpowers', 'sessions', 'test-session-001');
    const expectedPath = path.join(expectedDir, 'settings.json');

    // Directory already exists, so mkdirSync should NOT be called
    expect(mkdirSyncMock).not.toHaveBeenCalled();
    // File should be overwritten
    expect(writeFileSyncMock).toHaveBeenCalledWith(
      expectedPath,
      JSON.stringify(sampleSettings, null, 2),
      'utf-8',
    );
  });

  it('should write JSON with indent=2 formatting', () => {
    existsSyncMock.mockReturnValue(false);

    writeSessionSettings('test-session-001', sampleSettings);

    // Capture the written JSON string
    const writtenJson = writeFileSyncMock.mock.calls[0][1] as string;

    // Parse it back to verify it is valid JSON
    const parsed = JSON.parse(writtenJson);
    expect(parsed).toEqual(sampleSettings);

    // Verify indent=2 by checking the string contains 2-space indentation
    // The JSON.stringify with indent=2 should produce lines like '  "key"'
    const lines = writtenJson.split('\n');
    const indentedLines = lines.filter((line: string) => line.startsWith('  '));
    expect(indentedLines.length).toBeGreaterThan(0);
  });
});
