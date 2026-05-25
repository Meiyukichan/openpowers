/**
 * @fileoverview Init command - initializes openpowers by configuring
 * claude plugin marketplace and installing the openpowers plugin
 * @author Meiyuki <meiyukichan@163.com>
 * @copyright 2026 Meiyuki
 */

import { Command } from 'commander';
import { execSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import ora from 'ora';
import chalk from 'chalk';
import { logger } from '../utils/logger.js';
import { runUi } from './ui.js';

/**
 * Runs the five-step initialization flow for openpowers and auto-starts the UI.
 *
 * Steps:
 * 1. Check claude --version (fatal on failure)
 * 2. Uninstall old plugin (error-tolerant)
 * 3. Remove old marketplace (error-tolerant)
 * 4. Add marketplace as marketplace (fatal on failure)
 * 5. Install openpowers plugin (fatal on failure)
 * 6. Auto-start the UI server after successful plugin installation
 *
 * Each step displays an ora spinner with chalk status indicators.
 * All operations are logged via the shared logger.
 *
 * If the UI auto-start fails, the error is logged but the initialization
 * is considered successful (plugin installation is not rolled back).
 */
export async function runInit(): Promise<void> {
  // Step 1: Check claude --version
  const step1 = ora('Checking claude installation...').start();
  try {
    execSync('claude --version', { stdio: 'pipe', cwd: process.cwd() });
    step1.succeed(chalk.green('Claude is installed'));
    logger.info('Claude --version check passed');
  } catch {
    step1.fail(chalk.red('Claude is not installed. Please install claude first.'));
    logger.error('Claude --version check failed: claude is not installed');
    process.exit(1);
  }

  // Step 2: Uninstall old plugin (error-tolerant)
  const step2 = ora('Removing old openpowers plugin...').start();
  try {
    execSync('claude plugin uninstall openpowers@openpowers-plugins', {
      stdio: 'pipe',
      cwd: process.cwd(),
    });
    step2.succeed(chalk.green('Old plugin removed'));
    logger.info('Old plugin uninstalled successfully');
  } catch {
    step2.succeed(chalk.yellow('No old plugin found, skipping'));
    logger.warn('Old plugin uninstall failed (ignored): plugin may not be installed');
  }

  // Step 3: Remove old marketplace (error-tolerant)
  const step3 = ora('Removing old marketplace...').start();
  try {
    execSync('claude plugin marketplace remove openpowers-plugins', {
      stdio: 'pipe',
      cwd: process.cwd(),
    });
    step3.succeed(chalk.green('Old marketplace removed'));
    logger.info('Old marketplace removed successfully');
  } catch {
    step3.succeed(chalk.yellow('No old marketplace found, skipping'));
    logger.warn('Old marketplace remove failed (ignored): marketplace may not exist');
  }

  // Step 4: Add marketplace as marketplace
  const marketplacePath = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '../../marketplace',
  );
  const step4 = ora('Adding marketplace...').start();
  try {
    execSync(`claude plugin marketplace add ${marketplacePath}`, {
      stdio: 'pipe',
      cwd: process.cwd(),
    });
    step4.succeed(chalk.green('Marketplace added'));
    logger.info(`Marketplace added from ${marketplacePath}`);
  } catch (err) {
    step4.fail(chalk.red('Failed to add marketplace'));
    logger.error(`Marketplace add failed: ${err}`);
    process.exit(1);
  }

  // Step 5: Install openpowers plugin
  const step5 = ora('Installing openpowers plugin...').start();
  try {
    execSync('claude plugin install openpowers@openpowers-plugins', {
      stdio: 'pipe',
      cwd: process.cwd(),
    });
    step5.succeed(chalk.green('OpenPowers initialized successfully!'));
    logger.info('Plugin installed successfully');
    process.stdout.write('OpenPowers UI is starting...\n');

    // Auto-start UI after successful plugin installation
    try {
      await runUi({ restart: true });
    } catch (err) {
      logger.error(`UI auto-start failed after init: ${err instanceof Error ? err.message : String(err)}`);
      process.stdout.write(`OpenPowers UI failed to start: ${err instanceof Error ? err.message : String(err)}\n`);
    }
  } catch (err) {
    step5.fail(chalk.red('Failed to install openpowers plugin'));
    logger.error(`Plugin install failed: ${err}`);
    process.exit(1);
  }
}

/**
 * Registers the `init` subcommand on the given program.
 * @param program - The commander Command instance
 */
export function registerInitCommand(program: Command): void {
  program
    .command('init')
    .description('Initialize openpowers in the current project')
    .action(async () => {
      try {
        await runInit();
      } catch (err) {
        logger.error(`Init command failed: ${err instanceof Error ? err.message : String(err)}`);
        process.stdout.write(`Init failed: ${err instanceof Error ? err.message : String(err)}\n`);
        process.exitCode = 1;
      }
    });
}
