/**
 * @fileoverview Tests for change/shared.ts utilities module
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

vi.mock('../../utils/logger.js', () => ({
  logger: mockLogger,
}));

// Type placeholders for exported functions
type FormatRelativeTimeFn = (isoDate: string) => string;
type ValidateChangeNameFn = (name: string) => { valid: boolean; error?: string };
type BuildArtifactsFn = (dirPath: string) => Array<{ id: string; outputPath: string }>;
type ExtractArchiveNameFn = (dirName: string) => string;
type ComputeProgressFn = (planPath: string) => { features: number; todo: number };
type ToRelativePathFn = (absolutePath: string) => string;

describe('src/commands/change/shared.ts', () => {
  // Path constants matching the source module's absolute paths
  const CHANGES_DIR = path.join(process.cwd(), 'openpowers', 'changes');
  const ARCHIVE_DIR = path.join(process.cwd(), 'openpowers', 'archive');
  const CHANGES_JSON_PATH = path.join(process.cwd(), 'openpowers', 'changes.json');
  // Normalized versions for mock FS comparisons (backslashes to forward slashes)
  const NORM_CHANGES_DIR = CHANGES_DIR.replace(/\\/g, '/');
  const NORM_ARCHIVE_DIR = ARCHIVE_DIR.replace(/\\/g, '/');

  beforeEach(() => {
    vi.resetAllMocks();
    mockFs.reset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // =========================================================
  // Helper functions tests
  // =========================================================

  describe('toRelativePath', () => {
    let toRelativePath: ToRelativePathFn;

    beforeEach(async () => {
      const mod = await import('./shared.js');
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

  describe('formatRelativeTime', () => {
    let formatRelativeTime: FormatRelativeTimeFn;

    beforeEach(async () => {
      const mod = await import('./shared.js');
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
    let validateChangeName: ValidateChangeNameFn;

    beforeEach(async () => {
      const mod = await import('./shared.js');
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
    let buildArtifacts: BuildArtifactsFn;

    beforeEach(async () => {
      const mod = await import('./shared.js');
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

  describe('extractArchiveName', () => {
    let extractArchiveName: ExtractArchiveNameFn;

    beforeEach(async () => {
      const mod = await import('./shared.js');
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
    let computeProgress: ComputeProgressFn;

    beforeEach(async () => {
      const mod = await import('./shared.js');
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
    it('should create default changes.json if it does not exist', async () => {
      const mod = await import('./shared.js');
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
      const mod = await import('./shared.js');
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
      const mod = await import('./shared.js');
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
      const mod = await import('./shared.js');
      const { syncChangesJson } = mod;
      const data = syncChangesJson();
      expect(data.changes).toEqual([]);
      expect(data.archive).toEqual([]);
    });

    it('should sync active changes from directory scan', async () => {
      // Set up mock FS state
      const mod = await import('./shared.js');
      const { syncChangesJson } = mod;
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
      const mod = await import('./shared.js');
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
      const mod = await import('./shared.js');
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
      const mod = await import('./shared.js');
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

      const mod = await import('./shared.js');
      const { syncChangesJson } = mod;
      const data = syncChangesJson();
      expect(data.changes.length).toBe(0); // stale entry removed
    });
  });
});
