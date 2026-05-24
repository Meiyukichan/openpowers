/**
 * @fileoverview Tests for port-manager utility (isPortInUse, killPortProcess)
 * @author Meiyuki <meiyukichan@163.com>
 * @copyright 2026 Meiyuki
 */

import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';

// ---- mocks for Node.js built-in modules ----

const { netCreateServerMock, netServerListenMock, netServerOnMock, netServerCloseMock } = vi.hoisted(() => ({
  netCreateServerMock: vi.fn(),
  netServerListenMock: vi.fn(),
  netServerOnMock: vi.fn(),
  netServerCloseMock: vi.fn(),
}));

vi.mock('net', () => ({
  default: {
    createServer: netCreateServerMock,
  },
}));

const { execSyncMock } = vi.hoisted(() => ({
  execSyncMock: vi.fn(),
}));

vi.mock('child_process', () => ({
  execSync: execSyncMock,
}));

const { osPlatformMock } = vi.hoisted(() => ({
  osPlatformMock: vi.fn(),
}));

vi.mock('os', () => ({
  default: {
    platform: osPlatformMock,
  },
}));

const { loggerErrorMock, loggerWarnMock, loggerInfoMock } = vi.hoisted(() => ({
  loggerErrorMock: vi.fn(),
  loggerWarnMock: vi.fn(),
  loggerInfoMock: vi.fn(),
}));

vi.mock('./logger.js', () => ({
  logger: {
    error: loggerErrorMock,
    warn: loggerWarnMock,
    info: loggerInfoMock,
    debug: vi.fn(),
  },
}));

// ---- helper to create mock net.Server ----

function createMockServer() {
  return {
    listen: netServerListenMock,
    on: netServerOnMock,
    close: netServerCloseMock,
  };
}

// ---- describe blocks ----

describe('isPortInUse', () => {
  let isPortInUse: (port: number) => Promise<boolean>;

  beforeAll(async () => {
    isPortInUse = (await import('./port-manager.js')).isPortInUse;
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return false when port is free (server listens successfully)', async () => {
    // Arrange: server created, listen callback succeeds (no error) -> port free
    const mockServer = createMockServer();
    netCreateServerMock.mockReturnValue(mockServer);
    netServerListenMock.mockImplementation(
      (_port: number, cb: () => void) => {
        cb(); // listener callback fires -> port available
        return mockServer;
      },
    );
    netServerOnMock.mockImplementation(
      (_event: string, cb: (err: Error) => void) => {
        // store the error handler but don't call it
      },
    );

    // Act
    const result = await isPortInUse(3939);

    // Assert
    expect(result).toBe(false);
    expect(netServerCloseMock).toHaveBeenCalled();
    expect(netServerListenMock).toHaveBeenCalledWith(3939, expect.any(Function));
  });

  it('should return true when port is occupied (EADDRINUSE on error event)', async () => {
    // Arrange: server.listen is called, but 'error' event fires with EADDRINUSE
    const mockServer = createMockServer();
    const addrInUseErr = Object.assign(new Error('EADDRINUSE'), { code: 'EADDRINUSE' });

    netCreateServerMock.mockReturnValue(mockServer);
    // listen callback is NOT called when port is occupied in real Node.js
    netServerListenMock.mockImplementation(
      (_port: number, _cb: () => void) => {
        return mockServer;
      },
    );
    netServerOnMock.mockImplementation(
      (event: string, cb: (err: Error) => void) => {
        if (event === 'error') {
          cb(addrInUseErr);
        }
      },
    );

    // Act
    const result = await isPortInUse(3939);

    // Assert
    expect(result).toBe(true);
  });

  it('should return false on non-EADDRINUSE errors (e.g. EACCES)', async () => {
    // Arrange: non-EADDRINUSE error emitted (e.g. permission denied)
    const mockServer = createMockServer();
    const otherErr = Object.assign(new Error('EACCES'), { code: 'EACCES' });

    netCreateServerMock.mockReturnValue(mockServer);
    netServerListenMock.mockImplementation(
      (_port: number, _cb: () => void) => {
        return mockServer;
      },
    );
    netServerOnMock.mockImplementation(
      (event: string, cb: (err: Error) => void) => {
        if (event === 'error') {
          cb(otherErr);
        }
      },
    );

    // Act
    const result = await isPortInUse(3939);

    // Assert
    expect(result).toBe(false);
  });
});

describe('killPortProcess', () => {
  let killPortProcess: (port: number) => Promise<void>;

  beforeAll(async () => {
    killPortProcess = (await import('./port-manager.js')).killPortProcess;
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ---- Windows scenarios ----

  describe('on Windows', () => {
    beforeEach(() => {
      osPlatformMock.mockReturnValue('win32');
    });

    it('should call netstat to find PID and taskkill to terminate it', async () => {
      // Arrange: netstat returns a valid PID
      execSyncMock.mockReturnValueOnce('TCP    0.0.0.0:3939    0.0.0.0:0    LISTENING    45678');

      // Act
      await killPortProcess(3939);

      // Assert
      expect(execSyncMock).toHaveBeenCalledWith(
        'netstat -ano | findstr :3939',
        expect.objectContaining({ encoding: 'utf-8' }),
      );
      expect(execSyncMock).toHaveBeenCalledWith(
        'taskkill /PID 45678 /F',
        expect.any(Object),
      );
      expect(loggerInfoMock).toHaveBeenCalledWith(
        expect.stringContaining('45678'),
      );
    });

    it('should terminate multiple PIDs found on the port', async () => {
      // Arrange: netstat returns multiple PIDs listening on the same port
      execSyncMock.mockReturnValueOnce(
        'TCP    0.0.0.0:3939    0.0.0.0:0    LISTENING    11111\n' +
        'TCP    0.0.0.0:3939    0.0.0.0:0    LISTENING    22222\n' +
        'TCP    0.0.0.0:3939    0.0.0.0:0    LISTENING    33333',
      );

      // Act
      await killPortProcess(3939);

      // Assert
      expect(execSyncMock).toHaveBeenCalledWith(
        'taskkill /PID 11111 /F',
        expect.any(Object),
      );
      expect(execSyncMock).toHaveBeenCalledWith(
        'taskkill /PID 22222 /F',
        expect.any(Object),
      );
      expect(execSyncMock).toHaveBeenCalledWith(
        'taskkill /PID 33333 /F',
        expect.any(Object),
      );
    });

    it('should proceed without error when no process is found on the port', async () => {
      // Arrange: netstat returns empty/no PID
      execSyncMock.mockReturnValueOnce('');

      // Act & Assert: should not throw
      await expect(killPortProcess(3939)).resolves.toBeUndefined();
      expect(execSyncMock).toHaveBeenCalledTimes(1); // only netstat, no taskkill
    });

    it('should log permission errors and continue when taskkill fails', async () => {
      // Arrange: netstat finds PID, but taskkill throws with permission error
      execSyncMock.mockReturnValueOnce(
        'TCP    0.0.0.0:3939    0.0.0.0:0    LISTENING    45678',
      );
      execSyncMock.mockImplementationOnce(() => {
        throw new Error('Access is denied');
      });

      // Act & Assert: should not throw, should log the error
      await expect(killPortProcess(3939)).resolves.toBeUndefined();
      expect(loggerErrorMock).toHaveBeenCalledWith(
        expect.stringContaining('45678'),
      );
    });

    it('should handle mixed results: some PIDs killed successfully, others fail', async () => {
      // Arrange: two PIDs, one succeeds, one fails
      execSyncMock.mockReturnValueOnce(
        'TCP    0.0.0.0:3939    0.0.0.0:0    LISTENING    11111\n' +
        'TCP    0.0.0.0:3939    0.0.0.0:0    LISTENING    22222',
      );
      execSyncMock
        .mockImplementationOnce(() => {
          throw new Error('Access is denied');
        })
        .mockImplementationOnce(() => 'SUCCESS');

      // Act
      await killPortProcess(3939);

      // Assert: first PID failed and was logged, second succeeded
      expect(loggerErrorMock).toHaveBeenCalledTimes(1);
      expect(loggerErrorMock).toHaveBeenCalledWith(
        expect.stringContaining('11111'),
      );
      expect(execSyncMock).toHaveBeenCalledWith(
        'taskkill /PID 22222 /F',
        expect.any(Object),
      );
    });
  });

  // ---- Unix scenarios ----

  describe('on Unix (Linux)', () => {
    beforeEach(() => {
      osPlatformMock.mockReturnValue('linux');
    });

    it('should call lsof to find PID and kill -9 to terminate it', async () => {
      // Arrange: lsof returns a single PID
      execSyncMock.mockReturnValueOnce('12345\n');

      // Act
      await killPortProcess(3939);

      // Assert
      expect(execSyncMock).toHaveBeenCalledWith(
        'lsof -ti :3939',
        expect.objectContaining({ encoding: 'utf-8' }),
      );
      expect(execSyncMock).toHaveBeenCalledWith(
        'kill -9 12345',
        expect.any(Object),
      );
      expect(loggerInfoMock).toHaveBeenCalledWith(
        expect.stringContaining('12345'),
      );
    });

    it('should terminate multiple PIDs found on the port', async () => {
      // Arrange: lsof returns multiple PIDs
      execSyncMock.mockReturnValueOnce('11111\n22222\n33333\n');

      // Act
      await killPortProcess(3939);

      // Assert
      expect(execSyncMock).toHaveBeenCalledWith(
        'kill -9 11111',
        expect.any(Object),
      );
      expect(execSyncMock).toHaveBeenCalledWith(
        'kill -9 22222',
        expect.any(Object),
      );
      expect(execSyncMock).toHaveBeenCalledWith(
        'kill -9 33333',
        expect.any(Object),
      );
    });

    it('should proceed without error when no process is found on the port', async () => {
      // Arrange: lsof returns empty
      execSyncMock.mockReturnValueOnce('');

      // Act & Assert
      await expect(killPortProcess(3939)).resolves.toBeUndefined();
      expect(execSyncMock).toHaveBeenCalledTimes(1); // only lsof, no kill
    });

    it('should log permission errors and continue when kill fails', async () => {
      // Arrange: lsof finds PID, but kill throws with permission error
      execSyncMock.mockReturnValueOnce('45678\n');
      execSyncMock.mockImplementationOnce(() => {
        throw new Error('Operation not permitted');
      });

      // Act & Assert
      await expect(killPortProcess(3939)).resolves.toBeUndefined();
      expect(loggerErrorMock).toHaveBeenCalledWith(
        expect.stringContaining('45678'),
      );
    });
  });

  describe('on Unix (macOS)', () => {
    beforeEach(() => {
      osPlatformMock.mockReturnValue('darwin');
    });

    it('should call lsof and kill -9 on macOS', async () => {
      // Arrange
      execSyncMock.mockReturnValueOnce('78901\n');

      // Act
      await killPortProcess(3939);

      // Assert
      expect(execSyncMock).toHaveBeenCalledWith(
        'lsof -ti :3939',
        expect.objectContaining({ encoding: 'utf-8' }),
      );
      expect(execSyncMock).toHaveBeenCalledWith(
        'kill -9 78901',
        expect.any(Object),
      );
    });
  });
});

describe('waitForPortFree', () => {
  let waitForPortFree: (port: number, maxWaitMs?: number) => Promise<void>;

  beforeAll(async () => {
    waitForPortFree = (await import('./port-manager.js')).waitForPortFree;
  });

  beforeEach(() => {
    vi.clearAllMocks();
    osPlatformMock.mockReturnValue('win32');
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should resolve immediately when netstat returns empty (port free)', async () => {
    execSyncMock.mockReturnValueOnce('');

    await expect(waitForPortFree(3939, 2000)).resolves.toBeUndefined();
    expect(execSyncMock).toHaveBeenCalledWith(
      'netstat -ano | findstr :3939',
      expect.objectContaining({ encoding: 'utf-8' }),
    );
    expect(loggerInfoMock).toHaveBeenCalledWith(expect.stringContaining('Port 3939 is now free'));
  });

  it('should resolve immediately when netstat throws (no match = port free)', async () => {
    execSyncMock.mockImplementationOnce(() => {
      throw new Error('findstr: no match');
    });

    await expect(waitForPortFree(3939, 2000)).resolves.toBeUndefined();
    expect(loggerInfoMock).toHaveBeenCalledWith(expect.stringContaining('Port 3939 is now free'));
  });

  it('should poll until netstat returns empty', async () => {
    vi.useFakeTimers();
    // First two calls: port in use (netstat returns output)
    // Third call: port free (netstat returns empty)
    execSyncMock
      .mockReturnValueOnce('TCP    0.0.0.0:3939    0.0.0.0:0    TIME_WAIT    0')
      .mockReturnValueOnce('TCP    0.0.0.0:3939    0.0.0.0:0    TIME_WAIT    0')
      .mockReturnValueOnce('');

    const promise = waitForPortFree(3939, 2000);

    await vi.advanceTimersByTimeAsync(500);
    await vi.advanceTimersByTimeAsync(500);

    await expect(promise).resolves.toBeUndefined();
    expect(execSyncMock).toHaveBeenCalledTimes(3);
  });

  it('should throw error when port never frees within maxWaitMs', async () => {
    vi.useFakeTimers();
    // Always return occupied
    execSyncMock.mockReturnValue('TCP    0.0.0.0:3939    0.0.0.0:0    TIME_WAIT    0');

    const promise = waitForPortFree(3939, 1000);
    promise.catch(() => {});
    await vi.advanceTimersByTimeAsync(1000);

    await expect(promise).rejects.toThrow('Port 3939 is still occupied after 1000ms');
  });

  it('should use lsof on Linux', async () => {
    osPlatformMock.mockReturnValue('linux');
    execSyncMock.mockReturnValueOnce('');

    await waitForPortFree(3939, 2000);

    expect(execSyncMock).toHaveBeenCalledWith(
      'lsof -ti :3939',
      expect.objectContaining({ encoding: 'utf-8' }),
    );
  });
});
