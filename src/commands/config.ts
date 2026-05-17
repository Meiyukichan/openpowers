/**
 * Config command module - registers config list and show subcommands
 * @author Meiyuki <meiyukichan@163.com>
 * @copyright 2026 Meiyuki
 */

import { Command } from 'commander';
import { loadConfig, queryConfig } from '../utils/config.js';

/**
 * Checks whether a value is a plain object (not null, not array).
 */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Formats a config value for output. Plain objects and null/undefined
 * print as None; arrays and primitives print their value.
 */
function formatValue(value: unknown): string {
  if (value === undefined || value === null) {
    return 'None';
  }
  if (isPlainObject(value) || Array.isArray(value)) {
    return JSON.stringify(value);
  }
  return String(value);
}

/**
 * Registers the `config` command and its subcommands on the given program.
 * Subcommands: list, show <keys...>
 * @param program - The commander Command instance
 */
export function registerConfigCommand(program: Command): void {
  const configCmd = program
    .command('config')
    .description('Manage OpenPowers configuration');

  configCmd
    .command('list')
    .description('List full merged configuration as formatted JSON')
    .action(() => {
      const config = loadConfig();
      process.stdout.write(JSON.stringify(config, null, 2) + '\n');
    });

  configCmd
    .command('show <keys...>')
    .description('Show specific configuration values by dot-path keys')
    .action((keys: string[]) => {
      const config = loadConfig();
      for (const key of keys) {
        const value = queryConfig(config, key);
        process.stdout.write(key + '=' + formatValue(value) + '\n');
      }
    });
}
