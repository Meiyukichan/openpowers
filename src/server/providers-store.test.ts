/**
 * @fileoverview Tests for providers-store (JSON file store and zod validation)
 * @author Meiyuki <meiyukichan@163.com>
 * @copyright 2026 Meiyuki
 */

import path from 'path';
import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';

// ---- mocks for providers-store file I/O ----

const {
  readFileSyncMock,
  writeFileSyncMock,
  existsSyncMock,
  mkdirSyncMock,
} = vi.hoisted(() => ({
  readFileSyncMock: vi.fn(),
  writeFileSyncMock: vi.fn(),
  existsSyncMock: vi.fn(),
  mkdirSyncMock: vi.fn(),
}));

vi.mock('fs', () => ({
  default: {
    readFileSync: readFileSyncMock,
    writeFileSync: writeFileSyncMock,
    existsSync: existsSyncMock,
    mkdirSync: mkdirSyncMock,
  },
}));

const { homedirMock } = vi.hoisted(() => ({
  homedirMock: vi.fn(() => '/mock/home'),
}));

vi.mock('os', () => ({
  default: {
    homedir: homedirMock,
  },
}));

const { randomUUIDMock } = vi.hoisted(() => ({
  randomUUIDMock: vi.fn(() => '550e8400-e29b-41d4-a716-446655440000'),
}));

vi.mock('crypto', () => ({
  default: {
    randomUUID: randomUUIDMock,
  },
}));

const { loggerMock } = vi.hoisted(() => ({
  loggerMock: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock('../utils/logger.js', () => ({
  logger: loggerMock,
}));

// ---- dynamic imports ----

type StoreModule = typeof import('./providers-store.js');

let mod: StoreModule;

beforeAll(async () => {
  mod = await import('./providers-store.js');
});

// ---- constants ----

const PROVIDERS_FILE = path.join('/mock/home', '.openpowers', 'providers.json');

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

const sampleProviderList = [sampleProvider];

/** Builds a combined store JSON string: { activeProviderId, providers }. */
function combinedStore(providers: typeof sampleProviderList, activeProviderId: string | null = null): string {
  return JSON.stringify({ activeProviderId, providers });
}

beforeEach(() => {
  vi.clearAllMocks();
  existsSyncMock.mockReturnValue(false);
});

// ---- test suites ----

describe('ensureProvidersFile', () => {
  it('should create providers.json with sample data when file does not exist', () => {
    existsSyncMock.mockReturnValue(false);

    mod.ensureProvidersFile();

    expect(mkdirSyncMock).toHaveBeenCalledWith(path.join('/mock/home', '.openpowers'), { recursive: true });
    expect(writeFileSyncMock).toHaveBeenCalledTimes(1);
    const [filePath, content] = writeFileSyncMock.mock.calls[0];
    expect(filePath).toBe(PROVIDERS_FILE);
    const parsed = JSON.parse(content);
    expect(parsed).toHaveProperty('activeProviderId');
    expect(parsed).toHaveProperty('providers');
    expect(Array.isArray(parsed.providers)).toBe(true);
    expect(parsed.providers.length).toBeGreaterThan(0);
    // Sample data should have required fields
    for (const provider of parsed.providers) {
      expect(provider).toHaveProperty('id');
      expect(provider).toHaveProperty('name');
      expect(provider).toHaveProperty('createdAt');
      expect(provider).toHaveProperty('defaultModel');
      expect(provider).toHaveProperty('sonnetModel');
      expect(provider).toHaveProperty('opusModel');
      expect(provider).toHaveProperty('haikuModel');
    }
  });

  it('should not overwrite existing providers.json', () => {
    existsSyncMock.mockReturnValue(true);

    mod.ensureProvidersFile();

    expect(writeFileSyncMock).not.toHaveBeenCalled();
  });
});

describe('loadProviders', () => {
  it('should return empty array when file has empty providers', () => {
    existsSyncMock.mockReturnValue(true);
    readFileSyncMock.mockReturnValue(combinedStore([]));

    const result = mod.loadProviders();

    expect(result).toEqual([]);
  });

  it('should return parsed provider array from combined store file', () => {
    existsSyncMock.mockReturnValue(true);
    readFileSyncMock.mockReturnValue(combinedStore(sampleProviderList));

    const result = mod.loadProviders();

    expect(result).toEqual(sampleProviderList);
  });

  it('should ensure file exists before reading', () => {
    mod.loadProviders();

    expect(existsSyncMock).toHaveBeenCalled();
  });
});

describe('saveProviders', () => {
  it('should write combined store JSON with indent=2', () => {
    existsSyncMock.mockReturnValue(true);
    readFileSyncMock.mockReturnValue(combinedStore([], null));

    mod.saveProviders(sampleProviderList);

    expect(writeFileSyncMock).toHaveBeenCalledTimes(1);
    const [filePath, content] = writeFileSyncMock.mock.calls[0];
    expect(filePath).toBe(PROVIDERS_FILE);
    const parsed = JSON.parse(content);
    expect(parsed).toHaveProperty('activeProviderId');
    expect(parsed.providers).toEqual(sampleProviderList);
    // Verify indent=2 formatting
    expect(content).toContain('\n');
  });

  it('should preserve activeProviderId when saving providers', () => {
    existsSyncMock.mockReturnValue(true);
    readFileSyncMock.mockReturnValue(combinedStore([], 'preserved-active-id'));

    mod.saveProviders(sampleProviderList);

    const [, content] = writeFileSyncMock.mock.calls[0];
    const parsed = JSON.parse(content);
    expect(parsed.activeProviderId).toBe('preserved-active-id');
    expect(parsed.providers).toEqual(sampleProviderList);
  });
});

describe('createProvider', () => {
  it('should create provider with generated UUID and createdAt', () => {
    existsSyncMock.mockReturnValue(true);
    readFileSyncMock.mockReturnValue(combinedStore([]));
    randomUUIDMock.mockReturnValue('test-uuid-123');

    const input = {
      name: 'New Provider',
      apiKey: 'sk-new',
      defaultModel: 'default-model',
      sonnetModel: 'sonnet-model',
      opusModel: 'opus-model',
      haikuModel: 'haiku-model',
    };
    const result = mod.createProvider(input);

    expect(result.id).toBe('test-uuid-123');
    expect(result.name).toBe('New Provider');
    expect(result.apiKey).toBe('sk-new');
    expect(result.defaultModel).toBe('default-model');
    expect(result.sonnetModel).toBe('sonnet-model');
    expect(result.opusModel).toBe('opus-model');
    expect(result.haikuModel).toBe('haiku-model');
    expect(result.createdAt).toBeDefined();
    // Verify saved to file in combined format
    expect(writeFileSyncMock).toHaveBeenCalledTimes(1);
    const [, content] = writeFileSyncMock.mock.calls[0];
    const saved = JSON.parse(content);
    expect(saved.providers).toHaveLength(1);
    expect(saved.providers[0].id).toBe('test-uuid-123');
  });

  it('should accept optional fields in provider input', () => {
    existsSyncMock.mockReturnValue(true);
    readFileSyncMock.mockReturnValue(combinedStore([]));
    randomUUIDMock.mockReturnValue('test-uuid-456');

    const input = {
      name: 'Full Provider',
      apiKey: 'sk-full',
      notes: 'Test notes',
      websiteUrl: 'https://example.com',
      baseUrl: 'https://api.example.com',
      icon: 'globe',
      iconColor: '#ff0000',
      defaultModel: 'dm',
      sonnetModel: 'sm',
      opusModel: 'om',
      haikuModel: 'hm',
    };
    const result = mod.createProvider(input);

    expect(result.notes).toBe('Test notes');
    expect(result.websiteUrl).toBe('https://example.com');
    expect(result.baseUrl).toBe('https://api.example.com');
    expect(result.icon).toBe('globe');
    expect(result.iconColor).toBe('#ff0000');
    expect(result.defaultModel).toBe('dm');
    expect(result.sonnetModel).toBe('sm');
    expect(result.opusModel).toBe('om');
    expect(result.haikuModel).toBe('hm');
  });
});

describe('getProviderById', () => {
  it('should return provider when ID exists', () => {
    existsSyncMock.mockReturnValue(true);
    readFileSyncMock.mockReturnValue(combinedStore(sampleProviderList));

    const result = mod.getProviderById('550e8400-e29b-41d4-a716-446655440000');

    expect(result).toEqual(sampleProvider);
  });

  it('should return undefined when ID does not exist', () => {
    existsSyncMock.mockReturnValue(true);
    readFileSyncMock.mockReturnValue(combinedStore(sampleProviderList));

    const result = mod.getProviderById('non-existent-id');

    expect(result).toBeUndefined();
  });
});

describe('updateProvider', () => {
  it('should update provider fields and save to combined store file', () => {
    existsSyncMock.mockReturnValue(true);
    readFileSyncMock.mockReturnValue(combinedStore(sampleProviderList));

    const update = { name: 'Updated Name', apiKey: 'sk-updated' };
    const result = mod.updateProvider('550e8400-e29b-41d4-a716-446655440000', update);

    expect(result.name).toBe('Updated Name');
    expect(result.apiKey).toBe('sk-updated');
    // Unchanged fields should remain
    expect(result.id).toBe('550e8400-e29b-41d4-a716-446655440000');
    // updatedAt should be set
    expect(result.updatedAt).toBeDefined();
    // Should save to file
    expect(writeFileSyncMock).toHaveBeenCalledTimes(1);
  });

  it('should throw error when provider ID does not exist', () => {
    existsSyncMock.mockReturnValue(true);
    readFileSyncMock.mockReturnValue(combinedStore(sampleProviderList));

    expect(() => mod.updateProvider('non-existent', { name: 'X' })).toThrow('not found');
  });
});

describe('deleteProvider', () => {
  it('should remove provider and return true', () => {
    existsSyncMock.mockReturnValue(true);
    readFileSyncMock.mockReturnValue(combinedStore(sampleProviderList));

    const result = mod.deleteProvider('550e8400-e29b-41d4-a716-446655440000');

    expect(result).toBe(true);
    expect(writeFileSyncMock).toHaveBeenCalledTimes(1);
    const [, content] = writeFileSyncMock.mock.calls[0];
    const saved = JSON.parse(content);
    expect(saved.providers).toHaveLength(0);
  });

  it('should return false when provider ID does not exist', () => {
    existsSyncMock.mockReturnValue(true);
    readFileSyncMock.mockReturnValue(combinedStore(sampleProviderList));

    const result = mod.deleteProvider('non-existent');

    expect(result).toBe(false);
    expect(writeFileSyncMock).not.toHaveBeenCalled();
  });
});

describe('ProviderInputSchema', () => {
  it('should accept valid provider input', () => {
    const result = mod.ProviderInputSchema.safeParse({
      name: 'Test',
      apiKey: 'sk-test',
      defaultModel: 'dm',
      sonnetModel: 'sm',
      opusModel: 'om',
      haikuModel: 'hm',
    });

    expect(result.success).toBe(true);
  });

  it('should reject data without name', () => {
    const result = mod.ProviderInputSchema.safeParse({
      apiKey: 'sk-test',
      defaultModel: 'dm',
      sonnetModel: 'sm',
      opusModel: 'om',
      haikuModel: 'hm',
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path.join('.'));
      expect(paths).toContain('name');
    }
  });

  it('should reject data without apiKey', () => {
    const result = mod.ProviderInputSchema.safeParse({
      name: 'Test',
      defaultModel: 'dm',
      sonnetModel: 'sm',
      opusModel: 'om',
      haikuModel: 'hm',
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path.join('.'));
      expect(paths).toContain('apiKey');
    }
  });

  it('should reject data without model fields', () => {
    const result = mod.ProviderInputSchema.safeParse({
      name: 'Test',
      apiKey: 'sk-test',
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path.join('.'));
      expect(paths).toContain('defaultModel');
      expect(paths).toContain('sonnetModel');
      expect(paths).toContain('opusModel');
      expect(paths).toContain('haikuModel');
    }
  });

  it('should accept input with all optional fields', () => {
    const result = mod.ProviderInputSchema.safeParse({
      name: 'Test',
      apiKey: 'sk-test',
      defaultModel: 'dm',
      sonnetModel: 'sm',
      opusModel: 'om',
      haikuModel: 'hm',
      notes: 'some notes',
      websiteUrl: 'https://example.com',
      baseUrl: 'https://api.example.com',
      icon: 'globe',
      iconColor: '#ff0000',
    });

    expect(result.success).toBe(true);
  });
});

describe('ProviderUpdateSchema', () => {
  it('should accept partial update with single field', () => {
    const result = mod.ProviderUpdateSchema.safeParse({
      name: 'Updated Name',
    });

    expect(result.success).toBe(true);
  });

  it('should accept empty object', () => {
    const result = mod.ProviderUpdateSchema.safeParse({});

    expect(result.success).toBe(true);
  });

  it('should accept partial update with model field', () => {
    const result = mod.ProviderUpdateSchema.safeParse({
      defaultModel: 'new-default-model',
    });

    expect(result.success).toBe(true);
  });

  it('should reject invalid field types', () => {
    const result = mod.ProviderUpdateSchema.safeParse({
      name: 123,
    });

    expect(result.success).toBe(false);
  });
});

describe('ProviderSchema', () => {
  it('should validate a full provider object', () => {
    const result = mod.ProviderSchema.safeParse(sampleProvider);

    expect(result.success).toBe(true);
  });

  it('should reject provider missing required id', () => {
    const result = mod.ProviderSchema.safeParse({
      name: 'Test',
      createdAt: '2026-01-01T00:00:00.000Z',
    });

    expect(result.success).toBe(false);
  });

  it('should default model fields to empty string when missing (backward compatibility)', () => {
    const result = mod.ProviderSchema.safeParse({
      id: 'test-id',
      name: 'Old Provider',
      createdAt: '2026-01-01T00:00:00.000Z',
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.defaultModel).toBe('');
      expect(result.data.sonnetModel).toBe('');
      expect(result.data.opusModel).toBe('');
      expect(result.data.haikuModel).toBe('');
    }
  });
});

// ---- Active Provider Tests ----

describe('getActiveProviderId', () => {
  it('should return null when providers.json does not exist', () => {
    existsSyncMock.mockReturnValue(false);

    const result = mod.getActiveProviderId();

    expect(result).toBeNull();
  });

  it('should return null when combined store has null activeProviderId', () => {
    existsSyncMock.mockReturnValue(true);
    readFileSyncMock.mockReturnValue(combinedStore(sampleProviderList, null));

    const result = mod.getActiveProviderId();

    expect(result).toBeNull();
  });

  it('should return provider ID when combined store contains a valid ID', () => {
    existsSyncMock.mockReturnValue(true);
    readFileSyncMock.mockReturnValue(combinedStore(sampleProviderList, '550e8400-e29b-41d4-a716-446655440000'));

    const result = mod.getActiveProviderId();

    expect(result).toBe('550e8400-e29b-41d4-a716-446655440000');
  });

  it('should return null when combined store has invalid JSON', () => {
    existsSyncMock.mockReturnValue(true);
    readFileSyncMock.mockReturnValue('invalid-json');

    const result = mod.getActiveProviderId();

    expect(result).toBeNull();
  });
});

describe('setActiveProviderId', () => {
  it('should write provider ID to combined store file with indent=2', () => {
    existsSyncMock.mockReturnValue(true);
    readFileSyncMock.mockReturnValue(combinedStore(sampleProviderList));

    mod.setActiveProviderId('550e8400-e29b-41d4-a716-446655440000');

    expect(writeFileSyncMock).toHaveBeenCalledTimes(1);
    const [filePath, content] = writeFileSyncMock.mock.calls[0];
    expect(filePath).toBe(PROVIDERS_FILE);
    const parsed = JSON.parse(content);
    expect(parsed.activeProviderId).toBe('550e8400-e29b-41d4-a716-446655440000');
    expect(parsed.providers).toEqual(sampleProviderList);
    // Verify indent=2 formatting
    expect(content).toContain('\n');
  });

  it('should throw error when provider ID does not exist in providers list', () => {
    existsSyncMock.mockReturnValue(true);
    readFileSyncMock.mockReturnValue(combinedStore(sampleProviderList));

    expect(() => mod.setActiveProviderId('non-existent-id')).toThrow('not found');
  });
});

describe('clearActiveProviderId', () => {
  it('should write null activeProviderId to combined store file', () => {
    existsSyncMock.mockReturnValue(false);

    mod.clearActiveProviderId();

    expect(writeFileSyncMock).toHaveBeenCalledTimes(1);
    const [filePath, content] = writeFileSyncMock.mock.calls[0];
    expect(filePath).toBe(PROVIDERS_FILE);
    const parsed = JSON.parse(content);
    expect(parsed.activeProviderId).toBeNull();
    // Verify indent=2 formatting
    expect(content).toContain('\n');
  });
});

describe('deleteProvider cascade', () => {
  it('should clear active provider when deleting the active provider', () => {
    existsSyncMock.mockReturnValue(true);
    readFileSyncMock.mockReturnValue(
      combinedStore(sampleProviderList, '550e8400-e29b-41d4-a716-446655440000'),
    );

    const result = mod.deleteProvider('550e8400-e29b-41d4-a716-446655440000');

    expect(result).toBe(true);
    // Should write once to the combined store with activeProviderId cleared
    expect(writeFileSyncMock).toHaveBeenCalledTimes(1);
    const [, content] = writeFileSyncMock.mock.calls[0];
    const parsed = JSON.parse(content);
    expect(parsed.activeProviderId).toBeNull();
    expect(parsed.providers).toHaveLength(0);
  });

  it('should not clear active provider when deleting a non-active provider', () => {
    existsSyncMock.mockReturnValue(true);
    const otherProvider = {
      ...sampleProvider,
      id: 'other-id',
    };
    readFileSyncMock.mockReturnValue(
      combinedStore([sampleProvider, otherProvider], '550e8400-e29b-41d4-a716-446655440000'),
    );

    const result = mod.deleteProvider('other-id');

    expect(result).toBe(true);
    // Should write once with activeProviderId preserved
    expect(writeFileSyncMock).toHaveBeenCalledTimes(1);
    const [, content] = writeFileSyncMock.mock.calls[0];
    const parsed = JSON.parse(content);
    expect(parsed.activeProviderId).toBe('550e8400-e29b-41d4-a716-446655440000');
    expect(parsed.providers).toHaveLength(1);
  });

  it('should not attempt to clear active when no active provider is set', () => {
    existsSyncMock.mockReturnValue(true);
    readFileSyncMock.mockReturnValue(combinedStore(sampleProviderList, null));

    const result = mod.deleteProvider('550e8400-e29b-41d4-a716-446655440000');

    expect(result).toBe(true);
    // Should write once
    expect(writeFileSyncMock).toHaveBeenCalledTimes(1);
    const [, content] = writeFileSyncMock.mock.calls[0];
    const parsed = JSON.parse(content);
    expect(parsed.activeProviderId).toBeNull();
    expect(parsed.providers).toHaveLength(0);
  });
});
