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
      appendFileSync: vi.fn((p: string, content: string) => {
        const normalized = p.replace(/\\/g, '/');
        if (!(normalized in fileSystem)) {
          fileSystem[normalized] = '';
        }
        fileSystem[normalized] += content;
        const parts = normalized.split('/');
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
    expect(result).toBe('D__projects-code_optix_plugins_aioptix-vscode-mcp');
  });

  it('should flatten Unix path (/ → _)', () => {
    const result = flattenCwdPath('/home/user/projects/my-app');
    expect(result).toBe('_home_user_projects_my-app');
  });

  it('should handle mixed separators', () => {
    const result = flattenCwdPath('C:/Users/test/project');
    expect(result).toBe('C__Users_test_project');
  });

  it('should handle path with no special characters', () => {
    const result = flattenCwdPath('simple-path');
    expect(result).toBe('simple-path');
  });
});

// Type for DreamworkConfig v2 (no top-level status, changes are string[])
type DreamworkConfigV2 = { workAt: string; projects: Array<{ project: string; changes: string[]; status?: 'done' }> };

// =========================================================
// Tests for readDreamworkConfig
// =========================================================
describe('readDreamworkConfig', () => {
  let readDreamworkConfig: () => DreamworkConfigV2;
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

    expect(config.workAt).toBe(formatToday());
    expect(config.projects).toEqual([]);

    // Check file was written — no top-level status
    const content = mockFs.getFile(DREAMWORK_PATH);
    expect(content).toBeDefined();
    const parsed = JSON.parse(content!);
    expect(parsed.workAt).toBe(formatToday());
    expect(parsed.projects).toEqual([]);
    // v2: no top-level status field
    expect(parsed.status).toBeUndefined();
  });

  it('should return existing config when workAt is today (AC-2)', () => {
    const today = formatToday();
    mockFs.setDir(MEMORY_DIR);
    mockFs.setFile(DREAMWORK_PATH, JSON.stringify({
      workAt: today,
      projects: [{ project: '/some/project', changes: ['/some/project/design_1.md'] }],
    }));

    const config = readDreamworkConfig();

    expect(config.workAt).toBe(today);
    expect(config.projects).toHaveLength(1);
    expect(config.projects[0].project).toBe('/some/project');
    expect(config.projects[0].changes).toEqual(['/some/project/design_1.md']);
  });

  it('should return existing config when workAt is yesterday (AC-2)', () => {
    const yesterday = formatYesterday();
    mockFs.setDir(MEMORY_DIR);
    mockFs.setFile(DREAMWORK_PATH, JSON.stringify({
      workAt: yesterday,
      projects: [{ project: '/some/project', changes: ['/some/project/design_1.md'], status: 'done' }],
    }));

    const config = readDreamworkConfig();

    expect(config.workAt).toBe(yesterday);
    expect(config.projects).toHaveLength(1);
    expect(config.projects[0].project).toBe('/some/project');
    expect(config.projects[0].status).toBe('done');
  });

  it('should reset config when workAt is neither today nor yesterday (AC-2)', () => {
    const today = formatToday();
    mockFs.setDir(MEMORY_DIR);
    mockFs.setFile(DREAMWORK_PATH, JSON.stringify({
      workAt: '2020-01-15',
      projects: [{ project: '/old/project', changes: ['/old/project/design_test.md'] }],
    }));

    const config = readDreamworkConfig();

    expect(config.workAt).toBe(today);
    expect(config.projects).toEqual([]);

    // Verify file was overwritten
    const content = mockFs.getFile(DREAMWORK_PATH);
    const parsed = JSON.parse(content!);
    expect(parsed.projects).toEqual([]);
    expect(parsed.workAt).toBe(today);
  });

  it('should NOT reset status when workAt is today and a project has status="done"', () => {
    const today = formatToday();
    mockFs.setDir(MEMORY_DIR);
    mockFs.setFile(DREAMWORK_PATH, JSON.stringify({
      workAt: today,
      projects: [{ project: '/some/project', changes: ['/some/project/design_test.md'], status: 'done' }],
    }));

    const config = readDreamworkConfig();

    // v2: done→ready reset is removed; project-level status preserved
    expect(config.workAt).toBe(today);
    expect(config.projects).toHaveLength(1);
    expect(config.projects[0].status).toBe('done');
  });

  it('should reset config when old format detected (projects element has path instead of project field)', () => {
    const today = formatToday();
    mockFs.setDir(MEMORY_DIR);
    mockFs.setFile(DREAMWORK_PATH, JSON.stringify({
      workAt: today,
      projects: [{ path: '/old/project', status: 'ready' }],
    }));

    const config = readDreamworkConfig();

    expect(config.workAt).toBe(today);
    expect(config.projects).toEqual([]);

    // Verify file was overwritten with default config
    const content = mockFs.getFile(DREAMWORK_PATH);
    const parsed = JSON.parse(content!);
    expect(parsed.projects).toEqual([]);
    expect(parsed.workAt).toBe(today);
  });

  it('should handle config without projects field', () => {
    const today = formatToday();
    mockFs.setDir(MEMORY_DIR);
    mockFs.setFile(DREAMWORK_PATH, JSON.stringify({
      workAt: today,
      // no projects field — covers the falsy branch at dreamwork.ts
    }));

    const config = readDreamworkConfig();

    expect(config.workAt).toBe(today);
    // projects field should be undefined (as stored in the file)
    expect(config.projects).toBeUndefined();
  });

  it('should handle invalid JSON in dreamwork.json by recreating default', () => {
    mockFs.setDir(MEMORY_DIR);
    mockFs.setFile(DREAMWORK_PATH, 'not valid json');

    const config = readDreamworkConfig();

    expect(config.workAt).toBe(formatToday());
    expect(config.projects).toEqual([]);
  });
});

// =========================================================
// Tests for writeDreamworkConfig
// =========================================================
describe('writeDreamworkConfig', () => {
  let writeDreamworkConfig: (config: DreamworkConfigV2) => void;

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
    const config: DreamworkConfigV2 = {
      workAt: '2026-06-04',
      projects: [{ project: '/test/path', changes: ['/test/path/design_test.md'] }],
    };

    writeDreamworkConfig(config);

    const content = mockFs.getFile(DREAMWORK_PATH);
    expect(content).toBeDefined();
    // Verify format: indent=2 + trailing newline
    const expected = JSON.stringify(config, null, 2) + '\n';
    expect(content).toBe(expected);
  });

  it('should write config with project-level status when provided', () => {
    const config: DreamworkConfigV2 = {
      workAt: '2026-06-04',
      projects: [{ project: '/test/path', changes: [], status: 'done' }],
    };

    writeDreamworkConfig(config);

    const content = mockFs.getFile(DREAMWORK_PATH);
    const parsed = JSON.parse(content!);
    expect(parsed.projects[0].status).toBe('done');
    expect(parsed.projects[0].changes).toEqual([]);
  });

  it('should create parent directory if not exists', () => {
    const config: DreamworkConfigV2 = {
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
  let importDreamworkConfig: () => { readDreamworkConfig: () => DreamworkConfigV2; writeDreamworkConfig: (config: DreamworkConfigV2) => void; flattenCwdPath: (cwd: string) => string };

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
      workAt: todayStr,
      projects: [{ project: '/my/project', changes: ['/my/project/design_test.md'] }],
    });

    const config = instance.readDreamworkConfig();
    expect(config.workAt).toBe(todayStr);
    expect(config.projects).toHaveLength(1);
    expect(config.projects[0].changes).toEqual(['/my/project/design_test.md']);
  });
});
