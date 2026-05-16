/**
 * @fileoverview Shared logger utility using winston file transport
 * @author Meiyuki <meiyukichan@163.com>
 * @copyright 2026 Meiyuki
 */

import os from 'os';
import path from 'path';
import fs from 'fs';
import * as winston from 'winston';

// Log directory and file paths under user's home directory
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
 * Creates and returns a winston logger instance.
 * If the log directory cannot be written to, returns a silent no-op logger.
 */
function createWinstonLogger(): winston.Logger {
  try {
    ensureLogDir();
    return winston.createLogger({
      level: 'info',
      format: winston.format.json(),
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
