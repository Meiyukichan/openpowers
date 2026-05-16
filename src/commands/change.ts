/**
 * @fileoverview Change command - manages OpenPowers change artifacts
 * Supports list, new, and status subcommands with filesystem-aware sync logic
 * @author Meiyuki <meiyukichan@163.com>
 * @copyright 2026 Meiyuki
 */

import fs from 'fs';
import path from 'path';
import module from 'module';
import { Command } from 'commander';
import { logger } from '../utils/logger.js';

const require = module.createRequire(import.meta.url);
const pkg = require('../../package.json');

// Path constants
const CHANGES_DIR = 'openspec/changes';
const ARCHIVE_DIR = path.join(CHANGES_DIR, 'archive');
const CHANGES_JSON_PATH = 'openpowers/changes.json';

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
 * Builds the standard 6-item artifacts array for a change directory path.
 * @param dirPath - The directory path for the change (e.g., 'openspec/changes/my-feature')
 * @returns Array of { id, outputPath } objects
 */
export function buildArtifacts(dirPath: string): Array<{ id: string; outputPath: string }> {
  return ARTIFACT_IDS.map((id) => ({
    id,
    outputPath: `${dirPath}/${id === 'specs' ? `specs${ARTIFACT_EXTENSIONS[id]}` : `${id}${ARTIFACT_EXTENSIONS[id]}`}`,
  }));
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

/**
 * Loads openpowers/changes.json or returns the default structure if it does not exist.
 * Silently auto-creates changes.json with default values when missing.
 * @returns The parsed changes.json object
 */
export function loadOrCreateChangesJson(): { framework: string; version: string; changes: unknown[]; archive: unknown[] } {
  if (!fs.existsSync(CHANGES_JSON_PATH)) {
    const jsonContent = JSON.stringify(DEFAULT_CHANGES_JSON, null, 2);
    // Ensure the parent directory exists
    const dir = path.dirname(CHANGES_JSON_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(CHANGES_JSON_PATH, jsonContent, 'utf-8');
    return JSON.parse(JSON.stringify(DEFAULT_CHANGES_JSON));
  }
  const raw = fs.readFileSync(CHANGES_JSON_PATH, 'utf-8');
  const parsed = JSON.parse(raw);
  // Fill missing fields with defaults
  if (!parsed.changes) parsed.changes = [];
  if (!parsed.archive) parsed.archive = [];
  if (!parsed.framework) parsed.framework = pkg.name;
  if (!parsed.version) parsed.version = pkg.version;
  return parsed;
}

/**
 * Synchronizes openpowers/changes.json with the filesystem state.
 * Scans openspec/changes/ for active changes and openspec/changes/archive/ for archived changes.
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
    const changePath = `${CHANGES_DIR}/${dirName}`;
    const planPath = `${changePath}/plan.json`;
    const existing = existingChangesMap.get(dirName);

    const entry: Record<string, unknown> = {
      name: dirName,
      path: changePath,
      description: (existing?.description as string) ?? '',
      createdAt: (existing?.createdAt as string) ?? new Date().toISOString(),
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
    const archivePath = `${ARCHIVE_DIR}/${dirName}`;
    const planPath = `${archivePath}/plan.json`;
    const existing = existingArchiveMap.get(changeName);

    const entry: Record<string, unknown> = {
      name: changeName,
      path: archivePath,
      description: (existing?.description as string) ?? '',
      createdAt: (existing?.createdAt as string) ?? new Date().toISOString(),
      closedAt: (existing?.closedAt as string) ?? new Date().toISOString(),
      features: 0,
      todo: 0,
      artifacts: buildArtifacts(archivePath),
    };

    // Compute progress from plan.json if available
    const progress = computeProgress(planPath);
    entry.features = progress.features;
    entry.todo = progress.todo;

    // Preserve existing fields if available
    if (existing?.description) {
      entry.description = existing.description;
    }
    if (existing?.createdAt) {
      entry.createdAt = existing.createdAt;
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

  return data;
}

/**
 * Formats and prints the change list as a table to stdout.
 * Columns: name (left-aligned), progress, description, relative time (right-aligned).
 * Prints 'No changes found' if there are no change directories.
 */
export function runChangeList(): void {
  const data = syncChangesJson();

  if (data.changes.length === 0 && data.archive.length === 0) {
    process.stdout.write('No changes found\n');
    return;
  }

  // Collect all entries (active first, then archived)
  const allEntries: Array<Record<string, unknown>> = [
    ...data.changes,
    ...data.archive,
  ];

  // Compute column widths
  const nameWidth = Math.max(4, ...allEntries.map((e) => String(e.name || '').length));
  const progressWidth = Math.max(8, ...allEntries.map((e) => {
    const progressStr = `${e.todo ?? 0}/${e.features ?? 0} features`;
    return progressStr.length;
  }));
  const descWidth = Math.max(11, ...allEntries.map((e) => String(e.description || '').length));

  // Print header
  const headerName = 'Name'.padEnd(nameWidth);
  const headerProg = 'Progress'.padEnd(progressWidth);
  const headerDesc = 'Description'.padEnd(descWidth);
  const headerTime = 'Time';
  process.stdout.write(`${headerName}  ${headerProg}  ${headerDesc}  ${headerTime}\n`);

  // Print separator
  const sep = '-'.repeat(nameWidth + progressWidth + descWidth + 20);
  process.stdout.write(`${sep}\n`);

  // Print each entry
  for (const entry of allEntries) {
    const name = String(entry.name || '').padEnd(nameWidth);
    const progress = `${entry.todo ?? 0}/${entry.features ?? 0} features`.padEnd(progressWidth);
    const description = String(entry.description || '').padEnd(descWidth);
    const time = formatRelativeTime(String(entry.createdAt || ''));

    process.stdout.write(`${name}  ${progress}  ${description}  ${time}\n`);
  }
}

/**
 * Creates a new change: validates name, creates directory, and updates changes.json.
 * @param name - The change name (must be kebab-case)
 * @param options - Options containing the --desc flag with description text
 */
export function runChangeNew(name: string, options: { desc: string }): void {
  // Validate name format
  const validation = validateChangeName(name);
  if (!validation.valid) {
    logger.error(validation.error);
    process.exit(1);
  }

  const changeDir = `${CHANGES_DIR}/${name}`;

  // Create the change directory (silently skip if exists)
  if (!fs.existsSync(changeDir)) {
    fs.mkdirSync(changeDir, { recursive: true });
    logger.info(`Created directory: ${changeDir}`);
  } else {
    logger.info(`Directory already exists: ${changeDir}`);
  }

  // Load or create changes.json
  const data = loadOrCreateChangesJson();

  // Create new entry
  const newEntry = {
    name,
    path: changeDir,
    description: options.desc,
    createdAt: new Date().toISOString(),
    features: 0,
    todo: 0,
    artifacts: buildArtifacts(changeDir),
  };

  // Append to changes array
  data.changes.push(newEntry);

  // Write back
  const dir = path.dirname(CHANGES_JSON_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(CHANGES_JSON_PATH, JSON.stringify(data, null, 2), 'utf-8');

  logger.info(`Change '${name}' registered in changes.json`);
}

/**
 * Outputs the status of a specific change as JSON.
 * Syncs changes.json first, then searches both changes and archive arrays.
 * Computes isComplete as todo === 0 && features > 0.
 * Exits with error if the change name is not found.
 * @param name - The change name to query
 */
export function runChangeStatus(name: string): void {
  // Sync changes.json first
  const data = syncChangesJson();

  // Search in changes array first, then archive
  let entry = data.changes.find((c) => c.name === name);
  if (!entry) {
    entry = data.archive.find((a) => a.name === name);
  }

  if (!entry) {
    process.stderr.write(`Change '${name}' not found\n`);
    process.exit(1);
  }

  const isComplete = (Number(entry.todo) === 0 && Number(entry.features) > 0);

  const output = {
    name: entry.name,
    isComplete,
    artifacts: entry.artifacts,
  };

  process.stdout.write(JSON.stringify(output) + '\n');
}

/**
 * Registers the `change` command and its subcommands on the given program.
 * Subcommands: list, new <name> --desc <description>, status <name>
 * @param program - The commander Command instance
 */
export function registerChangeCommand(program: Command): void {
  const changeCmd = program
    .command('change')
    .description('Manage OpenPowers change artifacts');

  changeCmd
    .command('list')
    .description('List all changes with progress')
    .action(() => {
      runChangeList();
    });

  changeCmd
    .command('new <name>')
    .description('Create a new change')
    .requiredOption('--desc <description>', 'Brief description of the change')
    .action((name: string, options: { desc: string }) => {
      runChangeNew(name, options);
    });

  changeCmd
    .command('status <name>')
    .description('Show status of a specific change')
    .action((name: string) => {
      runChangeStatus(name);
    });
}
