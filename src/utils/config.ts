/**
 * Shared config utility: deep merge, load merged config, query nested values
 * @author Meiyuki <meiyukichan@163.com>
 * @copyright 2026 Meiyuki
 */

import fs from 'fs';
import path from 'path';
import url from 'url';
import { logger } from './logger.js';

/**
 * Checks whether a value is a plain object (not null, not array).
 */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Recursively merges override into base. Nested plain objects are merged,
 * arrays are extended (concatenated), and type mismatches or non-objects
 * are replaced. Mutates the base object in place and returns it.
 * @param base - The base configuration object (mutated in place)
 * @param override - The override configuration to merge in
 * @returns The merged base object
 */
export function deepMerge<T extends Record<string, unknown>>(
  base: T,
  override: Record<string, unknown>,
): T {
  for (const key of Object.keys(override)) {
    const overrideVal = override[key];
    const baseVal = base[key];

    if (key in base && isPlainObject(baseVal) && isPlainObject(overrideVal)) {
      deepMerge(baseVal, overrideVal);
    } else if (key in base && Array.isArray(baseVal) && Array.isArray(overrideVal)) {
      (baseVal as unknown[]).push(...(overrideVal as unknown[]));
    } else {
      base[key] = overrideVal;
    }
  }
  return base;
}

/**
 * Loads the merged configuration by reading the default config from
 * resources/openpowers.json and merging with the project override from
 * {cwd}/.claude/openpowers.json. Silently skips missing override files;
 * logs a warning and falls back to defaults on invalid JSON.
 * @param cwd - Working directory for resolving the override config path
 *   (defaults to process.cwd())
 * @returns The merged configuration object
 */
export function loadConfig(cwd?: string): Record<string, unknown> {
  const moduleDirname = path.dirname(url.fileURLToPath(import.meta.url));
  const defaultConfigPath = path.join(moduleDirname, '..', '..', 'resources', 'openpowers.json');
  const workspace = cwd ?? process.cwd();
  const overrideConfigPath = path.join(workspace, '.claude', 'openpowers.json');

  const config: Record<string, unknown> = {};

  // Load default config (required)
  const defaultRaw = fs.readFileSync(defaultConfigPath, 'utf-8');
  deepMerge(config, JSON.parse(defaultRaw));

  // Load override config (optional)
  if (fs.existsSync(overrideConfigPath)) {
    try {
      const overrideRaw = fs.readFileSync(overrideConfigPath, 'utf-8');
      deepMerge(config, JSON.parse(overrideRaw));
    } catch (err) {
      if (err instanceof SyntaxError) {
        logger.warn('Failed to parse override config: invalid JSON, falling back to defaults');
      } else {
        throw err;
      }
    }
  }

  return config;
}

/**
 * Queries a nested value from a config object using a dot-separated key path.
 * Returns undefined if any segment in the path does not exist or is not traversable.
 * @param config - The configuration object to query
 * @param keyPath - Dot-separated key path (e.g. 'project.sourcecode')
 * @returns The value at the path, or undefined if not found
 */
export function queryConfig(config: Record<string, unknown>, keyPath: string): unknown {
  const parts = keyPath.split('.');
  let node: unknown = config;
  for (const part of parts) {
    if (node === null || node === undefined) {
      return undefined;
    }
    if (typeof node !== 'object' || Array.isArray(node)) {
      return undefined;
    }
    node = (node as Record<string, unknown>)[part];
  }
  return node;
}
