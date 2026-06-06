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
      const result = StageStepSchema.parse({ title: 'Explore', from: '', to: '', status: 'ready' });
      expect(result).toEqual({ title: 'Explore', from: '', to: '', status: 'ready' });
    });

    it('should reject missing title field', async () => {
      const mod = await import('./memory.js');
      const { StageStepSchema } = mod;
      expect(() => StageStepSchema.parse({ from: '', to: '', status: 'ready' })).toThrow();
    });

    it('should reject non-string title field', async () => {
      const mod = await import('./memory.js');
      const { StageStepSchema } = mod;
      expect(() => StageStepSchema.parse({ title: 123, from: '', to: '', status: 'ready' })).toThrow();
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
        progress: [{ title: 'TDD', from: '', to: '', status: 'pending' }],
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
          progress: [{ from: '', to: '', status: '' }],
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
        integration: { title: 'Integration', from: '', to: '', status: '' },
        codecheck: { title: 'Code Check', from: '', to: '', status: '' },
        archive: { title: 'Archive', from: '', to: '', status: '' },
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
          codecheck: { title: '', from: '', to: '', status: '' },
          archive: { title: '', from: '', to: '', status: '' },
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
        explore: { title: 'Explore', from: '', to: '', status: '' },
        brainstorm: { title: 'Brainstorm', from: '', to: '', status: '' },
        propose: { title: 'Propose', from: '', to: '', status: '' },
        plan: { title: 'Plan', from: '', to: '', status: '' },
        reviewArtifacts: { title: 'Review Artifacts', from: '', to: '', status: '' },
        subAgentDev: [],
        finalize: {
          integration: { title: '', from: '', to: '', status: '' },
          codecheck: { title: '', from: '', to: '', status: '' },
          archive: { title: '', from: '', to: '', status: '' },
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
        explore: { title: '', from: '', to: '', status: '' },
        propose: { title: '', from: '', to: '', status: '' },
        plan: { title: '', from: '', to: '', status: '' },
        reviewArtifacts: { title: '', from: '', to: '', status: '' },
        subAgentDev: [],
        finalize: {
          integration: { title: '', from: '', to: '', status: '' },
          codecheck: { title: '', from: '', to: '', status: '' },
          archive: { title: '', from: '', to: '', status: '' },
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
          propose: { title: 'Propose', from: '', to: '', status: '' },
          plan: { title: 'Plan', from: '', to: '', status: '' },
          reviewArtifacts: { title: 'Review', from: '', to: '', status: '' },
          subAgentDev: [],
          finalize: {
            integration: { title: '', from: '', to: '', status: '' },
            codecheck: { title: '', from: '', to: '', status: '' },
            archive: { title: '', from: '', to: '', status: '' },
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
            features: 0,
            todo: 0,
            artifacts: [],
          },
          {
            name: 'beta-change',
            path: 'openpowers/changes/beta-change',
            description: 'beta',
            createdAt: '2026-06-01T00:00:00Z',
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
      expect(written.changes[1].name).toBe('new-change');
      expect(written.changes[1].description).toBe('new description');
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
  });
});
