/**
 * @fileoverview Tests for change/archive.ts runChangeArchive
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
    const parts = dirPath.replace(/\\/g, '/').split('/');
    for (let i = 1; i < parts.length; i++) {
      dirSet.add(parts.slice(0, i).join('/'));
    }
  }

  function removeDir(dirPath: string) {
    const normalized = dirPath.replace(/\\/g, '/');
    dirSet.delete(normalized);
    // Also remove all entries under this directory
    for (const entry of Object.keys(fileSystem)) {
      if (entry.startsWith(normalized + '/')) {
        delete fileSystem[entry];
      }
    }
    for (const entry of [...dirSet]) {
      if (entry.startsWith(normalized + '/') || entry === normalized) {
        dirSet.delete(entry);
      }
    }
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
      removeDir,
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
      renameSync: vi.fn((oldPath: string, newPath: string) => {
        const oldNorm = oldPath.replace(/\\/g, '/');
        const newNorm = newPath.replace(/\\/g, '/');
        // Move all files under oldPath to newPath
        for (const entry of Object.keys(fileSystem)) {
          if (entry.startsWith(oldNorm + '/')) {
            const relPath = entry.slice(oldNorm.length + 1);
            fileSystem[`${newNorm}/${relPath}`] = fileSystem[entry];
            delete fileSystem[entry];
          }
        }
        // Move all dirs under oldPath
        for (const entry of [...dirSet]) {
          if (entry.startsWith(oldNorm)) {
            dirSet.delete(entry);
            const relPath = entry.slice(oldNorm.length);
            dirSet.add(`${newNorm}${relPath}`);
          }
        }
        dirSet.add(newNorm);
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

describe('src/commands/change/archive.ts', () => {
  const CHANGES_DIR = path.join(process.cwd(), 'openpowers', 'changes');
  const ARCHIVE_DIR = path.join(process.cwd(), 'openpowers', 'archive');
  const NORM_CHANGES_DIR = CHANGES_DIR.replace(/\\/g, '/');
  const NORM_ARCHIVE_DIR = ARCHIVE_DIR.replace(/\\/g, '/');

  let runChangeArchive: (name: string) => void;
  let stdoutWriteSpy: ReturnType<typeof vi.spyOn>;
  let stderrWriteSpy: ReturnType<typeof vi.spyOn>;

  function setupCompleteChange(changeName: string) {
    const changeDir = path.join(CHANGES_DIR, changeName);
    mockFs.setDir(changeDir);
    mockFs.setFile(path.join(changeDir, 'proposal.md'), '');
    mockFs.setFile(path.join(changeDir, 'design.md'), '');
    mockFs.setDir(path.join(changeDir, 'specs'));
    mockFs.setFile(path.join(changeDir, 'specs', 'my-spec.md'), '');
  }

  function setupReadDirMocks(activeDirs: string[], archiveDirs: string[] = []) {
    mockFs.readdirSync.mockImplementation((p: string, _options?: unknown) => {
      const normalized = p.replace(/\\/g, '/');
      // Active changes directory
      if (normalized === NORM_CHANGES_DIR) {
        const entries: DirEntry[] = activeDirs.map((d) => ({
          name: d,
          isDirectory: () => true,
          isFile: () => false,
        }));
        // Also add potential archive directory
        if (!entries.find((e) => e.name === 'archive')) {
          entries.push({ name: 'archive', isDirectory: () => true, isFile: () => false });
        }
        return entries;
      }
      // Archive directory
      if (normalized === NORM_ARCHIVE_DIR) {
        return archiveDirs.map((d) => ({
          name: d,
          isDirectory: () => true,
          isFile: () => false,
        }));
      }
      // Specs directory traversal for computeArtifactStatus
      if (normalized.includes('/specs')) {
        return [
          { name: 'my-spec.md', isDirectory: () => false, isFile: () => true },
        ] as DirEntry[];
      }
      return [] as DirEntry[];
    });
  }

  beforeEach(async () => {
    vi.resetAllMocks();
    mockFs.reset();
    stdoutWriteSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    stderrWriteSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    vi.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('process.exit called');
    }) as never);

    const mod = await import('./archive.js');
    runChangeArchive = mod.runChangeArchive;
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  // =========================================================
  // runChangeArchive tests
  // =========================================================

  it('should successfully archive a completed change and output success message', () => {
    setupCompleteChange('my-complete-change');
    mockFs.setDir(CHANGES_DIR);
    mockFs.setDir(ARCHIVE_DIR);
    setupReadDirMocks(['my-complete-change']);

    vi.setSystemTime(new Date('2026-05-22T12:00:00Z'));

    runChangeArchive('my-complete-change');

    // Verify renameSync was called with correct source and target paths
    expect(mockFs.renameSync).toHaveBeenCalledTimes(1);
    const renameCalls = mockFs.renameSync.mock.calls[0];
    const srcPath = renameCalls[0].replace(/\\/g, '/');
    const dstPath = renameCalls[1].replace(/\\/g, '/');
    expect(srcPath).toBe(`${NORM_CHANGES_DIR}/my-complete-change`);
    expect(dstPath).toBe(`${NORM_ARCHIVE_DIR}/2026-05-22-my-complete-change`);

    // Verify changes.json was updated
    const writeCalls = mockFs.writeFileSync.mock.calls;
    const lastWrite = writeCalls[writeCalls.length - 1];
    const content = String(lastWrite[1]);
    expect(content).toContain('2026-05-22-my-complete-change');
    expect(content).toContain('closedAt');

    // Verify success message
    const stdoutCalls = stdoutWriteSpy.mock.calls.map((c: unknown[]) => String(c[0]));
    expect(stdoutCalls.some((s: unknown) => String(s).includes('archived successfully'))).toBe(true);
    expect(stdoutCalls.some((s: unknown) => String(s).includes('2026-05-22-my-complete-change'))).toBe(true);
  });

  it('should error when change name does not exist', () => {
    mockFs.setDir(CHANGES_DIR);
    mockFs.setDir(ARCHIVE_DIR);
    setupReadDirMocks([]);

    expect(() => runChangeArchive('nonexistent-change')).toThrow('process.exit called');
    expect(process.exit).toHaveBeenCalledWith(1);

    // Verify error message
    const stderrCalls = stderrWriteSpy.mock.calls.map((c: unknown[]) => String(c[0]));
    expect(stderrCalls.some((s: unknown) => String(s).includes('not found'))).toBe(true);
  });

  it('should reject already archived change', () => {
    mockFs.setDir(CHANGES_DIR);
    mockFs.setDir(ARCHIVE_DIR);
    const archiveDirName = '2026-01-01-already-archived';
    mockFs.setDir(path.join(ARCHIVE_DIR, archiveDirName));
    setupReadDirMocks([], [archiveDirName]);

    expect(() => runChangeArchive('already-archived')).toThrow('process.exit called');
    expect(process.exit).toHaveBeenCalledWith(1);

    const stderrCalls = stderrWriteSpy.mock.calls.map((c: unknown[]) => String(c[0]));
    expect(stderrCalls.some((s: unknown) => String(s).includes('already archived'))).toBe(true);
  });

  it('should reject change with incomplete artifacts and list which are not done', () => {
    mockFs.setDir(CHANGES_DIR);
    mockFs.setDir(ARCHIVE_DIR);

    // Set up a change with only proposal.md (design and specs are not done)
    const changeDir = path.join(CHANGES_DIR, 'incomplete-change');
    mockFs.setDir(changeDir);
    mockFs.setFile(path.join(changeDir, 'proposal.md'), '');

    setupReadDirMocks(['incomplete-change']);

    expect(() => runChangeArchive('incomplete-change')).toThrow('process.exit called');
    expect(process.exit).toHaveBeenCalledWith(1);

    const stderrCalls = stderrWriteSpy.mock.calls.map((c: unknown[]) => String(c[0]));
    const errorOutput = stderrCalls.join('');
    expect(errorOutput).toContain('not all artifacts are done');
    // design and specs should be listed as not done
    expect(errorOutput).toContain('design');
    expect(errorOutput).toContain('specs');
  });

  it('should reject change with only proposal and design but no specs (incomplete artifacts)', () => {
    mockFs.setDir(CHANGES_DIR);
    mockFs.setDir(ARCHIVE_DIR);

    const changeDir = path.join(CHANGES_DIR, 'missing-specs');
    mockFs.setDir(changeDir);
    mockFs.setFile(path.join(changeDir, 'proposal.md'), '');
    mockFs.setFile(path.join(changeDir, 'design.md'), '');

    setupReadDirMocks(['missing-specs']);

    expect(() => runChangeArchive('missing-specs')).toThrow('process.exit called');
    expect(process.exit).toHaveBeenCalledWith(1);

    const stderrCalls = stderrWriteSpy.mock.calls.map((c: unknown[]) => String(c[0]));
    const errorOutput = stderrCalls.join('');
    expect(errorOutput).toContain('not all artifacts are done');
    expect(errorOutput).toContain('specs');
    // proposal and design should NOT be in the not-done list
    expect(errorOutput).not.toContain('proposal');
  });

  it('should create archive directory if it does not exist', () => {
    setupCompleteChange('fresh-archive-change');
    mockFs.setDir(CHANGES_DIR);
    // NOTE: ARCHIVE_DIR is NOT created initially
    setupReadDirMocks(['fresh-archive-change']);

    // When ARCHIVE_DIR doesn't exist, override existsSync to return false for archive dir
    // Use mockFs.fileSystem and mockFs.dirSet (exposed on mockFs) to reference the virtual FS
    mockFs.existsSync.mockImplementation((p: string) => {
      const normalized = p.replace(/\\/g, '/');
      if (normalized === NORM_ARCHIVE_DIR) return false;
      return normalized in mockFs.fileSystem || mockFs.dirSet.has(normalized);
    });

    vi.setSystemTime(new Date('2026-05-22T12:00:00Z'));

    runChangeArchive('fresh-archive-change');

    // Verify archive directory was created
    expect(mockFs.mkdirSync).toHaveBeenCalled();
  });
});
