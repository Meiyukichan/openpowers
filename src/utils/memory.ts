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
import { z } from 'zod';

/**
 * Flattens a cwd path into a safe directory name.
 * Step 1: replace all \ with /
 * Step 2: replace : with _ (Windows drive letter separator)
 * Step 3: replace / with _
 * @param cwd - The current working directory path
 * @returns Flattened path safe for use as a directory name
 */
export function flattenCwdPath(cwd: string): string {
  return cwd.replace(/\\/g, '/').replace(/:/g, '_').replace(/\//g, '_');
}

/** Schema for a single stage step with title metadata */
export const StageStepSchema = z.object({
  title: z.string(),
  from: z.string(),
  to: z.string(),
  status: z.string(),
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

/** Schema for the top-level changes.json structure (with cwd) */
export const ChangesJsonSchema = z.object({
  framework: z.string(),
  version: z.string(),
  cwd: z.string(),
  changes: z.array(ChangeEntrySchema),
});

/** Type for the top-level changes.json structure */
export type ChangesJson = z.infer<typeof ChangesJsonSchema>;

/** Package metadata for default structure */
const PKG_NAME = '@meiyukichan/openpowers';
const PKG_VERSION = '1.0.2';

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
 * Reads the global memory changes.json file.
 * If the file does not exist, returns a default structure.
 * @param cwd - The working directory path
 * @returns The parsed ChangesJson object
 */
export function readMemoryChangesJson(cwd: string): ChangesJson {
  const filePath = getMemoryChangesJsonPath(cwd);
  if (!fs.existsSync(filePath)) {
    return {
      framework: PKG_NAME,
      version: PKG_VERSION,
      cwd,
      changes: [],
    };
  }
  const raw = fs.readFileSync(filePath, 'utf-8');
  try {
    return JSON.parse(raw) as ChangesJson;
  } catch {
    console.warn(`[memory] Failed to parse ${filePath}, returning default structure`);
    return {
      framework: PKG_NAME,
      version: PKG_VERSION,
      cwd,
      changes: [],
    };
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
 * Creates or updates a change entry in the global memory changes.json.
 * - If the file does not exist, creates a new file with the entry.
 * - If the file exists but the change does not, appends the entry.
 * - If the change already exists, updates description and updateAt.
 * @param cwd - The working directory path
 * @param changeName - The kebab-case change name
 * @param desc - The change description
 */
export function createOrUpdateChange(cwd: string, changeName: string, desc: string): void {
  const data = readMemoryChangesJson(cwd);
  const existing = data.changes.find((c) => c.name === changeName);

  if (existing) {
    // Update existing entry
    existing.description = desc;
    existing.updateAt = new Date().toISOString();
  } else {
    // Create new entry
    data.changes.push({
      name: changeName,
      path: `openpowers/changes/${changeName}`,
      description: desc,
      createdAt: new Date().toISOString(),
      features: 0,
      todo: 0,
      artifacts: [],
    });
  }

  writeMemoryChangesJson(cwd, data);
}
