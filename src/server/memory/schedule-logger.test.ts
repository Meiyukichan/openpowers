/**
 * @fileoverview Tests for schedule-logger module
 * @author Meiyuki <meiyukichan@163.com>
 * @copyright 2026 Meiyuki
 */

import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import path from 'path';

// ---- mocks ----

const mockHomedir = '/Users/test';

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
    homedir: () => mockHomedir,
  },
}));

// ---- helpers ----

type ScheduleLoggerModule = typeof import('./schedule-logger.js');

let appendLog: ScheduleLoggerModule['appendLog'];

beforeAll(async () => {
  const mod = await import('./schedule-logger.js');
  appendLog = mod.appendLog;
});

beforeEach(() => {
  vi.clearAllMocks();
  existsSyncMock.mockReturnValue(true);
});

// ---- test suites ----

describe('appendLog', () => {
  it('should export appendLog as a named function', () => {
    expect(appendLog).toBeDefined();
    expect(typeof appendLog).toBe('function');
  });

  it('should append a message to dreamwork.log with ISO timestamp format', () => {
    const testMessage = 'Scheduler started';

    appendLog(testMessage);

    expect(appendFileSyncMock).toHaveBeenCalledTimes(1);
    const callArgs = appendFileSyncMock.mock.calls[0];
    const filePath = callArgs[0] as string;
    const content = callArgs[1] as string;
    const encoding = callArgs[2] as string;

    expect(filePath).toContain('dreamwork.log');
    expect(filePath).toBe(path.join(mockHomedir, '.openpowers', 'memory', 'dreamwork.log'));
    expect(encoding).toBe('utf-8');

    // Verify ISO timestamp format: [YYYY-MM-DDTHH:mm:ss.sssZ]
    const timestampRegex = /^\[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z\] /;
    expect(content).toMatch(timestampRegex);

    // Verify message is appended after timestamp
    expect(content).toContain(testMessage);

    // Verify content ends with newline
    expect(content.endsWith('\n')).toBe(true);
  });

  it('should create the memory directory if it does not exist', () => {
    existsSyncMock.mockReturnValue(false);

    appendLog('test message');

    expect(mkdirSyncMock).toHaveBeenCalledTimes(1);
    const dirPath = mkdirSyncMock.mock.calls[0][0] as string;
    expect(dirPath).toBe(path.join(mockHomedir, '.openpowers', 'memory'));
    // Verify recursive option
    expect(mkdirSyncMock.mock.calls[0][1]).toEqual({ recursive: true });
  });

  it('should not create directory if it already exists', () => {
    existsSyncMock.mockReturnValue(true);

    appendLog('test message');

    expect(mkdirSyncMock).not.toHaveBeenCalled();
  });

  it('should append multiple messages (each on its own line)', () => {
    appendLog('first message');
    appendLog('second message');

    expect(appendFileSyncMock).toHaveBeenCalledTimes(2);

    // Verify each message has its own timestamp and newline
    const firstContent = appendFileSyncMock.mock.calls[0][1] as string;
    const secondContent = appendFileSyncMock.mock.calls[1][1] as string;

    const timestampRegex = /^\[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z\] /;
    expect(firstContent).toMatch(timestampRegex);
    expect(secondContent).toMatch(timestampRegex);
    expect(firstContent.endsWith('\n')).toBe(true);
    expect(secondContent.endsWith('\n')).toBe(true);
    expect(firstContent).toContain('first message');
    expect(secondContent).toContain('second message');
  });
});
