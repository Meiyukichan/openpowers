/**
 * @fileoverview Tests for shared config utility (deepMerge, loadConfig, queryConfig)
 * @author Meiyuki <meiyukichan@163.com>
 * @copyright 2026 Meiyuki
 */

import path from 'path';
import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';

// ---- mocks for loadConfig file I/O ----

const { readFileSyncMock, existsSyncMock } = vi.hoisted(() => ({
  readFileSyncMock: vi.fn(),
  existsSyncMock: vi.fn(),
}));

vi.mock('fs', () => ({
  default: {
    readFileSync: readFileSyncMock,
    existsSync: existsSyncMock,
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
  providers: {
    enable: false,
    default: 'mimo',
  },
  project: {
    sourcecode: './',
    repositories: [],
  },
};

const overrideConfigFixture = {
  language: 'english',
  providers: {
    enable: true,
    newKey: 'value',
  },
  project: {
    repositories: ['repo-a'],
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
    const result = deepMerge(base, override);
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
      codebases: 'docs/codebases',
    },
    providers: {
      enable: false,
      switch: {
        explore: 'minimax',
      },
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
    const result = queryConfig(config, 'providers');
    expect(result).toEqual({ enable: false, switch: { explore: 'minimax' } });
  });

  it('should return undefined when intermediate path segment is not an object', () => {
    const result = queryConfig(config, 'language.notAProperty');
    expect(result).toBeUndefined();
  });
});

describe('loadConfig', () => {
  let loadConfig: (cwd?: string) => Record<string, unknown>;

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

    // language replaced, providers merged, project merged
    expect(result.language).toBe('english');
    expect(result.providers).toEqual({ enable: true, default: 'mimo', newKey: 'value' });
    expect(result.project).toEqual({ sourcecode: './', repositories: ['repo-a'] });
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
});
