/**
 * Claude settings.json utility module.
 * Provides shared functions for reading, writing, backing up, and restoring
 * ~/.claude/settings.json, plus generating proxy and provider env objects.
 * @author Meiyuki <meiyukichan@163.com>
 * @copyright 2026 Meiyuki
 */

import fs from 'fs';
import os from 'os';
import path from 'path';
import { logger } from '../utils/logger.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

// Claude settings file under user's home directory
const CLAUDE_SETTINGS_FILE = path.join(os.homedir(), '.claude', 'settings.json');

// Backup file in Furina data directory
const BACKUP_FILE = path.join(os.homedir(), '.furina', 'settings.bak.json');

// Proxy env configuration (fixed values)
const PROXY_BASE_URL = 'http://localhost:3939';
const PROXY_AUTH_TOKEN = 'sk-1234';

// Telemetry suppression flags shared across proxy and provider env configs
const TELEMETRY_SUPPRESSION: Record<string, string> = {
  CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1',
  DISABLE_ERROR_REPORTING: '1',
  DISABLE_NON_ESSENTIAL_MODEL_CALLS: '1',
  DISABLE_TELEMETRY: '1',
};

// ---------------------------------------------------------------------------
// Env type
// ---------------------------------------------------------------------------

/** Env object type: plain string key-value pairs. */
export type EnvObject = Record<string, string>;

/** Minimum provider type needed for generating env config. */
export interface ProviderEnvInput {
  baseUrl?: string;
  apiKey?: string;
  defaultModel?: string;
  sonnetModel?: string;
  opusModel?: string;
  haikuModel?: string;
}

// ---------------------------------------------------------------------------
// File read/write operations
// ---------------------------------------------------------------------------

/**
 * Reads ~/.claude/settings.json and returns its parsed JSON content.
 * Returns an empty object if the file does not exist or contains malformed JSON.
 * @returns The parsed settings object, or {} on failure
 */
export function readClaudeSettings(): Record<string, unknown> {
  if (!fs.existsSync(CLAUDE_SETTINGS_FILE)) {
    return {};
  }
  try {
    const raw = fs.readFileSync(CLAUDE_SETTINGS_FILE, 'utf-8');
    return JSON.parse(raw) as Record<string, unknown>;
  } catch (err) {
    if (err instanceof SyntaxError) {
      logger.warn(`Invalid JSON in ${CLAUDE_SETTINGS_FILE}, returning empty object`);
    } else {
      logger.error(`Failed to read ${CLAUDE_SETTINGS_FILE}: ${err instanceof Error ? err.message : String(err)}`);
    }
    return {};
  }
}

/**
 * Writes a full JSON object to ~/.claude/settings.json with 2-space indentation.
 * Creates the file and parent directories if they do not exist.
 * @param data - The data object to write
 */
export function writeClaudeSettings(data: Record<string, unknown>): void {
  const dir = path.dirname(CLAUDE_SETTINGS_FILE);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(CLAUDE_SETTINGS_FILE, JSON.stringify(data, null, 2), 'utf-8');
}

// ---------------------------------------------------------------------------
// Backup / restore operations
// ---------------------------------------------------------------------------

/**
 * Copies ~/.claude/settings.json to ~/.furina/settings.bak.json.
 * Logs a warning and does nothing if the source file does not exist.
 */
export function backupClaudeSettings(): void {
  if (!fs.existsSync(CLAUDE_SETTINGS_FILE)) {
    logger.warn(`Cannot backup: ${CLAUDE_SETTINGS_FILE} does not exist`);
    return;
  }
  const bakDir = path.dirname(BACKUP_FILE);
  if (!fs.existsSync(bakDir)) {
    fs.mkdirSync(bakDir, { recursive: true });
  }
  fs.copyFileSync(CLAUDE_SETTINGS_FILE, BACKUP_FILE);
}

/**
 * Copies ~/.furina/settings.bak.json to ~/.claude/settings.json.
 * Returns true on success, false if the backup file does not exist.
 * @returns true if restore succeeded, false if backup was missing
 */
export function restoreClaudeSettings(): boolean {
  if (!fs.existsSync(BACKUP_FILE)) {
    logger.warn(`Cannot restore: backup file ${BACKUP_FILE} not found`);
    return false;
  }
  const destDir = path.dirname(CLAUDE_SETTINGS_FILE);
  if (!fs.existsSync(destDir)) {
    fs.mkdirSync(destDir, { recursive: true });
  }
  fs.copyFileSync(BACKUP_FILE, CLAUDE_SETTINGS_FILE);
  return true;
}

// ---------------------------------------------------------------------------
// Env configuration generation
// ---------------------------------------------------------------------------

/**
 * Returns a fixed env object for proxy mode.
 * Includes ANTHROPIC_BASE_URL, ANTHROPIC_AUTH_TOKEN, and telemetry suppression flags.
 * @returns The proxy env configuration object
 */
export function getProxyEnv(): EnvObject {
  return {
    ANTHROPIC_BASE_URL: PROXY_BASE_URL,
    ANTHROPIC_AUTH_TOKEN: PROXY_AUTH_TOKEN,
    ...TELEMETRY_SUPPRESSION,
    NO_PROXY: 'localhost',
  };
}

/**
 * Returns an env object populated from a provider's configuration.
 * Empty model fields produce empty string values.
 * @param provider - The provider configuration object
 * @returns The provider env configuration object
 */
export function getProviderEnv(provider: ProviderEnvInput): EnvObject {
  return {
    ANTHROPIC_BASE_URL: provider.baseUrl ?? '',
    ANTHROPIC_AUTH_TOKEN: provider.apiKey ?? '',
    ANTHROPIC_MODEL: provider.defaultModel ?? '',
    ANTHROPIC_DEFAULT_HAIKU_MODEL: provider.haikuModel ?? '',
    ANTHROPIC_DEFAULT_SONNET_MODEL: provider.sonnetModel ?? '',
    ANTHROPIC_DEFAULT_OPUS_MODEL: provider.opusModel ?? '',
    ...TELEMETRY_SUPPRESSION,
    NO_PROXY: 'localhost',
  };
}

// ---------------------------------------------------------------------------
// Write env to Claude settings
// ---------------------------------------------------------------------------

/**
 * Reads existing ~/.claude/settings.json, replaces only the env key,
 * and writes the result back. Non-env top-level keys are preserved.
 * If settings.json does not exist, a new file is created with only the env key.
 * @param env - The env configuration object to write
 */
export function writeEnvToClaudeSettings(env: EnvObject): void {
  const settings = readClaudeSettings();
  settings.env = env;
  writeClaudeSettings(settings);
}
