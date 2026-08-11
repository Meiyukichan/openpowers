/**
 * @fileoverview Tests for service-manager module
 * @author Meiyuki <meiyukichan@163.com>
 * @copyright 2026 Meiyuki
 */

import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';

// ---- mocks ----

const { spawnMock, unrefMock, spawnPid } = vi.hoisted(() => {
  const unref = vi.fn();
  const pid = 98765;
  return {
    spawnMock: vi.fn<(_cmd: string, _args: string[], _opts: Record<string, unknown>) => ({ unref: () => void, pid: number })>(() => ({ unref, pid })),
    unrefMock: unref,
    spawnPid: pid,
  };
});

vi.mock('child_process', () => ({
  spawn: spawnMock,
}));

const { existsSyncMock, writeFileSyncMock, mkdirSyncMock } = vi.hoisted(() => ({
  existsSyncMock: vi.fn(),
  writeFileSyncMock: vi.fn(),
  mkdirSyncMock: vi.fn(),
}));

vi.mock('fs', () => ({
  default: {
    existsSync: existsSyncMock,
    writeFileSync: writeFileSyncMock,
    mkdirSync: mkdirSyncMock,
  },
}));

vi.mock('os', () => ({
  default: {
    homedir: () => 'C:\\Users\\test',
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

// ---- helpers ----

type ServiceManagerModule = typeof import('./service-manager.js');

let startBackendService: ServiceManagerModule['startBackendService'];
let UI_PORT: ServiceManagerModule['UI_PORT'];

beforeAll(async () => {
  const mod = await import('./service-manager.js');
  startBackendService = mod.startBackendService;
  UI_PORT = mod.UI_PORT;
});

beforeEach(() => {
  vi.clearAllMocks();
  existsSyncMock.mockReturnValue(true);
});

// ---- test suites ----

describe('UI_PORT', () => {
  it('should be 3939', () => {
    expect(UI_PORT).toBe(3939);
  });
});

describe('startBackendService', () => {
  it('should be exported as a function', () => {
    expect(startBackendService).toBeDefined();
    expect(typeof startBackendService).toBe('function');
  });

  it('should spawn server on given port and return uiUrl', () => {
    const uiUrl = startBackendService(8080);

    expect(spawnMock).toHaveBeenCalled();
    const spawnArgs = (spawnMock as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as unknown[];
    expect(String(spawnArgs[1])).toContain('entry.js');
    const spawnOpts = spawnArgs[2] as { env: Record<string, string> };
    expect(spawnOpts.env.FURINA_UI_PORT).toBe('8080');
    expect(uiUrl).toBe('http://localhost:8080/furina/ui');
  });

  it('should warn when dist/client/ does not exist but still spawn and return uiUrl', () => {
    existsSyncMock.mockReturnValue(false);
    const stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

    const uiUrl = startBackendService(3939);

    // Should warn about missing client build
    expect(stdoutSpy).toHaveBeenCalledWith(
      expect.stringContaining('not been built'),
    );
    // Should still spawn the server
    expect(spawnMock).toHaveBeenCalled();
    // Should still return the URL
    expect(uiUrl).toBe('http://localhost:3939/furina/ui');

    stdoutSpy.mockRestore();
  });

  it('should not warn about missing build when dist/client/ exists', () => {
    existsSyncMock.mockReturnValue(true);
    const stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

    startBackendService(3939);

    const calls = stdoutSpy.mock.calls.flat();
    const buildWarning = calls.filter((c) => typeof c === 'string' && c.includes('not been built'));
    expect(buildWarning).toHaveLength(0);

    stdoutSpy.mockRestore();
  });
});

describe('spawnServer PID file', () => {
  it('should write child.pid to ~/.furina/.furina.pid on spawn', () => {
    startBackendService(3939);

    expect(writeFileSyncMock).toHaveBeenCalled();
    const filePath = writeFileSyncMock.mock.calls[0][0] as string;
    expect(filePath).toContain('.furina\\.furina.pid');

    const fileContent = writeFileSyncMock.mock.calls[0][1] as string;
    const parsed = JSON.parse(fileContent);
    expect(parsed.pid).toBe(spawnPid);
    expect(parsed.port).toBe(3939);
  });

  it('should overwrite PID file on re-spawn', () => {
    startBackendService(8080);
    startBackendService(9090);

    // Each spawn should write to the PID file
    expect(writeFileSyncMock).toHaveBeenCalledTimes(2);

    const secondContent = writeFileSyncMock.mock.calls[1][1] as string;
    const parsed = JSON.parse(secondContent);
    expect(parsed.pid).toBe(spawnPid);
    expect(parsed.port).toBe(9090);
  });
});
