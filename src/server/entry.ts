/**
 * Server bootstrap entry point for background UI process.
 * Creates the Express app and listens on the configured port.
 * @author Meiyuki <meiyukichan@163.com>
 * @copyright 2026 Meiyuki
 */

import fs from 'fs';
import os from 'os';
import path from 'path';
import { createApp } from './index.js';

const ERROR_LOG_DIR = path.join(os.homedir(), '.openpowers', 'logs');
const ERROR_LOG_FILE = path.join(ERROR_LOG_DIR, 'error.log');

/**
 * Appends a message to the error log file.
 * Creates the directory if it does not exist.
 */
function writeErrorLog(message: string): void {
  if (!fs.existsSync(ERROR_LOG_DIR)) {
    fs.mkdirSync(ERROR_LOG_DIR, { recursive: true });
  }
  const timestamp = new Date().toISOString();
  fs.appendFileSync(ERROR_LOG_FILE, `[${timestamp}] ${message}\n`, 'utf-8');
}

const port = process.env.OPENPOWERS_UI_PORT ? parseInt(process.env.OPENPOWERS_UI_PORT, 10) : 3939;

const app = createApp();

const server = app.listen(port, () => {
  // Server started
});

server.on('error', (err: NodeJS.ErrnoException) => {
  writeErrorLog(`Server error: ${err.message}`);
});

// Prevent process exit on unhandled errors — keep the server alive
process.on('uncaughtException', (err) => {
  writeErrorLog(`Uncaught exception: ${err.message}\n${err.stack || ''}`);
});

process.on('unhandledRejection', (reason) => {
  writeErrorLog(`Unhandled rejection: ${reason instanceof Error ? reason.message : String(reason)}`);
});
