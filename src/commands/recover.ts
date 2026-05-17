/**
 * @fileoverview Recover command - restores original claude configuration
 * @author Meiyuki <meiyukichan@163.com>
 * @copyright 2026 Meiyuki
 */

import { Command } from 'commander';
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
      logger.info('claude configuration recovered (mock)');
      process.stdout.write('claude 配置已还原（mock）\n');
    });
}
