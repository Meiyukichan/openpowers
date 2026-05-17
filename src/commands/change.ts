/**
 * @fileoverview Change command - manages OpenPowers change artifacts
 * Supports list, new, and status subcommands with filesystem-aware sync logic
 * @author Meiyuki <meiyukichan@163.com>
 * @copyright 2026 Meiyuki
 */

import fs from 'fs';
import path from 'path';
import url from 'url';
import module from 'module';
import { Command } from 'commander';
import { logger } from '../utils/logger.js';

const require = module.createRequire(import.meta.url);
const pkg = require('../../package.json');

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

  return data;
}

/**
 * Formats and prints the change list as a table to stdout.
 * Columns: name (left-aligned), progress, description, relative time (right-aligned).
 * Prints 'No changes found' if there are no change directories.
 */
export function runChangeList(): void {
  const data = syncChangesJson();

  if (data.changes.length === 0) {
    process.stdout.write('No changes found\n');
    return;
  }

  const allEntries = data.changes;

  // Compute column widths
  const nameWidth = Math.max(4, ...allEntries.map((e) => String(e.name || '').length));
  const progressWidth = Math.max(8, ...allEntries.map((e) => {
    const progressStr = `${Number(e.features ?? 0) - Number(e.todo ?? 0)}/${Number(e.features ?? 0)} features`;
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
    const progress = `${Number(entry.features ?? 0) - Number(entry.todo ?? 0)}/${Number(entry.features ?? 0)} features`.padEnd(progressWidth);
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

  // Check for duplicate in changes.json
  const data = loadOrCreateChangesJson();
  const existing = data.changes.find((c) => c.name === name);
  if (existing) {
    process.stdout.write(`Change '${name}' already exists\n`);
    return;
  }

  const changeDir = path.join(CHANGES_DIR, name);

  // Create the change directory (silently skip if exists)
  if (!fs.existsSync(changeDir)) {
    fs.mkdirSync(changeDir, { recursive: true });
    logger.info(`Created directory: ${changeDir}`);
  } else {
    logger.info(`Directory already exists: ${changeDir}`);
  }

  // Create new entry
  const newEntry = {
    name,
    path: toRelativePath(changeDir),
    description: options.desc,
    createdAt: new Date().toISOString(),
    features: 0,
    todo: 0,
    artifacts: [],
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
  process.stdout.write(`Change '${name}' created successfully\n`);
}

// Core artifact IDs in pipeline order
const CORE_ARTIFACTS = ['proposal', 'design', 'specs'];

/**
 * Computes artifact pipeline status for all existing artifacts in a change directory.
 * Status follows sequential order: proposal -> design -> specs.
 * Non-core artifacts (api, database, plan) are assigned 'done' unconditionally.
 * Output paths are relative to the change directory with forward slashes.
 * @param changeDirPath - The absolute path to the change directory
 * @returns Array of { id, outputPath, status } for each existing artifact
 */
export function computeArtifactStatus(changeDirPath: string): Array<{ id: string; outputPath: string; status: string }> {
  // Check existence of the three core artifacts in sequential order
  const proposalMdExists = fs.existsSync(path.join(changeDirPath, 'proposal.md'));
  const designMdExists = fs.existsSync(path.join(changeDirPath, 'design.md'));
  const specsDir = path.join(changeDirPath, 'specs');
  const specsExist = fs.existsSync(specsDir) && fs.readdirSync(specsDir, { withFileTypes: true }).some((f) => f.name.endsWith('.md'));

  // Compute core artifact statuses using sequential pipeline logic
  let proposalStatus: string;
  let designStatus: string;
  let specsStatus: string;
  if (!proposalMdExists) {
    proposalStatus = 'ready';
    designStatus = 'blocked';
    specsStatus = 'blocked';
  } else if (!designMdExists) {
    proposalStatus = 'done';
    designStatus = 'ready';
    specsStatus = 'blocked';
  } else if (!specsExist) {
    proposalStatus = 'done';
    designStatus = 'done';
    specsStatus = 'ready';
  } else {
    proposalStatus = 'done';
    designStatus = 'done';
    specsStatus = 'done';
  }

  const coreStatusMap: Record<string, string> = {
    proposal: proposalStatus,
    design: designStatus,
    specs: specsStatus,
  };

  // Build result: core artifacts always included, non-core only when they exist on disk
  const existingArtifacts = buildArtifacts(changeDirPath);

  // Always include the three core artifacts
  const results: Array<{ id: string; outputPath: string; status: string }> = CORE_ARTIFACTS.map((id) => {
    const fileName = id === 'specs' ? `specs${ARTIFACT_EXTENSIONS[id]}` : `${id}${ARTIFACT_EXTENSIONS[id]}`;
    return { id, outputPath: fileName, status: coreStatusMap[id] };
  });

  // Append non-core artifacts that exist on disk, with change-relative outputPath
  for (const artifact of existingArtifacts) {
    if (!CORE_ARTIFACTS.includes(artifact.id)) {
      const fileName = `${artifact.id}${ARTIFACT_EXTENSIONS[artifact.id]}`;
      results.push({ id: artifact.id, outputPath: fileName, status: 'done' });
    }
  }

  return results;
}

/**
 * Outputs the status of a specific change as JSON.
 * Syncs changes.json first, then searches both changes and archive arrays.
 * Computes artifact pipeline status using computeArtifactStatus and
 * determines isComplete as true only when all three core artifacts (proposal, design, specs) are done.
 * Artifact outputPath values are relative to the change directory.
 * Exits with error if the change name is not found.
 * @param name - The change name to query
 */
export function runChangeStatus(name: string): void {
  // Sync changes.json first
  const data = syncChangesJson();

  // Search in changes array first, then archive
  let location = 'changes';
  let entry = data.changes.find((c) => c.name === name);
  if (!entry) {
    entry = data.archive.find((a) => a.name === name);
    location = 'archive';
  }

  if (!entry) {
    process.stderr.write(`Change '${name}' not found\n`);
    process.exit(1);
  }

  // Resolve change directory path and compute artifact pipeline status
  const changeDirPath = path.resolve(process.cwd(), String(entry.path));
  const artifacts = computeArtifactStatus(changeDirPath);

  // isComplete is true only when all three core artifacts are done
  const isComplete = CORE_ARTIFACTS.every((id) => {
    const artifact = artifacts.find((a) => a.id === id);
    return artifact && artifact.status === 'done';
  });

  const output = {
    name: entry.name,
    location,
    isComplete,
    artifacts,
  };

  process.stdout.write(JSON.stringify(output, null, 2) + '\n');
}

// Resolve the directory of this module for reading template files
const changeCommandDirname = path.dirname(url.fileURLToPath(import.meta.url));

/**
 * Reads an artifact template JSON file from the data/ directory.
 * Resolved relative to this source file's location using import.meta.url.
 * @param artifactId - The artifact identifier (proposal, design, or specs)
 * @returns Parsed template object
 */
function readTemplateFile(artifactId: string): Record<string, unknown> {
  const templatePath = path.join(changeCommandDirname, '..', '..', 'data', `${artifactId}-template.json`);
  const raw = fs.readFileSync(templatePath, 'utf-8');
  return JSON.parse(raw);
}

/**
 * Outputs the instruction JSON for a given artifact type.
 * Reads the corresponding template from data/, fills in changeName and outputPath
 * (replacing [change-name] placeholders), checks dependency file existence for
 * --design and --specs flags, and outputs the resulting JSON to stdout.
 * @param name - The change name (must be kebab-case)
 * @param options - Options containing exactly one of --proposal, --design, or --specs
 */
export function runChangeInstruction(name: string, options: { proposal?: boolean; design?: boolean; specs?: boolean }): void {
  // Validate change name
  const validation = validateChangeName(name);
  if (!validation.valid) {
    logger.error(validation.error);
    process.exit(1);
  }

  // Ensure exactly one flag is set
  const flags = [options.proposal, options.design, options.specs].filter(Boolean);
  if (flags.length !== 1) {
    logger.error('Exactly one of --proposal, --design, or --specs is required');
    process.exit(1);
  }

  // Determine artifact type from flag
  let artifactId: string;
  if (options.proposal) {
    artifactId = 'proposal';
  } else if (options.design) {
    artifactId = 'design';
  } else {
    artifactId = 'specs';
  }

  // Read the template file and replace [change-name] placeholders
  const templateRaw = JSON.stringify(readTemplateFile(artifactId));
  const filledRaw = templateRaw.replace(/\[change-name\]/g, name);
  const result = JSON.parse(filledRaw);

  // Check dependency file existence for --design and --specs
  if (artifactId === 'design' || artifactId === 'specs') {
    const deps: Array<Record<string, unknown>> = result.dependencies as Array<Record<string, unknown>> || [];
    if (deps.length > 0) {
      const proposalPath = path.join(process.cwd(), 'openspec', 'changes', name, 'proposal.md');
      deps[0].done = fs.existsSync(proposalPath);
    }
    if (artifactId === 'specs' && deps.length > 1) {
      const designPath = path.join(process.cwd(), 'openspec', 'changes', name, 'design.md');
      deps[1].done = fs.existsSync(designPath);
    }
  }

  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
}

/**
 * Registers the `change` command and its subcommands on the given program.
 * Subcommands: list, new <name> --desc <description>, status <name>,
 * instruction <name> --proposal|--design|--specs
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

  changeCmd
    .command('instruction <name>')
    .description('Get artifact generation instructions')
    .option('--proposal', 'Get proposal generation instructions')
    .option('--design', 'Get design generation instructions')
    .option('--specs', 'Get specs generation instructions')
    .action((name: string, options: { proposal?: boolean; design?: boolean; specs?: boolean }) => {
      runChangeInstruction(name, options);
    });
}
