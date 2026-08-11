/**
 * @fileoverview Remove command - uninstalls furina plugin and marketplace
 * @author Meiyuki <meiyukichan@163.com>
 * @copyright 2026 Meiyuki
 */

import { Command } from 'commander';
import { execSync } from 'child_process';
import readline from 'readline';
import ora from 'ora';
import chalk from 'chalk';
import { logger } from '../utils/logger.js';

// Plugin and marketplace identifiers (matching init.ts)
const PLUGIN_NAME = 'furina@furina-plugins';
const MARKETPLACE_NAME = 'furina-plugins';

/**
 * Options for the remove command.
 */
export interface RemoveOptions {
  /** Skip confirmation prompt */
  yes?: boolean;
}

/**
 * Runs the removal flow for furina.
 *
 * Steps:
 * 1. Prompt user for confirmation via readline (skipped if --yes flag or non-TTY)
 * 2. Uninstall Furina plugin (error-tolerant)
 * 3. Remove Furina marketplace (error-tolerant)
 * 4. Display summary
 *
 * Each step displays an ora spinner with chalk status indicators.
 * All operations are logged via the shared logger.
 */
export function runRemove(options: RemoveOptions = {}): void {
  // Step 1: Confirmation prompt (skip with --yes flag or in non-interactive mode)
  if (options.yes) {
    logger.info('--yes flag: skipping confirmation');
    performRemoval();
  } else if (process.stdin.isTTY) {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    rl.question(
      chalk.yellow('Are you sure you want to remove Furina? (y/N) '),
      (answer: string) => {
        rl.close();
        const normalized = answer.trim().toLowerCase();
        if (normalized !== 'y') {
          logger.info('User declined removal');
          process.exit(0);
        }
        performRemoval();
      },
    );
  } else {
    logger.info('Non-TTY mode: skipping confirmation');
    performRemoval();
  }
}

/**
 * Performs the actual removal steps: plugin uninstall and marketplace removal.
 * Both steps are fault-tolerant.
 */
function performRemoval(): void {
  let pluginRemoved = false;
  let marketplaceRemoved = false;

  // Step 2: Uninstall Furina plugin (error-tolerant)
  const step2 = ora('Uninstalling Furina plugin...').start();
  try {
    execSync(`claude plugin uninstall ${PLUGIN_NAME}`, {
      stdio: 'pipe',
      cwd: process.cwd(),
    });
    pluginRemoved = true;
    step2.succeed(chalk.green('Furina plugin uninstalled'));
    logger.info('Plugin uninstalled successfully');
  } catch {
    step2.succeed(chalk.yellow('Furina plugin not installed, skipping'));
    logger.warn('Plugin uninstall failed (ignored): plugin may not be installed');
  }

  // Step 3: Remove Furina marketplace (error-tolerant)
  const step3 = ora('Removing Furina marketplace...').start();
  try {
    execSync(`claude plugin marketplace remove ${MARKETPLACE_NAME}`, {
      stdio: 'pipe',
      cwd: process.cwd(),
    });
    marketplaceRemoved = true;
    step3.succeed(chalk.green('Furina marketplace removed'));
    logger.info('Marketplace removed successfully');
  } catch {
    step3.succeed(chalk.yellow('Furina marketplace not found, skipping'));
    logger.warn('Marketplace removal failed (ignored): marketplace may not exist');
  }

  // Step 4: Display summary
  const summary = buildSummary(pluginRemoved, marketplaceRemoved);
  const summarySpinner = ora(summary).start();
  summarySpinner.succeed(summary);
  logger.info(`Removal complete: ${summary}`);
}

/**
 * Builds a human-readable summary message based on removal results.
 * @param pluginRemoved - Whether the plugin was removed
 * @param marketplaceRemoved - Whether the marketplace was removed
 * @returns Summary message string
 */
function buildSummary(pluginRemoved: boolean, marketplaceRemoved: boolean): string {
  if (pluginRemoved && marketplaceRemoved) {
    return chalk.green('Furina plugin and marketplace have been removed.');
  }
  if (!pluginRemoved && !marketplaceRemoved) {
    return chalk.yellow('No Furina components were installed. Nothing to remove.');
  }
  // One removed, one skipped
  const parts: string[] = [];
  if (pluginRemoved) {
    parts.push('Furina plugin has been removed');
  } else {
    parts.push('Furina plugin was not installed');
  }
  if (marketplaceRemoved) {
    parts.push('marketplace has been removed');
  } else {
    parts.push('marketplace was not found');
  }
  return chalk.green(`${parts.join(', ')}.`);
}

/**
 * Registers the `remove` subcommand on the given program.
 * @param program - The commander Command instance
 */
export function registerRemoveCommand(program: Command): void {
  program
    .command('remove')
    .description('Uninstall furina plugin and marketplace')
    .option('-y, --yes', 'Skip confirmation prompt')
    .action((options: RemoveOptions) => {
      runRemove(options);
    });
}
