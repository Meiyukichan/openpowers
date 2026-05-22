/**
 * @fileoverview Enable command - enables the OpenPowers proxy
 * by calling setEnableOpenpowersProxy(true)
 * @author Meiyuki <meiyukichan@163.com>
 * @copyright 2026 Meiyuki
 */

import { Command } from 'commander';
import { setEnableOpenpowersProxy } from '../server/providers-store.js';
import { logger } from '../utils/logger.js';

/**
 * Enables the OpenPowers proxy and outputs a success message.
 * On failure, logs the error and exits with code 1.
 */
export function runEnable(): void {
  try {
    setEnableOpenpowersProxy(true);
    process.stdout.write('OpenPowers proxy enabled\n');
  } catch (err) {
    process.stderr.write(`Failed to enable proxy: ${err}\n`);
    logger.error(`Failed to enable proxy: ${err}`);
    process.exit(1);
  }
}

/**
 * Registers the `enable` top-level command on the given program.
 * @param program - The commander Command instance
 */
export function registerEnableCommand(program: Command): void {
  program
    .command('enable')
    .description('Enable the OpenPowers proxy')
    .action(() => {
      runEnable();
    });
}
