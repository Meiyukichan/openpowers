/**
 * @fileoverview Tests for change/new.ts runChangeNew
 * @author Meiyuki <meiyukichan@163.com>
 * @copyright 2026 Meiyuki
 */

import path from 'path';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

type DirEntry = { name: string; isDirectory: () => boolean; isFile: () => boolean };

// Hoisted mocks
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

describe('src/commands/change/new.ts', () => {
  const CHANGES_DIR = path.join(process.cwd(), 'openpowers', 'changes');
  const CHANGES_JSON_PATH = path.join(process.cwd(), 'openpowers', 'changes.json');

  let runChangeNew: (name: string, options: { desc: string }) => void;
  let stdoutWriteSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    vi.resetAllMocks();
    mockFs.reset();
    stdoutWriteSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    vi.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('process.exit called');
    }) as never);

    const mod = await import('./new.js');
    runChangeNew = mod.runChangeNew;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should reject invalid change name', () => {
    mockFs.writeFileSync.mockClear();
    expect(() => runChangeNew('InvalidName', { desc: 'Test' })).toThrow('process.exit called');
    // No directory should be created
    expect(mockFs.mkdirSync).not.toHaveBeenCalled();
    // Logger error should be called
    expect(mockLogger.error).toHaveBeenCalled();
  });

  it('should create directory and update changes.json for valid name', () => {
    runChangeNew('my-feature', { desc: 'A new feature' });

    // Should create directory
    expect(mockFs.mkdirSync).toHaveBeenCalled();
    // Should write to changes.json
    const writeCalls = mockFs.writeFileSync.mock.calls;
    expect(writeCalls.length).toBeGreaterThanOrEqual(1);
    // Verify the written content includes our change
    const lastWrite = writeCalls[writeCalls.length - 1];
    const content = String(lastWrite[1]);
    expect(content).toContain('my-feature');
    expect(content).toContain('A new feature');
    expect(content).toContain('"artifacts": []');
    // Path should be relative to cwd with forward slashes
    expect(content).toContain('"path": "openpowers/changes/my-feature"');
    // Should print success message to stdout
    const stdoutCalls = stdoutWriteSpy.mock.calls.map((c: unknown[]) => String(c[0]));
    expect(stdoutCalls.some((s: unknown) => String(s).includes("Change 'my-feature' created successfully"))).toBe(true);
  });

  it('should not error if directory already exists', () => {
    mockFs.setDir(path.join(CHANGES_DIR, 'existing-change'));

    expect(() => runChangeNew('existing-change', { desc: 'Update' })).not.toThrow();

    // Should still update changes.json
    const writeCalls = mockFs.writeFileSync.mock.calls;
    expect(writeCalls.length).toBeGreaterThanOrEqual(1);
  });

  it('should update description and updateAt when change name already exists in changes.json', () => {
    // Pre-seed changes.json with an existing entry for the same name
    const originalEntry = {
      name: 'dup-feature',
      path: 'openpowers/changes/dup-feature',
      description: 'Old',
      createdAt: '2026-01-01T00:00:00.000Z',
      features: 0,
      todo: 0,
    };
    mockFs.setFile(CHANGES_JSON_PATH, JSON.stringify({
      framework: 'openpowers',
      version: '1.0.0',
      changes: [originalEntry],
      archive: [],
    }));
    // Ensure CHANGES_DIR itself exists in the mock so syncChangesJson scans it
    mockFs.setDir(CHANGES_DIR);
    mockFs.setDir(path.join(CHANGES_DIR, 'dup-feature'));

    // syncChangesJson scans CHANGES_DIR; make readdirSync return the directory entry
    mockFs.readdirSync.mockReturnValue([
      { name: 'dup-feature', isDirectory: () => true, isFile: () => false },
    ]);

    // Clear write calls from setFile
    mockFs.writeFileSync.mockClear();

    runChangeNew('dup-feature', { desc: 'New duplicate' });

    // Should output update message
    const stdoutCalls = stdoutWriteSpy.mock.calls.map((c: unknown[]) => String(c[0]));
    expect(stdoutCalls.some((s: unknown) => String(s).includes("already exists, description updated"))).toBe(true);

    // Should have written to changes.json
    expect(mockFs.writeFileSync).toHaveBeenCalled();

    // Verify the written content: description updated, updateAt set, createdAt preserved
    const writeCalls = mockFs.writeFileSync.mock.calls;
    const lastWrite = writeCalls[writeCalls.length - 1];
    const content = String(lastWrite[1]);
    const parsed = JSON.parse(content);

    const updatedEntry = parsed.changes.find((c: { name: string }) => c.name === 'dup-feature');
    expect(updatedEntry).toBeDefined();
    expect(updatedEntry.description).toBe('New duplicate');
    expect(updatedEntry.createdAt).toBe('2026-01-01T00:00:00.000Z');
    expect(updatedEntry.updateAt).toBeDefined();
    // updateAt should be a valid ISO timestamp newer than createdAt
    expect(new Date(updatedEntry.updateAt).getTime()).toBeGreaterThan(new Date(updatedEntry.createdAt).getTime());
    // Should not create duplicate entries
    expect(parsed.changes.length).toBe(1);
  });
});
