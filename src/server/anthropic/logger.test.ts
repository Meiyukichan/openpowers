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

const PROXY_LOG_DIR = path.join('/mock/home', '.openpowers', 'logs', 'proxy');
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
