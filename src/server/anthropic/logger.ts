/**
 * @fileoverview Independent proxy logger module using dedicated winston instance.
 * Writes to ~/.openpowers/logs/proxy/anthropic.log, completely isolated from main openpowers.log.
 * @author Meiyuki <meiyukichan@163.com>
 * @copyright 2026 Meiyuki
 */

import os from 'os';
import path from 'path';
import fs from 'fs';
import * as winston from 'winston';

// Proxy log directory and file under user's home directory
const PROXY_LOG_DIR = path.join(os.homedir(), '.openpowers', 'logs', 'proxy');
const PROXY_LOG_FILE = path.join(PROXY_LOG_DIR, 'anthropic.log');

/**
 * Ensures the proxy log directory exists, creating it if necessary.
 * Throws if directory creation fails (handled by caller).
 */
function ensureProxyLogDir(): void {
  if (!fs.existsSync(PROXY_LOG_DIR)) {
    fs.mkdirSync(PROXY_LOG_DIR, { recursive: true });
  }
}

/**
 * Creates and returns an independent winston logger instance for the Anthropic proxy.
 * Writes to ~/.openpowers/logs/proxy/anthropic.log with the same format as the main logger.
 * If the log directory cannot be written to, returns a silent no-op logger.
 */
function createProxyLogger(): winston.Logger {
  try {
    ensureProxyLogDir();
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
        new winston.transports.File({ filename: PROXY_LOG_FILE }),
        new winston.transports.Console({
          format: winston.format.combine(
            winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss,SSS' }),
            winston.format.printf((info) => {
              const level = String(info.level).padStart(7).slice(0, 7);
              return `${info.timestamp} ${level} ${info.message}`;
            }),
          ),
        }),
      ],
    });
  } catch {
    // Permission error or other failure; use silent logger
    return winston.createLogger({ silent: true });
  }
}

export const proxyLogger = createProxyLogger();
