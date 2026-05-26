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
  buildBeforeAgentCommand,
  buildInitCommand,
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

  it('should extract fields from malformed text with encoding prefix that JSON.parse would reject', () => {
    const input = '\uFEFF{"session_id":"abc-123","tool_input":{"OpenPowers:plan:Purpose":"task"},"cwd":"/tmp/path","trailing":"junk",more:broken}';

    const result = parseStdin(input);

    expect(result.sessionId).toBe('abc-123');
    expect(result.purpose).toBe('plan');
    expect(result.cwd).toBe('/tmp/path');
  });

  it('should extract fields even when input is not valid JSON at all', () => {
    const input = 'some_prefix "session_id" : "my-session-id", garbage text "cwd" : "/my/project/path" OpenPowers:coding:Purpose more_noise';

    const result = parseStdin(input);

    expect(result.sessionId).toBe('my-session-id');
    expect(result.purpose).toBe('coding');
    expect(result.cwd).toBe('/my/project/path');
  });

  // -----------------------------------------------------------------------
  // Encoding resilience tests — regex extraction must work regardless of
  // text encoding quirks, BOM, Chinese characters, escaped unicode, etc.
  // -----------------------------------------------------------------------

  it('should handle Chinese characters in cwd path', () => {
    const input = `{"session_id":"abc-123","cwd":"/home/用户/项目/我的代码","tool_input":{"OpenPowers:explore:Purpose":"探索任务"}}`;

    const result = parseStdin(input);

    expect(result.sessionId).toBe('abc-123');
    expect(result.purpose).toBe('explore');
    expect(result.cwd).toBe('/home/用户/项目/我的代码');
  });

  it('should handle Chinese characters in Windows-style cwd path', () => {
    const input = `{"session_id":"win-001","cwd":"C:\\\\Users\\\\小明\\\\Documents\\\\项目","tool_input":{"OpenPowers:Review:Purpose":"review"}}`;

    const result = parseStdin(input);

    expect(result.sessionId).toBe('win-001');
    expect(result.purpose).toBe('review');
    // Regex captures the literal JSON-escaped path between quotes
    expect(result.cwd).toBe('C:\\\\Users\\\\小明\\\\Documents\\\\项目');
  });

  it('should handle JSON-escaped unicode sequences (\\\\uXXXX)', () => {
    const input = `{"session_id":"u-001","cwd":"/tmp/uni","tool_input":{"OpenPowers:plan:Purpose":"\\u8ba1\\u5212\\u4efb\\u52a1"}}`;

    const result = parseStdin(input);

    expect(result.sessionId).toBe('u-001');
    expect(result.purpose).toBe('plan');
    // cwd pattern "([^"]+)" captures the literal \\uXXXX string as-is
    expect(result.cwd).toBe('/tmp/uni');
  });

  it('should handle UTF-8 BOM followed by Chinese content', () => {
    const input = '\uFEFF{"session_id":"bom-cn","cwd":"/数据/测试","tool_input":{"OpenPowers:propose:Purpose":"提案"}}';

    const result = parseStdin(input);

    expect(result.sessionId).toBe('bom-cn');
    expect(result.purpose).toBe('propose');
    expect(result.cwd).toBe('/数据/测试');
  });

  it('should handle raw bytes and non-printable characters around fields', () => {
    const input = '\x00\x01text before\x02"session_id"\t:\n"hex-001"\r\n\x03"cwd":\r"/path/with\\n/newline/value"some junk\x04OpenPowers:workflow:Purpose trailing \x05';

    const result = parseStdin(input);

    expect(result.sessionId).toBe('hex-001');
    expect(result.purpose).toBe('workflow');
    expect(result.cwd).toBe('/path/with\\n/newline/value');
  });

  it('should handle emoji and special Unicode characters in surrounding text', () => {
    const input = '🎉🚀{"session_id":"emoji-001","cwd":"/home/user/项目🔥","tool_input":{"OpenPowers:plan:Purpose":"📋plan"}}✨🎯';

    const result = parseStdin(input);

    expect(result.sessionId).toBe('emoji-001');
    expect(result.purpose).toBe('plan');
    expect(result.cwd).toBe('/home/user/项目🔥');
  });

  it('should handle mixed full-width and half-width characters', () => {
    const input = '（全角括号）{"session_id"： "full-001"，"cwd" ： "Ｄ：／ｐｒｏｊｅｃｔ／ｍｙｆｏｌｄｅｒ" OpenPowers：coding：Purpose';

    const result = parseStdin(input);

    // Full-width colon ： won't match the pattern : so session_id/cwd won't extract
    // But purpose pattern only looks for OpenPowers:word:Purpose in the text
    expect(result.sessionId).toBeUndefined();
    expect(result.purpose).toBeUndefined();
    expect(result.cwd).toBeUndefined();
  });

  it('should handle extremely long input with fields buried deep', () => {
    const noise = 'x'.repeat(10000);
    const input = `${noise}"session_id":"deep-999"${noise}"cwd":"/deep/path"${noise}OpenPowers:review:Purpose${noise}`;

    const result = parseStdin(input);

    expect(result.sessionId).toBe('deep-999');
    expect(result.purpose).toBe('review');
    expect(result.cwd).toBe('/deep/path');
  });

  it('should pick the FIRST match when multiple session_id fields exist', () => {
    const input = '{"session_id":"first-one","cwd":"/path1","tool_input":{"OpenPowers:explore:Purpose":"t1"},"other":{"session_id":"second-one","cwd":"/path2"}}';

    const result = parseStdin(input);

    // Regex is greedy-leftmost, first match wins
    expect(result.sessionId).toBe('first-one');
    expect(result.cwd).toBe('/path1');
    expect(result.purpose).toBe('explore');
  });

  it('should handle JSON.stringify output exactly as before (backward compat)', () => {
    const obj = {
      session_id: 'compat-test',
      cwd: '/home/user/project',
      tool_input: {
        'OpenPowers:plan:Purpose': 'plan task',
      },
    };
    const input = JSON.stringify(obj);

    const result = parseStdin(input);

    expect(result.sessionId).toBe('compat-test');
    expect(result.purpose).toBe('plan');
    expect(result.cwd).toBe('/home/user/project');
  });

  it('should handle spaces in cwd path (e.g. Windows paths with spaces)', () => {
    const input = `{"session_id":"spc-001","cwd":"C:\\\\Program Files\\\\My App\\\\data","tool_input":{"OpenPowers:finalize:Purpose":"done"}}`;

    const result = parseStdin(input);

    expect(result.sessionId).toBe('spc-001');
    expect(result.purpose).toBe('finalize');
    // Regex captures the literal JSON-escaped path between quotes
    expect(result.cwd).toBe('C:\\\\Program Files\\\\My App\\\\data');
  });

  it('should handle session_id with mixed case and return as-is', () => {
    const input = '{"session_id":"AbC-123-XyZ-456","cwd":"/tmp","OpenPowers:explore:Purpose":"x"}';

    const result = parseStdin(input);

    expect(result.sessionId).toBe('AbC-123-XyZ-456');
    expect(result.purpose).toBe('explore');
  });

  it('should handle cwd with special characters like - _ . in path', () => {
    const input = '{"session_id":"path-001","cwd":"/home/user/my-project_v2.0-beta/test_dir"}';

    const result = parseStdin(input);

    expect(result.sessionId).toBe('path-001');
    expect(result.cwd).toBe('/home/user/my-project_v2.0-beta/test_dir');
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

describe('buildInitCommand', () => {
  it('should build correct init command with session ID and cwd', () => {
    const result = buildInitCommand('session-003', '/test/cwd');

    expect(result).toEqual(['openpowers', 'agents', 'init', '--session', 'session-003', '--cwd', '/test/cwd']);
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

  it('should execute command and return result with stdout, stderr, status', () => {
    execSyncMock.mockReturnValue('switch successful\n');

    const command = ['openpowers', 'agents', 'switch', 'explore', '--session', 'abc'];
    const result = executeCommand(command, '/some/cwd');

    expect(execSyncMock).toHaveBeenCalledTimes(1);
    const callArgs = execSyncMock.mock.calls[0];
    expect(callArgs[0]).toContain('openpowers');
    expect(callArgs[0]).toContain('switch');
    expect(callArgs[1]).toMatchObject({ cwd: '/some/cwd' });
    expect(result).toEqual({ stdout: 'switch successful', stderr: '', status: 0 });
  });

  it('should trim trailing newlines from stdout', () => {
    execSyncMock.mockReturnValue('output with newlines\n\n\n');

    const result = executeCommand(['echo', 'test'], '/tmp');

    expect(result).toEqual({ stdout: 'output with newlines', stderr: '', status: 0 });
  });

  it('should handle execSync errors and return error result with stderr', () => {
    const execError = Object.assign(new Error('command failed'), {
      stdout: '',
      stderr: 'error output from stderr',
      status: 1,
    });
    execSyncMock.mockImplementation(() => {
      throw execError;
    });
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

    const result = executeCommand(['openpowers', 'agents', 'switch', 'workflow', '--session', 'abc'], '/cwd');

    expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining('Hook command failed'));
    expect(result).toEqual({ stdout: '', stderr: 'error output from stderr', status: 1 });

    stderrSpy.mockRestore();
  });

  it('should return null for non-exec errors without stdout/stderr', () => {
    execSyncMock.mockImplementation(() => {
      throw new Error('some unexpected error');
    });
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

    const result = executeCommand(['echo', 'test'], '/tmp');

    expect(result).toBeNull();

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
      path.join('/mock/home', '.openpowers', 'logs', 'hooks'),
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

    const logFile = path.join('/mock/home', '.openpowers', 'logs', 'hooks', 'hooks-my-session-123.log');
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

  it('should handle --before-agent with valid stdin and execute init then switch commands', () => {
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

    expect(execSyncMock).toHaveBeenCalledTimes(2);
    // First call: init command
    const initCallArg = execSyncMock.mock.calls[0][0];
    expect(initCallArg).toContain('openpowers');
    expect(initCallArg).toContain('agents init');
    expect(initCallArg).toContain('--session');
    expect(initCallArg).toContain('abc-123-def');
    expect(initCallArg).toContain('--cwd');
    expect(initCallArg).toContain('/home/user/project');
    // Second call: switch command
    const switchCallArg = execSyncMock.mock.calls[1][0];
    expect(switchCallArg).toContain('openpowers');
    expect(switchCallArg).toContain('explore');
    expect(switchCallArg).toContain('--session');
    expect(switchCallArg).toContain('abc-123-def');
    expect(process.exitCode).toBeUndefined();
  });

  it('should handle --after-agent with valid stdin and execute init then workflow switch', () => {
    process.argv = ['node', '/fake/path/script.js', '--after-agent'];
    const stdinJson = JSON.stringify({
      session_id: 'xyz-789',
      cwd: '/tmp/test',
      tool_input: {
        'OpenPowers:review:Purpose': 'review task',
      },
    });
    mockStdin(stdinJson);
    execSyncMock.mockReturnValue('output');

    main();

    expect(execSyncMock).toHaveBeenCalledTimes(2);
    // First call: init command
    const initCallArg = execSyncMock.mock.calls[0][0];
    expect(initCallArg).toContain('openpowers');
    expect(initCallArg).toContain('agents init');
    expect(initCallArg).toContain('--session');
    expect(initCallArg).toContain('xyz-789');
    expect(initCallArg).toContain('--cwd');
    expect(initCallArg).toContain('/tmp/test');
    // Second call: switch to workflow
    const switchCallArg = execSyncMock.mock.calls[1][0];
    expect(switchCallArg).toContain('workflow');
    expect(switchCallArg).toContain('--session');
    expect(switchCallArg).toContain('xyz-789');
    expect(process.exitCode).toBeUndefined();
  });

  it('should silently skip when --before-agent input is missing session_id', () => {
    process.argv = ['node', '/fake/path/script.js', '--before-agent'];
    const stdinJson = JSON.stringify({
      cwd: '/home/user/project',
    });
    mockStdin(stdinJson);

    main();

    // Hook fires for all agents, silently skip non-targeted ones
    expect(stderrSpy).not.toHaveBeenCalled();
    expect(process.exitCode).toBeUndefined();
    expect(execSyncMock).not.toHaveBeenCalled();
  });

  it('should silently skip when --before-agent cwd does not exist', () => {
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

    // Hook fires for all agents, silently skip non-targeted ones
    expect(stderrSpy).not.toHaveBeenCalled();
    expect(process.exitCode).toBeUndefined();
    expect(execSyncMock).not.toHaveBeenCalled();
  });

  it('should write log entries with command and full result for before-agent on success', () => {
    process.argv = ['node', '/fake/path/script.js', '--before-agent'];
    const stdinJson = JSON.stringify({
      session_id: 'log-test-1',
      cwd: '/test/cwd',
      tool_input: {
        'OpenPowers:plan:Purpose': 'plan task',
      },
    });
    mockStdin(stdinJson);
    execSyncMock.mockReturnValue('switch successful');

    main();

    // writeLog calls: 3 accept logs + 1 Running init + 1 Result init + 1 Running switch + 1 Result switch = 7
    expect(appendFileSyncMock).toHaveBeenCalledTimes(7);
    const logFile = path.join('/mock/home', '.openpowers', 'logs', 'hooks', 'hooks-log-test-1.log');

    const logLines = appendFileSyncMock.mock.calls.map((call: unknown[]) => call[1]) as string[];
    expect(logLines).toContainEqual(expect.stringContaining('Accepted hook request --- session-id: log-test-1'));
    expect(logLines).toContainEqual(expect.stringContaining('Accepted hook request --- openpowers-purpose: plan'));
    expect(logLines).toContainEqual(expect.stringContaining('Accepted hook request --- cwd: /test/cwd'));
    expect(logLines).toContainEqual(expect.stringContaining('Running command: openpowers agents init --session log-test-1 --cwd /test/cwd (cwd: /test/cwd)'));
    expect(logLines).toContainEqual(expect.stringContaining("Result of init-agent hook: returncode=0, stdout='switch successful', stderr=''"));
    expect(logLines).toContainEqual(expect.stringContaining('Running command: openpowers agents switch plan --session log-test-1 (cwd: /test/cwd)'));
    expect(logLines).toContainEqual(expect.stringContaining("Result of switch-agent hook: returncode=0, stdout='switch successful', stderr=''"));

    for (const call of appendFileSyncMock.mock.calls) {
      expect(call[0]).toBe(logFile);
    }
  });

  it('should handle stdin read failure gracefully — silently skip', () => {
    process.argv = ['node', '/fake/path/script.js', '--before-agent'];
    readSyncMock.mockImplementation(() => {
      throw new Error('EBADF: bad file descriptor');
    });

    main();

    // stdin read failure results in empty input, silently skip
    expect(stderrSpy).not.toHaveBeenCalled();
    expect(process.exitCode).toBeUndefined();
    expect(execSyncMock).not.toHaveBeenCalled();
  });

  it('should silently skip when --after-agent input is missing session_id', () => {
    process.argv = ['node', '/fake/path/script.js', '--after-agent'];
    const stdinJson = JSON.stringify({
      cwd: '/test/cwd',
    });
    mockStdin(stdinJson);

    main();

    expect(stderrSpy).not.toHaveBeenCalled();
    expect(process.exitCode).toBeUndefined();
    expect(execSyncMock).not.toHaveBeenCalled();
  });
});
