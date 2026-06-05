/**
 * @fileoverview schedule command - manages the OpenPowers cron scheduler
 * @author Meiyuki <meiyukichan@163.com>
 * @copyright 2026 Meiyuki
 */

import { Command } from 'commander';
import { isPortInUse } from '../../utils/port-manager.js';
import { UI_PORT } from '../../server/service-manager.js';
import { sendApiRequest } from './request.js';

async function runScheduleRestart(): Promise<void> {
  const portInUse = await isPortInUse(UI_PORT);
  if (!portInUse) {
    process.stdout.write(
      'OpenPowers server is not running. Please run `openpowers launch` first.\n',
    );
    process.exitCode = 1;
    return;
  }

  await sendApiRequest(UI_PORT, 'POST', '/openpowers/api/schedule/restart');
  process.stdout.write('Scheduler restarted.\n');
}

async function runScheduleStop(): Promise<void> {
  const portInUse = await isPortInUse(UI_PORT);
  if (!portInUse) {
    process.stdout.write(
      'OpenPowers server is not running. Please run `openpowers launch` first.\n',
    );
    process.exitCode = 1;
    return;
  }

  await sendApiRequest(UI_PORT, 'DELETE', '/openpowers/api/schedule');
  process.stdout.write('Scheduler stopped.\n');
}

/**
 * Registers the `schedule` subcommand on the given program.
 * @param program - The commander Command instance
 */
export function registerScheduleCommand(program: Command): void {
  const scheduleCmd = program
    .command('schedule')
    .description('Manage the OpenPowers cron scheduler');

  scheduleCmd
    .command('restart')
    .description('Restart the scheduler')
    .action(async () => {
      try {
        await runScheduleRestart();
      } catch (err) {
        process.stderr.write(
          `Failed to restart scheduler: ${err instanceof Error ? err.message : String(err)}\n`,
        );
        process.exitCode = 1;
      }
    });

  scheduleCmd
    .command('stop')
    .description('Stop the scheduler')
    .action(async () => {
      try {
        await runScheduleStop();
      } catch (err) {
        process.stderr.write(
          `Failed to stop scheduler: ${err instanceof Error ? err.message : String(err)}\n`,
        );
        process.exitCode = 1;
      }
    });
}
