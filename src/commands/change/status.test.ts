/**
 * @fileoverview Tests for change/status.ts computeArtifactStatus and runChangeStatus
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

describe('src/commands/change/status.ts', () => {
  const CHANGES_DIR = path.join(process.cwd(), 'furina', 'changes');
  const ARCHIVE_DIR = path.join(process.cwd(), 'furina', 'archive');
  const NORM_CHANGES_DIR = CHANGES_DIR.replace(/\\/g, '/');
  const NORM_ARCHIVE_DIR = ARCHIVE_DIR.replace(/\\/g, '/');

  let stdoutWriteSpy: ReturnType<typeof vi.spyOn>;
  let stderrWriteSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
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
  // computeArtifactStatus tests
  // =========================================================

  describe('computeArtifactStatus', () => {
    let computeArtifactStatus: (changeDirPath: string) => Array<{ id: string; outputPath: string; status: string }>;

    beforeEach(async () => {
      const mod = await import('./status.js');
      computeArtifactStatus = mod.computeArtifactStatus;
    });

    it('should return proposal=ready, design=blocked, specs=blocked when proposal.md does not exist', () => {
      // No files set up - proposal.md doesn't exist
      const artifacts = computeArtifactStatus('some/change');
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

    it('should assign done to non-core artifacts (api, database) and plan=done when all features done', () => {
      mockFs.setFile('some/change/proposal.md', '');
      mockFs.setFile('some/change/design.md', '');
      mockFs.setDir('some/change/specs');
      mockFs.setFile('some/change/specs/my-spec.md', '');
      mockFs.setFile('some/change/api.yaml', '');
      mockFs.setFile('some/change/database.md', '');
      mockFs.setFile('some/change/plan.json', JSON.stringify([
        { id: 'f1', status: 'done' },
        { id: 'f2', status: 'done' },
      ]));
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

    it('should assign plan=in_progress when not all features are done', () => {
      mockFs.setFile('some/change/proposal.md', '');
      mockFs.setFile('some/change/plan.json', JSON.stringify([
        { id: 'f1', status: 'done' },
        { id: 'f2', status: 'todo' },
      ]));
      const artifacts = computeArtifactStatus('some/change');
      const plan = artifacts.find(a => a.id === 'plan');
      expect(plan!.status).toBe('in_progress');
    });

    it('should assign plan=done when plan.json is empty array', () => {
      mockFs.setFile('some/change/proposal.md', '');
      mockFs.setFile('some/change/plan.json', JSON.stringify([]));
      const artifacts = computeArtifactStatus('some/change');
      const plan = artifacts.find(a => a.id === 'plan');
      expect(plan!.status).toBe('done');
    });

    it('should assign plan=in_progress when plan.json is invalid', () => {
      mockFs.setFile('some/change/proposal.md', '');
      mockFs.setFile('some/change/plan.json', 'not valid json');
      const artifacts = computeArtifactStatus('some/change');
      const plan = artifacts.find(a => a.id === 'plan');
      expect(plan!.status).toBe('in_progress');
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
      const artifacts = computeArtifactStatus('some/change');
      expect(artifacts.length).toBe(3);
      const proposal = artifacts.find(a => a.id === 'proposal');
      const design = artifacts.find(a => a.id === 'design');
      const specs = artifacts.find(a => a.id === 'specs');
      expect(proposal!.status).toBe('done');
      expect(design!.status).toBe('done');
      expect(specs!.status).toBe('ready');
    });

    it('should return specs=done when specs/ has nested subdirectories with .md files', () => {
      mockFs.setFile('some/change/proposal.md', '');
      mockFs.setFile('some/change/design.md', '');
      mockFs.setDir('some/change/specs');
      mockFs.readdirSync.mockImplementation((p: string, _options?: unknown) => {
        const normalized = p.replace(/\\/g, '/');
        if (normalized === 'some/change/specs') {
          return [
            { name: 'my-capability', isDirectory: () => true, isFile: () => false },
          ] as DirEntry[];
        }
        if (normalized === 'some/change/specs/my-capability') {
          return [
            { name: 'spec.md', isDirectory: () => false, isFile: () => true },
          ] as DirEntry[];
        }
        return [] as DirEntry[];
      });
      const artifacts = computeArtifactStatus('some/change');
      expect(artifacts.length).toBe(3);
      const specs = artifacts.find(a => a.id === 'specs');
      expect(specs!.status).toBe('done');
    });
  });

  // =========================================================
  // runChangeStatus tests
  // =========================================================

  describe('runChangeStatus', () => {
    let runChangeStatus: (name: string) => void;

    beforeEach(async () => {
      const mod = await import('./status.js');
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
      expect(parsed.status).toBe('active');
      expect(parsed.isArtsComplete).toBe(false);
      expect(parsed.artifacts).toBeDefined();
      // Core artifacts always included: proposal=done, design=ready, specs=blocked + plan=in_progress
      expect(parsed.artifacts.length).toBe(4);
      const proposal = parsed.artifacts.find((a: { id: string }) => a.id === 'proposal');
      expect(proposal.status).toBe('done');
      expect(proposal.outputPath).toBe('proposal.md');
    });

    it('should output isArtsComplete=true when all core artifacts are done', () => {
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
      expect(parsed.isArtsComplete).toBe(true);
      expect(parsed.status).toBe('active');
    });

    it('should output isArtsComplete=false when no features exist', () => {
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
      expect(parsed.isArtsComplete).toBe(false);
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
      expect(parsed.status).toBe('archived');
    });
  });
});
