/**
 * @fileoverview Tests for provider template read/write utilities
 * @author Meiyuki <meiyukichan@163.com>
 * @copyright 2026 Meiyuki
 */

import path from 'path';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProviderTemplate, ProviderTemplateInput } from './provider-templates.js';

// ---- mocks for file I/O ----

const { existsSyncMock, readFileSyncMock, writeFileSyncMock } = vi.hoisted(() => ({
  existsSyncMock: vi.fn(),
  readFileSyncMock: vi.fn(),
  writeFileSyncMock: vi.fn(),
}));

vi.mock('fs', () => ({
  default: {
    existsSync: existsSyncMock,
    readFileSync: readFileSyncMock,
    writeFileSync: writeFileSyncMock,
  },
}));

const mockModuleDir = '/mock/project/src/utils';

vi.mock('url', async (importOriginal) => {
  const actual = await importOriginal<typeof import('url')>();
  return {
    ...actual,
    fileURLToPath: vi.fn(() => path.join(mockModuleDir, 'provider-templates.ts')),
  };
});

// ---- test data ----

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

const newTemplateInput = {
  name: 'New Provider',
  websiteUrl: 'https://example.com',
  baseUrl: 'https://api.example.com',
  iconSvg: 'example.svg',
  defaultModel: 'example-model',
  sonnetModel: '',
  opusModel: '',
  haikuModel: '',
};

// ---- describe blocks ----

describe('readProviderTemplates', () => {
  let readProviderTemplates: () => ProviderTemplate[];

  beforeAll(async () => {
    const mod = await import('./provider-templates.js');
    readProviderTemplates = mod.readProviderTemplates;
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return parsed template array when the JSON file exists', () => {
    const templates = [sampleTemplate];
    existsSyncMock.mockReturnValue(true);
    readFileSyncMock.mockReturnValue(JSON.stringify(templates));

    const result = readProviderTemplates();

    expect(result).toEqual(templates);
    expect(existsSyncMock).toHaveBeenCalledTimes(1);
    expect(readFileSyncMock).toHaveBeenCalledTimes(1);
  });

  it('should return empty array when the JSON file does not exist', () => {
    existsSyncMock.mockReturnValue(false);

    const result = readProviderTemplates();

    expect(result).toEqual([]);
    expect(existsSyncMock).toHaveBeenCalledTimes(1);
    expect(readFileSyncMock).not.toHaveBeenCalled();
  });

  it('should return empty array when the JSON file contains invalid content', () => {
    existsSyncMock.mockReturnValue(true);
    readFileSyncMock.mockReturnValue('not valid json {{{');

    const result = readProviderTemplates();

    expect(result).toEqual([]);
    expect(existsSyncMock).toHaveBeenCalledTimes(1);
    expect(readFileSyncMock).toHaveBeenCalledTimes(1);
  });
});

describe('addProviderTemplate', () => {
  let addProviderTemplate: (template: ProviderTemplateInput) => ProviderTemplate;

  beforeAll(async () => {
    const mod = await import('./provider-templates.js');
    addProviderTemplate = mod.addProviderTemplate;
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should append template to JSON file and return the new template when name is unique', () => {
    const existingTemplates = [sampleTemplate];
    existsSyncMock.mockReturnValue(true);
    readFileSyncMock.mockReturnValue(JSON.stringify(existingTemplates));

    const result = addProviderTemplate(newTemplateInput);

    const expectedResult = { ...newTemplateInput, source: 'custom' };
    expect(result).toEqual(expectedResult);

    // Verify the file was written with the combined array
    const expectedTemplates = [...existingTemplates, expectedResult];
    expect(writeFileSyncMock).toHaveBeenCalledTimes(1);
    const writtenJson = writeFileSyncMock.mock.calls[0][1] as string;
    expect(JSON.parse(writtenJson)).toEqual(expectedTemplates);

    // Verify 2-space indentation
    const lines = writtenJson.split('\n');
    const indentedLines = lines.filter((line: string) => line.startsWith('  '));
    expect(indentedLines.length).toBeGreaterThan(0);
  });

  it('should throw an error when the template name already exists', () => {
    const existingTemplates = [sampleTemplate];
    existsSyncMock.mockReturnValue(true);
    readFileSyncMock.mockReturnValue(JSON.stringify(existingTemplates));

    const duplicateInput = {
      name: 'Claude Official',
      websiteUrl: '',
      baseUrl: 'https://different.com',
      iconSvg: '',
      defaultModel: '',
      sonnetModel: '',
      opusModel: '',
      haikuModel: '',
    };

    expect(() => addProviderTemplate(duplicateInput)).toThrow(/already exists/i);
    expect(writeFileSyncMock).not.toHaveBeenCalled();
  });

  it('should create the file when it does not exist and add the template', () => {
    existsSyncMock.mockReturnValue(false);

    const result = addProviderTemplate(newTemplateInput);

    const expectedResult = { ...newTemplateInput, source: 'custom' };
    expect(result).toEqual(expectedResult);

    expect(writeFileSyncMock).toHaveBeenCalledTimes(1);
    const writtenJson = writeFileSyncMock.mock.calls[0][1] as string;
    expect(JSON.parse(writtenJson)).toEqual([expectedResult]);
  });

  it('should always set source to custom regardless of input', () => {
    existsSyncMock.mockReturnValue(false);

    // newTemplateInput is Omit<ProviderTemplate, 'source'>, but even if we
    // somehow pass extra fields, source must always be 'custom'
    const result = addProviderTemplate(newTemplateInput);
    expect(result.source).toBe('custom');
  });
});

describe('deleteProviderTemplate', () => {
  let deleteProviderTemplate: (name: string) => boolean;

  const customTemplate: ProviderTemplate = {
    name: 'My Custom Template',
    baseUrl: 'https://api.custom.com',
    websiteUrl: '',
    iconSvg: '',
    defaultModel: '',
    sonnetModel: '',
    opusModel: '',
    haikuModel: '',
    source: 'custom',
  };

  const builtinTemplate: ProviderTemplate = {
    name: 'Builtin Template',
    baseUrl: 'https://api.builtin.com',
    websiteUrl: '',
    iconSvg: '',
    defaultModel: '',
    sonnetModel: '',
    opusModel: '',
    haikuModel: '',
    source: 'builtin',
  };

  beforeAll(async () => {
    const mod = await import('./provider-templates.js');
    deleteProviderTemplate = mod.deleteProviderTemplate;
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should delete a custom template and return true', () => {
    const existingTemplates = [builtinTemplate, customTemplate];
    existsSyncMock.mockReturnValue(true);
    readFileSyncMock.mockReturnValue(JSON.stringify(existingTemplates));

    const result = deleteProviderTemplate('My Custom Template');

    expect(result).toBe(true);
    expect(writeFileSyncMock).toHaveBeenCalledTimes(1);
    const writtenJson = writeFileSyncMock.mock.calls[0][1] as string;
    const parsed = JSON.parse(writtenJson) as ProviderTemplate[];
    expect(parsed).toHaveLength(1);
    expect(parsed[0].name).toBe('Builtin Template');
  });

  it('should return false when the template does not exist', () => {
    const existingTemplates = [builtinTemplate];
    existsSyncMock.mockReturnValue(true);
    readFileSyncMock.mockReturnValue(JSON.stringify(existingTemplates));

    const result = deleteProviderTemplate('Non Existent Template');

    expect(result).toBe(false);
    expect(writeFileSyncMock).not.toHaveBeenCalled();
  });

  it('should throw an error when attempting to delete a builtin template', () => {
    const existingTemplates = [builtinTemplate];
    existsSyncMock.mockReturnValue(true);
    readFileSyncMock.mockReturnValue(JSON.stringify(existingTemplates));

    expect(() => deleteProviderTemplate('Builtin Template')).toThrow(/cannot delete builtin/i);
    expect(writeFileSyncMock).not.toHaveBeenCalled();
  });
});
