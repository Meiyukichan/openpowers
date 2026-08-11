/**
 * Archive subcommand for the change command
 * Validates change existence, active status, and artifact completion,
 * then moves the change directory to furina/archive/YYYY-MM-DD-<name>/
 * @author Meiyuki <meiyukichan@163.com>
 * @copyright 2026 Meiyuki
 */

import fs from 'fs';
import os from 'os';
import path from 'path';
import { logger } from '../../utils/logger.js';
import {
  CHANGES_DIR,
  ARCHIVE_DIR,
  CHANGES_JSON_PATH,
  syncChangesJson,
} from './shared.js';
import { computeArtifactStatus } from './status.js';
import { flattenCwdPath, writeMemoryChangesJson } from '../../utils/memory.js';
import type { ChangesJson } from '../../utils/memory.js';

/**
 * Archives a completed change by moving its directory from furina/changes/ to
 * furina/archive/YYYY-MM-DD-<name>/ after validating that the change exists,
 * is active (not already archived), and all artifacts have status "done".
 * @param name - The change name to archive
 */
export function runChangeArchive(name: string): void {
  // Sync changes.json to get current state
  const data = syncChangesJson();

  // Check if change exists in archive (already archived)
  const archivedEntry = data.archive.find((a) => a.name === name);
  if (archivedEntry) {
    process.stderr.write(`Change '${name}' is already archived\n`);
    process.exit(1);
  }

  // Check if change exists in active changes
  const changeEntry = data.changes.find((c) => c.name === name);
  if (!changeEntry) {
    process.stderr.write(`Change '${name}' not found\n`);
    process.exit(1);
  }

  // Resolve the change directory path
  const changeDirPath = path.resolve(process.cwd(), String(changeEntry.path));

  // Compute artifact status for the change directory
  const artifacts = computeArtifactStatus(changeDirPath);

  // Check if ALL artifacts returned by computeArtifactStatus are done
  const notDoneArtifacts = artifacts
    .filter((a) => a.status !== 'done')
    .map((a) => a.id);

  if (notDoneArtifacts.length > 0) {
    process.stderr.write(`Change '${name}' not all artifacts are done\n`);
    process.stderr.write(`Artifacts not done: ${notDoneArtifacts.join(', ')}\n`);
    process.exit(1);
  }

  // Build target archive path: furina/archive/YYYY-MM-DD-<name>/
  const today = new Date().toISOString().slice(0, 10);
  const targetDirName = `${today}-${name}`;
  const targetDir = path.join(ARCHIVE_DIR, targetDirName);

  // Ensure archive directory exists
  if (!fs.existsSync(ARCHIVE_DIR)) {
    fs.mkdirSync(ARCHIVE_DIR, { recursive: true });
  }

  // Move directory using atomic rename
  fs.renameSync(changeDirPath, targetDir);
  logger.info(`Archived '${name}' to ${path.relative(process.cwd(), targetDir)}`);

  // Update changes.json: remove from changes, add to archive
  const updatedChanges = data.changes.filter((c) => c.name !== name);
  const archiveEntry = {
    name,
    path: path.relative(process.cwd(), targetDir).replace(/\\/g, '/'),
    description: changeEntry.description ?? '',
    createdAt: changeEntry.createdAt ?? new Date().toISOString(),
    closedAt: new Date().toISOString(),
    features: changeEntry.features ?? 0,
    artifacts: changeEntry.artifacts ?? [],
  };

  // Write back changes.json
  const newData = {
    framework: data.framework,
    version: data.version,
    changes: updatedChanges,
    archive: [...data.archive.filter((a) => a.name !== name), archiveEntry],
  };

  const jsonDir = path.dirname(CHANGES_JSON_PATH);
  if (!fs.existsSync(jsonDir)) {
    fs.mkdirSync(jsonDir, { recursive: true });
  }
  fs.writeFileSync(CHANGES_JSON_PATH, JSON.stringify(newData, null, 2), 'utf-8');

  // Sync global memory changes.json
  try {
    const cwd = process.cwd();
    const memoryPath = path.join(os.homedir(), '.furina', 'memory', flattenCwdPath(cwd), 'changes.json');

    if (!fs.existsSync(memoryPath)) {
      logger.warn(`Global memory changes.json not found at ${memoryPath}, skipping sync`);
    } else {
      let memoryData: Record<string, unknown> | null = null;
      try {
        const raw = fs.readFileSync(memoryPath, 'utf-8');
        memoryData = JSON.parse(raw) as Record<string, unknown>;
      } catch {
        logger.error(`Failed to parse global memory changes.json at ${memoryPath}, skipping sync`);
      }

      if (memoryData) {
        const changes = memoryData.changes as Array<Record<string, unknown>> | undefined;
        const match = changes?.find((c) => c.name === name);
        if (!match) {
          logger.warn(`Change '${name}' not found in global memory changes.json, skipping sync`);
        } else {
          // Update change status to archived
          match.status = 'archived';

          // Update finalize.archive stage
          const stage = match.stage as Record<string, unknown> | undefined;
          const finalize = stage?.finalize as Record<string, unknown> | undefined;
          const archive = finalize?.archive as Record<string, unknown> | undefined;
          if (archive) {
            archive.status = 'done';
            archive.to = new Date().toISOString();
          } else {
            logger.warn(`stage.finalize.archive is missing for change '${name}', still persisting status: archived`);
          }

          writeMemoryChangesJson(cwd, memoryData as unknown as ChangesJson);
        }
      }
    }
  } catch (err) {
    logger.error(`Failed to sync global memory changes.json: ${err instanceof Error ? err.message : String(err)}`);
  }

  process.stdout.write(`Change '${name}' archived successfully to furina/archive/${targetDirName}/\n`);
}
