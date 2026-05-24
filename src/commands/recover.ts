/**
 * @fileoverview Recover command - restores original claude configuration
 * @author Meiyuki <meiyukichan@163.com>
 * @copyright 2026 Meiyuki
 */

import { Command } from 'commander';
import { restoreClaudeSettings } from '../server/claude-settings.js';
import { logger } from '../utils/logger.js';

/**
 * Registers the `recover` subcommand on the given program.
 * @param program - The commander Command instance
 */
export function registerRecoverCommand(program: Command): void {
  program
    .command('recover')
    .description('Restore original claude configuration')
    .action(() => {
      const restored = restoreClaudeSettings();
      if (restored) {
        logger.info('Claude configuration restored successfully');
        process.stdout.write('Claude configuration restored successfully.\n');
      } else {
        process.stdout.write('No backup found. Nothing to restore.\n');
      }
    });
}
