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

const { writeFileSyncMock } = vi.hoisted(() => ({
  writeFileSyncMock: vi.fn(),
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
    writeFileSync: writeFileSyncMock,
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
  buildWorkflowCommand,
  buildBeforeProposeCommand,
  executeCommand,
  writeLog,
  runBeforeAgent,
  runAfterAgent,
  runInitAgent,
  runBeforePropose,
  runBeforeBash,
  executeChangeNewInit,
  extractCommandFromRawInput,
  extractChangeName,
  extractToolResponse,
  writeOutputFile,
  main,
} = hooksModule;

// Save original process.argv for restoration
const originalArgv = [...process.argv];

describe('parseStdin', () => {
  it('should extract session_id and cwd from valid JSON', () => {
    const input = JSON.stringify({
      session_id: 'abc-123-def',
      cwd: '/home/user/project',
      tool_input: {
        'OpenPowers:explore:Purpose': 'explore task',
      },
    });

    const result = parseStdin(input);

    expect(result.sessionId).toBe('abc-123-def');
    expect(result.cwd).toBe('/home/user/project');
  });

  it('should NOT return purpose or prompt fields', () => {
    const input = JSON.stringify({
      session_id: 'abc-123-def',
      cwd: '/home/user/project',
      prompt: '/openpowers:workflow start',
      tool_input: {
        'OpenPowers:explore:Purpose': 'explore task',
      },
    });

    const result = parseStdin(input);

    expect(result).not.toHaveProperty('purpose');
    expect(result).not.toHaveProperty('prompt');
    expect(result).toHaveProperty('sessionId');
    expect(result).toHaveProperty('cwd');
  });

  it('should extract session_id and cwd when purpose is deeply nested', () => {
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

  it('should not include purpose when no OpenPowers key exists', () => {
    const input = JSON.stringify({
      session_id: 'abc-123',
      cwd: '/tmp/test',
    });

    const result = parseStdin(input);

    expect(result).not.toHaveProperty('purpose');
  });

  it('should return undefined fields for empty input', () => {
    const result = parseStdin('');

    expect(result.sessionId).toBeUndefined();
    expect(result.cwd).toBeUndefined();
  });

  it('should handle whitespace-only input gracefully', () => {
    const result = parseStdin('   ');

    expect(result.sessionId).toBeUndefined();
    expect(result.cwd).toBeUndefined();
  });

  it('should return undefined fields for invalid JSON input', () => {
    const result = parseStdin('{invalid json}');

    expect(result.sessionId).toBeUndefined();
    expect(result.cwd).toBeUndefined();
  });

  it('should extract fields from malformed text with encoding prefix that JSON.parse would reject', () => {
    const input = '\uFEFF{"session_id":"abc-123","tool_input":{"OpenPowers:plan:Purpose":"task"},"cwd":"/tmp/path","trailing":"junk",more:broken}';

    const result = parseStdin(input);

    expect(result.sessionId).toBe('abc-123');
    expect(result.cwd).toBe('/tmp/path');
  });

  it('should extract fields even when input is not valid JSON at all', () => {
    const input = 'some_prefix "session_id" : "my-session-id", garbage text "cwd" : "/my/project/path" OpenPowers:coding:Purpose more_noise';

    const result = parseStdin(input);

    expect(result.sessionId).toBe('my-session-id');
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
    expect(result.cwd).toBe('/home/用户/项目/我的代码');
  });

  it('should handle Chinese characters in Windows-style cwd path', () => {
    const input = `{"session_id":"win-001","cwd":"C:\\\\Users\\\\小明\\\\Documents\\\\项目","tool_input":{"OpenPowers:Review:Purpose":"review"}}`;

    const result = parseStdin(input);

    expect(result.sessionId).toBe('win-001');
    // Regex captures the literal JSON-escaped path between quotes
    expect(result.cwd).toBe('C:\\\\Users\\\\小明\\\\Documents\\\\项目');
  });

  it('should handle JSON-escaped unicode sequences (\\\\uXXXX)', () => {
    const input = `{"session_id":"u-001","cwd":"/tmp/uni","tool_input":{"OpenPowers:plan:Purpose":"\\u8ba1\\u5212\\u4efb\\u52a1"}}`;

    const result = parseStdin(input);

    expect(result.sessionId).toBe('u-001');
    // cwd pattern "([^"]+)" captures the literal \\uXXXX string as-is
    expect(result.cwd).toBe('/tmp/uni');
  });

  it('should handle UTF-8 BOM followed by Chinese content', () => {
    const input = '\uFEFF{"session_id":"bom-cn","cwd":"/数据/测试","tool_input":{"OpenPowers:propose:Purpose":"提案"}}';

    const result = parseStdin(input);

    expect(result.sessionId).toBe('bom-cn');
    expect(result.cwd).toBe('/数据/测试');
  });

  it('should handle raw bytes and non-printable characters around fields', () => {
    const input = '\x00\x01text before\x02"session_id"\t:\n"hex-001"\r\n\x03"cwd":\r"/path/with\\n/newline/value"some junk\x04OpenPowers:workflow:Purpose trailing \x05';

    const result = parseStdin(input);

    expect(result.sessionId).toBe('hex-001');
    expect(result.cwd).toBe('/path/with\\n/newline/value');
  });

  it('should handle emoji and special Unicode characters in surrounding text', () => {
    const input = '🎉🚀{"session_id":"emoji-001","cwd":"/home/user/项目🔥","tool_input":{"OpenPowers:plan:Purpose":"📋plan"}}✨🎯';

    const result = parseStdin(input);

    expect(result.sessionId).toBe('emoji-001');
    expect(result.cwd).toBe('/home/user/项目🔥');
  });

  it('should handle mixed full-width and half-width characters', () => {
    const input = '（全角括号）{"session_id"： "full-001"，"cwd" ： "Ｄ：／ｐｒｏｊｅｃｔ／ｍｙｆｏｌｄｅｒ" OpenPowers：coding：Purpose';

    const result = parseStdin(input);

    // Full-width colon ： won't match the pattern : so session_id/cwd won't extract
    expect(result.sessionId).toBeUndefined();
    expect(result.cwd).toBeUndefined();
  });

  it('should handle extremely long input with fields buried deep', () => {
    const noise = 'x'.repeat(10000);
    const input = `${noise}"session_id":"deep-999"${noise}"cwd":"/deep/path"${noise}OpenPowers:review:Purpose${noise}`;

    const result = parseStdin(input);

    expect(result.sessionId).toBe('deep-999');
    expect(result.cwd).toBe('/deep/path');
  });

  it('should pick the FIRST match when multiple session_id fields exist', () => {
    const input = '{"session_id":"first-one","cwd":"/path1","tool_input":{"OpenPowers:explore:Purpose":"t1"},"other":{"session_id":"second-one","cwd":"/path2"}}';

    const result = parseStdin(input);

    // Regex is greedy-leftmost, first match wins
    expect(result.sessionId).toBe('first-one');
    expect(result.cwd).toBe('/path1');
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
    expect(result.cwd).toBe('/home/user/project');
  });

  it('should handle spaces in cwd path (e.g. Windows paths with spaces)', () => {
    const input = `{"session_id":"spc-001","cwd":"C:\\\\Program Files\\\\My App\\\\data","tool_input":{"OpenPowers:finalize:Purpose":"done"}}`;

    const result = parseStdin(input);

    expect(result.sessionId).toBe('spc-001');
    // Regex captures the literal JSON-escaped path between quotes
    expect(result.cwd).toBe('C:\\\\Program Files\\\\My App\\\\data');
  });

  it('should handle session_id with mixed case and return as-is', () => {
    const input = '{"session_id":"AbC-123-XyZ-456","cwd":"/tmp","OpenPowers:explore:Purpose":"x"}';

    const result = parseStdin(input);

    expect(result.sessionId).toBe('AbC-123-XyZ-456');
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
      cwd: '/valid/path',
    }, 'explore');

    expect(result).toBeNull();
  });

  it('should return error when session_id is missing', () => {
    existsSyncMock.mockReturnValue(true);

    const result = validateBeforeAgent({
      sessionId: undefined,
      cwd: '/valid/path',
    }, 'explore');

    expect(result).toContain('session_id');
  });

  it('should return error when purpose is missing', () => {
    existsSyncMock.mockReturnValue(true);

    const result = validateBeforeAgent({
      sessionId: 'abc-123',
      cwd: '/valid/path',
    }, undefined);

    expect(result).toContain('purpose');
  });

  it('should return error when cwd is missing', () => {
    const result = validateBeforeAgent({
      sessionId: 'abc-123',
      cwd: undefined,
    }, 'explore');

    expect(result).toContain('cwd');
  });

  it('should return error when cwd path does not exist', () => {
    existsSyncMock.mockReturnValue(false);

    const result = validateBeforeAgent({
      sessionId: 'abc-123',
      cwd: '/nonexistent/path',
    }, 'explore');

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

describe('buildWorkflowCommand', () => {
  it('should build correct command with workflow for --after-agent mode', () => {
    const result = buildWorkflowCommand('session-002');

    expect(result).toEqual(['openpowers', 'agents', 'switch', 'workflow', '--session', 'session-002']);
  });
});

describe('buildBeforeProposeCommand', () => {
  it('should build correct command for --before-propose mode', () => {
    const result = buildBeforeProposeCommand('abc-123');

    expect(result).toEqual(['openpowers', 'agents', 'switch', 'propose', '--session', 'abc-123']);
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

  it('should NOT write to stderr on failure when silent option is true', () => {
    execSyncMock.mockImplementation(() => {
      throw new Error('command failed silently');
    });
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

    executeCommand(['openpowers', 'agents', 'init', '--session', 's', '--cwd', '/tmp'], '/tmp', { silent: true });

    expect(stderrSpy).not.toHaveBeenCalled();

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

describe('runAfterAgent', () => {
  let stderrSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    process.exitCode = undefined;
    stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    existsSyncMock.mockReturnValue(true);
    homedirMock.mockReturnValue('/mock/home');
  });

  afterAll(() => {
    process.exitCode = undefined;
  });

  it('should silently skip when validation fails (missing session_id)', () => {
    runAfterAgent({
      sessionId: undefined,
      cwd: '/valid/path',
    }, 'OpenPowers:review:Purpose');

    expect(execSyncMock).not.toHaveBeenCalled();
    expect(stderrSpy).not.toHaveBeenCalled();
    expect(process.exitCode).toBeUndefined();
  });


  it('should write log entries for after-agent on success', () => {
    execSyncMock.mockReturnValue('switch successful');

    runAfterAgent({
      sessionId: 'after-log',
      cwd: '/test/cwd',
    }, 'OpenPowers:finalize:Purpose');

    // 2 accept logs + 1 Running init + 1 Result init + 1 Running switch + 1 Result switch
    // + 1 Running change stage + 1 Result change stage = 8
    expect(appendFileSyncMock).toHaveBeenCalledTimes(8);
    const logLines = appendFileSyncMock.mock.calls.map((call: unknown[]) => call[1]) as string[];
    expect(logLines).toContainEqual(expect.stringContaining('Accepted hook request --- session-id: after-log'));
    expect(logLines).toContainEqual(expect.stringContaining('Accepted hook request --- cwd: /test/cwd'));
  });

  it('should execute init, switch to workflow, and call change stage when validation passes', () => {
    execSyncMock.mockReturnValue('output');

    runAfterAgent({
      sessionId: 'xyz-789',
      cwd: '/tmp/test',
    }, 'OpenPowers:review:Purpose');

    expect(execSyncMock).toHaveBeenCalledTimes(3);
    // First call: init
    expect(execSyncMock.mock.calls[0][0]).toContain('agents init');
    expect(execSyncMock.mock.calls[0][0]).toContain('--session');
    expect(execSyncMock.mock.calls[0][0]).toContain('xyz-789');
    // Second call: switch to workflow
    expect(execSyncMock.mock.calls[1][0]).toContain('workflow');
    expect(execSyncMock.mock.calls[1][0]).toContain('--session');
    expect(execSyncMock.mock.calls[1][0]).toContain('xyz-789');
    // Third call: change stage with --status done
    expect(execSyncMock.mock.calls[2][0]).toContain('change stage');
    expect(execSyncMock.mock.calls[2][0]).toContain('review');
    expect(execSyncMock.mock.calls[2][0]).toContain('--status done');
    expect(execSyncMock.mock.calls[2][0]).toContain('--session');
    expect(execSyncMock.mock.calls[2][0]).toContain('xyz-789');
  });

  it('should skip change stage call when purpose is empty', () => {
    execSyncMock.mockReturnValue('output');

    runAfterAgent({
      sessionId: 'nopurpose',
      cwd: '/tmp/test',
    }, 'no purpose here');

    expect(execSyncMock).toHaveBeenCalledTimes(2);
    // Only init and switch, no change stage
    expect(execSyncMock.mock.calls[0][0]).toContain('agents init');
    expect(execSyncMock.mock.calls[1][0]).toContain('workflow');
    // No change stage call
    const allCalls = execSyncMock.mock.calls.map((c: string[]) => c[0]).join(' ');
    expect(allCalls).not.toContain('change stage');
  });

  it('should parse prompt/description/toolUseId and write toolResponse file', () => {
    execSyncMock.mockReturnValue('output');
    const toolResponse = { status: 'completed', content: [{ type: 'text', text: 'done' }] };
    const rawInput = JSON.stringify({
      session_id: 'parse-test',
      cwd: '/tmp/test',
      tool_use_id: 'tool-abc',
      tool_input: {
        prompt: 'some prompt',
        description: 'test desc',
        'OpenPowers:explore:Purpose': 'task',
      },
      tool_response: toolResponse,
    });

    runAfterAgent({
      sessionId: 'parse-test',
      cwd: '/tmp/test',
    }, rawInput);

    // Verify toolResponse file was written
    const expectedPath = path.join('/mock/home', '.openpowers', 'sessions', 'parse-test', 'tool-abc.json');
    expect(writeFileSyncMock).toHaveBeenCalledWith(
      expectedPath,
      JSON.stringify(toolResponse, null, 2),
      'utf-8',
    );
    // Verify change stage has --title and --output
    const stageCmd = execSyncMock.mock.calls[2][0];
    expect(stageCmd).toContain('--title');
    expect(stageCmd).toContain('test desc');
    expect(stageCmd).toContain('--output');
    expect(stageCmd).toContain(expectedPath);
  });

  it('should skip toolResponse file write when toolUseId is missing', () => {
    execSyncMock.mockReturnValue('output');

    const rawInput = JSON.stringify({
      session_id: 'noid',
      cwd: '/tmp/test',
      tool_input: {
        'OpenPowers:explore:Purpose': 'task',
      },
      tool_response: { status: 'completed' },
    });

    runAfterAgent({
      sessionId: 'noid',
      cwd: '/tmp/test',
    }, rawInput);

    expect(writeFileSyncMock).not.toHaveBeenCalled();
    // change stage still runs but without --output
    const stageCmd = execSyncMock.mock.calls[2][0];
    expect(stageCmd).not.toContain('--output');
  });

  it('should omit --title when description is empty', () => {
    execSyncMock.mockReturnValue('output');

    const rawInput = JSON.stringify({
      session_id: 'nodesc',
      cwd: '/tmp/test',
      tool_use_id: 'tid-nodesc',
      tool_input: {
        prompt: 'prompt text',
        'OpenPowers:plan:Purpose': 'task',
      },
      tool_response: { status: 'completed' },
    });

    runAfterAgent({
      sessionId: 'nodesc',
      cwd: '/tmp/test',
    }, rawInput);

    const stageCmd = execSyncMock.mock.calls[2][0];
    expect(stageCmd).not.toContain('--title');
  });

  it('should use original purpose for change stage (not mapped)', () => {
    execSyncMock.mockReturnValue('output');

    runAfterAgent({
      sessionId: 'int-123',
      cwd: '/tmp/test',
    }, 'OpenPowers:integration:Purpose');

    expect(execSyncMock).toHaveBeenCalledTimes(3);
    // agents switch always goes to workflow
    expect(execSyncMock.mock.calls[1][0]).toContain('workflow');
    // change stage uses integration purpose
    expect(execSyncMock.mock.calls[2][0]).toContain('change stage');
    expect(execSyncMock.mock.calls[2][0]).toContain('integration');
  });
});

describe('runBeforeAgent', () => {
  let stderrSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    process.exitCode = undefined;
    stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    existsSyncMock.mockReturnValue(true);
    homedirMock.mockReturnValue('/mock/home');
  });

  afterAll(() => {
    process.exitCode = undefined;
  });

  it('should silently skip when validation fails (missing session_id)', () => {
    runBeforeAgent({
      sessionId: undefined,
      cwd: '/valid/path',
    }, 'OpenPowers:explore:Purpose');

    expect(execSyncMock).not.toHaveBeenCalled();
    expect(stderrSpy).not.toHaveBeenCalled();
    expect(process.exitCode).toBeUndefined();
  });

  it('should execute init, switch, and change stage commands when validation passes', () => {
    execSyncMock.mockReturnValue('output');

    runBeforeAgent({
      sessionId: 'abc-123',
      cwd: '/valid/path',
    }, 'OpenPowers:explore:Purpose');

    expect(execSyncMock).toHaveBeenCalledTimes(3);
    // First call: init
    expect(execSyncMock.mock.calls[0][0]).toContain('agents init');
    expect(execSyncMock.mock.calls[0][0]).toContain('--session');
    expect(execSyncMock.mock.calls[0][0]).toContain('abc-123');
    // Second call: switch
    expect(execSyncMock.mock.calls[1][0]).toContain('agents switch');
    expect(execSyncMock.mock.calls[1][0]).toContain('explore');
    // Third call: change stage
    expect(execSyncMock.mock.calls[2][0]).toContain('change stage');
    expect(execSyncMock.mock.calls[2][0]).toContain('explore');
    expect(execSyncMock.mock.calls[2][0]).toContain('--status in_progress');
  });

  it('should write log entries for before-agent on success', () => {
    execSyncMock.mockReturnValue('switch successful');

    runBeforeAgent({
      sessionId: 'log-test',
      cwd: '/test/cwd',
    }, 'OpenPowers:plan:Purpose');

    // 3 accept logs + 1 Running init + 1 Result init + 1 Running switch + 1 Result switch
    // + 1 Running change stage + 1 Result change stage = 9
    expect(appendFileSyncMock).toHaveBeenCalledTimes(9);
    const logLines = appendFileSyncMock.mock.calls.map((call: unknown[]) => call[1]) as string[];
    expect(logLines).toContainEqual(expect.stringContaining('Accepted hook request --- session-id: log-test'));
    expect(logLines).toContainEqual(expect.stringContaining('Accepted hook request --- openpowers-purpose: plan'));
    expect(logLines).toContainEqual(expect.stringContaining('Accepted hook request --- cwd: /test/cwd'));
  });

  it('should map purpose=integration to coding for agents switch but use integration for change stage', () => {
    execSyncMock.mockReturnValue('output');

    runBeforeAgent({
      sessionId: 'int-123',
      cwd: '/valid/path',
    }, 'OpenPowers:integration:Purpose');

    expect(execSyncMock).toHaveBeenCalledTimes(3);
    // agents switch uses coding
    expect(execSyncMock.mock.calls[1][0]).toContain('agents switch');
    expect(execSyncMock.mock.calls[1][0]).toContain('coding');
    expect(execSyncMock.mock.calls[1][0]).not.toContain('integration');
    // change stage uses integration
    expect(execSyncMock.mock.calls[2][0]).toContain('change stage');
    expect(execSyncMock.mock.calls[2][0]).toContain('integration');
  });

  it('should parse prompt/description/tool_use_id via JSON when rawInput is valid JSON', () => {
    execSyncMock.mockReturnValue('output');
    homedirMock.mockReturnValue('/mock/home');
    const rawInput = JSON.stringify({
      session_id: 'json-test',
      cwd: '/valid/path',
      tool_use_id: 'tool-abc-123',
      tool_input: {
        prompt: 'some prompt content',
        description: 'test description',
        'OpenPowers:explore:Purpose': 'task',
      },
    });

    runBeforeAgent({
      sessionId: 'json-test',
      cwd: '/valid/path',
    }, rawInput);

    // Verify file was written with prompt content
    const expectedPath = path.join('/mock/home', '.openpowers', 'sessions', 'json-test', 'tool-abc-123.txt');
    expect(writeFileSyncMock).toHaveBeenCalledWith(expectedPath, 'some prompt content', 'utf-8');
    // Verify change stage has --input and --title
    const stageCmd = execSyncMock.mock.calls[2][0];
    expect(stageCmd).toContain('--input');
    expect(stageCmd).toContain(expectedPath);
    expect(stageCmd).toContain('--title');
    expect(stageCmd).toContain('test description');
  });

  it('should fallback to regex when JSON.parse fails for prompt/description/tool_use_id', () => {
    execSyncMock.mockReturnValue('output');
    homedirMock.mockReturnValue('/mock/home');
    // Malformed JSON but regex can still extract fields
    const rawInput = '{"session_id":"regex-test","cwd":"/valid/path","tool_use_id":"tid-456","tool_input":{"prompt":"regex prompt","description":"regex desc"OpenPowers:explore:Purpose}';

    runBeforeAgent({
      sessionId: 'regex-test',
      cwd: '/valid/path',
    }, rawInput);

    // Verify file was written with regex-extracted prompt
    const expectedPath = path.join('/mock/home', '.openpowers', 'sessions', 'regex-test', 'tid-456.txt');
    expect(writeFileSyncMock).toHaveBeenCalledWith(expectedPath, 'regex prompt', 'utf-8');
  });

  it('should skip file write when prompt is missing', () => {
    execSyncMock.mockReturnValue('output');
    homedirMock.mockReturnValue('/mock/home');
    const rawInput = JSON.stringify({
      session_id: 'noprompt',
      cwd: '/valid/path',
      tool_use_id: 'tid-789',
      tool_input: {
        'OpenPowers:explore:Purpose': 'task',
      },
    });

    runBeforeAgent({
      sessionId: 'noprompt',
      cwd: '/valid/path',
    }, rawInput);

    expect(writeFileSyncMock).not.toHaveBeenCalled();
  });

  it('should skip file write when tool_use_id is missing', () => {
    execSyncMock.mockReturnValue('output');
    homedirMock.mockReturnValue('/mock/home');
    const rawInput = JSON.stringify({
      session_id: 'noid',
      cwd: '/valid/path',
      tool_input: {
        prompt: 'some prompt',
        'OpenPowers:explore:Purpose': 'task',
      },
    });

    runBeforeAgent({
      sessionId: 'noid',
      cwd: '/valid/path',
    }, rawInput);

    expect(writeFileSyncMock).not.toHaveBeenCalled();
  });

  it('should omit --title when description is empty', () => {
    execSyncMock.mockReturnValue('output');
    homedirMock.mockReturnValue('/mock/home');
    const rawInput = JSON.stringify({
      session_id: 'nodesc',
      cwd: '/valid/path',
      tool_use_id: 'tid-nodesc',
      tool_input: {
        prompt: 'prompt text',
        'OpenPowers:explore:Purpose': 'task',
      },
    });

    runBeforeAgent({
      sessionId: 'nodesc',
      cwd: '/valid/path',
    }, rawInput);

    const stageCmd = execSyncMock.mock.calls[2][0];
    expect(stageCmd).not.toContain('--title');
  });

  it('should create session directory when it does not exist', () => {
    execSyncMock.mockReturnValue('output');
    homedirMock.mockReturnValue('/mock/home');
    // Return true for all paths except the session directory (which doesn't exist yet)
    existsSyncMock.mockImplementation((p: string) => {
      if (p === '/valid/path') return true;
      if (p.includes('sessions') && p.includes('mkdir-test')) return false;
      return true; // log dir already exists
    });
    const rawInput = JSON.stringify({
      session_id: 'mkdir-test',
      cwd: '/valid/path',
      tool_use_id: 'tid-mkdir',
      tool_input: {
        prompt: 'prompt for mkdir',
        'OpenPowers:explore:Purpose': 'task',
      },
    });

    runBeforeAgent({
      sessionId: 'mkdir-test',
      cwd: '/valid/path',
    }, rawInput);

    const expectedDir = path.join('/mock/home', '.openpowers', 'sessions', 'mkdir-test');
    expect(mkdirSyncMock).toHaveBeenCalledWith(expectedDir, { recursive: true });
    expect(writeFileSyncMock).toHaveBeenCalled();
  });
});

describe('runInitAgent', () => {
  let stderrSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    process.exitCode = undefined;
    stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    existsSyncMock.mockReturnValue(true);
  });

  afterAll(() => {
    process.exitCode = undefined;
  });

  it('should silently return when rawInput has no prompt', () => {
    runInitAgent({
      sessionId: 'abc-123',
      cwd: '/valid/path',
    });

    expect(execSyncMock).not.toHaveBeenCalled();
    expect(stderrSpy).not.toHaveBeenCalled();
    expect(process.exitCode).toBeUndefined();
  });

  it('should silently return when session_id is missing', () => {
    runInitAgent({
      sessionId: undefined,
      cwd: '/valid/path',
    }, '{"prompt":"/openpowers:workflow","session_id":"abc-123"}');

    expect(execSyncMock).not.toHaveBeenCalled();
    expect(stderrSpy).not.toHaveBeenCalled();
    expect(process.exitCode).toBeUndefined();
  });

  it('should silently return when cwd is undefined', () => {
    runInitAgent({
      sessionId: 'abc-123',
      cwd: undefined,
    }, '{"prompt":"/openpowers:workflow","session_id":"abc-123"}');

    expect(execSyncMock).not.toHaveBeenCalled();
    expect(stderrSpy).not.toHaveBeenCalled();
    expect(process.exitCode).toBeUndefined();
  });

  it('should silently return when cwd is an empty string', () => {
    runInitAgent({
      sessionId: 'abc-123',
      cwd: '',
    }, '{"prompt":"/openpowers:workflow","session_id":"abc-123"}');

    expect(execSyncMock).not.toHaveBeenCalled();
    expect(stderrSpy).not.toHaveBeenCalled();
    expect(process.exitCode).toBeUndefined();
  });

  it('should silently return when cwd path does not exist on disk', () => {
    existsSyncMock.mockReturnValue(false);

    runInitAgent({
      sessionId: 'abc-123',
      cwd: '/nonexistent/path',
    }, '{"prompt":"/openpowers:workflow","session_id":"abc-123"}');

    expect(existsSyncMock).toHaveBeenCalledWith('/nonexistent/path');
    expect(execSyncMock).not.toHaveBeenCalled();
    expect(stderrSpy).not.toHaveBeenCalled();
    expect(process.exitCode).toBeUndefined();
  });

  it('should execute openpowers agents init with session and cwd when all conditions are met', () => {
    execSyncMock.mockReturnValue('init successful');

    runInitAgent({
      sessionId: 'session-abc',
      cwd: '/valid/project/path',
    }, '{"prompt":"/openpowers:workflow","session_id":"session-abc"}');

    expect(execSyncMock).toHaveBeenCalledTimes(2);
    // First call: agents init
    const initCallArg = execSyncMock.mock.calls[0][0];
    expect(initCallArg).toContain('openpowers');
    expect(initCallArg).toContain('agents init');
    expect(initCallArg).toContain('--session');
    expect(initCallArg).toContain('session-abc');
    expect(initCallArg).toContain('--cwd');
    expect(initCallArg).toContain('/valid/project/path');
    // Second call: switch to workflow
    const switchCallArg = execSyncMock.mock.calls[1][0];
    expect(switchCallArg).toContain('openpowers');
    expect(switchCallArg).toContain('agents switch');
    expect(switchCallArg).toContain('workflow');
    expect(switchCallArg).toContain('--session');
    expect(switchCallArg).toContain('session-abc');
    expect(stderrSpy).not.toHaveBeenCalled();
    expect(process.exitCode).toBeUndefined();

    // Verify writeLog was called for init command/result + switch command/result
    expect(appendFileSyncMock).toHaveBeenCalledTimes(4);
    const logLines = appendFileSyncMock.mock.calls.map((call: unknown[]) => call[1]) as string[];
    expect(logLines[0]).toContain('Running command:');
    expect(logLines[0]).toContain('/valid/project/path');
    expect(logLines[1]).toContain('Result of init-agent hook: returncode=0');
    expect(logLines[1]).toContain('init successful');
    expect(logLines[2]).toContain('Running command:');
    expect(logLines[3]).toContain('Result of switch-agent hook:');
  });

  it('should execute with prompt that has additional content after /openpowers:workflow', () => {
    execSyncMock.mockReturnValue('init successful');

    runInitAgent({
      sessionId: 'session-xyz',
      cwd: '/another/path',
    }, '{"prompt":"/openpowers:workflow start new task","session_id":"session-xyz"}');

    expect(execSyncMock).toHaveBeenCalledTimes(2);
    const initCallArg = execSyncMock.mock.calls[0][0];
    expect(initCallArg).toContain('--session');
    expect(initCallArg).toContain('session-xyz');
    expect(initCallArg).toContain('--cwd');
    expect(initCallArg).toContain('/another/path');

    // Verify writeLog was called for init + switch
    const logLines = appendFileSyncMock.mock.calls.map((call: unknown[]) => call[1]) as string[];
    expect(logLines[0]).toContain('Running command:');
    expect(logLines[1]).toContain('Result of init-agent hook:');
    expect(logLines[2]).toContain('Running command:');
    expect(logLines[3]).toContain('Result of switch-agent hook:');
  });

  it('should NOT write to stderr when init command fails (execSync throws)', () => {
    execSyncMock.mockImplementation(() => {
      throw new Error('init command failed');
    });

    runInitAgent({
      sessionId: 'session-err',
      cwd: '/valid/path',
    }, '{"prompt":"/openpowers:workflow","session_id":"session-err"}');

    expect(execSyncMock).toHaveBeenCalledTimes(2);
    expect(stderrSpy).not.toHaveBeenCalled();
    expect(process.exitCode).toBeUndefined();
  });
});

describe('runBeforePropose', () => {
  let stderrSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    process.exitCode = undefined;
    stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    existsSyncMock.mockReturnValue(true);
    homedirMock.mockReturnValue('/mock/home');
  });

  afterAll(() => {
    process.exitCode = undefined;
  });

  it('should silently return when sessionId is missing, without executing commands or logging', () => {
    runBeforePropose({
      sessionId: undefined,
      purpose: undefined,
      cwd: '/valid/path',
      prompt: undefined,
    });

    expect(execSyncMock).not.toHaveBeenCalled();
    expect(appendFileSyncMock).not.toHaveBeenCalled();
    expect(stderrSpy).not.toHaveBeenCalled();
    expect(process.exitCode).toBeUndefined();
  });

  it('should silently return when cwd is missing, without executing commands or logging', () => {
    runBeforePropose({
      sessionId: 'abc-123',
      purpose: undefined,
      cwd: undefined,
      prompt: undefined,
    });

    expect(execSyncMock).not.toHaveBeenCalled();
    expect(appendFileSyncMock).not.toHaveBeenCalled();
    expect(stderrSpy).not.toHaveBeenCalled();
    expect(process.exitCode).toBeUndefined();
  });

  it('should silently return when cwd path does not exist on disk, without executing commands or logging', () => {
    existsSyncMock.mockReturnValue(false);

    runBeforePropose({
      sessionId: 'abc-123',
      purpose: undefined,
      cwd: '/nonexistent/path',
      prompt: undefined,
    });

    expect(existsSyncMock).toHaveBeenCalledWith('/nonexistent/path');
    expect(execSyncMock).not.toHaveBeenCalled();
    expect(appendFileSyncMock).not.toHaveBeenCalled();
    expect(stderrSpy).not.toHaveBeenCalled();
    expect(process.exitCode).toBeUndefined();
  });

  it('should write exactly 7 log entries in correct order on happy path', () => {
    execSyncMock.mockReturnValue('switch successful');

    runBeforePropose({
      sessionId: 'prop-session',
      purpose: undefined,
      cwd: '/valid/path',
      prompt: undefined,
    });

    // Exactly 7 log entries via writeLog
    expect(appendFileSyncMock).toHaveBeenCalledTimes(7);
    const logLines = appendFileSyncMock.mock.calls.map((call: unknown[]) => call[1]) as string[];

    // Entry 1: Accepted hook request --- session-id
    expect(logLines[0]).toContain('Accepted hook request --- session-id: prop-session');

    // Entry 2: Accepted hook request --- openpowers-purpose: propose (hardcoded)
    expect(logLines[1]).toContain('Accepted hook request --- openpowers-purpose: propose');

    // Entry 3: Accepted hook request --- cwd
    expect(logLines[2]).toContain('Accepted hook request --- cwd: /valid/path');

    // Entry 4: Running command for init
    expect(logLines[3]).toContain('Running command:');
    expect(logLines[3]).toContain('agents init');
    expect(logLines[3]).toContain('--session prop-session');
    expect(logLines[3]).toContain('--cwd /valid/path');

    // Entry 5: Result of init-agent hook
    expect(logLines[4]).toContain('Result of init-agent hook:');
    expect(logLines[4]).toContain("stdout='switch successful'");

    // Entry 6: Running command for switch
    expect(logLines[5]).toContain('Running command:');
    expect(logLines[5]).toContain('agents switch');
    expect(logLines[5]).toContain('propose');
    expect(logLines[5]).toContain('--session prop-session');

    // Entry 7: Result of switch-agent hook
    expect(logLines[6]).toContain('Result of switch-agent hook:');
    expect(logLines[6]).toContain("stdout='switch successful'");
  });
});

describe('extractCommandFromRawInput', () => {
  it('should extract command field from rawInput with standard JSON-like format', () => {
    const rawInput = '{"tool_name":"Bash","tool_input":{"command":"openpowers change new my-feature --desc \\"some description\\"","description":"run command"}}';
    const result = extractCommandFromRawInput(rawInput);
    expect(result).toBe('openpowers change new my-feature --desc \\"some description\\"');
  });

  it('should extract command with multi-line content', () => {
    const rawInput = '{"tool_name":"Bash","tool_input":{"command":"openpowers change new my-feature --desc \\"multi\\nline\\"","description":"run command"}}';
    const result = extractCommandFromRawInput(rawInput);
    expect(result).toBe('openpowers change new my-feature --desc \\"multi\\nline\\"');
  });

  it('should return undefined when command field is not present', () => {
    const rawInput = '{"tool_name":"Bash","tool_input":{"description":"run command"}}';
    const result = extractCommandFromRawInput(rawInput);
    expect(result).toBeUndefined();
  });

  it('should return undefined for empty input', () => {
    expect(extractCommandFromRawInput('')).toBeUndefined();
    expect(extractCommandFromRawInput('   ')).toBeUndefined();
  });

  it('should extract non-openpowers command', () => {
    const rawInput = '{"tool_input":{"command":"ls -la","description":"list files"}}';
    const result = extractCommandFromRawInput(rawInput);
    expect(result).toBe('ls -la');
  });
});

describe('extractChangeName', () => {
  it('should extract change name from standard change new command', () => {
    const result = extractChangeName('openpowers change new my-feature --desc "some description"');
    expect(result).toBe('my-feature');
  });

  it('should extract change name with extra flags', () => {
    const result = extractChangeName('openpowers change new my-feature --desc "desc" --other-flag');
    expect(result).toBe('my-feature');
  });

  it('should return null when command is not change new', () => {
    const result = extractChangeName('openpowers agents init --session abc');
    expect(result).toBeNull();
  });

  it('should return null for non-openpowers command', () => {
    const result = extractChangeName('ls -la');
    expect(result).toBeNull();
  });

  it('should extract kebab-case change name', () => {
    const result = extractChangeName('openpowers change new my-cool-feature --desc "test"');
    expect(result).toBe('my-cool-feature');
  });
});

describe('runBeforeBash', () => {
  let stderrSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    process.exitCode = undefined;
    stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    existsSyncMock.mockReturnValue(true);
    homedirMock.mockReturnValue('/mock/home');
  });

  it('should silently return when sessionId is missing', () => {
    runBeforeBash({
      sessionId: undefined,
      purpose: undefined,
      cwd: '/valid/path',
      prompt: undefined,
    }, '{"tool_input":{"command":"openpowers change new x","description":"d"}}');

    expect(execSyncMock).not.toHaveBeenCalled();
    expect(stderrSpy).not.toHaveBeenCalled();
  });

  it('should silently return when cwd is missing', () => {
    runBeforeBash({
      sessionId: 'abc-123',
      purpose: undefined,
      cwd: undefined,
      prompt: undefined,
    }, '{"tool_input":{"command":"openpowers change new x","description":"d"}}');

    expect(execSyncMock).not.toHaveBeenCalled();
    expect(stderrSpy).not.toHaveBeenCalled();
  });

  it('should silently return when cwd does not exist', () => {
    existsSyncMock.mockReturnValue(false);

    runBeforeBash({
      sessionId: 'abc-123',
      purpose: undefined,
      cwd: '/nonexistent',
      prompt: undefined,
    }, '{"tool_input":{"command":"openpowers change new x","description":"d"}}');

    expect(execSyncMock).not.toHaveBeenCalled();
    expect(stderrSpy).not.toHaveBeenCalled();
  });

  it('should silently return when rawInput has no command field', () => {
    runBeforeBash({
      sessionId: 'abc-123',
      purpose: undefined,
      cwd: '/valid/path',
      prompt: undefined,
    }, '{"tool_input":{"description":"no command here"}}');

    expect(execSyncMock).not.toHaveBeenCalled();
    expect(stderrSpy).not.toHaveBeenCalled();
  });

  it('should exit(0) without executing when command is not openpowers', () => {
    runBeforeBash({
      sessionId: 'abc-123',
      purpose: undefined,
      cwd: '/valid/path',
      prompt: undefined,
    }, '{"tool_input":{"command":"ls -la","description":"list files"}}');

    expect(execSyncMock).not.toHaveBeenCalled();
    expect(stderrSpy).not.toHaveBeenCalled();
  });

  it('should execute agents init with --change when command is openpowers change new', () => {
    execSyncMock.mockReturnValue('init successful');

    runBeforeBash({
      sessionId: 'sess-123',
      purpose: undefined,
      cwd: '/project',
      prompt: undefined,
    }, '{"tool_name":"Bash","tool_input":{"command":"openpowers change new my-feature --desc \\"some desc\\"","description":"run command"}}');

    expect(execSyncMock).toHaveBeenCalledTimes(1);
    const callArg = execSyncMock.mock.calls[0][0];
    expect(callArg).toContain('openpowers');
    expect(callArg).toContain('agents');
    expect(callArg).toContain('init');
    expect(callArg).toContain('--session');
    expect(callArg).toContain('sess-123');
    expect(callArg).toContain('--cwd');
    expect(callArg).toContain('/project');
    expect(callArg).toContain('--change');
    expect(callArg).toContain('my-feature');
  });

  it('should write log entries on successful execution', () => {
    execSyncMock.mockReturnValue('init successful');

    runBeforeBash({
      sessionId: 'log-test',
      purpose: undefined,
      cwd: '/project',
      prompt: undefined,
    }, '{"tool_input":{"command":"openpowers change new feat-x --desc \\"test\\"","description":"d"}}');

    const logLines = appendFileSyncMock.mock.calls.map((call: unknown[]) => call[1]) as string[];
    expect(logLines).toContainEqual(expect.stringContaining('Accepted hook request --- session-id: log-test'));
    expect(logLines).toContainEqual(expect.stringContaining('Accepted hook request --- change-name: feat-x'));
    expect(logLines).toContainEqual(expect.stringContaining('Running command:'));
    expect(logLines).toContainEqual(expect.stringContaining('--change'));
    expect(logLines).toContainEqual(expect.stringContaining('feat-x'));
    expect(logLines).toContainEqual(expect.stringContaining('Result of before-bash hook:'));
  });

  it('should log error result and not write to stderr when command execution fails', () => {
    const execError = Object.assign(new Error('command failed'), {
      stdout: '',
      stderr: 'agent not found',
      status: 1,
    });
    execSyncMock.mockImplementation(() => {
      throw execError;
    });

    runBeforeBash({
      sessionId: 'fail-test',
      purpose: undefined,
      cwd: '/project',
      prompt: undefined,
    }, '{"tool_input":{"command":"openpowers change new bad-feat --desc \\"test\\"","description":"d"}}');

    expect(stderrSpy).not.toHaveBeenCalled();
    expect(appendFileSyncMock).toHaveBeenCalled();
    const logLines = appendFileSyncMock.mock.calls.map((call: unknown[]) => call[1]) as string[];
    expect(logLines).toContainEqual(expect.stringContaining('Result of before-bash hook: returncode=1'));
    expect(logLines).toContainEqual(expect.stringContaining('agent not found'));
  });
});

describe('extractToolResponse', () => {
  it('should extract tool_response via JSON.parse when rawInput is valid JSON', () => {
    const toolResponse = {
      status: 'completed',
      prompt: 'test prompt',
      content: [{ type: 'text', text: 'response content' }],
    };
    const rawInput = JSON.stringify({
      session_id: 'sess-123',
      cwd: '/test/path',
      tool_use_id: 'tool-abc-123',
      tool_input: { prompt: 'test prompt' },
      tool_response: toolResponse,
    });

    const result = extractToolResponse(rawInput);

    expect(result).toEqual(toolResponse);
  });

  it('should extract tool_response via regex fallback when JSON.parse fails', () => {
    const rawInput = 'BOM\x00{"session_id":"sess-456","cwd":"/test",'
      + '"tool_response":{"status":"completed","content":[{"type":"text","text":"done"}]},'
      + '"tool_use_id":"tool-def-456"}\nmore junk';

    const result = extractToolResponse(rawInput);

    expect(result).toEqual({
      status: 'completed',
      content: [{ type: 'text', text: 'done' }],
    });
  });

  it('should return undefined when rawInput has no tool_response field', () => {
    const rawInput = JSON.stringify({
      session_id: 'sess-789',
      cwd: '/test',
      tool_use_id: 'tool-ghi',
    });

    const result = extractToolResponse(rawInput);

    expect(result).toBeUndefined();
  });

  it('should return undefined for empty input', () => {
    expect(extractToolResponse('')).toBeUndefined();
    expect(extractToolResponse('   ')).toBeUndefined();
  });
});

describe('writeOutputFile', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    homedirMock.mockReturnValue('/mock/home');
    existsSyncMock.mockReturnValue(true);
  });

  it('should write toolResponse JSON to sessions/<sessionId>/<toolUseId>.json', () => {
    const toolResponse = { status: 'completed', content: [{ type: 'text', text: 'done' }] };

    writeOutputFile('sess-abc', 'tool-xyz', toolResponse);

    const expectedPath = path.join('/mock/home', '.openpowers', 'sessions', 'sess-abc', 'tool-xyz.json');
    expect(writeFileSyncMock).toHaveBeenCalledWith(
      expectedPath,
      JSON.stringify(toolResponse, null, 2),
      'utf-8',
    );
  });

  it('should create session directory when it does not exist', () => {
    existsSyncMock.mockImplementation((p: string) => {
      if (p.includes('sessions') && p.includes('new-session')) return false;
      return true;
    });
    const toolResponse = { status: 'completed' };

    writeOutputFile('new-session', 'tool-123', toolResponse);

    const expectedDir = path.join('/mock/home', '.openpowers', 'sessions', 'new-session');
    expect(mkdirSyncMock).toHaveBeenCalledWith(expectedDir, { recursive: true });
    expect(writeFileSyncMock).toHaveBeenCalled();
  });

  it('should silently skip when toolResponse is null', () => {
    writeOutputFile('sess-abc', 'tool-xyz', null);

    expect(writeFileSyncMock).not.toHaveBeenCalled();
  });

  it('should silently skip when toolResponse is undefined', () => {
    writeOutputFile('sess-abc', 'tool-xyz', undefined);

    expect(writeFileSyncMock).not.toHaveBeenCalled();
  });

  it('should silently skip when toolUseId is empty', () => {
    const toolResponse = { status: 'completed' };

    writeOutputFile('sess-abc', '', toolResponse);

    expect(writeFileSyncMock).not.toHaveBeenCalled();
  });

  it('should handle file system errors gracefully', () => {
    writeFileSyncMock.mockImplementationOnce(() => {
      throw new Error('Permission denied');
    });
    const toolResponse = { status: 'completed' };

    expect(() => {
      writeOutputFile('sess-abc', 'tool-xyz', toolResponse);
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
      expect.stringContaining('Usage: node openpowers_hooks.js --before-agent|--after-agent|--init-agent|--before-propose|--before-bash'),
    );
    expect(process.exitCode).toBe(1);
  });

  it('should handle --before-agent with valid stdin and execute init, switch, and change stage commands', () => {
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

    expect(execSyncMock).toHaveBeenCalledTimes(3);
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
    // Third call: change stage command
    const stageCallArg = execSyncMock.mock.calls[2][0];
    expect(stageCallArg).toContain('change stage');
    expect(stageCallArg).toContain('explore');
    expect(stageCallArg).toContain('--status in_progress');
    expect(process.exitCode).toBeUndefined();
  });

  it('should handle --after-agent with valid stdin and execute init, workflow switch, and change stage', () => {
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

    expect(execSyncMock).toHaveBeenCalledTimes(3);
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
    // Third call: change stage with --status done
    const stageCallArg = execSyncMock.mock.calls[2][0];
    expect(stageCallArg).toContain('change stage');
    expect(stageCallArg).toContain('review');
    expect(stageCallArg).toContain('--status done');
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

    // writeLog calls: 3 accept logs + 1 Running init + 1 Result init + 1 Running switch + 1 Result switch
    // + 1 Running change stage + 1 Result change stage = 9
    expect(appendFileSyncMock).toHaveBeenCalledTimes(9);
    const logFile = path.join('/mock/home', '.openpowers', 'logs', 'hooks', 'hooks-log-test-1.log');

    const logLines = appendFileSyncMock.mock.calls.map((call: unknown[]) => call[1]) as string[];
    expect(logLines).toContainEqual(expect.stringContaining('Accepted hook request --- session-id: log-test-1'));
    expect(logLines).toContainEqual(expect.stringContaining('Accepted hook request --- openpowers-purpose: plan'));
    expect(logLines).toContainEqual(expect.stringContaining('Accepted hook request --- cwd: /test/cwd'));
    expect(logLines).toContainEqual(expect.stringContaining('Running command: openpowers agents init --session log-test-1 --cwd /test/cwd (cwd: /test/cwd)'));
    expect(logLines).toContainEqual(expect.stringContaining("Result of init-agent hook: returncode=0, stdout='switch successful', stderr=''"));
    expect(logLines).toContainEqual(expect.stringContaining('Running command: openpowers agents switch plan --session log-test-1 (cwd: /test/cwd)'));
    expect(logLines).toContainEqual(expect.stringContaining("Result of switch-agent hook: returncode=0, stdout='switch successful', stderr=''"));
    expect(logLines).toContainEqual(expect.stringContaining('change stage'));

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

  // --init-agent specific tests
  it('should handle --init-agent with valid prompt and execute init command', () => {
    process.argv = ['node', '/fake/path/script.js', '--init-agent'];
    const stdinJson = JSON.stringify({
      session_id: 'init-123',
      cwd: '/valid/path',
      prompt: '/openpowers:workflow',
    });
    mockStdin(stdinJson);
    execSyncMock.mockReturnValue('init successful');

    main();

    expect(execSyncMock).toHaveBeenCalledTimes(2);
    const callArg = execSyncMock.mock.calls[0][0];
    expect(callArg).toContain('openpowers');
    expect(callArg).toContain('agents init');
    expect(callArg).toContain('--session');
    expect(callArg).toContain('init-123');
    expect(callArg).toContain('--cwd');
    expect(callArg).toContain('/valid/path');
    expect(stderrSpy).not.toHaveBeenCalled();
    expect(process.exitCode).toBeUndefined();
  });

  it('should silently return when --init-agent prompt does not match /openpowers:workflow prefix', () => {
    process.argv = ['node', '/fake/path/script.js', '--init-agent'];
    const stdinJson = JSON.stringify({
      session_id: 'abc-123',
      cwd: '/valid/path',
      prompt: '/other-command',
    });
    mockStdin(stdinJson);

    main();

    expect(execSyncMock).not.toHaveBeenCalled();
    expect(stderrSpy).not.toHaveBeenCalled();
    expect(process.exitCode).toBeUndefined();
  });

  it('should silently return when --init-agent session_id is missing', () => {
    process.argv = ['node', '/fake/path/script.js', '--init-agent'];
    const stdinJson = JSON.stringify({
      cwd: '/valid/path',
      prompt: '/openpowers:workflow',
    });
    mockStdin(stdinJson);

    main();

    expect(execSyncMock).not.toHaveBeenCalled();
    expect(stderrSpy).not.toHaveBeenCalled();
    expect(process.exitCode).toBeUndefined();
  });

  it('should silently return when --init-agent cwd does not exist', () => {
    process.argv = ['node', '/fake/path/script.js', '--init-agent'];
    const stdinJson = JSON.stringify({
      session_id: 'abc-123',
      cwd: '/nonexistent/path',
      prompt: '/openpowers:workflow',
    });
    mockStdin(stdinJson);
    existsSyncMock.mockReturnValue(false);

    main();

    expect(execSyncMock).not.toHaveBeenCalled();
    expect(stderrSpy).not.toHaveBeenCalled();
    expect(process.exitCode).toBeUndefined();
  });

  it('should handle --before-propose with valid stdin and execute init then switch-propose commands', () => {
    process.argv = ['node', '/fake/path/script.js', '--before-propose'];
    const stdinJson = JSON.stringify({
      session_id: 'prop-routing',
      cwd: '/home/user/project',
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
    expect(initCallArg).toContain('prop-routing');
    expect(initCallArg).toContain('--cwd');
    expect(initCallArg).toContain('/home/user/project');
    // Second call: switch to propose
    const switchCallArg = execSyncMock.mock.calls[1][0];
    expect(switchCallArg).toContain('openpowers');
    expect(switchCallArg).toContain('agents switch');
    expect(switchCallArg).toContain('propose');
    expect(switchCallArg).toContain('--session');
    expect(switchCallArg).toContain('prop-routing');
    expect(stderrSpy).not.toHaveBeenCalled();
    expect(process.exitCode).toBeUndefined();

    // Verify 7 log entries
    expect(appendFileSyncMock).toHaveBeenCalledTimes(7);
    const logLines = appendFileSyncMock.mock.calls.map((call: unknown[]) => call[1]) as string[];
    expect(logLines[1]).toContain('Accepted hook request --- openpowers-purpose: propose');
  });

  it('should handle --before-bash with openpowers change new command and execute agents init with --change', () => {
    process.argv = ['node', '/fake/path/script.js', '--before-bash'];
    const stdinJson = '{"tool_name":"Bash","tool_input":{"command":"openpowers change new my-feature --desc \\"some description\\"","description":"run command"},"session_id":"bash-sess-001","cwd":"/home/user/project"}';
    mockStdin(stdinJson);
    execSyncMock.mockReturnValue('init successful');

    main();

    expect(execSyncMock).toHaveBeenCalledTimes(1);
    const callArg = execSyncMock.mock.calls[0][0];
    expect(callArg).toContain('openpowers');
    expect(callArg).toContain('agents');
    expect(callArg).toContain('init');
    expect(callArg).toContain('--session');
    expect(callArg).toContain('bash-sess-001');
    expect(callArg).toContain('--cwd');
    expect(callArg).toContain('/home/user/project');
    expect(callArg).toContain('--change');
    expect(callArg).toContain('my-feature');
    expect(stderrSpy).not.toHaveBeenCalled();
    expect(process.exitCode).toBeUndefined();
  });

  it('should silently skip when --before-bash command is not openpowers', () => {
    process.argv = ['node', '/fake/path/script.js', '--before-bash'];
    const stdinJson = '{"tool_input":{"command":"ls -la","description":"list files"},"session_id":"bash-sess-002","cwd":"/home/user/project"}';
    mockStdin(stdinJson);

    main();

    expect(execSyncMock).not.toHaveBeenCalled();
    expect(stderrSpy).not.toHaveBeenCalled();
    expect(process.exitCode).toBeUndefined();
  });

  it('should silently skip when --before-bash stdin has no command field', () => {
    process.argv = ['node', '/fake/path/script.js', '--before-bash'];
    const stdinJson = '{"tool_input":{"description":"no command"},"session_id":"bash-sess-003","cwd":"/home/user/project"}';
    mockStdin(stdinJson);

    main();

    expect(execSyncMock).not.toHaveBeenCalled();
    expect(stderrSpy).not.toHaveBeenCalled();
    expect(process.exitCode).toBeUndefined();
  });

  it('should silently skip when --before-bash command is openpowers but not change new', () => {
    process.argv = ['node', '/fake/path/script.js', '--before-bash'];
    const stdinJson = '{"tool_input":{"command":"openpowers agents list","description":"list agents"},"session_id":"bash-sess-004","cwd":"/home/user/project"}';
    mockStdin(stdinJson);

    main();

    expect(execSyncMock).not.toHaveBeenCalled();
    expect(stderrSpy).not.toHaveBeenCalled();
    expect(process.exitCode).toBeUndefined();
  });
});
