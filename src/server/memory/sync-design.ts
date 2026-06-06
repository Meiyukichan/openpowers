/**
 * Syncs a change's design.md to global memory under designs/ subdirectory.
 * @author Meiyuki <meiyukichan@163.com>
 * @copyright 2026 Meiyuki
 */

import fs from 'fs';
import http from 'http';
import os from 'os';
import path from 'path';
import { logger } from '../../utils/logger.js';
import { flattenCwdPath } from '../../utils/memory.js';
import { appendLog } from './schedule-logger.js';

// Re-export for backward compatibility
export { flattenCwdPath };

/**
 * Syncs design.md to global memory under designs/ subdirectory.
 * Called from runFeatureStatus after validating the change name.
 *
 * Steps:
 * 1. Copy design.md to ~/.openpowers/memory/{flatCwd}/designs/{changeName}.md
 * 2. HTTP PUT to schedule API (silently skip on failure)
 *
 * If design.md does not exist, the function returns immediately without
 * calling the schedule API.
 *
 * @param changeName - The kebab-case change name
 * @param cwd - The working directory path
 */
export function syncDesignToMemory(changeName: string, cwd: string): void {
  const flatCwd = flattenCwdPath(cwd);

  // Resolve design path
  const CHANGES_DIR = path.join(cwd, 'openpowers', 'changes');
  const designPath = path.join(CHANGES_DIR, changeName, 'design.md');

  // If design.md does not exist, skip entirely
  if (!fs.existsSync(designPath)) {
    appendLog(`syncDesignToMemory: design.md not found for change "${changeName}", skipping`);
    return;
  }

  // Step 1: Copy design.md to designs/ subdirectory under memory path
  const memoryDesignDir = path.join(os.homedir(), '.openpowers', 'memory', flatCwd);
  const designsDir = path.join(memoryDesignDir, 'designs');
  try {
    if (!fs.existsSync(designsDir)) {
      fs.mkdirSync(designsDir, { recursive: true });
    }
    const destPath = path.join(designsDir, `${changeName}.md`);
    fs.cpSync(designPath, destPath);
    appendLog(`syncDesignToMemory: copied design.md to ${destPath}`);
  } catch {
    appendLog(`syncDesignToMemory: failed to copy design.md to ${designsDir}`);
  }

  // Step 2: Call schedule API to ensure scheduler is running
  const port = process.env.OPENPOWERS_UI_PORT ?? 3939;
  const scheduleUrl = `http://localhost:${port}/openpowers/api/schedule`;

  try {
    const req = http.request(scheduleUrl, { method: 'PUT', timeout: 5000 }, (res) => {
      res.resume();
      appendLog(`syncDesignToMemory: schedule API responded ${res.statusCode}`);
      logger.info(`Schedule API called: ${res.statusCode}`);
    });
    req.on('timeout', () => {
      req.destroy();
      appendLog('syncDesignToMemory: schedule API call timed out');
    });
    req.on('error', () => {
      appendLog('syncDesignToMemory: schedule API call failed (backend may not be running)');
    });
    req.end();
  } catch {
    appendLog('syncDesignToMemory: schedule API request creation failed');
  }
}
