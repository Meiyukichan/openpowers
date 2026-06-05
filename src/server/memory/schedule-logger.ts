/**
 * Dedicated logger for the memory module.
 * Writes to ~/.openpowers/memory/dreamwork.log using append mode.
 * Format: [YYYY-MM-DDTHH:mm:ss.sssZ] <message>
 * @author Meiyuki <meiyukichan@163.com>
 * @copyright 2026 Meiyuki
 */

import fs from 'fs';
import os from 'os';
import path from 'path';

const DREAMWORK_LOG_DIR = path.join(os.homedir(), '.openpowers', 'memory');
const DREAMWORK_LOG_FILE = path.join(DREAMWORK_LOG_DIR, 'dreamwork.log');

/**
 * Appends a message to the dreamwork log file.
 * Creates the directory if it does not exist.
 * Each message is prefixed with an ISO 8601 timestamp.
 *
 * @param message - The log message to append
 */
export function appendLog(message: string): void {
  if (!fs.existsSync(DREAMWORK_LOG_DIR)) {
    fs.mkdirSync(DREAMWORK_LOG_DIR, { recursive: true });
  }
  const timestamp = new Date().toISOString();
  fs.appendFileSync(DREAMWORK_LOG_FILE, `[${timestamp}] ${message}\n`, 'utf-8');
}
