/**
 * @fileoverview Launch command - starts the Express backend server without opening browser
 * @author Meiyuki <meiyukichan@163.com>
 * @copyright 2026 Meiyuki
 */

import { Command } from 'commander';
import { isPortInUse } from '../utils/port-manager.js';
import { startBackendService, UI_PORT } from '../server/service-manager.js';

/**
 * Launches the backend service if the port is free.
 * Outputs a message if the service is already running.
 */
export async function runLaunch(): Promise<void> {
  const port = UI_PORT;

  const portInUse = await isPortInUse(port);
  if (portInUse) {
    process.stdout.write('OpenPowers server is already running\n');
    return;
  }

  startBackendService(port);
}

/**
 * Registers the `launch` subcommand on the given program.
 * @param program - The commander Command instance
 */
export function registerLaunchCommand(program: Command): void {
  program
    .command('launch')
    .description('Start the OpenPowers backend server')
    .action(async () => {
      try {
        await runLaunch();
      } catch (err) {
        process.stderr.write(`Failed to start service: ${err instanceof Error ? err.message : String(err)}\n`);
        process.exitCode = 1;
      }
    });
}
