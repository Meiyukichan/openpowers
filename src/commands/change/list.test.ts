/**
 * @fileoverview Tests for change/list.ts runChangeList
 * @author Meiyuki <meiyukichan@163.com>
 * @copyright 2026 Meiyuki
 */

import path from 'path';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

type DirEntry = { name: string; isDirectory: () => boolean; isFile: () => boolean };

// Hoisted mocks
const { mockEnsureMemoryChangesJson } = vi.hoisted(() => ({
  mockEnsureMemoryChangesJson: vi.fn(),
}));

const { mockLogger } = vi.hoisted(() => ({
  mockLogger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

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

  return {
    mockFs: {
      fileSystem,
      dirSet,
      setFile,
      setDir,
      reset,
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
      readdirSync: vi.fn((_p: string, _options?: unknown) => {
        return [] as Array<{ name: string; isDirectory: () => boolean; isFile: () => boolean }>;
      }),
    },
  };
});

vi.mock('fs', () => ({
  default: mockFs,
}));

vi.mock('../../utils/logger.js', () => ({
  logger: mockLogger,
}));

vi.mock('../../utils/memory.js', () => ({
  ensureMemoryChangesJson: mockEnsureMemoryChangesJson,
}));

describe('src/commands/change/list.ts', () => {
  const CHANGES_DIR = path.join(process.cwd(), 'furina', 'changes');
  const NORM_CHANGES_DIR = CHANGES_DIR.replace(/\\/g, '/');

  let runChangeList: () => void;
  let stdoutWriteSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    vi.resetAllMocks();
    mockFs.reset();
    stdoutWriteSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

    const mod = await import('./list.js');
    runChangeList = mod.runChangeList;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should print "No changes found" when no change directories exist', () => {
    mockFs.readdirSync.mockImplementation(() => [] as DirEntry[]);

    runChangeList();

    const stdoutCalls = stdoutWriteSpy.mock.calls.map((c: unknown[]) => c[0]);
    expect(stdoutCalls.some((s: unknown) => String(s).includes('No changes found'))).toBe(true);
  });

  it('should print table header when changes exist', () => {
    mockFs.setDir(CHANGES_DIR);
    mockFs.setDir(path.join(CHANGES_DIR, 'my-feature'));
    mockFs.setFile(path.join(CHANGES_DIR, 'my-feature', 'plan.json'), JSON.stringify([
      { id: 't1', status: 'done' },
      { id: 't2', status: 'todo' },
    ]));

    mockFs.readdirSync.mockImplementation((p: string, _options?: unknown) => {
      const normalized = p.replace(/\\/g, '/');
      if (normalized === NORM_CHANGES_DIR) {
        return [
          { name: 'my-feature', isDirectory: () => true, isFile: () => false },
          { name: 'archive', isDirectory: () => true, isFile: () => false },
        ] as DirEntry[];
      }
      // ARCHIVE_DIR
      return [] as DirEntry[];
    });

    runChangeList();

    const stdoutCalls = stdoutWriteSpy.mock.calls.map((c: unknown[]) => String(c[0]));
    expect(stdoutCalls.some((s: unknown) => String(s).includes('Name'))).toBe(true);
    expect(stdoutCalls.some((s: unknown) => String(s).includes('Progress'))).toBe(true);
    expect(stdoutCalls.some((s: unknown) => String(s).includes('Description'))).toBe(true);
    expect(stdoutCalls.some((s: unknown) => String(s).includes('my-feature'))).toBe(true);
    expect(stdoutCalls.some((s: unknown) => String(s).includes('1/2 features'))).toBe(true);
  });

  it('should call ensureMemoryChangesJson to sync global memory after listing', () => {
    mockFs.setDir(CHANGES_DIR);
    mockFs.setDir(path.join(CHANGES_DIR, 'my-feature'));
    mockFs.setFile(path.join(CHANGES_DIR, 'my-feature', 'plan.json'), JSON.stringify([
      { id: 't1', status: 'done' },
    ]));

    mockFs.readdirSync.mockImplementation((_p: string, _options?: unknown) => {
      return [
        { name: 'my-feature', isDirectory: () => true, isFile: () => false },
        { name: 'archive', isDirectory: () => true, isFile: () => false },
      ] as DirEntry[];
    });

    runChangeList();

    expect(mockEnsureMemoryChangesJson).toHaveBeenCalledWith(process.cwd());
  });
});
