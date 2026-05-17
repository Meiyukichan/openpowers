/**
 * @fileoverview UI command - opens the openpowers user interface
 * @author Meiyuki <meiyukichan@163.com>
 * @copyright 2026 Meiyuki
 */

import { Command } from 'commander';
import { logger } from '../utils/logger.js';

/**
 * Registers the `ui` subcommand on the given program.
 * @param program - The commander Command instance
 */
export function registerUiCommand(program: Command): void {
  program
    .command('ui')
    .description('Open the openpowers user interface')
    .action(() => {
      logger.info('openpowers UI launched (mock)');
      process.stdout.write('正在打开 openpowers UI...（mock）\n');
    });
}
