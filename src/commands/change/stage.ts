/**
 * Stage model definitions and update logic for change entries
 * Contains zod schemas, types, and the updateChangeInfo function
 * @author Meiyuki <meiyukichan@163.com>
 * @copyright 2026 Meiyuki
 */

import fs from 'fs';
import path from 'path';
import { z } from 'zod';
import { CHANGES_JSON_PATH } from './shared.js';
import { computeProgress } from './shared.js';
import { buildArtifacts } from './shared.js';
import { loadOrCreateChangesJson } from './shared.js';

// =========================================================
// Zod schemas for stage structure
// =========================================================

/** Schema for a basic stage with from/to/status string fields */
export const BasicStageSchema = z.object({
  from: z.string(),
  to: z.string(),
  status: z.string(),
});

/** Type for a basic stage */
export type BasicStage = z.infer<typeof BasicStageSchema>;

/** Schema for a sub-agent dev item: featureId + four sub-stages */
const SubAgentDevItemSchema = z.object({
  featureId: z.string(),
  explore: BasicStageSchema,
  coding: BasicStageSchema,
  specReview: BasicStageSchema,
  codeReview: BasicStageSchema,
});

/** Schema for a sub-agent dev stage (array of sub-agent dev items) */
export const SubAgentDevStageSchema = z.array(SubAgentDevItemSchema);

/** Type for a sub-agent dev stage */
export type SubAgentDevStage = z.infer<typeof SubAgentDevStageSchema>;

/** Schema for the finalize stage with integration/codecheck/archive sub-stages */
export const FinalizeStageSchema = z.object({
  integration: BasicStageSchema,
  codecheck: BasicStageSchema,
  archive: BasicStageSchema,
});

/** Type for the finalize stage */
export type FinalizeStage = z.infer<typeof FinalizeStageSchema>;

/** Schema for the full change stage with all workflow stages */
export const ChangeStageSchema = z.object({
  explore: BasicStageSchema,
  brainstorm: BasicStageSchema,
  propose: BasicStageSchema,
  plan: BasicStageSchema,
  reviewArtifacts: BasicStageSchema,
  subAgentDev: SubAgentDevStageSchema,
  finalize: FinalizeStageSchema,
});

/** Type for the full change stage */
export type ChangeStage = z.infer<typeof ChangeStageSchema>;

/**
 * Schema for partial stage updates with unknown key stripping.
 * `.strip()` is the zod v4 equivalent of v3's `.stripUnknown(true)` — it silently
 * removes any keys not defined in the schema instead of throwing an error.
 */
export const StagePartialSchema = ChangeStageSchema.partial().strip();

/** Type for partial stage updates */
export type StagePartial = z.infer<typeof StagePartialSchema>;

/**
 * Updates the stage information for a change entry in changes.json.
 * Merges partial stage data into the existing stage, recomputes features/todo/artifacts,
 * and refreshes the updateAt timestamp. Throws if the change name is not found.
 * @param changeName - The change name to update
 * @param stagePartial - Partial stage data to merge (validated by StagePartialSchema)
 */
export function updateChangeInfo(changeName: string, stagePartial: StagePartial): void {
  const data = loadOrCreateChangesJson();

  // Find entry across both active changes and archive
  let entry: Record<string, unknown> | undefined;
  let isArchive = false;

  entry = data.changes.find((c) => c.name === changeName) as Record<string, unknown> | undefined;
  if (!entry) {
    entry = data.archive.find((a) => a.name === changeName) as Record<string, unknown> | undefined;
    isArchive = true;
  }

  if (!entry) {
    throw new Error(`Change '${changeName}' not found in changes.json`);
  }

  // Validate and strip unknown keys from stagePartial
  const validated = StagePartialSchema.parse(stagePartial);

  // Initialize stage field if not present
  if (!entry.stage) {
    entry.stage = {};
  }

  // Merge validated partial into existing stage
  const stage = entry.stage as Record<string, unknown>;
  for (const key of Object.keys(validated)) {
    stage[key] = (validated as Record<string, unknown>)[key];
  }

  // Determine the change path for computeProgress and buildArtifacts
  const entryPath = path.resolve(process.cwd(), String(entry.path));
  const planPath = path.join(entryPath, 'plan.json');

  // Recompute features/todo from plan.json
  const progress = computeProgress(planPath);
  entry.features = progress.features;
  if (!isArchive) {
    entry.todo = progress.todo;
  }

  // Rebuild artifacts from filesystem
  entry.artifacts = buildArtifacts(entryPath);

  // Update updateAt timestamp
  entry.updateAt = new Date().toISOString();

  // Write back to changes.json
  const dir = path.dirname(CHANGES_JSON_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(CHANGES_JSON_PATH, JSON.stringify(data, null, 2), 'utf-8');
}
