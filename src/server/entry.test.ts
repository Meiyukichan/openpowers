/**
 * @fileoverview Tests for server entry point bootstrap
 * @author Meiyuki <meiyukichan@163.com>
 * @copyright 2026 Meiyuki
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ---- mocks ----

const mockServerOn = vi.fn();
const mockServerReturn = { on: mockServerOn };
const mockListenFn = vi.fn().mockReturnValue(mockServerReturn);

const { createAppMock } = vi.hoisted(() => ({
  createAppMock: vi.fn(),
}));

vi.mock('./index.js', () => ({
  createApp: createAppMock,
}));

const { existsSyncMock, mkdirSyncMock, appendFileSyncMock } = vi.hoisted(() => ({
  existsSyncMock: vi.fn(),
  mkdirSyncMock: vi.fn(),
  appendFileSyncMock: vi.fn(),
}));

vi.mock('fs', () => ({
  default: {
    existsSync: existsSyncMock,
    mkdirSync: mkdirSyncMock,
    appendFileSync: appendFileSyncMock,
  },
}));

vi.mock('os', () => ({
  default: {
    homedir: () => 'C:\\Users\\test',
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
  vi.resetModules();
  existsSyncMock.mockReturnValue(true);
  mockListenFn.mockReturnValue(mockServerReturn);
  createAppMock.mockReturnValue({ listen: mockListenFn });
});

afterEach(() => {
  process.stdin.removeAllListeners();
  process.removeAllListeners('uncaughtException');
  process.removeAllListeners('unhandledRejection');
});

describe('server entry', () => {
  it('should create the Express app', async () => {
    await import('./entry.js');
    expect(createAppMock).toHaveBeenCalled();
  });

  it('should listen on port 3939 by default', async () => {
    await import('./entry.js');
    expect(mockListenFn).toHaveBeenCalledWith(3939, expect.any(Function));
  });

  it('should listen on port from OPENPOWERS_UI_PORT env', async () => {
    vi.stubEnv('OPENPOWERS_UI_PORT', '8080');
    await import('./entry.js');
    expect(mockListenFn).toHaveBeenCalledWith(8080, expect.any(Function));
  });

  it('should register server error handler', async () => {
    await import('./entry.js');
    expect(mockServerOn).toHaveBeenCalledWith('error', expect.any(Function));
  });

  it('should register uncaughtException handler', async () => {
    const onSpy = vi.spyOn(process, 'on');
    await import('./entry.js');
    expect(onSpy).toHaveBeenCalledWith('uncaughtException', expect.any(Function));
    onSpy.mockRestore();
  });

  it('should register unhandledRejection handler', async () => {
    const onSpy = vi.spyOn(process, 'on');
    await import('./entry.js');
    expect(onSpy).toHaveBeenCalledWith('unhandledRejection', expect.any(Function));
    onSpy.mockRestore();
  });

  it('should write server error to error.log', async () => {
    await import('./entry.js');
    const errorHandler = mockServerOn.mock.calls.find(([event]) => event === 'error')?.[1] as (err: Error) => void;
    errorHandler(new Error('EADDRINUSE'));
    expect(appendFileSyncMock).toHaveBeenCalledWith(
      expect.stringContaining('error.log'),
      expect.stringContaining('Server error: EADDRINUSE'),
      'utf-8',
    );
  });

  it('should create log directory if it does not exist', async () => {
    existsSyncMock.mockReturnValue(false);
    await import('./entry.js');
    const errorHandler = mockServerOn.mock.calls.find(([event]) => event === 'error')?.[1] as (err: Error) => void;
    errorHandler(new Error('test'));
    expect(mkdirSyncMock).toHaveBeenCalled();
  });
});
