/**
 * Shared utilities for the changes module.
 * Provides getAllChanges() for cross-project aggregate changes query.
 * @author Meiyuki <meiyukichan@163.com>
 * @copyright 2026 Meiyuki
 */

import fs from 'fs/promises';
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
 * reads each changes.json asynchronously, extracts the changes array,
 * injects the parent cwd field into each entry, applies optional filters
 * (status/cwd/query), and returns the results sorted by updateAt descending
 * (entries without updateAt go last).
 *
 * @param options - Optional filtering and querying parameters
 * @returns Aggregated and filtered ChangeEntryWithCwd array
 */
export async function getAllChanges(options: GetAllChangesOptions = {}): Promise<ChangeEntryWithCwd[]> {
  const allChanges: ChangeEntryWithCwd[] = [];

  let dirEntries: string[];
  try {
    const entries = await fs.readdir(MEMORY_DIR, { withFileTypes: true });
    // Determine which directories to scan
    dirEntries = [];
    if (options.cwd) {
      const targetDirName = flattenCwdPath(options.cwd);
      for (const entry of entries) {
        if (entry.isDirectory() && entry.name === targetDirName) {
          dirEntries.push(path.join(MEMORY_DIR, entry.name));
          break;
        }
      }
    } else {
      for (const entry of entries) {
        if (entry.isDirectory() && entry.name.startsWith('Memory_')) {
          dirEntries.push(path.join(MEMORY_DIR, entry.name));
        }
      }
    }
  } catch {
    return allChanges;
  }

  // Read changes.json from each target directory concurrently
  const results = await Promise.allSettled(
    dirEntries.map(async (dir) => {
      const changesJsonPath = path.join(dir, 'changes.json');
      const raw = await fs.readFile(changesJsonPath, 'utf-8');
      const data: { cwd?: string; changes?: ChangeEntry[] } = JSON.parse(raw);
      const cwd = data.cwd ?? '';
      const changes = Array.isArray(data.changes) ? data.changes : [];
      return changes.map((entry) => ({ ...entry, cwd }));
    }),
  );

  for (const result of results) {
    if (result.status === 'fulfilled') {
      allChanges.push(...result.value);
    }
    // rejected results (missing files, parse errors) are silently skipped
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
