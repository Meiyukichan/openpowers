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

beforeEach(() => {
  vi.clearAllMocks();
  existsSyncMock.mockReturnValue(false);
  readFileSyncMock.mockReturnValue(JSON.stringify([]));
});

// ---- helpers ----

const sampleProvider = {
  id: '550e8400-e29b-41d4-a716-446655440000',
  name: 'Test Provider',
  apiKey: 'sk-test-key',
  enabled: true,
  createdAt: '2026-01-01T00:00:00.000Z',
};

const sampleProviderList = [sampleProvider];

// ---- test suites ----

describe('ensureProvidersFile', () => {
  it('should create providers.json with sample data when file does not exist', () => {
    existsSyncMock.mockReturnValue(false);

    mod.ensureProvidersFile();

    expect(mkdirSyncMock).toHaveBeenCalledWith(path.join('/mock/home', '.openpowers'), { recursive: true });
    expect(writeFileSyncMock).toHaveBeenCalledTimes(1);
    const [filePath, content] = writeFileSyncMock.mock.calls[0];
    expect(filePath).toBe(path.join('/mock/home', '.openpowers', 'providers.json'));
    const parsed = JSON.parse(content);
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed.length).toBeGreaterThan(0);
    // Sample data should have required fields
    for (const provider of parsed) {
      expect(provider).toHaveProperty('id');
      expect(provider).toHaveProperty('name');
      expect(provider).toHaveProperty('enabled');
      expect(provider).toHaveProperty('createdAt');
    }
  });

  it('should not overwrite existing providers.json', () => {
    existsSyncMock.mockReturnValue(true);

    mod.ensureProvidersFile();

    expect(writeFileSyncMock).not.toHaveBeenCalled();
  });
});

describe('loadProviders', () => {
  it('should return empty array when file is empty or has empty array', () => {
    existsSyncMock.mockReturnValue(true);
    readFileSyncMock.mockReturnValue(JSON.stringify([]));

    const result = mod.loadProviders();

    expect(result).toEqual([]);
  });

  it('should return parsed provider array from file', () => {
    existsSyncMock.mockReturnValue(true);
    readFileSyncMock.mockReturnValue(JSON.stringify(sampleProviderList));

    const result = mod.loadProviders();

    expect(result).toEqual(sampleProviderList);
  });

  it('should ensure file exists before reading', () => {
    mod.loadProviders();

    expect(existsSyncMock).toHaveBeenCalled();
  });
});

describe('saveProviders', () => {
  it('should write formatted JSON with indent=2', () => {
    mod.saveProviders(sampleProviderList);

    expect(writeFileSyncMock).toHaveBeenCalledTimes(1);
    const [filePath, content] = writeFileSyncMock.mock.calls[0];
    expect(filePath).toBe(path.join('/mock/home', '.openpowers', 'providers.json'));
    // Verify indent=2 formatting
    const parsed = JSON.parse(content);
    expect(parsed).toEqual(sampleProviderList);
    // Check the raw string has line breaks (formatting)
    expect(content).toContain('\n');
  });
});

describe('createProvider', () => {
  it('should create provider with generated UUID, enabled=true, and createdAt', () => {
    existsSyncMock.mockReturnValue(true);
    readFileSyncMock.mockReturnValue(JSON.stringify([]));
    randomUUIDMock.mockReturnValue('test-uuid-123');

    const input = { name: 'New Provider', apiKey: 'sk-new' };
    const result = mod.createProvider(input);

    expect(result.id).toBe('test-uuid-123');
    expect(result.name).toBe('New Provider');
    expect(result.apiKey).toBe('sk-new');
    expect(result.enabled).toBe(true);
    expect(result.createdAt).toBeDefined();
    // Verify saved to file
    expect(writeFileSyncMock).toHaveBeenCalledTimes(1);
    const [, content] = writeFileSyncMock.mock.calls[0];
    const saved = JSON.parse(content);
    expect(saved).toHaveLength(1);
    expect(saved[0].id).toBe('test-uuid-123');
  });

  it('should accept optional fields in provider input', () => {
    existsSyncMock.mockReturnValue(true);
    readFileSyncMock.mockReturnValue(JSON.stringify([]));
    randomUUIDMock.mockReturnValue('test-uuid-456');

    const input = {
      name: 'Full Provider',
      apiKey: 'sk-full',
      notes: 'Test notes',
      websiteUrl: 'https://example.com',
      baseUrl: 'https://api.example.com',
      icon: 'globe',
      iconColor: '#ff0000',
    };
    const result = mod.createProvider(input);

    expect(result.notes).toBe('Test notes');
    expect(result.websiteUrl).toBe('https://example.com');
    expect(result.baseUrl).toBe('https://api.example.com');
    expect(result.icon).toBe('globe');
    expect(result.iconColor).toBe('#ff0000');
  });
});

describe('getProviderById', () => {
  it('should return provider when ID exists', () => {
    existsSyncMock.mockReturnValue(true);
    readFileSyncMock.mockReturnValue(JSON.stringify(sampleProviderList));

    const result = mod.getProviderById('550e8400-e29b-41d4-a716-446655440000');

    expect(result).toEqual(sampleProvider);
  });

  it('should return undefined when ID does not exist', () => {
    existsSyncMock.mockReturnValue(true);
    readFileSyncMock.mockReturnValue(JSON.stringify(sampleProviderList));

    const result = mod.getProviderById('non-existent-id');

    expect(result).toBeUndefined();
  });
});

describe('updateProvider', () => {
  it('should update provider fields and save to file', () => {
    existsSyncMock.mockReturnValue(true);
    readFileSyncMock.mockReturnValue(JSON.stringify(sampleProviderList));

    const update = { name: 'Updated Name', apiKey: 'sk-updated' };
    const result = mod.updateProvider('550e8400-e29b-41d4-a716-446655440000', update);

    expect(result.name).toBe('Updated Name');
    expect(result.apiKey).toBe('sk-updated');
    // Unchanged fields should remain
    expect(result.id).toBe('550e8400-e29b-41d4-a716-446655440000');
    expect(result.enabled).toBe(true);
    // Should save to file
    expect(writeFileSyncMock).toHaveBeenCalledTimes(1);
  });

  it('should throw error when provider ID does not exist', () => {
    existsSyncMock.mockReturnValue(true);
    readFileSyncMock.mockReturnValue(JSON.stringify(sampleProviderList));

    expect(() => mod.updateProvider('non-existent', { name: 'X' })).toThrow('not found');
  });
});

describe('deleteProvider', () => {
  it('should remove provider and return true', () => {
    existsSyncMock.mockReturnValue(true);
    readFileSyncMock.mockReturnValue(JSON.stringify(sampleProviderList));

    const result = mod.deleteProvider('550e8400-e29b-41d4-a716-446655440000');

    expect(result).toBe(true);
    expect(writeFileSyncMock).toHaveBeenCalledTimes(1);
    const [, content] = writeFileSyncMock.mock.calls[0];
    const saved = JSON.parse(content);
    expect(saved).toHaveLength(0);
  });

  it('should return false when provider ID does not exist', () => {
    existsSyncMock.mockReturnValue(true);
    readFileSyncMock.mockReturnValue(JSON.stringify(sampleProviderList));

    const result = mod.deleteProvider('non-existent');

    expect(result).toBe(false);
    expect(writeFileSyncMock).not.toHaveBeenCalled();
  });
});

describe('toggleProvider', () => {
  it('should invert enabled from true to false', () => {
    existsSyncMock.mockReturnValue(true);
    readFileSyncMock.mockReturnValue(JSON.stringify(sampleProviderList));

    const result = mod.toggleProvider('550e8400-e29b-41d4-a716-446655440000');

    expect(result.enabled).toBe(false);
  });

  it('should invert enabled from false to true', () => {
    const disabledProvider = { ...sampleProvider, enabled: false };
    existsSyncMock.mockReturnValue(true);
    readFileSyncMock.mockReturnValue(JSON.stringify([disabledProvider]));

    const result = mod.toggleProvider('550e8400-e29b-41d4-a716-446655440000');

    expect(result.enabled).toBe(true);
  });

  it('should throw error when provider ID does not exist', () => {
    existsSyncMock.mockReturnValue(true);
    readFileSyncMock.mockReturnValue(JSON.stringify(sampleProviderList));

    expect(() => mod.toggleProvider('non-existent')).toThrow('not found');
  });
});

describe('ProviderInputSchema', () => {
  it('should accept valid provider input', () => {
    const result = mod.ProviderInputSchema.safeParse({
      name: 'Test',
      apiKey: 'sk-test',
    });

    expect(result.success).toBe(true);
  });

  it('should reject data without name', () => {
    const result = mod.ProviderInputSchema.safeParse({
      apiKey: 'sk-test',
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
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path.join('.'));
      expect(paths).toContain('apiKey');
    }
  });

  it('should reject enabled as string type', () => {
    const result = mod.ProviderInputSchema.safeParse({
      name: 'Test',
      apiKey: 'sk-test',
      enabled: 'not-a-boolean',
    });

    expect(result.success).toBe(false);
  });

  it('should accept input with all optional fields', () => {
    const result = mod.ProviderInputSchema.safeParse({
      name: 'Test',
      apiKey: 'sk-test',
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
      enabled: true,
      createdAt: '2026-01-01T00:00:00.000Z',
    });

    expect(result.success).toBe(false);
  });
});
