/**
 * @fileoverview Tests for change/stage.ts runChangeStage
 * @author Meiyuki <meiyukichan@163.com>
 * @copyright 2026 Meiyuki
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Hoisted mocks
const { mockLogger } = vi.hoisted(() => ({
  mockLogger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

const { mockFs, mockOs } = vi.hoisted(() => {
  const fileSystem: Record<string, string> = {};
  const dirSet = new Set<string>();

  function setFile(pathStr: string, content: string) {
    fileSystem[pathStr.replace(/\\/g, '/')] = content;
    const parts = pathStr.replace(/\\/g, '/').split('/');
    for (let i = 1; i < parts.length; i++) {
      dirSet.add(parts.slice(0, i).join('/'));
    }
  }

  function reset() {
    Object.keys(fileSystem).forEach((k) => delete fileSystem[k]);
    dirSet.clear();
  }

  return {
    mockFs: {
      fileSystem,
      dirSet,
      setFile,
      reset,
      existsSync: vi.fn((p: string) => {
        const normalized = p.replace(/\\/g, '/');
        return normalized in fileSystem || dirSet.has(normalized);
      }),
      readFileSync: vi.fn((p: string, _encoding?: string) => {
        const normalized = p.replace(/\\/g, '/');
        if (normalized in fileSystem) return fileSystem[normalized];
        throw new Error(`ENOENT: ${p}`);
      }),
      writeFileSync: vi.fn(),
      mkdirSync: vi.fn(),
    },
    mockOs: {
      homedir: vi.fn(() => '/home/test-user'),
    },
  };
});

vi.mock('fs', () => ({
  default: mockFs,
}));

vi.mock('os', () => ({
  default: mockOs,
}));

vi.mock('../../utils/logger.js', () => ({
  logger: mockLogger,
}));

// Mock createOrUpdateChange
const mockCreateOrUpdateChange = vi.fn();
const mockReadSessionSettings = vi.fn();

vi.mock('../../utils/memory.js', () => ({
  createOrUpdateChange: mockCreateOrUpdateChange,
}));

vi.mock('../../utils/session.js', () => ({
  readSessionSettings: mockReadSessionSettings,
}));

describe('src/commands/change/stage.ts', () => {
  let runChangeStage: (stageName: string, options: Record<string, string>) => void;
  let stdoutWriteSpy: ReturnType<typeof vi.spyOn>;
  let stderrWriteSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    vi.resetAllMocks();
    mockFs.reset();

    stdoutWriteSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    stderrWriteSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    vi.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('process.exit called');
    }) as never);

    const mod = await import('./stage.js');
    runChangeStage = mod.runChangeStage;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should error when --session is missing', () => {
    expect(() => runChangeStage('explore', { status: 'in_progress' })).toThrow('process.exit called');
    expect(stderrWriteSpy).toHaveBeenCalled();
    const stderrCalls = stderrWriteSpy.mock.calls.map((c: unknown[]) => String(c[0]));
    expect(stderrCalls.some((s: string) => s.includes('--session'))).toBe(true);
  });

  it('should error when --status is missing', () => {
    expect(() => runChangeStage('explore', { session: 'abc' })).toThrow('process.exit called');
    expect(stderrWriteSpy).toHaveBeenCalled();
    const stderrCalls = stderrWriteSpy.mock.calls.map((c: unknown[]) => String(c[0]));
    expect(stderrCalls.some((s: string) => s.includes('--status'))).toBe(true);
  });

  it('should error when --status is invalid', () => {
    expect(() => runChangeStage('explore', { session: 'abc', status: 'invalid_value' })).toThrow('process.exit called');
    expect(stderrWriteSpy).toHaveBeenCalled();
    const stderrCalls = stderrWriteSpy.mock.calls.map((c: unknown[]) => String(c[0]));
    expect(stderrCalls.some((s: string) => s.includes('Invalid status'))).toBe(true);
  });

  it('should error when session does not exist', () => {
    mockReadSessionSettings.mockReturnValue(null);
    expect(() => runChangeStage('explore', { session: 'nonexistent', status: 'in_progress' })).toThrow('process.exit called');
    expect(stderrWriteSpy).toHaveBeenCalled();
  });

  it('should error when session has no change field', () => {
    mockReadSessionSettings.mockReturnValue({
      sessionId: 'abc',
      cwd: '/test/project',
      currentProvider: 'explore',
      switchProviders: {},
      change: '',
    });
    expect(() => runChangeStage('explore', { session: 'abc', status: 'in_progress' })).toThrow('process.exit called');
    expect(stderrWriteSpy).toHaveBeenCalled();
  });

  it('should error for invalid stage-name', () => {
    mockReadSessionSettings.mockReturnValue({
      sessionId: 'abc',
      cwd: '/test/project',
      currentProvider: 'explore',
      switchProviders: {},
      change: 'my-change',
    });
    expect(() => runChangeStage('unknown', { session: 'abc', status: 'in_progress' })).toThrow('process.exit called');
    expect(stderrWriteSpy).toHaveBeenCalled();
    const stderrCalls = stderrWriteSpy.mock.calls.map((c: unknown[]) => String(c[0]));
    expect(stderrCalls.some((s: string) => s.includes('Valid stages'))).toBe(true);
  });

  it('should accept explore as valid stage-name', () => {
    mockReadSessionSettings.mockReturnValue({
      sessionId: 'abc',
      cwd: '/test/project',
      currentProvider: 'explore',
      switchProviders: {},
      change: 'my-change',
    });
    expect(() => runChangeStage('explore', { session: 'abc', status: 'in_progress' })).not.toThrow();
    expect(mockCreateOrUpdateChange).toHaveBeenCalledWith(
      '/test/project',
      'my-change',
      undefined,
      expect.objectContaining({
        explore: expect.objectContaining({
          status: 'in_progress',
          title: '',
          inputPath: '',
          outputPath: '',
        }),
      }),
    );
    expect(stdoutWriteSpy).toHaveBeenCalled();
  });

  it('should accept all valid stage names', () => {
    const validStages = ['explore', 'brainstorm', 'propose', 'plan', 'reviewArtifacts', 'subAgentDev', 'finalize', 'integration'];
    for (const stage of validStages) {
      vi.clearAllMocks();
      mockReadSessionSettings.mockReturnValue({
        sessionId: 'abc',
        cwd: '/test/project',
        currentProvider: 'explore',
        switchProviders: {},
        change: 'my-change',
      });
      expect(() => runChangeStage(stage, { session: 'abc', status: 'in_progress' })).not.toThrow();
      expect(mockCreateOrUpdateChange).toHaveBeenCalled();
    }
  });

  it('should combine full parameters into changeStage correctly', () => {
    mockReadSessionSettings.mockReturnValue({
      sessionId: 'abc',
      cwd: '/test/project',
      currentProvider: 'explore',
      switchProviders: {},
      change: 'my-change',
    });
    expect(() =>
      runChangeStage('explore', {
        session: 'abc',
        status: 'done',
        title: 'Explore Phase',
        input: '/path/in',
        output: '/path/out',
      }),
    ).not.toThrow();

    expect(mockCreateOrUpdateChange).toHaveBeenCalledWith(
      '/test/project',
      'my-change',
      undefined,
      {
        explore: {
          title: 'Explore Phase',
          inputPath: '/path/in',
          outputPath: '/path/out',
          from: expect.any(String),
          to: expect.any(String),
          status: 'done',
        },
      },
    );
  });

  it('should map integration to finalize.integration', () => {
    mockReadSessionSettings.mockReturnValue({
      sessionId: 'abc',
      cwd: '/test/project',
      currentProvider: 'explore',
      switchProviders: {},
      change: 'my-change',
    });
    expect(() =>
      runChangeStage('integration', {
        session: 'abc',
        status: 'in_progress',
        title: 'Integration Step',
      }),
    ).not.toThrow();

    expect(mockCreateOrUpdateChange).toHaveBeenCalledWith(
      '/test/project',
      'my-change',
      undefined,
      expect.objectContaining({
        finalize: expect.objectContaining({
          integration: expect.objectContaining({
            title: 'Integration Step',
            status: 'in_progress',
          }),
        }),
      }),
    );
  });
});
