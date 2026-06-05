/**
 * Shared config utility: deep merge, load merged config, query nested values.
 * Uses Zod for schema definition, type inference, and runtime validation.
 * @author Meiyuki <meiyukichan@163.com>
 * @copyright 2026 Meiyuki
 */

import fs from 'fs';
import path from 'path';
import url from 'url';
import { z } from 'zod';
import { logger } from './logger.js';

// ---------------------------------------------------------------------------
// Zod schemas — single source of truth for config structure, types, and validation
// ---------------------------------------------------------------------------

const ProviderSwitchSchema = z.object({
  workflow: z.string(),
  explore: z.string(),
  propose: z.string(),
  plan: z.string(),
  review: z.string(),
  coding: z.string(),
  finalize: z.string(),
});

const CodebasesSchema = z.object({
  enable: z.boolean(),
  path: z.string(),
});

const RepositoryRefSchema = z.object({
  path: z.string().optional(),
  type: z.string().optional(),
  description: z.string().optional(),
});

const ProjectSchema = z.object({
  sourcecode: z.string(),
  codebases: CodebasesSchema,
  repositories: z.array(RepositoryRefSchema),
  references: z.array(RepositoryRefSchema),
});

const ReviewSchema = z.object({
  propose: z.boolean(),
  plan: z.boolean(),
  specs: z.boolean(),
  code: z.boolean(),
  acceptance: z.boolean(),
  openpowers: z.boolean(),
});

const PromptSchema = z.object({
  reviewCode: z.string().nullable(),
});

const ExperimentalSchema = z.object({
  explore: z.boolean(),
  websearch: z.boolean(),
  context7: z.boolean(),
  review: ReviewSchema,
  prompt: PromptSchema,
  coverage: z.string(),
  budget: z.boolean(),
  factor: z.number(),
});

const EnhancementRulesSchema = z.object({
  design: z.array(z.unknown()),
  specs: z.array(z.unknown()),
  implement: z.array(z.unknown()),
});

const EnhancementSchema = z.object({
  context: z.nullable(z.unknown()),
  rules: EnhancementRulesSchema,
});

/**
 * Zod schema for the OpenPowers configuration. Known top-level fields are
 * validated; extra fields from project override configs pass through.
 */
export const OpenPowersConfigSchema = z.object({
  language: z.string(),
  switchProviders: ProviderSwitchSchema,
  project: ProjectSchema,
  experimental: ExperimentalSchema,
  enhancement: EnhancementSchema.optional(),
}).loose();

/** Inferred TypeScript type for the validated config. */
export type OpenPowersConfig = z.infer<typeof OpenPowersConfigSchema>;

/**
 * Recursively makes all properties optional, including nested objects.
 * Arrays remain arrays of the original element type (not deep partial).
 * @author Meiyuki
 */
export type DeepPartial<T> = T extends ReadonlyArray<unknown>
  ? T
  : T extends object
  ? { [P in keyof T]?: DeepPartial<T[P]> }
  : T;

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
      (base as Record<string, unknown>)[key] = overrideVal;
    }
  }
  return base;
}

/**
 * Loads the merged configuration by reading the default config from
 * resources/openpowers.json and merging with the project override from
 * {cwd}/.claude/openpowers.json. Silently skips missing override files;
 * logs a warning and falls back to defaults on invalid JSON.
 *
 * Every call re-reads both JSON files from disk — no caching, no memoization.
 * This guarantees the returned config always reflects the current file state.
 *
 * Validates the merged result against the Zod schema. When a known field
 * fails validation, a logger.warn is emitted and the offending leaf is
 * stripped from the returned config so that subsequent queryConfig lookups
 * return undefined (rendered as `None` by formatValue). Unknown fields
 * from overrides and valid known fields pass through untouched.
 *
 * @param cwd - Working directory for resolving the override config path
 *   (defaults to process.cwd())
 * @returns The merged configuration object (validated but always returned)
 */
export function loadConfig(cwd?: string): OpenPowersConfig {
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

  // Validate known fields with Zod (resilient — always returns config)
  const parsed = OpenPowersConfigSchema.safeParse(config);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      logger.warn(`Config validation: ${issue.path.join('.')} — ${issue.message}`);
      // Strip the invalid leaf so `config show <key>` degrades gracefully to
      // `None` via formatValue's undefined branch. Unknown fields and valid
      // known fields still pass through; only fields explicitly rejected by
      // the schema are removed.
      deleteByPath(config, issue.path as (string | number)[]);
    }
    return config as OpenPowersConfig;
  }

  return parsed.data;
}

/**
 * Deletes a nested leaf from an object by walking a (string | number) path.
 * No-ops when any segment along the path is missing or not traversable.
 * Used by loadConfig to strip schema-invalid fields so queryConfig returns
 * undefined for them.
 * @param target - The object to mutate
 * @param keyPath - Array of keys describing the path to the leaf
 */
function deleteByPath(target: Record<string, unknown>, keyPath: (string | number)[]): void {
  if (keyPath.length === 0) {
    return;
  }
  let node: Record<string, unknown> = target;
  for (let i = 0; i < keyPath.length - 1; i++) {
    const segment = keyPath[i];
    const next = node[segment as string];
    if (!isPlainObject(next)) {
      return;
    }
    node = next;
  }
  delete node[keyPath[keyPath.length - 1] as string];
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

/**
 * Resolves the user override config file path under a workspace directory.
 * @param cwd - The workspace directory
 * @returns Absolute path to {cwd}/.claude/openpowers.json
 */
function getUserConfigPath(cwd: string): string {
  return path.join(cwd, '.claude', 'openpowers.json');
}

/**
 * Reads and parses the user override config file at {cwd}/.claude/openpowers.json.
 * Never throws — returns an empty object for any failure (missing file,
 * permission denied, invalid JSON, or any other I/O error). Callers can
 * rely on this function to always succeed.
 * @param cwd - The workspace directory
 * @returns The parsed JSON object, or {} on any failure
 */
export function readUserConfig(cwd: string): Record<string, unknown> {
  const filePath = getUserConfigPath(cwd);
  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    const parsed = JSON.parse(raw) as unknown;
    if (isPlainObject(parsed)) {
      return parsed;
    }
    return {};
  } catch {
    return {};
  }
}

/**
 * Writes the given data to the user override config file at
 * {cwd}/.claude/openpowers.json. Creates the parent .claude directory
 * recursively when missing. Serializes JSON with 2-space indentation
 * and a single trailing newline, encoded as UTF-8.
 * @param cwd - The workspace directory
 * @param data - The configuration object to persist
 */
export function writeUserConfig(cwd: string, data: Record<string, unknown>): void {
  const filePath = getUserConfigPath(cwd);
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
  const body = `${JSON.stringify(data, null, 2)}\n`;
  fs.writeFileSync(filePath, body, 'utf-8');
}

/**
 * Sets a nested value in the user override config file using a
 * dot-separated key path, creating intermediate plain objects as needed.
 * Loads the existing override via readUserConfig, mutates the in-memory
 * tree, then persists it via writeUserConfig. Unrelated top-level keys
 * are preserved. Returns the final value written at the key path.
 * @param cwd - The workspace directory
 * @param keyPath - Dot-separated key path (e.g. 'experimental.review.openpowers')
 * @param value - The value to write at the key path
 * @returns The value written at the leaf
 */
export function setUserConfigValue(cwd: string, keyPath: string, value: unknown): unknown {
  const data = readUserConfig(cwd);
  const parts = keyPath.split('.');
  let node: Record<string, unknown> = data;
  for (let i = 0; i < parts.length - 1; i++) {
    const key = parts[i];
    const next = node[key];
    if (!isPlainObject(next)) {
      node[key] = {};
    }
    node = node[key] as Record<string, unknown>;
  }
  node[parts[parts.length - 1]] = value;
  writeUserConfig(cwd, data);
  return value;
}

/**
 * Sets a nested value in the global default config file
 * (resources/openpowers.json). Reads the current file, mutates the
 * in-memory tree, and writes back with 2-space indentation + trailing
 * newline. Creates intermediate plain objects as needed. Unrelated
 * keys are preserved. Returns the final value written at the key path.
 *
 * @param keyPath - Dot-separated key path (e.g. 'enhancement.memory.schedule')
 * @param value - The value to write at the key path
 * @returns The value written at the leaf
 */
export function setDefaultConfigValue(keyPath: string, value: unknown): unknown {
  const moduleDirname = path.dirname(url.fileURLToPath(import.meta.url));
  const configPath = path.join(moduleDirname, '..', '..', 'resources', 'openpowers.json');
  const raw = fs.readFileSync(configPath, 'utf-8');
  const data = JSON.parse(raw) as Record<string, unknown>;
  const parts = keyPath.split('.');
  let node: Record<string, unknown> = data;
  for (let i = 0; i < parts.length - 1; i++) {
    const key = parts[i];
    const next = node[key];
    if (!isPlainObject(next)) {
      node[key] = {};
    }
    node = node[key] as Record<string, unknown>;
  }
  node[parts[parts.length - 1]] = value;
  const body = `${JSON.stringify(data, null, 2)}\n`;
  fs.writeFileSync(configPath, body, 'utf-8');
  return value;
}
