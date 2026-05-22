/**
 * @fileoverview Disable command - disables the OpenPowers proxy
 * by calling setEnableOpenpowersProxy(false)
 * @author Meiyuki <meiyukichan@163.com>
 * @copyright 2026 Meiyuki
 */

import { Command } from 'commander';
import { setEnableOpenpowersProxy } from '../server/providers-store.js';
import { logger } from '../utils/logger.js';

/**
 * Disables the OpenPowers proxy and outputs a success message.
 * On failure, logs the error and exits with code 1.
 */
export function runDisable(): void {
  try {
    setEnableOpenpowersProxy(false);
    process.stdout.write('OpenPowers proxy disabled\n');
  } catch (err) {
    process.stderr.write(`Failed to disable proxy: ${err}\n`);
    logger.error(`Failed to disable proxy: ${err}`);
    process.exit(1);
  }
}

/**
 * Registers the `disable` top-level command on the given program.
 * @param program - The commander Command instance
 */
export function registerDisableCommand(program: Command): void {
  program
    .command('disable')
    .description('Disable the OpenPowers proxy')
    .action(() => {
      runDisable();
    });
}
