/**
 * @fileoverview Tests for change command module
 * @author Meiyuki <meiyukichan@163.com>
 * @copyright 2026 Meiyuki
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Command } from 'commander';

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
    fileSystem[pathStr] = content;
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
      readdirSync: vi.fn((p: string, _options?: { withFileTypes?: boolean }) => {
        const normalized = p.replace(/\\/g, '/');
        // Return empty array by default; individual tests set up dirs
        return [];
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
type RegisterChangeCommandFn = (program: Command) => void;

describe('src/commands/change.ts', () => {
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
    vi.clearAllMocks();
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

    it('should return 6 artifacts for active change path', () => {
      const artifacts = buildArtifacts('openspec/changes/my-feature');
      expect(artifacts.length).toBe(6);
      expect(artifacts[0]).toEqual({ id: 'proposal', outputPath: 'openspec/changes/my-feature/proposal.md' });
      expect(artifacts[1]).toEqual({ id: 'design', outputPath: 'openspec/changes/my-feature/design.md' });
      expect(artifacts[2]).toEqual({ id: 'specs', outputPath: 'openspec/changes/my-feature/specs/**/*.md' });
      expect(artifacts[3]).toEqual({ id: 'api', outputPath: 'openspec/changes/my-feature/api.yaml' });
      expect(artifacts[4]).toEqual({ id: 'database', outputPath: 'openspec/changes/my-feature/database.md' });
      expect(artifacts[5]).toEqual({ id: 'plan', outputPath: 'openspec/changes/my-feature/plan.json' });
    });

    it('should return 6 artifacts for archive change path', () => {
      const artifacts = buildArtifacts('openspec/changes/archive/2026-05-17-old-feature');
      expect(artifacts.length).toBe(6);
      expect(artifacts[0]).toEqual({ id: 'proposal', outputPath: 'openspec/changes/archive/2026-05-17-old-feature/proposal.md' });
    });

    it('should have correct file extensions for each artifact type', () => {
      const artifacts = buildArtifacts('some/path');
      const byId = Object.fromEntries(artifacts.map(a => [a.id, a.outputPath]));
      expect(byId.proposal.endsWith('.md')).toBe(true);
      expect(byId.design.endsWith('.md')).toBe(true);
      expect(byId.specs).toBe('some/path/specs/**/*.md');
      expect(byId.api.endsWith('.yaml')).toBe(true);
      expect(byId.database.endsWith('.md')).toBe(true);
      expect(byId.plan.endsWith('.json')).toBe(true);
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
      mockFs.setFile('openpowers/changes.json', JSON.stringify({
        changes: [{ name: 'existing', path: 'openspec/changes/existing' }],
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
      mockFs.setFile('openpowers/changes.json', JSON.stringify({
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
      mockFs.setDir('openspec/changes');
      mockFs.setDir('openspec/changes/my-feature');
      mockFs.setFile('openspec/changes/my-feature/plan.json', JSON.stringify([
        { id: 't1', status: 'done' },
        { id: 't2', status: 'todo' },
      ]));

      // Override readdirSync for this test
      mockFs.readdirSync.mockImplementation((p: string, _options?: unknown) => {
        const normalized = p.replace(/\\/g, '/');
        if (normalized === 'openspec/changes') {
          return [
            { name: 'my-feature', isDirectory: () => true, isFile: () => false },
            { name: 'archive', isDirectory: () => true, isFile: () => false },
          ] as fs.Dirent[];
        }
        if (normalized === 'openspec/changes/archive') {
          return [] as fs.Dirent[];
        }
        return [] as fs.Dirent[];
      });

      const data = syncChangesJson();
      expect(data.changes.length).toBe(1);
      const entry = data.changes[0];
      expect(entry.name).toBe('my-feature');
      expect(entry.features).toBe(2);
      expect(entry.todo).toBe(1);
      expect(entry.artifacts).toBeDefined();
      expect((entry.artifacts as Array<unknown>).length).toBe(6);
    });

    it('should sync archived changes with closedAt', async () => {
      const mod = await import('./change.js');
      const { syncChangesJson } = mod;
      mockFs.setDir('openspec/changes');
      mockFs.setDir('openspec/changes/archive');
      mockFs.setDir('openspec/changes/archive/2026-05-17-old-feature');

      mockFs.readdirSync.mockImplementation((p: string, _options?: unknown) => {
        const normalized = p.replace(/\\/g, '/');
        if (normalized === 'openspec/changes') {
          return [
            { name: 'archive', isDirectory: () => true, isFile: () => false },
          ] as fs.Dirent[];
        }
        if (normalized === 'openspec/changes/archive') {
          return [
            { name: '2026-05-17-old-feature', isDirectory: () => true, isFile: () => false },
          ] as fs.Dirent[];
        }
        return [] as fs.Dirent[];
      });

      const data = syncChangesJson();
      expect(data.archive.length).toBe(1);
      expect(data.archive[0].name).toBe('old-feature');
      expect(data.archive[0].closedAt).toBeDefined();
    });

    it('should skip dot-prefixed directories', async () => {
      const mod = await import('./change.js');
      const { syncChangesJson } = mod;
      mockFs.setDir('openspec/changes');

      mockFs.readdirSync.mockImplementation((p: string, _options?: unknown) => {
        const normalized = p.replace(/\\/g, '/');
        if (normalized === 'openspec/changes') {
          return [
            { name: '.git', isDirectory: () => true, isFile: () => false },
            { name: '.hidden', isDirectory: () => true, isFile: () => false },
            { name: 'archive', isDirectory: () => true, isFile: () => false },
          ] as fs.Dirent[];
        }
        if (normalized === 'openspec/changes/archive') {
          return [] as fs.Dirent[];
        }
        return [] as fs.Dirent[];
      });

      const data = syncChangesJson();
      expect(data.changes.length).toBe(0); // Dot dirs excluded, archive excluded from changes
    });

    it('should sync both active and archive changes simultaneously', async () => {
      const mod = await import('./change.js');
      const { syncChangesJson } = mod;

      // Set up one active change
      mockFs.setDir('openspec/changes');
      mockFs.setDir('openspec/changes/my-feature');
      mockFs.setFile('openspec/changes/my-feature/plan.json', JSON.stringify([
        { id: 't1', status: 'done' },
        { id: 't2', status: 'todo' },
      ]));

      // Set up one archived change
      mockFs.setDir('openspec/changes/archive');
      mockFs.setDir('openspec/changes/archive/2026-05-17-old-feature');
      mockFs.setFile('openspec/changes/archive/2026-05-17-old-feature/plan.json', JSON.stringify([
        { id: 't1', status: 'done' },
      ]));

      mockFs.readdirSync.mockImplementation((p: string, _options?: unknown) => {
        const normalized = p.replace(/\\/g, '/');
        if (normalized === 'openspec/changes') {
          return [
            { name: 'my-feature', isDirectory: () => true, isFile: () => false },
            { name: 'archive', isDirectory: () => true, isFile: () => false },
          ] as fs.Dirent[];
        }
        if (normalized === 'openspec/changes/archive') {
          return [
            { name: '2026-05-17-old-feature', isDirectory: () => true, isFile: () => false },
          ] as fs.Dirent[];
        }
        return [] as fs.Dirent[];
      });

      const data = syncChangesJson();

      // Both arrays should be populated
      expect(data.changes.length).toBe(1);
      expect(data.changes[0].name).toBe('my-feature');
      expect(data.archive.length).toBe(1);
      expect(data.archive[0].name).toBe('old-feature');
    });

    it('should remove stale entries not present on filesystem', async () => {
      // First create a changes.json with a stale entry
      mockFs.setFile('openpowers/changes.json', JSON.stringify({
        framework: 'openpowers',
        version: '1.0.0',
        changes: [{ name: 'stale-change', path: 'openspec/changes/stale-change' }],
        archive: [],
      }));
      mockFs.setDir('openspec/changes');

      mockFs.readdirSync.mockImplementation((p: string, _options?: unknown) => {
        const normalized = p.replace(/\\/g, '/');
        if (normalized === 'openspec/changes') {
          return [
            { name: 'archive', isDirectory: () => true, isFile: () => false },
          ] as fs.Dirent[];
        }
        if (normalized === 'openspec/changes/archive') {
          return [] as fs.Dirent[];
        }
        return [] as fs.Dirent[];
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
      mockFs.readdirSync.mockImplementation(() => [] as fs.Dirent[]);

      runChangeList();

      const stdoutCalls = stdoutWriteSpy.mock.calls.map((c) => c[0]);
      expect(stdoutCalls.some((s) => String(s).includes('No changes found'))).toBe(true);
    });

    it('should print table header when changes exist', () => {
      mockFs.setDir('openspec/changes');
      mockFs.setDir('openspec/changes/my-feature');
      mockFs.setFile('openspec/changes/my-feature/plan.json', JSON.stringify([
        { id: 't1', status: 'done' },
        { id: 't2', status: 'todo' },
      ]));

      mockFs.readdirSync.mockImplementation((p: string, _options?: unknown) => {
        const normalized = p.replace(/\\/g, '/');
        if (normalized === 'openspec/changes') {
          return [
            { name: 'my-feature', isDirectory: () => true, isFile: () => false },
            { name: 'archive', isDirectory: () => true, isFile: () => false },
          ] as fs.Dirent[];
        }
        if (normalized === 'openspec/changes/archive') {
          return [] as fs.Dirent[];
        }
        return [] as fs.Dirent[];
      });

      runChangeList();

      const stdoutCalls = stdoutWriteSpy.mock.calls.map((c) => String(c[0]));
      // Should contain header columns
      expect(stdoutCalls.some((s) => s.includes('Name'))).toBe(true);
      expect(stdoutCalls.some((s) => s.includes('Progress'))).toBe(true);
      expect(stdoutCalls.some((s) => s.includes('Description'))).toBe(true);
      // Should contain change name
      expect(stdoutCalls.some((s) => s.includes('my-feature'))).toBe(true);
      // Should contain progress
      expect(stdoutCalls.some((s) => s.includes('1/2 features'))).toBe(true);
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
    });

    it('should not error if directory already exists', () => {
      mockFs.setDir('openspec/changes/existing-change');

      expect(() => runChangeNew('existing-change', { desc: 'Update' })).not.toThrow();

      // Should still update changes.json
      const writeCalls = mockFs.writeFileSync.mock.calls;
      expect(writeCalls.length).toBeGreaterThanOrEqual(1);
    });

    it('should append new entry even if changes.json already has same name entry', () => {
      // Pre-seed changes.json with an existing entry for the same name
      mockFs.setFile('openpowers/changes.json', JSON.stringify({
        framework: 'openpowers',
        version: '1.0.0',
        changes: [
          { name: 'dup-feature', path: 'openspec/changes/dup-feature', description: 'Old', createdAt: '2026-01-01T00:00:00.000Z', features: 0, todo: 0 },
        ],
        archive: [],
      }));
      mockFs.setDir('openspec/changes/dup-feature');

      // Call runChangeNew with the same name
      runChangeNew('dup-feature', { desc: 'New duplicate' });

      // Should not error; changes.json should now have 2 entries (duplicate cleaned on next sync)
      const writeCalls = mockFs.writeFileSync.mock.calls;
      const lastWrite = writeCalls[writeCalls.length - 1];
      const content = JSON.parse(String(lastWrite[1]));
      expect(content.changes.length).toBe(2);
      expect(content.changes[0].name).toBe('dup-feature');
      expect(content.changes[1].name).toBe('dup-feature');
    });
  });

  describe('runChangeStatus', () => {
    beforeEach(async () => {
      const mod = await import('./change.js');
      runChangeStatus = mod.runChangeStatus;
    });

    it('should output JSON for an active change', () => {
      mockFs.setDir('openspec/changes');
      mockFs.setDir('openspec/changes/my-feature');
      mockFs.setFile('openspec/changes/my-feature/plan.json', JSON.stringify([
        { id: 't1', status: 'done' },
        { id: 't2', status: 'todo' },
      ]));

      mockFs.readdirSync.mockImplementation((p: string, _options?: unknown) => {
        const normalized = p.replace(/\\/g, '/');
        if (normalized === 'openspec/changes') {
          return [
            { name: 'my-feature', isDirectory: () => true, isFile: () => false },
            { name: 'archive', isDirectory: () => true, isFile: () => false },
          ] as fs.Dirent[];
        }
        if (normalized === 'openspec/changes/archive') {
          return [] as fs.Dirent[];
        }
        return [] as fs.Dirent[];
      });

      runChangeStatus('my-feature');

      const stdoutCalls = stdoutWriteSpy.mock.calls.map((c) => String(c[0]));
      const output = stdoutCalls[stdoutCalls.length - 1];
      const parsed = JSON.parse(output);
      expect(parsed.name).toBe('my-feature');
      expect(parsed.isComplete).toBe(false);
      expect(parsed.artifacts).toBeDefined();
      expect(parsed.artifacts.length).toBe(6);
    });

    it('should output isComplete=true when all tasks are done', () => {
      mockFs.setDir('openspec/changes');
      mockFs.setDir('openspec/changes/complete-feature');
      mockFs.setFile('openspec/changes/complete-feature/plan.json', JSON.stringify([
        { id: 't1', status: 'done' },
        { id: 't2', status: 'done' },
      ]));

      mockFs.readdirSync.mockImplementation((p: string, _options?: unknown) => {
        const normalized = p.replace(/\\/g, '/');
        if (normalized === 'openspec/changes') {
          return [
            { name: 'complete-feature', isDirectory: () => true, isFile: () => false },
            { name: 'archive', isDirectory: () => true, isFile: () => false },
          ] as fs.Dirent[];
        }
        if (normalized === 'openspec/changes/archive') {
          return [] as fs.Dirent[];
        }
        return [] as fs.Dirent[];
      });

      runChangeStatus('complete-feature');

      const stdoutCalls = stdoutWriteSpy.mock.calls.map((c) => String(c[0]));
      const output = stdoutCalls[stdoutCalls.length - 1];
      const parsed = JSON.parse(output);
      expect(parsed.isComplete).toBe(true);
    });

    it('should output isComplete=false when no features exist', () => {
      mockFs.setDir('openspec/changes');
      mockFs.setDir('openspec/changes/empty-feature');

      mockFs.readdirSync.mockImplementation((p: string, _options?: unknown) => {
        const normalized = p.replace(/\\/g, '/');
        if (normalized === 'openspec/changes') {
          return [
            { name: 'empty-feature', isDirectory: () => true, isFile: () => false },
            { name: 'archive', isDirectory: () => true, isFile: () => false },
          ] as fs.Dirent[];
        }
        if (normalized === 'openspec/changes/archive') {
          return [] as fs.Dirent[];
        }
        return [] as fs.Dirent[];
      });

      runChangeStatus('empty-feature');

      const stdoutCalls = stdoutWriteSpy.mock.calls.map((c) => String(c[0]));
      const output = stdoutCalls[stdoutCalls.length - 1];
      const parsed = JSON.parse(output);
      expect(parsed.isComplete).toBe(false);
    });

    it('should error when change name not found', () => {
      mockFs.readdirSync.mockImplementation(() => [] as fs.Dirent[]);

      expect(() => runChangeStatus('nonexistent')).toThrow('process.exit called');
      expect(process.exit).toHaveBeenCalledWith(1);
    });

    it('should search archive for change if not found in active changes', () => {
      mockFs.setDir('openspec/changes');
      mockFs.setDir('openspec/changes/archive');
      mockFs.setDir('openspec/changes/archive/2026-01-01-archived-feature');

      mockFs.readdirSync.mockImplementation((p: string, _options?: unknown) => {
        const normalized = p.replace(/\\/g, '/');
        if (normalized === 'openspec/changes') {
          return [
            { name: 'archive', isDirectory: () => true, isFile: () => false },
          ] as fs.Dirent[];
        }
        if (normalized === 'openspec/changes/archive') {
          return [
            { name: '2026-01-01-archived-feature', isDirectory: () => true, isFile: () => false },
          ] as fs.Dirent[];
        }
        return [] as fs.Dirent[];
      });

      runChangeStatus('archived-feature');

      const stdoutCalls = stdoutWriteSpy.mock.calls.map((c) => String(c[0]));
      const output = stdoutCalls[stdoutCalls.length - 1];
      const parsed = JSON.parse(output);
      expect(parsed.name).toBe('archived-feature');
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

    it('should register change as a parent command with three subcommands', () => {
      const program = new Command();
      registerChangeCommand(program);

      const changeCmd = program.commands.find((cmd) => cmd.name() === 'change');
      expect(changeCmd).toBeDefined();

      const subCommandNames = changeCmd!.commands.map((cmd) => cmd.name());
      expect(subCommandNames).toContain('list');
      expect(subCommandNames).toContain('new');
      expect(subCommandNames).toContain('status');
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
