/**
 * @fileoverview Tests for server entry point bootstrap
 * @author Meiyuki <meiyukichan@163.com>
 * @copyright 2026 Meiyuki
 */

import { describe, it, expect, vi, beforeEach, afterEach, beforeAll } from 'vitest';

// ---- mocks ----

const mockServerOn = vi.fn();
const mockServerClose = vi.fn();
const mockServerReturn = { on: mockServerOn, close: mockServerClose };
const mockListenFn = vi.fn().mockReturnValue(mockServerReturn);

const appPostMock = vi.fn();

const { createAppMock, proxyLoggerMock } = vi.hoisted(() => ({
  createAppMock: vi.fn(),
  proxyLoggerMock: { info: vi.fn(), end: vi.fn((cb: () => void) => cb()) },
}));

vi.mock('./index.js', () => ({
  createApp: createAppMock,
}));

vi.mock('./anthropic/logger.js', () => ({
  proxyLogger: proxyLoggerMock,
}));

const { startSchedulerMock, stopSchedulerMock } = vi.hoisted(() => ({
  startSchedulerMock: vi.fn(),
  stopSchedulerMock: vi.fn(),
}));

vi.mock('./memory/scheduler.js', () => ({
  startScheduler: startSchedulerMock,
  stopScheduler: stopSchedulerMock,
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

let exitSpy: ReturnType<typeof vi.spyOn>;

beforeAll(() => {
  exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {
    // no-op to prevent actual exit during tests
  }) as never);
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
  vi.resetModules();
  existsSyncMock.mockReturnValue(true);
  mockListenFn.mockReturnValue(mockServerReturn);
  appPostMock.mockReturnValue(undefined);
  createAppMock.mockImplementation((options?: { beforeProxy?: (app: unknown) => void }) => {
    const mockApp = { listen: mockListenFn, post: appPostMock };
    if (options?.beforeProxy) {
      options.beforeProxy(mockApp);
    }
    return mockApp;
  });
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

  it('should listen on port from FURINA_UI_PORT env', async () => {
    vi.stubEnv('FURINA_UI_PORT', '8080');
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

  it('should call startScheduler in the listen callback', async () => {
    await import('./entry.js');
    const listenCallback = mockListenFn.mock.calls[0][1] as () => void;
    expect(listenCallback).toBeDefined();
    // Simulate the listen callback being called after server starts
    listenCallback();
    expect(startSchedulerMock).toHaveBeenCalledTimes(1);
  });
});

describe('POST /furina/api/shutdown', () => {
  it('should register the shutdown endpoint on the app', async () => {
    await import('./entry.js');
    expect(appPostMock).toHaveBeenCalledWith('/furina/api/shutdown', expect.any(Function));
  });

  it('should respond with {ok: true} and then trigger server.close', async () => {
    await import('./entry.js');

    // Extract the registered route handler
    const handlerCall = appPostMock.mock.calls.find(
      (call: unknown[]) => call[0] === '/furina/api/shutdown',
    );
    const shutdownHandler = handlerCall?.[1] as (req: unknown, res: { json: ReturnType<typeof vi.fn> }) => void;
    const resJson = vi.fn();
    const mockRes = { json: resJson };

    // Call the shutdown handler
    shutdownHandler({}, mockRes);

    // Verify response sent immediately
    expect(resJson).toHaveBeenCalledWith({ ok: true });

    // Verify server.close was called (which calls process.exit(0) on success)
    expect(mockServerClose).toHaveBeenCalled();
    const closeCallback = mockServerClose.mock.calls[0][0] as ((err?: Error) => void) | undefined;
    if (closeCallback) {
      // Simulate successful close
      closeCallback();
      expect(exitSpy).toHaveBeenCalledWith(0);
    }
  });

  it('should call process.exit(1) when server.close fails', async () => {
    await import('./entry.js');

    const handlerCall = appPostMock.mock.calls.find(
      (call: unknown[]) => call[0] === '/furina/api/shutdown',
    );
    const shutdownHandler = handlerCall?.[1] as (req: unknown, res: { json: ReturnType<typeof vi.fn> }) => void;
    const resJson = vi.fn();
    const mockRes = { json: resJson };

    shutdownHandler({}, mockRes);

    const closeCallback = mockServerClose.mock.calls[0][0] as ((err?: Error) => void) | undefined;
    if (closeCallback) {
      closeCallback(new Error('close error'));
      expect(exitSpy).toHaveBeenCalledWith(1);
    }
  });

  it('should call stopScheduler before server.close on shutdown', async () => {
    await import('./entry.js');

    const handlerCall = appPostMock.mock.calls.find(
      (call: unknown[]) => call[0] === '/furina/api/shutdown',
    );
    const shutdownHandler = handlerCall?.[1] as (req: unknown, res: { json: ReturnType<typeof vi.fn> }) => void;
    const resJson = vi.fn();
    const mockRes = { json: resJson };

    // Track call order
    const order: string[] = [];
    stopSchedulerMock.mockImplementation(() => { order.push('stopScheduler'); });
    mockServerClose.mockImplementation((cb?: (err?: Error) => void) => {
      order.push('serverClose');
      if (cb) cb();
      return mockServerReturn;
    });

    shutdownHandler({}, mockRes);

    // stopScheduler must be called before server.close
    expect(order.indexOf('stopScheduler')).toBeLessThan(order.indexOf('serverClose'));
    expect(stopSchedulerMock).toHaveBeenCalledTimes(1);
  });
});
