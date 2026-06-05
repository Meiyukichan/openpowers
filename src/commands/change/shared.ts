/**
 * Shared utilities for the change command
 * Contains path constants, validation, JSON sync, and artifact helpers
 * @author Meiyuki <meiyukichan@163.com>
 * @copyright 2026 Meiyuki
 */

import fs from 'fs';
import path from 'path';
import module from 'module';
import { z } from 'zod';
import { logger } from '../../utils/logger.js';

const require = module.createRequire(import.meta.url);
const pkg = require('../../../package.json');

// Path constants (absolute, cross-platform)
const CHANGES_DIR = path.join(process.cwd(), 'openpowers', 'changes');
const ARCHIVE_DIR = path.join(process.cwd(), 'openpowers', 'archive');
const CHANGES_JSON_PATH = path.join(process.cwd(), 'openpowers', 'changes.json');

/**
 * Converts an absolute path to a Linux-style forward-slash path relative to process.cwd().
 * Uses path.relative() to compute the relative path, then replaces any backslashes with
 * forward slashes for cross-platform portability.
 * @param absolutePath - An absolute filesystem path
 * @returns The path relative to process.cwd() with forward-slash separators
 */
export function toRelativePath(absolutePath: string): string {
  const relative = path.relative(process.cwd(), absolutePath);
  return relative.replace(/\\/g, '/');
}

// Default changes.json structure
const DEFAULT_CHANGES_JSON = {
  framework: pkg.name,
  version: pkg.version,
  changes: [],
  archive: [],
};

// Artifact ID definitions with file extension mapping
const ARTIFACT_IDS = ['proposal', 'design', 'specs', 'api', 'database', 'plan'] as const;

// Kebab-case validation pattern: lowercase start, then lowercase/digits/hyphens
const KEBAB_CASE = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;

// Artifact file extension mapping
const ARTIFACT_EXTENSIONS: Record<string, string> = {
  proposal: '.md',
  design: '.md',
  specs: '/**/*.md',
  api: '.yaml',
  database: '.md',
  plan: '.json',
};

/**
 * Formats an ISO date string as a human-readable relative time.
 * Output: "just now" (<1 min), "Xm ago" (1-59 min), "Xh ago" (1-23 h),
 * "Xd ago" (1-30 days), or locale date string (>30 days).
 * @param isoDate - ISO 8601 date string
 * @returns Formatted relative time string
 */
export function formatRelativeTime(isoDate: string): string {
  const diffMs = Date.now() - new Date(isoDate).getTime();
  const mins = Math.floor(diffMs / 60000);
  const hours = Math.floor(mins / 60);
  const days = Math.floor(hours / 24);
  if (days > 30) return new Date(isoDate).toLocaleDateString();
  if (days > 0) return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  if (mins > 0) return `${mins}m ago`;
  return 'just now';
}

/**
 * Validates that a change name follows kebab-case convention.
 * @param name - The change name to validate
 * @returns Object with `valid` boolean and optional `error` message
 */
export function validateChangeName(name: string): { valid: boolean; error?: string } {
  if (!KEBAB_CASE.test(name)) {
    return { valid: false, error: 'Change name must be kebab-case (e.g., my-change)' };
  }
  return { valid: true };
}

/**
 * Builds the artifacts array for a change directory path based on actual filesystem state.
 * Only includes artifacts whose corresponding file (or directory for specs) exists on disk.
 * @param dirPath - The directory path for the change (e.g., 'openpowers/changes/my-feature')
 * @returns Array of { id, outputPath } objects for artifacts that exist on the filesystem
 */
export function buildArtifacts(dirPath: string): Array<{ id: string; outputPath: string }> {
  return ARTIFACT_IDS
    .map((id) => {
      const fileName = id === 'specs' ? `specs${ARTIFACT_EXTENSIONS[id]}` : `${id}${ARTIFACT_EXTENSIONS[id]}`;
      const filePath = path.join(dirPath, fileName);
      const outputPath = toRelativePath(path.resolve(filePath));
      return { id, outputPath, filePath, fileName };
    })
    .filter(({ filePath, id }) => {
      if (id === 'specs') {
        // For specs, check if the directory (dirname of the glob) exists
        const specsDir = path.join(dirPath, 'specs');
        return fs.existsSync(specsDir);
      }
      // For file artifacts, check if the file exists
      return fs.existsSync(filePath);
    })
    .map(({ id, outputPath }) => ({ id, outputPath }));
}

/**
 * Extracts the change name from an archive directory name by stripping the YYYY-MM-DD- prefix.
 * @param dirName - Archive directory name (e.g., '2026-05-17-remove-command')
 * @returns The change name without date prefix (e.g., 'remove-command')
 */
export function extractArchiveName(dirName: string): string {
  return dirName.replace(/^\d{4}-\d{2}-\d{2}-/, '');
}

/**
 * Reads a plan.json file and computes features and todo counts.
 * Returns safe defaults { features: 0, todo: 0 } if file is missing or invalid.
 * @param planPath - Path to plan.json file
 * @returns Object with `features` (total) and `todo` (incomplete) counts
 */
export function computeProgress(planPath: string): { features: number; todo: number } {
  if (!fs.existsSync(planPath)) return { features: 0, todo: 0 };
  try {
    const raw = fs.readFileSync(planPath, 'utf-8');
    const features = JSON.parse(raw);
    if (!Array.isArray(features)) return { features: 0, todo: 0 };
    const total = features.length;
    const todo = features.filter((f: { status?: string }) => f.status !== 'done').length;
    return { features: total, todo };
  } catch {
    return { features: 0, todo: 0 };
  }
}

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
 * Loads openpowers/changes.json or returns the default structure if it does not exist.
 * Silently auto-creates changes.json with default values when missing.
 * @returns The parsed changes.json object
 */
export function loadOrCreateChangesJson(): { framework: string; version: string; changes: Array<Record<string, unknown>>; archive: Array<Record<string, unknown>> } {
  if (!fs.existsSync(CHANGES_JSON_PATH)) {
    const jsonContent = JSON.stringify(DEFAULT_CHANGES_JSON, null, 2);
    // Ensure the parent directory exists
    const dir = path.dirname(CHANGES_JSON_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(CHANGES_JSON_PATH, jsonContent, 'utf-8');
    logger.info(`Created default ${path.relative(process.cwd(), CHANGES_JSON_PATH)}`);
    return JSON.parse(JSON.stringify(DEFAULT_CHANGES_JSON));
  }
  const raw = fs.readFileSync(CHANGES_JSON_PATH, 'utf-8');
  const parsed = JSON.parse(raw);
  // Fill missing fields with defaults
  if (!parsed.changes) parsed.changes = [];
  if (!parsed.archive) parsed.archive = [];
  // Force-update framework and version to current pkg values
  parsed.framework = pkg.name;
  parsed.version = pkg.version;
  return parsed;
}

/**
 * Synchronizes openpowers/changes.json with the filesystem state.
 * Scans openpowers/changes/ for active changes and openpowers/archive/ for archived changes.
 * Recomputes features/todo from plan.json and fills missing artifacts/closedAt fields.
 * @returns The up-to-date changes.json object
 */
export function syncChangesJson(): { framework: string; version: string; changes: Array<Record<string, unknown>>; archive: Array<Record<string, unknown>> } {
  const data = loadOrCreateChangesJson();

  // --- Scan active changes ---
  const activeDirs: string[] = [];
  if (fs.existsSync(CHANGES_DIR)) {
    const entries = fs.readdirSync(CHANGES_DIR, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory() && entry.name !== 'archive' && !entry.name.startsWith('.')) {
        activeDirs.push(entry.name);
      }
    }
  }

  // Index existing changes by name for fast lookup
  const existingChangesMap = new Map<string, Record<string, unknown>>();
  for (const ch of data.changes) {
    if (ch.name && typeof ch.name === 'string') {
      existingChangesMap.set(ch.name, ch as Record<string, unknown>);
    }
  }

  // Rebuild changes array from filesystem scan
  const newChanges: Array<Record<string, unknown>> = [];
  for (const dirName of activeDirs) {
    const changePath = path.join(CHANGES_DIR, dirName);
    const planPath = path.join(changePath, 'plan.json');
    const existing = existingChangesMap.get(dirName);

    const entry: Record<string, unknown> = {
      name: dirName,
      path: toRelativePath(changePath),
      description: (existing?.description as string) ?? '',
      createdAt: (existing?.createdAt as string) ?? new Date().toISOString(),
      updateAt: (existing?.updateAt as string) ?? new Date().toISOString(),
      features: 0,
      todo: 0,
      artifacts: buildArtifacts(changePath),
    };

    // Compute progress from plan.json if available
    const progress = computeProgress(planPath);
    entry.features = progress.features;
    entry.todo = progress.todo;

    // Preserve existing description and createdAt if available
    if (existing?.description) {
      entry.description = existing.description;
    }
    if (existing?.createdAt) {
      entry.createdAt = existing.createdAt;
    }

    newChanges.push(entry);
  }

  data.changes = newChanges;

  // --- Scan archived changes ---
  const archiveDirs: string[] = [];
  if (fs.existsSync(ARCHIVE_DIR)) {
    const entries = fs.readdirSync(ARCHIVE_DIR, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory() && !entry.name.startsWith('.')) {
        archiveDirs.push(entry.name);
      }
    }
  }

  // Index existing archive entries by name
  const existingArchiveMap = new Map<string, Record<string, unknown>>();
  for (const arch of data.archive) {
    if (arch.name && typeof arch.name === 'string') {
      existingArchiveMap.set(arch.name, arch as Record<string, unknown>);
    }
  }

  // Rebuild archive array from filesystem scan
  const newArchive: Array<Record<string, unknown>> = [];
  for (const dirName of archiveDirs) {
    const changeName = extractArchiveName(dirName);
    const archivePath = path.join(ARCHIVE_DIR, dirName);
    const planPath = path.join(archivePath, 'plan.json');
    const existing = existingArchiveMap.get(changeName);

    const previousChange = existingChangesMap.get(changeName);

    const entry: Record<string, unknown> = {
      name: changeName,
      path: toRelativePath(archivePath),
      description: (existing?.description ?? previousChange?.description ?? '') as string,
      createdAt: (existing?.createdAt ?? previousChange?.createdAt as string) ?? new Date().toISOString(),
      closedAt: (existing?.closedAt as string) ?? new Date().toISOString(),
      updateAt: (existing?.updateAt as string) ?? new Date().toISOString(),
      features: 0,
      artifacts: buildArtifacts(archivePath),
    };

    // Compute features count from plan.json if available
    const progress = computeProgress(planPath);
    entry.features = progress.features;

    // Preserve existing description from archive or previous changes entry
    if (existing?.description) {
      entry.description = existing.description;
    } else if (previousChange?.description) {
      entry.description = previousChange.description;
    }
    // Preserve existing createdAt from archive or previous changes entry
    if (existing?.createdAt) {
      entry.createdAt = existing.createdAt;
    } else if (previousChange?.createdAt) {
      entry.createdAt = previousChange.createdAt;
    }

    newArchive.push(entry);
  }

  data.archive = newArchive;

  // Write back the synchronized data
  const dir = path.dirname(CHANGES_JSON_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(CHANGES_JSON_PATH, JSON.stringify(data, null, 2), 'utf-8');
  logger.info(`Synced changes.json: ${newChanges.length} active, ${newArchive.length} archived`);

  return data;
}

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

export {
  CHANGES_DIR,
  ARCHIVE_DIR,
  CHANGES_JSON_PATH,
  DEFAULT_CHANGES_JSON,
  ARTIFACT_IDS,
  KEBAB_CASE,
  ARTIFACT_EXTENSIONS,
};
