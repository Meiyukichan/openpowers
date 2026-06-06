/**
 * @fileoverview Tests for utils/changes.ts — changes.json data model schemas and types
 * @author Meiyuki <meiyukichan@163.com>
 * @copyright 2026 Meiyuki
 */

import { describe, it, expect } from 'vitest';

describe('src/utils/changes.ts', () => {
  // =========================================================
  // StageStepSchema tests
  // =========================================================
  describe('StageStepSchema', () => {
    it('should accept valid { title, from, to, status } strings', async () => {
      const mod = await import('./changes.js');
      const { StageStepSchema } = mod;
      const result = StageStepSchema.parse({ title: 'Explore', from: '', to: '', status: 'ready' });
      expect(result).toEqual({ title: 'Explore', from: '', to: '', status: 'ready' });
    });

    it('should reject missing title field', async () => {
      const mod = await import('./changes.js');
      const { StageStepSchema } = mod;
      expect(() => StageStepSchema.parse({ from: '', to: '', status: 'ready' })).toThrow();
    });

    it('should reject non-string title field', async () => {
      const mod = await import('./changes.js');
      const { StageStepSchema } = mod;
      expect(() => StageStepSchema.parse({ title: 123, from: '', to: '', status: 'ready' })).toThrow();
    });
  });

  // =========================================================
  // SubAgentDevProgressSchema tests
  // =========================================================
  describe('SubAgentDevProgressSchema', () => {
    it('should accept valid featureId and progress array', async () => {
      const mod = await import('./changes.js');
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
      const mod = await import('./changes.js');
      const { SubAgentDevProgressSchema } = mod;
      expect(() => SubAgentDevProgressSchema.parse({ featureId: 'feat-1' })).toThrow();
    });

    it('should reject progress with invalid items', async () => {
      const mod = await import('./changes.js');
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
      const mod = await import('./changes.js');
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
      const mod = await import('./changes.js');
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
      const mod = await import('./changes.js');
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
      const mod = await import('./changes.js');
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
      const mod = await import('./changes.js');
      const { ChangeEntrySchema } = mod;
      const result = ChangeEntrySchema.parse(minValidEntry);
      expect(result.name).toBe('my-change');
      expect(result.updateAt).toBeUndefined();
      expect(result.stage).toBeUndefined();
    });

    it('should accept entry with all optional fields including updateAt and stage', async () => {
      const mod = await import('./changes.js');
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
      const mod = await import('./changes.js');
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
      const mod = await import('./changes.js');
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
      const mod = await import('./changes.js');
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
      const mod = await import('./changes.js');
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
  // Module export integrity
  // =========================================================
  describe('Module exports', () => {
    it('should export all 6 schemas and their inferred types are usable', async () => {
      const mod = await import('./changes.js');

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
});
