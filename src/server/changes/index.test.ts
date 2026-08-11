/**
 * @fileoverview Tests for changes API routes
 * @author Meiyuki <meiyukichan@163.com>
 * @copyright 2026 Meiyuki
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import * as express from 'express';

// ---- mocks ----

const { loadOrCreateChangesJsonMock, getAllChangesMock } = vi.hoisted(() => ({
  loadOrCreateChangesJsonMock: vi.fn(),
  getAllChangesMock: vi.fn(),
}));

vi.mock('../../commands/change/shared.js', () => ({
  loadOrCreateChangesJson: loadOrCreateChangesJsonMock,
}));

vi.mock('./shared.js', () => ({
  getAllChanges: getAllChangesMock,
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

  describe('GET / (mounted at /furina/api/changes)', () => {
    async function createTestApp() {
      const mod = await importFresh();
      const app = express.default();
      app.use(express.default.json());
      app.use('/furina/api/changes', mod.changesRouter);
      return app;
    }

    it('should return 200 with changes.json data', async () => {
      const mockData = {
        framework: 'furina',
        version: '1.0.0',
        changes: [
          { name: 'test-change', path: 'furina/changes/test-change', description: 'Test change' },
        ],
        archive: [],
      };
      loadOrCreateChangesJsonMock.mockReturnValue(mockData);

      const app = await createTestApp();

      const res = await request(app)
        .get('/furina/api/changes');

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        ok: true,
        data: mockData,
      });
      expect(loadOrCreateChangesJsonMock).toHaveBeenCalledTimes(1);
    });

    it('should return 200 with empty changes and archive when changes.json does not exist', async () => {
      const defaultData = {
        framework: 'furina',
        version: '1.0.0',
        changes: [],
        archive: [],
      };
      loadOrCreateChangesJsonMock.mockReturnValue(defaultData);

      const app = await createTestApp();

      const res = await request(app)
        .get('/furina/api/changes');

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        ok: true,
        data: defaultData,
      });
      expect(res.body.data.changes).toEqual([]);
      expect(res.body.data.archive).toEqual([]);
    });
  });

  describe('GET /all (mounted at /furina/api/changes/all)', () => {
    async function createTestApp() {
      const mod = await importFresh();
      const app = express.default();
      app.use(express.default.json());
      app.use('/furina/api/changes', mod.changesRouter);
      return app;
    }

    it('should return 200 with aggregated changes array (no params)', async () => {
      const mockChanges = [
        { name: 'change-a', description: 'Change A', cwd: 'D:\\project_a', updateAt: '2026-06-09T10:00:00Z' },
        { name: 'change-b', description: 'Change B', cwd: 'D:\\project_b', updateAt: '2026-06-08T10:00:00Z' },
      ];
      getAllChangesMock.mockResolvedValue(mockChanges);

      const app = await createTestApp();

      const res = await request(app)
        .get('/furina/api/changes/all');

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        ok: true,
        data: mockChanges,
      });
      expect(getAllChangesMock).toHaveBeenCalledTimes(1);
      expect(getAllChangesMock).toHaveBeenCalledWith({});
    });

    it('should pass status query param to getAllChanges', async () => {
      const mockChanges = [
        { name: 'active-change', status: 'active', cwd: 'D:\\project', updateAt: '2026-06-09T10:00:00Z' },
      ];
      getAllChangesMock.mockResolvedValue(mockChanges);

      const app = await createTestApp();

      const res = await request(app)
        .get('/furina/api/changes/all?status=active');

      expect(res.status).toBe(200);
      expect(res.body.data).toEqual(mockChanges);
      expect(getAllChangesMock).toHaveBeenCalledWith({ status: 'active' });
    });

    it('should pass cwd query param to getAllChanges', async () => {
      getAllChangesMock.mockResolvedValue([]);

      const app = await createTestApp();

      const res = await request(app)
        .get('/furina/api/changes/all?cwd=D%3A%5Cproject');

      expect(res.status).toBe(200);
      expect(getAllChangesMock).toHaveBeenCalledWith({ cwd: 'D:\\project' });
    });

    it('should pass query param to getAllChanges', async () => {
      const mockChanges = [
        { name: 'ui-change', description: 'UI feature', cwd: 'D:\\project', updateAt: '2026-06-09T10:00:00Z' },
      ];
      getAllChangesMock.mockResolvedValue(mockChanges);

      const app = await createTestApp();

      const res = await request(app)
        .get('/furina/api/changes/all?query=ui');

      expect(res.status).toBe(200);
      expect(res.body.data).toEqual(mockChanges);
      expect(getAllChangesMock).toHaveBeenCalledWith({ query: 'ui' });
    });

    it('should pass all query params combined (AND logic)', async () => {
      getAllChangesMock.mockResolvedValue([]);

      const app = await createTestApp();

      const res = await request(app)
        .get('/furina/api/changes/all?status=active&cwd=D%3A%5Cproject&query=ui');

      expect(res.status).toBe(200);
      expect(getAllChangesMock).toHaveBeenCalledWith({
        status: 'active',
        cwd: 'D:\\project',
        query: 'ui',
      });
    });

    it('should return 200 with empty array when no changes found', async () => {
      getAllChangesMock.mockResolvedValue([]);

      const app = await createTestApp();

      const res = await request(app)
        .get('/furina/api/changes/all');

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        ok: true,
        data: [],
      });
    });

    it('should return 200 with empty array when empty query string passed', async () => {
      getAllChangesMock.mockResolvedValue([]);

      const app = await createTestApp();

      const res = await request(app)
        .get('/furina/api/changes/all?status=&cwd=&query=');

      expect(res.status).toBe(200);
      // Empty string params should be treated as absent
      expect(getAllChangesMock).toHaveBeenCalledWith({});
    });
  });

  describe('GET /:name (mounted at /furina/api/changes/:name)', () => {
    async function createTestApp() {
      const mod = await importFresh();
      const app = express.default();
      app.use(express.default.json());
      app.use('/furina/api/changes', mod.changesRouter);
      return app;
    }

    it('should return 200 with change details when found in changes array', async () => {
      const changeEntry = { name: 'my-change', path: 'furina/changes/my-change', description: 'My change' };
      const mockData = {
        framework: 'furina',
        version: '1.0.0',
        changes: [changeEntry],
        archive: [],
      };
      loadOrCreateChangesJsonMock.mockReturnValue(mockData);

      const app = await createTestApp();

      const res = await request(app)
        .get('/furina/api/changes/my-change');

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        ok: true,
        data: changeEntry,
      });
    });

    it('should return 200 with change details when found in archive array', async () => {
      const archiveEntry = { name: 'old-change', path: 'furina/archive/2026-01-01-old-change', description: 'Old change' };
      const mockData = {
        framework: 'furina',
        version: '1.0.0',
        changes: [],
        archive: [archiveEntry],
      };
      loadOrCreateChangesJsonMock.mockReturnValue(mockData);

      const app = await createTestApp();

      const res = await request(app)
        .get('/furina/api/changes/old-change');

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        ok: true,
        data: archiveEntry,
      });
    });

    it('should return 404 when change not found', async () => {
      const mockData = {
        framework: 'furina',
        version: '1.0.0',
        changes: [],
        archive: [],
      };
      loadOrCreateChangesJsonMock.mockReturnValue(mockData);

      const app = await createTestApp();

      const res = await request(app)
        .get('/furina/api/changes/non-existent');

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
      app.use('/furina/api/changes', mod.changesRouter);
      return app;
    }

    it('should return 500 when loadOrCreateChangesJson throws on GET /', async () => {
      loadOrCreateChangesJsonMock.mockImplementation(() => {
        throw new Error('ENOENT: no such file or directory');
      });

      const app = await createTestApp();

      const res = await request(app)
        .get('/furina/api/changes');

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
        .get('/furina/api/changes/some-change');

      expect(res.status).toBe(500);
      expect(res.body).toEqual({
        ok: false,
        error: 'Failed to load changes data',
      });
    });

    it('should return 500 when getAllChanges rejects on GET /all', async () => {
      getAllChangesMock.mockRejectedValue(new Error('EACCES: permission denied'));

      const app = await createTestApp();

      const res = await request(app)
        .get('/furina/api/changes/all');

      expect(res.status).toBe(500);
      expect(res.body).toEqual({
        ok: false,
        error: 'Failed to load aggregated changes data',
      });
    });
  });
});
