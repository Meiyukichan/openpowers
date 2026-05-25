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

/**
 * Runs the five-step initialization flow for openpowers.
 *
 * Steps:
 * 1. Check claude --version (fatal on failure)
 * 2. Uninstall old plugin (error-tolerant)
 * 3. Remove old marketplace (error-tolerant)
 * 4. Add marketplace as marketplace (fatal on failure)
 * 5. Install openpowers plugin (fatal on failure)
 *
 * Each step displays an ora spinner with chalk status indicators.
 * All operations are logged via the shared logger.
 */
export function runInit(): void {
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
    process.stdout.write('Next steps: Open Claude Code and run /openpowers:workflow to start\n');
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
    .action(() => {
      runInit();
    });
}
