/**
 * @fileoverview Tests for provider CRUD API routes
 * @author Meiyuki <meiyukichan@163.com>
 * @copyright 2026 Meiyuki
 */

import express from 'express';
import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import request from 'supertest';

// ---- mocks for providers-store ----

const {
  loadProvidersMock,
  createProviderMock,
  updateProviderMock,
  deleteProviderMock,
  toggleProviderMock,
  ensureProvidersFileMock,
} = vi.hoisted(() => ({
  loadProvidersMock: vi.fn(),
  createProviderMock: vi.fn(),
  updateProviderMock: vi.fn(),
  deleteProviderMock: vi.fn(),
  toggleProviderMock: vi.fn(),
  ensureProvidersFileMock: vi.fn(),
}));

const { loggerMock } = vi.hoisted(() => ({
  loggerMock: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock('../../utils/logger.js', () => ({
  logger: loggerMock,
}));

vi.mock('../providers-store.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../providers-store.js')>();
  return {
    ...actual,
    loadProviders: loadProvidersMock,
    createProvider: createProviderMock,
    updateProvider: updateProviderMock,
    deleteProvider: deleteProviderMock,
    toggleProvider: toggleProviderMock,
    ensureProvidersFile: ensureProvidersFileMock,
  };
});

// ---- helpers ----

const sampleProvider = {
  id: '550e8400-e29b-41d4-a716-446655440000',
  name: 'Test Provider',
  apiKey: 'sk-test-key',
  enabled: true,
  createdAt: '2026-01-01T00:00:00.000Z',
};

function createApp() {
  const app = express();
  app.use(express.json());
  return app;
}

// ---- test suite ----

describe('Provider Routes', () => {
  let app: express.Express;

  beforeAll(async () => {
    const mod = await import('./providers.js');
    const router = mod.providersRouter;
    app = createApp();
    app.use('/api/providers', router);
  });

  beforeEach(() => {
    vi.clearAllMocks();
    loadProvidersMock.mockReturnValue([sampleProvider]);
  });

  // ---- GET /api/providers ----

  describe('GET /api/providers', () => {
    it('should return JSON array of all providers with 200', async () => {
      loadProvidersMock.mockReturnValue([sampleProvider]);

      const res = await request(app).get('/api/providers');

      expect(res.status).toBe(200);
      expect(res.body).toEqual([sampleProvider]);
    });

    it('should return empty array when no providers', async () => {
      loadProvidersMock.mockReturnValue([]);

      const res = await request(app).get('/api/providers');

      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
    });
  });

  // ---- POST /api/providers ----

  describe('POST /api/providers', () => {
    it('should create provider with UUID and return 201', async () => {
      createProviderMock.mockReturnValue(sampleProvider);

      const res = await request(app)
        .post('/api/providers')
        .send({ name: 'Test', apiKey: 'sk-test' });

      expect(res.status).toBe(201);
      expect(res.body).toEqual(sampleProvider);
      expect(createProviderMock).toHaveBeenCalledWith({ name: 'Test', apiKey: 'sk-test' });
    });

    it('should return 400 when name is missing', async () => {
      const res = await request(app)
        .post('/api/providers')
        .send({ apiKey: 'sk-test' });

      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('error');
      expect(res.body).toHaveProperty('details');
      expect(Array.isArray(res.body.details)).toBe(true);
      expect(res.body.details.length).toBeGreaterThan(0);
    });

    it('should return 400 when apiKey is missing', async () => {
      const res = await request(app)
        .post('/api/providers')
        .send({ name: 'Test' });

      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('error');
      expect(res.body).toHaveProperty('details');
    });

    it('should return 400 with field-level validation errors for invalid types', async () => {
      const res = await request(app)
        .post('/api/providers')
        .send({ name: 'Test', apiKey: 'sk-test', enabled: 'not-a-boolean' });

      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('error');
      expect(res.body.details).toBeDefined();
      const hasEnabledError = res.body.details.some(
        (d: { field: string }) => d.field === 'enabled',
      );
      expect(hasEnabledError).toBe(true);
    });
  });

  // ---- PUT /api/providers/:id ----

  describe('PUT /api/providers/:id', () => {
    it('should update provider and return updated provider', async () => {
      const updated = { ...sampleProvider, name: 'Updated' };
      updateProviderMock.mockReturnValue(updated);

      const res = await request(app)
        .put('/api/providers/550e8400-e29b-41d4-a716-446655440000')
        .send({ name: 'Updated' });

      expect(res.status).toBe(200);
      expect(res.body).toEqual(updated);
      expect(updateProviderMock).toHaveBeenCalledWith(
        '550e8400-e29b-41d4-a716-446655440000',
        { name: 'Updated' },
      );
    });

    it('should return 404 when provider ID does not exist', async () => {
      updateProviderMock.mockImplementation(() => {
        throw new Error('not found');
      });

      const res = await request(app)
        .put('/api/providers/non-existent')
        .send({ name: 'Updated' });

      expect(res.status).toBe(404);
      expect(res.body).toHaveProperty('error');
    });

    it('should return 400 when body contains invalid types', async () => {
      const res = await request(app)
        .put('/api/providers/550e8400-e29b-41d4-a716-446655440000')
        .send({ name: 123 });

      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('error');
      expect(res.body).toHaveProperty('details');
    });
  });

  // ---- DELETE /api/providers/:id ----

  describe('DELETE /api/providers/:id', () => {
    it('should delete provider and return 204', async () => {
      deleteProviderMock.mockReturnValue(true);

      const res = await request(app).delete(
        '/api/providers/550e8400-e29b-41d4-a716-446655440000',
      );

      expect(res.status).toBe(204);
      expect(res.body).toEqual({});
    });

    it('should return 404 when provider ID does not exist', async () => {
      deleteProviderMock.mockReturnValue(false);

      const res = await request(app).delete('/api/providers/non-existent');

      expect(res.status).toBe(404);
      expect(res.body).toHaveProperty('error');
    });
  });

  // ---- PATCH /api/providers/:id/toggle ----

  describe('PATCH /api/providers/:id/toggle', () => {
    it('should toggle enabled from true to false and return updated provider', async () => {
      const toggled = { ...sampleProvider, enabled: false };
      toggleProviderMock.mockReturnValue(toggled);

      const res = await request(app).patch(
        '/api/providers/550e8400-e29b-41d4-a716-446655440000/toggle',
      );

      expect(res.status).toBe(200);
      expect(res.body).toEqual(toggled);
      expect(toggleProviderMock).toHaveBeenCalledWith(
        '550e8400-e29b-41d4-a716-446655440000',
      );
    });

    it('should return 404 when provider ID does not exist', async () => {
      toggleProviderMock.mockImplementation(() => {
        throw new Error('not found');
      });

      const res = await request(app).patch('/api/providers/non-existent/toggle');

      expect(res.status).toBe(404);
      expect(res.body).toHaveProperty('error');
    });
  });
});
