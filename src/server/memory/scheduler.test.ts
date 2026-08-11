/**
 * @fileoverview Tests for scheduler module — directory-scanning based
 * @author Meiyuki <meiyukichan@163.com>
 * @copyright 2026 Meiyuki
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import path from 'path';

// ---- mocks ----

type CronCallback = () => Promise<void>;
type Dirent = { name: string; isDirectory: () => boolean; isFile: () => boolean };

const mockTaskStart = vi.fn();
const mockTaskStop = vi.fn();
const mockTaskDestroy = vi.fn();
let capturedCronCallback: CronCallback | null = null;

// In-memory filesystem for mocking resource config reads and directory listings
let mockFileSystem: Record<string, string> = {};
let mockDirListing: Record<string, Dirent[]> = {};

function normalizeDirPath(p: string): string {
  return p.replace(/\\/g, '/');
}

function findInMockDirListing(searchPath: string): Dirent[] | undefined {
  const normalized = normalizeDirPath(searchPath);
  for (const [rawKey, val] of Object.entries(mockDirListing)) {
    const nk = normalizeDirPath(rawKey);
    if (nk === normalized || nk + '/' === normalized || nk === normalized + '/') {
      return val;
    }
  }
  return undefined;
}

const { cronScheduleMock, appendLogMock, cpSyncMock, rmSyncMock, mkdirSyncMock, existsSyncMock, readFileSyncMock, readdirSyncMock, execMock } = vi.hoisted(() => ({
  cronScheduleMock: vi.fn((_expr: string, cb: CronCallback) => {
    capturedCronCallback = cb;
    return { start: mockTaskStart, stop: mockTaskStop, destroy: mockTaskDestroy };
  }),
  appendLogMock: vi.fn(),
  cpSyncMock: vi.fn(),
  rmSyncMock: vi.fn(),
  mkdirSyncMock: vi.fn(),
  existsSyncMock: vi.fn((p: unknown) => {
    const normalized = normalizeDirPath(String(p));
    // Check mockDirListing (exact match for directories)
    if (findInMockDirListing(normalized)) return true;
    // Check if path is a file in a directory listed in mockDirListing
    const lastSlash = normalized.lastIndexOf('/');
    if (lastSlash > 0) {
      const parentDir = normalized.substring(0, lastSlash);
      const fileName = normalized.substring(lastSlash + 1);
      const parentEntries = findInMockDirListing(parentDir);
      if (parentEntries && parentEntries.some((e: Dirent) => e.name === fileName)) return true;
    }
    // Check .claude directories (created implicitly by cpSync)
    if (normalized.endsWith('/.claude')) {
      const parent = normalized.replace(/\/\.claude$/, '');
      if (findInMockDirListing(parent)) return true;
      for (const rawKey of Object.keys(mockDirListing)) {
        const nk = normalizeDirPath(rawKey);
        if (nk.startsWith(parent + '/')) return true;
      }
      // Also check if cpSync was called to create anything under this .claude dir
      for (const call of cpSyncMock.mock.calls) {
        const dest = normalizeDirPath(String(call[1]));
        if (dest.startsWith(normalized + '/') || dest === normalized) return true;
      }
    }
    return false;
  }),
  readFileSyncMock: vi.fn((p: unknown, _encoding?: unknown) => {
    const key = String(p).replace(/\\/g, '/').toLowerCase();
    if (key in mockFileSystem) return mockFileSystem[key];
    for (const mk of Object.keys(mockFileSystem)) {
      if (mk.endsWith('resources/furina.json') && key.endsWith('resources/furina.json')) {
        return mockFileSystem[mk];
      }
    }
    throw new Error(`ENOENT: ${p}`);
  }),
  readdirSyncMock: vi.fn((p: unknown, options?: { withFileTypes?: boolean } | BufferEncoding | null) => {
    const entries = findInMockDirListing(String(p));
    if (!entries) return [] as Dirent[];

    const useFileTypes = options && typeof options === 'object' && options.withFileTypes === true;
    if (!useFileTypes) {
      return entries.map((e) => e.name);
    }
    return entries;
  }),
  execMock: vi.fn((_command: string, _options: any, callback: any) => {
    if (callback) callback(null, '', '');
  }),
}));

vi.mock('node-cron', () => ({
  default: {
    schedule: cronScheduleMock,
  },
}));

vi.mock('./schedule-logger.js', () => ({
  appendLog: appendLogMock,
}));

vi.mock('fs', () => ({
  default: {
    cpSync: cpSyncMock,
    rmSync: rmSyncMock,
    mkdirSync: mkdirSyncMock,
    existsSync: existsSyncMock,
    readFileSync: readFileSyncMock,
    readdirSync: readdirSyncMock,
  },
}));

vi.mock('child_process', () => ({
  exec: execMock,
}));

vi.mock('os', () => ({
  default: {
    homedir: () => '/Users/test',
  },
}));

// ---- helpers ----

type SchedulerModule = typeof import('./scheduler.js');

async function importFresh(): Promise<SchedulerModule> {
  return await import('./scheduler.js');
}

function makeDirent(name: string, isDir: boolean): Dirent {
  return {
    name,
    isDirectory: () => isDir,
    isFile: () => !isDir,
  };
}

const MEMORY_DIR = '/Users/test/.furina/memory';

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
  capturedCronCallback = null;
  mockFileSystem = {};
  mockDirListing = {};
  execMock.mockReset();
  execMock.mockImplementation((_command: string, _options: any, callback: any) => {
    if (callback) callback(null, '', '');
  });
});

// ---- test suites ----

describe('startScheduler', () => {
  it('should export startScheduler as a named function', async () => {
    const mod = await importFresh();
    expect(mod.startScheduler).toBeDefined();
    expect(typeof mod.startScheduler).toBe('function');
  });

  it('should register a cron job with cron expression "0 2 * * *"', async () => {
    const { startScheduler } = await importFresh();
    startScheduler();

    expect(cronScheduleMock).toHaveBeenCalledTimes(1);
    expect(cronScheduleMock).toHaveBeenCalledWith('0 2 * * *', expect.any(Function));
    expect(appendLogMock).toHaveBeenCalledWith(expect.stringContaining('Scheduler cron registered'));
  });

  it('should not register a second cron job if already running', async () => {
    const { startScheduler } = await importFresh();
    startScheduler();
    startScheduler();

    // Only one cron registered (second call is no-op)
    expect(cronScheduleMock).toHaveBeenCalledTimes(1);
    expect(appendLogMock).toHaveBeenCalledWith('Scheduler start skipped: already running');
  });

  it('should start the cron task', async () => {
    const { startScheduler } = await importFresh();
    startScheduler();

    expect(mockTaskStart).toHaveBeenCalledTimes(1);
  });
});

describe('stopScheduler', () => {
  it('should export stopScheduler as a named function', async () => {
    const mod = await importFresh();
    expect(mod.stopScheduler).toBeDefined();
    expect(typeof mod.stopScheduler).toBe('function');
  });

  it('should stop and destroy the cron task when running', async () => {
    const { startScheduler, stopScheduler } = await importFresh();
    startScheduler();
    stopScheduler();

    expect(mockTaskStop).toHaveBeenCalledTimes(1);
    expect(mockTaskDestroy).toHaveBeenCalledTimes(1);
  });

  it('should not throw when no scheduler is running', async () => {
    const { stopScheduler } = await importFresh();
    expect(() => stopScheduler()).not.toThrow();
  });
});

describe('isSchedulerRunning', () => {
  it('should export isSchedulerRunning as a named function', async () => {
    const mod = await importFresh();
    expect(mod.isSchedulerRunning).toBeDefined();
    expect(typeof mod.isSchedulerRunning).toBe('function');
  });

  it('should return false when scheduler not started', async () => {
    const { isSchedulerRunning } = await importFresh();
    expect(isSchedulerRunning()).toBe(false);
  });

  it('should return true when scheduler is running', async () => {
    const { startScheduler, isSchedulerRunning } = await importFresh();
    startScheduler();
    expect(isSchedulerRunning()).toBe(true);
  });

  it('should return false after stop', async () => {
    const { startScheduler, stopScheduler, isSchedulerRunning } = await importFresh();
    startScheduler();
    stopScheduler();
    expect(isSchedulerRunning()).toBe(false);
  });
});

describe('cron callback: start and finish logging', () => {
  it('should log start and completion messages', async () => {
    const { startScheduler } = await importFresh();
    startScheduler();
    expect(capturedCronCallback).not.toBeNull();

    await capturedCronCallback!();

    expect(appendLogMock).toHaveBeenCalledWith('Scheduler task started');
    expect(appendLogMock).toHaveBeenCalledWith('Scheduler task finished');
  });
});

describe('cron callback: directory scanning', () => {
  it('should log and exit gracefully when memory directory cannot be read', async () => {
    const { startScheduler } = await importFresh();
    startScheduler();

    // Make readdirSync throw for MEMORY_DIR
    const originalReaddirSyncImpl = readdirSyncMock.getMockImplementation();
    readdirSyncMock.mockImplementation((p: unknown, options?: unknown) => {
      const pathStr = normalizeDirPath(String(p));
      if (pathStr === normalizeDirPath(MEMORY_DIR) || pathStr === normalizeDirPath(MEMORY_DIR) + '/') {
        throw new Error('EACCES: permission denied');
      }
      // Fall back to original for other paths
      return originalReaddirSyncImpl!(p, options as any);
    });

    await capturedCronCallback!();

    // Verify the catch block handled the error
    expect(appendLogMock).toHaveBeenCalledWith('Scheduler: could not read memory directory, skipping');
    expect(appendLogMock).toHaveBeenCalledWith('Scheduler task finished');
    // No processing should occur
    expect(cpSyncMock).not.toHaveBeenCalled();
    expect(execMock).not.toHaveBeenCalled();

    // Restore
    readdirSyncMock.mockImplementation(originalReaddirSyncImpl || (() => []));
  });

  it('should scan .furina/memory subdirectories', async () => {
    const { startScheduler } = await importFresh();
    startScheduler();

    // Set up memory directory with a subdirectory that has non-empty designs/
    mockDirListing[MEMORY_DIR] = [
      makeDirent('Memory_project1', true),
      makeDirent('not-a-dir.txt', false),
      makeDirent('Memory_project2', true),
    ];
    // project1 has designs/ with md files
    const project1DesignsDir = path.join(MEMORY_DIR, 'Memory_project1', 'designs');
    mockDirListing[project1DesignsDir] = [
      makeDirent('change-a.md', false),
      makeDirent('change-b.md', false),
    ];
    // project2 has designs/ but it's empty
    const project2DesignsDir = path.join(MEMORY_DIR, 'Memory_project2', 'designs');
    mockDirListing[project2DesignsDir] = [];

    await capturedCronCallback!();

    // readdirSync should have been called for the memory directory
    expect(readdirSyncMock).toHaveBeenCalled();
  });

  it('should process directory with non-empty designs/ subdirectory', async () => {
    const { startScheduler } = await importFresh();
    startScheduler();

    const projectDir = path.join(MEMORY_DIR, 'Memory_project1');
    const designsDir = path.join(projectDir, 'designs');

    mockDirListing[MEMORY_DIR] = [
      makeDirent('Memory_project1', true),
    ];
    mockDirListing[designsDir] = [
      makeDirent('change-a.md', false),
    ];

    await capturedCronCallback!();

    // Should have tried to copy agents and skills
    expect(cpSyncMock).toHaveBeenCalled();
    expect(appendLogMock).toHaveBeenCalledWith(expect.stringContaining('Processing'));
  });

  it('should skip directory when designs/ subdirectory cannot be read', async () => {
    const { startScheduler } = await importFresh();
    startScheduler();

    const projectDir = path.join(MEMORY_DIR, 'Memory_project1');
    const designsDir = path.join(projectDir, 'designs');

    mockDirListing[MEMORY_DIR] = [makeDirent('Memory_project1', true)];

    // Make readdirSync throw for the designs dir (covers hasNonEmptyDesigns catch at line 76)
    const originalImpl = readdirSyncMock.getMockImplementation();
    readdirSyncMock.mockImplementation((p: unknown, options?: unknown) => {
      const pathStr = normalizeDirPath(String(p));
      if (pathStr === normalizeDirPath(designsDir) || pathStr === normalizeDirPath(designsDir) + '/') {
        throw new Error('EACCES: permission denied');
      }
      return originalImpl!(p, options as any);
    });

    await capturedCronCallback!();

    // Should skip the directory (designs/ unreadable)
    expect(cpSyncMock).not.toHaveBeenCalled();
    expect(appendLogMock).toHaveBeenCalledWith('Scheduler: no directories with pending designs found');

    // Restore
    readdirSyncMock.mockImplementation(originalImpl || (() => []));
  });

  it('should skip directory with empty designs/ subdirectory', async () => {
    const { startScheduler } = await importFresh();
    startScheduler();

    const projectDir = path.join(MEMORY_DIR, 'Memory_project1');
    const designsDir = path.join(projectDir, 'designs');

    mockDirListing[MEMORY_DIR] = [
      makeDirent('Memory_project1', true),
    ];
    mockDirListing[designsDir] = [];

    await capturedCronCallback!();

    // Should NOT process (no cpSync calls)
    expect(cpSyncMock).not.toHaveBeenCalled();
  });

  it('should log error when designs/ cannot be read in processProject', async () => {
    const { startScheduler } = await importFresh();
    startScheduler();

    const projectDir = path.join(MEMORY_DIR, 'Memory_project1');
    const designsDir = path.join(projectDir, 'designs');

    mockDirListing[MEMORY_DIR] = [makeDirent('Memory_project1', true)];
    // designs dir exists with .md files (so hasNonEmptyDesigns passes)
    mockDirListing[designsDir] = [makeDirent('change-a.md', false)];

    // Make readdirSync throw only on the second call to designsDir (processProject's call)
    // hasNonEmptyDesigns calls it first (via .filter), which should succeed
    let designsReadCount = 0;
    const originalImpl = readdirSyncMock.getMockImplementation();
    readdirSyncMock.mockImplementation((p: unknown, options?: unknown) => {
      const pathStr = normalizeDirPath(String(p));
      if (pathStr === normalizeDirPath(designsDir) || pathStr === normalizeDirPath(designsDir) + '/') {
        designsReadCount++;
        if (designsReadCount > 1) {
          throw new Error('EIO: i/o error');
        }
      }
      return originalImpl!(p, options as any);
    });

    await capturedCronCallback!();

    // Should log the error and skip this project
    expect(appendLogMock).toHaveBeenCalledWith(`Could not read designs directory: ${designsDir}`);
    // Should NOT exec claude for this project
    const designerCalls = execMock.mock.calls.filter((c: unknown[]) => String(c[0]).includes('backgroud-designer'));
    expect(designerCalls.length).toBe(0);
    // Task should still finish
    expect(appendLogMock).toHaveBeenCalledWith('Scheduler task finished');

    // Restore
    readdirSyncMock.mockImplementation(originalImpl || (() => []));
  });

  it('should skip directory without designs/ subdirectory', async () => {
    const { startScheduler } = await importFresh();
    startScheduler();

    mockDirListing[MEMORY_DIR] = [
      makeDirent('Memory_project1', true),
    ];

    await capturedCronCallback!();

    // Should NOT process (no cpSync calls)
    expect(cpSyncMock).not.toHaveBeenCalled();
  });

  it('should handle empty memory directory gracefully', async () => {
    const { startScheduler } = await importFresh();
    startScheduler();

    mockDirListing[MEMORY_DIR] = [];

    await capturedCronCallback!();

    // Should finish without errors
    expect(appendLogMock).toHaveBeenCalledWith('Scheduler task started');
    expect(appendLogMock).toHaveBeenCalledWith('Scheduler task finished');
  });

  it('should skip directories not starting with Memory_ prefix even with non-empty designs', async () => {
    const { startScheduler } = await importFresh();
    startScheduler();

    const projectDir = path.join(MEMORY_DIR, 'project1');
    const designsDir = path.join(projectDir, 'designs');

    mockDirListing[MEMORY_DIR] = [
      makeDirent('project1', true),        // No Memory_ prefix
      makeDirent('Memory_project2', true),  // Has Memory_ prefix
    ];
    // Both have non-empty designs/
    mockDirListing[designsDir] = [
      makeDirent('change-a.md', false),
    ];
    mockDirListing[path.join(MEMORY_DIR, 'Memory_project2', 'designs')] = [
      makeDirent('change-b.md', false),
    ];

    await capturedCronCallback!();

    // Only Memory_ prefixed directory should be processed
    // project1 (no prefix) should be skipped entirely
    // 2 cpSync for processProject (agents + skills) + 2 cpSync for syncProjectGroup (agents + skills to Project_Group/.claude)
    expect(cpSyncMock).toHaveBeenCalledTimes(4);
    expect(appendLogMock).toHaveBeenCalledWith(expect.stringMatching(/Processing/));
    const procCalls = appendLogMock.mock.calls.filter((c: unknown[]) => String(c[0]).includes('Processing'));
    expect(procCalls.length).toBe(1);
  });

  it('should skip all directories when none have Memory_ prefix', async () => {
    const { startScheduler } = await importFresh();
    startScheduler();

    const projectDir = path.join(MEMORY_DIR, 'project1');
    const designsDir = path.join(projectDir, 'designs');

    mockDirListing[MEMORY_DIR] = [
      makeDirent('project1', true),
      makeDirent('another-project', true),
    ];
    mockDirListing[designsDir] = [
      makeDirent('change-a.md', false),
    ];
    mockDirListing[path.join(MEMORY_DIR, 'another-project', 'designs')] = [
      makeDirent('change-b.md', false),
    ];

    await capturedCronCallback!();

    // No processing should occur
    expect(cpSyncMock).not.toHaveBeenCalled();
    expect(appendLogMock).toHaveBeenCalledWith('Scheduler: no directories with pending designs found');
  });
});

describe('cron callback: copy agents and skills', () => {
  it('should copy agents and skills to .claude directory before claude execution', async () => {
    const { startScheduler } = await importFresh();
    startScheduler();

    const projectDir = path.join(MEMORY_DIR, 'Memory_project1');
    const designsDir = path.join(projectDir, 'designs');
    const claudeDir = path.join(projectDir, '.claude');

    mockDirListing[MEMORY_DIR] = [
      makeDirent('Memory_project1', true),
    ];
    mockDirListing[designsDir] = [
      makeDirent('change-a.md', false),
    ];

    await capturedCronCallback!();

    // Should call cpSync for agents
    expect(cpSyncMock).toHaveBeenCalledWith(
      expect.stringContaining('agents'),
      path.join(claudeDir, 'agents'),
      { recursive: true },
    );
    // Should call cpSync for skills
    expect(cpSyncMock).toHaveBeenCalledWith(
      expect.stringContaining('skills'),
      path.join(claudeDir, 'skills'),
      { recursive: true },
    );
  });
});

describe('cron callback: claude CLI execution', () => {
  it('should execute claude CLI command with correct parameters', async () => {
    const { startScheduler } = await importFresh();
    startScheduler();

    const projectDir = path.join(MEMORY_DIR, 'Memory_project1');
    const designsDir = path.join(projectDir, 'designs');

    mockDirListing[MEMORY_DIR] = [
      makeDirent('Memory_project1', true),
    ];
    mockDirListing[designsDir] = [
      makeDirent('change-a.md', false),
    ];

    await capturedCronCallback!();

    // Verify exec was called with claude command containing the design file list
    expect(execMock).toHaveBeenCalledTimes(1);
    const execCall = execMock.mock.calls[0];
    const command = execCall[0] as string;
    expect(command).toContain('claude');
    expect(command).toContain('backgroud-designer');
    expect(command).toContain('change-a.md');

    // Verify options: cwd, timeout, env
    const options = execCall[1] as Record<string, unknown>;
    expect(options.cwd).toBe(projectDir);
    expect(options.timeout).toBe(600000);
  });

  it('should log and continue when claude execution times out', async () => {
    const { startScheduler } = await importFresh();
    startScheduler();

    const projectDir = path.join(MEMORY_DIR, 'Memory_project1');
    const designsDir = path.join(projectDir, 'designs');

    mockDirListing[MEMORY_DIR] = [
      makeDirent('Memory_project1', true),
    ];
    mockDirListing[designsDir] = [
      makeDirent('change-a.md', false),
    ];

    execMock.mockImplementation((_command: string, _options: any, callback: any) => {
      if (callback) callback(new Error('The operation was canceled'), '', '');
    });

    await capturedCronCallback!();

    // Should log the failure
    expect(appendLogMock).toHaveBeenCalledWith(expect.stringContaining('failed'));
    // Should NOT delete designs/ (execution failed), only .claude/
    const rmSyncCalls = rmSyncMock.mock.calls;
    const designCalls = rmSyncCalls.filter((c: unknown[]) => String(c[0]).includes('designs'));
    expect(designCalls.length).toBe(0);
    expect(rmSyncMock).toHaveBeenCalledWith(
      expect.stringMatching(/.claude/),
      { recursive: true, force: true },
    );
  });

  it('should log and continue when claude execution fails', async () => {
    const { startScheduler } = await importFresh();
    startScheduler();

    const projectDir = path.join(MEMORY_DIR, 'Memory_project1');
    const designsDir = path.join(projectDir, 'designs');

    mockDirListing[MEMORY_DIR] = [
      makeDirent('Memory_project1', true),
    ];
    mockDirListing[designsDir] = [
      makeDirent('change-a.md', false),
    ];

    execMock.mockImplementation((_command: string, _options: any, callback: any) => {
      if (callback) callback(new Error('Command failed with exit code 1'), '', '');
    });

    await capturedCronCallback!();

    // Should log the failure
    expect(appendLogMock).toHaveBeenCalledWith(expect.stringContaining('failed'));
    // Should NOT delete designs/ (execution failed), only .claude/
    const rmSyncCalls = rmSyncMock.mock.calls;
    const designCalls = rmSyncCalls.filter((c: unknown[]) => String(c[0]).includes('designs'));
    expect(designCalls.length).toBe(0);
    expect(rmSyncMock).toHaveBeenCalledWith(
      expect.stringMatching(/.claude/),
      { recursive: true, force: true },
    );
  });
});

describe('cron callback: cleanup', () => {
  it('should delete designs/ and .claude/ when both project-design.md and project-portrait.md exist', async () => {
    const { startScheduler } = await importFresh();
    startScheduler();

    const projectDir = path.join(MEMORY_DIR, 'Memory_project1');
    const designsDir = path.join(projectDir, 'designs');

    mockDirListing[MEMORY_DIR] = [
      makeDirent('Memory_project1', true),
    ];
    mockDirListing[designsDir] = [
      makeDirent('change-a.md', false),
    ];
    // Both project-design.md and project-portrait.md exist
    mockDirListing[path.join(projectDir, 'project-design.md')] = [];
    mockDirListing[path.join(projectDir, 'project-portrait.md')] = [];

    await capturedCronCallback!();

    // Should delete individual design files and .claude/
    expect(rmSyncMock).toHaveBeenCalledWith(
      expect.stringMatching(/designs[/\\]change-a\.md/),
    );
    expect(rmSyncMock).toHaveBeenCalledWith(
      expect.stringMatching(/.claude/),
      { recursive: true, force: true },
    );
  });

  it('should log error when rmSync fails during design file cleanup', async () => {
    const { startScheduler } = await importFresh();
    startScheduler();

    const projectDir = path.join(MEMORY_DIR, 'Memory_project1');
    const designsDir = path.join(projectDir, 'designs');
    const designFilePath = path.join(designsDir, 'change-a.md');

    mockDirListing[MEMORY_DIR] = [makeDirent('Memory_project1', true)];
    mockDirListing[designsDir] = [makeDirent('change-a.md', false)];
    // Both output files exist so cleanup triggers
    mockDirListing[path.join(projectDir, 'project-design.md')] = [];
    mockDirListing[path.join(projectDir, 'project-portrait.md')] = [];

    // Make rmSync throw only for the design file cleanup
    const originalRmSyncImpl = rmSyncMock.getMockImplementation();
    rmSyncMock.mockImplementation((target: string, options?: unknown) => {
      if (normalizeDirPath(target) === normalizeDirPath(designFilePath)) {
        throw new Error('EACCES: permission denied');
      }
      // Allow other rmSync calls (.claude) to proceed
    });

    await capturedCronCallback!();

    // Verify catch block logged the design file cleanup failure
    expect(appendLogMock).toHaveBeenCalledWith(
      `Failed to cleanup design file ${designFilePath}: EACCES: permission denied`,
    );
    // Task should still complete normally
    expect(appendLogMock).toHaveBeenCalledWith('Scheduler task finished');
    // .claude cleanup should still execute
    expect(rmSyncMock).toHaveBeenCalledWith(
      expect.stringMatching(/.claude/),
      { recursive: true, force: true },
    );

    // Restore
    rmSyncMock.mockImplementation(originalRmSyncImpl || (() => {}));
  });

  it('should NOT delete designs/ when project-design.md or project-portrait.md missing', async () => {
    const { startScheduler } = await importFresh();
    startScheduler();

    const projectDir = path.join(MEMORY_DIR, 'Memory_project1');
    const designsDir = path.join(projectDir, 'designs');

    mockDirListing[MEMORY_DIR] = [
      makeDirent('Memory_project1', true),
    ];
    mockDirListing[designsDir] = [
      makeDirent('change-a.md', false),
    ];
    // Only project-design.md exists, project-portrait.md missing
    mockDirListing[path.join(projectDir, 'project-design.md')] = [];

    await capturedCronCallback!();

    // Should NOT delete designs/ (missing project-portrait.md)
    const rmSyncCalls = rmSyncMock.mock.calls;
    const designCalls = rmSyncCalls.filter((c: unknown[]) => String(c[0]).includes('designs'));
    expect(designCalls.length).toBe(0);

    // Should still delete .claude/
    expect(rmSyncMock).toHaveBeenCalledWith(
      expect.stringMatching(/.claude/),
      { recursive: true, force: true },
    );
  });

  it('should delete .claude/ but NOT designs/ after failed execution', async () => {
    const { startScheduler } = await importFresh();
    startScheduler();

    const projectDir = path.join(MEMORY_DIR, 'Memory_project1');
    const designsDir = path.join(projectDir, 'designs');

    mockDirListing[MEMORY_DIR] = [
      makeDirent('Memory_project1', true),
    ];
    mockDirListing[designsDir] = [
      makeDirent('change-a.md', false),
    ];

    execMock.mockImplementation((_command: string, _options: any, callback: any) => {
      if (callback) callback(new Error('Command failed'), '', '');
    });

    await capturedCronCallback!();

    // Should NOT delete designs/ (execution failed)
    const rmSyncCalls = rmSyncMock.mock.calls;
    const designCalls = rmSyncCalls.filter((c: unknown[]) => String(c[0]).includes('designs'));
    expect(designCalls.length).toBe(0);

    // Should still delete .claude/
    expect(rmSyncMock).toHaveBeenCalledWith(
      expect.stringMatching(/.claude/),
      { recursive: true, force: true },
    );
  });

  it('should log error when rmSync fails during .claude cleanup in processProject', async () => {
    const { startScheduler } = await importFresh();
    startScheduler();

    const projectDir = path.join(MEMORY_DIR, 'Memory_project1');
    const designsDir = path.join(projectDir, 'designs');
    const claudeDir = path.join(projectDir, '.claude');

    mockDirListing[MEMORY_DIR] = [makeDirent('Memory_project1', true)];
    mockDirListing[designsDir] = [makeDirent('change-a.md', false)];
    // Both output files exist so cleanup triggers
    mockDirListing[path.join(projectDir, 'project-design.md')] = [];
    mockDirListing[path.join(projectDir, 'project-portrait.md')] = [];

    // Make rmSync throw only for .claude directories
    const originalRmSyncImpl = rmSyncMock.getMockImplementation();
    rmSyncMock.mockImplementation((target: string, options?: unknown) => {
      const normalized = normalizeDirPath(String(target));
      if (normalized === normalizeDirPath(claudeDir) || normalized === normalizeDirPath(path.join(PROJECT_GROUP_DIR, '.claude'))) {
        throw new Error('EBUSY: resource busy or locked');
      }
      // Allow other rmSync calls (e.g. design files) to proceed
    });

    await capturedCronCallback!();

    // Verify catch block logged the .claude cleanup failure
    expect(appendLogMock).toHaveBeenCalledWith(
      expect.stringContaining('Failed to cleanup .claude'),
    );
    // Task should still complete normally
    expect(appendLogMock).toHaveBeenCalledWith('Scheduler task finished');

    // Restore original implementation
    rmSyncMock.mockImplementation(originalRmSyncImpl || (() => {}));
  });

  it('should process multiple directories and clean up each', async () => {
    const { startScheduler } = await importFresh();
    startScheduler();

    const project1Dir = path.join(MEMORY_DIR, 'Memory_project1');
    const project2Dir = path.join(MEMORY_DIR, 'Memory_project2');
    const designs1Dir = path.join(project1Dir, 'designs');
    const designs2Dir = path.join(project2Dir, 'designs');

    mockDirListing[MEMORY_DIR] = [
      makeDirent('Memory_project1', true),
      makeDirent('Memory_project2', true),
    ];
    mockDirListing[designs1Dir] = [makeDirent('a.md', false)];
    mockDirListing[designs2Dir] = [makeDirent('b.md', false)];
    // Both projects have project-design.md and project-portrait.md
    mockDirListing[path.join(project1Dir, 'project-design.md')] = [];
    mockDirListing[path.join(project1Dir, 'project-portrait.md')] = [];
    mockDirListing[path.join(project2Dir, 'project-design.md')] = [];
    mockDirListing[path.join(project2Dir, 'project-portrait.md')] = [];
    // Project_Group contains aggregated Memory_*.md files for grouper
    const projectGroupDir = path.join(MEMORY_DIR, 'Project_Group');
    mockDirListing[projectGroupDir] = [
      makeDirent('Memory_project1.md', false),
      makeDirent('Memory_project2.md', false),
    ];

    await capturedCronCallback!();

    // Two processProject claude executions + one syncProjectGroup grouper execution
    expect(execMock).toHaveBeenCalledTimes(3);

    // Two sets of cleanup (designs + .claude for each project) + syncProjectGroup .claude cleanup
    const rmSyncCalls = rmSyncMock.mock.calls;
    const designCalls = rmSyncCalls.filter((c: unknown[]) => String(c[0]).includes('designs'));
    const claudeCalls = rmSyncCalls.filter((c: unknown[]) => String(c[0]).includes('.claude'));
    expect(designCalls.length).toBe(2);
    expect(claudeCalls.length).toBe(3); // 2 from processProject + 1 from syncProjectGroup
  });
});

describe('cron callback: does not interact with dreamwork.json', () => {
  it('should not import or call any dreamwork functions', async () => {
    // The fact that we don't mock dreamwork.js and the module loads without it
    // confirms there's no dreamwork dependency
    const { startScheduler } = await importFresh();
    startScheduler();

    const projectDir = path.join(MEMORY_DIR, 'Memory_project1');
    const designsDir = path.join(projectDir, 'designs');

    mockDirListing[MEMORY_DIR] = [
      makeDirent('Memory_project1', true),
    ];
    mockDirListing[designsDir] = [
      makeDirent('change-a.md', false),
    ];

    await capturedCronCallback!();

    // Should work normally without any dreamwork interaction
    expect(execMock).toHaveBeenCalled();
    expect(cpSyncMock).toHaveBeenCalled();
  });
});

// =========================================================
// Dynamic cron from config
// =========================================================
describe('cron: dynamic cron expression', () => {
  /** The scheduler resolves ../../resources from its source file location,
   *  which in tests maps to <project_root>/resources */
  function schedulerResourcesConfigPath(): string {
    return path.join(process.cwd(), 'resources', 'furina.json');
  }

  it('should use cron from enhancement.memory.schedule in resources/furina.json', async () => {
    const configPath = schedulerResourcesConfigPath();
    mockFileSystem[configPath.replace(/\\/g, '/').toLowerCase()] = JSON.stringify({
      enhancement: {
        memory: {
          schedule: '0 3 * * *',
        },
      },
    });

    vi.resetModules();
    const { startScheduler } = await importFresh();
    startScheduler();

    expect(cronScheduleMock).toHaveBeenCalledTimes(1);
    expect(cronScheduleMock).toHaveBeenCalledWith('0 3 * * *', expect.any(Function));
    expect(appendLogMock).toHaveBeenCalledWith('Scheduler using cron from config: 0 3 * * *');
  });

  it('should fallback to "0 2 * * *" when config file cannot be read', async () => {
    // No config file in mockFileSystem, so readFileSync will throw

    vi.resetModules();
    const { startScheduler } = await importFresh();
    startScheduler();

    expect(cronScheduleMock).toHaveBeenCalledTimes(1);
    expect(cronScheduleMock).toHaveBeenCalledWith('0 2 * * *', expect.any(Function));
    expect(appendLogMock).toHaveBeenCalledWith(expect.stringContaining('Scheduler using default cron'));
  });

  it('should fallback to "0 2 * * *" when enhancement.memory.schedule is missing', async () => {
    const configPath2 = schedulerResourcesConfigPath();
    mockFileSystem[configPath2.replace(/\\/g, '/').toLowerCase()] = JSON.stringify({
      enhancement: {
        memory: {},
      },
    });

    vi.resetModules();
    const { startScheduler } = await importFresh();
    startScheduler();

    expect(cronScheduleMock).toHaveBeenCalledTimes(1);
    expect(cronScheduleMock).toHaveBeenCalledWith('0 2 * * *', expect.any(Function));
    expect(appendLogMock).toHaveBeenCalledWith('Scheduler using default cron: 0 2 * * * (enhancement.memory.schedule not found)');
  });
});

// =========================================================
// Project group sync (syncProjectGroup)
// =========================================================
const PROJECT_GROUP_DIR = path.join(MEMORY_DIR, 'Project_Group');

describe('project group sync: trigger condition', () => {
  it('should call syncProjectGroup when pendingDirs is non-empty', async () => {
    const { startScheduler } = await importFresh();
    startScheduler();

    const projectDir = path.join(MEMORY_DIR, 'Memory_project1');
    const designsDir = path.join(projectDir, 'designs');

    mockDirListing[MEMORY_DIR] = [makeDirent('Memory_project1', true)];
    mockDirListing[designsDir] = [makeDirent('change-a.md', false)];
    // project-design.md exists for aggregation
    mockDirListing[projectDir] = [
      makeDirent('designs', true),
      makeDirent('project-design.md', false),
    ];

    await capturedCronCallback!();

    // syncProjectGroup should be triggered: it copies resources to Project_Group/.claude
    const projectGroupClaudeDir = path.join(PROJECT_GROUP_DIR, '.claude');
    expect(cpSyncMock).toHaveBeenCalledWith(
      expect.stringContaining('agents'),
      path.join(projectGroupClaudeDir, 'agents'),
      { recursive: true },
    );
    expect(cpSyncMock).toHaveBeenCalledWith(
      expect.stringContaining('skills'),
      path.join(projectGroupClaudeDir, 'skills'),
      { recursive: true },
    );
  });

  it('should NOT trigger syncProjectGroup when pendingDirs is empty', async () => {
    const { startScheduler } = await importFresh();
    startScheduler();

    mockDirListing[MEMORY_DIR] = [];

    await capturedCronCallback!();

    // No cpSync to Project_Group should occur
    const cpSyncCalls = cpSyncMock.mock.calls;
    const projectGroupCalls = cpSyncCalls.filter((c: unknown[]) => String(c[1]).includes('Project_Group'));
    expect(projectGroupCalls.length).toBe(0);
  });
});

describe('project group sync: resource copying', () => {
  it('should copy agents and skills to Project_Group/.claude', async () => {
    const { startScheduler } = await importFresh();
    startScheduler();

    const projectDir = path.join(MEMORY_DIR, 'Memory_project1');
    const designsDir = path.join(projectDir, 'designs');

    mockDirListing[MEMORY_DIR] = [makeDirent('Memory_project1', true)];
    mockDirListing[designsDir] = [makeDirent('change-a.md', false)];
    mockDirListing[projectDir] = [
      makeDirent('designs', true),
      makeDirent('project-design.md', false),
    ];

    await capturedCronCallback!();

    const projectGroupClaudeDir = path.join(PROJECT_GROUP_DIR, '.claude');
    expect(cpSyncMock).toHaveBeenCalledWith(
      expect.stringContaining('agents'),
      path.join(projectGroupClaudeDir, 'agents'),
      { recursive: true },
    );
    expect(cpSyncMock).toHaveBeenCalledWith(
      expect.stringContaining('skills'),
      path.join(projectGroupClaudeDir, 'skills'),
      { recursive: true },
    );
  });
});

describe('project group sync: document aggregation', () => {
  it('should copy project-design.md to Project_Group/{basename}.md for each pending dir', async () => {
    const { startScheduler } = await importFresh();
    startScheduler();

    const projectDir = path.join(MEMORY_DIR, 'Memory_project1');
    const designsDir = path.join(projectDir, 'designs');

    mockDirListing[MEMORY_DIR] = [makeDirent('Memory_project1', true)];
    mockDirListing[designsDir] = [makeDirent('change-a.md', false)];
    mockDirListing[projectDir] = [
      makeDirent('designs', true),
      makeDirent('project-design.md', false),
    ];

    await capturedCronCallback!();

    // cpSync should be called to copy project-design.md to Project_Group/Memory_project1.md
    expect(cpSyncMock).toHaveBeenCalledWith(
      path.join(projectDir, 'project-design.md'),
      path.join(PROJECT_GROUP_DIR, 'Memory_project1.md'),
    );
  });

  it('should skip project without project-design.md and log', async () => {
    const { startScheduler } = await importFresh();
    startScheduler();

    const projectDir = path.join(MEMORY_DIR, 'Memory_project1');
    const designsDir = path.join(projectDir, 'designs');

    mockDirListing[MEMORY_DIR] = [makeDirent('Memory_project1', true)];
    mockDirListing[designsDir] = [makeDirent('change-a.md', false)];
    // project-design.md does NOT exist (no entry in mockDirListing for projectDir)
    // existsSyncMock will return false for project-design.md

    await capturedCronCallback!();

    // Should log that project-design.md is missing
    expect(appendLogMock).toHaveBeenCalledWith(expect.stringContaining('project-design.md not found'));
  });

  it('should aggregate multiple projects', async () => {
    const { startScheduler } = await importFresh();
    startScheduler();

    const project1Dir = path.join(MEMORY_DIR, 'Memory_project1');
    const project2Dir = path.join(MEMORY_DIR, 'Memory_project2');
    const designs1Dir = path.join(project1Dir, 'designs');
    const designs2Dir = path.join(project2Dir, 'designs');

    mockDirListing[MEMORY_DIR] = [
      makeDirent('Memory_project1', true),
      makeDirent('Memory_project2', true),
    ];
    mockDirListing[designs1Dir] = [makeDirent('a.md', false)];
    mockDirListing[designs2Dir] = [makeDirent('b.md', false)];
    mockDirListing[project1Dir] = [makeDirent('designs', true), makeDirent('project-design.md', false)];
    mockDirListing[project2Dir] = [makeDirent('designs', true), makeDirent('project-design.md', false)];

    await capturedCronCallback!();

    // Both projects should be aggregated
    expect(cpSyncMock).toHaveBeenCalledWith(
      path.join(project1Dir, 'project-design.md'),
      path.join(PROJECT_GROUP_DIR, 'Memory_project1.md'),
    );
    expect(cpSyncMock).toHaveBeenCalledWith(
      path.join(project2Dir, 'project-design.md'),
      path.join(PROJECT_GROUP_DIR, 'Memory_project2.md'),
    );
  });
});

describe('project group sync: grouper execution', () => {
  it('should execute claude CLI with backgroud-grouper agent and correct parameters', async () => {
    const { startScheduler } = await importFresh();
    startScheduler();

    const projectDir = path.join(MEMORY_DIR, 'Memory_project1');
    const designsDir = path.join(projectDir, 'designs');

    mockDirListing[MEMORY_DIR] = [makeDirent('Memory_project1', true)];
    mockDirListing[designsDir] = [makeDirent('change-a.md', false)];
    mockDirListing[projectDir] = [
      makeDirent('designs', true),
      makeDirent('project-design.md', false),
    ];
    // Project_Group has the aggregated Memory_*.md file
    mockDirListing[PROJECT_GROUP_DIR] = [
      makeDirent('Memory_project1.md', false),
    ];

    await capturedCronCallback!();

    // Find the exec call for grouper (second exec call, after processProject's designer call)
    const execCalls = execMock.mock.calls;
    const grouperCall = execCalls.find((c: unknown[]) => String(c[0]).includes('backgroud-grouper'));
    expect(grouperCall).toBeDefined();

    const command = grouperCall![0] as string;
    expect(command).toContain('backgroud-grouper');
    expect(command).toContain('--permission-mode bypassPermissions');
    expect(command).toContain('--add-dir');
    expect(command).toContain(PROJECT_GROUP_DIR);
    expect(command).toContain('Memory_project1.md');

    const options = grouperCall![1] as Record<string, unknown>;
    expect(options.cwd).toBe(PROJECT_GROUP_DIR);
    expect(options.timeout).toBe(600000);
    expect(options.windowsHide).toBe(true);
  });

  it('should NOT execute grouper when no Memory_*.md files exist in Project_Group', async () => {
    const { startScheduler } = await importFresh();
    startScheduler();

    const projectDir = path.join(MEMORY_DIR, 'Memory_project1');
    const designsDir = path.join(projectDir, 'designs');

    mockDirListing[MEMORY_DIR] = [makeDirent('Memory_project1', true)];
    mockDirListing[designsDir] = [makeDirent('change-a.md', false)];
    // No project-design.md, so no aggregation happens
    mockDirListing[projectDir] = [makeDirent('designs', true)];
    mockDirListing[PROJECT_GROUP_DIR] = []; // empty Project_Group

    await capturedCronCallback!();

    // Only the processProject exec call should exist (for backgroud-designer)
    const execCalls = execMock.mock.calls;
    const grouperCalls = execCalls.filter((c: unknown[]) => String(c[0]).includes('backgroud-grouper'));
    expect(grouperCalls.length).toBe(0);
  });
});

describe('project group sync: cleanup', () => {
  /** Helper: valid JSON content that passes schema validation */
  function setupValidGroupsJson(jsonPath: string): void {
    mockFileSystem[jsonPath.replace(/\\/g, '/').toLowerCase()] = JSON.stringify({
      version: '1.0.0',
      lastUpdated: '2026-06-21T00:00:00Z',
      groups: [
        {
          projectGroup: '测试项目群',
          projectDesc: '测试描述',
          projectPortrait: '面向测试团队，采用Monorepo架构，核心实体Test/Report，关键组件：测试引擎；覆盖自动化测试场景，服务QA团队，达成质量提升；数据流CI→Test→报告；不包含：部署、监控',
          members: ['Memory_project1.md'],
          tags: ['测试'],
          status: 'active',
        },
      ],
    });
  }

  it('should delete Memory_*.md files after successful grouper execution', async () => {
    const { startScheduler } = await importFresh();
    startScheduler();

    const projectDir = path.join(MEMORY_DIR, 'Memory_project1');
    const designsDir = path.join(projectDir, 'designs');

    mockDirListing[MEMORY_DIR] = [makeDirent('Memory_project1', true)];
    mockDirListing[designsDir] = [makeDirent('change-a.md', false)];
    mockDirListing[projectDir] = [
      makeDirent('designs', true),
      makeDirent('project-design.md', false),
    ];
    mockDirListing[PROJECT_GROUP_DIR] = [
      makeDirent('Memory_project1.md', false),
      makeDirent('project-groups.json', false),
    ];
    setupValidGroupsJson(path.join(PROJECT_GROUP_DIR, 'project-groups.json'));

    await capturedCronCallback!();

    // Validation should pass
    expect(appendLogMock).toHaveBeenCalledWith('project-groups.json schema validation passed');
    // Should delete Memory_project1.md from Project_Group
    expect(rmSyncMock).toHaveBeenCalledWith(
      path.join(PROJECT_GROUP_DIR, 'Memory_project1.md'),
    );
  });

  it('should NOT delete Memory_*.md files when grouper execution fails', async () => {
    const { startScheduler } = await importFresh();
    startScheduler();

    const projectDir = path.join(MEMORY_DIR, 'Memory_project1');
    const designsDir = path.join(projectDir, 'designs');

    mockDirListing[MEMORY_DIR] = [makeDirent('Memory_project1', true)];
    mockDirListing[designsDir] = [makeDirent('change-a.md', false)];
    mockDirListing[projectDir] = [
      makeDirent('designs', true),
      makeDirent('project-design.md', false),
    ];
    mockDirListing[PROJECT_GROUP_DIR] = [
      makeDirent('Memory_project1.md', false),
    ];

    // Make grouper execution fail (second exec call)
    let execCallCount = 0;
    execMock.mockImplementation((_command: string, _options: any, callback: any) => {
      execCallCount++;
      if (execCallCount === 2) {
        // Second call = grouper = fail
        if (callback) callback(new Error('Grouper failed'), '', '');
      } else {
        if (callback) callback(null, '', '');
      }
    });

    await capturedCronCallback!();

    // Should NOT delete Memory_project1.md from Project_Group (grouper failed)
    const rmSyncCalls = rmSyncMock.mock.calls;
    const memoryMdCalls = rmSyncCalls.filter((c: unknown[]) => {
      const target = String(c[0]);
      return target.includes('Project_Group') && target.includes('Memory_') && target.endsWith('.md');
    });
    expect(memoryMdCalls.length).toBe(0);

    // Should still clean up .claude
    const claudeCalls = rmSyncCalls.filter((c: unknown[]) => String(c[0]).includes('.claude'));
    expect(claudeCalls.length).toBeGreaterThan(0);
  });

  it('should always clean up Project_Group/.claude in finally', async () => {
    const { startScheduler } = await importFresh();
    startScheduler();

    const projectDir = path.join(MEMORY_DIR, 'Memory_project1');
    const designsDir = path.join(projectDir, 'designs');

    mockDirListing[MEMORY_DIR] = [makeDirent('Memory_project1', true)];
    mockDirListing[designsDir] = [makeDirent('change-a.md', false)];
    mockDirListing[projectDir] = [
      makeDirent('designs', true),
      makeDirent('project-design.md', false),
    ];
    mockDirListing[PROJECT_GROUP_DIR] = [
      makeDirent('Memory_project1.md', false),
    ];

    await capturedCronCallback!();

    // Should clean up both project .claude and Project_Group .claude
    const projectClaudeDir = path.join(projectDir, '.claude');
    const projectGroupClaudeDir = path.join(PROJECT_GROUP_DIR, '.claude');

    const rmSyncCalls = rmSyncMock.mock.calls;
    const projectClaudeCleanup = rmSyncCalls.find((c: unknown[]) => c[0] === projectClaudeDir);
    const projectGroupClaudeCleanup = rmSyncCalls.find((c: unknown[]) => c[0] === projectGroupClaudeDir);

    expect(projectClaudeCleanup).toBeDefined();
    expect(projectGroupClaudeCleanup).toBeDefined();
  });

  it('should log error when rmSync fails during aggregate file cleanup', async () => {
    const { startScheduler } = await importFresh();
    startScheduler();

    const projectDir = path.join(MEMORY_DIR, 'Memory_project1');
    const designsDir = path.join(projectDir, 'designs');
    const aggregatedFilePath = path.join(PROJECT_GROUP_DIR, 'Memory_project1.md');

    mockDirListing[MEMORY_DIR] = [makeDirent('Memory_project1', true)];
    mockDirListing[designsDir] = [makeDirent('change-a.md', false)];
    mockDirListing[projectDir] = [
      makeDirent('designs', true),
      makeDirent('project-design.md', false),
    ];
    mockDirListing[PROJECT_GROUP_DIR] = [
      makeDirent('Memory_project1.md', false),
      makeDirent('project-groups.json', false),
    ];
    setupValidGroupsJson(path.join(PROJECT_GROUP_DIR, 'project-groups.json'));

    // Make rmSync throw only for the aggregated file cleanup
    const originalRmSyncImpl = rmSyncMock.getMockImplementation();
    rmSyncMock.mockImplementation((target: string, ...args: unknown[]) => {
      if (target === aggregatedFilePath) {
        throw new Error('EACCES: permission denied');
      }
      // Allow other rmSync calls (e.g., .claude cleanup, project-groups.json delete) to proceed
      if (originalRmSyncImpl) return originalRmSyncImpl(target, ...args);
    });

    await capturedCronCallback!();

    // Validation should pass
    expect(appendLogMock).toHaveBeenCalledWith('project-groups.json schema validation passed');
    // Verify catch block logged the cleanup failure
    expect(appendLogMock).toHaveBeenCalledWith(
      `Failed to cleanup aggregated file ${aggregatedFilePath}: EACCES: permission denied`,
    );
    // Task should still complete normally (exception caught, finally runs)
    expect(appendLogMock).toHaveBeenCalledWith('Scheduler task finished');
    // .claude cleanup in finally should still execute
    const claudeCalls = rmSyncMock.mock.calls.filter((c: unknown[]) => String(c[0]).includes('.claude'));
    expect(claudeCalls.length).toBeGreaterThan(0);

    // Restore original implementation
    rmSyncMock.mockImplementation(originalRmSyncImpl || (() => {}));
  });
});

describe('project group sync: exception handling', () => {
  it('should catch exceptions and log without propagating to cron callback', async () => {
    const { startScheduler } = await importFresh();
    startScheduler();

    const projectDir = path.join(MEMORY_DIR, 'Memory_project1');
    const designsDir = path.join(projectDir, 'designs');

    mockDirListing[MEMORY_DIR] = [makeDirent('Memory_project1', true)];
    mockDirListing[designsDir] = [makeDirent('change-a.md', false)];
    mockDirListing[projectDir] = [
      makeDirent('designs', true),
      makeDirent('project-design.md', false),
    ];
    // Project_Group contains aggregated Memory_*.md for grouper to process
    const projectGroupDir = path.join(MEMORY_DIR, 'Project_Group');
    mockDirListing[projectGroupDir] = [makeDirent('Memory_project1.md', false)];

    // Make grouper execution fail
    let execCallCount = 0;
    execMock.mockImplementation((_command: string, _options: any, callback: any) => {
      execCallCount++;
      if (execCallCount === 2) {
        if (callback) callback(new Error('Grouper exploded'), '', '');
      } else {
        if (callback) callback(null, '', '');
      }
    });

    // Should NOT throw - exception is caught internally
    await expect(capturedCronCallback!()).resolves.not.toThrow();

    // Should log the group sync failure
    expect(appendLogMock).toHaveBeenCalledWith(expect.stringContaining('Group sync failed'));
    // Should still log task finished
    expect(appendLogMock).toHaveBeenCalledWith('Scheduler task finished');
  });

  it('should continue to Scheduler task finished after syncProjectGroup error', async () => {
    const { startScheduler } = await importFresh();
    startScheduler();

    const projectDir = path.join(MEMORY_DIR, 'Memory_project1');
    const designsDir = path.join(projectDir, 'designs');

    mockDirListing[MEMORY_DIR] = [makeDirent('Memory_project1', true)];
    mockDirListing[designsDir] = [makeDirent('change-a.md', false)];
    mockDirListing[projectDir] = [
      makeDirent('designs', true),
      makeDirent('project-design.md', false),
    ];

    // Make cpSync throw during group sync to simulate a catastrophic failure
    let cpSyncCallCount = 0;
    cpSyncMock.mockImplementation((...args: unknown[]) => {
      cpSyncCallCount++;
      // cpSync calls: 1=processProject agents, 2=processProject skills, 3=groupSync agents (this will throw)
      if (cpSyncCallCount === 3) {
        throw new Error('Disk full');
      }
    });

    await capturedCronCallback!();

    // Even with group sync failure, task should finish
    expect(appendLogMock).toHaveBeenCalledWith('Scheduler task finished');
    expect(appendLogMock).toHaveBeenCalledWith(expect.stringContaining('Group sync failed'));
  });
});

describe('project group sync: validation', () => {
  const validGroupsJson = JSON.stringify({
    version: '1.0.0',
    lastUpdated: '2026-06-21T00:00:00Z',
    groups: [
      {
        projectGroup: '测试项目群',
        projectDesc: '测试描述',
        projectPortrait:
          '面向测试团队，采用Monorepo架构，核心实体Test/Report，关键组件：测试引擎；覆盖自动化测试场景，服务QA团队，达成质量提升；数据流CI→Test→报告；不包含：部署、监控',
        members: ['Memory_project1.md'],
        tags: ['测试'],
        status: 'active',
      },
    ],
  });

  const invalidGroupsJson = JSON.stringify({
    version: '1.0.0',
    generatedAt: '2026-06-21T00:00:00Z',
    groups: [
      {
        id: 'test-group',
        name: '测试项目群',
        description: '测试描述',
        // missing projectPortrait
        projects: [{ id: 'p1', name: 'Project1', techStack: {} }],
        similarityDimensions: { tech: 0.8 },
      },
    ],
  });

  it('should pass validation and clean up when project-groups.json is valid', async () => {
    const { startScheduler } = await importFresh();
    startScheduler();

    const projectDir = path.join(MEMORY_DIR, 'Memory_project1');
    const designsDir = path.join(projectDir, 'designs');

    mockDirListing[MEMORY_DIR] = [makeDirent('Memory_project1', true)];
    mockDirListing[designsDir] = [makeDirent('change-a.md', false)];
    mockDirListing[projectDir] = [
      makeDirent('designs', true),
      makeDirent('project-design.md', false),
    ];
    mockDirListing[PROJECT_GROUP_DIR] = [
      makeDirent('Memory_project1.md', false),
      makeDirent('project-groups.json', false),
    ];

    // Provide valid JSON to readFileSync mock
    const jsonPath = path.join(PROJECT_GROUP_DIR, 'project-groups.json');
    mockFileSystem[jsonPath.replace(/\\/g, '/').toLowerCase()] = validGroupsJson;

    await capturedCronCallback!();

    // Validation should pass
    expect(appendLogMock).toHaveBeenCalledWith('project-groups.json schema validation passed');
    // Memory_*.md files should be cleaned up
    expect(rmSyncMock).toHaveBeenCalledWith(expect.stringContaining('Memory_project1.md'));
  });

  it('should reject invalid project-groups.json, delete it, and skip Memory_*.md cleanup', async () => {
    const { startScheduler } = await importFresh();
    startScheduler();

    const projectDir = path.join(MEMORY_DIR, 'Memory_project1');
    const designsDir = path.join(projectDir, 'designs');

    mockDirListing[MEMORY_DIR] = [makeDirent('Memory_project1', true)];
    mockDirListing[designsDir] = [makeDirent('change-a.md', false)];
    mockDirListing[projectDir] = [
      makeDirent('designs', true),
      makeDirent('project-design.md', false),
    ];
    mockDirListing[PROJECT_GROUP_DIR] = [
      makeDirent('Memory_project1.md', false),
      makeDirent('project-groups.json', false),
    ];

    // Provide invalid JSON to readFileSync mock (wrong field names, missing projectPortrait)
    const jsonPath = path.join(PROJECT_GROUP_DIR, 'project-groups.json');
    mockFileSystem[jsonPath.replace(/\\/g, '/').toLowerCase()] = invalidGroupsJson;

    await capturedCronCallback!();

    // Validation should fail
    expect(appendLogMock).toHaveBeenCalledWith(
      expect.stringContaining('project-groups.json validation FAILED'),
    );
    // Invalid file should be deleted
    expect(rmSyncMock).toHaveBeenCalledWith(expect.stringContaining('project-groups.json'));
    // Memory_*.md cleanup should be skipped (validation failed before reaching that code)
    const rmCalls = rmSyncMock.mock.calls;
    const mdCleanupCalls = rmCalls.filter(
      (c: unknown[]) => String(c[0]).includes('Memory_') && String(c[0]).endsWith('.md'),
    );
    expect(mdCleanupCalls.length).toBe(0);
  });
});
