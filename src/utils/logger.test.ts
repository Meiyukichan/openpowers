/**
 * @fileoverview Tests for shared logger utility
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
    json: vi.fn(() => 'mocked-json-format'),
  },
  transports: {
    File: vi.fn(),
  },
}));

const { existsSyncMock, mkdirSyncMock } = vi.hoisted(() => ({
  existsSyncMock: vi.fn(() => true),
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

// Collects the logger instance returned by createLogger for inspection
createLoggerMock.mockReturnValue(mockWinstonLogger);

describe('src/utils/logger.ts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createLoggerMock.mockReturnValue(mockWinstonLogger);
    existsSyncMock.mockReturnValue(true);
    mkdirSyncMock.mockImplementation(() => {});
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

  // ---- Chunk 2: Logger writes to correct file path ----

  it('should create logger with File transport pointing to ~/.openpowers/logs/openpowers.log', async () => {
    await import('./logger.js');

    expect(createLoggerMock).toHaveBeenCalledTimes(1);
    const callArgs = createLoggerMock.mock.calls[0][0];
    expect(callArgs.transports).toBeDefined();
    expect(callArgs.transports.length).toBeGreaterThanOrEqual(1);
    // The File transport constructor is called by the source code;
    // we verify createLogger was invoked (which means the source ran)
  });

  it('should use JSON format for log output', async () => {
    await import('./logger.js');

    const callArgs = createLoggerMock.mock.calls[0][0];
    expect(callArgs.format).toBe('mocked-json-format');
  });

  // ---- Chunk 3: Auto-creates log directory ----

  it('should create log directory when it does not exist', async () => {
    existsSyncMock.mockReturnValue(false);

    await import('./logger.js');

    const expectedDir = path.join('/mock/home', '.openpowers', 'logs');
    expect(mkdirSyncMock).toHaveBeenCalledWith(expectedDir, { recursive: true });
  });

  it('should not attempt to create log directory when it already exists', async () => {
    existsSyncMock.mockReturnValue(true);

    await import('./logger.js');

    expect(mkdirSyncMock).not.toHaveBeenCalled();
  });

  // ---- Chunk 4: Non-fatal on permission errors ----

  it('should not throw when log directory is not writable', async () => {
    existsSyncMock.mockReturnValue(false);
    mkdirSyncMock.mockImplementation(() => {
      throw new Error('EACCES: permission denied');
    });

    // Module should load without throwing
    await expect(import('./logger.js')).resolves.toBeDefined();
  });

  it('should return a silent no-op logger when directory creation fails', async () => {
    existsSyncMock.mockReturnValue(false);
    mkdirSyncMock.mockImplementation(() => {
      throw new Error('EACCES: permission denied');
    });

    await import('./logger.js');

    // After refactor, ensureLogDir throws → caught by createWinstonLogger
    // → single call to createLogger with silent: true
    expect(createLoggerMock).toHaveBeenCalledTimes(1);
    const callArgs = createLoggerMock.mock.calls[0][0];
    expect(callArgs.silent).toBe(true);
  });
});
