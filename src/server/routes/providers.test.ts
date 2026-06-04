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
  getNeverClaudeSettingsMock,
  setNeverClaudeSettingsMock,
  getProviderByIdMock,
  getActiveProviderMock,
  getEnableOpenpowersProxyMock,
  setEnableOpenpowersProxyMock,
  clearActiveProviderIdMock,
} = vi.hoisted(() => ({
  loadProvidersMock: vi.fn(),
  createProviderMock: vi.fn(),
  updateProviderMock: vi.fn(),
  deleteProviderMock: vi.fn(),
  ensureProvidersFileMock: vi.fn(),
  getActiveProviderIdMock: vi.fn(),
  setActiveProviderIdMock: vi.fn(),
  getNeverClaudeSettingsMock: vi.fn(),
  setNeverClaudeSettingsMock: vi.fn(),
  getProviderByIdMock: vi.fn(),
  getActiveProviderMock: vi.fn(),
  getEnableOpenpowersProxyMock: vi.fn(),
  setEnableOpenpowersProxyMock: vi.fn(),
  clearActiveProviderIdMock: vi.fn(),
}));

const { loggerMock } = vi.hoisted(() => ({
  loggerMock: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

const {
  getProxyEnvMock,
  getProviderEnvMock,
  writeEnvToClaudeSettingsMock,
  backupClaudeSettingsMock,
  restoreClaudeSettingsMock,
} = vi.hoisted(() => ({
  getProxyEnvMock: vi.fn(),
  getProviderEnvMock: vi.fn(),
  writeEnvToClaudeSettingsMock: vi.fn(),
  backupClaudeSettingsMock: vi.fn(),
  restoreClaudeSettingsMock: vi.fn(),
}));

const { axiosMock, isAxiosErrorMock } = vi.hoisted(() => ({
  axiosMock: vi.fn(),
  isAxiosErrorMock: vi.fn(
    (payload: unknown): boolean =>
      typeof payload === 'object' && payload !== null && (payload as Record<string, unknown>).isAxiosError === true,
  ),
}));

vi.mock('../../utils/logger.js', () => ({
  logger: loggerMock,
}));

vi.mock('axios', () => ({
  default: Object.assign(axiosMock, { isAxiosError: isAxiosErrorMock }),
  isAxiosError: isAxiosErrorMock,
}));

vi.mock('../claude-settings.js', () => ({
  getProxyEnv: getProxyEnvMock,
  getProviderEnv: getProviderEnvMock,
  writeEnvToClaudeSettings: writeEnvToClaudeSettingsMock,
  backupClaudeSettings: backupClaudeSettingsMock,
  restoreClaudeSettings: restoreClaudeSettingsMock,
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
    getNeverClaudeSettings: getNeverClaudeSettingsMock,
    setNeverClaudeSettings: setNeverClaudeSettingsMock,
    getProviderById: getProviderByIdMock,
    getActiveProvider: getActiveProviderMock,
    getEnableOpenpowersProxy: getEnableOpenpowersProxyMock,
    setEnableOpenpowersProxy: setEnableOpenpowersProxyMock,
    clearActiveProviderId: clearActiveProviderIdMock,
  };
});

// ---- mocks for provider-templates ----

const { readProviderTemplatesMock, addProviderTemplateMock, deleteProviderTemplateMock } = vi.hoisted(() => ({
  readProviderTemplatesMock: vi.fn(),
  addProviderTemplateMock: vi.fn(),
  deleteProviderTemplateMock: vi.fn(),
}));

vi.mock('../../utils/provider-templates.js', () => ({
  readProviderTemplates: readProviderTemplatesMock,
  addProviderTemplate: addProviderTemplateMock,
  deleteProviderTemplate: deleteProviderTemplateMock,
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

const sampleProviderEnv = {
  ANTHROPIC_BASE_URL: '',
  ANTHROPIC_AUTH_TOKEN: 'sk-test-key',
  ANTHROPIC_MODEL: 'test-default-model',
  ANTHROPIC_DEFAULT_HAIKU_MODEL: 'test-haiku-model',
  ANTHROPIC_DEFAULT_SONNET_MODEL: 'test-sonnet-model',
  ANTHROPIC_DEFAULT_OPUS_MODEL: 'test-opus-model',
};

const sampleProxyEnv = {
  ANTHROPIC_BASE_URL: 'http://localhost:3939',
  ANTHROPIC_AUTH_TOKEN: 'sk-1234',
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
    readProviderTemplatesMock.mockReturnValue([]);
    getNeverClaudeSettingsMock.mockReturnValue(true);
    getEnableOpenpowersProxyMock.mockReturnValue(false);
    getActiveProviderIdMock.mockReturnValue(null);
    getProviderByIdMock.mockReturnValue(sampleProvider);
    getProviderEnvMock.mockReturnValue(sampleProviderEnv);
    getProxyEnvMock.mockReturnValue(sampleProxyEnv);
    restoreClaudeSettingsMock.mockReturnValue(true);
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

    it('should sync Claude settings when editing active provider with proxy disabled', async () => {
      getActiveProviderIdMock.mockReturnValue(sampleProvider.id);
      getEnableOpenpowersProxyMock.mockReturnValue(false);
      const updated = { ...sampleProvider, name: 'Updated' };
      updateProviderMock.mockReturnValue(updated);

      const res = await request(app)
        .put('/openpowers/api/providers/550e8400-e29b-41d4-a716-446655440000')
        .send({ name: 'Updated' });

      expect(res.status).toBe(200);
      expect(res.body).toEqual(updated);
      expect(getProviderEnvMock).toHaveBeenCalledWith(updated);
      expect(writeEnvToClaudeSettingsMock).toHaveBeenCalledWith(sampleProviderEnv);
    });

    it('should not sync Claude settings when editing active provider with proxy enabled', async () => {
      getActiveProviderIdMock.mockReturnValue(sampleProvider.id);
      getEnableOpenpowersProxyMock.mockReturnValue(true);
      const updated = { ...sampleProvider, name: 'Updated' };
      updateProviderMock.mockReturnValue(updated);

      const res = await request(app)
        .put('/openpowers/api/providers/550e8400-e29b-41d4-a716-446655440000')
        .send({ name: 'Updated' });

      expect(res.status).toBe(200);
      expect(res.body).toEqual(updated);
      expect(writeEnvToClaudeSettingsMock).not.toHaveBeenCalled();
    });

    it('should not sync Claude settings when editing an inactive provider', async () => {
      getActiveProviderIdMock.mockReturnValue('different-provider-id');
      getEnableOpenpowersProxyMock.mockReturnValue(false);
      const updated = { ...sampleProvider, name: 'Updated' };
      updateProviderMock.mockReturnValue(updated);

      const res = await request(app)
        .put('/openpowers/api/providers/550e8400-e29b-41d4-a716-446655440000')
        .send({ name: 'Updated' });

      expect(res.status).toBe(200);
      expect(res.body).toEqual(updated);
      expect(writeEnvToClaudeSettingsMock).not.toHaveBeenCalled();
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

    it('should restore Claude settings when deleting active provider with proxy disabled', async () => {
      const providerId = '550e8400-e29b-41d4-a716-446655440000';
      getActiveProviderIdMock.mockReturnValue(providerId);
      getEnableOpenpowersProxyMock.mockReturnValue(false);
      deleteProviderMock.mockReturnValue(true);

      const res = await request(app).delete(`/openpowers/api/providers/${providerId}`);

      expect(res.status).toBe(204);
      expect(restoreClaudeSettingsMock).toHaveBeenCalledOnce();
    });

    it('should not restore Claude settings when deleting active provider with proxy enabled', async () => {
      const providerId = '550e8400-e29b-41d4-a716-446655440000';
      getActiveProviderIdMock.mockReturnValue(providerId);
      getEnableOpenpowersProxyMock.mockReturnValue(true);
      deleteProviderMock.mockReturnValue(true);

      const res = await request(app).delete(`/openpowers/api/providers/${providerId}`);

      expect(res.status).toBe(204);
      expect(restoreClaudeSettingsMock).not.toHaveBeenCalled();
    });

    it('should not restore Claude settings when deleting an inactive provider', async () => {
      const providerId = '550e8400-e29b-41d4-a716-446655440000';
      getActiveProviderIdMock.mockReturnValue('different-provider-id');
      getEnableOpenpowersProxyMock.mockReturnValue(false);
      deleteProviderMock.mockReturnValue(true);

      const res = await request(app).delete(`/openpowers/api/providers/${providerId}`);

      expect(res.status).toBe(204);
      expect(restoreClaudeSettingsMock).not.toHaveBeenCalled();
    });

    it('should return 404 without side effects when deleting a non-existent provider', async () => {
      getActiveProviderIdMock.mockReturnValue('550e8400-e29b-41d4-a716-446655440000');
      getEnableOpenpowersProxyMock.mockReturnValue(false);
      deleteProviderMock.mockReturnValue(false);

      const res = await request(app).delete('/openpowers/api/providers/non-existent-id');

      expect(res.status).toBe(404);
      expect(res.body).toHaveProperty('error');
      expect(restoreClaudeSettingsMock).not.toHaveBeenCalled();
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

    it('should write provider env when proxy is off and neverClaudeSettings is true (first write)', async () => {
      setActiveProviderIdMock.mockReturnValue(undefined);
      getNeverClaudeSettingsMock.mockReturnValue(true);
      getEnableOpenpowersProxyMock.mockReturnValue(false);

      const res = await request(app)
        .put('/openpowers/api/providers/active')
        .send({ providerId: '550e8400-e29b-41d4-a716-446655440000' });

      expect(res.status).toBe(200);
      expect(backupClaudeSettingsMock).toHaveBeenCalledOnce();
      expect(setNeverClaudeSettingsMock).toHaveBeenCalledWith(false);
      expect(getProviderByIdMock).toHaveBeenCalledWith('550e8400-e29b-41d4-a716-446655440000');
      expect(getProviderEnvMock).toHaveBeenCalledWith(sampleProvider);
      expect(writeEnvToClaudeSettingsMock).toHaveBeenCalledWith(sampleProviderEnv);
    });

    it('should write provider env when proxy is off and neverClaudeSettings is false (subsequent write)', async () => {
      setActiveProviderIdMock.mockReturnValue(undefined);
      getNeverClaudeSettingsMock.mockReturnValue(false);
      getEnableOpenpowersProxyMock.mockReturnValue(false);

      const res = await request(app)
        .put('/openpowers/api/providers/active')
        .send({ providerId: '550e8400-e29b-41d4-a716-446655440000' });

      expect(res.status).toBe(200);
      expect(backupClaudeSettingsMock).not.toHaveBeenCalled();
      expect(setNeverClaudeSettingsMock).not.toHaveBeenCalled();
      expect(writeEnvToClaudeSettingsMock).toHaveBeenCalledWith(sampleProviderEnv);
    });

    it('should write proxy env when proxy is on', async () => {
      setActiveProviderIdMock.mockReturnValue(undefined);
      getNeverClaudeSettingsMock.mockReturnValue(false);
      getEnableOpenpowersProxyMock.mockReturnValue(true);

      const res = await request(app)
        .put('/openpowers/api/providers/active')
        .send({ providerId: '550e8400-e29b-41d4-a716-446655440000' });

      expect(res.status).toBe(200);
      expect(writeEnvToClaudeSettingsMock).toHaveBeenCalledWith(sampleProxyEnv);
    });

    it('should backup and write proxy env on first write when proxy is on', async () => {
      setActiveProviderIdMock.mockReturnValue(undefined);
      getNeverClaudeSettingsMock.mockReturnValue(true);
      getEnableOpenpowersProxyMock.mockReturnValue(true);

      const res = await request(app)
        .put('/openpowers/api/providers/active')
        .send({ providerId: '550e8400-e29b-41d4-a716-446655440000' });

      expect(res.status).toBe(200);
      expect(backupClaudeSettingsMock).toHaveBeenCalledOnce();
      expect(setNeverClaudeSettingsMock).toHaveBeenCalledWith(false);
      expect(writeEnvToClaudeSettingsMock).toHaveBeenCalledWith(sampleProxyEnv);
    });

    it('should return 500 when sync write fails (not 404)', async () => {
      setActiveProviderIdMock.mockReturnValue(undefined);
      getNeverClaudeSettingsMock.mockReturnValue(false);
      getEnableOpenpowersProxyMock.mockReturnValue(false);
      writeEnvToClaudeSettingsMock.mockImplementationOnce(() => {
        throw new Error('Disk write failed');
      });

      const res = await request(app)
        .put('/openpowers/api/providers/active')
        .send({ providerId: '550e8400-e29b-41d4-a716-446655440000' });

      expect(res.status).toBe(500);
      expect(res.body).toEqual({ error: 'Failed to sync Claude settings' });
    });
  });

  // ---- PUT /openpowers/api/providers/proxy ----

  describe('PUT /openpowers/api/providers/proxy', () => {
    it('should enable proxy, backup on first write, and write proxy env', async () => {
      getNeverClaudeSettingsMock.mockReturnValue(true);

      const res = await request(app)
        .put('/openpowers/api/providers/proxy')
        .send({ enableOpenpowersProxy: true });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ enableOpenpowersProxy: true });
      expect(setEnableOpenpowersProxyMock).toHaveBeenCalledWith(true);
      expect(backupClaudeSettingsMock).toHaveBeenCalledOnce();
      expect(setNeverClaudeSettingsMock).toHaveBeenCalledWith(false);
      expect(writeEnvToClaudeSettingsMock).toHaveBeenCalledWith(sampleProxyEnv);
    });

    it('should enable proxy without backup when neverClaudeSettings is false', async () => {
      getNeverClaudeSettingsMock.mockReturnValue(false);

      const res = await request(app)
        .put('/openpowers/api/providers/proxy')
        .send({ enableOpenpowersProxy: true });

      expect(res.status).toBe(200);
      expect(setEnableOpenpowersProxyMock).toHaveBeenCalledWith(true);
      expect(backupClaudeSettingsMock).not.toHaveBeenCalled();
      expect(setNeverClaudeSettingsMock).not.toHaveBeenCalled();
      expect(writeEnvToClaudeSettingsMock).toHaveBeenCalledWith(sampleProxyEnv);
    });

    it('should disable proxy and write provider env when active provider exists', async () => {
      getActiveProviderMock.mockReturnValue(sampleProvider);

      const res = await request(app)
        .put('/openpowers/api/providers/proxy')
        .send({ enableOpenpowersProxy: false });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ enableOpenpowersProxy: false });
      expect(setEnableOpenpowersProxyMock).toHaveBeenCalledWith(false);
      expect(getActiveProviderMock).toHaveBeenCalled();
      expect(getProviderEnvMock).toHaveBeenCalledWith(sampleProvider);
      expect(writeEnvToClaudeSettingsMock).toHaveBeenCalledWith(sampleProviderEnv);
    });

    it('should disable proxy and restore backup when no active provider exists', async () => {
      getActiveProviderMock.mockReturnValue(null);
      restoreClaudeSettingsMock.mockReturnValue(true);

      const res = await request(app)
        .put('/openpowers/api/providers/proxy')
        .send({ enableOpenpowersProxy: false });

      expect(res.status).toBe(200);
      expect(setEnableOpenpowersProxyMock).toHaveBeenCalledWith(false);
      expect(restoreClaudeSettingsMock).toHaveBeenCalledOnce();
      expect(writeEnvToClaudeSettingsMock).not.toHaveBeenCalled();
    });

    it('should return 400 when enableOpenpowersProxy is missing', async () => {
      const res = await request(app)
        .put('/openpowers/api/providers/proxy')
        .send({});

      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('error');
    });

    it('should return 500 when sync write fails', async () => {
      getNeverClaudeSettingsMock.mockReturnValue(false);
      writeEnvToClaudeSettingsMock.mockImplementationOnce(() => {
        throw new Error('Disk write failed');
      });

      const res = await request(app)
        .put('/openpowers/api/providers/proxy')
        .send({ enableOpenpowersProxy: true });

      expect(res.status).toBe(500);
      expect(res.body).toEqual({ error: 'Failed to update proxy settings' });
    });
  });

  // ---- POST /openpowers/api/providers/reset ----

  describe('POST /openpowers/api/providers/reset', () => {
    it('should restore backup and clear active provider', async () => {
      restoreClaudeSettingsMock.mockReturnValue(true);

      const res = await request(app).post('/openpowers/api/providers/reset');

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ activeProviderId: null });
      expect(restoreClaudeSettingsMock).toHaveBeenCalledOnce();
      expect(clearActiveProviderIdMock).toHaveBeenCalledOnce();
    });

    it('should clear active provider even when backup is missing', async () => {
      restoreClaudeSettingsMock.mockReturnValue(false);

      const res = await request(app).post('/openpowers/api/providers/reset');

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ activeProviderId: null });
      expect(restoreClaudeSettingsMock).toHaveBeenCalledOnce();
      expect(clearActiveProviderIdMock).toHaveBeenCalledOnce();
    });

    it('should still call clearActiveProviderId when restoreClaudeSettings throws', async () => {
      restoreClaudeSettingsMock.mockImplementationOnce(() => {
        throw new Error('Disk read failed');
      });

      const res = await request(app).post('/openpowers/api/providers/reset');

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ activeProviderId: null });
      expect(restoreClaudeSettingsMock).toHaveBeenCalledOnce();
      expect(clearActiveProviderIdMock).toHaveBeenCalledOnce();
    });

    it('should return 500 when clearActiveProviderId throws', async () => {
      restoreClaudeSettingsMock.mockReturnValue(true);
      clearActiveProviderIdMock.mockImplementationOnce(() => {
        throw new Error('Config write failed');
      });

      const res = await request(app).post('/openpowers/api/providers/reset');

      expect(res.status).toBe(500);
      expect(res.body).toEqual({ error: 'Failed to clear active provider' });
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

  // ---- DELETE /openpowers/api/providers/templates/:name ----

  describe('DELETE /openpowers/api/providers/templates/:name', () => {
    it('should delete custom template and return 200 with success message', async () => {
      deleteProviderTemplateMock.mockReturnValue(true);

      const res = await request(app).delete('/openpowers/api/providers/templates/MyTemplate');

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('message');
      expect(res.body.message).toMatch(/deleted/i);
      expect(deleteProviderTemplateMock).toHaveBeenCalledWith('MyTemplate');
    });

    it('should return 403 when attempting to delete a builtin template', async () => {
      deleteProviderTemplateMock.mockImplementation(() => {
        throw new Error('Cannot delete builtin template: "BuiltinTemplate"');
      });

      const res = await request(app).delete('/openpowers/api/providers/templates/BuiltinTemplate');

      expect(res.status).toBe(403);
      expect(res.body).toHaveProperty('error');
      expect(res.body.error).toMatch(/cannot delete builtin/i);
    });

    it('should return 404 when template name does not exist', async () => {
      deleteProviderTemplateMock.mockReturnValue(false);

      const res = await request(app).delete('/openpowers/api/providers/templates/NonExistent');

      expect(res.status).toBe(404);
      expect(res.body).toHaveProperty('error');
      expect(res.body.error).toMatch(/not found/i);
    });
  });

  // ---- POST /openpowers/api/providers/validate ----

  describe('POST /openpowers/api/providers/validate', () => {
    it('should return 200 with valid:true and models when upstream returns 200', async () => {
      axiosMock.mockResolvedValue({
        status: 200,
        data: { data: [{ id: 'model-1' }, { id: 'model-2' }] },
        headers: { 'content-type': 'application/json' },
      });

      const res = await request(app)
        .post('/openpowers/api/providers/validate')
        .send({ baseUrl: 'https://api.anthropic.com', apiKey: 'sk-ant-valid' });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        valid: true,
        models: [{ id: 'model-1' }, { id: 'model-2' }],
      });
      expect(axiosMock).toHaveBeenCalledWith(expect.objectContaining({
        method: 'POST',
        timeout: 5000,
      }));
    });

    it('should return 200 with valid:true when upstream returns 400 (bad request but valid key)', async () => {
      axiosMock.mockResolvedValue({
        status: 400,
        data: { error: { type: 'invalid_request_error', message: 'missing required field' } },
        headers: {},
      });

      const res = await request(app)
        .post('/openpowers/api/providers/validate')
        .send({ baseUrl: 'https://api.deepseek.com/anthropic', apiKey: 'sk-deepseek-valid' });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        valid: true,
        models: [],
      });
    });

    it('should return 200 with valid:false when upstream resolves with 401', async () => {
      axiosMock.mockResolvedValue({
        status: 401,
        data: { error: 'Invalid API key' },
        headers: {},
      });

      const res = await request(app)
        .post('/openpowers/api/providers/validate')
        .send({ baseUrl: 'https://api.anthropic.com', apiKey: 'sk-ant-invalid' });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        valid: false,
        error: 'Authentication failed: invalid API key',
        upstreamError: JSON.stringify({ error: 'Invalid API key' }),
      });
    });

    it('should return 200 with valid:false when upstream resolves with 403', async () => {
      // 403 with Anthropic auth error format → valid:false
      axiosMock.mockResolvedValue({
        status: 403,
        data: { type: 'error', error: { type: 'authentication_error' } },
        headers: {},
      });

      const res = await request(app)
        .post('/openpowers/api/providers/validate')
        .send({ baseUrl: 'https://api.anthropic.com', apiKey: 'sk-ant-forbidden' });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        valid: false,
        error: 'Authentication failed: invalid API key',
        upstreamError: JSON.stringify({ type: 'error', error: { type: 'authentication_error' } }),
      });
    });

    it('should return 200 with valid:false when upstream resolves with 500', async () => {
      axiosMock.mockResolvedValue({
        status: 500,
        data: { error: 'Internal server error' },
        headers: {},
      });

      const res = await request(app)
        .post('/openpowers/api/providers/validate')
        .send({ baseUrl: 'https://api.example.com', apiKey: 'sk-ant-test' });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        valid: false,
        error: 'Validation failed: upstream returned 500',
        upstreamError: JSON.stringify({ error: 'Internal server error' }),
      });
    });

    it('should return 200 with valid:false on connection error', async () => {
      const error = new Error('Connection refused');
      (error as NodeJS.ErrnoException).code = 'ECONNREFUSED';
      axiosMock.mockRejectedValue(error);

      const res = await request(app)
        .post('/openpowers/api/providers/validate')
        .send({ baseUrl: 'https://api.example.com', apiKey: 'sk-ant-test' });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        valid: false,
        error: 'Validation failed: Connection refused',
      });
    });

    it('should return 200 with valid:false on timeout', async () => {
      const error = new Error('timeout of 5000ms exceeded');
      (error as NodeJS.ErrnoException).code = 'ETIMEDOUT';
      axiosMock.mockRejectedValue(error);

      const res = await request(app)
        .post('/openpowers/api/providers/validate')
        .send({ baseUrl: 'https://api.example.com', apiKey: 'sk-ant-test' });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        valid: false,
        error: 'Validation timeout: upstream did not respond within 5s',
      });
    });

    it('should return 200 with valid:false on timeout with ECONNABORTED code', async () => {
      const error = new Error('timeout of 5000ms exceeded');
      (error as NodeJS.ErrnoException).code = 'ECONNABORTED';
      axiosMock.mockRejectedValue(error);

      const res = await request(app)
        .post('/openpowers/api/providers/validate')
        .send({ baseUrl: 'https://api.example.com', apiKey: 'sk-ant-test' });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        valid: false,
        error: 'Validation timeout: upstream did not respond within 5s',
      });
    });

    it('should return 400 when baseUrl is missing', async () => {
      const res = await request(app)
        .post('/openpowers/api/providers/validate')
        .send({ apiKey: 'sk-ant-test' });

      expect(res.status).toBe(400);
      expect(res.body).toEqual({
        error: 'Missing required fields: baseUrl, apiKey',
      });
      expect(axiosMock).not.toHaveBeenCalled();
    });

    it('should return 400 when apiKey is missing', async () => {
      const res = await request(app)
        .post('/openpowers/api/providers/validate')
        .send({ baseUrl: 'https://api.anthropic.com' });

      expect(res.status).toBe(400);
      expect(res.body).toEqual({
        error: 'Missing required fields: baseUrl, apiKey',
      });
      expect(axiosMock).not.toHaveBeenCalled();
    });

    it('should return 413 when request body exceeds 1kb', async () => {
      const largeString = 'x'.repeat(1024);
      const res = await request(app)
        .post('/openpowers/api/providers/validate')
        .send({ baseUrl: 'https://api.example.com', apiKey: largeString });

      expect(res.status).toBe(413);
      expect(res.body).toEqual({
        error: 'Request body too large',
      });
      expect(axiosMock).not.toHaveBeenCalled();
    });

    it('should return 400 when body is empty', async () => {
      const res = await request(app)
        .post('/openpowers/api/providers/validate')
        .send({});

      expect(res.status).toBe(400);
      expect(res.body).toEqual({
        error: 'Missing required fields: baseUrl, apiKey',
      });
      expect(axiosMock).not.toHaveBeenCalled();
    });
  });
});
