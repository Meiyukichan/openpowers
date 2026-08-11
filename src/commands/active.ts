/**
 * @fileoverview Active command - probes backend service status and self-heals if not running
 * @author Meiyuki <meiyukichan@163.com>
 * @copyright 2026 Meiyuki
 */

import { Command } from 'commander';
import { isPortInUse } from '../utils/port-manager.js';
import { startBackendService, UI_PORT } from '../server/service-manager.js';

/**
 * Probes the backend service and self-heals: starts the service if the port is free.
 */
export async function runActive(): Promise<void> {
  const portInUse = await isPortInUse(UI_PORT);
  if (portInUse) {
    process.stdout.write('Furina service is active\n');
    return;
  }

  startBackendService(UI_PORT);
  process.stderr.write('Furina service is starting, please exit the workflow and retry\n');
  process.exitCode = 1;
}

/**
 * Registers the `active` subcommand on the given program.
 * @param program - The commander Command instance
 */
export function registerActiveCommand(program: Command): void {
  program
    .command('active')
    .description('Probe the backend service status and self-heal if not running')
    .action(async () => {
      try {
        await runActive();
      } catch (err) {
        process.stderr.write(`Failed to start service: ${err instanceof Error ? err.message : String(err)}\n`);
        process.exitCode = 1;
      }
    });
}
