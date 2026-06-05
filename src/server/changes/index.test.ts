/**
 * @fileoverview Tests for changes API routes
 * @author Meiyuki <meiyukichan@163.com>
 * @copyright 2026 Meiyuki
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import * as express from 'express';

// ---- mocks ----

const { loadOrCreateChangesJsonMock } = vi.hoisted(() => ({
  loadOrCreateChangesJsonMock: vi.fn(),
}));

vi.mock('../../commands/change/shared.js', () => ({
  loadOrCreateChangesJson: loadOrCreateChangesJsonMock,
}));

// ---- helpers ----

async function importFresh() {
  return await import('./index.js');
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
});

// ---- test suites ----

describe('changesRouter', () => {
  it('should export changesRouter as a named function', async () => {
    const mod = await importFresh();
    expect(mod.changesRouter).toBeDefined();
    expect(typeof mod.changesRouter).toBe('function');
  });

  describe('GET / (mounted at /openpowers/api/changes)', () => {
    async function createTestApp() {
      const mod = await importFresh();
      const app = express.default();
      app.use(express.default.json());
      app.use('/openpowers/api/changes', mod.changesRouter);
      return app;
    }

    it('should return 200 with changes.json data', async () => {
      const mockData = {
        framework: 'openpowers',
        version: '1.0.0',
        changes: [
          { name: 'test-change', path: 'openpowers/changes/test-change', description: 'Test change' },
        ],
        archive: [],
      };
      loadOrCreateChangesJsonMock.mockReturnValue(mockData);

      const app = await createTestApp();

      const res = await request(app)
        .get('/openpowers/api/changes');

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        ok: true,
        data: mockData,
      });
      expect(loadOrCreateChangesJsonMock).toHaveBeenCalledTimes(1);
    });

    it('should return 200 with empty changes and archive when changes.json does not exist', async () => {
      const defaultData = {
        framework: 'openpowers',
        version: '1.0.0',
        changes: [],
        archive: [],
      };
      loadOrCreateChangesJsonMock.mockReturnValue(defaultData);

      const app = await createTestApp();

      const res = await request(app)
        .get('/openpowers/api/changes');

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        ok: true,
        data: defaultData,
      });
      expect(res.body.data.changes).toEqual([]);
      expect(res.body.data.archive).toEqual([]);
    });
  });

  describe('GET /:name (mounted at /openpowers/api/changes/:name)', () => {
    async function createTestApp() {
      const mod = await importFresh();
      const app = express.default();
      app.use(express.default.json());
      app.use('/openpowers/api/changes', mod.changesRouter);
      return app;
    }

    it('should return 200 with change details when found in changes array', async () => {
      const changeEntry = { name: 'my-change', path: 'openpowers/changes/my-change', description: 'My change' };
      const mockData = {
        framework: 'openpowers',
        version: '1.0.0',
        changes: [changeEntry],
        archive: [],
      };
      loadOrCreateChangesJsonMock.mockReturnValue(mockData);

      const app = await createTestApp();

      const res = await request(app)
        .get('/openpowers/api/changes/my-change');

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        ok: true,
        data: changeEntry,
      });
    });

    it('should return 200 with change details when found in archive array', async () => {
      const archiveEntry = { name: 'old-change', path: 'openpowers/archive/2026-01-01-old-change', description: 'Old change' };
      const mockData = {
        framework: 'openpowers',
        version: '1.0.0',
        changes: [],
        archive: [archiveEntry],
      };
      loadOrCreateChangesJsonMock.mockReturnValue(mockData);

      const app = await createTestApp();

      const res = await request(app)
        .get('/openpowers/api/changes/old-change');

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        ok: true,
        data: archiveEntry,
      });
    });

    it('should return 404 when change not found', async () => {
      const mockData = {
        framework: 'openpowers',
        version: '1.0.0',
        changes: [],
        archive: [],
      };
      loadOrCreateChangesJsonMock.mockReturnValue(mockData);

      const app = await createTestApp();

      const res = await request(app)
        .get('/openpowers/api/changes/non-existent');

      expect(res.status).toBe(404);
      expect(res.body).toEqual({
        ok: false,
        error: 'Change not found',
      });
    });
  });

  describe('error handling', () => {
    async function createTestApp() {
      const mod = await importFresh();
      const app = express.default();
      app.use(express.default.json());
      app.use('/openpowers/api/changes', mod.changesRouter);
      return app;
    }

    it('should return 500 when loadOrCreateChangesJson throws on GET /', async () => {
      loadOrCreateChangesJsonMock.mockImplementation(() => {
        throw new Error('ENOENT: no such file or directory');
      });

      const app = await createTestApp();

      const res = await request(app)
        .get('/openpowers/api/changes');

      expect(res.status).toBe(500);
      expect(res.body).toEqual({
        ok: false,
        error: 'Failed to load changes data',
      });
    });

    it('should return 500 when loadOrCreateChangesJson throws on GET /:name', async () => {
      loadOrCreateChangesJsonMock.mockImplementation(() => {
        throw new Error('EACCES: permission denied');
      });

      const app = await createTestApp();

      const res = await request(app)
        .get('/openpowers/api/changes/some-change');

      expect(res.status).toBe(500);
      expect(res.body).toEqual({
        ok: false,
        error: 'Failed to load changes data',
      });
    });
  });
});
