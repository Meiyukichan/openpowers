/**
 * @fileoverview Tests for change/feature.ts -- feature lifecycle management
 * @author Meiyuki <meiyukichan@163.com>
 * @copyright 2026 Meiyuki
 */

import path from 'path';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

type DirEntry = { name: string; isDirectory: () => boolean; isFile: () => boolean };

// Hoisted mocks
const { mockLogger } = vi.hoisted(() => ({
  mockLogger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

const { mockFs } = vi.hoisted(() => {
  const fileSystem: Record<string, string> = {};
  const dirSet = new Set<string>();

  function setFile(pathStr: string, content: string) {
    fileSystem[pathStr.replace(/\\/g, '/')] = content;
    const parts = pathStr.replace(/\\/g, '/').split('/');
    for (let i = 1; i < parts.length; i++) {
      dirSet.add(parts.slice(0, i).join('/'));
    }
  }

  function setDir(dirPath: string) {
    dirSet.add(dirPath.replace(/\\/g, '/'));
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
      setDir,
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
      writeFileSync: vi.fn((p: string, content: string) => {
        fileSystem[p.replace(/\\/g, '/')] = content;
      }),
      mkdirSync: vi.fn((p: string) => {
        setDir(p);
      }),
      readdirSync: vi.fn(() => {
        return [] as DirEntry[];
      }),
      cpSync: vi.fn((src: string, dest: string) => {
        const srcNorm = src.replace(/\\/g, '/');
        const destNorm = dest.replace(/\\/g, '/');
        if (!(srcNorm in fileSystem)) {
          throw new Error(`ENOENT: ${src}`);
        }
        fileSystem[destNorm] = fileSystem[srcNorm];
        const parts = destNorm.split('/');
        for (let i = 1; i < parts.length; i++) {
          dirSet.add(parts.slice(0, i).join('/'));
        }
      }),
      appendFileSync: vi.fn((p: string, content: string) => {
        const normalized = p.replace(/\\/g, '/');
        if (!(normalized in fileSystem)) {
          fileSystem[normalized] = '';
        }
        fileSystem[normalized] += content;
        const parts = normalized.split('/');
        for (let i = 1; i < parts.length; i++) {
          dirSet.add(parts.slice(0, i).join('/'));
        }
      }),
    },
  };
});

vi.mock('fs', () => ({
  default: mockFs,
}));

vi.mock('../../utils/logger.js', () => ({
  logger: mockLogger,
}));


// Hoisted mock for http module
const { mockHttp } = vi.hoisted(() => {
  const mockRequest = vi.fn();
  let mockResponse: { statusCode: number } = { statusCode: 200 };
  let shouldThrow = false;

  return {
    mockHttp: {
      request: mockRequest,
      _setResponse: (resp: { statusCode: number }) => { mockResponse = resp; },
      _setThrow: (should: boolean) => { shouldThrow = should; },
      _reset: () => {
        mockRequest.mockReset();
        mockResponse = { statusCode: 200 };
        shouldThrow = false;
      },
      _getMockRequest: () => mockRequest,
      _getMockResponse: () => mockResponse,
      _getShouldThrow: () => shouldThrow,
    },
  };
});

vi.mock('http', () => ({
  default: {
    request: mockHttp._getMockRequest(),
  },
  request: mockHttp._getMockRequest(),
}));

// =========================================================
// Helper to create feature test data
// =========================================================
function makeFeature(overrides: Record<string, unknown> = {}) {
  return {
    id: 'feat-001',
    category: 'commands',
    function: 'test-func',
    description: 'Test feature description',
    acceptance_criteria: ['AC1: must work'],
    tasks: ['1.1 do something', '1.2 do another'],
    files: ['src/foo.ts'],
    dependencies: [],
    spec_refs: ['openspec/changes/test/spec.md'],
    status: 'pending',
    ...overrides,
  };
}

// =========================================================
// status command tests
// =========================================================
describe('runFeatureStatus', () => {
  const CHANGES_DIR = path.join(process.cwd(), 'furina', 'changes');

  let stdoutWriteSpy: ReturnType<typeof vi.spyOn>;
  let stderrWriteSpy: ReturnType<typeof vi.spyOn>;
  let exitSpy: ReturnType<typeof vi.spyOn>;
  let runFeatureStatus: (changeName: string) => void;

  beforeEach(async () => {
    vi.resetAllMocks();
    mockFs.reset();
    stdoutWriteSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    stderrWriteSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('process.exit called');
    }) as never);
    const mod = await import('./feature.js');
    runFeatureStatus = mod.runFeatureStatus;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should print status summary with mixed states', () => {
    const planPath = path.join(CHANGES_DIR, 'my-change', 'plan.json');
    mockFs.setDir(path.join(CHANGES_DIR, 'my-change'));
    mockFs.setFile(planPath, JSON.stringify([
      makeFeature({ id: 'f1', status: 'done' }),
      makeFeature({ id: 'f2', status: 'done' }),
      makeFeature({ id: 'f3', status: 'in_progress' }),
      makeFeature({ id: 'f4', status: 'pending' }),
      makeFeature({ id: 'f5', status: 'pending', dependencies: ['f99'] }),
    ]));

    runFeatureStatus('my-change');

    const stdoutCalls = stdoutWriteSpy.mock.calls.map((c: unknown[]) => String(c[0]));
    const output = stdoutCalls.join('');
    expect(output).toContain('Feature List Status:');
    expect(output).toContain('Total: 5');
    expect(output).toContain('Done: 2');
    expect(output).toContain('In Progress: 1');
    expect(output).toContain('Pending: 2');
    expect(output).toContain('Blocked: 1');
    expect(output).toContain('Skipped: 0');
    expect(output).toContain('Progress: 40.0%');
    expect(output).toContain('Currently in progress:');
    expect(output).toContain('- f3: test-func');
  });

  it('should exit with error when plan.json does not exist', () => {
    expect(() => runFeatureStatus('my-change')).toThrow('process.exit called');
    expect(exitSpy).toHaveBeenCalledWith(1);

    const stderrCalls = stderrWriteSpy.mock.calls.map((c: unknown[]) => String(c[0]));
    expect(stderrCalls.some((c: string) => c.includes('No plan.json found'))).toBe(true);
  });

  it('should exit with error on invalid (non-kebab-case) change name', () => {
    expect(() => runFeatureStatus('Invalid_Name')).toThrow('process.exit called');
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('should show 0.0% progress when no features are done', () => {
    const planPath = path.join(CHANGES_DIR, 'my-change', 'plan.json');
    mockFs.setDir(path.join(CHANGES_DIR, 'my-change'));
    mockFs.setFile(planPath, JSON.stringify([
      makeFeature({ id: 'f1', status: 'pending' }),
      makeFeature({ id: 'f2', status: 'pending' }),
    ]));

    runFeatureStatus('my-change');

    const stdoutCalls = stdoutWriteSpy.mock.calls.map((c: unknown[]) => String(c[0]));
    const output = stdoutCalls.join('');
    expect(output).toContain('Progress: 0.0%');
    expect(output).toContain('Done: 0');
  });

  it('should show 100.0% progress when all features are done', () => {
    const planPath = path.join(CHANGES_DIR, 'my-change', 'plan.json');
    mockFs.setDir(path.join(CHANGES_DIR, 'my-change'));
    mockFs.setFile(planPath, JSON.stringify([
      makeFeature({ id: 'f1', status: 'done' }),
      makeFeature({ id: 'f2', status: 'done' }),
    ]));

    runFeatureStatus('my-change');

    const stdoutCalls = stdoutWriteSpy.mock.calls.map((c: unknown[]) => String(c[0]));
    const output = stdoutCalls.join('');
    expect(output).toContain('Progress: 100.0%');
    expect(output).toContain('Done: 2');
  });

  it('should count skipped features', () => {
    const planPath = path.join(CHANGES_DIR, 'my-change', 'plan.json');
    mockFs.setDir(path.join(CHANGES_DIR, 'my-change'));
    mockFs.setFile(planPath, JSON.stringify([
      makeFeature({ id: 'f1', status: 'skipped' }),
      makeFeature({ id: 'f2', status: 'done' }),
    ]));

    runFeatureStatus('my-change');

    const stdoutCalls = stdoutWriteSpy.mock.calls.map((c: unknown[]) => String(c[0]));
    const output = stdoutCalls.join('');
    expect(output).toContain('Skipped: 1');
  });
});

// =========================================================
// next command tests
// =========================================================
describe('runFeatureNext', () => {
  const CHANGES_DIR = path.join(process.cwd(), 'furina', 'changes');

  let stdoutWriteSpy: ReturnType<typeof vi.spyOn>;
  let stderrWriteSpy: ReturnType<typeof vi.spyOn>;
  let exitSpy: ReturnType<typeof vi.spyOn>;
  let runFeatureNext: (changeName: string) => void;

  beforeEach(async () => {
    vi.resetAllMocks();
    mockFs.reset();
    stdoutWriteSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    stderrWriteSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('process.exit called');
    }) as never);
    const mod = await import('./feature.js');
    runFeatureNext = mod.runFeatureNext;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should return in_progress feature first', () => {
    const planPath = path.join(CHANGES_DIR, 'my-change', 'plan.json');
    mockFs.setDir(path.join(CHANGES_DIR, 'my-change'));
    mockFs.setFile(planPath, JSON.stringify([
      makeFeature({ id: 'f1', status: 'pending' }),
      makeFeature({ id: 'f2', status: 'in_progress', description: 'The active one' }),
      makeFeature({ id: 'f3', status: 'pending' }),
    ]));

    runFeatureNext('my-change');

    const stdoutCalls = stdoutWriteSpy.mock.calls.map((c: unknown[]) => String(c[0]));
    const output = stdoutCalls.join('');
    expect(output).toContain('f2');
    expect(output).toContain('The active one');
  });

  it('should return first pending with satisfied dependencies when no in_progress', () => {
    const planPath = path.join(CHANGES_DIR, 'my-change', 'plan.json');
    mockFs.setDir(path.join(CHANGES_DIR, 'my-change'));
    mockFs.setFile(planPath, JSON.stringify([
      makeFeature({ id: 'f1', status: 'done' }),
      makeFeature({ id: 'f2', status: 'pending', dependencies: ['f1'] }),
    ]));

    runFeatureNext('my-change');

    const stdoutCalls = stdoutWriteSpy.mock.calls.map((c: unknown[]) => String(c[0]));
    const output = stdoutCalls.join('');
    expect(output).toContain('f2');
  });

  it('should detect circular dependencies via DFS and exit with error', () => {
    const planPath = path.join(CHANGES_DIR, 'my-change', 'plan.json');
    mockFs.setDir(path.join(CHANGES_DIR, 'my-change'));
    mockFs.setFile(planPath, JSON.stringify([
      makeFeature({ id: 'a', status: 'pending', dependencies: ['b'] }),
      makeFeature({ id: 'b', status: 'pending', dependencies: ['c'] }),
      makeFeature({ id: 'c', status: 'pending', dependencies: ['a'] }),
    ]));

    expect(() => runFeatureNext('my-change')).toThrow('process.exit called');
    expect(exitSpy).toHaveBeenCalledWith(1);

    const stderrCalls = stderrWriteSpy.mock.calls.map((c: unknown[]) => String(c[0]));
    const errOutput = stderrCalls.join('');
    expect(errOutput).toContain('Circular dependencies detected');
  });

  it('should print "no more features" message when all pending have unmet dependencies', () => {
    const planPath = path.join(CHANGES_DIR, 'my-change', 'plan.json');
    mockFs.setDir(path.join(CHANGES_DIR, 'my-change'));
    mockFs.setFile(planPath, JSON.stringify([
      makeFeature({ id: 'f1', status: 'done' }),
      makeFeature({ id: 'f2', status: 'pending', dependencies: ['f3'] }),
    ]));

    runFeatureNext('my-change');

    const stdoutCalls = stdoutWriteSpy.mock.calls.map((c: unknown[]) => String(c[0]));
    const output = stdoutCalls.join('');
    expect(output).toContain('No more features');
  });

  it('should print full feature details', () => {
    const planPath = path.join(CHANGES_DIR, 'my-change', 'plan.json');
    mockFs.setDir(path.join(CHANGES_DIR, 'my-change'));
    mockFs.setFile(planPath, JSON.stringify([
      makeFeature({
        id: 'feat-x',
        status: 'pending',
        category: 'ui',
        function: 'render',
        description: 'Renders the UI',
        acceptance_criteria: ['AC1: must render', 'AC2: must be fast'],
        dependencies: [],
        spec_refs: ['spec/doc.md'],
        files: ['src/ui.ts', 'src/ui.test.ts'],
      }),
    ]));

    runFeatureNext('my-change');

    const stdoutCalls = stdoutWriteSpy.mock.calls.map((c: unknown[]) => String(c[0]));
    const output = stdoutCalls.join('');
    expect(output).toContain('feat-x');
    expect(output).toContain('ui');
    expect(output).toContain('render');
    expect(output).toContain('Renders the UI');
    expect(output).toContain('AC1: must render');
    expect(output).toContain('AC2: must be fast');
    expect(output).toContain('spec/doc.md');
    expect(output).toContain('src/ui.ts');
    expect(output).toContain('src/ui.test.ts');
    expect(output).toContain('Tasks:');
    expect(output).toContain('- 1.1 do something');
  });

  it('should show Tasks section in next feature details', () => {
    const planPath = path.join(CHANGES_DIR, 'my-change', 'plan.json');
    mockFs.setDir(path.join(CHANGES_DIR, 'my-change'));
    mockFs.setFile(planPath, JSON.stringify([
      makeFeature({
        id: 'feat-t',
        status: 'pending',
        tasks: ['1.1 create module', '1.2 add dependencies'],
      }),
    ]));

    runFeatureNext('my-change');

    const stdoutCalls = stdoutWriteSpy.mock.calls.map((c: unknown[]) => String(c[0]));
    const output = stdoutCalls.join('');
    expect(output).toContain('Tasks:');
    expect(output).toContain('- 1.1 create module');
    expect(output).toContain('- 1.2 add dependencies');
  });

  it('should not show Tasks section when tasks is empty', () => {
    const planPath = path.join(CHANGES_DIR, 'my-change', 'plan.json');
    mockFs.setDir(path.join(CHANGES_DIR, 'my-change'));
    mockFs.setFile(planPath, JSON.stringify([
      makeFeature({ id: 'feat-t', status: 'pending', tasks: [] }),
    ]));

    runFeatureNext('my-change');

    const stdoutCalls = stdoutWriteSpy.mock.calls.map((c: unknown[]) => String(c[0]));
    const output = stdoutCalls.join('');
    expect(output).not.toContain('Tasks:');
  });

  it('should exit with error on invalid change name', () => {
    expect(() => runFeatureNext('Bad_Name')).toThrow('process.exit called');
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('should handle plan.json not found gracefully', () => {
    runFeatureNext('my-change');

    const stdoutCalls = stdoutWriteSpy.mock.calls.map((c: unknown[]) => String(c[0]));
    expect(stdoutCalls.some((c: string) => c.includes('No plan.json found'))).toBe(true);
  });
});

// =========================================================
// start command tests
// =========================================================
describe('runFeatureStart', () => {
  const CHANGES_DIR = path.join(process.cwd(), 'furina', 'changes');

  let stdoutWriteSpy: ReturnType<typeof vi.spyOn>;
  let stderrWriteSpy: ReturnType<typeof vi.spyOn>;
  let exitSpy: ReturnType<typeof vi.spyOn>;
  let runFeatureStart: (changeName: string, featureId: string) => void;

  beforeEach(async () => {
    vi.resetAllMocks();
    mockFs.reset();
    stdoutWriteSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    stderrWriteSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('process.exit called');
    }) as never);
    const mod = await import('./feature.js');
    runFeatureStart = mod.runFeatureStart;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should set feature to in_progress after validating exists/is pending/deps satisfied', () => {
    const planPath = path.join(CHANGES_DIR, 'my-change', 'plan.json');
    mockFs.setDir(path.join(CHANGES_DIR, 'my-change'));
    const features = [
      makeFeature({ id: 'f1', status: 'done' }),
      makeFeature({ id: 'f2', status: 'pending', dependencies: ['f1'] }),
    ];
    mockFs.setFile(planPath, JSON.stringify(features));

    runFeatureStart('my-change', 'f2');

    const stdoutCalls = stdoutWriteSpy.mock.calls.map((c: unknown[]) => String(c[0]));
    expect(stdoutCalls.some((c: string) => c.includes('Started feature'))).toBe(true);
    expect(stdoutCalls.some((c: string) => c.includes('f2'))).toBe(true);

    const writeCalls = mockFs.writeFileSync.mock.calls;
    const planWriteCall = writeCalls.find((c: unknown[]) => String(c[0]).includes('plan.json'));
    expect(planWriteCall).toBeDefined();
    const writtenContent = String(planWriteCall![1]);
    const savedFeatures = JSON.parse(writtenContent);
    const startedFeature = savedFeatures.find((f: { id: string }) => f.id === 'f2');
    expect(startedFeature.status).toBe('in_progress');
  });

  it('should print informational message for already-in_progress features (exit 0)', () => {
    const planPath = path.join(CHANGES_DIR, 'my-change', 'plan.json');
    mockFs.setDir(path.join(CHANGES_DIR, 'my-change'));
    mockFs.setFile(planPath, JSON.stringify([
      makeFeature({ id: 'f1', status: 'in_progress' }),
    ]));

    runFeatureStart('my-change', 'f1');

    const stdoutCalls = stdoutWriteSpy.mock.calls.map((c: unknown[]) => String(c[0]));
    expect(stdoutCalls.some((c: string) => c.includes('already in progress'))).toBe(true);
  });

  it('should exit with error for feature not found', () => {
    const planPath = path.join(CHANGES_DIR, 'my-change', 'plan.json');
    mockFs.setDir(path.join(CHANGES_DIR, 'my-change'));
    mockFs.setFile(planPath, JSON.stringify([
      makeFeature({ id: 'f1', status: 'pending' }),
    ]));

    expect(() => runFeatureStart('my-change', 'nonexistent')).toThrow('process.exit called');
    expect(exitSpy).toHaveBeenCalledWith(1);

    const stderrCalls = stderrWriteSpy.mock.calls.map((c: unknown[]) => String(c[0]));
    expect(stderrCalls.some((c: string) => c.includes('not found'))).toBe(true);
  });

  it('should exit with error for feature not pending', () => {
    const planPath = path.join(CHANGES_DIR, 'my-change', 'plan.json');
    mockFs.setDir(path.join(CHANGES_DIR, 'my-change'));
    mockFs.setFile(planPath, JSON.stringify([
      makeFeature({ id: 'f1', status: 'done' }),
    ]));

    expect(() => runFeatureStart('my-change', 'f1')).toThrow('process.exit called');
    expect(exitSpy).toHaveBeenCalledWith(1);

    const stderrCalls = stderrWriteSpy.mock.calls.map((c: unknown[]) => String(c[0]));
    const errOutput = stderrCalls.join('');
    expect(errOutput).toContain('is not pending');
    expect(errOutput).toContain('current: done');
  });

  it('should exit with error for unmet dependencies', () => {
    const planPath = path.join(CHANGES_DIR, 'my-change', 'plan.json');
    mockFs.setDir(path.join(CHANGES_DIR, 'my-change'));
    mockFs.setFile(planPath, JSON.stringify([
      makeFeature({ id: 'f1', status: 'pending', dependencies: ['f2'] }),
      makeFeature({ id: 'f2', status: 'pending' }),
    ]));

    expect(() => runFeatureStart('my-change', 'f1')).toThrow('process.exit called');
    expect(exitSpy).toHaveBeenCalledWith(1);

    const stderrCalls = stderrWriteSpy.mock.calls.map((c: unknown[]) => String(c[0]));
    expect(stderrCalls.some((c: string) => c.includes('unmet dependencies'))).toBe(true);
  });

  it('should exit with error for missing plan.json', () => {
    expect(() => runFeatureStart('my-change', 'f1')).toThrow('process.exit called');
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('should exit with error on invalid change name', () => {
    expect(() => runFeatureStart('Bad_Name', 'f1')).toThrow('process.exit called');
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('should save plan.json with JSON.stringify(data, null, 2) (indent=2)', () => {
    const planPath = path.join(CHANGES_DIR, 'my-change', 'plan.json');
    mockFs.setDir(path.join(CHANGES_DIR, 'my-change'));
    const features = [
      makeFeature({ id: 'f1', status: 'done' }),
      makeFeature({ id: 'f2', status: 'pending', dependencies: ['f1'] }),
    ];
    mockFs.setFile(planPath, JSON.stringify(features));

    runFeatureStart('my-change', 'f2');

    const writeCalls = mockFs.writeFileSync.mock.calls;
    const planWriteCall = writeCalls.find((c: unknown[]) => String(c[0]).includes('plan.json'));
    expect(planWriteCall).toBeDefined();
    const writtenContent = String(planWriteCall![1]);
    const parsed = JSON.parse(writtenContent);
    expect(Array.isArray(parsed)).toBe(true);
    const reStringified = JSON.stringify(parsed, null, 2);
    expect(writtenContent).toBe(reStringified);
  });
});

// =========================================================
// complete command tests
// =========================================================
describe('runFeatureComplete', () => {
  const CHANGES_DIR = path.join(process.cwd(), 'furina', 'changes');

  let stdoutWriteSpy: ReturnType<typeof vi.spyOn>;
  let stderrWriteSpy: ReturnType<typeof vi.spyOn>;
  let exitSpy: ReturnType<typeof vi.spyOn>;
  let runFeatureComplete: (changeName: string, featureId: string) => void;

  beforeEach(async () => {
    vi.resetAllMocks();
    mockFs.reset();
    stdoutWriteSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    stderrWriteSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('process.exit called');
    }) as never);
    const mod = await import('./feature.js');
    runFeatureComplete = mod.runFeatureComplete;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should set feature to done after validating exists/is in_progress', () => {
    const planPath = path.join(CHANGES_DIR, 'my-change', 'plan.json');
    mockFs.setDir(path.join(CHANGES_DIR, 'my-change'));
    const features = [
      makeFeature({ id: 'f1', status: 'in_progress' }),
    ];
    mockFs.setFile(planPath, JSON.stringify(features));

    runFeatureComplete('my-change', 'f1');

    const stdoutCalls = stdoutWriteSpy.mock.calls.map((c: unknown[]) => String(c[0]));
    expect(stdoutCalls.some((c: string) => c.includes('Completed feature'))).toBe(true);
    expect(stdoutCalls.some((c: string) => c.includes('f1'))).toBe(true);

    const writeCalls = mockFs.writeFileSync.mock.calls;
    const planWriteCall = writeCalls.find((c: unknown[]) => String(c[0]).includes('plan.json'));
    expect(planWriteCall).toBeDefined();
    const writtenContent = String(planWriteCall![1]);
    const savedFeatures = JSON.parse(writtenContent);
    const completedFeature = savedFeatures.find((f: { id: string }) => f.id === 'f1');
    expect(completedFeature.status).toBe('done');
  });

  it('should exit with error for feature not found', () => {
    const planPath = path.join(CHANGES_DIR, 'my-change', 'plan.json');
    mockFs.setDir(path.join(CHANGES_DIR, 'my-change'));
    mockFs.setFile(planPath, JSON.stringify([
      makeFeature({ id: 'f1', status: 'in_progress' }),
    ]));

    expect(() => runFeatureComplete('my-change', 'nonexistent')).toThrow('process.exit called');
    expect(exitSpy).toHaveBeenCalledWith(1);

    const stderrCalls = stderrWriteSpy.mock.calls.map((c: unknown[]) => String(c[0]));
    expect(stderrCalls.some((c: string) => c.includes('not found'))).toBe(true);
  });

  it('should exit with error for feature not in_progress', () => {
    const planPath = path.join(CHANGES_DIR, 'my-change', 'plan.json');
    mockFs.setDir(path.join(CHANGES_DIR, 'my-change'));
    mockFs.setFile(planPath, JSON.stringify([
      makeFeature({ id: 'f1', status: 'pending' }),
    ]));

    expect(() => runFeatureComplete('my-change', 'f1')).toThrow('process.exit called');
    expect(exitSpy).toHaveBeenCalledWith(1);

    const stderrCalls = stderrWriteSpy.mock.calls.map((c: unknown[]) => String(c[0]));
    const errOutput = stderrCalls.join('');
    expect(errOutput).toContain('is not in_progress');
    expect(errOutput).toContain('current: pending');
  });

  it('should exit with error for missing plan.json', () => {
    expect(() => runFeatureComplete('my-change', 'f1')).toThrow('process.exit called');
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('should exit with error on invalid change name', () => {
    expect(() => runFeatureComplete('Bad_Name', 'f1')).toThrow('process.exit called');
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('should save plan.json with JSON.stringify(data, null, 2) (indent=2)', () => {
    const planPath = path.join(CHANGES_DIR, 'my-change', 'plan.json');
    mockFs.setDir(path.join(CHANGES_DIR, 'my-change'));
    const features = [
      makeFeature({ id: 'f1', status: 'in_progress' }),
    ];
    mockFs.setFile(planPath, JSON.stringify(features));

    runFeatureComplete('my-change', 'f1');

    const writeCalls2 = mockFs.writeFileSync.mock.calls;
    const planWriteCall2 = writeCalls2.find((c: unknown[]) => String(c[0]).includes('plan.json'));
    expect(planWriteCall2).toBeDefined();
    const writtenContent2 = String(planWriteCall2![1]);
    const parsed2 = JSON.parse(writtenContent2);
    const reStringified2 = JSON.stringify(parsed2, null, 2);
    expect(writtenContent2).toBe(reStringified2);
  });
});

// =========================================================
// Internal helper tests
// =========================================================
describe('Internal helpers', () => {
  const CHANGES_DIR = path.join(process.cwd(), 'furina', 'changes');

  beforeEach(() => {
    vi.resetAllMocks();
    mockFs.reset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('loadPlan', () => {
    it('should load and parse plan.json as an array of features', async () => {
      const planPath = path.join(CHANGES_DIR, 'my-change', 'plan.json');
      mockFs.setDir(path.join(CHANGES_DIR, 'my-change'));
      mockFs.setFile(planPath, JSON.stringify([
        makeFeature({ id: 'f1' }),
        makeFeature({ id: 'f2' }),
      ]));

      const { loadPlan } = await import('./feature.js');
      const features = loadPlan(planPath);
      expect(features).toHaveLength(2);
      expect(features[0].id).toBe('f1');
      expect(features[1].id).toBe('f2');
    });

    it('should return empty array when plan.json does not exist', async () => {
      const { loadPlan } = await import('./feature.js');
      const planPath2 = path.join(CHANGES_DIR, 'my-change', 'plan.json');
      const features = loadPlan(planPath2);
      expect(features).toEqual([]);
    });
  });

  describe('savePlan', () => {
    it('should save features with indent=2 formatting', async () => {
      const planPath = path.join(CHANGES_DIR, 'my-change', 'plan.json');
      mockFs.setDir(path.join(CHANGES_DIR, 'my-change'));
      const features = [makeFeature({ id: 'f1' })];

      const { savePlan } = await import('./feature.js');
      savePlan(planPath, features);

      const writeCalls = mockFs.writeFileSync.mock.calls;
      const planWriteCall = writeCalls.find((c: unknown[]) => String(c[0]).includes('plan.json'));
      expect(planWriteCall).toBeDefined();
      const content = String(planWriteCall![1]);
      const parsed = JSON.parse(content);
      expect(parsed[0].id).toBe('f1');
      // Verify indent=2
      const reStringified = JSON.stringify(parsed, null, 2);
      expect(content).toBe(reStringified);
    });
  });

  describe('getFeatureById', () => {
    it('should find feature by id', async () => {
      const features = [makeFeature({ id: 'f1' }), makeFeature({ id: 'f2' })];
      const { getFeatureById } = await import('./feature.js');
      const found = getFeatureById(features, 'f2');
      expect(found).toBeDefined();
      expect(found!.id).toBe('f2');
    });

    it('should return undefined when feature not found', async () => {
      const features = [makeFeature({ id: 'f1' })];
      const { getFeatureById } = await import('./feature.js');
      const found = getFeatureById(features, 'nonexistent');
      expect(found).toBeUndefined();
    });
  });

  describe('getDependenciesSatisfied', () => {
    it('should return true when all dependencies are done', async () => {
      const features = [
        makeFeature({ id: 'f1', status: 'done' }),
        makeFeature({ id: 'f2', status: 'done' }),
        makeFeature({ id: 'f3', status: 'pending', dependencies: ['f1', 'f2'] }),
      ];
      const { getDependenciesSatisfied } = await import('./feature.js');
      expect(getDependenciesSatisfied(features[2], features)).toBe(true);
    });

    it('should return false when a dependency is not done', async () => {
      const features = [
        makeFeature({ id: 'f1', status: 'pending' }),
        makeFeature({ id: 'f2', status: 'done' }),
        makeFeature({ id: 'f3', status: 'pending', dependencies: ['f1', 'f2'] }),
      ];
      const { getDependenciesSatisfied } = await import('./feature.js');
      expect(getDependenciesSatisfied(features[2], features)).toBe(false);
    });

    it('should return true when feature has no dependencies', async () => {
      const features = [
        makeFeature({ id: 'f1', status: 'pending', dependencies: [] }),
      ];
      const { getDependenciesSatisfied } = await import('./feature.js');
      expect(getDependenciesSatisfied(features[0], features)).toBe(true);
    });

    it('should return false when dependency does not exist in features array', async () => {
      const features = [
        makeFeature({ id: 'f1', status: 'pending', dependencies: ['nonexistent'] }),
      ];
      const { getDependenciesSatisfied } = await import('./feature.js');
      expect(getDependenciesSatisfied(features[0], features)).toBe(false);
    });
  });

  describe('detectCycles', () => {
    it('should return empty array when no cycles exist', async () => {
      const features = [
        makeFeature({ id: 'a', status: 'pending', dependencies: ['b'] }),
        makeFeature({ id: 'b', status: 'pending', dependencies: [] }),
      ];
      const { detectCycles } = await import('./feature.js');
      expect(detectCycles(features)).toEqual([]);
    });

    it('should detect simple cycle a -> b -> a', async () => {
      const features = [
        makeFeature({ id: 'a', status: 'pending', dependencies: ['b'] }),
        makeFeature({ id: 'b', status: 'pending', dependencies: ['a'] }),
      ];
      const { detectCycles } = await import('./feature.js');
      const cycles = detectCycles(features);
      expect(cycles.length).toBeGreaterThan(0);
      expect(cycles.some((c: string) => c.includes('a') && c.includes('b'))).toBe(true);
    });

    it('should detect three-node cycle a -> b -> c -> a', async () => {
      const features = [
        makeFeature({ id: 'a', status: 'pending', dependencies: ['b'] }),
        makeFeature({ id: 'b', status: 'pending', dependencies: ['c'] }),
        makeFeature({ id: 'c', status: 'pending', dependencies: ['a'] }),
      ];
      const { detectCycles } = await import('./feature.js');
      const cycles = detectCycles(features);
      expect(cycles.length).toBeGreaterThan(0);
    });
  });

  describe('getNextFeature', () => {
    it('should return in_progress feature first', async () => {
      const features = [
        makeFeature({ id: 'f1', status: 'done' }),
        makeFeature({ id: 'f2', status: 'in_progress' }),
        makeFeature({ id: 'f3', status: 'pending' }),
      ];
      const { getNextFeature } = await import('./feature.js');
      const next = getNextFeature(features);
      expect(next).toBeDefined();
      expect(next!.id).toBe('f2');
    });

    it('should return first pending with satisfied deps when no in_progress', async () => {
      const features = [
        makeFeature({ id: 'f1', status: 'done' }),
        makeFeature({ id: 'f2', status: 'pending', dependencies: ['f1'] }),
      ];
      const { getNextFeature } = await import('./feature.js');
      const next = getNextFeature(features);
      expect(next).toBeDefined();
      expect(next!.id).toBe('f2');
    });

    it('should return undefined when no features are actionable', async () => {
      const features = [
        makeFeature({ id: 'f1', status: 'done' }),
        makeFeature({ id: 'f2', status: 'pending', dependencies: ['f3'] }),
      ];
      const { getNextFeature } = await import('./feature.js');
      const next = getNextFeature(features);
      expect(next).toBeUndefined();
    });

    it('should return undefined when all features are done', async () => {
      const features = [
        makeFeature({ id: 'f1', status: 'done' }),
        makeFeature({ id: 'f2', status: 'done' }),
      ];
      const { getNextFeature } = await import('./feature.js');
      const next = getNextFeature(features);
      expect(next).toBeUndefined();
    });
  });
});

// =========================================================
// Sync design to memory tests (mem-01)
// =========================================================
describe('syncDesignToMemory', () => {
  const CHANGES_DIR = path.join(process.cwd(), 'furina', 'changes');

  let syncDesignToMemory: (changeName: string, cwd: string) => void;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockFs.reset();
    mockHttp._reset();

    // Set default http mock: successful response
    mockHttp._setResponse({ statusCode: 200 });
    mockHttp._setThrow(false);
    mockHttp._getMockRequest().mockImplementation((_url: string | URL, _callback?: (res: { statusCode: number }) => void) => {
      if (_callback) {
        _callback(mockHttp._getMockResponse() as unknown as { statusCode: number });
      }
      const mockReq = {
        on: vi.fn(),
        write: vi.fn(),
        end: vi.fn(),
      };
      return mockReq;
    });

    const mod = await import('../../server/memory/sync-design.js');
    syncDesignToMemory = mod.syncDesignToMemory;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should copy design.md to designs/{changeName}.md under memory path when it exists', () => {
    const designPath = path.join(CHANGES_DIR, 'my-change', 'design.md');
    const designContent = '# My Design\n\nSome content';
    mockFs.setDir(path.join(CHANGES_DIR, 'my-change'));
    mockFs.setFile(designPath, designContent);

    syncDesignToMemory('my-change', process.cwd());

    // Verify cpSync was called with correct paths
    const cpCalls = mockFs.cpSync.mock.calls;
    const designCopyCall = cpCalls.find((c: unknown[]) => String(c[0]).includes('design.md'));
    expect(designCopyCall).toBeDefined();

    const destPath = String(designCopyCall![1]);
    expect(destPath).toContain(path.join('designs', 'my-change.md'));
    expect(destPath).toContain('memory');
  });

  it('should silently skip when design.md does not exist', () => {
    // No design.md set up

    expect(() => syncDesignToMemory('my-change', process.cwd())).not.toThrow();

    // cpSync should not have been called for design.md
    const cpCalls = mockFs.cpSync.mock.calls;
    const designCopyCall = cpCalls.find((c: unknown[]) => String(c[0]).includes('design.md'));
    expect(designCopyCall).toBeUndefined();
  });

  it('should send HTTP PUT to schedule API after copying design', () => {
    const designPath = path.join(CHANGES_DIR, 'my-change', 'design.md');
    mockFs.setDir(path.join(CHANGES_DIR, 'my-change'));
    mockFs.setFile(designPath, 'content');

    syncDesignToMemory('my-change', process.cwd());

    // Verify http.request was called
    expect(mockHttp._getMockRequest()).toHaveBeenCalled();

    const requestCalls = mockHttp._getMockRequest().mock.calls;
    // Should be called with URL containing schedule
    const urlCall = requestCalls.find((c: unknown[]) => {
      const arg = String(c[0]);
      return arg.includes('schedule');
    });
    expect(urlCall).toBeDefined();
  });

  it('should silently skip HTTP call when connection fails', () => {
    // Set up http to throw
    mockHttp._setThrow(true);
    mockHttp._getMockRequest().mockImplementation(() => {
      throw new Error('ECONNREFUSED');
    });

    const designPath = path.join(CHANGES_DIR, 'my-change', 'design.md');
    mockFs.setDir(path.join(CHANGES_DIR, 'my-change'));
    mockFs.setFile(designPath, 'content');

    // Should not throw - connection failure is silently skipped
    expect(() => syncDesignToMemory('my-change', process.cwd())).not.toThrow();

    // design.md should still have been copied
    const cpCalls = mockFs.cpSync.mock.calls;
    const designCopyCall = cpCalls.find((c: unknown[]) => String(c[0]).includes('design.md'));
    expect(designCopyCall).toBeDefined();
  });

  it('should NOT call schedule API when design.md does not exist', () => {
    // No design.md set up

    syncDesignToMemory('no-design-change', process.cwd());

    // HTTP PUT should not have been called
    const requestCalls = mockHttp._getMockRequest().mock.calls;
    const scheduleCall = requestCalls.filter((c: unknown[]) => {
      const arg = String(c[0]);
      return arg.includes('schedule');
    });
    expect(scheduleCall.length).toBe(0);
  });
});
