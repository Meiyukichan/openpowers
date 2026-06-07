/**
 * @fileoverview Tests for utils/memory.ts — changes.json data model schemas and types
 * @author Meiyuki <meiyukichan@163.com>
 * @copyright 2026 Meiyuki
 */

import path from 'path';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// =========================================================
// Mock filesystem for readMemoryChangesJson / writeMemoryChangesJson / createOrUpdateChange
// =========================================================
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
        const parts = p.replace(/\\/g, '/').split('/');
        for (let i = 1; i < parts.length; i++) {
          dirSet.add(parts.slice(0, i).join('/'));
        }
      }),
      mkdirSync: vi.fn((p: string) => {
        setDir(p);
      }),
    },
  };
});

vi.mock('fs', () => ({
  default: mockFs,
}));

const { mockOs } = vi.hoisted(() => ({
  mockOs: {
    homedir: vi.fn(() => '/home/test-user'),
  },
}));

vi.mock('os', () => ({
  default: mockOs,
}));

describe('src/utils/memory.ts', () => {
  // =========================================================
  // StageStepSchema tests
  // =========================================================
  describe('StageStepSchema', () => {
    it('should accept valid { title, from, to, status } strings', async () => {
      const mod = await import('./memory.js');
      const { StageStepSchema } = mod;
      const result = StageStepSchema.parse({ title: 'Explore', from: '', to: '', status: 'in_progress' });
      expect(result).toEqual({ title: 'Explore', from: '', to: '', status: 'in_progress', inputPath: '', outputPath: '' });
    });

    it('should reject missing title field', async () => {
      const mod = await import('./memory.js');
      const { StageStepSchema } = mod;
      expect(() => StageStepSchema.parse({ from: '', to: '', status: 'in_progress' })).toThrow();
    });

    it('should reject non-string title field', async () => {
      const mod = await import('./memory.js');
      const { StageStepSchema } = mod;
      expect(() => StageStepSchema.parse({ title: 123, from: '', to: '', status: 'in_progress' })).toThrow();
    });
  });

  // =========================================================
  // SubAgentDevProgressSchema tests
  // =========================================================
  describe('SubAgentDevProgressSchema', () => {
    it('should accept valid featureId and progress array', async () => {
      const mod = await import('./memory.js');
      const { SubAgentDevProgressSchema } = mod;
      const result = SubAgentDevProgressSchema.parse({
        featureId: 'feat-1',
        progress: [{ title: 'TDD', from: '', to: '', status: 'in_progress' }],
      });
      expect(result.featureId).toBe('feat-1');
      expect(result.progress).toHaveLength(1);
      expect(result.progress[0].title).toBe('TDD');
    });

    it('should reject missing progress array', async () => {
      const mod = await import('./memory.js');
      const { SubAgentDevProgressSchema } = mod;
      expect(() => SubAgentDevProgressSchema.parse({ featureId: 'feat-1' })).toThrow();
    });

    it('should reject progress with invalid items', async () => {
      const mod = await import('./memory.js');
      const { SubAgentDevProgressSchema } = mod;
      expect(() =>
        SubAgentDevProgressSchema.parse({
          featureId: 'feat-1',
          progress: [{ from: '', to: '', status: 'in_progress' }],
        }),
      ).toThrow();
    });
  });

  // =========================================================
  // FinalizeStageSchema tests
  // =========================================================
  describe('FinalizeStageSchema', () => {
    it('should accept valid integration/codecheck/archive fields', async () => {
      const mod = await import('./memory.js');
      const { FinalizeStageSchema } = mod;
      const result = FinalizeStageSchema.parse({
        integration: { title: 'Integration', from: '', to: '', status: 'in_progress' },
        codecheck: { title: 'Code Check', from: '', to: '', status: 'in_progress' },
        archive: { title: 'Archive', from: '', to: '', status: 'in_progress' },
      });
      expect(result.integration.title).toBe('Integration');
      expect(result.codecheck.title).toBe('Code Check');
      expect(result.archive.title).toBe('Archive');
    });

    it('should reject missing integration field', async () => {
      const mod = await import('./memory.js');
      const { FinalizeStageSchema } = mod;
      expect(() =>
        FinalizeStageSchema.parse({
          codecheck: { title: '', from: '', to: '', status: 'in_progress' },
          archive: { title: '', from: '', to: '', status: 'in_progress' },
        }),
      ).toThrow();
    });
  });

  // =========================================================
  // ChangeStageSchema tests
  // =========================================================
  describe('ChangeStageSchema', () => {
    it('should accept complete stage with all 7 fields', async () => {
      const mod = await import('./memory.js');
      const { ChangeStageSchema } = mod;
      const fullStage = {
        explore: { title: 'Explore', from: '', to: '', status: 'in_progress' },
        brainstorm: { title: 'Brainstorm', from: '', to: '', status: 'in_progress' },
        propose: { title: 'Propose', from: '', to: '', status: 'in_progress' },
        plan: { title: 'Plan', from: '', to: '', status: 'in_progress' },
        reviewArtifacts: { title: 'Review Artifacts', from: '', to: '', status: 'in_progress' },
        subAgentDev: [],
        finalize: {
          integration: { title: '', from: '', to: '', status: 'in_progress' },
          codecheck: { title: '', from: '', to: '', status: 'in_progress' },
          archive: { title: '', from: '', to: '', status: 'in_progress' },
        },
      };
      const result = ChangeStageSchema.parse(fullStage);
      expect(result.explore.title).toBe('Explore');
      expect(result.brainstorm.title).toBe('Brainstorm');
      expect(result.propose.title).toBe('Propose');
      expect(result.plan.title).toBe('Plan');
      expect(result.reviewArtifacts.title).toBe('Review Artifacts');
      expect(result.subAgentDev).toEqual([]);
      expect(result.finalize).toBeDefined();
    });

    it('should reject missing brainstorm field', async () => {
      const mod = await import('./memory.js');
      const { ChangeStageSchema } = mod;
      const incomplete = {
        explore: { title: '', from: '', to: '', status: 'in_progress' },
        propose: { title: '', from: '', to: '', status: 'in_progress' },
        plan: { title: '', from: '', to: '', status: 'in_progress' },
        reviewArtifacts: { title: '', from: '', to: '', status: 'in_progress' },
        subAgentDev: [],
        finalize: {
          integration: { title: '', from: '', to: '', status: 'in_progress' },
          codecheck: { title: '', from: '', to: '', status: 'in_progress' },
          archive: { title: '', from: '', to: '', status: 'in_progress' },
        },
      };
      expect(() => ChangeStageSchema.parse(incomplete)).toThrow();
    });
  });

  // =========================================================
  // ChangeEntrySchema tests
  // =========================================================
  describe('ChangeEntrySchema', () => {
    const minValidEntry = {
      name: 'my-change',
      path: 'openpowers/changes/my-change',
      description: 'test',
      createdAt: '2026-01-01T00:00:00Z',
      status: 'active' as const,
      features: 0,
      todo: 0,
      artifacts: [],
    };

    it('should accept entry without optional updateAt and stage fields', async () => {
      const mod = await import('./memory.js');
      const { ChangeEntrySchema } = mod;
      const result = ChangeEntrySchema.parse(minValidEntry);
      expect(result.name).toBe('my-change');
      expect(result.updateAt).toBeUndefined();
      expect(result.stage).toBeUndefined();
    });

    it('should accept entry with all optional fields including updateAt and stage', async () => {
      const mod = await import('./memory.js');
      const { ChangeEntrySchema } = mod;
      const fullEntry = {
        ...minValidEntry,
        updateAt: '2026-06-01T00:00:00Z',
        stage: {
          explore: { title: 'Explore', from: '', to: '', status: 'done' },
          brainstorm: { title: 'Brainstorm', from: '', to: '', status: 'done' },
          propose: { title: 'Propose', from: '', to: '', status: 'in_progress' },
          plan: { title: 'Plan', from: '', to: '', status: 'in_progress' },
          reviewArtifacts: { title: 'Review', from: '', to: '', status: 'in_progress' },
          subAgentDev: [],
          finalize: {
            integration: { title: '', from: '', to: '', status: 'in_progress' },
            codecheck: { title: '', from: '', to: '', status: 'in_progress' },
            archive: { title: '', from: '', to: '', status: 'in_progress' },
          },
        },
      };
      const result = ChangeEntrySchema.parse(fullEntry);
      expect(result.name).toBe('my-change');
      expect(result.updateAt).toBe('2026-06-01T00:00:00Z');
      expect(result.stage).toBeDefined();
      expect(result.stage!.explore.title).toBe('Explore');
    });

    it('should reject entry with artifacts as non-array', async () => {
      const mod = await import('./memory.js');
      const { ChangeEntrySchema } = mod;
      expect(() =>
        ChangeEntrySchema.parse({ ...minValidEntry, artifacts: 'not-an-array' }),
      ).toThrow();
    });
  });

  // =========================================================
  // ChangesJsonSchema tests
  // =========================================================
  describe('ChangesJsonSchema', () => {
    it('should accept valid ChangesJson with cwd field', async () => {
      const mod = await import('./memory.js');
      const { ChangesJsonSchema } = mod;
      const result = ChangesJsonSchema.parse({
        framework: 'openpowers',
        version: '1.0.0',
        cwd: '/home/user/project',
        changes: [],
      });
      expect(result.framework).toBe('openpowers');
      expect(result.cwd).toBe('/home/user/project');
      expect(result.changes).toEqual([]);
    });

    it('should reject without cwd field', async () => {
      const mod = await import('./memory.js');
      const { ChangesJsonSchema } = mod;
      expect(() =>
        ChangesJsonSchema.parse({
          framework: 'openpowers',
          version: '1.0.0',
          changes: [],
        }),
      ).toThrow();
    });

    it('should reject with malformed changes array', async () => {
      const mod = await import('./memory.js');
      const { ChangesJsonSchema } = mod;
      expect(() =>
        ChangesJsonSchema.parse({
          framework: 'openpowers',
          version: '1.0.0',
          cwd: '/project',
          changes: [{ invalid: 'entry' }],
        }),
      ).toThrow();
    });
  });

  // =========================================================
  // flattenCwdPath tests
  // =========================================================
  describe('flattenCwdPath', () => {
    it('should flatten Windows path with backslashes and colon', async () => {
      const mod = await import('./memory.js');
      const { flattenCwdPath } = mod;
      expect(flattenCwdPath('D:\\project-code\\llm\\openpowers')).toBe('D__project-code_llm_openpowers');
    });

    it('should flatten Unix path with forward slashes', async () => {
      const mod = await import('./memory.js');
      const { flattenCwdPath } = mod;
      expect(flattenCwdPath('/home/user/project')).toBe('_home_user_project');
    });

    it('should flatten mixed path separators', async () => {
      const mod = await import('./memory.js');
      const { flattenCwdPath } = mod;
      expect(flattenCwdPath('C:\\Users/test')).toBe('C__Users_test');
    });
  });

  // =========================================================
  // Module export integrity
  // =========================================================
  describe('Module exports', () => {
    it('should export all 6 schemas and their inferred types are usable', async () => {
      const mod = await import('./memory.js');

      // All 6 schemas are present at runtime
      expect(mod.StageStepSchema).toBeDefined();
      expect(mod.SubAgentDevProgressSchema).toBeDefined();
      expect(mod.FinalizeStageSchema).toBeDefined();
      expect(mod.ChangeStageSchema).toBeDefined();
      expect(mod.ChangeEntrySchema).toBeDefined();
      expect(mod.ChangesJsonSchema).toBeDefined();

      // Types (compile-time only — verified by TypeScript compilation)
      // Use z.infer to confirm schemas produce usable inferred types
      type StageStep = typeof mod.StageStepSchema extends import('zod').ZodType<infer T> ? T : never;
      type SubAgentDevProgress = typeof mod.SubAgentDevProgressSchema extends import('zod').ZodType<infer T> ? T : never;
      type FinalizeStage = typeof mod.FinalizeStageSchema extends import('zod').ZodType<infer T> ? T : never;
      type ChangeStage = typeof mod.ChangeStageSchema extends import('zod').ZodType<infer T> ? T : never;
      type ChangeEntry = typeof mod.ChangeEntrySchema extends import('zod').ZodType<infer T> ? T : never;
      type ChangesJson = typeof mod.ChangesJsonSchema extends import('zod').ZodType<infer T> ? T : never;

      // Runtime validation proves types are properly inferred
      const entry: ChangeEntry = {
        name: 't',
        path: 'p',
        description: 'd',
        createdAt: '2026-01-01T00:00:00Z',
        status: 'active',
        features: 0,
        todo: 0,
        artifacts: [],
      };
      mod.ChangeEntrySchema.parse(entry);

      const json: ChangesJson = {
        framework: 'fw',
        version: '1.0.0',
        cwd: '/cwd',
        changes: [entry],
      };
      mod.ChangesJsonSchema.parse(json);

      // If this compiles and runs, all 6 types are importable
      void ({} as unknown as StageStep);
      void ({} as unknown as SubAgentDevProgress);
      void ({} as unknown as FinalizeStage);
      void ({} as unknown as ChangeStage);
      void ({} as unknown as ChangeEntry);
      void ({} as unknown as ChangesJson);
    });
  });

  // =========================================================
  // readMemoryChangesJson tests
  // =========================================================
  describe('readMemoryChangesJson', () => {
    beforeEach(() => {
      mockFs.reset();
    });

    it('should return default structure when file does not exist', async () => {
      const mod = await import('./memory.js');
      const { readMemoryChangesJson } = mod;
      const result = readMemoryChangesJson('/test/project');
      expect(result.framework).toBe('@meiyukichan/openpowers');
      expect(result.version).toBeDefined();
      expect(result.cwd).toBe('/test/project');
      expect(result.changes).toEqual([]);
    });

    it('should return parsed JSON when file exists', async () => {
      const flatCwd = '_test_project'; // flattenCwdPath('/test/project') = '_test_project'
      const filePath = `/home/test-user/.openpowers/memory/${flatCwd}/changes.json`;
      const existingData = {
        framework: 'openpowers',
        version: '1.0.0',
        cwd: '/test/project',
        changes: [
          {
            name: 'my-change',
            path: 'openpowers/changes/my-change',
            description: 'test',
            createdAt: '2026-01-01T00:00:00Z',
            features: 0,
            todo: 0,
            artifacts: [],
          },
        ],
      };
      mockFs.setFile(filePath, JSON.stringify(existingData));

      const mod = await import('./memory.js');
      const { readMemoryChangesJson } = mod;
      const result = readMemoryChangesJson('/test/project');
      expect(result.changes).toHaveLength(1);
      expect(result.changes[0].name).toBe('my-change');
    });

    it('should return default structure and warn when file contains malformed JSON', async () => {
      const flatCwd = '_test_project';
      const filePath = `/home/test-user/.openpowers/memory/${flatCwd}/changes.json`;
      mockFs.setFile(filePath, '{ invalid json content !!!');

      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const mod = await import('./memory.js');
      const { readMemoryChangesJson } = mod;
      const result = readMemoryChangesJson('/test/project');

      expect(result.framework).toBe('@meiyukichan/openpowers');
      expect(result.cwd).toBe('/test/project');
      expect(result.changes).toEqual([]);
      expect(warnSpy).toHaveBeenCalled();

      warnSpy.mockRestore();
    });
  });

  // =========================================================
  // writeMemoryChangesJson tests
  // =========================================================
  describe('writeMemoryChangesJson', () => {
    beforeEach(() => {
      mockFs.reset();
    });

    it('should write data sorted by updateAt descending', async () => {
      const mod = await import('./memory.js');
      const { writeMemoryChangesJson } = mod;
      const data = {
        framework: 'openpowers',
        version: '1.0.0',
        cwd: '/test/project',
        changes: [
          {
            name: 'old-change',
            path: 'openpowers/changes/old-change',
            description: 'old',
            createdAt: '2026-01-01T00:00:00Z',
            updateAt: '2026-01-01T00:00:00Z',
            status: 'active' as const,
            features: 0,
            todo: 0,
            artifacts: [],
          },
          {
            name: 'new-change',
            path: 'openpowers/changes/new-change',
            description: 'new',
            createdAt: '2026-06-01T00:00:00Z',
            updateAt: '2026-06-01T00:00:00Z',
            status: 'active' as const,
            features: 0,
            todo: 0,
            artifacts: [],
          },
        ],
      };

      writeMemoryChangesJson('/test/project', data);

      const flatCwd = '_test_project'; // flattenCwdPath('/test/project') = '_test_project'
      const filePath = `/home/test-user/.openpowers/memory/${flatCwd}/changes.json`;
      const written = JSON.parse(mockFs.fileSystem[filePath.replace(/\\/g, '/')]);
      expect(written.changes[0].name).toBe('new-change');
      expect(written.changes[1].name).toBe('old-change');
    });

    it('should not mutate the caller\'s changes array', async () => {
      const mod = await import('./memory.js');
      const { writeMemoryChangesJson } = mod;
      const data = {
        framework: 'openpowers',
        version: '1.0.0',
        cwd: '/test/project',
        changes: [
          {
            name: 'old-change',
            path: 'openpowers/changes/old-change',
            description: 'old',
            createdAt: '2026-01-01T00:00:00Z',
            updateAt: '2026-01-01T00:00:00Z',
            status: 'active' as const,
            features: 0,
            todo: 0,
            artifacts: [],
          },
          {
            name: 'new-change',
            path: 'openpowers/changes/new-change',
            description: 'new',
            createdAt: '2026-06-01T00:00:00Z',
            updateAt: '2026-06-01T00:00:00Z',
            status: 'active' as const,
            features: 0,
            todo: 0,
            artifacts: [],
          },
        ],
      };

      const originalOrder = data.changes.map((c) => c.name);
      writeMemoryChangesJson('/test/project', data);

      // Caller's array should remain in original order
      expect(data.changes.map((c) => c.name)).toEqual(originalOrder);
    });

    it('should preserve original order when both entries have no updateAt', async () => {
      const mod = await import('./memory.js');
      const { writeMemoryChangesJson } = mod;
      const data = {
        framework: 'openpowers',
        version: '1.0.0',
        cwd: '/test/project',
        changes: [
          {
            name: 'alpha-change',
            path: 'openpowers/changes/alpha-change',
            description: 'alpha',
            createdAt: '2026-01-01T00:00:00Z',
            status: 'active' as const,
            features: 0,
            todo: 0,
            artifacts: [],
          },
          {
            name: 'beta-change',
            path: 'openpowers/changes/beta-change',
            description: 'beta',
            createdAt: '2026-06-01T00:00:00Z',
            status: 'active' as const,
            features: 0,
            todo: 0,
            artifacts: [],
          },
        ],
      };

      writeMemoryChangesJson('/test/project', data);

      const flatCwd = '_test_project';
      const filePath = `/home/test-user/.openpowers/memory/${flatCwd}/changes.json`;
      const written = JSON.parse(mockFs.fileSystem[filePath.replace(/\\/g, '/')]);
      expect(written.changes[0].name).toBe('alpha-change');
      expect(written.changes[1].name).toBe('beta-change');
    });

    it('should place entries without updateAt at the end', async () => {
      const mod = await import('./memory.js');
      const { writeMemoryChangesJson } = mod;
      const data = {
        framework: 'openpowers',
        version: '1.0.0',
        cwd: '/test/project',
        changes: [
          {
            name: 'no-update',
            path: 'openpowers/changes/no-update',
            description: 'no updateAt',
            createdAt: '2026-01-01T00:00:00Z',
            status: 'active' as const,
            features: 0,
            todo: 0,
            artifacts: [],
          },
          {
            name: 'with-update',
            path: 'openpowers/changes/with-update',
            description: 'has updateAt',
            createdAt: '2026-06-01T00:00:00Z',
            updateAt: '2026-06-01T00:00:00Z',
            status: 'active' as const,
            features: 0,
            todo: 0,
            artifacts: [],
          },
        ],
      };

      writeMemoryChangesJson('/test/project', data);

      const flatCwd = '_test_project'; // flattenCwdPath('/test/project') = '_test_project'
      const filePath = `/home/test-user/.openpowers/memory/${flatCwd}/changes.json`;
      const written = JSON.parse(mockFs.fileSystem[filePath.replace(/\\/g, '/')]);
      expect(written.changes[0].name).toBe('with-update');
      expect(written.changes[1].name).toBe('no-update');
    });
  });

  // =========================================================
  // seedFromProjectChangesJson tests (via readMemoryChangesJson / ensureMemoryChangesJson)
  // =========================================================
  describe('seedFromProjectChangesJson', () => {
    beforeEach(() => {
      mockFs.reset();
    });

    it('should seed from openpowers/changes.json with changes + archive entries', async () => {
      // Arrange: no memory file, but project changes.json exists with changes and archive
      const projectPath = '/test/project/openpowers/changes.json';
      // Set up directories so checkPathsExist doesn't mark entries as 'removed'
      mockFs.setDir('/test/project/openpowers/changes/active-change');
      mockFs.setDir('/test/project/openpowers/changes/archived-change');
      mockFs.setFile(projectPath, JSON.stringify({
        name: 'openpowers',
        changes: [
          {
            name: 'active-change',
            path: 'openpowers/changes/active-change',
            description: 'An active change',
            createdAt: '2026-06-01T00:00:00Z',
            updateAt: '2026-06-05T00:00:00Z',
            features: 3,
            todo: 1,
            artifacts: [{ id: 'proposal', outputPath: 'openpowers/changes/active-change/proposal.md' }],
          },
        ],
        archive: [
          {
            name: 'archived-change',
            path: 'openpowers/changes/archived-change',
            description: 'An archived change',
            createdAt: '2026-05-01T00:00:00Z',
            closedAt: '2026-05-15T00:00:00Z',
            features: 5,
            artifacts: [],
          },
        ],
      }));

      const mod = await import('./memory.js');
      const { readMemoryChangesJson } = mod;
      const result = readMemoryChangesJson('/test/project');

      expect(result.framework).toBe('@meiyukichan/openpowers');
      expect(result.version).toBeDefined();
      expect(result.cwd).toBe('/test/project');
      expect(result.changes).toHaveLength(2);

      // Active change
      const active = result.changes.find((c: { name: string }) => c.name === 'active-change');
      expect(active).toBeDefined();
      expect(active!.status).toBe('active');
      expect(active!.description).toBe('An active change');
      expect(active!.features).toBe(3);
      expect(active!.todo).toBe(1);
      expect(active!.artifacts).toHaveLength(1);

      // Archived change
      const archived = result.changes.find((c: { name: string }) => c.name === 'archived-change');
      expect(archived).toBeDefined();
      expect(archived!.status).toBe('archived');
      expect(archived!.description).toBe('An archived change');
      expect(archived!.features).toBe(5);
      expect(archived!.todo).toBe(0);
      expect(archived!.updateAt).toBe('2026-05-15T00:00:00Z');
    });

    it('should return default structure when openpowers/changes.json does not exist', async () => {
      // Arrange: no memory file, no project changes.json
      // (mockFs.reset() already clears everything)

      const mod = await import('./memory.js');
      const { readMemoryChangesJson } = mod;
      const result = readMemoryChangesJson('/test/project');

      expect(result.framework).toBe('@meiyukichan/openpowers');
      expect(result.version).toBeDefined();
      expect(result.cwd).toBe('/test/project');
      expect(result.changes).toEqual([]);
    });

    it('should return default structure when openpowers/changes.json exists but contains malformed JSON', async () => {
      // Arrange: project changes.json exists with corrupted content, no memory file
      const projectPath = '/test/project/openpowers/changes.json';
      mockFs.setFile(projectPath, 'not valid json {{{');

      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const mod = await import('./memory.js');
      const { readMemoryChangesJson } = mod;
      const result = readMemoryChangesJson('/test/project');

      expect(result.framework).toBe('@meiyukichan/openpowers');
      expect(result.version).toBeDefined();
      expect(result.cwd).toBe('/test/project');
      expect(result.changes).toEqual([]);
      expect(warnSpy).toHaveBeenCalled();

      warnSpy.mockRestore();
    });

    it('should fallback on malformed JSON parse failure in ensureMemoryChangesJson catch branch', async () => {
      // Arrange: memory file exists with invalid JSON content
      const flatCwd = '_test_project';
      const memoryPath = `/home/test-user/.openpowers/memory/${flatCwd}/changes.json`;
      mockFs.setFile(memoryPath, '{ broken json !!!');

      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const mod = await import('./memory.js');
      const { ensureMemoryChangesJson } = mod;
      const result = ensureMemoryChangesJson('/test/project');

      // Falls back to seedFromProjectChangesJson (no project file either → defaults)
      expect(result.framework).toBe('@meiyukichan/openpowers');
      expect(result.cwd).toBe('/test/project');
      expect(result.changes).toEqual([]);
      expect(warnSpy).toHaveBeenCalled();

      warnSpy.mockRestore();
    });
  });

  // =========================================================
  // createOrUpdateChange tests
  // =========================================================
  describe('createOrUpdateChange', () => {
    beforeEach(() => {
      mockFs.reset();
    });

    it('should create new file with entry when file does not exist', async () => {
      const mod = await import('./memory.js');
      const { createOrUpdateChange } = mod;
      createOrUpdateChange('/test/project', 'my-change', 'test description');

      const flatCwd = '_test_project'; // flattenCwdPath('/test/project') = '_test_project'
      const filePath = `/home/test-user/.openpowers/memory/${flatCwd}/changes.json`;
      const written = JSON.parse(mockFs.fileSystem[filePath.replace(/\\/g, '/')]);
      expect(written.changes).toHaveLength(1);
      expect(written.changes[0].name).toBe('my-change');
      expect(written.changes[0].description).toBe('test description');
      expect(written.changes[0].features).toBe(0);
      expect(written.changes[0].todo).toBe(0);
      expect(written.changes[0].artifacts).toEqual([]);
      expect(written.changes[0].stage).toBeUndefined();
    });

    it('should append new entry when file exists but change does not exist', async () => {
      const flatCwd = '_test_project'; // flattenCwdPath('/test/project') = '_test_project'
      const filePath = `/home/test-user/.openpowers/memory/${flatCwd}/changes.json`;
      const existingData = {
        framework: 'openpowers',
        version: '1.0.0',
        cwd: '/test/project',
        changes: [
          {
            name: 'existing-change',
            path: 'openpowers/changes/existing-change',
            description: 'existing',
            createdAt: '2026-01-01T00:00:00Z',
            features: 0,
            todo: 0,
            artifacts: [],
          },
        ],
      };
      mockFs.setFile(filePath, JSON.stringify(existingData));

      const mod = await import('./memory.js');
      const { createOrUpdateChange } = mod;
      createOrUpdateChange('/test/project', 'new-change', 'new description');

      const written = JSON.parse(mockFs.fileSystem[filePath.replace(/\\/g, '/')]);
      expect(written.changes).toHaveLength(2);
      // New entry has updateAt, sorts before the existing entry without updateAt
      expect(written.changes[0].name).toBe('new-change');
      expect(written.changes[0].description).toBe('new description');
      expect(written.changes[1].name).toBe('existing-change');
    });

    it('should update existing entry when change already exists', async () => {
      const flatCwd = '_test_project'; // flattenCwdPath('/test/project') = '_test_project'
      const filePath = `/home/test-user/.openpowers/memory/${flatCwd}/changes.json`;
      const existingData = {
        framework: 'openpowers',
        version: '1.0.0',
        cwd: '/test/project',
        changes: [
          {
            name: 'my-change',
            path: 'openpowers/changes/my-change',
            description: 'old description',
            createdAt: '2026-01-01T00:00:00Z',
            features: 0,
            todo: 0,
            artifacts: [],
          },
        ],
      };
      mockFs.setFile(filePath, JSON.stringify(existingData));

      const mod = await import('./memory.js');
      const { createOrUpdateChange } = mod;
      createOrUpdateChange('/test/project', 'my-change', 'updated description');

      const written = JSON.parse(mockFs.fileSystem[filePath.replace(/\\/g, '/')]);
      expect(written.changes).toHaveLength(1);
      expect(written.changes[0].name).toBe('my-change');
      expect(written.changes[0].description).toBe('updated description');
      expect(written.changes[0].updateAt).toBeDefined();
    });

    it('should write stage field when changeStage parameter is provided', async () => {
      const flatCwd = '_test_project'; // flattenCwdPath('/test/project') = '_test_project'
      const filePath = `/home/test-user/.openpowers/memory/${flatCwd}/changes.json`;
      const existingData = {
        framework: 'openpowers',
        version: '1.0.0',
        cwd: '/test/project',
        changes: [
          {
            name: 'my-change',
            path: 'openpowers/changes/my-change',
            description: 'old description',
            createdAt: '2026-01-01T00:00:00Z',
            features: 0,
            todo: 0,
            artifacts: [],
          },
        ],
      };
      mockFs.setFile(filePath, JSON.stringify(existingData));

      const mod = await import('./memory.js');
      const { createOrUpdateChange } = mod;
      const changeStage = {
        explore: { title: 'Explore', from: '2026-06-01T00:00:00Z', to: '2026-06-01T00:00:00Z', status: 'in_progress' as const, inputPath: '', outputPath: '' },
      };
      createOrUpdateChange('/test/project', 'my-change', undefined, changeStage);

      const written = JSON.parse(mockFs.fileSystem[filePath.replace(/\\/g, '/')]);
      expect(written.changes).toHaveLength(1);
      expect(written.changes[0].name).toBe('my-change');
      expect(written.changes[0].stage).toBeDefined();
      expect(written.changes[0].stage.explore.title).toBe('Explore');
      expect(written.changes[0].stage.explore.status).toBe('in_progress');
    });

    it('should not affect stage field when changeStage is not provided', async () => {
      const flatCwd = '_test_project'; // flattenCwdPath('/test/project') = '_test_project'
      const filePath = `/home/test-user/.openpowers/memory/${flatCwd}/changes.json`;
      const existingStage = {
        explore: { title: 'Explore', from: '2026-01-01T00:00:00Z', to: '2026-01-01T00:00:00Z', status: 'done', inputPath: '/in', outputPath: '/out' },
      };
      const existingData = {
        framework: 'openpowers',
        version: '1.0.0',
        cwd: '/test/project',
        changes: [
          {
            name: 'my-change',
            path: 'openpowers/changes/my-change',
            description: 'old description',
            createdAt: '2026-01-01T00:00:00Z',
            features: 0,
            todo: 0,
            artifacts: [],
            stage: existingStage,
          },
        ],
      };
      mockFs.setFile(filePath, JSON.stringify(existingData));

      const mod = await import('./memory.js');
      const { createOrUpdateChange } = mod;
      createOrUpdateChange('/test/project', 'my-change', 'updated description');

      const written = JSON.parse(mockFs.fileSystem[filePath.replace(/\\/g, '/')]);
      expect(written.changes).toHaveLength(1);
      expect(written.changes[0].stage).toBeDefined();
      expect(written.changes[0].stage.explore.status).toBe('done');
      expect(written.changes[0].stage.explore.title).toBe('Explore');
      expect(written.changes[0].description).toBe('updated description');
    });

    it('should preserve existing description when desc parameter is undefined', async () => {
      const flatCwd = '_test_project'; // flattenCwdPath('/test/project') = '_test_project'
      const filePath = `/home/test-user/.openpowers/memory/${flatCwd}/changes.json`;
      const existingData = {
        framework: 'openpowers',
        version: '1.0.0',
        cwd: '/test/project',
        changes: [
          {
            name: 'my-change',
            path: 'openpowers/changes/my-change',
            description: 'original description',
            createdAt: '2026-01-01T00:00:00Z',
            features: 0,
            todo: 0,
            artifacts: [],
          },
        ],
      };
      mockFs.setFile(filePath, JSON.stringify(existingData));

      const mod = await import('./memory.js');
      const { createOrUpdateChange } = mod;
      createOrUpdateChange('/test/project', 'my-change'); // no desc param

      const written = JSON.parse(mockFs.fileSystem[filePath.replace(/\\/g, '/')]);
      expect(written.changes).toHaveLength(1);
      expect(written.changes[0].name).toBe('my-change');
      expect(written.changes[0].description).toBe('original description'); // preserved
      expect(written.changes[0].updateAt).toBeDefined();
    });

    it('should set artifacts to empty array when no artifact files exist in change directory', async () => {
      const mod = await import('./memory.js');
      const { createOrUpdateChange } = mod;

      // Set up change directory but no artifact files (proposal.md, design.md, etc.)
      mockFs.setDir('/test/project/openpowers/changes/my-change');

      createOrUpdateChange('/test/project', 'my-change', 'test description');

      const flatCwd = '_test_project';
      const filePath = `/home/test-user/.openpowers/memory/${flatCwd}/changes.json`;
      const written = JSON.parse(mockFs.fileSystem[filePath.replace(/\\/g, '/')]);
      expect(written.changes).toHaveLength(1);
      expect(written.changes[0].artifacts).toEqual([]);
    });

    it('should detect all 6 artifact types when they exist in change directory', async () => {
      const mod = await import('./memory.js');
      const { createOrUpdateChange } = mod;

      // Set up all 6 artifact files in the change directory
      const changeDir = '/test/project/openpowers/changes/my-change';
      mockFs.setDir(changeDir);
      mockFs.setFile(`${changeDir}/proposal.md`, '# Proposal');
      mockFs.setFile(`${changeDir}/design.md`, '# Design');
      mockFs.setDir(`${changeDir}/specs`);
      mockFs.setFile(`${changeDir}/api.yaml`, 'openapi: 3.0');
      mockFs.setFile(`${changeDir}/database.md`, '# Database');
      mockFs.setFile(`${changeDir}/plan.json`, '[]');

      createOrUpdateChange('/test/project', 'my-change', 'all artifacts');

      const flatCwd = '_test_project';
      const filePath = `/home/test-user/.openpowers/memory/${flatCwd}/changes.json`;
      const written = JSON.parse(mockFs.fileSystem[filePath.replace(/\\/g, '/')]);
      expect(written.changes).toHaveLength(1);
      expect(written.changes[0].artifacts).toHaveLength(6);
      expect(written.changes[0].artifacts[0].id).toBe('proposal');
      expect(written.changes[0].artifacts[1].id).toBe('design');
      expect(written.changes[0].artifacts[2].id).toBe('specs');
      expect(written.changes[0].artifacts[3].id).toBe('api');
      expect(written.changes[0].artifacts[4].id).toBe('database');
      expect(written.changes[0].artifacts[5].id).toBe('plan');
    });
  });

  // =========================================================
  // syncEntryProgress with stage preservation
  // =========================================================
  describe('syncEntryProgress stage preservation', () => {
    beforeEach(() => {
      mockFs.reset();
    });

    it('should preserve stage field when syncEntryProgress updates progress', async () => {
      const mod = await import('./memory.js');
      const { createOrUpdateChange } = mod;

      // Create an entry first with stage
      const stageData = {
        explore: { title: 'Explore', from: '2026-06-01T00:00:00Z', to: '2026-06-01T00:00:00Z', status: 'done' as const, inputPath: '/in', outputPath: '/out' },
      };
      createOrUpdateChange('/test/project', 'my-change', undefined, stageData);

      // Now update the change without changeStage - stage should be preserved
      createOrUpdateChange('/test/project', 'my-change', 'updated description');

      const flatCwd = '_test_project';
      const filePath = `/home/test-user/.openpowers/memory/${flatCwd}/changes.json`;
      const written = JSON.parse(mockFs.fileSystem[filePath.replace(/\\/g, '/')]);
      expect(written.changes[0].stage).toBeDefined();
      expect(written.changes[0].stage.explore.status).toBe('done');
      expect(written.changes[0].stage.explore.title).toBe('Explore');
      expect(written.changes[0].stage.explore.from).toBe('2026-06-01T00:00:00Z');
      expect(written.changes[0].description).toBe('updated description');
    });

    it('should merge stage with progress updates in single operation', async () => {
      const mod = await import('./memory.js');
      const { createOrUpdateChange } = mod;

      // Set up plan.json for the change directory (to trigger progress computation)
      const planJsonPath = '/test/project/openpowers/changes/my-change/plan.json';
      mockFs.setFile(planJsonPath, JSON.stringify([
        { featureId: 'feat-1', status: 'in_progress' },
        { featureId: 'feat-2', status: 'done' },
      ]));

      // Set up a directory entry for the change path so existsSync returns true
      mockFs.setDir('/test/project/openpowers/changes/my-change');

      const stageData = {
        explore: { title: 'Explore', from: '2026-06-01T00:00:00Z', to: '2026-06-01T00:00:00Z', status: 'in_progress' as const, inputPath: '', outputPath: '' },
      };
      createOrUpdateChange('/test/project', 'my-change', 'with progress', stageData);

      const flatCwd = '_test_project';
      const filePath = `/home/test-user/.openpowers/memory/${flatCwd}/changes.json`;
      const written = JSON.parse(mockFs.fileSystem[filePath.replace(/\\/g, '/')]);
      expect(written.changes[0].stage).toBeDefined();
      expect(written.changes[0].stage.explore.status).toBe('in_progress');
      expect(written.changes[0].features).toBe(2);
      expect(written.changes[0].todo).toBe(1);
      expect(written.changes[0].description).toBe('with progress');
    });

    it('should keep existing features and todo counts when plan.json contains non-array content', async () => {
      const flatCwd = '_test_project'; // flattenCwdPath('/test/project') = '_test_project'
      const filePath = `/home/test-user/.openpowers/memory/${flatCwd}/changes.json`;
      const existingData = {
        framework: 'openpowers',
        version: '1.0.0',
        cwd: '/test/project',
        changes: [
          {
            name: 'my-change',
            path: 'openpowers/changes/my-change',
            description: 'test',
            createdAt: '2026-01-01T00:00:00Z',
            features: 5,
            todo: 3,
            artifacts: [],
          },
        ],
      };
      mockFs.setFile(filePath, JSON.stringify(existingData));

      // Set up plan.json with a non-array value (an object)
      const planJsonPath = '/test/project/openpowers/changes/my-change/plan.json';
      mockFs.setFile(planJsonPath, JSON.stringify({ features: 'not-an-array' }));

      const mod = await import('./memory.js');
      const { createOrUpdateChange } = mod;
      createOrUpdateChange('/test/project', 'my-change', 'updated');

      const written = JSON.parse(mockFs.fileSystem[filePath.replace(/\\/g, '/')]);
      expect(written.changes).toHaveLength(1);
      expect(written.changes[0].features).toBe(5); // preserved, not overwritten
      expect(written.changes[0].todo).toBe(3); // preserved
    });
  });

  // =========================================================
  // createOrUpdateStage tests
  // =========================================================
  describe('createOrUpdateStage', () => {
    it('should call exploreStage when changeStage contains explore data', async () => {
      const mod = await import('./memory.js');
      const { createOrUpdateStage } = mod;

      const entry: Record<string, unknown> = {
        name: 'test-change',
        path: 'openpowers/changes/test-change',
        description: 'test',
        createdAt: '2026-01-01T00:00:00Z',
        status: 'active',
        features: 0,
        todo: 0,
        artifacts: [],
      };

      createOrUpdateStage(entry as any, {
        explore: { title: 'Explore Phase', from: '2026-06-01T00:00:00Z', to: '2026-06-01T00:00:00Z', status: 'in_progress', inputPath: '/in', outputPath: '/out' },
      });

      expect(entry.stage).toBeDefined();
      expect((entry.stage as any).explore.title).toBe('Explore Phase');
      expect((entry.stage as any).explore.status).toBe('in_progress');
      expect((entry.stage as any).explore.from).toBe('2026-06-01T00:00:00Z');
      expect((entry.stage as any).explore.inputPath).toBe('/in');
      expect((entry.stage as any).explore.outputPath).toBe('/out');
    });

    it('should not add stage when changeStage is empty', async () => {
      const mod = await import('./memory.js');
      const { createOrUpdateStage } = mod;

      const entry: Record<string, unknown> = {
        name: 'test-change',
        path: 'openpowers/changes/test-change',
        description: 'test',
        createdAt: '2026-01-01T00:00:00Z',
        status: 'active',
        features: 0,
        todo: 0,
        artifacts: [],
      };

      createOrUpdateStage(entry as any, {});

      expect(entry.stage).toBeUndefined();
    });

    it('should dispatch to brainstormStage without throwing (no-op placeholder)', async () => {
      const mod = await import('./memory.js');
      const { createOrUpdateStage } = mod;

      const entry: Record<string, unknown> = {
        name: 'test-change',
        path: 'openpowers/changes/test-change',
        description: 'test',
        createdAt: '2026-01-01T00:00:00Z',
        status: 'active',
        features: 0,
        todo: 0,
        artifacts: [],
      };
      const snapshot = JSON.stringify(entry);

      expect(() =>
        createOrUpdateStage(entry as any, {
          brainstorm: { title: 'Test', from: '', to: '', status: 'in_progress' },
        }),
      ).not.toThrow();
      expect(JSON.stringify(entry)).toBe(snapshot);
    });

    it('should dispatch to proposeStage without throwing (no-op placeholder)', async () => {
      const mod = await import('./memory.js');
      const { createOrUpdateStage } = mod;

      const entry: Record<string, unknown> = {
        name: 'test-change',
        path: 'openpowers/changes/test-change',
        description: 'test',
        createdAt: '2026-01-01T00:00:00Z',
        status: 'active',
        features: 0,
        todo: 0,
        artifacts: [],
      };
      const snapshot = JSON.stringify(entry);

      expect(() =>
        createOrUpdateStage(entry as any, {
          propose: { title: 'Test', from: '', to: '', status: 'in_progress' },
        }),
      ).not.toThrow();
      expect(JSON.stringify(entry)).toBe(snapshot);
    });

    it('should dispatch to planStage without throwing (no-op placeholder)', async () => {
      const mod = await import('./memory.js');
      const { createOrUpdateStage } = mod;

      const entry: Record<string, unknown> = {
        name: 'test-change',
        path: 'openpowers/changes/test-change',
        description: 'test',
        createdAt: '2026-01-01T00:00:00Z',
        status: 'active',
        features: 0,
        todo: 0,
        artifacts: [],
      };
      const snapshot = JSON.stringify(entry);

      expect(() =>
        createOrUpdateStage(entry as any, {
          plan: { title: 'Test', from: '', to: '', status: 'in_progress' },
        }),
      ).not.toThrow();
      expect(JSON.stringify(entry)).toBe(snapshot);
    });

    it('should dispatch to reviewArtifactsStage without throwing (no-op placeholder)', async () => {
      const mod = await import('./memory.js');
      const { createOrUpdateStage } = mod;

      const entry: Record<string, unknown> = {
        name: 'test-change',
        path: 'openpowers/changes/test-change',
        description: 'test',
        createdAt: '2026-01-01T00:00:00Z',
        status: 'active',
        features: 0,
        todo: 0,
        artifacts: [],
      };
      const snapshot = JSON.stringify(entry);

      expect(() =>
        createOrUpdateStage(entry as any, {
          reviewArtifacts: { title: 'Test', from: '', to: '', status: 'in_progress' },
        }),
      ).not.toThrow();
      expect(JSON.stringify(entry)).toBe(snapshot);
    });

    it('should dispatch to subAgentDevStage without throwing (no-op placeholder)', async () => {
      const mod = await import('./memory.js');
      const { createOrUpdateStage } = mod;

      const entry: Record<string, unknown> = {
        name: 'test-change',
        path: 'openpowers/changes/test-change',
        description: 'test',
        createdAt: '2026-01-01T00:00:00Z',
        status: 'active',
        features: 0,
        todo: 0,
        artifacts: [],
      };
      const snapshot = JSON.stringify(entry);

      expect(() =>
        createOrUpdateStage(entry as any, {
          subAgentDev: [{ featureId: 'feat-1', progress: [] }],
        }),
      ).not.toThrow();
      expect(JSON.stringify(entry)).toBe(snapshot);
    });

    it('should dispatch to finalizeStage without throwing (no-op placeholder)', async () => {
      const mod = await import('./memory.js');
      const { createOrUpdateStage } = mod;

      const entry: Record<string, unknown> = {
        name: 'test-change',
        path: 'openpowers/changes/test-change',
        description: 'test',
        createdAt: '2026-01-01T00:00:00Z',
        status: 'active',
        features: 0,
        todo: 0,
        artifacts: [],
      };
      const snapshot = JSON.stringify(entry);

      expect(() =>
        createOrUpdateStage(entry as any, {
          finalize: {
            integration: { title: '', from: '', to: '', status: 'in_progress' },
          },
        }),
      ).not.toThrow();
      expect(JSON.stringify(entry)).toBe(snapshot);
    });

    it('should dispatch to finalizeStage with partial data (finalize.integration alias mapping from CLI)', async () => {
      const mod = await import('./memory.js');
      const { createOrUpdateStage } = mod;

      const entry: Record<string, unknown> = {
        name: 'test-change',
        path: 'openpowers/changes/test-change',
        description: 'test',
        createdAt: '2026-01-01T00:00:00Z',
        status: 'active',
        features: 0,
        todo: 0,
        artifacts: [],
      };
      const snapshot = JSON.stringify(entry);

      // Simulates the CLI integration alias: { finalize: { integration: StageStep } }
      expect(() =>
        createOrUpdateStage(entry as any, {
          finalize: {
            integration: { title: 'Integration Step', from: '2026-06-01T00:00:00Z', to: '2026-06-01T00:00:00Z', status: 'done', inputPath: '/in', outputPath: '/out' },
          },
        }),
      ).not.toThrow();
      expect(JSON.stringify(entry)).toBe(snapshot);
    });

    it('should not add stage.explore when explore data is undefined in changeStage', async () => {
      const mod = await import('./memory.js');
      const { createOrUpdateStage } = mod;

      const entry: Record<string, unknown> = {
        name: 'test-change',
        path: 'openpowers/changes/test-change',
        description: 'test',
        createdAt: '2026-01-01T00:00:00Z',
        status: 'active',
        features: 0,
        todo: 0,
        artifacts: [],
      };
      const snapshot = JSON.stringify(entry);

      createOrUpdateStage(entry as any, { explore: undefined });

      expect(JSON.stringify(entry)).toBe(snapshot); // unchanged
      expect(entry.stage).toBeUndefined();
    });
  });

  // =========================================================
  // exploreStage tests (via createOrUpdateStage)
  // =========================================================
  describe('exploreStage', () => {
    it('should fully assign explore when status is in_progress', async () => {
      const mod = await import('./memory.js');
      const { createOrUpdateStage } = mod;

      const entry: Record<string, unknown> = {
        name: 'test-change',
        path: 'openpowers/changes/test-change',
        description: 'test',
        createdAt: '2026-01-01T00:00:00Z',
        status: 'active',
        features: 0,
        todo: 0,
        artifacts: [],
      };

      createOrUpdateStage(entry as any, {
        explore: { title: 'My Explore', from: '2026-06-01T00:00:00Z', to: '2026-06-02T00:00:00Z', status: 'in_progress', inputPath: '/input', outputPath: '/output' },
      });

      expect((entry.stage as any).explore).toEqual({
        title: 'My Explore',
        from: '2026-06-01T00:00:00Z',
        to: '2026-06-02T00:00:00Z',
        status: 'in_progress',
        inputPath: '/input',
        outputPath: '/output',
      });
    });

    it('should only update outputPath/to/status when explore status is done', async () => {
      const mod = await import('./memory.js');
      const { createOrUpdateStage } = mod;

      const entry: Record<string, unknown> = {
        name: 'test-change',
        path: 'openpowers/changes/test-change',
        description: 'test',
        createdAt: '2026-01-01T00:00:00Z',
        status: 'active',
        features: 0,
        todo: 0,
        artifacts: [],
        stage: {
          explore: {
            title: 'Original Title',
            from: '2026-05-01T00:00:00Z',
            to: '2026-05-01T00:00:00Z',
            status: 'in_progress',
            inputPath: '/original-input',
            outputPath: '',
          },
        },
      };

      createOrUpdateStage(entry as any, {
        explore: { title: 'New Title', from: '2026-06-01T00:00:00Z', to: '2026-06-07T00:00:00Z', status: 'done', inputPath: '/new-input', outputPath: '/new-output' },
      });

      // from/title/inputPath preserved from original
      expect((entry.stage as any).explore.title).toBe('Original Title');
      expect((entry.stage as any).explore.from).toBe('2026-05-01T00:00:00Z');
      expect((entry.stage as any).explore.inputPath).toBe('/original-input');
      // outputPath/to/status updated
      expect((entry.stage as any).explore.outputPath).toBe('/new-output');
      expect((entry.stage as any).explore.to).toBe('2026-06-07T00:00:00Z');
      expect((entry.stage as any).explore.status).toBe('done');
    });

    it('should create minimal explore entry when status is done and no existing explore', async () => {
      const mod = await import('./memory.js');
      const { createOrUpdateStage } = mod;

      const entry: Record<string, unknown> = {
        name: 'test-change',
        path: 'openpowers/changes/test-change',
        description: 'test',
        createdAt: '2026-01-01T00:00:00Z',
        status: 'active',
        features: 0,
        todo: 0,
        artifacts: [],
        // No stage field at all - triggers !entry.stage.explore branch
      };

      createOrUpdateStage(entry as any, {
        explore: { title: 'New Explore', from: '2026-06-01T00:00:00Z', to: '2026-06-07T00:00:00Z', status: 'done' as const, inputPath: '/input', outputPath: '/output' },
      });

      expect((entry.stage as any).explore).toBeDefined();
      expect((entry.stage as any).explore.title).toBe('New Explore');
      expect((entry.stage as any).explore.from).toBe('2026-06-01T00:00:00Z');
      expect((entry.stage as any).explore.to).toBe('2026-06-07T00:00:00Z');
      expect((entry.stage as any).explore.status).toBe('done');
      expect((entry.stage as any).explore.inputPath).toBe('/input');
      expect((entry.stage as any).explore.outputPath).toBe('/output');
    });

    it('should not modify explore when status is skipped', async () => {
      const mod = await import('./memory.js');
      const { createOrUpdateStage } = mod;

      const originalExplore = {
        title: 'Original',
        from: '2026-05-01T00:00:00Z',
        to: '',
        status: 'in_progress',
        inputPath: '/input',
        outputPath: '',
      };

      const entry: Record<string, unknown> = {
        name: 'test-change',
        path: 'openpowers/changes/test-change',
        description: 'test',
        createdAt: '2026-01-01T00:00:00Z',
        status: 'active',
        features: 0,
        todo: 0,
        artifacts: [],
        stage: { explore: originalExplore },
      };

      createOrUpdateStage(entry as any, {
        explore: { title: 'Skipped', from: '2026-06-01T00:00:00Z', to: '2026-06-01T00:00:00Z', status: 'skipped', inputPath: '/skipped', outputPath: '/skipped' },
      });

      expect((entry.stage as any).explore).toEqual(originalExplore);
    });

    it('should create minimal explore entry with fallback defaults when done and no existing explore with sparse fields', async () => {
      const mod = await import('./memory.js');
      const { createOrUpdateStage } = mod;

      const entry: Record<string, unknown> = {
        name: 'test-change',
        path: 'openpowers/changes/test-change',
        description: 'test',
        createdAt: '2026-01-01T00:00:00Z',
        status: 'active',
        features: 0,
        todo: 0,
        artifacts: [],
        // No stage field at all
      };

      const beforeCall = new Date().toISOString();
      createOrUpdateStage(entry as any, {
        explore: { status: 'done' as const }, // minimal fields
      });

      expect((entry.stage as any).explore).toBeDefined();
      expect((entry.stage as any).explore.status).toBe('done');
      // When title is undefined, falls back to ''
      expect((entry.stage as any).explore.title).toBe('');
      // When from is undefined, falls back to current date (rough check)
      expect(typeof (entry.stage as any).explore.from).toBe('string');
      // inputPath/outputPath fall back to ''
      expect((entry.stage as any).explore.inputPath).toBe('');
      expect((entry.stage as any).explore.outputPath).toBe('');
    });

    it('should preserve existing outputPath and to when explore done data does not include them', async () => {
      const mod = await import('./memory.js');
      const { createOrUpdateStage } = mod;

      const entry: Record<string, unknown> = {
        name: 'test-change',
        path: 'openpowers/changes/test-change',
        description: 'test',
        createdAt: '2026-01-01T00:00:00Z',
        status: 'active',
        features: 0,
        todo: 0,
        artifacts: [],
        stage: {
          explore: {
            title: 'Original Title',
            from: '2026-05-01T00:00:00Z',
            to: '2026-05-10T00:00:00Z',
            status: 'in_progress',
            inputPath: '/original-input',
            outputPath: '/original-output',
          },
        },
      };

      createOrUpdateStage(entry as any, {
        explore: { status: 'done' as const }, // no outputPath, no to, no title, no from
      });

      expect((entry.stage as any).explore.status).toBe('done');
      expect((entry.stage as any).explore.outputPath).toBe('/original-output'); // preserved
      expect((entry.stage as any).explore.to).toBe('2026-05-10T00:00:00Z'); // preserved
      expect((entry.stage as any).explore.title).toBe('Original Title'); // preserved
      expect((entry.stage as any).explore.from).toBe('2026-05-01T00:00:00Z'); // preserved
      expect((entry.stage as any).explore.inputPath).toBe('/original-input'); // preserved
    });
  });
});
