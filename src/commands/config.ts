/**
 * Config command module - registers config list/show/mode/set subcommands
 * @author Meiyuki <meiyukichan@163.com>
 * @copyright 2026 Meiyuki
 */

import path from 'path';
import { Command } from 'commander';
import {
  loadConfig,
  queryConfig,
  readUserConfig,
  setUserConfigValue,
  setDefaultConfigValue,
  writeUserConfig,
  type OpenPowersConfig,
  type DeepPartial,
} from '../utils/config.js';

// ---------------------------------------------------------------------------
// Mode presets — single source of truth for `config mode` values
// ---------------------------------------------------------------------------

/**
 * Built-in mode presets. Each value is a `DeepPartial<OpenPowersConfig>` covering
 * exactly the four target fields:
 *   - experimental.explore
 *   - experimental.review.openpowers
 *   - experimental.review.specs
 *   - experimental.review.code
 * `config mode <name>` applies these fields via setUserConfigValue, leaving
 * all other user keys untouched.
 */
export const MODE_PRESETS: Record<'lite' | 'standard' | 'max', DeepPartial<OpenPowersConfig>> = {
  lite: {
    experimental: {
      explore: false,
      review: { openpowers: false, specs: false, code: false },
    },
  },
  standard: {
    experimental: {
      explore: true,
      review: { openpowers: false, specs: false, code: true },
    },
  },
  max: {
    experimental: {
      explore: true,
      review: { openpowers: true, specs: true, code: true },
    },
  },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Checks whether a value is a plain object (not null, not array).
 */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Sets a nested value on a target object by walking a dot-separated key path,
 * mutating the target in place. Creates intermediate plain objects when
 * missing. This mirrors the internal logic of setUserConfigValue but avoids
 * the extra read/write cycle, allowing callers to apply multiple writes
 * atomically.
 * @param target - The object to mutate in place
 * @param keyPath - Dot-separated key path (e.g. 'experimental.review.openpowers')
 * @param value - The value to assign at the leaf
 */
function deepSetInPlace(target: Record<string, unknown>, keyPath: string, value: unknown): void {
  const parts = keyPath.split('.');
  let node: Record<string, unknown> = target;
  for (let i = 0; i < parts.length - 1; i++) {
    const key = parts[i];
    const next = node[key];
    if (!isPlainObject(next)) {
      node[key] = {};
    }
    node = node[key] as Record<string, unknown>;
  }
  node[parts[parts.length - 1]] = value;
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
 * Infers a JSON-typed value from the raw command-line argument.
 * - The literal strings "true" / "false" become JSON booleans.
 * - Strings matching the integer pattern (optional minus sign followed by
 *   a non-zero digit, or the single digit 0) become JSON numbers.
 * - Strings matching the float pattern `^-?\d+\.\d+$` become JSON numbers.
 * - All other trimmed strings are returned verbatim. This means values like
 *   "01" or "2026-06-01" are stored as JSON strings, not numbers.
 * @param raw - The raw value argument from the CLI
 * @returns The inferred JavaScript value
 */
function inferValue(raw: string): unknown {
  const trimmed = raw.trim();
  if (trimmed === 'true') return true;
  if (trimmed === 'false') return false;
  if (/^-?(?:0|[1-9]\d*)$/.test(trimmed)) return Number(trimmed);
  if (/^-?\d+\.\d+$/.test(trimmed)) return Number(trimmed);
  return trimmed;
}

// ---------------------------------------------------------------------------
// Command registration
// ---------------------------------------------------------------------------

/**
 * Registers the `config` command and its subcommands on the given program.
 * Subcommands: list, show <keys...>, mode <mode>, set <key> <value>
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
        let value: unknown;
        if (key === 'codebases') {
          // Assemble from project.codebase.path + exploration.codebase
          const projectPath = queryConfig(config, 'project.codebase.path');
          const explorationCodebase = queryConfig(config, 'exploration.codebase');
          const assembled: unknown[] = [];
          if (projectPath !== undefined) {
            assembled.push({
              path: projectPath,
              description: 'codebase dir of current project, you MUST explore it when using optix-explore skill',
            });
          }
          if (Array.isArray(explorationCodebase)) {
            assembled.push(...explorationCodebase);
          }
          value = assembled;
        } else {
          value = queryConfig(config, key);
        }
        process.stdout.write(key + '=' + formatValue(value) + '\n');
      }
    });

  configCmd
    .command('mode <mode>')
    .description('Apply a preset to experimental.* flags (lite | standard | max)')
    .action((mode: string) => {
      if (mode !== 'lite' && mode !== 'standard' && mode !== 'max') {
        configCmd.error(`invalid mode '${mode}'. Valid values: lite, standard, max`);
        return;
      }
      const cwd = process.cwd();
      const preset = MODE_PRESETS[mode];
      const review = preset.experimental?.review;
      const data = readUserConfig(cwd);
      deepSetInPlace(data, 'experimental.explore', preset.experimental?.explore);
      deepSetInPlace(data, 'experimental.review.openpowers', review?.openpowers);
      deepSetInPlace(data, 'experimental.review.specs', review?.specs);
      deepSetInPlace(data, 'experimental.review.code', review?.code);
      writeUserConfig(cwd, data);
      process.stdout.write(
        `Applied mode=${mode} (experimental.explore=${preset.experimental?.explore}, `
          + `experimental.review.openpowers=${review?.openpowers}, `
          + `experimental.review.specs=${review?.specs}, `
          + `experimental.review.code=${review?.code}) to `
          + `${path.join(cwd, '.claude', 'openpowers.json')}\n`,
      );
    });

  configCmd
    .command('set <key> <value>')
    .description('Write a single key=value entry to the user configuration (type inferred)')
    .option('-g, --global', 'Write to the global default config (resources/openpowers.json) instead of project-level')
    .action((key: string, value: string, options: { global?: boolean }) => {
      const inferred = inferValue(value);
      if (options.global) {
        setDefaultConfigValue(key, inferred);
        process.stdout.write(`${key}=${formatValue(inferred)} (global)\n`);
      } else {
        const cwd = process.cwd();
        setUserConfigValue(cwd, key, inferred);
        process.stdout.write(`${key}=${formatValue(inferred)}\n`);
      }
    });
}
