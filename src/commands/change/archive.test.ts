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

vi.mock('os', () => ({
  default: {
    homedir: vi.fn(() => '/home/test-user'),
  },
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

  it('should reject change with complete core artifacts but incomplete plan.json features', () => {
    mockFs.setDir(CHANGES_DIR);
    mockFs.setDir(ARCHIVE_DIR);

    // Set up complete core artifacts (proposal, design, specs are all done)
    setupCompleteChange('plan-incomplete');
    // Also create plan.json with features not all done
    mockFs.setFile(
      path.join(CHANGES_DIR, 'plan-incomplete', 'plan.json'),
      JSON.stringify([
        { status: 'done' },
        { status: 'in_progress' },
      ]),
    );

    setupReadDirMocks(['plan-incomplete']);

    expect(() => runChangeArchive('plan-incomplete')).toThrow('process.exit called');
    expect(process.exit).toHaveBeenCalledWith(1);

    const stderrCalls = stderrWriteSpy.mock.calls.map((c: unknown[]) => String(c[0]));
    const errorOutput = stderrCalls.join('');
    expect(errorOutput).toContain('not all artifacts are done');
    expect(errorOutput).toContain('plan');
  });

  // =========================================================
  // Global memory sync tests (archive-global-sync)
  // =========================================================

  it('should sync global memory changes.json when archiving: update status, stage.finalize.archive.status, and stage.finalize.archive.to', () => {
    // Arrange: complete change ready to archive
    setupCompleteChange('global-sync-change');
    mockFs.setDir(CHANGES_DIR);
    mockFs.setDir(ARCHIVE_DIR);
    setupReadDirMocks(['global-sync-change']);

    // Set up global memory changes.json with the change having an archive stage
    const homeDir = '/home/test-user';
    const flatCwd = 'Memory_D__project-code_llm_openpowers';
    const memoryDir = `${homeDir}/.openpowers/memory/${flatCwd}`;
    const memoryFile = `${memoryDir}/changes.json`;

    const memoryData = {
      framework: 'openpowers',
      version: '1.0.0',
      cwd: '/test/project',
      changes: [
        {
          name: 'global-sync-change',
          path: 'openpowers/changes/global-sync-change',
          description: 'A change to sync',
          createdAt: '2026-05-20T00:00:00.000Z',
          updateAt: '2026-05-20T00:00:00.000Z',
          status: 'active',
          features: 2,
          todo: 0,
          artifacts: [],
          stage: {
            explore: { title: '', from: '', to: '', status: 'done', inputPath: '', outputPath: '' },
            brainstorm: { title: '', from: '', to: '', status: 'done', inputPath: '', outputPath: '' },
            propose: { title: '', from: '', to: '', status: 'done', inputPath: '', outputPath: '' },
            plan: { title: '', from: '', to: '', status: 'done', inputPath: '', outputPath: '' },
            reviewArtifacts: { title: '', from: '', to: '', status: 'done', inputPath: '', outputPath: '' },
            subAgentDev: [],
            finalize: {
              integration: [],
              codecheck: { title: '', from: '', to: '', status: 'done', inputPath: '', outputPath: '' },
              archive: { title: '', from: '', to: '', status: 'in_progress', inputPath: '', outputPath: '' },
            },
          },
        },
      ],
    };

    mockFs.setDir(memoryDir);
    mockFs.setFile(memoryFile, JSON.stringify(memoryData));

    vi.setSystemTime(new Date('2026-05-22T12:00:00Z'));

    // Act
    runChangeArchive('global-sync-change');

    // Assert: check that writeFileSync was called for the global memory file
    const writeCalls = mockFs.writeFileSync.mock.calls.map((c: unknown[]) => ({
      path: String(c[0]).replace(/\\/g, '/'),
      content: String(c[1]),
    }));

    // Find the write call for the global memory changes.json
    const memoryWrite = writeCalls.find((c: { path: string }) => c.path === memoryFile);
    expect(memoryWrite).toBeDefined();
    const writtenContent = JSON.parse(memoryWrite!.content);

    // Find the archived change entry
    const archivedChange = writtenContent.changes.find(
      (c: { name: string }) => c.name === 'global-sync-change',
    );
    expect(archivedChange).toBeDefined();

    // Verify status is 'archived'
    expect(archivedChange.status).toBe('archived');

    // Verify stage.finalize.archive.status is 'done'
    expect(archivedChange.stage?.finalize?.archive?.status).toBe('done');

    // Verify stage.finalize.archive.to is the current ISO timestamp
    expect(archivedChange.stage?.finalize?.archive?.to).toBe('2026-05-22T12:00:00.000Z');

    // Verify the archive still completed successfully (project-level write happened)
    const projectWrites = writeCalls.filter((c: { path: string }) =>
      c.path.endsWith('openpowers/changes.json') && !c.path.includes('/memory/'),
    );
    expect(projectWrites.length).toBeGreaterThan(0);
    const lastProjectWrite = projectWrites[projectWrites.length - 1];
    expect(lastProjectWrite.content).toContain('2026-05-22-global-sync-change');
  });

  it('should warn and continue when global memory changes.json does not exist', () => {
    // Arrange
    setupCompleteChange('no-global-file-change');
    mockFs.setDir(CHANGES_DIR);
    mockFs.setDir(ARCHIVE_DIR);
    setupReadDirMocks(['no-global-file-change']);

    // Do NOT create global memory changes.json

    vi.setSystemTime(new Date('2026-05-22T12:00:00Z'));

    // Act
    runChangeArchive('no-global-file-change');

    // Assert: archive completed successfully
    const writeCalls = mockFs.writeFileSync.mock.calls.map((c: unknown[]) => ({
      path: String(c[0]).replace(/\\/g, '/'),
      content: String(c[1]),
    }));
    const projectWrites = writeCalls.filter((c: { path: string }) =>
      c.path.endsWith('openpowers/changes.json') && !c.path.includes('/memory/'),
    );
    expect(projectWrites.length).toBeGreaterThan(0);
    const lastProjectWrite = projectWrites[projectWrites.length - 1];
    expect(lastProjectWrite.content).toContain('2026-05-22-no-global-file-change');

    // Assert: warning was logged about missing global memory file
    const warnCalls = mockLogger.warn.mock.calls.map((c: unknown[]) => String(c[0]));
    expect(warnCalls.some((s: string) =>
      s.includes('Global memory changes.json not found'),
    )).toBe(true);
  });

  it('should warn and continue when change is not found in global memory changes.json', () => {
    // Arrange
    setupCompleteChange('not-in-global-change');
    mockFs.setDir(CHANGES_DIR);
    mockFs.setDir(ARCHIVE_DIR);
    setupReadDirMocks(['not-in-global-change']);

    // Set up global memory changes.json WITHOUT the change being archived
    const homeDir = '/home/test-user';
    const flatCwd = 'Memory_D__project-code_llm_openpowers';
    const memoryDir = `${homeDir}/.openpowers/memory/${flatCwd}`;
    const memoryFile = `${memoryDir}/changes.json`;

    const memoryData = {
      framework: 'openpowers',
      version: '1.0.0',
      cwd: '/test/project',
      changes: [
        {
          name: 'some-other-change',
          path: 'openpowers/changes/some-other-change',
          description: 'Another change',
          createdAt: '2026-05-20T00:00:00.000Z',
          status: 'active',
          features: 1,
          todo: 0,
          artifacts: [],
        },
      ],
    };

    mockFs.setDir(memoryDir);
    mockFs.setFile(memoryFile, JSON.stringify(memoryData));

    vi.setSystemTime(new Date('2026-05-22T12:00:00Z'));

    // Act
    runChangeArchive('not-in-global-change');

    // Assert: archive completed successfully
    const writeCalls2 = mockFs.writeFileSync.mock.calls.map((c: unknown[]) => ({
      path: String(c[0]).replace(/\\/g, '/'),
      content: String(c[1]),
    }));
    const projectWrites2 = writeCalls2.filter((c: { path: string }) =>
      c.path.endsWith('openpowers/changes.json'),
    );
    expect(projectWrites2.length).toBeGreaterThan(0);
    const lastProjectWrite2 = projectWrites2[projectWrites2.length - 1];
    expect(lastProjectWrite2.content).toContain('2026-05-22-not-in-global-change');

    // Assert: warning was logged about change not found in global memory
    const warnCalls2 = mockLogger.warn.mock.calls.map((c: unknown[]) => String(c[0]));
    expect(warnCalls2.some((s: string) =>
      s.includes('not found in global memory changes.json'),
    )).toBe(true);
  });

  it('should log error and continue when global memory changes.json fails to parse', () => {
    // Arrange
    setupCompleteChange('bad-json-change');
    mockFs.setDir(CHANGES_DIR);
    mockFs.setDir(ARCHIVE_DIR);
    setupReadDirMocks(['bad-json-change']);

    // Set up global memory changes.json with malformed content
    const homeDir = '/home/test-user';
    const flatCwd = 'Memory_D__project-code_llm_openpowers';
    const memoryDir = `${homeDir}/.openpowers/memory/${flatCwd}`;
    const memoryFile = `${memoryDir}/changes.json`;

    mockFs.setDir(memoryDir);
    mockFs.setFile(memoryFile, '{ invalid json content [}');

    vi.setSystemTime(new Date('2026-05-22T12:00:00Z'));

    // Act
    runChangeArchive('bad-json-change');

    // Assert: archive completed successfully
    const writeCalls3 = mockFs.writeFileSync.mock.calls.map((c: unknown[]) => ({
      path: String(c[0]).replace(/\\/g, '/'),
      content: String(c[1]),
    }));
    const projectWrites3 = writeCalls3.filter((c: { path: string }) =>
      c.path.endsWith('openpowers/changes.json'),
    );
    expect(projectWrites3.length).toBeGreaterThan(0);
    const lastProjectWrite3 = projectWrites3[projectWrites3.length - 1];
    expect(lastProjectWrite3.content).toContain('2026-05-22-bad-json-change');

    // Assert: error was logged about parse failure
    const errorCalls = mockLogger.error.mock.calls.map((c: unknown[]) => String(c[0]));
    expect(errorCalls.some((s: string) =>
      s.includes('Failed to parse global memory changes.json'),
    )).toBe(true);
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
