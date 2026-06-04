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

const { cronScheduleMock, appendLogMock, readDreamworkConfigMock, writeDreamworkConfigMock, formatYesterdayMock, cpSyncMock, rmSyncMock, mkdirSyncMock, existsSyncMock } = vi.hoisted(() => ({
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
  formatYesterdayMock.mockReturnValue('2026-06-03');
  readDreamworkConfigMock.mockReturnValue({
    status: 'ready',
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
  });

  it('should not register a second cron job if already running', async () => {
    const { startScheduler } = await importFresh();
    startScheduler();
    startScheduler();

    // Only one cron registered (second call is no-op)
    expect(cronScheduleMock).toHaveBeenCalledTimes(1);
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
      status: 'ready',
      workAt: '2026-06-01', // not yesterday
      projects: [{ project: '/some/project', changes: [{ path: '/some/project/design_test.md', status: 'ready' }] }],
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
      status: 'ready',
      workAt: '2026-06-03',
      projects: [],
    });
    // Should NOT process any projects
    expect(cpSyncMock).not.toHaveBeenCalled();
  });

  it('should proceed when workAt is yesterday', async () => {
    formatYesterdayMock.mockReturnValue('2026-06-03');
    readDreamworkConfigMock.mockReturnValue({
      status: 'ready',
      workAt: '2026-06-03', // equals yesterday
      projects: [{ project: '/some/project', changes: [{ path: '/some/project/design_test.md', status: 'ready' }] }],
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
      status: 'ready',
      workAt: '2026-06-03',
      projects: [
        { project: '/project/ready1', changes: [{ path: '/project/ready1/design_1.md', status: 'ready' }] },
        { project: '/project/skip', changes: [{ path: '/project/skip/design.md', status: 'pending' }] },
        { project: '/project/ready2', changes: [{ path: '/project/ready2/design_1.md', status: 'ready' }] },
        { project: '/project/done', changes: [{ path: '/project/done/design.md', status: 'done' }] },
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
      status: 'ready',
      workAt: '2026-06-03',
      projects: [{ project: '/project/test', changes: [{ path: '/project/test/design_test.md', status: 'ready' }] }],
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

  it('should not write config during normal processing when config is unchanged', async () => {
    formatYesterdayMock.mockReturnValue('2026-06-03');
    const project = { project: '/project/test', changes: [{ path: '/project/test/design_test.md', status: 'ready' }] };
    readDreamworkConfigMock.mockReturnValue({
      status: 'ready',
      workAt: '2026-06-03',
      projects: [project],
    });

    const { startScheduler } = await importFresh();
    startScheduler();
    capturedCronCallback!();

    // Config is unchanged during normal processing, so writeDreamworkConfig should NOT be called
    // (only called on workAt mismatch to reset config)
    expect(writeDreamworkConfigMock).not.toHaveBeenCalled();
  });

  it('should delete .opencode directory after processing', async () => {
    formatYesterdayMock.mockReturnValue('2026-06-03');
    readDreamworkConfigMock.mockReturnValue({
      status: 'ready',
      workAt: '2026-06-03',
      projects: [{ project: '/project/test', changes: [{ path: '/project/test/design_test.md', status: 'ready' }] }],
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
      status: 'ready',
      workAt: '2026-06-03',
      projects: [{ project: '/project/test', changes: [{ path: '/project/test/design_test.md', status: 'ready' }] }],
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
      status: 'ready',
      workAt: '2026-06-03',
      projects: [{ project: '/project/test', changes: [{ path: '/project/test/design_test.md', status: 'ready' }] }],
    });

    const { startScheduler } = await importFresh();
    startScheduler();
    capturedCronCallback!();

    expect(appendLogMock).toHaveBeenCalledWith(expect.stringContaining('Processing project:'));
    expect(appendLogMock).toHaveBeenCalledWith(expect.stringContaining('/project/test'));
    expect(appendLogMock).toHaveBeenCalledWith(expect.stringContaining('Project done:'));
  });
});
