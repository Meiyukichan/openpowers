/**
 * @fileoverview Tests for server/memory/dreamwork.ts -- dreamwork config lifecycle
 * @author Meiyuki <meiyukichan@163.com>
 * @copyright 2026 Meiyuki
 */

import os from 'os';
import path from 'path';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Hoisted mock filesystem
const { mockFs } = vi.hoisted(() => {
  const fileSystem: Record<string, string> = {};
  const dirSet = new Set<string>();

  function setFile(pathStr: string, content: string) {
    fileSystem[pathStr.replace(/\\/g, '/')] = content;
    const parts = pathStr.replace(/\\/g, '/').split('/');
    for (let i = 1; i < parts.length; i++) {
      dirSet.add(parts.slice(0, i).join('/'));
    }
  }

  function setDir(dirPath: string) {
    dirSet.add(dirPath.replace(/\\/g, '/'));
  }

  function reset() {
    Object.keys(fileSystem).forEach((k) => delete fileSystem[k]);
    dirSet.clear();
  }

  function getFile(pathStr: string): string | undefined {
    return fileSystem[pathStr.replace(/\\/g, '/')];
  }

  return {
    mockFs: {
      fileSystem,
      dirSet,
      setFile,
      setDir,
      reset,
      getFile,
      existsSync: vi.fn((p: string) => {
        const normalized = p.replace(/\\/g, '/');
        return normalized in fileSystem || dirSet.has(normalized);
      }),
      readFileSync: vi.fn((p: string, _encoding?: string) => {
        const normalized = p.replace(/\\/g, '/');
        if (normalized in fileSystem) return fileSystem[normalized];
        throw new Error(`ENOENT: ${p}`);
      }),
      writeFileSync: vi.fn((p: string, content: string) => {
        fileSystem[p.replace(/\\/g, '/')] = content;
      }),
      mkdirSync: vi.fn((p: string) => {
        setDir(p);
      }),
      cpSync: vi.fn((src: string, dest: string) => {
        const srcNorm = src.replace(/\\/g, '/');
        const destNorm = dest.replace(/\\/g, '/');
        if (!(srcNorm in fileSystem)) {
          throw new Error(`ENOENT: ${src}`);
        }
        fileSystem[destNorm] = fileSystem[srcNorm];
        const parts = destNorm.split('/');
        for (let i = 1; i < parts.length; i++) {
          dirSet.add(parts.slice(0, i).join('/'));
        }
      }),
    },
  };
});

vi.mock('fs', () => ({
  default: mockFs,
}));

// Get the memory dir path used by the module
const MEMORY_DIR = path.join(os.homedir(), '.openpowers', 'memory');
const DREAMWORK_PATH = path.join(MEMORY_DIR, 'dreamwork.json');

// =========================================================
// Tests for flattenCwdPath
// =========================================================
describe('flattenCwdPath', () => {
  let flattenCwdPath: (cwd: string) => string;

  beforeEach(async () => {
    const mod = await import('./dreamwork.js');
    flattenCwdPath = mod.flattenCwdPath;
  });

  it('should flatten Windows path (\\\\ → /, then : and / → _)', () => {
    const result = flattenCwdPath('D:\\projects-code\\optix\\plugins\\aioptix-vscode-mcp');
    expect(result).toBe('D_projects-code_optix_plugins_aioptix-vscode-mcp');
  });

  it('should flatten Unix path (/ → _)', () => {
    const result = flattenCwdPath('/home/user/projects/my-app');
    expect(result).toBe('_home_user_projects_my-app');
  });

  it('should handle mixed separators', () => {
    const result = flattenCwdPath('C:/Users/test/project');
    expect(result).toBe('C_Users_test_project');
  });

  it('should handle path with no special characters', () => {
    const result = flattenCwdPath('simple-path');
    expect(result).toBe('simple-path');
  });
});

// =========================================================
// Tests for readDreamworkConfig
// =========================================================
describe('readDreamworkConfig', () => {
  let readDreamworkConfig: () => { status: string; workAt: string; projects: Array<{ path: string; status: string }> };
  let formatToday: () => string;
  let formatYesterday: () => string;

  beforeEach(async () => {
    vi.resetAllMocks();
    mockFs.reset();
    const mod = await import('./dreamwork.js');
    readDreamworkConfig = mod.readDreamworkConfig;
    formatToday = mod.formatToday;
    formatYesterday = mod.formatYesterday;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should create default config when dreamwork.json does not exist (AC-1)', () => {
    const config = readDreamworkConfig();

    expect(config.status).toBe('ready');
    expect(config.workAt).toBe(formatToday());
    expect(config.projects).toEqual([]);

    // Check file was written
    const content = mockFs.getFile(DREAMWORK_PATH);
    expect(content).toBeDefined();
    const parsed = JSON.parse(content!);
    expect(parsed.status).toBe('ready');
    expect(parsed.workAt).toBe(formatToday());
    expect(parsed.projects).toEqual([]);
  });

  it('should return existing config when workAt is today (AC-2)', () => {
    const today = formatToday();
    mockFs.setDir(MEMORY_DIR);
    mockFs.setFile(DREAMWORK_PATH, JSON.stringify({
      status: 'in_progress',
      workAt: today,
      projects: [{ path: '/some/project', status: 'ready' }],
    }));

    const config = readDreamworkConfig();

    expect(config.status).toBe('in_progress');
    expect(config.workAt).toBe(today);
    expect(config.projects).toHaveLength(1);
    expect(config.projects[0].path).toBe('/some/project');
  });

  it('should return existing config when workAt is yesterday (AC-2)', () => {
    const yesterday = formatYesterday();
    mockFs.setDir(MEMORY_DIR);
    mockFs.setFile(DREAMWORK_PATH, JSON.stringify({
      status: 'done',
      workAt: yesterday,
      projects: [{ path: '/some/project', status: 'done' }],
    }));

    const config = readDreamworkConfig();

    expect(config.status).toBe('done');
    expect(config.workAt).toBe(yesterday);
    expect(config.projects).toHaveLength(1);
  });

  it('should reset config when workAt is neither today nor yesterday (AC-2)', () => {
    const today = formatToday();
    mockFs.setDir(MEMORY_DIR);
    mockFs.setFile(DREAMWORK_PATH, JSON.stringify({
      status: 'done',
      workAt: '2020-01-15',
      projects: [{ path: '/old/project', status: 'done' }],
    }));

    const config = readDreamworkConfig();

    expect(config.status).toBe('ready');
    expect(config.workAt).toBe(today);
    expect(config.projects).toEqual([]);

    // Verify file was overwritten
    const content = mockFs.getFile(DREAMWORK_PATH);
    const parsed = JSON.parse(content!);
    expect(parsed.projects).toEqual([]);
    expect(parsed.workAt).toBe(today);
  });

  it('should reset status from done to ready when workAt is today and status is done (AC-3)', () => {
    const today = formatToday();
    mockFs.setDir(MEMORY_DIR);
    mockFs.setFile(DREAMWORK_PATH, JSON.stringify({
      status: 'done',
      workAt: today,
      projects: [{ path: '/some/project', status: 'ready' }],
    }));

    const config = readDreamworkConfig();

    expect(config.status).toBe('ready');
    expect(config.workAt).toBe(today);
    expect(config.projects).toHaveLength(1);
  });

  it('should handle invalid JSON in dreamwork.json by recreating default', () => {
    mockFs.setDir(MEMORY_DIR);
    mockFs.setFile(DREAMWORK_PATH, 'not valid json');

    const config = readDreamworkConfig();

    expect(config.status).toBe('ready');
    expect(config.workAt).toBe(formatToday());
    expect(config.projects).toEqual([]);
  });
});

// =========================================================
// Tests for writeDreamworkConfig
// =========================================================
describe('writeDreamworkConfig', () => {
  let writeDreamworkConfig: (config: { status: string; workAt: string; projects: Array<{ path: string; status: string }> }) => void;

  beforeEach(async () => {
    vi.resetAllMocks();
    mockFs.reset();
    const mod = await import('./dreamwork.js');
    writeDreamworkConfig = mod.writeDreamworkConfig;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should write config with JSON.stringify(data, null, 2) + newline (AC-4)', () => {
    const config = {
      status: 'ready',
      workAt: '2026-06-04',
      projects: [{ path: '/test/path', status: 'ready' }],
    };

    writeDreamworkConfig(config);

    const content = mockFs.getFile(DREAMWORK_PATH);
    expect(content).toBeDefined();
    // Verify format: indent=2 + trailing newline
    const expected = JSON.stringify(config, null, 2) + '\n';
    expect(content).toBe(expected);
  });

  it('should create parent directory if not exists', () => {
    const config = {
      status: 'ready',
      workAt: '2026-06-04',
      projects: [],
    };

    writeDreamworkConfig(config);

    // Verify mkdirSync was called for memory dir
    const mkdirCalls = mockFs.mkdirSync.mock.calls.map((c: unknown[]) => String(c[0]));
    const memoryDirCall = mkdirCalls.find((c: string) => c.includes('memory'));
    expect(memoryDirCall).toBeDefined();
  });
});

// =========================================================
// Tests for importDreamworkConfig (main entry for feature.ts)
// =========================================================
describe('importDreamworkConfig', () => {
  let importDreamworkConfig: () => { readDreamworkConfig: () => { status: string; workAt: string; projects: Array<{ path: string; status: string }> }; writeDreamworkConfig: (config: { status: string; workAt: string; projects: Array<{ path: string; status: string }> }) => void; flattenCwdPath: (cwd: string) => string };

  beforeEach(async () => {
    vi.resetAllMocks();
    mockFs.reset();
    const mod = await import('./dreamwork.js');
    importDreamworkConfig = mod.importDreamworkConfig;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should return fresh instance with read, write, and flatten functions', () => {
    const instance = importDreamworkConfig();
    expect(typeof instance.readDreamworkConfig).toBe('function');
    expect(typeof instance.writeDreamworkConfig).toBe('function');
    expect(typeof instance.flattenCwdPath).toBe('function');
  });

  it('should return functions that work with the shared filesystem state', () => {
    const instance = importDreamworkConfig();

    // write, then read back
    const today = new Date();
    const y = today.getFullYear();
    const m = String(today.getMonth() + 1).padStart(2, '0');
    const d = String(today.getDate()).padStart(2, '0');
    const todayStr = `${y}-${m}-${d}`;

    instance.writeDreamworkConfig({
      status: 'in_progress',
      workAt: todayStr,
      projects: [{ path: '/my/project', status: 'ready' }],
    });

    const config = instance.readDreamworkConfig();
    expect(config.status).toBe('in_progress');
    expect(config.projects).toHaveLength(1);
  });
});
