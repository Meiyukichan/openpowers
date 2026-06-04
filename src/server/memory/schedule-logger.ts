/**
 * Dedicated logger for the global memory scheduler.
 * Writes to ~/.openpowers/memory/schedule.log using append mode.
 * Format: [YYYY-MM-DDTHH:mm:ss.sssZ] <message>
 * @author Meiyuki <meiyukichan@163.com>
 * @copyright 2026 Meiyuki
 */

import fs from 'fs';
import os from 'os';
import path from 'path';

const SCHEDULE_LOG_DIR = path.join(os.homedir(), '.openpowers', 'memory');
const SCHEDULE_LOG_FILE = path.join(SCHEDULE_LOG_DIR, 'schedule.log');

/**
 * Appends a message to the schedule log file.
 * Creates the directory if it does not exist.
 * Each message is prefixed with an ISO 8601 timestamp.
 *
 * @param message - The log message to append
 */
export function appendLog(message: string): void {
  if (!fs.existsSync(SCHEDULE_LOG_DIR)) {
    fs.mkdirSync(SCHEDULE_LOG_DIR, { recursive: true });
  }
  const timestamp = new Date().toISOString();
  fs.appendFileSync(SCHEDULE_LOG_FILE, `[${timestamp}] ${message}\n`, 'utf-8');
}
