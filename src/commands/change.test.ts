/**
 * @fileoverview Tests for change command module
 * @author Meiyuki <meiyukichan@163.com>
 * @copyright 2026 Meiyuki
 */

import path from 'path';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Command } from 'commander';

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
  // In-memory filesystem for mocked fs operations
  const fileSystem: Record<string, string> = {};
  const dirSet = new Set<string>();

  function setFile(pathStr: string, content: string) {
    fileSystem[pathStr.replace(/\\/g, '/')] = content;
    // Add parent dirs
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
        // Return empty array by default; individual tests set up dirs
        return [] as Array<{ name: string; isDirectory: () => boolean; isFile: () => boolean }>;
      }),
    },
  };
});

vi.mock('fs', () => ({
  default: mockFs,
}));

vi.mock('../utils/logger.js', () => ({
  logger: mockLogger,
}));

// Type placeholders for exported functions
type FormatRelativeTimeFn = (isoDate: string) => string;
type ValidateChangeNameFn = (name: string) => { valid: boolean; error?: string };
type BuildArtifactsFn = (dirPath: string) => Array<{ id: string; outputPath: string }>;
type ExtractArchiveNameFn = (dirName: string) => string;
type ComputeProgressFn = (planPath: string) => { features: number; todo: number };
type RunChangeListFn = () => void;
type RunChangeNewFn = (name: string, options: { desc: string }) => void;
type RunChangeStatusFn = (name: string) => void;
type RunChangeInstructionFn = (name: string, options: { proposal?: boolean; design?: boolean; specs?: boolean }) => void;
type RegisterChangeCommandFn = (program: Command) => void;

describe('src/commands/change.ts', () => {
  // Path constants matching the source module's absolute paths
  const CHANGES_DIR = path.join(process.cwd(), 'openpowers', 'changes');
  const ARCHIVE_DIR = path.join(process.cwd(), 'openpowers', 'archive');
  const CHANGES_JSON_PATH = path.join(process.cwd(), 'openpowers', 'changes.json');
  // Normalized versions for mock FS comparisons (backslashes → forward slashes)
  const NORM_CHANGES_DIR = CHANGES_DIR.replace(/\\/g, '/');
  const NORM_ARCHIVE_DIR = ARCHIVE_DIR.replace(/\\/g, '/');

  let formatRelativeTime: FormatRelativeTimeFn;
  let validateChangeName: ValidateChangeNameFn;
  let buildArtifacts: BuildArtifactsFn;
  let extractArchiveName: ExtractArchiveNameFn;
  let computeProgress: ComputeProgressFn;
  let runChangeList: RunChangeListFn;
  let runChangeNew: RunChangeNewFn;
  let runChangeStatus: RunChangeStatusFn;
  let registerChangeCommand: RegisterChangeCommandFn;
  let stdoutWriteSpy: ReturnType<typeof vi.spyOn>;
  let stderrWriteSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    vi.resetAllMocks();
    mockFs.reset();
    stdoutWriteSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    stderrWriteSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    vi.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('process.exit called');
    }) as never);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // =========================================================
  // Helper functions tests
  // =========================================================

  describe('formatRelativeTime', () => {
    beforeEach(async () => {
      const mod = await import('./change.js');
      formatRelativeTime = mod.formatRelativeTime;
    });

    it('should return "just now" for timestamps less than 1 minute ago', () => {
      const now = new Date();
      const recent = new Date(now.getTime() - 30 * 1000).toISOString();
      expect(formatRelativeTime(recent)).toBe('just now');
    });

    it('should return "Xm ago" for timestamps 1-59 minutes ago', () => {
      const now = new Date();
      const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000).toISOString();
      expect(formatRelativeTime(fiveMinutesAgo)).toBe('5m ago');
    });

    it('should return "Xh ago" for timestamps 1-23 hours ago', () => {
      const now = new Date();
      const threeHoursAgo = new Date(now.getTime() - 3 * 60 * 60 * 1000).toISOString();
      expect(formatRelativeTime(threeHoursAgo)).toBe('3h ago');
    });

    it('should return "Xd ago" for timestamps 1-30 days ago', () => {
      const now = new Date();
      const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
      expect(formatRelativeTime(sevenDaysAgo)).toBe('7d ago');
    });

    it('should return locale date string for timestamps older than 30 days', () => {
      const now = new Date();
      const fortyDaysAgo = new Date(now.getTime() - 40 * 24 * 60 * 60 * 1000).toISOString();
      const result = formatRelativeTime(fortyDaysAgo);
      expect(result).not.toBe('just now');
      expect(result).not.toContain('ago');
      expect(result).toBe(new Date(fortyDaysAgo).toLocaleDateString());
    });

    it('should handle boundary: exactly 1 minute returns "1m ago"', () => {
      const now = new Date();
      const oneMinuteAgo = new Date(now.getTime() - 60 * 1000).toISOString();
      expect(formatRelativeTime(oneMinuteAgo)).toBe('1m ago');
    });

    it('should handle boundary: exactly 1 hour returns "1h ago"', () => {
      const now = new Date();
      const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000).toISOString();
      expect(formatRelativeTime(oneHourAgo)).toBe('1h ago');
    });

    it('should handle boundary: exactly 1 day returns "1d ago"', () => {
      const now = new Date();
      const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
      expect(formatRelativeTime(oneDayAgo)).toBe('1d ago');
    });
  });

  describe('validateChangeName', () => {
    beforeEach(async () => {
      const mod = await import('./change.js');
      validateChangeName = mod.validateChangeName;
    });

    it('should accept valid kebab-case names', () => {
      expect(validateChangeName('my-feature')).toEqual({ valid: true });
      expect(validateChangeName('a')).toEqual({ valid: true });
      expect(validateChangeName('abc')).toEqual({ valid: true });
      expect(validateChangeName('my-feature-v2')).toEqual({ valid: true });
      expect(validateChangeName('a-b')).toEqual({ valid: true });
      expect(validateChangeName('a0-b1-c2')).toEqual({ valid: true });
    });

    it('should reject names starting with uppercase', () => {
      const result = validateChangeName('MyFeature');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('kebab-case');
    });

    it('should reject names with uppercase characters', () => {
      const result = validateChangeName('my-Feature');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('kebab-case');
    });

    it('should reject names with underscores', () => {
      const result = validateChangeName('my_feature');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('kebab-case');
    });

    it('should reject names with spaces', () => {
      const result = validateChangeName('my feature');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('kebab-case');
    });

    it('should reject names starting with a digit', () => {
      const result = validateChangeName('1feature');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('kebab-case');
    });

    it('should reject names starting with a hyphen', () => {
      const result = validateChangeName('-feature');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('kebab-case');
    });

    it('should reject names ending with a hyphen', () => {
      const result = validateChangeName('feature-');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('kebab-case');
    });

    it('should reject empty string', () => {
      const result = validateChangeName('');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('kebab-case');
    });
  });

  describe('buildArtifacts', () => {
    beforeEach(async () => {
      const mod = await import('./change.js');
      buildArtifacts = mod.buildArtifacts;
    });

    it('should return only artifacts whose files exist on disk', () => {
      // Set up only some of the artifact files
      mockFs.setFile('some/path/proposal.md', '');
      mockFs.setDir('some/path/specs');
      mockFs.setFile('some/path/plan.json', '');

      const artifacts = buildArtifacts('some/path');
      expect(artifacts.length).toBe(3);
      const ids = artifacts.map(a => a.id);
      expect(ids).toContain('proposal');
      expect(ids).toContain('specs');
      expect(ids).toContain('plan');
    });

    it('should return empty array when no artifact files exist', () => {
      const artifacts = buildArtifacts('some/path');
      expect(artifacts).toEqual([]);
    });

    it('should return all 6 artifacts when all files exist', () => {
      mockFs.setFile('some/path/proposal.md', '');
      mockFs.setFile('some/path/design.md', '');
      mockFs.setDir('some/path/specs');
      mockFs.setFile('some/path/api.yaml', '');
      mockFs.setFile('some/path/database.md', '');
      mockFs.setFile('some/path/plan.json', '');

      const artifacts = buildArtifacts('some/path');
      expect(artifacts.length).toBe(6);
    });

    it('should return outputPath relative to cwd with forward slashes', () => {
      mockFs.setFile('some/path/proposal.md', '');
      const artifacts = buildArtifacts('some/path');
      expect(artifacts[0]).toEqual({ id: 'proposal', outputPath: 'some/path/proposal.md' });
    });
  });

  describe('toRelativePath', () => {
    let toRelativePath: (absolutePath: string) => string;

    beforeEach(async () => {
      const mod = await import('./change.js');
      toRelativePath = mod.toRelativePath;
    });

    it('should convert absolute path to relative path with forward slashes', () => {
      const cwd = process.cwd();
      const absolutePath = path.join(cwd, 'openpowers', 'changes', 'my-feature');
      const result = toRelativePath(absolutePath);
      expect(result).toBe('openpowers/changes/my-feature');
    });

    it('should handle nested paths correctly', () => {
      const cwd = process.cwd();
      const absolutePath = path.join(cwd, 'openpowers', 'changes', 'my-feature', 'proposal.md');
      const result = toRelativePath(absolutePath);
      expect(result).toBe('openpowers/changes/my-feature/proposal.md');
    });

    it('should convert backslashes to forward slashes', () => {
      // Simulate a Windows-style absolute path
      const cwd = process.cwd().replace(/\//g, '\\');
      const absolutePath = `${cwd}\\openpowers\\changes\\my-feature`;
      const result = toRelativePath(absolutePath);
      expect(result).toBe('openpowers/changes/my-feature');
      expect(result).not.toContain('\\');
    });

    it('should handle archive paths correctly', () => {
      const cwd = process.cwd();
      const absolutePath = path.join(cwd, 'openpowers', 'archive', '2026-05-17-old-feature');
      const result = toRelativePath(absolutePath);
      expect(result).toBe('openpowers/archive/2026-05-17-old-feature');
    });
  });

  describe('extractArchiveName', () => {
    beforeEach(async () => {
      const mod = await import('./change.js');
      extractArchiveName = mod.extractArchiveName;
    });

    it('should strip YYYY-MM-DD- prefix from archive directory name', () => {
      expect(extractArchiveName('2026-05-17-remove-command')).toBe('remove-command');
    });

    it('should handle single-word name after date prefix', () => {
      expect(extractArchiveName('2026-01-01-feature')).toBe('feature');
    });

    it('should handle multi-word kebab-case name after date prefix', () => {
      expect(extractArchiveName('2025-12-31-my-long-feature-name')).toBe('my-long-feature-name');
    });
  });

  describe('computeProgress', () => {
    beforeEach(async () => {
      const mod = await import('./change.js');
      computeProgress = mod.computeProgress;
    });

    it('should return { features: 0, todo: 0 } when plan.json does not exist', () => {
      const result = computeProgress('/nonexistent/path/plan.json');
      expect(result).toEqual({ features: 0, todo: 0 });
    });

    it('should return { features: 0, todo: 0 } when plan.json is not valid JSON', () => {
      mockFs.setFile('invalid-plan.json', 'not json');
      const result = computeProgress('invalid-plan.json');
      expect(result).toEqual({ features: 0, todo: 0 });
    });

    it('should return counts from valid plan.json', () => {
      mockFs.setFile('valid-plan.json', JSON.stringify([
        { id: 'task1', status: 'done' },
        { id: 'task2', status: 'todo' },
        { id: 'task3', status: 'in_progress' },
      ]));
      const result = computeProgress('valid-plan.json');
      expect(result).toEqual({ features: 3, todo: 2 });
    });

    it('should return { features: 0, todo: 0 } when plan.json is not an array', () => {
      mockFs.setFile('object-plan.json', JSON.stringify({ key: 'value' }));
      const result = computeProgress('object-plan.json');
      expect(result).toEqual({ features: 0, todo: 0 });
    });
  });

  // =========================================================
  // Sync logic tests (loadOrCreateChangesJson, syncChangesJson)
  // =========================================================

  describe('loadOrCreateChangesJson', () => {
    beforeEach(async () => {
      const mod = await import('./change.js');
      formatRelativeTime = mod.formatRelativeTime;
    });

    it('should create default changes.json if it does not exist', async () => {
      const mod = await import('./change.js');
      const { loadOrCreateChangesJson } = mod;
      const data = loadOrCreateChangesJson();
      expect(data).toEqual({
        framework: 'openpowers',
        version: '1.0.0',
        changes: [],
        archive: [],
      });
      // Verify it wrote the file
      expect(mockFs.writeFileSync).toHaveBeenCalled();
    });

    it('should load existing changes.json and fill missing fields', async () => {
      // Mock the module for a "fresh" call with an existing file
      mockFs.setFile(CHANGES_JSON_PATH, JSON.stringify({
        changes: [{ name: 'existing', path: 'openpowers/changes/existing' }],
      }));
      // Re-import to get fresh module state
      const mod = await import('./change.js');
      const { loadOrCreateChangesJson } = mod;
      const data = loadOrCreateChangesJson();
      expect(data.framework).toBe('openpowers');
      expect(data.version).toBe('1.0.0');
      expect(data.changes.length).toBe(1);
      expect(data.archive).toEqual([]);
    });

    it('should preserve existing framework and version when already set', async () => {
      mockFs.setFile(CHANGES_JSON_PATH, JSON.stringify({
        framework: 'CustomFW',
        version: '2.0.0',
        changes: [],
        archive: [],
      }));
      // Clear mock to see fresh calls
      mockFs.writeFileSync.mockClear();
      const mod = await import('./change.js');
      const { loadOrCreateChangesJson } = mod;
      const data = loadOrCreateChangesJson();
      expect(data.framework).toBe('CustomFW');
      expect(data.version).toBe('2.0.0');
      // Should NOT write (already exists)
      expect(mockFs.writeFileSync).not.toHaveBeenCalled();
    });
  });

  describe('syncChangesJson', () => {
    it('should work with empty changes and archive directories', async () => {
      const mod = await import('./change.js');
      const { syncChangesJson } = mod;
      const data = syncChangesJson();
      expect(data.changes).toEqual([]);
      expect(data.archive).toEqual([]);
    });

    it('should sync active changes from directory scan', async () => {
      // Set up mock FS state
      const mod = await import('./change.js');
      const { syncChangesJson } = mod;
      // Mock readdirSync to return directories for changes/
      // We need to re-mock readdirSync after module load
      // Since the module has already been imported, we need clever mock setup
      // For now, set up directories and files before calling
      mockFs.setDir(CHANGES_DIR);
      mockFs.setDir(path.join(CHANGES_DIR, 'my-feature'));
      mockFs.setFile(path.join(CHANGES_DIR, 'my-feature', 'plan.json'), JSON.stringify([
        { id: 't1', status: 'done' },
        { id: 't2', status: 'todo' },
      ]));

      // Override readdirSync for this test
      mockFs.readdirSync.mockImplementation((p: string, _options?: unknown) => {
        const normalized = p.replace(/\\/g, '/');
        if (normalized === NORM_CHANGES_DIR) {
          return [
            { name: 'my-feature', isDirectory: () => true, isFile: () => false },
            { name: 'archive', isDirectory: () => true, isFile: () => false },
          ] as DirEntry[];
        }
        if (normalized === NORM_ARCHIVE_DIR) {
          return [] as DirEntry[];
        }
        return [] as DirEntry[];
      });

      const data = syncChangesJson();
      expect(data.changes.length).toBe(1);
      const entry = data.changes[0];
      expect(entry.name).toBe('my-feature');
      expect(entry.features).toBe(2);
      expect(entry.todo).toBe(1);
      expect(entry.artifacts).toBeDefined();
      expect((entry.artifacts as Array<unknown>).length).toBe(1);
      expect(entry.path).toBe('openpowers/changes/my-feature');
    });

    it('should sync archived changes with closedAt', async () => {
      const mod = await import('./change.js');
      const { syncChangesJson } = mod;
      mockFs.setDir(CHANGES_DIR);
      mockFs.setDir(ARCHIVE_DIR);
      mockFs.setDir(path.join(ARCHIVE_DIR, '2026-05-17-old-feature'));

      mockFs.readdirSync.mockImplementation((p: string, _options?: unknown) => {
        const normalized = p.replace(/\\/g, '/');
        if (normalized === NORM_CHANGES_DIR) {
          return [
            { name: 'archive', isDirectory: () => true, isFile: () => false },
          ] as DirEntry[];
        }
        if (normalized === NORM_ARCHIVE_DIR) {
          return [
            { name: '2026-05-17-old-feature', isDirectory: () => true, isFile: () => false },
          ] as DirEntry[];
        }
        return [] as DirEntry[];
      });

      const data = syncChangesJson();
      expect(data.archive.length).toBe(1);
      expect(data.archive[0].name).toBe('old-feature');
      expect(data.archive[0].closedAt).toBeDefined();
      expect(data.archive[0].path).toBe('openpowers/archive/2026-05-17-old-feature');
    });

    it('should skip dot-prefixed directories', async () => {
      const mod = await import('./change.js');
      const { syncChangesJson } = mod;
      mockFs.setDir(CHANGES_DIR);

      mockFs.readdirSync.mockImplementation((p: string, _options?: unknown) => {
        const normalized = p.replace(/\\/g, '/');
        if (normalized === NORM_CHANGES_DIR) {
          return [
            { name: '.git', isDirectory: () => true, isFile: () => false },
            { name: '.hidden', isDirectory: () => true, isFile: () => false },
            { name: 'archive', isDirectory: () => true, isFile: () => false },
          ] as DirEntry[];
        }
        if (normalized === NORM_ARCHIVE_DIR) {
          return [] as DirEntry[];
        }
        return [] as DirEntry[];
      });

      const data = syncChangesJson();
      expect(data.changes.length).toBe(0); // Dot dirs excluded, archive excluded from changes
    });

    it('should sync both active and archive changes simultaneously', async () => {
      const mod = await import('./change.js');
      const { syncChangesJson } = mod;

      // Set up one active change
      mockFs.setDir(CHANGES_DIR);
      mockFs.setDir(path.join(CHANGES_DIR, 'my-feature'));
      mockFs.setFile(path.join(CHANGES_DIR, 'my-feature', 'plan.json'), JSON.stringify([
        { id: 't1', status: 'done' },
        { id: 't2', status: 'todo' },
      ]));

      // Set up one archived change
      mockFs.setDir(ARCHIVE_DIR);
      mockFs.setDir(path.join(ARCHIVE_DIR, '2026-05-17-old-feature'));
      mockFs.setFile(path.join(ARCHIVE_DIR, '2026-05-17-old-feature', 'plan.json'), JSON.stringify([
        { id: 't1', status: 'done' },
      ]));

      mockFs.readdirSync.mockImplementation((p: string, _options?: unknown) => {
        const normalized = p.replace(/\\/g, '/');
        if (normalized === NORM_CHANGES_DIR) {
          return [
            { name: 'my-feature', isDirectory: () => true, isFile: () => false },
            { name: 'archive', isDirectory: () => true, isFile: () => false },
          ] as DirEntry[];
        }
        if (normalized === NORM_ARCHIVE_DIR) {
          return [
            { name: '2026-05-17-old-feature', isDirectory: () => true, isFile: () => false },
          ] as DirEntry[];
        }
        return [] as DirEntry[];
      });

      const data = syncChangesJson();

      // Both arrays should be populated
      expect(data.changes.length).toBe(1);
      expect(data.changes[0].name).toBe('my-feature');
      expect(data.changes[0].path).toBe('openpowers/changes/my-feature');
      expect(data.archive.length).toBe(1);
      expect(data.archive[0].name).toBe('old-feature');
      expect(data.archive[0].path).toBe('openpowers/archive/2026-05-17-old-feature');
    });

    it('should remove stale entries not present on filesystem', async () => {
      // First create a changes.json with a stale entry
      mockFs.setFile(CHANGES_JSON_PATH, JSON.stringify({
        framework: 'openpowers',
        version: '1.0.0',
        changes: [{ name: 'stale-change', path: 'openpowers/changes/stale-change' }],
        archive: [],
      }));
      mockFs.setDir(CHANGES_DIR);

      mockFs.readdirSync.mockImplementation((p: string, _options?: unknown) => {
        const normalized = p.replace(/\\/g, '/');
        if (normalized === NORM_CHANGES_DIR) {
          return [
            { name: 'archive', isDirectory: () => true, isFile: () => false },
          ] as DirEntry[];
        }
        if (normalized === NORM_ARCHIVE_DIR) {
          return [] as DirEntry[];
        }
        return [] as DirEntry[];
      });

      const mod = await import('./change.js');
      const { syncChangesJson } = mod;
      const data = syncChangesJson();
      expect(data.changes.length).toBe(0); // stale entry removed
    });
  });

  // =========================================================
  // Action function tests
  // =========================================================

  describe('runChangeList', () => {
    beforeEach(async () => {
      const mod = await import('./change.js');
      runChangeList = mod.runChangeList;
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
        if (normalized === NORM_ARCHIVE_DIR) {
          return [] as DirEntry[];
        }
        return [] as DirEntry[];
      });

      runChangeList();

      const stdoutCalls = stdoutWriteSpy.mock.calls.map((c: unknown[]) => String(c[0]));
      // Should contain header columns
      expect(stdoutCalls.some((s: unknown) => String(s).includes('Name'))).toBe(true);
      expect(stdoutCalls.some((s: unknown) => String(s).includes('Progress'))).toBe(true);
      expect(stdoutCalls.some((s: unknown) => String(s).includes('Description'))).toBe(true);
      // Should contain change name
      expect(stdoutCalls.some((s: unknown) => String(s).includes('my-feature'))).toBe(true);
      // Should contain progress
      expect(stdoutCalls.some((s: unknown) => String(s).includes('1/2 features'))).toBe(true);
    });
  });

  describe('runChangeNew', () => {
    beforeEach(async () => {
      const mod = await import('./change.js');
      runChangeNew = mod.runChangeNew;
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

    it('should output message and skip when change name already exists in changes.json', () => {
      // Pre-seed changes.json with an existing entry for the same name
      mockFs.setFile(CHANGES_JSON_PATH, JSON.stringify({
        framework: 'openpowers',
        version: '1.0.0',
        changes: [
          { name: 'dup-feature', path: 'openpowers/changes/dup-feature', description: 'Old', createdAt: '2026-01-01T00:00:00.000Z', features: 0, todo: 0 },
        ],
        archive: [],
      }));
      mockFs.setDir(path.join(CHANGES_DIR, 'dup-feature'));

      runChangeNew('dup-feature', { desc: 'New duplicate' });

      // Should output duplicate message and not create a new entry
      const stdoutCalls = stdoutWriteSpy.mock.calls.map((c: unknown[]) => String(c[0]));
      expect(stdoutCalls.some((s: unknown) => String(s).includes("already exists"))).toBe(true);
      // Should NOT have written to changes.json since it returned early
      expect(mockFs.writeFileSync).not.toHaveBeenCalled();
    });
  });

  describe('computeArtifactStatus', () => {
    let computeArtifactStatus: (changeDirPath: string) => Array<{ id: string; outputPath: string; status: string }>;

    beforeEach(async () => {
      const mod = await import('./change.js');
      computeArtifactStatus = mod.computeArtifactStatus;
    });

    it('should return proposal=ready, design=blocked, specs=blocked when proposal.md does not exist', () => {
      // No files set up - proposal.md doesn't exist
      const artifacts = computeArtifactStatus('some/change');
      // Core artifacts always appear in output
      expect(artifacts.length).toBe(3);
      const proposal = artifacts.find(a => a.id === 'proposal');
      const design = artifacts.find(a => a.id === 'design');
      const specs = artifacts.find(a => a.id === 'specs');
      expect(proposal!.status).toBe('ready');
      expect(proposal!.outputPath).toBe('proposal.md');
      expect(design!.status).toBe('blocked');
      expect(design!.outputPath).toBe('design.md');
      expect(specs!.status).toBe('blocked');
      expect(specs!.outputPath).toBe('specs/**/*.md');
    });

    it('should return proposal=done, design=ready, specs=blocked when only proposal.md exists', () => {
      mockFs.setFile('some/change/proposal.md', '');
      const artifacts = computeArtifactStatus('some/change');
      expect(artifacts.length).toBe(3);
      const proposal = artifacts.find(a => a.id === 'proposal');
      const design = artifacts.find(a => a.id === 'design');
      const specs = artifacts.find(a => a.id === 'specs');
      expect(proposal!.status).toBe('done');
      expect(design!.status).toBe('ready');
      expect(specs!.status).toBe('blocked');
    });

    it('should return proposal=done, design=done, specs=ready when proposal.md and design.md exist but no specs', () => {
      mockFs.setFile('some/change/proposal.md', '');
      mockFs.setFile('some/change/design.md', '');
      const artifacts = computeArtifactStatus('some/change');
      expect(artifacts.length).toBe(3);
      const proposal = artifacts.find(a => a.id === 'proposal');
      const design = artifacts.find(a => a.id === 'design');
      const specs = artifacts.find(a => a.id === 'specs');
      expect(proposal!.status).toBe('done');
      expect(design!.status).toBe('done');
      expect(specs!.status).toBe('ready');
    });

    it('should return all three done when proposal.md, design.md, and specs/*.md exist', () => {
      mockFs.setFile('some/change/proposal.md', '');
      mockFs.setFile('some/change/design.md', '');
      mockFs.setDir('some/change/specs');
      mockFs.setFile('some/change/specs/my-spec.md', '');
      // Override readdirSync to return .md files inside specs/
      mockFs.readdirSync.mockImplementation((p: string, _options?: unknown) => {
        const normalized = p.replace(/\\/g, '/');
        if (normalized === 'some/change/specs') {
          return [
            { name: 'my-spec.md', isDirectory: () => false, isFile: () => true },
          ] as DirEntry[];
        }
        return [] as DirEntry[];
      });
      const artifacts = computeArtifactStatus('some/change');
      expect(artifacts.length).toBe(3);
      const proposal = artifacts.find(a => a.id === 'proposal');
      const design = artifacts.find(a => a.id === 'design');
      const specs = artifacts.find(a => a.id === 'specs');
      expect(proposal!.status).toBe('done');
      expect(design!.status).toBe('done');
      expect(specs!.status).toBe('done');
    });

    it('should assign done to non-core artifacts (api, database, plan) when present', () => {
      mockFs.setFile('some/change/proposal.md', '');
      mockFs.setFile('some/change/design.md', '');
      mockFs.setDir('some/change/specs');
      mockFs.setFile('some/change/specs/my-spec.md', '');
      mockFs.setFile('some/change/api.yaml', '');
      mockFs.setFile('some/change/database.md', '');
      mockFs.setFile('some/change/plan.json', '');
      // Override readdirSync to return .md files inside specs/
      mockFs.readdirSync.mockImplementation((p: string, _options?: unknown) => {
        const normalized = p.replace(/\\/g, '/');
        if (normalized === 'some/change/specs') {
          return [
            { name: 'my-spec.md', isDirectory: () => false, isFile: () => true },
          ] as DirEntry[];
        }
        return [] as DirEntry[];
      });
      const artifacts = computeArtifactStatus('some/change');
      expect(artifacts.length).toBe(6);
      const api = artifacts.find(a => a.id === 'api');
      const database = artifacts.find(a => a.id === 'database');
      const plan = artifacts.find(a => a.id === 'plan');
      expect(api!.status).toBe('done');
      expect(database!.status).toBe('done');
      expect(plan!.status).toBe('done');
    });

    it('should use change-relative outputPath with forward slashes', () => {
      mockFs.setFile('some/change/proposal.md', '');
      mockFs.setFile('some/change/api.yaml', '');
      const artifacts = computeArtifactStatus('some/change');
      const proposal = artifacts.find(a => a.id === 'proposal');
      const api = artifacts.find(a => a.id === 'api');
      expect(proposal!.outputPath).toBe('proposal.md');
      expect(api!.outputPath).toBe('api.yaml');
    });

    it('should return specs=ready when specs dir exists but has no .md files', () => {
      mockFs.setFile('some/change/proposal.md', '');
      mockFs.setFile('some/change/design.md', '');
      mockFs.setDir('some/change/specs');
      // No .md files in specs dir - readdirSync returns empty
      const artifacts = computeArtifactStatus('some/change');
      expect(artifacts.length).toBe(3); // proposal, design, specs all exist on disk (specs dir exists)
      const proposal = artifacts.find(a => a.id === 'proposal');
      const design = artifacts.find(a => a.id === 'design');
      const specs = artifacts.find(a => a.id === 'specs');
      expect(proposal!.status).toBe('done');
      expect(design!.status).toBe('done');
      expect(specs!.status).toBe('ready');
    });
  });

  describe('runChangeStatus', () => {
    beforeEach(async () => {
      const mod = await import('./change.js');
      runChangeStatus = mod.runChangeStatus;
    });

    it('should output JSON with artifact status for an active change', () => {
      mockFs.setDir(CHANGES_DIR);
      mockFs.setDir(path.join(CHANGES_DIR, 'my-feature'));
      mockFs.setFile(path.join(CHANGES_DIR, 'my-feature', 'proposal.md'), '');
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
        if (normalized === NORM_ARCHIVE_DIR) {
          return [] as DirEntry[];
        }
        return [] as DirEntry[];
      });

      runChangeStatus('my-feature');

      const stdoutCalls = stdoutWriteSpy.mock.calls.map((c: unknown[]) => String(c[0]));
      const output = stdoutCalls[stdoutCalls.length - 1];
      const parsed = JSON.parse(output);
      expect(parsed.name).toBe('my-feature');
      expect(parsed.location).toBe('changes');
      expect(parsed.isComplete).toBe(false);
      expect(parsed.artifacts).toBeDefined();
      // Core artifacts always included: proposal=done, design=ready, specs=blocked + plan=done
      expect(parsed.artifacts.length).toBe(4);
      const proposal = parsed.artifacts.find((a: { id: string }) => a.id === 'proposal');
      expect(proposal.status).toBe('done');
      expect(proposal.outputPath).toBe('proposal.md');
    });

    it('should output isComplete=true when all core artifacts are done', () => {
      mockFs.setDir(CHANGES_DIR);
      mockFs.setDir(path.join(CHANGES_DIR, 'complete-feature'));
      mockFs.setFile(path.join(CHANGES_DIR, 'complete-feature', 'proposal.md'), '');
      mockFs.setFile(path.join(CHANGES_DIR, 'complete-feature', 'design.md'), '');
      mockFs.setDir(path.join(CHANGES_DIR, 'complete-feature', 'specs'));
      mockFs.setFile(path.join(CHANGES_DIR, 'complete-feature', 'specs', 'my-spec.md'), '');

      mockFs.readdirSync.mockImplementation((p: string, _options?: unknown) => {
        const normalized = p.replace(/\\/g, '/');
        if (normalized === NORM_CHANGES_DIR) {
          return [
            { name: 'complete-feature', isDirectory: () => true, isFile: () => false },
            { name: 'archive', isDirectory: () => true, isFile: () => false },
          ] as DirEntry[];
        }
        if (normalized === NORM_ARCHIVE_DIR) {
          return [] as DirEntry[];
        }
        // Return .md files for specs dir
        const specsDirNorm = path.join(CHANGES_DIR, 'complete-feature', 'specs').replace(/\\/g, '/');
        if (normalized === specsDirNorm) {
          return [
            { name: 'my-spec.md', isDirectory: () => false, isFile: () => true },
          ] as DirEntry[];
        }
        return [] as DirEntry[];
      });

      runChangeStatus('complete-feature');

      const stdoutCalls = stdoutWriteSpy.mock.calls.map((c: unknown[]) => String(c[0]));
      const output = stdoutCalls[stdoutCalls.length - 1];
      const parsed = JSON.parse(output);
      expect(parsed.isComplete).toBe(true);
      expect(parsed.location).toBe('changes');
    });

    it('should output isComplete=false when no features exist', () => {
      mockFs.setDir(CHANGES_DIR);
      mockFs.setDir(path.join(CHANGES_DIR, 'empty-feature'));

      mockFs.readdirSync.mockImplementation((p: string, _options?: unknown) => {
        const normalized = p.replace(/\\/g, '/');
        if (normalized === NORM_CHANGES_DIR) {
          return [
            { name: 'empty-feature', isDirectory: () => true, isFile: () => false },
            { name: 'archive', isDirectory: () => true, isFile: () => false },
          ] as DirEntry[];
        }
        if (normalized === NORM_ARCHIVE_DIR) {
          return [] as DirEntry[];
        }
        return [] as DirEntry[];
      });

      runChangeStatus('empty-feature');

      const stdoutCalls = stdoutWriteSpy.mock.calls.map((c: unknown[]) => String(c[0]));
      const output = stdoutCalls[stdoutCalls.length - 1];
      const parsed = JSON.parse(output);
      expect(parsed.isComplete).toBe(false);
    });

    it('should error when change name not found', () => {
      mockFs.readdirSync.mockImplementation(() => [] as DirEntry[]);

      expect(() => runChangeStatus('nonexistent')).toThrow('process.exit called');
      expect(process.exit).toHaveBeenCalledWith(1);
    });

    it('should search archive for change if not found in active changes', () => {
      mockFs.setDir(CHANGES_DIR);
      mockFs.setDir(ARCHIVE_DIR);
      mockFs.setDir(path.join(ARCHIVE_DIR, '2026-01-01-archived-feature'));

      mockFs.readdirSync.mockImplementation((p: string, _options?: unknown) => {
        const normalized = p.replace(/\\/g, '/');
        if (normalized === NORM_CHANGES_DIR) {
          return [
            { name: 'archive', isDirectory: () => true, isFile: () => false },
          ] as DirEntry[];
        }
        if (normalized === NORM_ARCHIVE_DIR) {
          return [
            { name: '2026-01-01-archived-feature', isDirectory: () => true, isFile: () => false },
          ] as DirEntry[];
        }
        return [] as DirEntry[];
      });

      runChangeStatus('archived-feature');

      const stdoutCalls = stdoutWriteSpy.mock.calls.map((c: unknown[]) => String(c[0]));
      const output = stdoutCalls[stdoutCalls.length - 1];
      const parsed = JSON.parse(output);
      expect(parsed.name).toBe('archived-feature');
      expect(parsed.location).toBe('archive');
    });
  });

  // =========================================================
  // runChangeInstruction tests
  // =========================================================

  describe('runChangeInstruction', () => {
    let runChangeInstruction: RunChangeInstructionFn;

    beforeEach(async () => {
      const mod = await import('./change.js');
      runChangeInstruction = mod.runChangeInstruction;
    });

    it('should return proposal instruction with filled changeName and outputPath', () => {
      // Set up the proposal template file in mock fs
      const templatePath = path.join(process.cwd(), 'data', 'proposal-template.json');
      mockFs.setFile(templatePath, JSON.stringify({
        changeName: '[change-name]',
        artifactId: 'proposal',
        outputPath: 'openspec/changes/[change-name]/proposal.md',
        description: 'Initial proposal document outlining the change',
        instruction: 'Create the proposal',
        template: '## Why',
        dependencies: [],
      }));

      runChangeInstruction('my-feature', { proposal: true });

      const stdoutCalls = stdoutWriteSpy.mock.calls.map((c: unknown[]) => String(c[0]));
      const output = stdoutCalls[stdoutCalls.length - 1];
      const parsed = JSON.parse(output);
      expect(parsed.changeName).toBe('my-feature');
      expect(parsed.outputPath).toBe('openspec/changes/my-feature/proposal.md');
    });

    it('should return proposal instruction with empty dependencies array', () => {
      const templatePath = path.join(process.cwd(), 'data', 'proposal-template.json');
      mockFs.setFile(templatePath, JSON.stringify({
        changeName: '[change-name]',
        artifactId: 'proposal',
        outputPath: 'openspec/changes/[change-name]/proposal.md',
        description: 'Initial proposal document outlining the change',
        instruction: 'Create the proposal',
        template: '## Why',
        dependencies: [],
      }));

      runChangeInstruction('my-feature', { proposal: true });

      const stdoutCalls = stdoutWriteSpy.mock.calls.map((c: unknown[]) => String(c[0]));
      const output = stdoutCalls[stdoutCalls.length - 1];
      const parsed = JSON.parse(output);
      expect(parsed.dependencies).toEqual([]);
    });

    it('should preserve static fields from template for --proposal', () => {
      const templatePath = path.join(process.cwd(), 'data', 'proposal-template.json');
      mockFs.setFile(templatePath, JSON.stringify({
        changeName: '[change-name]',
        artifactId: 'proposal',
        outputPath: 'openspec/changes/[change-name]/proposal.md',
        description: 'Initial proposal document outlining the change',
        instruction: 'Create the proposal',
        template: '## Why',
        dependencies: [],
      }));

      runChangeInstruction('my-feature', { proposal: true });

      const stdoutCalls = stdoutWriteSpy.mock.calls.map((c: unknown[]) => String(c[0]));
      const output = stdoutCalls[stdoutCalls.length - 1];
      const parsed = JSON.parse(output);
      expect(parsed.artifactId).toBe('proposal');
      expect(parsed.description).toBe('Initial proposal document outlining the change');
      expect(parsed.instruction).toBe('Create the proposal');
      expect(parsed.template).toBe('## Why');
    });

    it('should return design instruction with proposal dependency done when proposal.md exists', () => {
      const templatePath = path.join(process.cwd(), 'data', 'design-template.json');
      mockFs.setFile(templatePath, JSON.stringify({
        changeName: '[change-name]',
        artifactId: 'design',
        outputPath: 'openspec/changes/[change-name]/design.md',
        description: 'Technical design document with implementation details',
        instruction: 'Create the design',
        template: '## Context',
        dependencies: [
          { id: 'proposal', done: true, path: 'proposal.md', description: 'Initial proposal document outlining the change' },
        ],
      }));
      // Set up proposal.md to exist
      const proposalPath = path.join(process.cwd(), 'openspec', 'changes', 'my-feature', 'proposal.md');
      mockFs.setFile(proposalPath, '');

      runChangeInstruction('my-feature', { design: true });

      const stdoutCalls = stdoutWriteSpy.mock.calls.map((c: unknown[]) => String(c[0]));
      const output = stdoutCalls[stdoutCalls.length - 1];
      const parsed = JSON.parse(output);
      expect(parsed.artifactId).toBe('design');
      expect(parsed.outputPath).toBe('openspec/changes/my-feature/design.md');
      expect(parsed.dependencies.length).toBe(1);
      expect(parsed.dependencies[0].id).toBe('proposal');
      expect(parsed.dependencies[0].done).toBe(true);
    });

    it('should return design instruction with proposal dependency not done when proposal.md is missing', () => {
      const templatePath = path.join(process.cwd(), 'data', 'design-template.json');
      mockFs.setFile(templatePath, JSON.stringify({
        changeName: '[change-name]',
        artifactId: 'design',
        outputPath: 'openspec/changes/[change-name]/design.md',
        description: 'Technical design document with implementation details',
        instruction: 'Create the design',
        template: '## Context',
        dependencies: [
          { id: 'proposal', done: true, path: 'proposal.md', description: 'Initial proposal document outlining the change' },
        ],
      }));
      // Do NOT set up proposal.md

      runChangeInstruction('my-feature', { design: true });

      const stdoutCalls = stdoutWriteSpy.mock.calls.map((c: unknown[]) => String(c[0]));
      const output = stdoutCalls[stdoutCalls.length - 1];
      const parsed = JSON.parse(output);
      expect(parsed.dependencies[0].done).toBe(false);
    });

    it('should return specs instruction with both deps done when files exist', () => {
      const templatePath = path.join(process.cwd(), 'data', 'specs-template.json');
      mockFs.setFile(templatePath, JSON.stringify({
        changeName: '[change-name]',
        artifactId: 'specs',
        outputPath: 'openspec/changes/[change-name]/specs/**/*.md',
        description: 'Detailed specifications for the change',
        instruction: 'Create the specs',
        template: '## ADDED Requirements',
        dependencies: [
          { id: 'proposal', done: true, path: 'proposal.md', description: 'Initial proposal document outlining the change' },
          { id: 'design', done: false, path: 'design.md', description: 'Technical design document with implementation details' },
        ],
      }));
      // Set up both files
      mockFs.setFile(path.join(process.cwd(), 'openspec', 'changes', 'my-feature', 'proposal.md'), '');
      mockFs.setFile(path.join(process.cwd(), 'openspec', 'changes', 'my-feature', 'design.md'), '');

      runChangeInstruction('my-feature', { specs: true });

      const stdoutCalls = stdoutWriteSpy.mock.calls.map((c: unknown[]) => String(c[0]));
      const output = stdoutCalls[stdoutCalls.length - 1];
      const parsed = JSON.parse(output);
      expect(parsed.artifactId).toBe('specs');
      expect(parsed.outputPath).toBe('openspec/changes/my-feature/specs/**/*.md');
      expect(parsed.dependencies.length).toBe(2);
      expect(parsed.dependencies[0].done).toBe(true);
      expect(parsed.dependencies[1].done).toBe(true);
    });

    it('should return specs instruction with design dep not done when design.md missing', () => {
      const templatePath = path.join(process.cwd(), 'data', 'specs-template.json');
      mockFs.setFile(templatePath, JSON.stringify({
        changeName: '[change-name]',
        artifactId: 'specs',
        outputPath: 'openspec/changes/[change-name]/specs/**/*.md',
        description: 'Detailed specifications for the change',
        instruction: 'Create the specs',
        template: '## ADDED Requirements',
        dependencies: [
          { id: 'proposal', done: true, path: 'proposal.md', description: 'Initial proposal document outlining the change' },
          { id: 'design', done: false, path: 'design.md', description: 'Technical design document with implementation details' },
        ],
      }));
      // Only set up proposal.md, not design.md
      mockFs.setFile(path.join(process.cwd(), 'openspec', 'changes', 'my-feature', 'proposal.md'), '');

      runChangeInstruction('my-feature', { specs: true });

      const stdoutCalls = stdoutWriteSpy.mock.calls.map((c: unknown[]) => String(c[0]));
      const output = stdoutCalls[stdoutCalls.length - 1];
      const parsed = JSON.parse(output);
      expect(parsed.dependencies[0].done).toBe(true);
      expect(parsed.dependencies[1].done).toBe(false);
    });

    it('should preserve dependency static fields for --specs', () => {
      const templatePath = path.join(process.cwd(), 'data', 'specs-template.json');
      mockFs.setFile(templatePath, JSON.stringify({
        changeName: '[change-name]',
        artifactId: 'specs',
        outputPath: 'openspec/changes/[change-name]/specs/**/*.md',
        description: 'Detailed specifications for the change',
        instruction: 'Create the specs',
        template: '## ADDED Requirements',
        dependencies: [
          { id: 'proposal', done: true, path: 'proposal.md', description: 'Initial proposal document outlining the change' },
          { id: 'design', done: false, path: 'design.md', description: 'Technical design document with implementation details' },
        ],
      }));
      mockFs.setFile(path.join(process.cwd(), 'openspec', 'changes', 'my-feature', 'proposal.md'), '');
      mockFs.setFile(path.join(process.cwd(), 'openspec', 'changes', 'my-feature', 'design.md'), '');

      runChangeInstruction('my-feature', { specs: true });

      const stdoutCalls = stdoutWriteSpy.mock.calls.map((c: unknown[]) => String(c[0]));
      const output = stdoutCalls[stdoutCalls.length - 1];
      const parsed = JSON.parse(output);
      expect(parsed.dependencies[0].id).toBe('proposal');
      expect(parsed.dependencies[0].path).toBe('proposal.md');
      expect(parsed.dependencies[0].description).toBe('Initial proposal document outlining the change');
      expect(parsed.dependencies[1].id).toBe('design');
      expect(parsed.dependencies[1].path).toBe('design.md');
      expect(parsed.dependencies[1].description).toBe('Technical design document with implementation details');
    });

    it('should exit with error on invalid change name', () => {
      expect(() => runChangeInstruction('InvalidName', { proposal: true })).toThrow('process.exit called');
    });

    it('should exit with error when no flag is provided', () => {
      expect(() => runChangeInstruction('my-feature', {})).toThrow('process.exit called');
    });

    it('should exit with error when multiple flags are provided', () => {
      expect(() => runChangeInstruction('my-feature', { proposal: true, design: true })).toThrow('process.exit called');
    });
  });

  // =========================================================
  // Commander registration tests
  // =========================================================

  describe('registerChangeCommand', () => {
    beforeEach(async () => {
      const mod = await import('./change.js');
      registerChangeCommand = mod.registerChangeCommand;
    });

    it('should export registerChangeCommand as a named function', () => {
      expect(registerChangeCommand).toBeDefined();
      expect(typeof registerChangeCommand).toBe('function');
    });

    it('should register change as a parent command with four subcommands', () => {
      const program = new Command();
      registerChangeCommand(program);

      const changeCmd = program.commands.find((cmd) => cmd.name() === 'change');
      expect(changeCmd).toBeDefined();

      const subCommandNames = changeCmd!.commands.map((cmd) => cmd.name());
      expect(subCommandNames).toContain('list');
      expect(subCommandNames).toContain('new');
      expect(subCommandNames).toContain('status');
      expect(subCommandNames).toContain('instruction');
    });

    it('should register new subcommand with required --desc option', () => {
      const program = new Command();
      registerChangeCommand(program);

      const changeCmd = program.commands.find((cmd) => cmd.name() === 'change');
      const newCmd = changeCmd!.commands.find((cmd) => cmd.name() === 'new');
      expect(newCmd).toBeDefined();
      // Commander v14+ uses requiredOption
      const descOption = newCmd!.options.find((o) => o.long === '--desc');
      expect(descOption).toBeDefined();
      expect(descOption!.mandatory).toBe(true);
    });
  });
});
