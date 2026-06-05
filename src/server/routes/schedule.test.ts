/**
 * @fileoverview Tests for schedule API route
 * @author Meiyuki <meiyukichan@163.com>
 * @copyright 2026 Meiyuki
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import * as express from 'express';

// ---- mocks ----

const { startSchedulerMock, stopSchedulerMock, isSchedulerRunningMock } = vi.hoisted(() => ({
  startSchedulerMock: vi.fn(),
  stopSchedulerMock: vi.fn(),
  isSchedulerRunningMock: vi.fn(),
}));

vi.mock('../memory/scheduler.js', () => ({
  startScheduler: startSchedulerMock,
  stopScheduler: stopSchedulerMock,
  isSchedulerRunning: isSchedulerRunningMock,
}));

vi.mock('../memory/schedule-logger.js', () => ({
  appendLog: vi.fn(),
}));

// ---- helpers ----

async function importFresh() {
  return await import('./schedule.js');
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
  isSchedulerRunningMock.mockReturnValue(false);
});

// ---- test suites ----

describe('scheduleRouter', () => {
  it('should export scheduleRouter as a named Router', async () => {
    const mod = await importFresh();
    expect(mod.scheduleRouter).toBeDefined();
    expect(typeof mod.scheduleRouter).toBe('function');
  });

  describe('PUT / (mounted at /openpowers/api/schedule)', () => {
    async function createTestApp() {
      const mod = await importFresh();
      const app = express.default();
      app.use(express.default.json());
      app.use('/openpowers/api/schedule', mod.scheduleRouter);
      return app;
    }

    it('should start scheduler and return { ok: true, started: true } when not running', async () => {
      isSchedulerRunningMock.mockReturnValue(false);
      const app = await createTestApp();

      const res = await request(app)
        .put('/openpowers/api/schedule')
        .send({});

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ ok: true, started: true });
      expect(startSchedulerMock).toHaveBeenCalledTimes(1);
    });

    it('should return { ok: true, started: false } when scheduler already running', async () => {
      isSchedulerRunningMock.mockReturnValue(true);
      const app = await createTestApp();

      const res = await request(app)
        .put('/openpowers/api/schedule')
        .send({});

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ ok: true, started: false });
      expect(startSchedulerMock).not.toHaveBeenCalled();
    });

    it('should not call startScheduler when already running', async () => {
      isSchedulerRunningMock.mockReturnValue(true);
      const app = await createTestApp();

      await request(app)
        .put('/openpowers/api/schedule')
        .send({});

      expect(startSchedulerMock).not.toHaveBeenCalled();
    });

    it('should call startScheduler when not running', async () => {
      isSchedulerRunningMock.mockReturnValue(false);
      const app = await createTestApp();

      await request(app)
        .put('/openpowers/api/schedule')
        .send({});

      expect(startSchedulerMock).toHaveBeenCalledTimes(1);
    });
  });

  describe('DELETE / (mounted at /openpowers/api/schedule)', () => {
    async function createTestApp() {
      const mod = await importFresh();
      const app = express.default();
      app.use(express.default.json());
      app.use('/openpowers/api/schedule', mod.scheduleRouter);
      return app;
    }

    it('should stop scheduler and return { ok: true, stopped: true } when running', async () => {
      isSchedulerRunningMock.mockReturnValue(true);
      const app = await createTestApp();

      const res = await request(app)
        .delete('/openpowers/api/schedule')
        .send({});

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ ok: true, stopped: true });
      expect(stopSchedulerMock).toHaveBeenCalledTimes(1);
    });

    it('should return { ok: true, stopped: false } when scheduler not running', async () => {
      isSchedulerRunningMock.mockReturnValue(false);
      const app = await createTestApp();

      const res = await request(app)
        .delete('/openpowers/api/schedule')
        .send({});

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ ok: true, stopped: false });
    });

    it('should not call stopScheduler when not running', async () => {
      isSchedulerRunningMock.mockReturnValue(false);
      const app = await createTestApp();

      await request(app)
        .delete('/openpowers/api/schedule')
        .send({});

      expect(stopSchedulerMock).not.toHaveBeenCalled();
    });
  });

  describe('POST /restart (mounted at /openpowers/api/schedule/restart)', () => {
    async function createTestApp() {
      const mod = await importFresh();
      const app = express.default();
      app.use(express.default.json());
      app.use('/openpowers/api/schedule', mod.scheduleRouter);
      return app;
    }

    it('should stop then start scheduler and return { ok: true, restarted: true }', async () => {
      const app = await createTestApp();

      const res = await request(app)
        .post('/openpowers/api/schedule/restart')
        .send({});

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ ok: true, restarted: true });
      expect(stopSchedulerMock).toHaveBeenCalledTimes(1);
      expect(startSchedulerMock).toHaveBeenCalledTimes(1);
    });

    it('should return 500 with error message when restart throws', async () => {
      stopSchedulerMock.mockImplementation(() => {
        throw new Error('Mock restart failure');
      });
      const app = await createTestApp();

      const res = await request(app)
        .post('/openpowers/api/schedule/restart')
        .send({});

      expect(res.status).toBe(500);
      expect(res.body).toEqual({ ok: false, error: 'Mock restart failure' });
    });
  });
});
