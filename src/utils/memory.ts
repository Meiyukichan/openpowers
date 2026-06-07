/**
 * Memory utility module — zod schemas, types, and utility functions for global memory
 *
 * This module provides:
 * - Changes.json data model schemas and inferred types (independent from stage.ts)
 * - flattenCwdPath: converts filesystem paths to safe directory names
 * - readMemoryChangesJson / writeMemoryChangesJson: global memory changes.json I/O
 * - createOrUpdateChange: business logic for creating or updating change entries
 *
 * @author Meiyuki <meiyukichan@163.com>
 * @copyright 2026 Meiyuki
 */

import fs from 'fs';
import os from 'os';
import path from 'path';
import module from 'module';
import { z } from 'zod';
import { normalizePath } from './common.js';

const require = module.createRequire(import.meta.url);
const pkg = require('../../package.json');

/**
 * Flattens a cwd path into a safe directory name.
 * Step 1: normalize path (collapse doubled separators, unify backslashes)
 * Step 2: replace : with _ (Windows drive letter separator)
 * Step 3: replace / with _
 * @param cwd - The current working directory path
 * @returns Flattened path safe for use as a directory name
 */
export function flattenCwdPath(cwd: string): string {
  return normalizePath(cwd).replace(/:/g, '_').replace(/\//g, '_');
}

/** Schema for a single stage step with title metadata */
export const StageStepSchema = z.object({
  title: z.string(),
  from: z.string(),
  to: z.string(),
  status: z.enum(['in_progress', 'skipped', 'done']),
  inputPath: z.string().default(''),
  outputPath: z.string().default(''),
});

/** Type for a single stage step */
export type StageStep = z.infer<typeof StageStepSchema>;

/** Schema for a sub-agent dev progress entry: featureId + progress array */
export const SubAgentDevProgressSchema = z.object({
  featureId: z.string(),
  progress: z.array(StageStepSchema),
});

/** Type for a sub-agent dev progress entry */
export type SubAgentDevProgress = z.infer<typeof SubAgentDevProgressSchema>;

/** Schema for the finalize stage with integration/codecheck/archive sub-stages */
export const FinalizeStageSchema = z.object({
  integration: StageStepSchema,
  codecheck: StageStepSchema,
  archive: StageStepSchema,
});

/** Type for the finalize stage */
export type FinalizeStage = z.infer<typeof FinalizeStageSchema>;

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

/** Input type for stage updates — permissive version accepting partial data from CLI */
export interface StageUpdate {
  explore?: Partial<StageStep>;
  brainstorm?: Partial<StageStep>;
  propose?: Partial<StageStep>;
  plan?: Partial<StageStep>;
  reviewArtifacts?: Partial<StageStep>;
  subAgentDev?: unknown[];
  finalize?: { integration?: Partial<StageStep>; codecheck?: Partial<StageStep>; archive?: Partial<StageStep> };
  review?: Partial<StageStep>;
  coding?: unknown[];
}

/** Schema for a single change entry in changes.json */
export const ChangeEntrySchema = z.object({
  name: z.string(),
  path: z.string(),
  description: z.string(),
  createdAt: z.string(),
  updateAt: z.string().optional(),
  status: z.enum(['active', 'archived', 'removed']),
  features: z.number(),
  todo: z.number(),
  artifacts: z.array(z.object({ id: z.string(), outputPath: z.string() })),
  stage: ChangeStageSchema.optional(),
});

/** Type for a single change entry */
export type ChangeEntry = z.infer<typeof ChangeEntrySchema>;

/** Schema for the top-level changes.json structure (with cwd) */
export const ChangesJsonSchema = z.object({
  framework: z.string(),
  version: z.string(),
  cwd: z.string(),
  changes: z.array(ChangeEntrySchema),
});

/** Type for the top-level changes.json structure */
export type ChangesJson = z.infer<typeof ChangesJsonSchema>;

/**
 * Returns the memory directory path for a given cwd.
 * @param cwd - The working directory path
 * @returns The full path to ~/.openpowers/memory/{flatCwd}
 */
function getMemoryDir(cwd: string): string {
  return path.join(os.homedir(), '.openpowers', 'memory', flattenCwdPath(cwd));
}

/**
 * Returns the changes.json file path for a given cwd.
 * @param cwd - The working directory path
 * @returns The full path to ~/.openpowers/memory/{flatCwd}/changes.json
 */
function getMemoryChangesJsonPath(cwd: string): string {
  return path.join(getMemoryDir(cwd), 'changes.json');
}

/**
 * Checks each change entry's path (resolved: path.join(cwd, entry.path)) for existence.
 * If the directory no longer exists, marks the entry as 'removed'.
 * @param changes - Array of change entries to validate
 * @param cwd - The working directory path
 * @returns The validated array (entries may have status changed to 'removed')
 */
function checkPathsExist(changes: ChangeEntry[], cwd: string): ChangeEntry[] {
  for (const entry of changes) {
    const fullPath = path.join(cwd, entry.path);
    if (!fs.existsSync(fullPath)) {
      entry.status = 'removed';
    }
  }
  return changes;
}

/**
 * Reads the global memory changes.json file.
 * If the file does not exist, seeds from the project-local openpowers/changes.json.
 * @param cwd - The working directory path
 * @returns The parsed ChangesJson object
 */
export function readMemoryChangesJson(cwd: string): ChangesJson {
  const filePath = getMemoryChangesJsonPath(cwd);
  if (!fs.existsSync(filePath)) {
    return seedFromProjectChangesJson(cwd);
  }
  const raw = fs.readFileSync(filePath, 'utf-8');
  try {
    return JSON.parse(raw) as ChangesJson;
  } catch {
    console.warn(`[memory] Failed to parse ${filePath}, falling back to project changes.json`);
    return seedFromProjectChangesJson(cwd);
  }
}

/**
 * Scans the openpowers/archive/ directory for a directory matching the pattern
 * YYYY-MM-DD-<changeName>. Returns the relative archive path if found, null otherwise.
 * @param cwd - The working directory path
 * @param changeName - The change name to look for
 * @returns The relative archive path or null
 */
function tryFindArchiveDir(cwd: string, changeName: string): string | null {
  const archiveDir = path.join(cwd, 'openpowers', 'archive');
  if (!fs.existsSync(archiveDir)) {
    return null;
  }
  try {
    const entries = fs.readdirSync(archiveDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name.startsWith('.')) continue;
      // Archive dirs use YYYY-MM-DD-<name> format
      const suffix = `-${changeName}`;
      if (entry.name.endsWith(suffix)) {
        return `openpowers/archive/${entry.name}`;
      }
    }
  } catch {
    // If readdir fails, treat as not found
  }
  return null;
}

/**
 * Normalizes all StageStep status fields to 'done' for an archived entry.
 * Covers: explore, brainstorm, propose, plan, reviewArtifacts, finalize (integration/codecheck/archive),
 * and all subAgentDev[].progress[] items.
 * Does NOT modify updatedAt field.
 * @param entry - The change entry to normalize
 */
function normalizeStageStatuses(entry: ChangeEntry): void {
  if (!entry.stage) return;

  const stage = entry.stage;
  const stageSteps: StageStep[] = [];

  // Top-level StageStep fields
  if (stage.explore) stageSteps.push(stage.explore);
  if (stage.brainstorm) stageSteps.push(stage.brainstorm);
  if (stage.propose) stageSteps.push(stage.propose);
  if (stage.plan) stageSteps.push(stage.plan);
  if (stage.reviewArtifacts) stageSteps.push(stage.reviewArtifacts);

  // Finalize sub-steps
  if (stage.finalize?.integration) stageSteps.push(stage.finalize.integration);
  if (stage.finalize?.codecheck) stageSteps.push(stage.finalize.codecheck);
  if (stage.finalize?.archive) stageSteps.push(stage.finalize.archive);

  for (const step of stageSteps) {
    step.status = 'done';
  }

  // subAgentDev progress items
  if (Array.isArray(stage.subAgentDev)) {
    for (const sad of stage.subAgentDev) {
      if (Array.isArray(sad.progress)) {
        for (const prog of sad.progress) {
          prog.status = 'done';
        }
      }
    }
  }
}

/**
 * Ensures the global memory changes.json file exists and syncs path existence.
 * Seeds from project-local openpowers/changes.json if the file does not exist.
 * Validates each entry's path exists on disk; marks missing as 'removed' and writes back.
 * Detects archived changes (moved from openpowers/changes/ to openpowers/archive/).
 * For archived entries, normalizes stage statuses to 'done'.
 * Does NOT modify updateAt field.
 * @param cwd - The working directory path
 * @returns The parsed and validated ChangesJson object
 */
export function ensureMemoryChangesJson(cwd: string): ChangesJson {
  const filePath = getMemoryChangesJsonPath(cwd);
  if (!fs.existsSync(filePath)) {
    return seedFromProjectChangesJson(cwd);
  }
  const raw = fs.readFileSync(filePath, 'utf-8');
  try {
    const result = JSON.parse(raw) as ChangesJson;
    result.changes = checkPathsExist(result.changes, cwd);

    // For entries marked as 'removed', check if they've been archived
    for (const entry of result.changes) {
      if (entry.status === 'removed') {
        const archivePath = tryFindArchiveDir(cwd, entry.name);
        if (archivePath) {
          entry.status = 'archived';
          entry.path = archivePath;
          normalizeStageStatuses(entry);
        }
      }
    }

    // Sync features/todo from plan.json for all entries whose path exists
    for (const entry of result.changes) {
      if (entry.status !== 'removed') {
        syncEntryFeatures(entry, cwd);
      }
    }

    writeMemoryChangesJson(cwd, result);
    return result;
  } catch {
    console.warn(`[memory] Failed to parse ${filePath}, falling back to project changes.json`);
    return seedFromProjectChangesJson(cwd);
  }
}

/**
 * Seeds memory changes.json from the project-local openpowers/changes.json.
 * Merges changes (status='active') and archive (status='archived') into a single array,
 * then writes the result to the memory file.
 * @param cwd - The working directory path
 * @returns The seeded ChangesJson object
 */
function seedFromProjectChangesJson(cwd: string): ChangesJson {
  const projectPath = path.join(cwd, 'openpowers', 'changes.json');
  const defaults: ChangesJson = {
    framework: pkg.name,
    version: pkg.version,
    cwd,
    changes: [],
  };

  if (!fs.existsSync(projectPath)) {
    return defaults;
  }

  try {
    const raw = fs.readFileSync(projectPath, 'utf-8');
    const projectData = JSON.parse(raw) as {
      changes?: Array<Record<string, unknown>>;
      archive?: Array<Record<string, unknown>>;
    };

    const merged: ChangeEntry[] = [];

    // Active changes: status = 'active'
    if (Array.isArray(projectData.changes)) {
      for (const entry of projectData.changes) {
        merged.push({
          name: String(entry.name ?? ''),
          path: String(entry.path ?? ''),
          description: String(entry.description ?? ''),
          createdAt: String(entry.createdAt ?? new Date().toISOString()),
          updateAt: (entry.updateAt as string) ?? new Date().toISOString(),
          status: 'active',
          features: Number(entry.features ?? 0),
          todo: Number(entry.todo ?? 0),
          artifacts: Array.isArray(entry.artifacts) ? (entry.artifacts as Array<{ id: string; outputPath: string }>) : [],
        });
      }
    }

    // Archived changes: status = 'archived'
    if (Array.isArray(projectData.archive)) {
      for (const entry of projectData.archive) {
        merged.push({
          name: String(entry.name ?? ''),
          path: String(entry.path ?? ''),
          description: String(entry.description ?? ''),
          createdAt: String(entry.createdAt ?? new Date().toISOString()),
          updateAt: (entry.closedAt as string) ?? (entry.updateAt as string) ?? new Date().toISOString(),
          status: 'archived',
          features: Number(entry.features ?? 0),
          todo: 0,
          artifacts: Array.isArray(entry.artifacts) ? (entry.artifacts as Array<{ id: string; outputPath: string }>) : [],
        });
      }
    }

    // Validate paths and write seeded data to memory file
    const result: ChangesJson = {
      framework: pkg.name,
      version: pkg.version,
      cwd,
      changes: checkPathsExist(merged, cwd),
    };
    writeMemoryChangesJson(cwd, result);
    return result;
  } catch {
    console.warn(`[memory] Failed to read ${projectPath}, returning default structure`);
    return defaults;
  }
}

/**
 * Writes data to the global memory changes.json file.
 * Before writing, sorts the changes array by updateAt in descending order.
 * Entries without updateAt are placed at the end.
 * @param cwd - The working directory path
 * @param data - The ChangesJson data to write
 */
export function writeMemoryChangesJson(cwd: string, data: ChangesJson): void {
  // Sort by updateAt descending; entries without updateAt go last
  // Use a shallow copy to avoid mutating the caller's array
  const sorted = [...data.changes].sort((a, b) => {
    if (!a.updateAt && !b.updateAt) return 0;
    if (!a.updateAt) return 1;
    if (!b.updateAt) return -1;
    return b.updateAt.localeCompare(a.updateAt);
  });

  const filePath = getMemoryChangesJsonPath(cwd);
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(filePath, JSON.stringify({ ...data, changes: sorted }, null, 2), 'utf-8');
}

/**
 * Builds the artifacts array for a change entry by scanning the filesystem.
 * @param entryPath - Absolute path to the change directory
 * @param changeName - The change name used in outputPath
 * @returns Array of { id, outputPath } for existing artifacts
 */
function buildArtifactsForEntry(entryPath: string, changeName: string): Array<{ id: string; outputPath: string }> {
  const artifacts: Array<{ id: string; outputPath: string }> = [];
  if (fs.existsSync(path.join(entryPath, 'proposal.md'))) artifacts.push({ id: 'proposal', outputPath: `openpowers/changes/${changeName}/proposal.md` });
  if (fs.existsSync(path.join(entryPath, 'design.md'))) artifacts.push({ id: 'design', outputPath: `openpowers/changes/${changeName}/design.md` });
  if (fs.existsSync(path.join(entryPath, 'specs'))) artifacts.push({ id: 'specs', outputPath: `openpowers/changes/${changeName}/specs/**/*.md` });
  if (fs.existsSync(path.join(entryPath, 'api.yaml'))) artifacts.push({ id: 'api', outputPath: `openpowers/changes/${changeName}/api.yaml` });
  if (fs.existsSync(path.join(entryPath, 'database.md'))) artifacts.push({ id: 'database', outputPath: `openpowers/changes/${changeName}/database.md` });
  if (fs.existsSync(path.join(entryPath, 'plan.json'))) artifacts.push({ id: 'plan', outputPath: `openpowers/changes/${changeName}/plan.json` });
  return artifacts;
}

/**
 * Syncs an entry's features and todo fields from plan.json located relative to the entry's path.
 * Does NOT modify updateAt. Does NOT write to disk.
 * @param entry - The change entry to update
 * @param cwd - The working directory path
 */
function syncEntryFeatures(entry: ChangeEntry, cwd: string): void {
  const entryPath = path.join(cwd, entry.path);
  const planPath = path.join(entryPath, 'plan.json');

  try {
    if (fs.existsSync(planPath)) {
      const raw = fs.readFileSync(planPath, 'utf-8');
      const plan = JSON.parse(raw);
      if (Array.isArray(plan)) {
        entry.features = plan.length;
        entry.todo = plan.filter((f: { status?: string }) => f.status !== 'done').length;
      }
    }
  } catch {
    // Keep existing values on parse failure
  }
}

/**
 * Syncs an entry's progress fields (features, todo, artifacts) from the filesystem.
 * References loadOrCreateChangesJson logic: reads plan.json for features/todo counts,
 * scans the change directory for artifact files. Does NOT write to disk.
 * @param entry - The change entry to update
 * @param cwd - The working directory path
 * @param changeName - The change name
 */
function syncEntryProgress(entry: ChangeEntry, cwd: string, changeName: string): void {
  const entryPath = path.join(cwd, 'openpowers', 'changes', changeName);
  const planPath = path.join(entryPath, 'plan.json');

  try {
    if (fs.existsSync(planPath)) {
      const raw = fs.readFileSync(planPath, 'utf-8');
      const plan = JSON.parse(raw);
      if (Array.isArray(plan)) {
        entry.features = plan.length;
        entry.todo = plan.filter((f: { status?: string }) => f.status !== 'done').length;
      }
    }
  } catch {
    // Keep existing values on parse failure
  }

  entry.artifacts = buildArtifactsForEntry(entryPath, changeName);
}

/**
 * Handles the explore stage update.
 * - status=in_progress: directly assigns changeStage.explore to entry.stage.explore
 * - status=done: only updates outputPath, to, status; preserves from/title/inputPath
 * - status=skipped: no-op (does not modify entry.stage.explore)
 * @param entry - The change entry to update
 * @param exploreData - The explore stage data to apply
 */
function handleExploreStage(entry: ChangeEntry, exploreData: Partial<StageStep>): void {
  if (!exploreData) {
    return;
  }

  if (!entry.stage) {
    entry.stage = {} as ChangeStage;
  }

  if (exploreData.status === 'done') {
    // Only update outputPath, to, status; preserve existing from/title/inputPath
    if (entry.stage.explore) {
      if (exploreData.outputPath !== undefined) entry.stage.explore.outputPath = exploreData.outputPath;
      if (exploreData.to !== undefined) entry.stage.explore.to = exploreData.to;
      entry.stage.explore.status = 'done';
    } else {
      // No existing explore entry; create minimal entry
      entry.stage.explore = {
        title: exploreData.title ?? '',
        from: exploreData.from ?? new Date().toISOString(),
        to: exploreData.to ?? new Date().toISOString(),
        status: 'done',
        inputPath: exploreData.inputPath ?? '',
        outputPath: exploreData.outputPath ?? '',
      };
    }
  } else if (exploreData.status === 'in_progress') {
    // Directly assign — full initialization
    entry.stage.explore = {
      title: exploreData.title ?? '',
      from: exploreData.from ?? new Date().toISOString(),
      to: exploreData.to ?? new Date().toISOString(),
      status: 'in_progress',
      inputPath: exploreData.inputPath ?? '',
      outputPath: exploreData.outputPath ?? '',
    };
  }
}

/**
 * Placeholder for brainstorm stage processing (not yet implemented).
 * @param _entry - The change entry (unused)
 * @param _data - The brainstorm stage data (unused)
 */
function handleBrainstormStage(_entry: ChangeEntry, _data?: Partial<StageStep>): void {
  // No-op: not yet implemented
}

/**
 * Placeholder for propose stage processing (not yet implemented).
 * @param _entry - The change entry (unused)
 * @param _data - The propose stage data (unused)
 */
function handleProposeStage(_entry: ChangeEntry, _data?: Partial<StageStep>): void {
  // No-op: not yet implemented
}

/**
 * Placeholder for plan stage processing (not yet implemented).
 * @param _entry - The change entry (unused)
 * @param _data - The plan stage data (unused)
 */
function handlePlanStage(_entry: ChangeEntry, _data?: Partial<StageStep>): void {
  // No-op: not yet implemented
}

/**
 * Placeholder for reviewArtifacts stage processing (not yet implemented).
 * @param _entry - The change entry (unused)
 * @param _data - The reviewArtifacts stage data (unused)
 */
function handleReviewArtifactsStage(_entry: ChangeEntry, _data?: Partial<StageStep>): void {
  // No-op: not yet implemented
}

/**
 * Handles the coding stage update with featureId matching and progress merge.
 *
 * Each item in the codingData array is expected to be of the form:
 *   { featureId: string, progress: [{ title, from, to, status, inputPath, outputPath }] }
 *
 * Merge logic:
 * - Find matching SubAgentDevProgress by featureId
 * - If found: iterate progress[], find title match and merge (new non-empty values win)
 * - If no title match: append new progress item
 * - If no featureId match: create new SubAgentDevProgress and append to subAgentDev array
 *
 * @param entry - The change entry to update
 * @param codingData - Array of SubAgentDevProgress-like objects
 */
function handleCodingStage(entry: ChangeEntry, codingData?: unknown[]): void {
  if (!codingData || !Array.isArray(codingData) || codingData.length === 0) {
    return;
  }

  if (!entry.stage) {
    entry.stage = {} as ChangeStage;
  }

  if (!Array.isArray(entry.stage.subAgentDev)) {
    entry.stage.subAgentDev = [];
  }

  for (const item of codingData) {
    const itemObj = item as Record<string, unknown>;
    const featureId = typeof itemObj.featureId === 'string' ? itemObj.featureId : '';
    const newProgress = Array.isArray(itemObj.progress) ? (itemObj.progress as Partial<StageStep>[]) : [];

    if (newProgress.length === 0) continue;

    // Find existing SubAgentDevProgress by featureId
    const existingSAD = entry.stage.subAgentDev.find(
      (sad) => (sad as SubAgentDevProgress).featureId === featureId,
    ) as SubAgentDevProgress | undefined;

    if (existingSAD) {
      // Merge each new progress item into the existing progress array
      for (const newItem of newProgress) {
        const newTitle = newItem.title ?? '';
        // Only try to match by title if title is provided (non-empty)
        const matchIndex = newTitle
          ? existingSAD.progress.findIndex((p) => p.title === newTitle)
          : -1;

        if (matchIndex >= 0) {
          // Merge: new non-empty values override, empty/empty-string values skip
          const existing = existingSAD.progress[matchIndex];
          if (newItem.title && newItem.title !== '') existing.title = newItem.title;
          if (newItem.from && newItem.from !== '') existing.from = newItem.from;
          if (newItem.to && newItem.to !== '') existing.to = newItem.to;
          if (newItem.status) existing.status = newItem.status;
          if (newItem.inputPath && newItem.inputPath !== '') existing.inputPath = newItem.inputPath;
          if (newItem.outputPath && newItem.outputPath !== '') existing.outputPath = newItem.outputPath;
        } else {
          // No title match — append as new progress entry
          const newEntry: StageStep = {
            title: newItem.title ?? '',
            from: newItem.from ?? new Date().toISOString(),
            to: newItem.to ?? new Date().toISOString(),
            status: newItem.status ?? 'in_progress',
            inputPath: newItem.inputPath ?? '',
            outputPath: newItem.outputPath ?? '',
          };
          existingSAD.progress.push(newEntry);
        }
      }
    } else {
      // No matching featureId — create new SubAgentDevProgress
      const newProgressEntries: StageStep[] = newProgress.map((np) => ({
        title: np.title ?? '',
        from: np.from ?? new Date().toISOString(),
        to: np.to ?? new Date().toISOString(),
        status: np.status ?? 'in_progress',
        inputPath: np.inputPath ?? '',
        outputPath: np.outputPath ?? '',
      }));
      entry.stage.subAgentDev.push({
        featureId,
        progress: newProgressEntries,
      });
    }
  }
}

/**
 * Placeholder for finalize stage processing (not yet implemented).
 * @param _entry - The change entry (unused)
 * @param _data - The finalize stage data (unused)
 */
function handleFinalizeStage(_entry: ChangeEntry, _data?: { integration?: Partial<StageStep>; codecheck?: Partial<StageStep>; archive?: Partial<StageStep> }): void {
  // No-op: not yet implemented
}

/**
 * Creates or updates a change stage entry by dispatching to the seven stage-specific
 * handler functions in workflow order: explore -> brainstorm -> propose -> plan ->
 * reviewArtifacts -> subAgentDev -> finalize.
 * @param entry - The change entry to update
 * @param changeStage - Stage update data (permissive, see StageUpdate)
 */
export function createOrUpdateStage(entry: ChangeEntry, changeStage: StageUpdate): void {
  if (changeStage.explore) {
    handleExploreStage(entry, changeStage.explore);
  }
  if (changeStage.brainstorm) {
    handleBrainstormStage(entry, changeStage.brainstorm);
  }
  if (changeStage.propose) {
    handleProposeStage(entry, changeStage.propose);
  }
  if (changeStage.plan) {
    handlePlanStage(entry, changeStage.plan);
  }
  if (changeStage.reviewArtifacts || changeStage.review) {
    handleReviewArtifactsStage(entry, changeStage.reviewArtifacts ?? changeStage.review);
  }
  if (changeStage.subAgentDev || changeStage.coding) {
    handleCodingStage(entry, changeStage.subAgentDev ?? changeStage.coding);
  }
  if (changeStage.finalize) {
    handleFinalizeStage(entry, changeStage.finalize);
  }
}

/**
 * Creates or updates a change entry in the global memory changes.json.
 * - If the file does not exist, creates a new file with the entry.
 * - If the file exists but the change does not, appends the entry.
 * - If the change already exists, updates description and updateAt.
 * - If changeStage is provided, merges it into the entry's stage field.
 * @param cwd - The working directory path
 * @param changeName - The kebab-case change name
 * @param desc - The change description (optional when updating stage only)
 * @param changeStage - Optional partial stage data to merge into the entry
 */
export function createOrUpdateChange(
  cwd: string,
  changeName: string,
  desc?: string,
  changeStage?: StageUpdate,
): void {
  const data = ensureMemoryChangesJson(cwd);
  const existing = data.changes.find((c) => c.name === changeName);

  if (existing) {
    if (desc !== undefined) {
      existing.description = desc;
    }
    existing.updateAt = new Date().toISOString();
    if (changeStage) {
      createOrUpdateStage(existing, changeStage);
    }
    syncEntryProgress(existing, cwd, changeName);
  } else {
    // Create new entry
    const newChange: ChangeEntry = {
      name: changeName,
      path: `openpowers/changes/${changeName}`,
      description: desc ?? '',
      createdAt: new Date().toISOString(),
      updateAt: new Date().toISOString(),
      status: 'active',
      features: 0,
      todo: 0,
      artifacts: [],
    };
    if (changeStage) {
      createOrUpdateStage(newChange, changeStage);
    }
    syncEntryProgress(newChange, cwd, changeName);
    data.changes.push(newChange);
  }

  writeMemoryChangesJson(cwd, data);
}
