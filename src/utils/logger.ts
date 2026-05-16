/**
 * @fileoverview Shared logger utility using winston file transport
 * Writes to openpowers.log for current day; rotates to openpowers-YYYY-MM-DD.log on next-day startup.
 * @author Meiyuki <meiyukichan@163.com>
 * @copyright 2026 Meiyuki
 */

import os from 'os';
import path from 'path';
import fs from 'fs';
import * as winston from 'winston';

// Log directory and active log file under user's home directory
const LOG_DIR = path.join(os.homedir(), '.openpowers', 'logs');
const LOG_FILE = path.join(LOG_DIR, 'openpowers.log');

/**
 * Ensures the log directory exists, creating it if necessary.
 * Throws if directory creation fails (handled by caller).
 */
function ensureLogDir(): void {
  if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
  }
}

/**
 * Formats a Date as YYYY-MM-DD string.
 */
function formatDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Rotates the active log file if it belongs to a previous day.
 * Renames openpowers.log to openpowers-YYYY-MM-DD.log (using the file's last-modified date).
 */
function rotateLogIfNeeded(): void {
  if (!fs.existsSync(LOG_FILE)) {
    return;
  }
  const stat = fs.statSync(LOG_FILE);
  const mtimeDate = formatDate(stat.mtime);
  const todayDate = formatDate(new Date());
  if (mtimeDate !== todayDate) {
    const archiveFile = path.join(LOG_DIR, `openpowers-${mtimeDate}.log`);
    // Avoid overwriting an existing archive
    if (!fs.existsSync(archiveFile)) {
      fs.renameSync(LOG_FILE, archiveFile);
    }
  }
}

/**
 * Creates and returns a winston logger instance.
 * Active log is written to openpowers.log; previous-day logs are rotated on startup.
 * If the log directory cannot be written to, returns a silent no-op logger.
 */
function createWinstonLogger(): winston.Logger {
  try {
    ensureLogDir();
    rotateLogIfNeeded();
    return winston.createLogger({
      exitOnError: false,
      level: 'info',
      format: winston.format.combine(
        winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss,SSS' }),
        winston.format.printf((info) => {
          const level = String(info.level).padStart(7).slice(0, 7);
          return `${info.timestamp} ${level} ${info.message}`;
        }),
      ),
      transports: [
        new winston.transports.File({ filename: LOG_FILE }),
      ],
    });
  } catch {
    // Permission error or other failure; use silent logger
    return winston.createLogger({ silent: true });
  }
}

export const logger = createWinstonLogger();
