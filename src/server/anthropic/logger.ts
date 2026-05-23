/**
 * @fileoverview Independent proxy logger module using dedicated winston instance.
 * Provides global proxyLogger and session-scoped loggers.
 * Global logger writes to ~/.openpowers/logs/anthropic.log,
 * session loggers write to ~/.openpowers/sessions/<sessionId>/anthropic.log.
 * @author Meiyuki <meiyukichan@163.com>
 * @copyright 2026 Meiyuki
 */

import os from 'os';
import path from 'path';
import fs from 'fs';
import * as winston from 'winston';

// Proxy log directory and file under user's home directory
const PROXY_LOG_DIR = path.join(os.homedir(), '.openpowers', 'logs');
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
 * Writes to ~/.openpowers/logs/anthropic.log with the same format as the main logger.
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

// Session logger cache: sessionId -> { logger, expiresAt }
const sessionLoggerCache = new Map<string, { logger: winston.Logger; expiresAt: number }>();
const CACHE_TTL_MS = 3600000; // 1 hour

/**
 * Creates or retrieves a cached session-specific winston logger.
 * The logger writes to ~/.openpowers/sessions/<sessionId>/anthropic.log.
 * Returns a cached instance if called within 1 hour with the same sessionId.
 * Lazily cleans up expired cache entries during retrieval.
 * Falls back to a silent no-op logger on directory/file creation failure.
 *
 * @param sessionId - Unique session identifier
 * @returns A winston Logger instance
 */
export function createSessionLogger(sessionId: string): winston.Logger {
  // Lazy cleanup: remove expired entries from cache
  const now = Date.now();
  for (const [cachedId, cached] of sessionLoggerCache) {
    if (cached.expiresAt <= now) {
      sessionLoggerCache.delete(cachedId);
    }
  }

  // Return cached logger if valid
  const cached = sessionLoggerCache.get(sessionId);
  if (cached && cached.expiresAt > now) {
    return cached.logger;
  }

  try {
    const sessionLogDir = path.join(os.homedir(), '.openpowers', 'sessions', sessionId);
    const sessionLogFile = path.join(sessionLogDir, 'anthropic.log');

    if (!fs.existsSync(sessionLogDir)) {
      fs.mkdirSync(sessionLogDir, { recursive: true });
    }

    const logger = winston.createLogger({
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
        new winston.transports.File({ filename: sessionLogFile }),
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

    // Cache the logger with 1-hour expiry
    sessionLoggerCache.set(sessionId, { logger, expiresAt: now + CACHE_TTL_MS });

    return logger;
  } catch {
    return winston.createLogger({ silent: true });
  }
}
