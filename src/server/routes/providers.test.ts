/**
 * @fileoverview Tests for provider CRUD API routes
 * @author Meiyuki <meiyukichan@163.com>
 * @copyright 2026 Meiyuki
 */

import * as express from 'express';
import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import request from 'supertest';

// ---- mocks for providers-store ----

const {
  loadProvidersMock,
  createProviderMock,
  updateProviderMock,
  deleteProviderMock,
  ensureProvidersFileMock,
  getActiveProviderIdMock,
  setActiveProviderIdMock,
} = vi.hoisted(() => ({
  loadProvidersMock: vi.fn(),
  createProviderMock: vi.fn(),
  updateProviderMock: vi.fn(),
  deleteProviderMock: vi.fn(),
  ensureProvidersFileMock: vi.fn(),
  getActiveProviderIdMock: vi.fn(),
  setActiveProviderIdMock: vi.fn(),
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
    ensureProvidersFile: ensureProvidersFileMock,
    getActiveProviderId: getActiveProviderIdMock,
    setActiveProviderId: setActiveProviderIdMock,
  };
});

// ---- mocks for provider-templates ----

const { readProviderTemplatesMock, addProviderTemplateMock } = vi.hoisted(() => ({
  readProviderTemplatesMock: vi.fn(),
  addProviderTemplateMock: vi.fn(),
}));

vi.mock('../../utils/provider-templates.js', () => ({
  readProviderTemplates: readProviderTemplatesMock,
  addProviderTemplate: addProviderTemplateMock,
}));

// ---- helpers ----

const sampleProvider = {
  id: '550e8400-e29b-41d4-a716-446655440000',
  name: 'Test Provider',
  apiKey: 'sk-test-key',
  defaultModel: 'test-default-model',
  sonnetModel: 'test-sonnet-model',
  opusModel: 'test-opus-model',
  haikuModel: 'test-haiku-model',
  createdAt: '2026-01-01T00:00:00.000Z',
};

function createApp() {
  const app = express.default();
  app.use(express.default.json());
  return app;
}

// ---- test suite ----

describe('Provider Routes', () => {
  let app: express.Express;

  beforeAll(async () => {
    const mod = await import('./providers.js');
    const router = mod.providersRouter;
    app = createApp();
    app.use('/openpowers/api/providers', router);
  });

  beforeEach(() => {
    vi.clearAllMocks();
    loadProvidersMock.mockReturnValue([sampleProvider]);
  });

  // ---- GET /openpowers/api/providers ----

  describe('GET /openpowers/api/providers', () => {
    it('should return JSON array of all providers with 200', async () => {
      loadProvidersMock.mockReturnValue([sampleProvider]);

      const res = await request(app).get('/openpowers/api/providers');

      expect(res.status).toBe(200);
      expect(res.body).toEqual([sampleProvider]);
    });

    it('should return empty array when no providers', async () => {
      loadProvidersMock.mockReturnValue([]);

      const res = await request(app).get('/openpowers/api/providers');

      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
    });
  });

  // ---- POST /openpowers/api/providers ----

  describe('POST /openpowers/api/providers', () => {
    it('should create provider with UUID and return 201', async () => {
      createProviderMock.mockReturnValue(sampleProvider);

      const res = await request(app)
        .post('/openpowers/api/providers')
        .send({
          name: 'Test',
          apiKey: 'sk-test',
          defaultModel: 'dm',
          sonnetModel: 'sm',
          opusModel: 'om',
          haikuModel: 'hm',
        });

      expect(res.status).toBe(201);
      expect(res.body).toEqual(sampleProvider);
      expect(createProviderMock).toHaveBeenCalledWith({
        name: 'Test',
        apiKey: 'sk-test',
        defaultModel: 'dm',
        sonnetModel: 'sm',
        opusModel: 'om',
        haikuModel: 'hm',
      });
    });

    it('should return 400 when name is missing', async () => {
      const res = await request(app)
        .post('/openpowers/api/providers')
        .send({
          apiKey: 'sk-test',
          defaultModel: 'dm',
          sonnetModel: 'sm',
          opusModel: 'om',
          haikuModel: 'hm',
        });

      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('error');
      expect(res.body).toHaveProperty('details');
      expect(Array.isArray(res.body.details)).toBe(true);
      expect(res.body.details.length).toBeGreaterThan(0);
    });

    it('should return 400 when apiKey is missing', async () => {
      const res = await request(app)
        .post('/openpowers/api/providers')
        .send({
          name: 'Test',
          defaultModel: 'dm',
          sonnetModel: 'sm',
          opusModel: 'om',
          haikuModel: 'hm',
        });

      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('error');
      expect(res.body).toHaveProperty('details');
    });

    it('should return 400 when model fields are missing', async () => {
      const res = await request(app)
        .post('/openpowers/api/providers')
        .send({ name: 'Test', apiKey: 'sk-test' });

      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('error');
      expect(res.body).toHaveProperty('details');
    });

    it('should return 409 when provider name already exists', async () => {
      createProviderMock.mockImplementation(() => {
        throw new Error(`Provider name "Test Provider" already exists`);
      });

      const res = await request(app)
        .post('/openpowers/api/providers')
        .send({
          name: 'Test Provider',
          apiKey: 'sk-test',
          defaultModel: 'dm',
          sonnetModel: 'sm',
          opusModel: 'om',
          haikuModel: 'hm',
        });

      expect(res.status).toBe(409);
      expect(res.body).toHaveProperty('error');
      expect(res.body.error).toMatch(/already exists/i);
    });

    it('should return 201 when name differs only in case from existing provider (case-sensitive matching)', async () => {
      createProviderMock.mockImplementation((input: { name: string }) => ({
        ...sampleProvider,
        name: input.name,
        id: 'case-diff-uuid',
      }));

      const res = await request(app)
        .post('/openpowers/api/providers')
        .send({
          name: 'anthropic',
          apiKey: 'sk-test',
          defaultModel: 'dm',
          sonnetModel: 'sm',
          opusModel: 'om',
          haikuModel: 'hm',
        });

      expect(res.status).toBe(201);
      expect(res.body.name).toBe('anthropic');
      expect(res.body.id).toBe('case-diff-uuid');
    });

    it('should return 500 when createProvider throws a non-duplicate error', async () => {
      createProviderMock.mockImplementation(() => {
        throw new Error('Disk write failed');
      });

      const res = await request(app)
        .post('/openpowers/api/providers')
        .send({
          name: 'Test',
          apiKey: 'sk-test',
          defaultModel: 'dm',
          sonnetModel: 'sm',
          opusModel: 'om',
          haikuModel: 'hm',
        });

      expect(res.status).toBe(500);
      expect(res.body).toHaveProperty('error');
    });
  });

  // ---- PUT /openpowers/api/providers/:id ----

  describe('PUT /openpowers/api/providers/:id', () => {
    it('should update provider and return updated provider', async () => {
      const updated = { ...sampleProvider, name: 'Updated' };
      updateProviderMock.mockReturnValue(updated);

      const res = await request(app)
        .put('/openpowers/api/providers/550e8400-e29b-41d4-a716-446655440000')
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
        .put('/openpowers/api/providers/non-existent')
        .send({ name: 'Updated' });

      expect(res.status).toBe(404);
      expect(res.body).toHaveProperty('error');
    });

    it('should return 400 when body contains invalid types', async () => {
      const res = await request(app)
        .put('/openpowers/api/providers/550e8400-e29b-41d4-a716-446655440000')
        .send({ name: 123 });

      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('error');
      expect(res.body).toHaveProperty('details');
    });
  });

  // ---- DELETE /openpowers/api/providers/:id ----

  describe('DELETE /openpowers/api/providers/:id', () => {
    it('should delete provider and return 204', async () => {
      deleteProviderMock.mockReturnValue(true);

      const res = await request(app).delete(
        '/openpowers/api/providers/550e8400-e29b-41d4-a716-446655440000',
      );

      expect(res.status).toBe(204);
      expect(res.body).toEqual({});
    });

    it('should return 404 when provider ID does not exist', async () => {
      deleteProviderMock.mockReturnValue(false);

      const res = await request(app).delete('/openpowers/api/providers/non-existent');

      expect(res.status).toBe(404);
      expect(res.body).toHaveProperty('error');
    });
  });

  // ---- GET /openpowers/api/providers/active ----

  describe('GET /openpowers/api/providers/active', () => {
    it('should return activeProviderId when set', async () => {
      getActiveProviderIdMock.mockReturnValue(
        '550e8400-e29b-41d4-a716-446655440000',
      );

      const res = await request(app).get('/openpowers/api/providers/active');

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        activeProviderId: '550e8400-e29b-41d4-a716-446655440000',
      });
    });

    it('should return null when no active provider is set', async () => {
      getActiveProviderIdMock.mockReturnValue(null);

      const res = await request(app).get('/openpowers/api/providers/active');

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ activeProviderId: null });
    });
  });

  // ---- PUT /openpowers/api/providers/active ----

  describe('PUT /openpowers/api/providers/active', () => {
    it('should set active provider and return 200', async () => {
      setActiveProviderIdMock.mockReturnValue(undefined);

      const res = await request(app)
        .put('/openpowers/api/providers/active')
        .send({ providerId: '550e8400-e29b-41d4-a716-446655440000' });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        activeProviderId: '550e8400-e29b-41d4-a716-446655440000',
      });
      expect(setActiveProviderIdMock).toHaveBeenCalledWith(
        '550e8400-e29b-41d4-a716-446655440000',
      );
    });

    it('should return 400 when providerId is missing', async () => {
      const res = await request(app)
        .put('/openpowers/api/providers/active')
        .send({});

      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('error');
    });

    it('should return 404 when provider ID does not exist', async () => {
      setActiveProviderIdMock.mockImplementation(() => {
        throw new Error('Provider not found: non-existent');
      });

      const res = await request(app)
        .put('/openpowers/api/providers/active')
        .send({ providerId: 'non-existent' });

      expect(res.status).toBe(404);
      expect(res.body).toHaveProperty('error');
    });
  });

  // ---- GET /openpowers/api/providers/templates ----

  describe('GET /openpowers/api/providers/templates', () => {
    const sampleTemplate = {
      name: 'Claude Official',
      websiteUrl: 'https://www.anthropic.com/claude-code',
      baseUrl: 'https://api.anthropic.com',
      iconSvg: 'anthropic.svg',
      defaultModel: '',
      sonnetModel: '',
      opusModel: '',
      haikuModel: '',
      source: 'builtin',
    };

    it('should return template array with 200', async () => {
      readProviderTemplatesMock.mockReturnValue([sampleTemplate]);

      const res = await request(app).get('/openpowers/api/providers/templates');

      expect(res.status).toBe(200);
      expect(res.body).toEqual([sampleTemplate]);
    });

    it('should return empty array when no templates exist', async () => {
      readProviderTemplatesMock.mockReturnValue([]);

      const res = await request(app).get('/openpowers/api/providers/templates');

      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
    });
  });

  // ---- POST /openpowers/api/providers/templates ----

  describe('POST /openpowers/api/providers/templates', () => {
    const sampleTemplate = {
      name: 'New Provider',
      websiteUrl: 'https://example.com',
      baseUrl: 'https://api.example.com',
      iconSvg: '',
      defaultModel: '',
      sonnetModel: '',
      opusModel: '',
      haikuModel: '',
      source: 'custom',
    };

    it('should add template and return 201 when name is unique', async () => {
      addProviderTemplateMock.mockReturnValue(sampleTemplate);

      const res = await request(app)
        .post('/openpowers/api/providers/templates')
        .send(sampleTemplate);

      expect(res.status).toBe(201);
      expect(res.body).toEqual(sampleTemplate);
      // addProviderTemplate receives parsed data (zod strips unknown fields like source)
      expect(addProviderTemplateMock).toHaveBeenCalled();
    });

    it('should return 409 when template name already exists', async () => {
      addProviderTemplateMock.mockImplementation(() => {
        throw new Error(`Template name "${sampleTemplate.name}" already exists`);
      });

      const res = await request(app)
        .post('/openpowers/api/providers/templates')
        .send(sampleTemplate);

      expect(res.status).toBe(409);
      expect(res.body).toHaveProperty('error');
      expect(res.body.error).toMatch(/already exists/i);
    });

    it('should silently discard apiKey field when present', async () => {
      addProviderTemplateMock.mockReturnValue(sampleTemplate);

      // zod strips unknown fields (apiKey, source) from the input, so
      // addProviderTemplate receives only known template fields
      const expectedInput = {
        name: 'New Provider',
        websiteUrl: 'https://example.com',
        baseUrl: 'https://api.example.com',
        iconSvg: '',
        defaultModel: '',
        sonnetModel: '',
        opusModel: '',
        haikuModel: '',
      };

      const res = await request(app)
        .post('/openpowers/api/providers/templates')
        .send({ ...sampleTemplate, apiKey: 'sk-should-be-discarded' });

      expect(res.status).toBe(201);
      // apiKey should be stripped before passing to addProviderTemplate
      expect(addProviderTemplateMock).toHaveBeenCalledWith(expectedInput);
    });

    it('should return 400 when required fields are missing', async () => {
      const res = await request(app)
        .post('/openpowers/api/providers/templates')
        .send({ websiteUrl: 'https://example.com' });

      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('error');
      expect(res.body).toHaveProperty('details');
    });
  });
});
