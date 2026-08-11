/**
 * @fileoverview One-time data migration from old brand paths to new brand paths.
 * Copies ~/.openpowers/ (memory/sessions/logs/providers.json/settings.bak.json/.pid)
 * to ~/.furina/ and project-level openpowers/ (changes/archive/changes.json) to furina/.
 * Copy-only strategy: old directories are always preserved. Idempotent: existing
 * targets are skipped, never overwritten.
 * @author Meiyuki <meiyukichan@163.com>
 * @copyright 2026 Meiyuki
 */

import fs from 'fs';
import os from 'os';
import path from 'path';
import { logger } from './logger.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Result status for a single migrated item. */
export type MigrationStatus = 'copied' | 'skipped' | 'missing' | 'failed';

/** Per-item migration result with source and target paths. */
export interface MigrationItemResult {
  /** Source path under the old brand directory. */
  source: string;
  /** Target path under the new brand directory. */
  target: string;
  /** Outcome of copying this item. */
  status: MigrationStatus;
}

/** Summary of a full migration run. */
export interface MigrationSummary {
  /** Whether any old-brand data was detected. */
  needsMigration: boolean;
  /** ISO timestamp of the migration run. */
  migratedAt: string;
  /** Per-item results for user-level (~/.openpowers/ -> ~/.furina/) migration. */
  user: MigrationItemResult[];
  /** Per-item results for project-level (openpowers/ -> furina/) migration. */
  project: MigrationItemResult[];
  /** Key targets verified to exist after migration. */
  verifiedTargets: string[];
  /** Targets that should exist after migration but were not found. */
  verificationFailures: string[];
}

/** Internal spec for a single copy operation. */
interface Entry {
  /** File or directory name under the old brand directory. */
  sourceName: string;
  /** File or directory name under the new brand directory. */
  targetName: string;
  /** Whether the entry is a file or a directory. */
  kind: 'file' | 'dir';
}

// User-level entries: memory, sessions, logs directories plus config files.
// The old PID file (.openpowers.pid) is copied to the new brand name (.furina.pid);
// the service rewrites it on the next start regardless.
const USER_ENTRIES: Entry[] = [
  { sourceName: 'memory', targetName: 'memory', kind: 'dir' },
  { sourceName: 'sessions', targetName: 'sessions', kind: 'dir' },
  { sourceName: 'logs', targetName: 'logs', kind: 'dir' },
  { sourceName: 'providers.json', targetName: 'providers.json', kind: 'file' },
  { sourceName: 'settings.bak.json', targetName: 'settings.bak.json', kind: 'file' },
  { sourceName: '.openpowers.pid', targetName: '.furina.pid', kind: 'file' },
];

// Project-level entries: changes/, archive/ directories and changes.json index.
const PROJECT_ENTRIES: Entry[] = [
  { sourceName: 'changes', targetName: 'changes', kind: 'dir' },
  { sourceName: 'archive', targetName: 'archive', kind: 'dir' },
  { sourceName: 'changes.json', targetName: 'changes.json', kind: 'file' },
];

// ---------------------------------------------------------------------------
// Path helpers
// ---------------------------------------------------------------------------

/**
 * Returns the old user-level data directory (~/.openpowers).
 * Computed per call so tests can relocate the home directory.
 */
function getOldUserDir(): string {
  return path.join(os.homedir(), '.openpowers');
}

/**
 * Returns the new user-level data directory (~/.furina).
 */
function getNewUserDir(): string {
  return path.join(os.homedir(), '.furina');
}

// ---------------------------------------------------------------------------
// Detection
// ---------------------------------------------------------------------------

/**
 * Detects whether any old-brand data exists: either the user-level
 * ~/.openpowers/ directory or the project-level openpowers/ directory.
 * @param cwd - Project root to inspect for a project-level openpowers/ directory
 * @returns true if any old-brand source directory exists
 */
export function detectOldData(cwd: string = process.cwd()): boolean {
  if (fs.existsSync(getOldUserDir())) {
    return true;
  }
  if (fs.existsSync(path.join(cwd, 'openpowers'))) {
    return true;
  }
  return false;
}

/**
 * Determines whether first-run auto-migration should run: the old user directory
 * exists and the new directory has no migrated runtime data yet.
 *
 * Note: ~/.furina/logs (created by the logger) and ~/.furina/memory/dreamwork.log
 * (created by the memory scheduler) may already exist, so "already migrated" is
 * judged by data-bearing targets: providers.json, settings.bak.json, sessions/,
 * or a Memory_* directory under memory/.
 * @param cwd - Project root to inspect
 * @returns true when auto-migration is needed
 */
export function shouldAutoMigrate(cwd: string = process.cwd()): boolean {
  if (!fs.existsSync(getOldUserDir())) {
    return false;
  }
  const newDir = getNewUserDir();
  const hasMigratedData =
    fs.existsSync(path.join(newDir, 'providers.json')) ||
    fs.existsSync(path.join(newDir, 'settings.bak.json')) ||
    fs.existsSync(path.join(newDir, 'sessions')) ||
    hasMemoryUserData(path.join(newDir, 'memory'));
  return !hasMigratedData;
}

/**
 * Returns true when the given memory directory contains user data directories
 * (Memory_*). Auto-created files such as dreamwork.log are ignored so a
 * scheduler-created empty memory dir does not block first-run migration.
 * @param memoryDir - The new ~/.furina/memory directory
 * @returns true when at least one Memory_* directory exists
 */
function hasMemoryUserData(memoryDir: string): boolean {
  if (!fs.existsSync(memoryDir)) {
    return false;
  }
  let entries: string[];
  try {
    entries = fs.readdirSync(memoryDir);
  } catch {
    // memoryDir is not a readable directory; treat as no user data
    return false;
  }
  return entries.some((name) => name.startsWith('Memory_'));
}

// ---------------------------------------------------------------------------
// Copy helpers
// ---------------------------------------------------------------------------

/**
 * Copies a single file or directory from source to target.
 * Skips (returns 'skipped') when the target already exists and 'missing' when
 * the source does not exist. Never overwrites existing targets.
 * @param source - Source path
 * @param target - Target path
 * @param kind - Whether the entry is a file or a directory
 * @returns the migration status for the item
 */
function copyItem(source: string, target: string, kind: Entry['kind']): MigrationStatus {
  if (!fs.existsSync(source)) {
    return 'missing';
  }
  if (fs.existsSync(target)) {
    logger.warn(`Migration target already exists, skipping: ${target}`);
    return 'skipped';
  }
  try {
    const targetDir = path.dirname(target);
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }
    if (kind === 'dir') {
      fs.cpSync(source, target, { recursive: true });
    } else {
      fs.copyFileSync(source, target);
    }
    logger.info(`Migrated: ${source} -> ${target}`);
    return 'copied';
  } catch (err) {
    // Copy failed (e.g. target parent is not a directory). Record and continue
    // so other items can still migrate; old data is never modified.
    logger.error(`Migration copy failed: ${source} -> ${target}: ${err instanceof Error ? err.message : String(err)}`);
    return 'failed';
  }
}

/**
 * Copies all user-level entries from ~/.openpowers/ to ~/.furina/.
 * @returns per-item results for the user-level migration
 */
function migrateUserData(): MigrationItemResult[] {
  const oldDir = getOldUserDir();
  const newDir = getNewUserDir();
  return USER_ENTRIES.map((entry) => {
    const source = path.join(oldDir, entry.sourceName);
    const target = path.join(newDir, entry.targetName);
    return { source, target, status: copyItem(source, target, entry.kind) };
  });
}

/**
 * Copies all project-level entries from {cwd}/openpowers/ to {cwd}/furina/.
 * @param cwd - Project root containing the openpowers/ directory
 * @returns per-item results for the project-level migration
 */
function migrateProjectData(cwd: string): MigrationItemResult[] {
  return PROJECT_ENTRIES.map((entry) => {
    const source = path.join(cwd, 'openpowers', entry.sourceName);
    const target = path.join(cwd, 'furina', entry.targetName);
    return { source, target, status: copyItem(source, target, entry.kind) };
  });
}

/**
 * Verifies that every migrated item whose source exists also has an existing target.
 * @param items - Migration results to verify
 * @returns lists of verified and failed target paths
 */
function verifyItems(items: MigrationItemResult[]): { verified: string[]; failures: string[] } {
  const verified: string[] = [];
  const failures: string[] = [];
  for (const item of items) {
    if (!fs.existsSync(item.source)) {
      continue;
    }
    if (fs.existsSync(item.target)) {
      verified.push(item.target);
    } else {
      failures.push(item.target);
    }
  }
  return { verified, failures };
}

// ---------------------------------------------------------------------------
// Main entry points
// ---------------------------------------------------------------------------

/**
 * Runs the complete one-time migration: user-level and project-level data.
 * Copy-only, idempotent, and verified after the copy. Logs source/target/result
 * for every item and returns a summary for reporting.
 * @param cwd - Project root whose openpowers/ should be migrated
 * @returns the migration summary
 */
export function runMigration(cwd: string = process.cwd()): MigrationSummary {
  const migratedAt = new Date().toISOString();
  const user = migrateUserData();
  const project = migrateProjectData(cwd);
  const userVerification = verifyItems(user);
  const projectVerification = verifyItems(project);

  const summary: MigrationSummary = {
    needsMigration: detectOldData(cwd),
    migratedAt,
    user,
    project,
    verifiedTargets: [...userVerification.verified, ...projectVerification.verified],
    verificationFailures: [...userVerification.failures, ...projectVerification.failures],
  };

  if (summary.verificationFailures.length === 0) {
    logger.info('Data migration completed successfully: all targets verified');
  } else {
    logger.warn(
      `Data migration completed with verification failures: ${summary.verificationFailures.length} target(s) missing`,
    );
  }
  return summary;
}

/**
 * Runs the migration automatically on first start, but only when the old user
 * directory exists and the new directory has no migrated data yet.
 * @param cwd - Project root to inspect
 * @returns true when a migration was executed, false otherwise
 */
export function runAutoMigrationIfNeeded(cwd: string = process.cwd()): boolean {
  if (!shouldAutoMigrate(cwd)) {
    return false;
  }
  const summary = runMigration(cwd);
  const total = summary.user.length + summary.project.length;
  logger.info(`Auto migration triggered on startup: ${total} item(s) processed`);
  return true;
}
