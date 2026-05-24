/**
 * Backend service lifecycle management - spawn and track the Express UI/proxy server.
 * @author Meiyuki <meiyukichan@163.com>
 * @copyright 2026 Meiyuki
 */

import path from 'path';
import fs from 'fs';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { logger } from '../utils/logger.js';

/** Default port for the backend server. */
export const UI_PORT = 3939;

// Resolve server entry point relative to this module (src/server/ → dist/server/)
const moduleDirname = path.dirname(fileURLToPath(import.meta.url));
const serverEntryPath = path.join(moduleDirname, '..', '..', 'dist', 'server', 'entry.js');

/**
 * Spawns the backend server in a detached background child process.
 * @param port - Port number for the server to listen on
 */
function spawnServer(port: number): void {
  const child = spawn(process.execPath, [serverEntryPath], {
    detached: true,
    stdio: ['ignore', 'inherit', 'inherit'],
    env: { ...process.env, OPENPOWERS_UI_PORT: String(port) },
    windowsHide: true,
  });
  child.unref();
}

/**
 * Starts the backend service by spawning a detached child process and returns the UI URL.
 * Does not open the browser - the caller is responsible for that.
 * @param port - Port number for the server to listen on
 * @returns The UI URL string
 */
export function startBackendService(port: number): string {
  const clientDir = path.join(moduleDirname, '..', '..', 'dist', 'client');
  if (!fs.existsSync(clientDir)) {
    process.stdout.write('UI has not been built yet. Please run the build command first to generate the frontend assets.\n');
  }

  spawnServer(port);
  logger.info(`UI server spawned on port ${port}`);
  const uiUrl = `http://localhost:${port}/openpowers/ui`;
  process.stdout.write(`UI server started at ${uiUrl}\n`);
  return uiUrl;
}
