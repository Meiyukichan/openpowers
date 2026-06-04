/**
 * Dreamwork config lifecycle management.
 * Handles reading, validating, and writing the global memory config file
 * at ~/.openpowers/memory/dreamwork.json.
 * @author Meiyuki <meiyukichan@163.com>
 * @copyright 2026 Meiyuki
 */

import fs from 'fs';
import os from 'os';
import path from 'path';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DreamworkChange {
  path: string;
  status: string;
}

export interface DreamworkProject {
  project: string;
  changes: DreamworkChange[];
}

export interface DreamworkConfig {
  status: string;
  workAt: string;
  projects: DreamworkProject[];
}

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

const MEMORY_DIR = path.join(os.homedir(), '.openpowers', 'memory');
const DREAMWORK_PATH = path.join(MEMORY_DIR, 'dreamwork.json');

// ---------------------------------------------------------------------------
// Date helpers
// ---------------------------------------------------------------------------

/** Formats a Date as YYYY-MM-DD. */
export function formatToday(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Formats yesterday as YYYY-MM-DD. */
export function formatYesterday(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// ---------------------------------------------------------------------------
// Path flattening
// ---------------------------------------------------------------------------

/**
 * Flattens a cwd path into a safe directory name.
 * Step 1: replace all \\ with /
 * Step 2: replace : with _ (Windows drive letter separator)
 * Step 3: replace / with _
 * @param cwd - The current working directory path
 * @returns Flattened path safe for use as a directory name
 */
export function flattenCwdPath(cwd: string): string {
  return cwd.replace(/\\/g, '/').replace(/:/g, '_').replace(/\//g, '_');
}

// ---------------------------------------------------------------------------
// Config reading (with validation)
// ---------------------------------------------------------------------------

/**
 * Creates a default DreamworkConfig with today's date.
 */
function createDefaultConfig(): DreamworkConfig {
  return {
    status: 'ready',
    workAt: formatToday(),
    projects: [],
  };
}

/**
 * Reads dreamwork.json, creating it if needed, and validates the workAt field.
 *
 * Rules:
 * - File missing → create default { status: 'ready', workAt: '<today>', projects: [] }
 * - workAt is today → keep existing config
 * - workAt is yesterday → keep existing config
 * - workAt is other date → reset to default
 * - workAt is today AND status is 'done' → reset status to 'ready'
 * - JSON parse error → reset to default
 *
 * @returns The validated DreamworkConfig object
 */
export function readDreamworkConfig(): DreamworkConfig {
  const today = formatToday();
  const yesterday = formatYesterday();

  // Create default if file doesn't exist
  if (!fs.existsSync(DREAMWORK_PATH)) {
    const config = createDefaultConfig();
    writeDreamworkConfig(config);
    return config;
  }

  // Read and parse existing config
  let config: DreamworkConfig;
  try {
    const raw = fs.readFileSync(DREAMWORK_PATH, 'utf-8');
    config = JSON.parse(raw) as DreamworkConfig;
  } catch {
    // Invalid JSON, recreate default
    const defaultConfig = createDefaultConfig();
    writeDreamworkConfig(defaultConfig);
    return defaultConfig;
  }

  // Detect old format: projects elements with 'path' field instead of 'project' field
  if (config.projects && config.projects.length > 0) {
    const first = config.projects[0] as unknown as Record<string, unknown>;
    if ('path' in first && !('project' in first)) {
      const defaultConfig = createDefaultConfig();
      writeDreamworkConfig(defaultConfig);
      return defaultConfig;
    }
  }

  // Validate workAt field
  if (config.workAt !== today && config.workAt !== yesterday) {
    // workAt is neither today nor yesterday, reset to default
    const defaultConfig = createDefaultConfig();
    writeDreamworkConfig(defaultConfig);
    return defaultConfig;
  }

  // If workAt is today and status is done, reset to ready
  if (config.workAt === today && config.status === 'done') {
    config.status = 'ready';
    writeDreamworkConfig(config);
  }

  return config;
}

// ---------------------------------------------------------------------------
// Config writing
// ---------------------------------------------------------------------------

/**
 * Writes a DreamworkConfig to ~/.openpowers/memory/dreamwork.json.
 * Creates parent directories recursively.
 * Format: JSON.stringify(data, null, 2) + '\n' (UTF-8).
 *
 * @param config - The DreamworkConfig to persist
 */
export function writeDreamworkConfig(config: DreamworkConfig): void {
  if (!fs.existsSync(MEMORY_DIR)) {
    fs.mkdirSync(MEMORY_DIR, { recursive: true });
  }
  const body = `${JSON.stringify(config, null, 2)}\n`;
  fs.writeFileSync(DREAMWORK_PATH, body, 'utf-8');
}

// ---------------------------------------------------------------------------
// Factory for testable imports (each call returns fresh references)
// ---------------------------------------------------------------------------

/**
 * Returns a fresh set of dreamwork config functions.
 * Use in tests to avoid module-level mock caching.
 */
export function importDreamworkConfig() {
  return {
    readDreamworkConfig,
    writeDreamworkConfig,
    flattenCwdPath,
  };
}
