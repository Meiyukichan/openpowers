/**
 * @fileoverview Tests for shared config utility (deepMerge, loadConfig, queryConfig)
 * @author Meiyuki <meiyukichan@163.com>
 * @copyright 2026 Meiyuki
 */

import path from 'path';
import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import type { OpenPowersConfig } from './config.js';

// ---- mocks for loadConfig file I/O ----

const { readFileSyncMock, existsSyncMock, mkdirSyncMock, writeFileSyncMock } = vi.hoisted(() => ({
  readFileSyncMock: vi.fn(),
  existsSyncMock: vi.fn(),
  mkdirSyncMock: vi.fn(),
  writeFileSyncMock: vi.fn(),
}));

vi.mock('fs', () => ({
  default: {
    readFileSync: readFileSyncMock,
    existsSync: existsSyncMock,
    mkdirSync: mkdirSyncMock,
    writeFileSync: writeFileSyncMock,
  },
}));

const { loggerWarnMock } = vi.hoisted(() => ({
  loggerWarnMock: vi.fn(),
}));

vi.mock('./logger.js', () => ({
  logger: {
    warn: loggerWarnMock,
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock('url', () => ({
  default: {
    fileURLToPath: vi.fn(() => path.resolve('/mock/project/src/utils/config.ts')),
  },
}));

// ---- test data ----

const defaultConfigFixture = {
  language: 'chinese',
  switchProviders: {
    workflow: 'default',
    explore: 'minimax',
    propose: 'default',
    plan: 'glm',
    review: 'deepseek',
    coding: 'minimax',
    finalize: 'deepseek',
  },
  project: {
    sourcecode: './',
    codebases: {
      enable: false,
      path: 'docs/codebases',
    },
    repositories: [],
    references: [],
  },
  experimental: {
    explore: true,
    websearch: true,
    context7: true,
    review: {
      propose: false,
      plan: false,
      specs: false,
      code: true,
      acceptance: true,
      openpowers: false,
    },
    prompt: {
      reviewCode: null as string | null,
    },
    coverage: '70%',
    budget: true,
    factor: 1.5,
  },
};

const overrideConfigFixture = {
  language: 'english',
  switchProviders: {
    workflow: 'mimo',
    explore: 'mimo',
    propose: 'mimo',
    plan: 'mimo',
    review: 'mimo',
    coding: 'mimo',
    finalize: 'deepseek',
  },
  project: {
    sourcecode: 'src/',
    repositories: [{ path: '/custom', description: 'custom repo' }],
  },
};

// ---- describe blocks ----

describe('deepMerge', () => {
  // Will be imported dynamically after mocks are set up
  let deepMerge: (base: Record<string, unknown>, override: Record<string, unknown>) => Record<string, unknown>;

  beforeAll(async () => {
    const mod = await import('./config.js');
    deepMerge = mod.deepMerge;
  });

  it('should replace base value when override has different type', () => {
    const base = { count: 42 };
    const override = { count: 'forty-two' };
    const result = deepMerge(base, override);
    expect(result).toBe(base); // mutates in place
    expect(base.count).toBe('forty-two');
  });

  it('should add keys from override not present in base', () => {
    const base = { a: 1 };
    const override = { b: 2 };
    const result = deepMerge(base, override);
    expect(result).toBe(base);
    expect(base).toEqual({ a: 1, b: 2 });
  });

  it('should recursively merge nested plain objects', () => {
    const base = { nested: { x: 1, y: 2 } };
    const override = { nested: { y: 3, z: 4 } };
    const result = deepMerge(base, override);
    expect(result).toBe(base);
    expect(base.nested).toEqual({ x: 1, y: 3, z: 4 });
  });

  it('should extend arrays via base.concat(override)', () => {
    const base = { items: [1, 2] };
    const override = { items: [3, 4] };
    const result = deepMerge(base, override);
    expect(result).toBe(base);
    expect(base.items).toEqual([1, 2, 3, 4]);
  });

  it('should replace base array with override if override is not an array', () => {
    const base = { items: [1, 2] };
    const override = { items: 'not-an-array' };
    const result = deepMerge(base, override);
    expect(result.items).toBe('not-an-array');
  });

  it('should deep merge deeply nested objects (3 levels)', () => {
    const base = { a: { b: { c: 1, d: 2 } } };
    const override = { a: { b: { d: 3, e: 4 } } };
    const result = deepMerge(base, override) as typeof base;
    expect(result.a.b).toEqual({ c: 1, d: 3, e: 4 });
  });

  it('should handle null values from override', () => {
    const base = { key: 'value' };
    const override = { key: null };
    const result = deepMerge(base, override);
    expect(result.key).toBeNull();
  });
});

describe('queryConfig', () => {
  let queryConfig: (config: Record<string, unknown>, keyPath: string) => unknown;

  beforeAll(async () => {
    const mod = await import('./config.js');
    queryConfig = mod.queryConfig;
  });

  const config = {
    language: 'chinese',
    project: {
      sourcecode: './',
      codebases: {
        codebases: false,
        path: 'docs/codebases',
      },
    },
    switchProviders: {
      workflow: 'default',
      explore: 'minimax',
      propose: 'default',
      plan: 'default',
      review: 'default',
      coding: 'default',
      finalize: 'default',
    },
  };

  it('should return value for existing non-object key (e.g. language)', () => {
    const result = queryConfig(config, 'language');
    expect(result).toBe('chinese');
  });

  it('should traverse nested path and return leaf value', () => {
    const result = queryConfig(config, 'project.sourcecode');
    expect(result).toBe('./');
  });

  it('should return undefined for non-existent key', () => {
    const result = queryConfig(config, 'nonexistent.key');
    expect(result).toBeUndefined();
  });

  it('should return the object itself when value is a plain object', () => {
    const result = queryConfig(config, 'switchProviders');
    expect(result).toEqual({

      finalize: 'default',
      workflow: 'default',
      explore: 'minimax',
      propose: 'default',
      plan: 'default',
      review: 'default',
      coding: 'default',
    });
  });

  it('should return undefined when intermediate path segment is not an object', () => {
    const result = queryConfig(config, 'language.notAProperty');
    expect(result).toBeUndefined();
  });
});

describe('loadConfig', () => {
  let loadConfig: (cwd?: string) => OpenPowersConfig;

  beforeAll(async () => {
    const mod = await import('./config.js');
    loadConfig = mod.loadConfig;
  });

  beforeEach(() => {
    vi.clearAllMocks();
    // Default: no files exist
    existsSyncMock.mockReturnValue(false);
  });

  it('should return default config as-is when only resources/openpowers.json exists', () => {
    existsSyncMock.mockImplementation((p: string) => {
      // Only the default config file exists
      return !p.includes('.claude');
    });
    readFileSyncMock.mockReturnValue(JSON.stringify(defaultConfigFixture));

    const result = loadConfig('/mock/cwd');

    expect(result).toEqual(defaultConfigFixture);
  });

  it('should deep-merge when both default and cwd override exist', () => {
    existsSyncMock.mockReturnValue(true);
    readFileSyncMock
      .mockReturnValueOnce(JSON.stringify(defaultConfigFixture)) // default
      .mockReturnValueOnce(JSON.stringify(overrideConfigFixture)); // override

    const result = loadConfig('/mock/cwd');

    // language replaced, switchProviders merged
    expect(result.language).toBe('english');
    expect(result.switchProviders).toEqual({

      finalize: 'deepseek',
      workflow: 'mimo',
      explore: 'mimo',
      propose: 'mimo',
      plan: 'mimo',
      review: 'mimo',
      coding: 'mimo',
    });
    expect(result.project.sourcecode).toBe('src/');
    expect(result.project.repositories).toEqual([{ path: '/custom', description: 'custom repo' }]);
  });

  it('should silently skip override when .claude/openpowers.json does not exist', () => {
    existsSyncMock.mockImplementation((p: string) => {
      // Default exists, override does not
      return !p.includes('.claude');
    });
    readFileSyncMock.mockReturnValue(JSON.stringify(defaultConfigFixture));

    const result = loadConfig('/mock/cwd');

    expect(result).toEqual(defaultConfigFixture);
    // readFileSync should only have been called once (for default)
    expect(readFileSyncMock).toHaveBeenCalledTimes(1);
  });

  it('should log warning and fall back to defaults when override contains invalid JSON', () => {
    existsSyncMock.mockReturnValue(true);
    readFileSyncMock
      .mockReturnValueOnce(JSON.stringify(defaultConfigFixture)) // default OK
      .mockReturnValueOnce('not valid json {{{'); // override broken

    const result = loadConfig('/mock/cwd');

    expect(result).toEqual(defaultConfigFixture);
    expect(loggerWarnMock).toHaveBeenCalledTimes(1);
    expect(loggerWarnMock).toHaveBeenCalledWith(
      expect.stringContaining('Failed to parse'),
    );
  });

  it('should re-throw filesystem errors (e.g. EACCES) instead of swallowing them', () => {
    existsSyncMock.mockReturnValue(true);
    const fsError = new Error('EACCES: permission denied');
    (fsError as NodeJS.ErrnoException).code = 'EACCES';
    readFileSyncMock
      .mockReturnValueOnce(JSON.stringify(defaultConfigFixture)) // default OK
      .mockImplementationOnce(() => { throw fsError; }); // override read fails

    expect(() => loadConfig('/mock/cwd')).toThrow('EACCES: permission denied');
    // Should not have logged the misleading JSON parse warning
    expect(loggerWarnMock).not.toHaveBeenCalled();
  });

  it('should use process.cwd() when no cwd argument is provided', () => {
    existsSyncMock.mockImplementation((p: string) => {
      return !p.includes('.claude');
    });
    readFileSyncMock.mockReturnValue(JSON.stringify(defaultConfigFixture));

    // Should not throw when called without argument
    const result = loadConfig();

    expect(result).toEqual(defaultConfigFixture);
  });

  it('should throw if default config file contains invalid JSON', () => {
    existsSyncMock.mockReturnValue(true);
    readFileSyncMock.mockReturnValue('not valid json {{{');

    expect(() => loadConfig('/mock/cwd')).toThrow();
  });

  it('should preserve experimental.explore=true from default config after safeParse', () => {
    existsSyncMock.mockImplementation((p: string) => {
      // Only the default config file exists
      return !p.includes('.claude');
    });
    readFileSyncMock.mockReturnValue(JSON.stringify(defaultConfigFixture));

    const result = loadConfig('/mock/cwd');

    expect(result.experimental).toBeDefined();
    expect((result.experimental as Record<string, unknown>).explore).toBe(true);
  });

  it('should resolve experimental.explore to default true when user override omits it', () => {
    existsSyncMock.mockReturnValue(true);
    // Override has experimental object but no explore field
    const overrideWithoutExplore = {
      experimental: {
        websearch: false,
      },
    };
    readFileSyncMock
      .mockReturnValueOnce(JSON.stringify(defaultConfigFixture))
      .mockReturnValueOnce(JSON.stringify(overrideWithoutExplore));

    const result = loadConfig('/mock/cwd');

    expect((result.experimental as Record<string, unknown>).explore).toBe(true);
  });

  it('should emit logger.warn and strip the invalid field when override sets experimental.explore to a non-boolean', () => {
    existsSyncMock.mockReturnValue(true);
    const overrideWithBadExplore = {
      experimental: {
        explore: 'yes',
      },
    };
    readFileSyncMock
      .mockReturnValueOnce(JSON.stringify(defaultConfigFixture))
      .mockReturnValueOnce(JSON.stringify(overrideWithBadExplore));

    const result = loadConfig('/mock/cwd');

    // logger.warn should be called for the failed safeParse on experimental.explore
    expect(loggerWarnMock).toHaveBeenCalled();
    const warnCalls = loggerWarnMock.mock.calls.map((c: unknown[]) => String(c[0]));
    expect(warnCalls.some((m: string) => m.includes('experimental.explore'))).toBe(true);

    // The invalid leaf is stripped so that `config show experimental.explore`
    // degrades gracefully to `None` via formatValue's undefined branch.
    expect((result.experimental as Record<string, unknown>).explore).toBeUndefined();
  });
});

describe('readUserConfig', () => {
  let readUserConfig: (cwd: string) => Record<string, unknown>;

  beforeAll(async () => {
    const mod = await import('./config.js');
    readUserConfig = mod.readUserConfig;
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return the parsed JSON object when the override file exists', () => {
    const userOverride = { language: 'english', experimental: { explore: false } };
    readFileSyncMock.mockReturnValue(JSON.stringify(userOverride));

    const result = readUserConfig('/mock/cwd');

    expect(result).toEqual(userOverride);
    const expectedPath = path.join('/mock/cwd', '.claude', 'openpowers.json');
    expect(readFileSyncMock).toHaveBeenCalledWith(expectedPath, 'utf-8');
  });

  it('should return an empty object when the override file does not exist (ENOENT)', () => {
    const enoent = new Error('ENOENT: no such file or directory') as NodeJS.ErrnoException;
    enoent.code = 'ENOENT';
    readFileSyncMock.mockImplementation(() => { throw enoent; });

    const result = readUserConfig('/mock/cwd');

    expect(result).toEqual({});
  });

  it('should return an empty object when the override file cannot be read (EACCES)', () => {
    const eacces = new Error('EACCES: permission denied') as NodeJS.ErrnoException;
    eacces.code = 'EACCES';
    readFileSyncMock.mockImplementation(() => { throw eacces; });

    const result = readUserConfig('/mock/cwd');

    expect(result).toEqual({});
  });

  it('should return an empty object when the override file contains invalid JSON', () => {
    readFileSyncMock.mockReturnValue('not valid json {{{');

    const result = readUserConfig('/mock/cwd');

    expect(result).toEqual({});
  });
});

describe('writeUserConfig', () => {
  let writeUserConfig: (cwd: string, data: Record<string, unknown>) => void;

  beforeAll(async () => {
    const mod = await import('./config.js');
    writeUserConfig = mod.writeUserConfig;
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should create the .claude directory recursively and write a UTF-8 file', () => {
    const data = { language: 'english' };

    writeUserConfig('/mock/cwd', data);

    const expectedDir = path.join('/mock/cwd', '.claude');
    const expectedPath = path.join(expectedDir, 'openpowers.json');

    expect(mkdirSyncMock).toHaveBeenCalledWith(expectedDir, { recursive: true });
    expect(writeFileSyncMock).toHaveBeenCalledTimes(1);
    const [actualPath, actualBody, encoding] = writeFileSyncMock.mock.calls[0];
    expect(actualPath).toBe(expectedPath);
    expect(encoding).toBe('utf-8');
    expect(typeof actualBody).toBe('string');
  });

  it('should serialize JSON with 2-space indentation and a trailing newline', () => {
    const data = { language: 'english', nested: { a: 1 } };

    writeUserConfig('/mock/cwd', data);

    const body = writeFileSyncMock.mock.calls[0][1] as string;
    // 2-space indentation
    expect(body.startsWith('{\n  "language"')).toBe(true);
    // Ends with exactly one trailing newline
    expect(body.endsWith('}\n')).toBe(true);
    expect(body.endsWith('}\n\n')).toBe(false);
    // Body without trailing newline parses back to the input data
    expect(JSON.parse(body)).toEqual(data);
  });
});

describe('setUserConfigValue', () => {
  let setUserConfigValue: (cwd: string, keyPath: string, value: unknown) => unknown;

  beforeAll(async () => {
    const mod = await import('./config.js');
    setUserConfigValue = mod.setUserConfigValue;
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should create intermediate objects and persist the value', () => {
    // No existing override file
    const enoent = new Error('ENOENT') as NodeJS.ErrnoException;
    enoent.code = 'ENOENT';
    readFileSyncMock.mockImplementation(() => { throw enoent; });

    const result = setUserConfigValue('/mock/cwd', 'experimental.review.openpowers', true);

    expect(result).toBe(true);
    expect(writeFileSyncMock).toHaveBeenCalledTimes(1);
    const body = writeFileSyncMock.mock.calls[0][1] as string;
    const parsed = JSON.parse(body);
    expect(parsed).toEqual({
      experimental: {
        review: {
          openpowers: true,
        },
      },
    });
  });

  it('should leave unrelated top-level keys untouched', () => {
    const existing = {
      language: 'english',
      switchProviders: { workflow: 'mimo' },
    };
    readFileSyncMock.mockReturnValue(JSON.stringify(existing));

    setUserConfigValue('/mock/cwd', 'experimental.explore', false);

    const body = writeFileSyncMock.mock.calls[0][1] as string;
    const parsed = JSON.parse(body);
    expect(parsed.language).toBe('english');
    expect(parsed.switchProviders).toEqual({ workflow: 'mimo' });
    expect(parsed.experimental).toEqual({ explore: false });
  });

  it('should overwrite an existing leaf value at the given key path', () => {
    const existing = {
      experimental: {
        explore: true,
        websearch: true,
      },
    };
    readFileSyncMock.mockReturnValue(JSON.stringify(existing));

    const result = setUserConfigValue('/mock/cwd', 'experimental.explore', false);

    expect(result).toBe(false);
    const body = writeFileSyncMock.mock.calls[0][1] as string;
    const parsed = JSON.parse(body);
    expect(parsed.experimental.explore).toBe(false);
    // Unrelated sibling preserved
    expect(parsed.experimental.websearch).toBe(true);
  });

  it('should write the file to {cwd}/.claude/openpowers.json with proper formatting', () => {
    const enoent = new Error('ENOENT') as NodeJS.ErrnoException;
    enoent.code = 'ENOENT';
    readFileSyncMock.mockImplementation(() => { throw enoent; });

    setUserConfigValue('/mock/cwd', 'experimental.factor', 2);

    const expectedDir = path.join('/mock/cwd', '.claude');
    const expectedPath = path.join(expectedDir, 'openpowers.json');

    expect(mkdirSyncMock).toHaveBeenCalledWith(expectedDir, { recursive: true });
    const [actualPath, , encoding] = writeFileSyncMock.mock.calls[0];
    expect(actualPath).toBe(expectedPath);
    expect(encoding).toBe('utf-8');
  });
});

describe('setDefaultConfigValue', () => {
  let setDefaultConfigValue: (keyPath: string, value: unknown) => unknown;

  beforeAll(async () => {
    const mod = await import('./config.js');
    setDefaultConfigValue = (mod as unknown as { setDefaultConfigValue: (keyPath: string, value: unknown) => unknown }).setDefaultConfigValue;
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should write to the default config path (resources/openpowers.json)', () => {
    const existing = { language: 'chinese', enhancement: { memory: { schedule: '0 2 * * *' } } };
    readFileSyncMock.mockReturnValue(JSON.stringify(existing));

    const result = setDefaultConfigValue('enhancement.memory.schedule', '0 3 * * *');

    expect(result).toBe('0 3 * * *');
    // Verify write path: should be resources/openpowers.json (not .claude/)
    const actualPath = writeFileSyncMock.mock.calls[0][0] as string;
    expect(actualPath.replace(/\\/g, '/')).toContain('resources/openpowers.json');
    expect(actualPath).not.toContain('.claude');

    const body = writeFileSyncMock.mock.calls[0][1] as string;
    const parsed = JSON.parse(body);
    expect(parsed.enhancement.memory.schedule).toBe('0 3 * * *');
    // Unrelated keys preserved
    expect(parsed.language).toBe('chinese');
  });

  it('should create intermediate objects when they do not exist', () => {
    const existing = { language: 'chinese' };
    readFileSyncMock.mockReturnValue(JSON.stringify(existing));

    setDefaultConfigValue('enhancement.memory.schedule', '0 4 * * *');

    const body = writeFileSyncMock.mock.calls[0][1] as string;
    const parsed = JSON.parse(body);
    expect(parsed.enhancement.memory.schedule).toBe('0 4 * * *');
    expect(parsed.language).toBe('chinese');
  });

  it('should serialize JSON with 2-space indentation and trailing newline', () => {
    readFileSyncMock.mockReturnValue(JSON.stringify({}));

    setDefaultConfigValue('experimental.explore', true);

    const body = writeFileSyncMock.mock.calls[0][1] as string;
    expect(body.startsWith('{\n  "experimental"')).toBe(true);
    expect(body.endsWith('}\n')).toBe(true);
    expect(body.endsWith('}\n\n')).toBe(false);
  });

  it('should overwrite an existing leaf value', () => {
    const existing = { experimental: { explore: true, websearch: false } };
    readFileSyncMock.mockReturnValue(JSON.stringify(existing));

    setDefaultConfigValue('experimental.explore', false);

    const body = writeFileSyncMock.mock.calls[0][1] as string;
    const parsed = JSON.parse(body);
    expect(parsed.experimental.explore).toBe(false);
    expect(parsed.experimental.websearch).toBe(false);
  });
});
