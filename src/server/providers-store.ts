/**
 * JSON file store for provider configurations.
 * Stores provider data and active provider state in a single JSON file
 * at ~/.openpowers/providers.json with sync file operations.
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
  defaultModel: z.string().default(''),
  sonnetModel: z.string().default(''),
  opusModel: z.string().default(''),
  haikuModel: z.string().default(''),
  createdAt: z.string(),
  updatedAt: z.string().optional(),
});

/** Inferred TypeScript type for a provider. */
export type Provider = z.infer<typeof ProviderSchema>;

/** Zod schema for the combined store file. */
const StoreDataSchema = z.object({
  activeProviderId: z.string().nullable(),
  providers: z.array(ProviderSchema),
});

/** Inferred type for the store file content. */
type StoreData = z.infer<typeof StoreDataSchema>;

/** Zod schema for creating a new provider (client input). */
export const ProviderInputSchema = z.object({
  name: z.string(),
  apiKey: z.string(),
  defaultModel: z.string(),
  sonnetModel: z.string(),
  opusModel: z.string(),
  haikuModel: z.string(),
  notes: z.string().optional(),
  websiteUrl: z.string().optional(),
  baseUrl: z.string().optional(),
  icon: z.string().optional(),
  iconColor: z.string().optional(),
});

/** Inferred TypeScript type for provider creation input. */
export type ProviderInput = z.infer<typeof ProviderInputSchema>;

/** Zod schema for updating an existing provider (all fields optional). */
export const ProviderUpdateSchema = z.object({
  name: z.string().optional(),
  apiKey: z.string().optional(),
  defaultModel: z.string().optional(),
  sonnetModel: z.string().optional(),
  opusModel: z.string().optional(),
  haikuModel: z.string().optional(),
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

/** Default store data when providers.json does not exist. */
const DEFAULT_STORE_DATA: StoreData = {
  activeProviderId: null,
  providers: [
    {
      id: '00000000-0000-0000-0000-000000000001',
      name: 'Anthropic',
      notes: 'Official Anthropic API',
      websiteUrl: 'https://www.anthropic.com',
      apiKey: '',
      baseUrl: 'https://api.anthropic.com',
      icon: 'sparkles',
      iconColor: '#d97706',
      defaultModel: '',
      sonnetModel: '',
      opusModel: '',
      haikuModel: '',
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
      defaultModel: '',
      sonnetModel: '',
      opusModel: '',
      haikuModel: '',
      createdAt: new Date().toISOString(),
    },
  ],
};

// ---------------------------------------------------------------------------
// File store operations
// ---------------------------------------------------------------------------

/**
 * Reads the entire store file and returns parsed store data.
 * Returns default data if the file does not exist or is corrupt.
 * @returns The parsed store data object
 */
function readStoreData(): StoreData {
  if (!fs.existsSync(PROVIDERS_FILE)) {
    return { ...DEFAULT_STORE_DATA, activeProviderId: null, providers: [] };
  }
  try {
    const raw = fs.readFileSync(PROVIDERS_FILE, 'utf-8');
    const parsed: unknown = JSON.parse(raw);
    const result = StoreDataSchema.safeParse(parsed);
    if (!result.success) {
      logger.warn('providers.json contains invalid data, returning defaults');
      return { ...DEFAULT_STORE_DATA, activeProviderId: null, providers: [] };
    }
    return result.data;
  } catch (err) {
    logger.error(`Failed to read providers.json: ${err instanceof Error ? err.message : String(err)}`);
    return { ...DEFAULT_STORE_DATA, activeProviderId: null, providers: [] };
  }
}

/**
 * Writes store data to the JSON file with formatted output (indent=2).
 * @param data - The store data to persist
 */
function writeStoreData(data: StoreData): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  fs.writeFileSync(PROVIDERS_FILE, JSON.stringify(data, null, 2), 'utf-8');
}

/**
 * Ensures the providers.json file exists. If it does not exist, creates the
 * file with sample provider data.
 */
export function ensureProvidersFile(): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(PROVIDERS_FILE)) {
    writeStoreData(DEFAULT_STORE_DATA);
    logger.info('Created providers.json with sample data');
  }
}

/**
 * Loads all providers from the JSON file.
 * @returns Array of provider objects
 */
export function loadProviders(): Provider[] {
  return readStoreData().providers;
}

/**
 * Saves an array of providers to the JSON file, preserving the active provider ID.
 * @param providers - The provider array to persist
 */
export function saveProviders(providers: Provider[]): void {
  const data = readStoreData();
  data.providers = providers;
  writeStoreData(data);
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
 * Creates a new provider. The server generates a UUID and sets createdAt
 * to the current ISO timestamp.
 * @param input - The provider input data (name and apiKey required)
 * @returns The newly created provider object
 */
export function createProvider(input: ProviderInput): Provider {
  const now = new Date().toISOString();
  const provider: Provider = {
    id: crypto.randomUUID(),
    name: input.name,
    apiKey: input.apiKey,
    defaultModel: input.defaultModel,
    sonnetModel: input.sonnetModel,
    opusModel: input.opusModel,
    haikuModel: input.haikuModel,
    notes: input.notes,
    websiteUrl: input.websiteUrl,
    baseUrl: input.baseUrl,
    icon: input.icon,
    iconColor: input.iconColor,
    createdAt: now,
  };

  const data = readStoreData();
  data.providers.push(provider);
  writeStoreData(data);
  logger.info(`Provider created: ${provider.name} (${provider.id})`);

  return provider;
}

/**
 * Updates an existing provider's fields. Only the fields present in the update
 * object are modified; other fields remain unchanged. Sets updatedAt timestamp.
 * @param id - The UUID of the provider to update
 * @param update - The partial update object with fields to change
 * @returns The updated provider object
 * @throws Error if the provider is not found
 */
export function updateProvider(id: string, update: ProviderUpdate): Provider {
  const data = readStoreData();
  const index = data.providers.findIndex((p) => p.id === id);
  if (index === -1) {
    throw new Error(`Provider not found: ${id}`);
  }

  const existing = data.providers[index];
  const updated: Provider = { ...existing, ...update, updatedAt: new Date().toISOString() };
  data.providers[index] = updated;
  writeStoreData(data);
  logger.info(`Provider updated: ${updated.name} (${updated.id})`);

  return updated;
}

/**
 * Deletes a provider by its ID. If the deleted provider is the currently active
 * provider, the active provider state is cleared (cascade).
 * @param id - The UUID of the provider to delete
 * @returns true if the provider was found and deleted, false if not found
 */
export function deleteProvider(id: string): boolean {
  const data = readStoreData();
  const index = data.providers.findIndex((p) => p.id === id);
  if (index === -1) {
    return false;
  }

  const deleted = data.providers[index];
  data.providers.splice(index, 1);

  // Cascade: clear active provider if the deleted provider was active
  if (data.activeProviderId === id) {
    data.activeProviderId = null;
  }

  writeStoreData(data);
  logger.info(`Provider deleted: ${deleted.name} (${deleted.id})`);

  return true;
}

// ---------------------------------------------------------------------------
// Active provider operations
// ---------------------------------------------------------------------------

/**
 * Reads the currently active provider ID from the store.
 * Returns null if no active provider is set.
 * @returns The active provider UUID string, or null if none is set
 */
export function getActiveProviderId(): string | null {
  return readStoreData().activeProviderId;
}

/**
 * Sets the active provider ID. Validates that the provider exists before saving.
 * @param providerId - The UUID of the provider to set as active
 * @throws Error if the provider ID does not exist
 */
export function setActiveProviderId(providerId: string): void {
  const data = readStoreData();
  const provider = data.providers.find((p) => p.id === providerId);
  if (!provider) {
    throw new Error(`Provider not found: ${providerId}`);
  }
  data.activeProviderId = providerId;
  writeStoreData(data);
  logger.info(`Active provider set: ${providerId}`);
}

/**
 * Clears the active provider ID by setting it to null.
 */
export function clearActiveProviderId(): void {
  const data = readStoreData();
  data.activeProviderId = null;
  writeStoreData(data);
  logger.info('Active provider cleared');
}

