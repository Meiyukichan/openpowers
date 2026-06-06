/**
 * Changes data model — standalone zod schemas and inferred types for changes.json
 *
 * This module defines the complete changes.json data model independently from
 * src/commands/change/stage.ts. Both modules coexist; the old stage.ts schemas
 * (BasicStage without title, SubAgentDevItemSchema with fixed sub-stages) are
 * preserved unchanged. This module introduces the updated data model with
 * title-bearing StageStep and a flexible SubAgentDevProgress array.
 *
 * @author Meiyuki <meiyukichan@163.com>
 * @copyright 2026 Meiyuki
 */

import { z } from 'zod';

// =========================================================
// Base stage step (with title)
// =========================================================

/** Schema for a single stage step with title metadata */
export const StageStepSchema = z.object({
  title: z.string(),
  from: z.string(),
  to: z.string(),
  status: z.string(),
});

/** Type for a single stage step */
export type StageStep = z.infer<typeof StageStepSchema>;

// =========================================================
// Sub-agent dev progress
// =========================================================

/** Schema for a sub-agent dev progress entry: featureId + progress array */
export const SubAgentDevProgressSchema = z.object({
  featureId: z.string(),
  progress: z.array(StageStepSchema),
});

/** Type for a sub-agent dev progress entry */
export type SubAgentDevProgress = z.infer<typeof SubAgentDevProgressSchema>;

// =========================================================
// Finalize stage
// =========================================================

/** Schema for the finalize stage with integration/codecheck/archive sub-stages */
export const FinalizeStageSchema = z.object({
  integration: StageStepSchema,
  codecheck: StageStepSchema,
  archive: StageStepSchema,
});

/** Type for the finalize stage */
export type FinalizeStage = z.infer<typeof FinalizeStageSchema>;

// =========================================================
// Full change stage
// =========================================================

/** Schema for the full change stage with all seven workflow stages */
export const ChangeStageSchema = z.object({
  explore: StageStepSchema,
  brainstorm: StageStepSchema,
  propose: StageStepSchema,
  plan: StageStepSchema,
  reviewArtifacts: StageStepSchema,
  subAgentDev: z.array(SubAgentDevProgressSchema),
  finalize: FinalizeStageSchema,
});

/** Type for the full change stage */
export type ChangeStage = z.infer<typeof ChangeStageSchema>;

// =========================================================
// Change entry
// =========================================================

/** Schema for a single change entry in changes.json */
export const ChangeEntrySchema = z.object({
  name: z.string(),
  path: z.string(),
  description: z.string(),
  createdAt: z.string(),
  updateAt: z.string().optional(),
  features: z.number(),
  todo: z.number(),
  artifacts: z.array(z.object({ id: z.string(), outputPath: z.string() })),
  stage: ChangeStageSchema.optional(),
});

/** Type for a single change entry */
export type ChangeEntry = z.infer<typeof ChangeEntrySchema>;

// =========================================================
// Top-level changes.json
// =========================================================

/** Schema for the top-level changes.json structure (with cwd) */
export const ChangesJsonSchema = z.object({
  framework: z.string(),
  version: z.string(),
  cwd: z.string(),
  changes: z.array(ChangeEntrySchema),
});

/** Type for the top-level changes.json structure */
export type ChangesJson = z.infer<typeof ChangesJsonSchema>;
