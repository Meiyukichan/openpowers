/**
 * @fileoverview Tests for scheduler module
 * @author Meiyuki <meiyukichan@163.com>
 * @copyright 2026 Meiyuki
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import path from 'path';

// ---- mocks ----

type CronCallback = () => void;

const mockTaskStart = vi.fn();
const mockTaskStop = vi.fn();
const mockTaskDestroy = vi.fn();
let capturedCronCallback: CronCallback | null = null;

// In-memory filesystem for mocking resource config reads
let mockFileSystem: Record<string, string> = {};

const { cronScheduleMock, appendLogMock, readDreamworkConfigMock, writeDreamworkConfigMock, formatYesterdayMock, cpSyncMock, rmSyncMock, mkdirSyncMock, existsSyncMock, readFileSyncMock } = vi.hoisted(() => ({
  cronScheduleMock: vi.fn((_expr: string, cb: CronCallback) => {
    capturedCronCallback = cb;
    return { start: mockTaskStart, stop: mockTaskStop, destroy: mockTaskDestroy };
  }),
  appendLogMock: vi.fn(),
  readDreamworkConfigMock: vi.fn(),
  writeDreamworkConfigMock: vi.fn(),
  formatYesterdayMock: vi.fn(),
  cpSyncMock: vi.fn(),
  rmSyncMock: vi.fn(),
  mkdirSyncMock: vi.fn(),
  existsSyncMock: vi.fn(),
  readFileSyncMock: vi.fn((p: unknown, _encoding?: unknown) => {
    const key = String(p).replace(/\\/g, '/').toLowerCase();
    // Try exact match first, then fall back to matching any key ending with 'openpowers.json'
    if (key in mockFileSystem) return mockFileSystem[key];
    // Look for config by suffix for resilience against path resolution differences
    for (const mk of Object.keys(mockFileSystem)) {
      if (mk.endsWith('resources/openpowers.json') && key.endsWith('resources/openpowers.json')) {
        return mockFileSystem[mk];
      }
    }
    throw new Error(`ENOENT: ${p}`);
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

vi.mock('./dreamwork.js', () => ({
  readDreamworkConfig: readDreamworkConfigMock,
  writeDreamworkConfig: writeDreamworkConfigMock,
  formatYesterday: formatYesterdayMock,
}));

vi.mock('fs', () => ({
  default: {
    cpSync: cpSyncMock,
    rmSync: rmSyncMock,
    mkdirSync: mkdirSyncMock,
    existsSync: existsSyncMock,
    readFileSync: readFileSyncMock,
  },
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

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
  capturedCronCallback = null;
  mockFileSystem = {};
  formatYesterdayMock.mockReturnValue('2026-06-03');
  readDreamworkConfigMock.mockReturnValue({
    workAt: '2026-06-03',
    projects: [],
  });
  existsSyncMock.mockReturnValue(false);
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

describe('cron callback: workAt validation', () => {
  it('should log start and completion messages', async () => {
    const { startScheduler } = await importFresh();
    startScheduler();
    expect(capturedCronCallback).not.toBeNull();

    capturedCronCallback!();

    expect(appendLogMock).toHaveBeenCalledWith('Scheduler task started');
    expect(appendLogMock).toHaveBeenCalledWith('Scheduler task finished');
  });

  it('should abort and log error when workAt is not yesterday', async () => {
    formatYesterdayMock.mockReturnValue('2026-06-03');
    readDreamworkConfigMock.mockReturnValue({
      workAt: '2026-06-01', // not yesterday
      projects: [{ project: '/some/project', changes: ['/some/project/design_test.md'] }],
    });

    const { startScheduler } = await importFresh();
    startScheduler();
    capturedCronCallback!();

    expect(appendLogMock).toHaveBeenCalledWith('Scheduler task started');
    expect(appendLogMock).toHaveBeenCalledWith(
      expect.stringContaining('Scheduler aborted: workAt mismatch'),
    );
    // Should reset dreamwork config with correct structure
    expect(writeDreamworkConfigMock).toHaveBeenCalledWith({
      workAt: '2026-06-03',
      projects: [],
    });
    // Should NOT process any projects
    expect(cpSyncMock).not.toHaveBeenCalled();
  });

  it('should proceed when workAt is yesterday', async () => {
    formatYesterdayMock.mockReturnValue('2026-06-03');
    readDreamworkConfigMock.mockReturnValue({
      workAt: '2026-06-03', // equals yesterday
      projects: [{ project: '/some/project', changes: ['/some/project/design_test.md'] }],
    });

    const { startScheduler } = await importFresh();
    startScheduler();
    capturedCronCallback!();

    // Should attempt to process the project (will try cp)
    expect(cpSyncMock).toHaveBeenCalled();
  });
});

describe('cron callback: processing projects', () => {
  it('should process all projects regardless of status', async () => {
    formatYesterdayMock.mockReturnValue('2026-06-03');
    readDreamworkConfigMock.mockReturnValue({
      workAt: '2026-06-03',
      projects: [
        { project: '/project/ready1', changes: ['/project/ready1/design_1.md'] },
        { project: '/project/skip', changes: ['/project/skip/design.md'] },
        { project: '/project/ready2', changes: ['/project/ready2/design_1.md'] },
        { project: '/project/done', changes: ['/project/done/design.md'] },
      ],
    });

    const { startScheduler } = await importFresh();
    startScheduler();
    capturedCronCallback!();

    // All 4 projects should trigger cpSync (agents + skills = 2 per project)
    expect(cpSyncMock).toHaveBeenCalledTimes(8); // 4 projects x 2 copies
  });

  it('should copy agents and skills to project .claude directory', async () => {
    formatYesterdayMock.mockReturnValue('2026-06-03');
    readDreamworkConfigMock.mockReturnValue({
      workAt: '2026-06-03',
      projects: [{ project: '/project/test', changes: ['/project/test/design_test.md'] }],
    });

    const { startScheduler } = await importFresh();
    startScheduler();
    capturedCronCallback!();

    // Should call cpSync for agents
    expect(cpSyncMock).toHaveBeenCalledWith(
      expect.stringContaining('agents'),
      path.join('/project/test', '.claude', 'agents'),
      { recursive: true },
    );
    // Should call cpSync for skills
    expect(cpSyncMock).toHaveBeenCalledWith(
      expect.stringContaining('skills'),
      path.join('/project/test', '.claude', 'skills'),
      { recursive: true },
    );
  });

  it('should write back config after processing with project.status="done" and empty changes', async () => {
    formatYesterdayMock.mockReturnValue('2026-06-03');
    const project = { project: '/project/test', changes: ['/project/test/design_test.md'] };
    readDreamworkConfigMock.mockReturnValue({
      workAt: '2026-06-03',
      projects: [project],
    });

    const { startScheduler } = await importFresh();
    startScheduler();
    capturedCronCallback!();

    // After processing, writeDreamworkConfig should be called with:
    // - each project has status='done' and changes=[]
    expect(writeDreamworkConfigMock).toHaveBeenCalledTimes(1);
    const writtenConfig = writeDreamworkConfigMock.mock.calls[0][0] as { workAt: string; projects: Array<{ project: string; changes: string[]; status?: 'done' }> };
    expect(writtenConfig.projects).toHaveLength(1);
    expect(writtenConfig.projects[0].project).toBe('/project/test');
    expect(writtenConfig.projects[0].status).toBe('done');
    expect(writtenConfig.projects[0].changes).toEqual([]);
  });

  it('should delete .opencode directory after processing', async () => {
    formatYesterdayMock.mockReturnValue('2026-06-03');
    readDreamworkConfigMock.mockReturnValue({
      workAt: '2026-06-03',
      projects: [{ project: '/project/test', changes: ['/project/test/design_test.md'] }],
    });
    existsSyncMock.mockReturnValue(true);

    const { startScheduler } = await importFresh();
    startScheduler();
    capturedCronCallback!();

    // cpSync called first, then rmSync for .opencode
    expect(cpSyncMock).toHaveBeenCalled();
    expect(rmSyncMock).toHaveBeenCalledWith(
      path.join('/project/test', '.opencode'),
      { recursive: true, force: true },
    );
  });

  it('should skip .opencode deletion when directory does not exist', async () => {
    formatYesterdayMock.mockReturnValue('2026-06-03');
    readDreamworkConfigMock.mockReturnValue({
      workAt: '2026-06-03',
      projects: [{ project: '/project/test', changes: ['/project/test/design_test.md'] }],
    });
    // .opencode does not exist
    existsSyncMock.mockReturnValue(false);

    const { startScheduler } = await importFresh();
    startScheduler();
    capturedCronCallback!();

    expect(cpSyncMock).toHaveBeenCalled();
    // existsSync should return false, so rmSync not called for .opencode
    const rmSyncCalls = rmSyncMock.mock.calls.filter(
      (call: unknown[]) => (call[0] as string).includes('.opencode'),
    );
    expect(rmSyncCalls.length).toBe(0);
  });

  it('should log each project being processed', async () => {
    formatYesterdayMock.mockReturnValue('2026-06-03');
    readDreamworkConfigMock.mockReturnValue({
      workAt: '2026-06-03',
      projects: [{ project: '/project/test', changes: ['/project/test/design_test.md'] }],
    });

    const { startScheduler } = await importFresh();
    startScheduler();
    capturedCronCallback!();

    expect(appendLogMock).toHaveBeenCalledWith(expect.stringContaining('Processing project:'));
    expect(appendLogMock).toHaveBeenCalledWith(expect.stringContaining('/project/test'));
    expect(appendLogMock).toHaveBeenCalledWith(expect.stringContaining('Project done:'));
  });
});

// =========================================================
// Dynamic cron from config
// =========================================================
describe('cron: dynamic cron expression', () => {
  /** The scheduler resolves ../../resources from its source file location,
   *  which in tests maps to <project_root>/resources */
  function schedulerResourcesConfigPath(): string {
    return path.join(process.cwd(), 'resources', 'openpowers.json');
  }

  it('should use cron from enhancement.memory.schedule in resources/openpowers.json', async () => {
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
