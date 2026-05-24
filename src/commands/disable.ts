/**
 * @fileoverview Disable command - disables the OpenPowers proxy
 * by calling setEnableOpenpowersProxy(false)
 * @author Meiyuki <meiyukichan@163.com>
 * @copyright 2026 Meiyuki
 */

import { Command } from 'commander';
import {
  setEnableOpenpowersProxy,
  getActiveProviderId,
  getProviderById,
} from '../server/providers-store.js';
import {
  getProviderEnv,
  writeEnvToClaudeSettings,
  restoreClaudeSettings,
} from '../server/claude-settings.js';
import { logger } from '../utils/logger.js';

/**
 * Disables the OpenPowers proxy and outputs a success message.
 * On failure, logs the error and exits with code 1.
 */
export function runDisable(): void {
  try {
    setEnableOpenpowersProxy(false);

    // Sync Claude settings based on active provider existence
    try {
      const activeId = getActiveProviderId();
      if (activeId) {
        const provider = getProviderById(activeId);
        if (provider) {
          writeEnvToClaudeSettings(getProviderEnv(provider));
        }
      } else {
        restoreClaudeSettings();
      }
    } catch (err) {
      logger.error(`Failed to sync Claude settings: ${err instanceof Error ? err.message : String(err)}`);
    }

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
