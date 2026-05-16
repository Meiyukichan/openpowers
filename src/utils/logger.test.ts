/**
 * @fileoverview Tests for shared logger utility with day-boundary rotation
 * @author Meiyuki <meiyukichan@163.com>
 * @copyright 2026 Meiyuki
 */

import path from 'path';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { mockWinstonLogger, createLoggerMock } = vi.hoisted(() => ({
  mockWinstonLogger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
  createLoggerMock: vi.fn(),
}));

vi.mock('winston', () => ({
  createLogger: createLoggerMock,
  format: {
    combine: vi.fn((...args: unknown[]) => args),
    timestamp: vi.fn(() => 'mocked-timestamp'),
    printf: vi.fn(() => 'mocked-printf'),
  },
  transports: {
    File: vi.fn(),
  },
}));

const { existsSyncMock, mkdirSyncMock, statSyncMock, renameSyncMock } = vi.hoisted(() => ({
  existsSyncMock: vi.fn(),
  mkdirSyncMock: vi.fn(),
  statSyncMock: vi.fn(),
  renameSyncMock: vi.fn(),
}));

vi.mock('fs', () => ({
  default: {
    existsSync: existsSyncMock,
    mkdirSync: mkdirSyncMock,
    statSync: statSyncMock,
    renameSync: renameSyncMock,
  },
}));

vi.mock('os', () => ({
  default: {
    homedir: vi.fn(() => '/mock/home'),
  },
}));

createLoggerMock.mockReturnValue(mockWinstonLogger);

const LOG_DIR = path.join('/mock/home', '.openpowers', 'logs');
const LOG_FILE = path.join(LOG_DIR, 'openpowers.log');

describe('src/utils/logger.ts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createLoggerMock.mockReturnValue(mockWinstonLogger);
    // Default: log dir exists, log file does not exist
    existsSyncMock.mockImplementation((p: string) => p === LOG_DIR);
    statSyncMock.mockReturnValue({ mtime: new Date() });
  });

  afterEach(() => {
    vi.resetModules();
  });

  // ---- Chunk 1: Named export with log methods ----

  it('should export logger as a named export', async () => {
    const { logger } = await import('./logger.js');
    expect(logger).toBeDefined();
  });

  it('should provide info method on the logger', async () => {
    const { logger } = await import('./logger.js');
    expect(typeof logger.info).toBe('function');
  });

  it('should provide warn method on the logger', async () => {
    const { logger } = await import('./logger.js');
    expect(typeof logger.warn).toBe('function');
  });

  it('should provide error method on the logger', async () => {
    const { logger } = await import('./logger.js');
    expect(typeof logger.error).toBe('function');
  });

  it('should provide debug method on the logger', async () => {
    const { logger } = await import('./logger.js');
    expect(typeof logger.debug).toBe('function');
  });

  // ---- Chunk 2: Logger writes to openpowers.log ----

  it('should create logger with File transport pointing to openpowers.log', async () => {
    await import('./logger.js');

    expect(createLoggerMock).toHaveBeenCalledTimes(1);
    const callArgs = createLoggerMock.mock.calls[0][0];
    expect(callArgs.transports).toBeDefined();
    expect(callArgs.transports.length).toBeGreaterThanOrEqual(1);
  });

  it('should use timestamp and printf format', async () => {
    await import('./logger.js');

    const callArgs = createLoggerMock.mock.calls[0][0];
    expect(callArgs.format).toBeDefined();
  });

  it('should set exitOnError to false', async () => {
    await import('./logger.js');

    const callArgs = createLoggerMock.mock.calls[0][0];
    expect(callArgs.exitOnError).toBe(false);
  });

  // ---- Chunk 3: Auto-creates log directory ----

  it('should create log directory when it does not exist', async () => {
    existsSyncMock.mockImplementation((p: string) => false);

    await import('./logger.js');

    const expectedDir = path.join('/mock/home', '.openpowers', 'logs');
    expect(mkdirSyncMock).toHaveBeenCalledWith(expectedDir, { recursive: true });
  });

  it('should not create log directory when it already exists', async () => {
    existsSyncMock.mockImplementation((p: string) => p === LOG_DIR);

    await import('./logger.js');

    expect(mkdirSyncMock).not.toHaveBeenCalled();
  });

  // ---- Chunk 4: Day-boundary log rotation ----

  it('should not rotate when openpowers.log does not exist', async () => {
    existsSyncMock.mockImplementation((p: string) => p === LOG_DIR);

    await import('./logger.js');

    expect(statSyncMock).not.toHaveBeenCalled();
    expect(renameSyncMock).not.toHaveBeenCalled();
  });

  it('should not rotate when openpowers.log is from today', async () => {
    existsSyncMock.mockImplementation((p: string) => p === LOG_DIR || p === LOG_FILE);
    statSyncMock.mockReturnValue({ mtime: new Date() });

    await import('./logger.js');

    expect(renameSyncMock).not.toHaveBeenCalled();
  });

  it('should rotate openpowers.log to dated archive when last modified on a previous day', async () => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const y = yesterday.getFullYear();
    const m = String(yesterday.getMonth() + 1).padStart(2, '0');
    const d = String(yesterday.getDate()).padStart(2, '0');
    const expectedArchive = path.join(LOG_DIR, `openpowers-${y}-${m}-${d}.log`);

    existsSyncMock.mockImplementation((p: string) => p === LOG_DIR || p === LOG_FILE);
    statSyncMock.mockReturnValue({ mtime: yesterday });

    await import('./logger.js');

    expect(renameSyncMock).toHaveBeenCalledWith(LOG_FILE, expectedArchive);
  });

  it('should not overwrite an existing archive when rotating', async () => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const y = yesterday.getFullYear();
    const m = String(yesterday.getMonth() + 1).padStart(2, '0');
    const d = String(yesterday.getDate()).padStart(2, '0');
    const archivePath = path.join(LOG_DIR, `openpowers-${y}-${m}-${d}.log`);

    // Both log file and archive already exist
    existsSyncMock.mockImplementation(
      (p: string) => p === LOG_DIR || p === LOG_FILE || p === archivePath,
    );
    statSyncMock.mockReturnValue({ mtime: yesterday });

    await import('./logger.js');

    expect(renameSyncMock).not.toHaveBeenCalled();
  });

  // ---- Chunk 5: Non-fatal on permission errors ----

  it('should not throw when log directory is not writable', async () => {
    existsSyncMock.mockImplementation((p: string) => false);
    mkdirSyncMock.mockImplementation(() => {
      throw new Error('EACCES: permission denied');
    });

    await expect(import('./logger.js')).resolves.toBeDefined();
  });

  it('should return a silent no-op logger when directory creation fails', async () => {
    existsSyncMock.mockImplementation((p: string) => false);
    mkdirSyncMock.mockImplementation(() => {
      throw new Error('EACCES: permission denied');
    });

    await import('./logger.js');

    expect(createLoggerMock).toHaveBeenCalledTimes(1);
    const callArgs = createLoggerMock.mock.calls[0][0];
    expect(callArgs.silent).toBe(true);
  });
});
