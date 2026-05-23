/**
 * @fileoverview Tests for provider template read/write utilities
 * @author Meiyuki <meiyukichan@163.com>
 * @copyright 2026 Meiyuki
 */

import path from 'path';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

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
  let readProviderTemplates: () => typeof sampleTemplate[];

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
  let addProviderTemplate: (template: typeof newTemplateInput) => typeof sampleTemplate;

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

    expect(result).toEqual(newTemplateInput);

    // Verify the file was written with the combined array
    const expectedTemplates = [...existingTemplates, newTemplateInput];
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

    expect(result).toEqual(newTemplateInput);

    expect(writeFileSyncMock).toHaveBeenCalledTimes(1);
    const writtenJson = writeFileSyncMock.mock.calls[0][1] as string;
    expect(JSON.parse(writtenJson)).toEqual([newTemplateInput]);
  });
});
