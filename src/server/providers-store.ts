/**
 * JSON file store for provider configurations.
 * Stores provider data in ~/.openpowers/providers.json with sync file operations.
 * Provides CRUD operations and zod validation schemas for provider data models.
 * @author Meiyuki <meiyukichan@163.com>
 * @copyright 2026 Meiyuki
 */

import fs from 'fs';
import os from 'os';
import path from 'path';
import crypto from 'crypto';
import { z } from 'zod';
import { logger } from '../utils/logger.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

// Data directory and providers file path under user's home directory
const DATA_DIR = path.join(os.homedir(), '.openpowers');
const PROVIDERS_FILE = path.join(DATA_DIR, 'providers.json');

// ---------------------------------------------------------------------------
// Zod schemas
// ---------------------------------------------------------------------------

/** Zod schema for a full provider object (includes server-generated fields). */
export const ProviderSchema = z.object({
  id: z.string(),
  name: z.string(),
  notes: z.string().optional(),
  websiteUrl: z.string().optional(),
  apiKey: z.string().optional(),
  baseUrl: z.string().optional(),
  icon: z.string().optional(),
  iconColor: z.string().optional(),
  enabled: z.boolean(),
  createdAt: z.string(),
});

/** Inferred TypeScript type for a provider. */
export type Provider = z.infer<typeof ProviderSchema>;

/** Zod schema for creating a new provider (client input). */
export const ProviderInputSchema = z.object({
  name: z.string(),
  apiKey: z.string(),
  notes: z.string().optional(),
  websiteUrl: z.string().optional(),
  baseUrl: z.string().optional(),
  icon: z.string().optional(),
  iconColor: z.string().optional(),
  enabled: z.boolean().optional(),
});

/** Inferred TypeScript type for provider creation input. */
export type ProviderInput = z.infer<typeof ProviderInputSchema>;

/** Zod schema for updating an existing provider (all fields optional). */
export const ProviderUpdateSchema = z.object({
  name: z.string().optional(),
  apiKey: z.string().optional(),
  notes: z.string().optional(),
  websiteUrl: z.string().optional(),
  baseUrl: z.string().optional(),
  icon: z.string().optional(),
  iconColor: z.string().optional(),
});

/** Inferred TypeScript type for provider update input. */
export type ProviderUpdate = z.infer<typeof ProviderUpdateSchema>;

// ---------------------------------------------------------------------------
// Sample data
// ---------------------------------------------------------------------------

/** Sample providers created when providers.json does not exist. */
const SAMPLE_PROVIDERS: Provider[] = [
  {
    id: '00000000-0000-0000-0000-000000000001',
    name: 'Anthropic',
    notes: 'Official Anthropic API',
    websiteUrl: 'https://www.anthropic.com',
    apiKey: '',
    baseUrl: 'https://api.anthropic.com',
    icon: 'sparkles',
    iconColor: '#d97706',
    enabled: false,
    createdAt: new Date().toISOString(),
  },
  {
    id: '00000000-0000-0000-0000-000000000002',
    name: 'OpenAI',
    notes: 'OpenAI compatible API',
    websiteUrl: 'https://openai.com',
    apiKey: '',
    baseUrl: 'https://api.openai.com',
    icon: 'cpu',
    iconColor: '#10a37f',
    enabled: false,
    createdAt: new Date().toISOString(),
  },
];

// ---------------------------------------------------------------------------
// File store operations
// ---------------------------------------------------------------------------

/**
 * Ensures the providers.json file exists. If it does not exist, creates the
 * file with sample provider data.
 */
export function ensureProvidersFile(): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(PROVIDERS_FILE)) {
    saveProviders(SAMPLE_PROVIDERS);
    logger.info('Created providers.json with sample data');
  }
}

/**
 * Loads all providers from the JSON file.
 * Ensures the file exists before reading, creating it with sample data if needed.
 * @returns Array of provider objects
 */
export function loadProviders(): Provider[] {
  ensureProvidersFile();
  try {
    const raw = fs.readFileSync(PROVIDERS_FILE, 'utf-8');
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      logger.warn('providers.json is not an array, returning empty list');
      return [];
    }
    const result = z.array(ProviderSchema).safeParse(parsed);
    if (!result.success) {
      logger.warn('providers.json contains invalid data, returning empty list');
      return [];
    }
    return result.data;
  } catch (err) {
    logger.error(`Failed to read providers.json: ${err instanceof Error ? err.message : String(err)}`);
    return [];
  }
}

/**
 * Saves an array of providers to the JSON file with formatted output (indent=2).
 * Uses synchronous write for serialization safety.
 * @param providers - The provider array to persist
 */
export function saveProviders(providers: Provider[]): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  fs.writeFileSync(PROVIDERS_FILE, JSON.stringify(providers, null, 2), 'utf-8');
}

/**
 * Retrieves a single provider by its ID.
 * @param id - The provider UUID to look up
 * @returns The provider object, or undefined if not found
 */
export function getProviderById(id: string): Provider | undefined {
  const providers = loadProviders();
  return providers.find((p) => p.id === id);
}

/**
 * Creates a new provider. The server generates a UUID, sets enabled=true,
 * and sets createdAt to the current ISO timestamp.
 * @param input - The provider input data (name and apiKey required)
 * @returns The newly created provider object
 */
export function createProvider(input: ProviderInput): Provider {
  const now = new Date().toISOString();
  const provider: Provider = {
    id: crypto.randomUUID(),
    name: input.name,
    apiKey: input.apiKey,
    notes: input.notes,
    websiteUrl: input.websiteUrl,
    baseUrl: input.baseUrl,
    icon: input.icon,
    iconColor: input.iconColor,
    enabled: true,
    createdAt: now,
  };

  const providers = loadProviders();
  providers.push(provider);
  saveProviders(providers);
  logger.info(`Provider created: ${provider.name} (${provider.id})`);

  return provider;
}

/**
 * Updates an existing provider's fields. Only the fields present in the update
 * object are modified; other fields remain unchanged.
 * @param id - The UUID of the provider to update
 * @param update - The partial update object with fields to change
 * @returns The updated provider object
 * @throws Error if the provider is not found
 */
export function updateProvider(id: string, update: ProviderUpdate): Provider {
  const providers = loadProviders();
  const index = providers.findIndex((p) => p.id === id);
  if (index === -1) {
    throw new Error(`Provider not found: ${id}`);
  }

  const existing = providers[index];
  const updated: Provider = { ...existing, ...update };
  providers[index] = updated;
  saveProviders(providers);
  logger.info(`Provider updated: ${updated.name} (${updated.id})`);

  return updated;
}

/**
 * Deletes a provider by its ID.
 * @param id - The UUID of the provider to delete
 * @returns true if the provider was found and deleted, false if not found
 */
export function deleteProvider(id: string): boolean {
  const providers = loadProviders();
  const index = providers.findIndex((p) => p.id === id);
  if (index === -1) {
    return false;
  }

  const deleted = providers[index];
  providers.splice(index, 1);
  saveProviders(providers);
  logger.info(`Provider deleted: ${deleted.name} (${deleted.id})`);

  return true;
}

/**
 * Toggles the enabled state of a provider (true becomes false, false becomes true).
 * @param id - The UUID of the provider to toggle
 * @returns The updated provider with the new enabled state
 * @throws Error if the provider is not found
 */
export function toggleProvider(id: string): Provider {
  const providers = loadProviders();
  const index = providers.findIndex((p) => p.id === id);
  if (index === -1) {
    throw new Error(`Provider not found: ${id}`);
  }

  providers[index].enabled = !providers[index].enabled;
  saveProviders(providers);
  logger.info(`Provider toggled: ${providers[index].name} (${id}) enabled=${providers[index].enabled}`);

  return providers[index];
}
