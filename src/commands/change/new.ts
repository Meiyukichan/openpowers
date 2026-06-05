/**
 * New subcommand for the change command
 * Creates a new change directory and registers it in changes.json
 * @author Meiyuki <meiyukichan@163.com>
 * @copyright 2026 Meiyuki
 */

import fs from 'fs';
import path from 'path';
import { logger } from '../../utils/logger.js';
import {
  CHANGES_DIR,
  CHANGES_JSON_PATH,
  toRelativePath,
  validateChangeName,
  loadOrCreateChangesJson,
} from './shared.js';

/**
 * Creates a new change: validates name, creates directory, and updates changes.json.
 * @param name - The change name (must be kebab-case)
 * @param options - Options containing the --desc flag with description text
 */
export function runChangeNew(name: string, options: { desc: string }): void {
  // Validate name format
  const validation = validateChangeName(name);
  if (!validation.valid) {
    process.stderr.write(`${validation.error}\n`);
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
    description: options.desc ?? name,
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
