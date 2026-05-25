/**
 * @fileoverview Tests for openpowers_hooks.js hooks script
 * @author Meiyuki <meiyukichan@163.com>
 * @copyright 2026 Meiyuki
 */

import path from 'path';
import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';

const { execSyncMock } = vi.hoisted(() => ({
  execSyncMock: vi.fn(),
}));

const { existsSyncMock } = vi.hoisted(() => ({
  existsSyncMock: vi.fn(),
}));

const { mkdirSyncMock } = vi.hoisted(() => ({
  mkdirSyncMock: vi.fn(),
}));

const { appendFileSyncMock } = vi.hoisted(() => ({
  appendFileSyncMock: vi.fn(),
}));

const { readSyncMock } = vi.hoisted(() => ({
  readSyncMock: vi.fn(),
}));

const { homedirMock } = vi.hoisted(() => ({
  homedirMock: vi.fn(() => '/mock/home'),
}));

vi.mock('child_process', () => ({
  default: {
    execSync: execSyncMock,
  },
}));

vi.mock('fs', () => ({
  default: {
    existsSync: existsSyncMock,
    mkdirSync: mkdirSyncMock,
    appendFileSync: appendFileSyncMock,
    readSync: readSyncMock,
  },
}));

vi.mock('os', () => ({
  default: {
    homedir: homedirMock,
  },
}));

// Re-import to get fresh module after mocks
const hooksModule = await import('./openpowers_hooks.js');

const {
  parseStdin,
  validateBeforeAgent,
  validateAfterAgent,
  buildBeforeAgentCommand,
  buildAfterAgentCommand,
  executeCommand,
  writeLog,
  main,
} = hooksModule;

// Save original process.argv for restoration
const originalArgv = [...process.argv];

describe('parseStdin', () => {
  it('should extract session_id, purpose, and cwd from valid JSON', () => {
    const input = JSON.stringify({
      session_id: 'abc-123-def',
      cwd: '/home/user/project',
      tool_input: {
        'OpenPowers:explore:Purpose': 'explore task',
      },
    });

    const result = parseStdin(input);

    expect(result.sessionId).toBe('abc-123-def');
    expect(result.purpose).toBe('explore');
    expect(result.cwd).toBe('/home/user/project');
  });

  it('should extract purpose from deeply nested OpenPowers key', () => {
    const input = JSON.stringify({
      session_id: 'xyz-789',
      cwd: '/tmp/test',
      nested: {
        deep: {
          'OpenPowers:plan:Purpose': 'plan task',
        },
      },
    });

    const result = parseStdin(input);

    expect(result.sessionId).toBe('xyz-789');
    expect(result.purpose).toBe('plan');
    expect(result.cwd).toBe('/tmp/test');
  });

  it('should return undefined for missing session_id', () => {
    const input = JSON.stringify({
      cwd: '/tmp/test',
    });

    const result = parseStdin(input);

    expect(result.sessionId).toBeUndefined();
  });

  it('should return undefined for missing cwd', () => {
    const input = JSON.stringify({
      session_id: 'abc-123',
    });

    const result = parseStdin(input);

    expect(result.cwd).toBeUndefined();
  });

  it('should return undefined for purpose when no OpenPowers key exists', () => {
    const input = JSON.stringify({
      session_id: 'abc-123',
      cwd: '/tmp/test',
    });

    const result = parseStdin(input);

    expect(result.purpose).toBeUndefined();
  });

  it('should return undefined fields for empty input', () => {
    const result = parseStdin('');

    expect(result.sessionId).toBeUndefined();
    expect(result.purpose).toBeUndefined();
    expect(result.cwd).toBeUndefined();
  });

  it('should handle whitespace-only input gracefully', () => {
    const result = parseStdin('   ');

    expect(result.sessionId).toBeUndefined();
    expect(result.purpose).toBeUndefined();
    expect(result.cwd).toBeUndefined();
  });

  it('should normalize purpose to lowercase', () => {
    const input = JSON.stringify({
      session_id: 'abc-123',
      cwd: '/tmp/test',
      'OpenPowers:EXPLORE:Purpose': 'value',
    });

    const result = parseStdin(input);

    expect(result.purpose).toBe('explore');
  });

  it('should return undefined fields for invalid JSON input', () => {
    const result = parseStdin('{invalid json}');

    expect(result.sessionId).toBeUndefined();
    expect(result.purpose).toBeUndefined();
    expect(result.cwd).toBeUndefined();
  });
});

describe('validateBeforeAgent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return null when all fields are valid and cwd exists', () => {
    existsSyncMock.mockReturnValue(true);

    const result = validateBeforeAgent({
      sessionId: 'abc-123',
      purpose: 'explore',
      cwd: '/valid/path',
    });

    expect(result).toBeNull();
  });

  it('should return error when session_id is missing', () => {
    existsSyncMock.mockReturnValue(true);

    const result = validateBeforeAgent({
      sessionId: undefined,
      purpose: 'explore',
      cwd: '/valid/path',
    });

    expect(result).toContain('session_id');
  });

  it('should return error when purpose is missing', () => {
    existsSyncMock.mockReturnValue(true);

    const result = validateBeforeAgent({
      sessionId: 'abc-123',
      purpose: undefined,
      cwd: '/valid/path',
    });

    expect(result).toContain('purpose');
  });

  it('should return error when cwd is missing', () => {
    const result = validateBeforeAgent({
      sessionId: 'abc-123',
      purpose: 'explore',
      cwd: undefined,
    });

    expect(result).toContain('cwd');
  });

  it('should return error when cwd path does not exist', () => {
    existsSyncMock.mockReturnValue(false);

    const result = validateBeforeAgent({
      sessionId: 'abc-123',
      purpose: 'explore',
      cwd: '/nonexistent/path',
    });

    expect(result).toContain('does not exist');
    expect(existsSyncMock).toHaveBeenCalledWith('/nonexistent/path');
  });
});

describe('validateAfterAgent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return null when session_id and cwd are valid', () => {
    existsSyncMock.mockReturnValue(true);

    const result = validateAfterAgent({
      sessionId: 'abc-123',
      cwd: '/valid/path',
    });

    expect(result).toBeNull();
  });

  it('should return error when session_id is missing', () => {
    existsSyncMock.mockReturnValue(true);

    const result = validateAfterAgent({
      sessionId: undefined,
      cwd: '/valid/path',
    });

    expect(result).toContain('session_id');
  });

  it('should return error when cwd is missing', () => {
    const result = validateAfterAgent({
      sessionId: 'abc-123',
      cwd: undefined,
    });

    expect(result).toContain('cwd');
  });

  it('should return error when cwd path does not exist', () => {
    existsSyncMock.mockReturnValue(false);

    const result = validateAfterAgent({
      sessionId: 'abc-123',
      cwd: '/nonexistent/path',
    });

    expect(result).toContain('does not exist');
  });

  it('should not require purpose field', () => {
    existsSyncMock.mockReturnValue(true);

    const result = validateAfterAgent({
      sessionId: 'abc-123',
      purpose: undefined,
      cwd: '/valid/path',
    });

    expect(result).toBeNull();
  });
});

describe('buildBeforeAgentCommand', () => {
  it('should build correct command for --before-agent mode', () => {
    const result = buildBeforeAgentCommand('session-001', 'explore');

    expect(result).toEqual(['openpowers', 'agents', 'switch', 'explore', '--session', 'session-001']);
  });

  it('should handle different purpose values', () => {
    const result = buildBeforeAgentCommand('abc-456', 'plan');

    expect(result).toEqual(['openpowers', 'agents', 'switch', 'plan', '--session', 'abc-456']);
  });
});

describe('buildAfterAgentCommand', () => {
  it('should build correct command with workflow for --after-agent mode', () => {
    const result = buildAfterAgentCommand('session-002');

    expect(result).toEqual(['openpowers', 'agents', 'switch', 'workflow', '--session', 'session-002']);
  });
});

describe('executeCommand', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should execute command with given cwd', () => {
    execSyncMock.mockReturnValue('output');

    const command = ['openpowers', 'agents', 'switch', 'explore', '--session', 'abc'];
    executeCommand(command, '/some/cwd');

    expect(execSyncMock).toHaveBeenCalledTimes(1);
    const callArgs = execSyncMock.mock.calls[0];
    expect(callArgs[0]).toContain('openpowers');
    expect(callArgs[0]).toContain('switch');
    expect(callArgs[1]).toMatchObject({ cwd: '/some/cwd' });
  });

  it('should handle execSync errors and log to stderr', () => {
    execSyncMock.mockImplementation(() => {
      throw new Error('command failed');
    });
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

    expect(() => {
      executeCommand(['openpowers', 'agents', 'switch', 'workflow', '--session', 'abc'], '/cwd');
    }).not.toThrow();

    expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining('Hook command failed'));

    stderrSpy.mockRestore();
  });
});

describe('writeLog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    homedirMock.mockReturnValue('/mock/home');
  });

  it('should create log directory if it does not exist', () => {
    existsSyncMock.mockReturnValue(false);

    writeLog('test-session', 'Test log message');

    expect(mkdirSyncMock).toHaveBeenCalledWith(
      path.join('/mock/home', '.openpowers', 'logs'),
      { recursive: true },
    );
  });

  it('should not create log directory if it already exists', () => {
    existsSyncMock.mockReturnValue(true);

    writeLog('test-session', 'Test log message');

    expect(mkdirSyncMock).not.toHaveBeenCalled();
  });

  it('should append log line to the correct file with session ID', () => {
    existsSyncMock.mockReturnValue(true);

    writeLog('my-session-123', 'Accepted hook request');

    const logFile = path.join('/mock/home', '.openpowers', 'logs', 'hooks-my-session-123.log');
    expect(appendFileSyncMock).toHaveBeenCalledTimes(1);
    expect(appendFileSyncMock.mock.calls[0][0]).toBe(logFile);
    expect(appendFileSyncMock.mock.calls[0][1]).toContain('Accepted hook request');
    expect(appendFileSyncMock.mock.calls[0][2]).toBe('utf-8');
  });

  it('should handle errors gracefully when fs operations fail', () => {
    existsSyncMock.mockImplementation(() => {
      throw new Error('Permission denied');
    });

    expect(() => {
      writeLog('test-session', 'Test log message');
    }).not.toThrow();
  });
});

describe('main', () => {
  let stderrSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    process.exitCode = undefined;
    process.argv = ['node', '/fake/path/script.js'];
    stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    existsSyncMock.mockReturnValue(true);
    homedirMock.mockReturnValue('/mock/home');
  });

  afterAll(() => {
    process.argv = originalArgv;
  });

  /**
   * Helper to set up readSync mock with given JSON input
   */
  function mockStdin(jsonData: string) {
    const data = Buffer.from(jsonData);
    readSyncMock
      .mockImplementationOnce((_fd: number, buffer: Buffer) => {
        data.copy(buffer);
        return data.length;
      })
      .mockReturnValue(0);
  }

  it('should print usage and exit with code 1 when no mode flag is provided', () => {
    process.argv = ['node', '/fake/path/script.js'];

    main();

    expect(stderrSpy).toHaveBeenCalledWith(
      expect.stringContaining('Usage: node openpowers_hooks.js --before-agent|--after-agent'),
    );
    expect(process.exitCode).toBe(1);
  });

  it('should handle --before-agent with valid stdin and execute the switch command', () => {
    process.argv = ['node', '/fake/path/script.js', '--before-agent'];
    const stdinJson = JSON.stringify({
      session_id: 'abc-123-def',
      cwd: '/home/user/project',
      tool_input: {
        'OpenPowers:explore:Purpose': 'explore task',
      },
    });
    mockStdin(stdinJson);
    execSyncMock.mockReturnValue('output');

    main();

    expect(execSyncMock).toHaveBeenCalledTimes(1);
    const execCallArg = execSyncMock.mock.calls[0][0];
    expect(execCallArg).toContain('openpowers');
    expect(execCallArg).toContain('explore');
    expect(execCallArg).toContain('--session');
    expect(execCallArg).toContain('abc-123-def');
    expect(process.exitCode).toBeUndefined();
  });

  it('should handle --after-agent with valid stdin and execute the workflow switch', () => {
    process.argv = ['node', '/fake/path/script.js', '--after-agent'];
    const stdinJson = JSON.stringify({
      session_id: 'xyz-789',
      cwd: '/tmp/test',
    });
    mockStdin(stdinJson);
    execSyncMock.mockReturnValue('output');

    main();

    expect(execSyncMock).toHaveBeenCalledTimes(1);
    const execCallArg = execSyncMock.mock.calls[0][0];
    expect(execCallArg).toContain('workflow');
    expect(execCallArg).toContain('--session');
    expect(execCallArg).toContain('xyz-789');
    expect(process.exitCode).toBeUndefined();
  });

  it('should exit with error when --before-agent input is missing session_id', () => {
    process.argv = ['node', '/fake/path/script.js', '--before-agent'];
    const stdinJson = JSON.stringify({
      cwd: '/home/user/project',
    });
    mockStdin(stdinJson);

    main();

    expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining('session_id'));
    expect(process.exitCode).toBe(1);
    expect(execSyncMock).not.toHaveBeenCalled();
  });

  it('should exit with error when --before-agent cwd does not exist', () => {
    process.argv = ['node', '/fake/path/script.js', '--before-agent'];
    const stdinJson = JSON.stringify({
      session_id: 'abc-123',
      cwd: '/nonexistent/path',
      tool_input: {
        'OpenPowers:explore:Purpose': 'explore task',
      },
    });
    mockStdin(stdinJson);
    existsSyncMock.mockReturnValue(false);

    main();

    expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining('does not exist'));
    expect(process.exitCode).toBe(1);
    expect(execSyncMock).not.toHaveBeenCalled();
  });

  it('should write log entries for before-agent on success', () => {
    process.argv = ['node', '/fake/path/script.js', '--before-agent'];
    const stdinJson = JSON.stringify({
      session_id: 'log-test-1',
      cwd: '/test/cwd',
      tool_input: {
        'OpenPowers:plan:Purpose': 'plan task',
      },
    });
    mockStdin(stdinJson);
    execSyncMock.mockReturnValue('output');

    main();

    // writeLog should have been called 4 times (3 info + 1 result)
    expect(appendFileSyncMock).toHaveBeenCalledTimes(4);
    const logFile = path.join('/mock/home', '.openpowers', 'logs', 'hooks-log-test-1.log');
    for (const call of appendFileSyncMock.mock.calls) {
      expect(call[0]).toBe(logFile);
    }
  });

  it('should handle stdin read failure gracefully and produce validation error', () => {
    process.argv = ['node', '/fake/path/script.js', '--before-agent'];
    readSyncMock.mockImplementation(() => {
      throw new Error('EBADF: bad file descriptor');
    });

    main();

    // stdin read failure results in empty rawInput, parseStdin returns all undefined,
    // validateBeforeAgent returns error about missing session_id
    expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining('session_id'));
    expect(process.exitCode).toBe(1);
  });

  it('should exit with error when --after-agent input is missing session_id', () => {
    process.argv = ['node', '/fake/path/script.js', '--after-agent'];
    const stdinJson = JSON.stringify({
      cwd: '/test/cwd',
    });
    mockStdin(stdinJson);

    main();

    expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining('session_id'));
    expect(process.exitCode).toBe(1);
  });
});
