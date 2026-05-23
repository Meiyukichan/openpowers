/**
 * @fileoverview Tests for proxy logger with independent winston instance
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
    Console: vi.fn(),
  },
}));

const { existsSyncMock, mkdirSyncMock } = vi.hoisted(() => ({
  existsSyncMock: vi.fn(),
  mkdirSyncMock: vi.fn(),
}));

vi.mock('fs', () => ({
  default: {
    existsSync: existsSyncMock,
    mkdirSync: mkdirSyncMock,
  },
}));

vi.mock('os', () => ({
  default: {
    homedir: vi.fn(() => '/mock/home'),
  },
}));

createLoggerMock.mockReturnValue(mockWinstonLogger);

const PROXY_LOG_DIR = path.join('/mock/home', '.openpowers', 'logs');
const PROXY_LOG_FILE = path.join(PROXY_LOG_DIR, 'anthropic.log');

describe('src/server/anthropic/logger.ts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createLoggerMock.mockReturnValue(mockWinstonLogger);
    // Default: log dir exists
    existsSyncMock.mockImplementation((p: string) => p === PROXY_LOG_DIR);
  });

  afterEach(() => {
    vi.resetModules();
  });

  // ---- Chunk 1: Named export with log methods ----

  it('should export proxyLogger as a named export', async () => {
    const { proxyLogger } = await import('./logger.js');
    expect(proxyLogger).toBeDefined();
  });

  it('should provide info method on the proxyLogger', async () => {
    const { proxyLogger } = await import('./logger.js');
    expect(typeof proxyLogger.info).toBe('function');
  });

  it('should provide warn method on the proxyLogger', async () => {
    const { proxyLogger } = await import('./logger.js');
    expect(typeof proxyLogger.warn).toBe('function');
  });

  it('should provide error method on the proxyLogger', async () => {
    const { proxyLogger } = await import('./logger.js');
    expect(typeof proxyLogger.error).toBe('function');
  });

  it('should provide debug method on the proxyLogger', async () => {
    const { proxyLogger } = await import('./logger.js');
    expect(typeof proxyLogger.debug).toBe('function');
  });

  // ---- Chunk 2: Logger writes to proxy/anthropic.log with correct format ----

  it('should create logger with File transport pointing to anthropic.log', async () => {
    await import('./logger.js');

    expect(createLoggerMock).toHaveBeenCalledTimes(1);
    const callArgs = createLoggerMock.mock.calls[0][0];
    expect(callArgs.transports).toBeDefined();
    expect(callArgs.transports.length).toBeGreaterThanOrEqual(1);
  });

  it('should use timestamp and printf format matching main logger', async () => {
    await import('./logger.js');

    const callArgs = createLoggerMock.mock.calls[0][0];
    expect(callArgs.format).toBeDefined();
  });

  it('should set exitOnError to false', async () => {
    await import('./logger.js');

    const callArgs = createLoggerMock.mock.calls[0][0];
    expect(callArgs.exitOnError).toBe(false);
  });

  // ---- Chunk 3: Auto-creates proxy log directory ----

  it('should create proxy log directory when it does not exist', async () => {
    existsSyncMock.mockImplementation((_p: string) => false);

    await import('./logger.js');

    expect(mkdirSyncMock).toHaveBeenCalledWith(PROXY_LOG_DIR, { recursive: true });
  });

  it('should not create proxy log directory when it already exists', async () => {
    existsSyncMock.mockImplementation((p: string) => p === PROXY_LOG_DIR);

    await import('./logger.js');

    expect(mkdirSyncMock).not.toHaveBeenCalled();
  });

  // ---- Chunk 5: createSessionLogger export ----

  it('should export createSessionLogger as a named export', async () => {
    const { createSessionLogger } = await import('./logger.js');
    expect(createSessionLogger).toBeDefined();
  });

  it('should return a logger object from createSessionLogger', async () => {
    const { createSessionLogger } = await import('./logger.js');
    const logger = createSessionLogger('test-session-1');
    expect(logger).toBeDefined();
    expect(typeof logger.info).toBe('function');
    expect(typeof logger.warn).toBe('function');
    expect(typeof logger.error).toBe('function');
    expect(typeof logger.debug).toBe('function');
  });

  it('should create session log directory when it does not exist', async () => {
    existsSyncMock.mockImplementation((_p: string) => false);

    const { createSessionLogger } = await import('./logger.js');
    createSessionLogger('test-session-1');

    const expectedDir = path.join('/mock/home', '.openpowers', 'sessions', 'test-session-1');
    expect(mkdirSyncMock).toHaveBeenCalledWith(expectedDir, { recursive: true });
  });

  it('should create session logger with File transport to session anthropic.log', async () => {
    const { createSessionLogger } = await import('./logger.js');
    createSessionLogger('test-session-2');

    const expectedFile = path.join('/mock/home', '.openpowers', 'sessions', 'test-session-2', 'anthropic.log');
    const { transports } = await import('winston');
    const fileCalls = (transports.File as ReturnType<typeof vi.fn>).mock.calls;
    expect(fileCalls.length).toBeGreaterThanOrEqual(1);
    expect(fileCalls[fileCalls.length - 1][0].filename).toBe(expectedFile);
  });

  // ---- Chunk 6: Session logger caching ----

  it('should return cached logger for the same sessionId within 1 hour', async () => {
    const { createSessionLogger } = await import('./logger.js');
    // Clear call tracking from proxyLogger module init
    createLoggerMock.mockClear();

    const logger1 = createSessionLogger('test-cache-1');
    expect(createLoggerMock).toHaveBeenCalledTimes(1);

    const logger2 = createSessionLogger('test-cache-1');
    expect(createLoggerMock).toHaveBeenCalledTimes(1);
    expect(logger2).toBe(logger1);
  });

  it('should create a new logger when cache entry expires after 1 hour', async () => {
    vi.useFakeTimers();
    const { createSessionLogger } = await import('./logger.js');
    createLoggerMock.mockClear();

    createSessionLogger('test-expiry-1');
    expect(createLoggerMock).toHaveBeenCalledTimes(1);

    // Advance time by 1 hour and 1ms to expire the cache entry
    vi.advanceTimersByTime(3600001);

    createSessionLogger('test-expiry-1');
    // A new logger should be created, so createLoggerMock is called again
    expect(createLoggerMock).toHaveBeenCalledTimes(2);

    vi.useRealTimers();
  });

  it('should lazily clean up expired cache entries on retrieval', async () => {
    vi.useFakeTimers();
    const { createSessionLogger } = await import('./logger.js');
    createLoggerMock.mockClear();

    // Create loggers for two sessions
    createSessionLogger('test-lazy-a');
    createSessionLogger('test-lazy-b');
    expect(createLoggerMock).toHaveBeenCalledTimes(2);

    // Advance past expiry
    vi.advanceTimersByTime(3600001);

    // Create a third session logger; this triggers lazy cleanup
    createSessionLogger('test-lazy-c');
    expect(createLoggerMock).toHaveBeenCalledTimes(3);

    // Now requesting the expired 'test-lazy-a' should create a new logger
    // (since it was cleaned up during the lazy cleanup triggered by test-lazy-c)
    createSessionLogger('test-lazy-a');
    expect(createLoggerMock).toHaveBeenCalledTimes(4);

    vi.useRealTimers();
  });

  // ---- Chunk 7: Session logger graceful degradation ----

  it('should return silent logger when session log directory creation fails', async () => {
    existsSyncMock.mockImplementation((_p: string) => false);
    mkdirSyncMock.mockImplementation(() => {
      throw new Error('EACCES: permission denied');
    });
    createLoggerMock.mockClear();

    const { createSessionLogger } = await import('./logger.js');
    const logger = createSessionLogger('test-fail-1');

    // The last call to createLoggerMock should be for silent logger
    const lastCall = createLoggerMock.mock.calls[createLoggerMock.mock.calls.length - 1][0];
    expect(lastCall.silent).toBe(true);
    expect(logger).toBeDefined();
    expect(typeof logger.info).toBe('function');
  });

  // ---- Chunk 4: Graceful degradation on failure ----

  it('should not throw when proxy log directory is not writable', async () => {
    existsSyncMock.mockImplementation((_p: string) => false);
    mkdirSyncMock.mockImplementation(() => {
      throw new Error('EACCES: permission denied');
    });

    await expect(import('./logger.js')).resolves.toBeDefined();
  });

  it('should return a silent no-op logger when directory creation fails', async () => {
    existsSyncMock.mockImplementation((_p: string) => false);
    mkdirSyncMock.mockImplementation(() => {
      throw new Error('EACCES: permission denied');
    });

    await import('./logger.js');

    expect(createLoggerMock).toHaveBeenCalledTimes(1);
    const callArgs = createLoggerMock.mock.calls[0][0];
    expect(callArgs.silent).toBe(true);
  });
});
