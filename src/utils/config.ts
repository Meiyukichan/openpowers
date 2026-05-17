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
  explore: z.string(),
  plan: z.string(),
  review: z.string(),
  coding: z.string(),
  finalize: z.string(),
});

const ProvidersSchema = z.object({
  enable: z.boolean(),
  default: z.string(),
  switch: ProviderSwitchSchema,
});

const RepositoryRefSchema = z.object({
  path: z.string().optional(),
  type: z.string().optional(),
  description: z.string().optional(),
});

const ProjectSchema = z.object({
  sourcecode: z.string(),
  codebases: z.string(),
  repositories: z.array(RepositoryRefSchema),
  references: z.array(RepositoryRefSchema),
});

const ReviewSchema = z.object({
  propose: z.boolean(),
  plan: z.boolean(),
  specs: z.boolean(),
  code: z.boolean(),
  acceptance: z.boolean(),
});

const PromptSchema = z.object({
  'review-code': z.string().nullable(),
});

const ExperimentalSchema = z.object({
  codebases: z.boolean(),
  websearch: z.boolean(),
  context7: z.boolean(),
  review: ReviewSchema,
  prompt: PromptSchema,
  coverage: z.string(),
  'save-token': z.boolean(),
  'plan-factor': z.number(),
  budget: z.boolean().optional(),
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
  providers: ProvidersSchema,
  project: ProjectSchema,
  experimental: ExperimentalSchema,
  enhancement: EnhancementSchema.optional(),
}).loose();

/** Inferred TypeScript type for the validated config. */
export type OpenPowersConfig = z.infer<typeof OpenPowersConfigSchema>;

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
 * Validates the merged result against the Zod schema. Known fields that are
 * invalid trigger warnings but do not prevent loading — the raw merged config
 * is still returned. Unknown fields from overrides pass through freely.
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
    }
    // Return the raw config anyway — unknown fields and invalid known fields
    // still pass through so CLI commands remain functional
    return config as OpenPowersConfig;
  }

  return parsed.data;
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
