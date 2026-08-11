/**
 * @fileoverview UI command - starts the Express server and opens the browser
 * @author Meiyuki <meiyukichan@163.com>
 * @copyright 2026 Meiyuki
 */

import { Command } from 'commander';
import os from 'os';
import { execSync } from 'child_process';
import { isPortInUse, gracefulShutdown } from '../utils/port-manager.js';
import { logger } from '../utils/logger.js';
import { startBackendService, UI_PORT } from '../server/service-manager.js';

/**
 * Opens the given URL in the default browser using platform-specific commands.
 * On Windows uses `start`, on macOS uses `open`, on Linux uses `xdg-open`.
 * @param url - The URL to open in the browser
 */
function openBrowser(url: string): void {
  const platform = os.platform();
  try {
    if (platform === 'win32') {
      execSync(`start "" "${url}"`, { stdio: 'ignore', cwd: process.cwd() });
    } else if (platform === 'darwin') {
      execSync(`open "${url}"`, { stdio: 'ignore', cwd: process.cwd() });
    } else {
      execSync(`xdg-open "${url}"`, { stdio: 'ignore', cwd: process.cwd() });
    }
    logger.info(`Browser opened at ${url}`);
  } catch (err) {
    logger.warn(`Failed to open browser: ${err instanceof Error ? err.message : String(err)}`);
  }
}

export async function runUi(options: { restart?: boolean }): Promise<void> {
  const port = UI_PORT;

  // Handle --restart: gracefully shut down the existing service, then spawn a new one
  if (options.restart) {
    logger.info('Restart requested, shutting down existing service gracefully');
    await gracefulShutdown(port);
    logger.info('Graceful shutdown complete, starting new service');
    const restartUrl = startBackendService(port);
    openBrowser(restartUrl);
    return;
  }

  // Check if port is already occupied (assumed to be our server if --restart not set)
  const portInUse = await isPortInUse(port);
  if (portInUse) {
    logger.info('UI server already running, opening browser');
    const url = `http://localhost:${port}/furina/ui`;
    openBrowser(url);
    process.stdout.write(`UI server is already running at ${url}\n`);
    return;
  }

  const uiUrl = startBackendService(port);
  openBrowser(uiUrl);
}

/**
 * Registers the `ui` subcommand on the given program.
 * @param program - The commander Command instance
 */
export function registerUiCommand(program: Command): void {
  program
    .command('ui')
    .description('Start the furina UI server and open in browser')
    .option('--restart', 'Force restart the UI server, killing any existing process on port 3939')
    .action(async (options: { restart?: boolean }) => {
      try {
        await runUi(options);
      } catch (err) {
        logger.error(`UI command failed: ${err instanceof Error ? err.message : String(err)}`);
        process.stdout.write(`Failed to start UI: ${err instanceof Error ? err.message : String(err)}\n`);
        process.exitCode = 1;
      }
    });
}
