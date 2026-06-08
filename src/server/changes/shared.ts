/**
 * Shared utilities for the changes module.
 * Provides getAllChanges() for cross-project aggregate changes query.
 * @author Meiyuki <meiyukichan@163.com>
 * @copyright 2026 Meiyuki
 */

import fs from 'fs';
import os from 'os';
import path from 'path';
import { flattenCwdPath } from '../../utils/memory.js';
import type { ChangeEntry } from '../../utils/memory.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A ChangeEntry with its parent project's cwd injected at runtime. */
export type ChangeEntryWithCwd = ChangeEntry & { cwd: string };

/** Options for filtering and querying aggregated changes. */
export interface GetAllChangesOptions {
  /** Filter by change status (active | archived | removed). */
  status?: string;
  /** Filter by project cwd path (flattened to match Memory_ directory name). */
  cwd?: string;
  /** Case-insensitive fuzzy search across name, description, and cwd fields. */
  query?: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Root directory for global memory data. */
const MEMORY_DIR = path.join(os.homedir(), '.openpowers', 'memory');

// ---------------------------------------------------------------------------
// Core function
// ---------------------------------------------------------------------------

/**
 * Scans all Memory_ prefixed directories under ~/.openpowers/memory/,
 * reads each changes.json, extracts the changes array, injects the parent
 * cwd field into each entry, applies optional filters (status/cwd/query),
 * and returns the results sorted by updateAt descending (entries without
 * updateAt go last).
 *
 * @param options - Optional filtering and querying parameters
 * @returns Aggregated and filtered ChangeEntryWithCwd array
 */
export function getAllChanges(options: GetAllChangesOptions = {}): ChangeEntryWithCwd[] {
  const allChanges: ChangeEntryWithCwd[] = [];

  if (!fs.existsSync(MEMORY_DIR)) {
    return allChanges;
  }

  let dirEntries: fs.Dirent[];
  try {
    dirEntries = fs.readdirSync(MEMORY_DIR, { withFileTypes: true });
  } catch {
    return allChanges;
  }

  // Determine which directories to scan
  const targetDirs: string[] = [];
  if (options.cwd) {
    const targetDirName = flattenCwdPath(options.cwd);
    for (const entry of dirEntries) {
      if (entry.isDirectory() && entry.name === targetDirName) {
        targetDirs.push(path.join(MEMORY_DIR, entry.name));
        break;
      }
    }
  } else {
    for (const entry of dirEntries) {
      if (entry.isDirectory() && entry.name.startsWith('Memory_')) {
        targetDirs.push(path.join(MEMORY_DIR, entry.name));
      }
    }
  }

  // Read changes.json from each target directory
  for (const dir of targetDirs) {
    const changesJsonPath = path.join(dir, 'changes.json');
    if (!fs.existsSync(changesJsonPath)) {
      continue;
    }

    let raw: string;
    try {
      raw = fs.readFileSync(changesJsonPath, 'utf-8');
    } catch {
      continue;
    }

    let data: { cwd?: string; changes?: ChangeEntry[] };
    try {
      data = JSON.parse(raw);
    } catch {
      continue;
    }

    const cwd = data.cwd ?? '';
    const changes = Array.isArray(data.changes) ? data.changes : [];

    for (const entry of changes) {
      allChanges.push({ ...entry, cwd });
    }
  }

  // Apply status filter
  let filtered = allChanges;
  if (options.status) {
    filtered = filtered.filter((c) => c.status === options.status);
  }

  // Apply query filter (case-insensitive match on name, description, cwd)
  if (options.query) {
    const q = options.query.toLowerCase();
    filtered = filtered.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.description.toLowerCase().includes(q) ||
        c.cwd.toLowerCase().includes(q),
    );
  }

  // Sort by updateAt descending; entries without updateAt go last
  filtered.sort((a, b) => {
    if (!a.updateAt && !b.updateAt) return 0;
    if (!a.updateAt) return 1;
    if (!b.updateAt) return -1;
    return b.updateAt.localeCompare(a.updateAt);
  });

  return filtered;
}
