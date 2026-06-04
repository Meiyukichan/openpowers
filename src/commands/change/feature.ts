/**
 * Feature lifecycle management subcommands for the change command
 * Provides status, next, start, and complete operations for features in plan.json
 * @author Meiyuki <meiyukichan@163.com>
 * @copyright 2026 Meiyuki
 */

import fs from 'fs';
import http from 'http';
import os from 'os';
import path from 'path';
import { logger } from '../../utils/logger.js';
import { CHANGES_DIR, validateChangeName } from './shared.js';
import { flattenCwdPath, formatToday, formatYesterday, readDreamworkConfig, writeDreamworkConfig } from '../../server/memory/dreamwork.js';

// Feature data interface
interface Feature {
  id: string;
  status: string;
  category?: string;
  function?: string;
  description?: string;
  acceptance_criteria?: string[];
  tasks?: string[];
  files?: string[];
  dependencies?: string[];
  spec_refs?: string[];
}

/**
 * Validates a change name is kebab-case, exiting with error if invalid.
 * Delegates to the shared validateChangeName for the kebab-case check.
 * @param changeName - The change name to validate
 */
function requireValidChangeName(changeName: string): void {
  const result = validateChangeName(changeName);
  if (!result.valid) {
    process.stderr.write(`Error: ${result.error}\n`);
    process.exit(1);
  }
}

/**
 * Loads features from plan.json.
 * @param planPath - Absolute path to plan.json
 * @returns Array of Feature objects, or empty array if file not found
 */
function loadPlan(planPath: string): Feature[] {
  if (!fs.existsSync(planPath)) {
    return [];
  }
  try {
    const raw = fs.readFileSync(planPath, 'utf-8');
    const data = JSON.parse(raw);
    if (!Array.isArray(data)) return [];
    return data as Feature[];
  } catch (err) {
    logger.error(`Failed to load plan from ${planPath}: ${String(err)}`);
    return [];
  }
}

/**
 * Saves features to plan.json with indent=2 formatting.
 * @param planPath - Absolute path to plan.json
 * @param features - Array of Feature objects to save
 */
function savePlan(planPath: string, features: Feature[]): void {
  const dir = path.dirname(planPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  const content = JSON.stringify(features, null, 2);
  fs.writeFileSync(planPath, content, 'utf-8');
  logger.info(`Saved plan to ${path.relative(process.cwd(), planPath)}`);
}

/**
 * Finds a feature by ID in the features array.
 * @param features - Array of Feature objects
 * @param id - Feature ID to find
 * @returns The Feature object, or undefined if not found
 */
function getFeatureById(features: Feature[], id: string): Feature | undefined {
  return features.find((f) => f.id === id);
}

/**
 * Checks if all dependencies of a feature are satisfied (status === 'done' or 'skipped').
 * @param feature - The feature to check
 * @param features - All features array for dependency resolution
 * @returns true if all dependencies are done or skipped, or feature has no dependencies
 */
function getDependenciesSatisfied(feature: Feature, features: Feature[]): boolean {
  if (!feature.dependencies || feature.dependencies.length === 0) return true;
  return feature.dependencies.every((depId) => {
    const dep = getFeatureById(features, depId);
    if (!dep) return false;
    return dep.status === 'done' || dep.status === 'skipped';
  });
}

/**
 * Detects circular dependencies using DFS.
 * @param features - Array of Feature objects
 * @returns Array of cycle description strings, empty if no cycles found
 */
function detectCycles(features: Feature[]): string[] {
  const adj: Record<string, string[]> = {};
  for (const f of features) {
    adj[f.id] = f.dependencies || [];
  }

  const cycles: string[] = [];
  const visited = new Set<string>();
  const recStack = new Set<string>();
  const path: string[] = [];

  function dfs(node: string): void {
    visited.add(node);
    recStack.add(node);
    path.push(node);

    for (const neighbor of (adj[node] || [])) {
      if (!visited.has(neighbor)) {
        dfs(neighbor);
      } else if (recStack.has(neighbor)) {
        // Cycle found: extract from neighbor to current node in path
        const cycleStart = path.indexOf(neighbor);
        const cyclePath = path.slice(cycleStart);
        cyclePath.push(neighbor);
        cycles.push(cyclePath.join(' -> '));
      }
    }

    path.pop();
    recStack.delete(node);
  }

  for (const f of features) {
    if (!visited.has(f.id)) {
      dfs(f.id);
    }
  }

  return cycles;
}

/**
 * Finds the next actionable feature.
 * Priority: in_progress > first pending with satisfied deps > undefined.
 * @param features - Array of Feature objects
 * @returns The next Feature to work on, or undefined if none available
 */
function getNextFeature(features: Feature[]): Feature | undefined {
  // Priority 1: in_progress feature
  const inProgress = features.find((f) => f.status === 'in_progress');
  if (inProgress) return inProgress;

  // Priority 2: first pending with satisfied deps
  const nextPending = features.find(
    (f) => f.status === 'pending' && getDependenciesSatisfied(f, features),
  );
  if (nextPending) return nextPending;

  return undefined;
}

/**
 * Prints full details of a feature to stdout.
 * Format matches feature-manager.py cmd_next output.
 * @param feature - The feature to print
 */
function printFeatureDetails(feature: Feature): void {
  process.stdout.write(`Next feature id: ${feature.id}\n`);
  process.stdout.write(`  Category: ${feature.category}\n`);
  process.stdout.write(`  Function: ${feature.function}\n`);
  process.stdout.write(`  Description: ${feature.description}\n`);

  process.stdout.write(`\nAcceptance Criteria:\n`);
  if (feature.acceptance_criteria && feature.acceptance_criteria.length > 0) {
    feature.acceptance_criteria.forEach((ac, i) => {
      process.stdout.write(`  ${i + 1}. ${ac}\n`);
    });
  }

  if (feature.tasks && feature.tasks.length > 0) {
    process.stdout.write(`\nTasks:\n`);
    feature.tasks.forEach((t) => {
      process.stdout.write(`  - ${t}\n`);
    });
  }

  if (feature.dependencies && feature.dependencies.length > 0) {
    process.stdout.write(`\nDependencies: ${feature.dependencies.join(', ')}\n`);
  }

  if (feature.spec_refs && feature.spec_refs.length > 0) {
    process.stdout.write(`\nSpec Refs:\n`);
    for (const ref of feature.spec_refs) {
      process.stdout.write(`  - ${ref}\n`);
    }
  }

  if (feature.files && feature.files.length > 0) {
    process.stdout.write(`\nFiles:\n`);
    for (const file of feature.files) {
      process.stdout.write(`  - ${file}\n`);
    }
  }
}

/**
 * Runs the `feature status` subcommand.
 * Shows feature status summary with counts per state and progress percentage.
 * Blocked is counted as a mutually exclusive category (pending with unmet deps
 * counts as blocked, not pending).
 * @param changeName - The kebab-case change name
 */
export function runFeatureStatus(changeName: string): void {
  requireValidChangeName(changeName);

  // Sync design.md to global memory (mem-01)
  syncDesignToMemory(changeName);

  const planPath = path.join(CHANGES_DIR, changeName, 'plan.json');
  const features = loadPlan(planPath);

  if (features.length === 0 && !fs.existsSync(planPath)) {
    process.stderr.write(`Error: No plan.json found for change '${changeName}'\n`);
    process.exit(1);
  }

  if (features.length === 0) {
    process.stdout.write(`No features found in plan.json for change '${changeName}'\n`);
    return;
  }

  const total = features.length;
  let done = 0;
  let inProgress = 0;
  let pending = 0;
  let blocked = 0;
  let skipped = 0;
  const inProgressFeatures: Feature[] = [];

  for (const f of features) {
    if (f.status === 'done') {
      done++;
    } else if (f.status === 'in_progress') {
      inProgress++;
      inProgressFeatures.push(f);
    } else if (f.status === 'pending') {
      pending++;
      if (!getDependenciesSatisfied(f, features)) {
        blocked++;
      }
    } else if (f.status === 'skipped') {
      skipped++;
    }
  }

  const progress = total > 0 ? (done / total) * 100 : 0;

  process.stdout.write(`Feature List Status: ${planPath}\n`);
  process.stdout.write(`  Total: ${total}\n`);
  process.stdout.write(`  Done: ${done}\n`);
  process.stdout.write(`  In Progress: ${inProgress}\n`);
  process.stdout.write(`  Pending: ${pending}\n`);
  process.stdout.write(`  Blocked: ${blocked}\n`);
  process.stdout.write(`  Skipped: ${skipped}\n`);

  if (inProgressFeatures.length > 0) {
    process.stdout.write(`Currently in progress:\n`);
    for (const f of inProgressFeatures) {
      process.stdout.write(`  - ${f.id}: ${f.function || '(no function)'}\n`);
    }
  }

  process.stdout.write(`Progress: ${progress.toFixed(1)}%\n`);
}

/**
 * Runs the `feature next` subcommand.
 * Finds the next actionable feature using DFS cycle detection.
 * Priority: in_progress > first pending with satisfied deps.
 * @param changeName - The kebab-case change name
 */
export function runFeatureNext(changeName: string): void {
  requireValidChangeName(changeName);

  const planPath = path.join(CHANGES_DIR, changeName, 'plan.json');
  const features = loadPlan(planPath);

  if (features.length === 0 && !fs.existsSync(planPath)) {
    process.stdout.write(`No plan.json found for change '${changeName}'\n`);
    return;
  }

  if (features.length === 0) {
    process.stdout.write('No features found in plan.json\n');
    return;
  }

  // Cycle detection
  const cycles = detectCycles(features);
  if (cycles.length > 0) {
    process.stderr.write(`Circular dependencies detected:\n`);
    for (const cycle of cycles) {
      process.stderr.write(`  ${cycle}\n`);
    }
    process.exit(1);
  }

  const next = getNextFeature(features);
  if (!next) {
    const remaining = features.filter((f) => f.status !== 'done' && f.status !== 'skipped').length;
    if (remaining > 0) {
      process.stdout.write(`No more features to work on (all pending features have unmet dependencies)\n`);
    } else {
      process.stdout.write('All features completed!\n');
    }
    return;
  }

  printFeatureDetails(next);
}

/**
 * Runs the `feature start <featureId>` subcommand.
 * Validates feature exists, is pending, and has satisfied dependencies,
 * then sets status to in_progress and saves plan.json.
 * @param changeName - The kebab-case change name
 * @param featureId - The ID of the feature to start
 */
export function runFeatureStart(changeName: string, featureId: string): void {
  requireValidChangeName(changeName);

  const planPath = path.join(CHANGES_DIR, changeName, 'plan.json');
  if (!fs.existsSync(planPath)) {
    process.stderr.write(`Error: No plan.json found for change '${changeName}'\n`);
    process.exit(1);
  }

  const features = loadPlan(planPath);
  const feature = getFeatureById(features, featureId);

  if (!feature) {
    process.stderr.write(`Error: Feature '${featureId}' not found\n`);
    process.exit(1);
  }

  if (feature.status === 'in_progress') {
    process.stdout.write(`Feature '${featureId}' is already in progress\n`);
    return;
  }

  if (feature.status !== 'pending') {
    process.stderr.write(`Error: Feature '${featureId}' is not pending (current: ${feature.status})\n`);
    process.exit(1);
  }

  if (!getDependenciesSatisfied(feature, features)) {
    process.stderr.write(`Error: Feature '${featureId}' has unmet dependencies\n`);
    process.exit(1);
  }

  feature.status = 'in_progress';
  savePlan(planPath, features);
  process.stdout.write(`Started feature: ${featureId}\n`);
  logger.info(`Feature '${featureId}' started in change '${changeName}'`);
}

/**
 * Runs the `feature complete <featureId>` subcommand.
 * Validates feature exists and is in_progress, sets status to done,
 * saves plan.json, and runs post-completion check for the next feature.
 * @param changeName - The kebab-case change name
 * @param featureId - The ID of the feature to complete
 */
export function runFeatureComplete(changeName: string, featureId: string): void {
  requireValidChangeName(changeName);

  const planPath = path.join(CHANGES_DIR, changeName, 'plan.json');
  if (!fs.existsSync(planPath)) {
    process.stderr.write(`Error: No plan.json found for change '${changeName}'\n`);
    process.exit(1);
  }

  const features = loadPlan(planPath);
  const feature = getFeatureById(features, featureId);

  if (!feature) {
    process.stderr.write(`Error: Feature '${featureId}' not found\n`);
    process.exit(1);
  }

  if (feature.status !== 'in_progress') {
    process.stderr.write(`Error: Feature '${featureId}' is not in_progress (current: ${feature.status})\n`);
    process.exit(1);
  }

  feature.status = 'done';
  savePlan(planPath, features);
  process.stdout.write(`Completed feature: ${featureId}\n`);
  logger.info(`Feature '${featureId}' completed in change '${changeName}'`);
}

/**
 * Syncs design.md to global memory and updates dreamwork.json projects.
 * Called from runFeatureStatus after validating the change name.
 *
 * Steps:
 * 1. Flatten cwd path
 * 2. Copy design.md to ~/.openpowers/memory/{flatCwd}/design_{changeName}.md
 * 3. Update dreamwork.json projects array (dedup, handle workAt=yesterday)
 * 4. HTTP PUT to schedule API (silently skip on failure)
 *
 * @param changeName - The kebab-case change name
 */
export function syncDesignToMemory(changeName: string): void {
  const cwd = process.cwd();
  const flatCwd = flattenCwdPath(cwd);

  // Step 1: Copy design.md if it exists
  const designPath = path.join(CHANGES_DIR, changeName, 'design.md');
  if (fs.existsSync(designPath)) {
    const memoryDesignDir = path.join(os.homedir(), '.openpowers', 'memory', flatCwd);
    try {
      if (!fs.existsSync(memoryDesignDir)) {
        fs.mkdirSync(memoryDesignDir, { recursive: true });
      }
      const destPath = path.join(memoryDesignDir, `design_${changeName}.md`);
      fs.cpSync(designPath, destPath);
    } catch {
      // Silently skip if copy fails
    }
  }

  // Step 2: Update dreamwork.json projects array
  const config = readDreamworkConfig();

  const yesterday = formatYesterday();

  if (config.workAt === yesterday) {
    // workAt is yesterday: reset to fresh config, then add project
    const todayStr = formatToday();
    writeDreamworkConfig({
      status: 'ready',
      workAt: todayStr,
      projects: [{ path: flatCwd, status: 'ready' }],
    });
  } else {
    // workAt is today: add project with dedup
    const projectExists = config.projects.some((p) => p.path === flatCwd);
    if (!projectExists) {
      config.projects.push({ path: flatCwd, status: 'ready' });
      writeDreamworkConfig(config);
    }
  }

  // Step 3: Call schedule API to ensure scheduler is running
  const port = process.env.OPENPOWERS_UI_PORT ?? 3939;
  const scheduleUrl = `http://localhost:${port}/openpowers/api/schedule`;

  try {
    const req = http.request(scheduleUrl, { method: 'PUT' }, (res) => {
      // Consume response to free memory
      res.resume();
      logger.info(`Schedule API called: ${res.statusCode}`);
    });
    req.on('error', () => {
      // Silently skip on connection failure — backend may not be running
    });
    req.end();
  } catch {
    // Silently skip if request creation fails
  }
}

// Export internal helpers for testing
export {
  loadPlan,
  savePlan,
  getFeatureById,
  getDependenciesSatisfied,
  detectCycles,
  getNextFeature,
};

export type { Feature };
