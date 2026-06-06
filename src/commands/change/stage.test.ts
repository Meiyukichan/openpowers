/**
 * @fileoverview Tests for change/stage.ts — stage schemas, types, and updateChangeInfo
 * @author Meiyuki <meiyukichan@163.com>
 * @copyright 2026 Meiyuki
 */

import path from 'path';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

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
      readdirSync: vi.fn(() => [] as Array<{ name: string; isDirectory: () => boolean; isFile: () => boolean }>),
    },
  };
});

vi.mock('fs', () => ({
  default: mockFs,
}));

vi.mock('../../utils/logger.js', () => ({
  logger: mockLogger,
}));

describe('src/commands/change/stage.ts', () => {
  const CHANGES_DIR = path.join(process.cwd(), 'openpowers', 'changes');
  const ARCHIVE_DIR = path.join(process.cwd(), 'openpowers', 'archive');
  const CHANGES_JSON_PATH = path.join(process.cwd(), 'openpowers', 'changes.json');

  beforeEach(() => {
    vi.resetAllMocks();
    mockFs.reset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // =========================================================
  // Zod schema tests
  // =========================================================

  describe('Stage schemas', () => {
    it('BasicStageSchema should accept valid { from, to, status } strings', async () => {
      const mod = await import('./stage.js');
      const { BasicStageSchema } = mod;
      const result = BasicStageSchema.parse({ from: 'idea', to: 'spec', status: 'in_progress' });
      expect(result).toEqual({ from: 'idea', to: 'spec', status: 'in_progress' });
    });

    it('BasicStageSchema should reject non-string fields', async () => {
      const mod = await import('./stage.js');
      const { BasicStageSchema } = mod;
      expect(() => BasicStageSchema.parse({ from: 123, to: 'spec', status: 'done' })).toThrow();
      expect(() => BasicStageSchema.parse({ from: 'idea', to: null, status: 'done' })).toThrow();
    });

    it('SubAgentDevStageSchema should accept valid array of sub-agent items', async () => {
      const mod = await import('./stage.js');
      const { SubAgentDevStageSchema } = mod;
      const item = {
        featureId: 'f1',
        explore: { from: '', to: '', status: '' },
        coding: { from: '', to: '', status: '' },
        specReview: { from: '', to: '', status: '' },
        codeReview: { from: '', to: '', status: '' },
      };
      const result = SubAgentDevStageSchema.parse([item]);
      expect(result).toHaveLength(1);
      expect(result[0].featureId).toBe('f1');
    });

    it('SubAgentDevStageSchema should reject array element missing required sub-stages', async () => {
      const mod = await import('./stage.js');
      const { SubAgentDevStageSchema } = mod;
      const badItem = { featureId: 'f1', explore: { from: '', to: '', status: '' } };
      expect(() => SubAgentDevStageSchema.parse([badItem])).toThrow();
    });

    it('FinalizeStageSchema should accept valid integration/codecheck/archive', async () => {
      const mod = await import('./stage.js');
      const { FinalizeStageSchema } = mod;
      const result = FinalizeStageSchema.parse({
        integration: { from: '', to: '', status: '' },
        codecheck: { from: '', to: '', status: '' },
        archive: { from: '', to: '', status: '' },
      });
      expect(result.integration).toEqual({ from: '', to: '', status: '' });
      expect(result.codecheck).toEqual({ from: '', to: '', status: '' });
    });

    it('ChangeStageSchema should validate full stage object', async () => {
      const mod = await import('./stage.js');
      const { ChangeStageSchema } = mod;
      const fullStage = {
        explore: { from: '', to: '', status: '' },
        brainstorm: { from: '', to: '', status: '' },
        propose: { from: '', to: '', status: '' },
        plan: { from: '', to: '', status: '' },
        reviewArtifacts: { from: '', to: '', status: '' },
        subAgentDev: [],
        finalize: {
          integration: { from: '', to: '', status: '' },
          codecheck: { from: '', to: '', status: '' },
          archive: { from: '', to: '', status: '' },
        },
      };
      const result = ChangeStageSchema.parse(fullStage);
      expect(result.explore).toBeDefined();
      expect(result.subAgentDev).toEqual([]);
    });

    it('StagePartialSchema should accept empty object', async () => {
      const mod = await import('./stage.js');
      const { StagePartialSchema } = mod;
      const result = StagePartialSchema.parse({});
      expect(result).toEqual({});
    });

    it('StagePartialSchema should accept single stage field', async () => {
      const mod = await import('./stage.js');
      const { StagePartialSchema } = mod;
      const result = StagePartialSchema.parse({ explore: { from: '', to: '', status: 'done' } });
      expect(result.explore).toEqual({ from: '', to: '', status: 'done' });
    });

    it('StagePartialSchema should strip unknown keys', async () => {
      const mod = await import('./stage.js');
      const { StagePartialSchema } = mod;
      const result = StagePartialSchema.parse({
        explore: { from: '', to: '', status: 'done' },
        unknownField: 'value',
      });
      expect(result.explore).toEqual({ from: '', to: '', status: 'done' });
      expect((result as Record<string, unknown>).unknownField).toBeUndefined();
    });
  });

  // =========================================================
  // updateChangeInfo tests
  // =========================================================

  describe('updateChangeInfo', () => {
    it('should update stage.explore and preserve other stage fields', async () => {
      const mod = await import('./stage.js');
      const { updateChangeInfo } = mod;
      const sharedMod = await import('./shared.js');
      const { loadOrCreateChangesJson } = sharedMod;
      mockFs.setFile(CHANGES_JSON_PATH, JSON.stringify({
        framework: 'openpowers',
        version: '1.0.0',
        changes: [{
          name: 'my-change',
          path: 'openpowers/changes/my-change',
          description: 'Test change',
          createdAt: '2026-01-01T00:00:00.000Z',
          features: 0,
          todo: 0,
          artifacts: [],
          stage: {
            explore: { from: 'idea', to: 'draft', status: 'todo' },
            brainstorm: { from: '', to: '', status: '' },
          },
        }],
        archive: [],
      }));
      mockFs.setDir(path.join(CHANGES_DIR, 'my-change'));

      updateChangeInfo('my-change', { explore: { from: '', to: '', status: 'done' } });

      const data = loadOrCreateChangesJson();
      const entry = data.changes.find((c) => c.name === 'my-change');
      expect(entry).toBeDefined();
      expect((entry as Record<string, unknown>).stage).toBeDefined();
      const stage = (entry as Record<string, unknown>).stage as Record<string, unknown>;
      expect(stage.explore).toEqual({ from: '', to: '', status: 'done' });
      expect(stage.brainstorm).toEqual({ from: '', to: '', status: '' });
    });

    it('should recompute features/todo and rebuild artifacts after update', async () => {
      const mod = await import('./stage.js');
      const { updateChangeInfo } = mod;
      const sharedMod = await import('./shared.js');
      const { loadOrCreateChangesJson } = sharedMod;
      mockFs.setFile(CHANGES_JSON_PATH, JSON.stringify({
        framework: 'openpowers',
        version: '1.0.0',
        changes: [{
          name: 'my-change',
          path: 'openpowers/changes/my-change',
          description: 'Test change',
          createdAt: '2026-01-01T00:00:00.000Z',
          features: 0,
          todo: 0,
          artifacts: [],
          stage: {},
        }],
        archive: [],
      }));
      const changePath = path.join(CHANGES_DIR, 'my-change');
      mockFs.setDir(changePath);
      mockFs.setFile(path.join(changePath, 'plan.json'), JSON.stringify([
        { id: 't1', status: 'done' },
        { id: 't2', status: 'todo' },
      ]));
      mockFs.setFile(path.join(changePath, 'proposal.md'), '');

      updateChangeInfo('my-change', { explore: { from: '', to: '', status: 'done' } });

      const data = loadOrCreateChangesJson();
      const entry = data.changes.find((c) => c.name === 'my-change');
      expect(entry).toBeDefined();
      expect((entry as Record<string, unknown>).features).toBe(2);
      expect((entry as Record<string, unknown>).todo).toBe(1);
      const artifacts = (entry as Record<string, unknown>).artifacts as Array<unknown>;
      expect(artifacts.length).toBeGreaterThan(0);
    });

    it('should update updateAt to current ISO 8601 timestamp', async () => {
      const mod = await import('./stage.js');
      const { updateChangeInfo } = mod;
      const sharedMod = await import('./shared.js');
      const { loadOrCreateChangesJson } = sharedMod;
      const beforeCall = new Date().toISOString();
      mockFs.setFile(CHANGES_JSON_PATH, JSON.stringify({
        framework: 'openpowers',
        version: '1.0.0',
        changes: [{
          name: 'my-change',
          path: 'openpowers/changes/my-change',
          description: 'Test change',
          createdAt: '2026-01-01T00:00:00.000Z',
          features: 0,
          todo: 0,
          artifacts: [],
          stage: {},
        }],
        archive: [],
      }));
      mockFs.setDir(path.join(CHANGES_DIR, 'my-change'));

      updateChangeInfo('my-change', { explore: { from: '', to: '', status: 'done' } });

      const data = loadOrCreateChangesJson();
      const entry = data.changes.find((c) => c.name === 'my-change');
      const updateAt = (entry as Record<string, unknown>).updateAt as string;
      expect(updateAt).toBeDefined();
      expect(new Date(updateAt).getTime()).toBeGreaterThanOrEqual(new Date(beforeCall).getTime());
    });

    it('should throw error when change name is not found', async () => {
      const mod = await import('./stage.js');
      const { updateChangeInfo } = mod;
      mockFs.setFile(CHANGES_JSON_PATH, JSON.stringify({
        framework: 'openpowers',
        version: '1.0.0',
        changes: [{ name: 'other-change', path: 'openpowers/changes/other-change' }],
        archive: [],
      }));

      expect(() => updateChangeInfo('non-existent', { explore: { from: '', to: '', status: 'done' } })).toThrow(
        "Change 'non-existent' not found in changes.json",
      );
    });

    it('should handle empty stagePartial by only refreshing computed fields and updateAt', async () => {
      const mod = await import('./stage.js');
      const { updateChangeInfo } = mod;
      const sharedMod = await import('./shared.js');
      const { loadOrCreateChangesJson } = sharedMod;
      const beforeUpdateAt = '2026-01-01T00:00:00.000Z';
      mockFs.setFile(CHANGES_JSON_PATH, JSON.stringify({
        framework: 'openpowers',
        version: '1.0.0',
        changes: [{
          name: 'my-change',
          path: 'openpowers/changes/my-change',
          description: 'Test change',
          createdAt: '2026-01-01T00:00:00.000Z',
          updateAt: beforeUpdateAt,
          features: 99,
          todo: 99,
          artifacts: [],
          stage: { explore: { from: 'x', to: 'y', status: 'z' } },
        }],
        archive: [],
      }));
      mockFs.setDir(path.join(CHANGES_DIR, 'my-change'));

      updateChangeInfo('my-change', {});

      const data = loadOrCreateChangesJson();
      const entry = data.changes.find((c) => c.name === 'my-change');
      const stage = (entry as Record<string, unknown>).stage as Record<string, unknown>;
      expect(stage.explore).toEqual({ from: 'x', to: 'y', status: 'z' });
      expect((entry as Record<string, unknown>).features).toBe(0);
      expect((entry as Record<string, unknown>).todo).toBe(0);
      expect((entry as Record<string, unknown>).updateAt).not.toBe(beforeUpdateAt);
    });

    it('should update stage for archived entry', async () => {
      const mod = await import('./stage.js');
      const { updateChangeInfo } = mod;
      const sharedMod = await import('./shared.js');
      const { loadOrCreateChangesJson } = sharedMod;
      mockFs.setFile(CHANGES_JSON_PATH, JSON.stringify({
        framework: 'openpowers',
        version: '1.0.0',
        changes: [],
        archive: [{
          name: 'old-change',
          path: 'openpowers/archive/2026-05-01-old-change',
          description: 'Archived change',
          createdAt: '2026-01-01T00:00:00.000Z',
          closedAt: '2026-05-01T00:00:00.000Z',
          features: 0,
          artifacts: [],
          stage: {},
        }],
      }));
      mockFs.setDir(path.join(ARCHIVE_DIR, '2026-05-01-old-change'));

      updateChangeInfo('old-change', { finalize: {
        integration: { from: '', to: '', status: 'done' },
        codecheck: { from: '', to: '', status: 'done' },
        archive: { from: '', to: '', status: '' },
      }});

      const data = loadOrCreateChangesJson();
      const entry = data.archive.find((c) => c.name === 'old-change');
      expect(entry).toBeDefined();
      const stage = (entry as Record<string, unknown>).stage as Record<string, unknown>;
      expect(stage.finalize).toBeDefined();
    });

    it('should replace entire subAgentDev array in stage field', async () => {
      const mod = await import('./stage.js');
      const { updateChangeInfo } = mod;
      const sharedMod = await import('./shared.js');
      const { loadOrCreateChangesJson } = sharedMod;
      mockFs.setFile(CHANGES_JSON_PATH, JSON.stringify({
        framework: 'openpowers',
        version: '1.0.0',
        changes: [{
          name: 'my-change',
          path: 'openpowers/changes/my-change',
          description: 'Test change',
          createdAt: '2026-01-01T00:00:00.000Z',
          features: 0,
          todo: 0,
          artifacts: [],
          stage: {
            subAgentDev: [
              { featureId: 'old-feature', explore: { from: 'x', to: 'y', status: 'done' }, coding: { from: 'x', to: 'y', status: 'done' }, specReview: { from: 'x', to: 'y', status: 'done' }, codeReview: { from: 'x', to: 'y', status: 'done' } },
            ],
          },
        }],
        archive: [],
      }));
      mockFs.setDir(path.join(CHANGES_DIR, 'my-change'));

      const newSubAgentDev = [{
        featureId: 'f1',
        explore: { from: '', to: '', status: '' },
        coding: { from: '', to: '', status: '' },
        specReview: { from: '', to: '', status: '' },
        codeReview: { from: '', to: '', status: '' },
      }];
      updateChangeInfo('my-change', { subAgentDev: newSubAgentDev });

      const data = loadOrCreateChangesJson();
      const entry = data.changes.find((c) => c.name === 'my-change');
      expect(entry).toBeDefined();
      const stage = (entry as Record<string, unknown>).stage as Record<string, unknown>;
      const subAgentDev = stage.subAgentDev as Array<Record<string, unknown>>;
      expect(subAgentDev).toHaveLength(1);
      expect(subAgentDev[0].featureId).toBe('f1');
      expect(subAgentDev[0].explore).toEqual({ from: '', to: '', status: '' });
      expect(subAgentDev[0].coding).toEqual({ from: '', to: '', status: '' });
    });
  });
});
