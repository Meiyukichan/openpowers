/**
 * Syncs a change's design.md to global memory and updates dreamwork.json.
 * Operates on the nested DreamworkConfig structure (project + changes arrays).
 * @author Meiyuki <meiyukichan@163.com>
 * @copyright 2026 Meiyuki
 */

import fs from 'fs';
import http from 'http';
import os from 'os';
import path from 'path';
import { logger } from '../../utils/logger.js';
import {
  flattenCwdPath,
  formatToday,
  formatYesterday,
  readDreamworkConfig,
  writeDreamworkConfig,
} from './dreamwork.js';

/**
 * Syncs design.md to global memory and updates dreamwork.json projects.
 * Called from runFeatureStatus after validating the change name.
 *
 * Steps:
 * 1. Copy design.md to ~/.openpowers/memory/{flatCwd}/design_{changeName}.md
 * 2. Update dreamwork.json projects array (project-level + change-level dedup)
 * 3. HTTP PUT to schedule API (silently skip on failure)
 *
 * If design.md does not exist, the function returns immediately without
 * updating dreamwork.json or calling the schedule API (D4).
 *
 * Date comparison uses explicit else-if to distinguish yesterday vs today (D5).
 * Dedup uses nested structure: find matching project by project field,
 * then check changes array by path field to avoid duplicates.
 *
 * @param changeName - The kebab-case change name
 */
export function syncDesignToMemory(changeName: string): void {
  const cwd = process.cwd();
  const flatCwd = flattenCwdPath(cwd);

  // Resolve design path
  const CHANGES_DIR = path.join(cwd, 'openpowers', 'changes');
  const designPath = path.join(CHANGES_DIR, changeName, 'design.md');

  // D4: If design.md does not exist, skip Step 2 and Step 3 entirely
  if (!fs.existsSync(designPath)) {
    return;
  }

  // Step 1: Copy design.md to memory directory
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

  // Step 2: Update dreamwork.json with nested project + changes structure
  const config = readDreamworkConfig();
  const yesterday = formatYesterday();
  const today = formatToday();

  const projectPath = path.join(os.homedir(), '.openpowers', 'memory', flatCwd);
  const changePath = path.join(projectPath, `design_${changeName}.md`);

  if (config.workAt === yesterday) {
    // workAt is yesterday: reset to fresh config, then add new project + change
    writeDreamworkConfig({
      status: 'ready',
      workAt: today,
      projects: [
        {
          project: projectPath,
          changes: [{ path: changePath, status: 'ready' }],
        },
      ],
    });
  } else if (config.workAt === today) {
    // D5: workAt is today: nested dedup (project-level + change-level)

    // Project-level dedup: find existing project by project field
    let project = config.projects.find((p) => p.project === projectPath);
    if (!project) {
      project = { project: projectPath, changes: [] };
      config.projects.push(project);
    }

    // Change-level dedup: avoid adding duplicate change paths
    const changeExists = project.changes.some((c) => c.path === changePath);
    if (!changeExists) {
      project.changes.push({ path: changePath, status: 'ready' });
    }

    writeDreamworkConfig(config);
  }
  // else: readDreamworkConfig guarantees workAt is today or yesterday;
  // if neither matched (reset occurred), no additional handling needed

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
