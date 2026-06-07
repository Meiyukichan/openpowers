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
const mockReadMemoryChangesJson = vi.fn();
const mockReadSessionSettings = vi.fn();

vi.mock('../../utils/memory.js', () => ({
  createOrUpdateChange: mockCreateOrUpdateChange,
  readMemoryChangesJson: mockReadMemoryChangesJson,
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

    // Default setup: an active change with in-progress features
    mockFs.setFile('/test/project/openpowers/changes.json', JSON.stringify({
      name: 'openpowers',
      changes: [{ name: 'my-change', path: 'openpowers/changes/my-change' }],
      archive: [],
    }));
    mockFs.setFile('/test/project/openpowers/changes/my-change/plan.json', JSON.stringify([
      { featureId: 'feat-1', status: 'in_progress' },
    ]));

    // Default: no stage field on the entry (explore dispatch will treat as explore)
    mockReadMemoryChangesJson.mockReturnValue({
      framework: 'openpowers',
      version: '1.0.0',
      cwd: '/test/project',
      changes: [{ name: 'my-change' }],
    });

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

  it('should reject old stage names brainstorm, reviewArtifacts, subAgentDev', () => {
    const oldNames = ['brainstorm', 'reviewArtifacts', 'subAgentDev'];
    for (const oldName of oldNames) {
      vi.clearAllMocks();
      mockReadSessionSettings.mockReturnValue({
        sessionId: 'abc',
        cwd: '/test/project',
        currentProvider: 'explore',
        switchProviders: {},
        change: 'my-change',
      });
      expect(() => runChangeStage(oldName, { session: 'abc', status: 'in_progress' })).toThrow('process.exit called');
      expect(stderrWriteSpy).toHaveBeenCalled();
    }
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

  it('should accept review as valid stage-name and map to reviewArtifacts field', () => {
    mockReadSessionSettings.mockReturnValue({
      sessionId: 'abc',
      cwd: '/test/project',
      currentProvider: 'explore',
      switchProviders: {},
      change: 'my-change',
    });
    expect(() => runChangeStage('review', { session: 'abc', status: 'in_progress' })).not.toThrow();
    expect(mockCreateOrUpdateChange).toHaveBeenCalledWith(
      '/test/project',
      'my-change',
      undefined,
      expect.objectContaining({
        reviewArtifacts: expect.objectContaining({
          status: 'in_progress',
        }),
      }),
    );
  });

  it('should accept coding as valid stage-name and map to subAgentDev field', () => {
    mockReadSessionSettings.mockReturnValue({
      sessionId: 'abc',
      cwd: '/test/project',
      currentProvider: 'explore',
      switchProviders: {},
      change: 'my-change',
    });
    expect(() => runChangeStage('coding', { session: 'abc', status: 'in_progress' })).not.toThrow();
    expect(mockCreateOrUpdateChange).toHaveBeenCalledWith(
      '/test/project',
      'my-change',
      undefined,
      expect.objectContaining({
        subAgentDev: expect.any(Array),
      }),
    );
  });

  it('should accept all valid stage names', () => {
    const validStages = ['workflow', 'explore', 'propose', 'plan', 'review', 'coding', 'finalize', 'integration'];
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
      if (stage !== 'workflow') {
        expect(mockCreateOrUpdateChange).toHaveBeenCalled();
      } else {
        expect(mockCreateOrUpdateChange).not.toHaveBeenCalled();
      }
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

  // =========================================================
  // Change end detection tests
  // =========================================================
  it('should block non-finalize stages when change not in changes.json', () => {
    // Set up changes.json without 'my-change'
    mockFs.setFile('/test/project/openpowers/changes.json', JSON.stringify({
      name: 'openpowers',
      changes: [],
      archive: [],
    }));
    mockReadSessionSettings.mockReturnValue({
      sessionId: 'abc',
      cwd: '/test/project',
      currentProvider: 'explore',
      switchProviders: {},
      change: 'my-change',
    });
    expect(() => runChangeStage('explore', { session: 'abc', status: 'in_progress' })).not.toThrow();
    expect(mockCreateOrUpdateChange).not.toHaveBeenCalled();
    const stdoutCalls = stdoutWriteSpy.mock.calls.map((c: unknown[]) => String(c[0]));
    expect(stdoutCalls.some((s: string) => s.includes('has ended') || s.includes('only finalize/integration'))).toBe(true);
  });

  it('should allow finalize stage when change not in changes.json', () => {
    mockFs.setFile('/test/project/openpowers/changes.json', JSON.stringify({
      name: 'openpowers',
      changes: [],
      archive: [],
    }));
    mockReadSessionSettings.mockReturnValue({
      sessionId: 'abc',
      cwd: '/test/project',
      currentProvider: 'explore',
      switchProviders: {},
      change: 'my-change',
    });
    expect(() => runChangeStage('finalize', { session: 'abc', status: 'in_progress' })).not.toThrow();
    expect(mockCreateOrUpdateChange).toHaveBeenCalled();
  });

  it('should allow integration stage when change not in changes.json', () => {
    mockFs.setFile('/test/project/openpowers/changes.json', JSON.stringify({
      name: 'openpowers',
      changes: [],
      archive: [],
    }));
    mockReadSessionSettings.mockReturnValue({
      sessionId: 'abc',
      cwd: '/test/project',
      currentProvider: 'explore',
      switchProviders: {},
      change: 'my-change',
    });
    expect(() => runChangeStage('integration', { session: 'abc', status: 'in_progress' })).not.toThrow();
    expect(mockCreateOrUpdateChange).toHaveBeenCalled();
  });

  it('should block non-finalize stages when plan.json features are all done', () => {
    // Set up changes.json WITH 'my-change'
    mockFs.setFile('/test/project/openpowers/changes.json', JSON.stringify({
      name: 'openpowers',
      changes: [{ name: 'my-change', path: 'openpowers/changes/my-change' }],
      archive: [],
    }));
    // Set up plan.json with all features done
    mockFs.setFile('/test/project/openpowers/changes/my-change/plan.json', JSON.stringify([
      { featureId: 'feat-1', status: 'done' },
      { featureId: 'feat-2', status: 'done' },
    ]));
    mockReadSessionSettings.mockReturnValue({
      sessionId: 'abc',
      cwd: '/test/project',
      currentProvider: 'explore',
      switchProviders: {},
      change: 'my-change',
    });
    expect(() => runChangeStage('explore', { session: 'abc', status: 'in_progress' })).not.toThrow();
    expect(mockCreateOrUpdateChange).not.toHaveBeenCalled();
    const stdoutCalls = stdoutWriteSpy.mock.calls.map((c: unknown[]) => String(c[0]));
    expect(stdoutCalls.some((s: string) => s.includes('has ended') || s.includes('only finalize/integration'))).toBe(true);
  });

  it('should proceed normally when change is active and has in_progress features', () => {
    mockFs.setFile('/test/project/openpowers/changes.json', JSON.stringify({
      name: 'openpowers',
      changes: [{ name: 'my-change', path: 'openpowers/changes/my-change' }],
      archive: [],
    }));
    mockFs.setFile('/test/project/openpowers/changes/my-change/plan.json', JSON.stringify([
      { featureId: 'feat-1', status: 'done' },
      { featureId: 'feat-2', status: 'in_progress' },
    ]));
    mockReadSessionSettings.mockReturnValue({
      sessionId: 'abc',
      cwd: '/test/project',
      currentProvider: 'explore',
      switchProviders: {},
      change: 'my-change',
    });
    expect(() => runChangeStage('explore', { session: 'abc', status: 'in_progress' })).not.toThrow();
    expect(mockCreateOrUpdateChange).toHaveBeenCalled();
  });

  // =========================================================
  // Explore dispatch tests (handleExploreStageDispatch)
  // =========================================================
  it('should dispatch explore to explore when entry stage is empty', () => {
    // Default setup in beforeEach: entry has no stage field
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
      expect.objectContaining({ explore: expect.any(Object) }),
    );
  });

  it('should dispatch explore to explore when only explore has value and status is not done', () => {
    mockReadMemoryChangesJson.mockReturnValue({
      framework: 'openpowers',
      version: '1.0.0',
      cwd: '/test/project',
      changes: [{
        name: 'my-change',
        stage: {
          explore: { title: 'E', from: '', to: '', status: 'in_progress' },
        },
      }],
    });
    mockReadSessionSettings.mockReturnValue({
      sessionId: 'abc',
      cwd: '/test/project',
      currentProvider: 'explore',
      switchProviders: {},
      change: 'my-change',
    });
    expect(() => runChangeStage('explore', { session: 'abc', status: 'done' })).not.toThrow();
    expect(mockCreateOrUpdateChange).toHaveBeenCalledWith(
      '/test/project',
      'my-change',
      undefined,
      expect.objectContaining({ explore: expect.any(Object) }),
    );
  });

  it('should dispatch explore to explore when plan.json does not exist', () => {
    // Remove plan.json
    mockFs.reset();
    mockFs.setFile('/test/project/openpowers/changes.json', JSON.stringify({
      name: 'openpowers',
      changes: [{ name: 'my-change', path: 'openpowers/changes/my-change' }],
      archive: [],
    }));
    // Entry has other stages beyond explore
    mockReadMemoryChangesJson.mockReturnValue({
      framework: 'openpowers',
      version: '1.0.0',
      cwd: '/test/project',
      changes: [{
        name: 'my-change',
        stage: {
          explore: { title: 'E', from: '', to: '', status: 'done' },
          propose: { title: 'P', from: '', to: '', status: 'done' },
        },
      }],
    });
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
      expect.objectContaining({ explore: expect.any(Object) }),
    );
  });

  it('should dispatch explore to coding when plan.json exists and entry has non-explore stages', () => {
    // Entry has stages beyond explore, and plan.json exists
    mockReadMemoryChangesJson.mockReturnValue({
      framework: 'openpowers',
      version: '1.0.0',
      cwd: '/test/project',
      changes: [{
        name: 'my-change',
        stage: {
          explore: { title: 'E', from: '', to: '', status: 'done' },
          propose: { title: 'P', from: '', to: '', status: 'done' },
          plan: { title: 'PL', from: '', to: '', status: 'done' },
        },
      }],
    });
    mockReadSessionSettings.mockReturnValue({
      sessionId: 'abc',
      cwd: '/test/project',
      currentProvider: 'explore',
      switchProviders: {},
      change: 'my-change',
    });
    expect(() => runChangeStage('explore', { session: 'abc', status: 'in_progress', title: 'Coding Step' })).not.toThrow();
    expect(mockCreateOrUpdateChange).toHaveBeenCalledWith(
      '/test/project',
      'my-change',
      undefined,
      expect.objectContaining({
        subAgentDev: expect.arrayContaining([
          expect.objectContaining({
            featureId: 'feat-1',
            progress: expect.arrayContaining([
              expect.objectContaining({
                title: 'Coding Step',
                status: 'in_progress',
              }),
            ]),
          }),
        ]),
      }),
    );
  });

  it('should dispatch explore to coding with empty featureId when no in_progress feature', () => {
    // Override plan.json: no in_progress features (skipped is not in_progress and not done-all)
    mockFs.setFile('/test/project/openpowers/changes/my-change/plan.json', JSON.stringify([
      { featureId: 'feat-1', status: 'skipped' },
    ]));
    mockReadMemoryChangesJson.mockReturnValue({
      framework: 'openpowers',
      version: '1.0.0',
      cwd: '/test/project',
      changes: [{
        name: 'my-change',
        stage: {
          explore: { title: 'E', from: '', to: '', status: 'done' },
          propose: { title: 'P', from: '', to: '', status: 'done' },
        },
      }],
    });
    mockReadSessionSettings.mockReturnValue({
      sessionId: 'abc',
      cwd: '/test/project',
      currentProvider: 'explore',
      switchProviders: {},
      change: 'my-change',
    });
    expect(() => runChangeStage('explore', { session: 'abc', status: 'in_progress', title: 'Step' })).not.toThrow();
    expect(mockCreateOrUpdateChange).toHaveBeenCalledWith(
      '/test/project',
      'my-change',
      undefined,
      expect.objectContaining({
        subAgentDev: expect.arrayContaining([
          expect.objectContaining({
            featureId: '',
            progress: expect.any(Array),
          }),
        ]),
      }),
    );
  });

  it('should dispatch coding stage with featureId inference from plan.json', () => {
    mockReadSessionSettings.mockReturnValue({
      sessionId: 'abc',
      cwd: '/test/project',
      currentProvider: 'explore',
      switchProviders: {},
      change: 'my-change',
    });
    expect(() => runChangeStage('coding', { session: 'abc', status: 'in_progress', title: 'TDD-Red' })).not.toThrow();
    expect(mockCreateOrUpdateChange).toHaveBeenCalledWith(
      '/test/project',
      'my-change',
      undefined,
      expect.objectContaining({
        subAgentDev: expect.arrayContaining([
          expect.objectContaining({
            featureId: 'feat-1',
            progress: expect.arrayContaining([
              expect.objectContaining({
                title: 'TDD-Red',
                status: 'in_progress',
              }),
            ]),
          }),
        ]),
      }),
    );
  });

  it('should dispatch coding stage with empty featureId when no in_progress feature in plan.json', () => {
    mockFs.setFile('/test/project/openpowers/changes/my-change/plan.json', JSON.stringify([
      { featureId: 'feat-1', status: 'skipped' },
    ]));
    mockReadSessionSettings.mockReturnValue({
      sessionId: 'abc',
      cwd: '/test/project',
      currentProvider: 'explore',
      switchProviders: {},
      change: 'my-change',
    });
    expect(() => runChangeStage('coding', { session: 'abc', status: 'done', title: 'Completed' })).not.toThrow();
    expect(mockCreateOrUpdateChange).toHaveBeenCalledWith(
      '/test/project',
      'my-change',
      undefined,
      expect.objectContaining({
        subAgentDev: expect.arrayContaining([
          expect.objectContaining({
            featureId: '',
          }),
        ]),
      }),
    );
  });
});
