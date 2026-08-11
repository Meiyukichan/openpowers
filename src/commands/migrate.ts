/**
 * @fileoverview Migrate command - one-time data migration from old brand paths
 * (~/.openpowers/, openpowers/) to new brand paths (~/.furina/, furina/).
 * @author Meiyuki <meiyukichan@163.com>
 * @copyright 2026 Meiyuki
 */

import { Command } from 'commander';
import { logger } from '../utils/logger.js';
import { runMigration, runAutoMigrationIfNeeded } from '../utils/migrate.js';

/**
 * Runs the one-time data migration and prints a summary (source, target, status)
 * to stdout. Safe to run repeatedly: existing targets are skipped.
 * @param cwd - Project root whose openpowers/ should be migrated
 */
export function runMigrateCommand(cwd: string = process.cwd()): void {
  const summary = runMigration(cwd);
  if (!summary.needsMigration) {
    process.stdout.write('No old-brand data found. Nothing to migrate.\n');
    return;
  }

  process.stdout.write('Data migration completed.\n');
  if (summary.user.length > 0) {
    process.stdout.write('User data:\n');
    for (const item of summary.user) {
      process.stdout.write(`  ${item.source} -> ${item.target}: ${item.status}\n`);
    }
  }
  if (summary.project.length > 0) {
    process.stdout.write('Project data:\n');
    for (const item of summary.project) {
      process.stdout.write(`  ${item.source} -> ${item.target}: ${item.status}\n`);
    }
  }
  process.stdout.write(
    `Verification: ${summary.verifiedTargets.length} target(s) verified, ${summary.verificationFailures.length} failure(s).\n`,
  );
  logger.info('Migrate command finished');
}

/**
 * Registers the `migrate` subcommand on the given program.
 * @param program - The commander Command instance
 */
export function registerMigrateCommand(program: Command): void {
  program
    .command('migrate')
    .description('One-time migration of data from old brand paths to new brand paths')
    .action(() => {
      try {
        runMigrateCommand();
      } catch (err) {
        logger.error(`Migrate command failed: ${err instanceof Error ? err.message : String(err)}`);
        process.stdout.write(`Migrate failed: ${err instanceof Error ? err.message : String(err)}\n`);
        process.exitCode = 1;
      }
    });
}

/**
 * Registers a commander preAction hook that runs the one-time data migration
 * automatically on first startup: when the old user directory exists and the
 * new directory has no migrated data yet. The `migrate` command itself is
 * skipped so it can always run explicitly.
 * @param program - The commander Command instance
 */
export function registerAutoMigrationHook(program: Command): void {
  program.hook('preAction', (_thisCommand: Command, actionCommand: Command) => {
    if (actionCommand.name() === 'migrate') {
      return;
    }
    runAutoMigrationIfNeeded();
  });
}
