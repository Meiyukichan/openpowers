/**
 * Express router for /openpowers/api/providers CRUD endpoints and active provider management.
 * @author Meiyuki <meiyukichan@163.com>
 * @copyright 2026 Meiyuki
 */

import * as express from 'express';
import { z } from 'zod';
import {
  loadProviders,
  createProvider,
  updateProvider,
  deleteProvider,
  getActiveProviderId,
  setActiveProviderId,
  clearActiveProviderId,
  getEnableOpenpowersProxy,
  setEnableOpenpowersProxy,
  getNeverClaudeSettings,
  setNeverClaudeSettings,
  getProviderById,
  getActiveProvider,
  ProviderInputSchema,
  ProviderUpdateSchema,
} from '../providers-store.js';
import { readProviderTemplates, addProviderTemplate, deleteProviderTemplate } from '../../utils/provider-templates.js';
import {
  getProxyEnv,
  getProviderEnv,
  writeEnvToClaudeSettings,
  backupClaudeSettings,
  restoreClaudeSettings,
} from '../claude-settings.js';
import { logger } from '../../utils/logger.js';

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

/** Express router for provider CRUD API routes. */
export const providersRouter = express.default.Router();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Converts a ZodError to a standardized error response body.
 * @param error - The ZodError from safeParse
 * @returns An object with error message and field-level details
 */
function formatZodError(error: { issues: Array<{ path: readonly (string | number | symbol)[]; message: string }> }): {
  error: string;
  details: Array<{ field: string; message: string }>;
} {
  return {
    error: 'Validation failed',
    details: error.issues.map((issue) => ({
      field: issue.path.map(String).join('.'),
      message: issue.message,
    })),
  };
}

/** Zod schema for setting the active provider (client input). */
const SetActiveProviderSchema = z.object({
  providerId: z.string(),
});

/**
 * If neverClaudeSettings is true, backs up Claude settings and disables
 * the guard so subsequent writes skip backup.
 */
function ensureFirstWriteBackup(): void {
  if (getNeverClaudeSettings()) {
    backupClaudeSettings();
    setNeverClaudeSettings(false);
  }
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

/**
 * GET /openpowers/api/providers
 * Returns the full list of configured providers as a JSON array.
 * Resolves icon from usedTemplate when provider has no explicit icon.
 */
providersRouter.get('/', (_req, res) => {
  const providers = loadProviders();
  const templates = readProviderTemplates();
  const resolved = providers.map((p) => {
    if (p.icon) return p;
    // 1) resolve via usedTemplate → template.iconSvg
    if (p.usedTemplate) {
      const template = templates.find((t) => t.name === p.usedTemplate);
      if (template?.iconSvg) {
        return { ...p, icon: template.iconSvg };
      }
    }
    // 2) fallback: derive icon from provider name for legacy providers
    const nameDerived = `${p.name.toLowerCase().replace(/\s+/g, '')}.svg`;
    const templateByName = templates.find((t) => t.name === p.name);
    if (templateByName?.iconSvg) {
      return { ...p, icon: templateByName.iconSvg };
    }
    // if the derived filename matches a known template's iconSvg, use it
    for (const t of templates) {
      if (t.iconSvg === nameDerived) {
        return { ...p, icon: t.iconSvg };
      }
    }
    return p;
  });
  res.status(200).json(resolved);
});

/**
 * GET /openpowers/api/providers/active
 * Returns the currently active provider ID, or null if none is set.
 */
providersRouter.get('/active', (_req, res) => {
  const activeProviderId = getActiveProviderId();
  res.status(200).json({ activeProviderId });
});

/**
 * PUT /openpowers/api/providers/active
 * Sets the specified provider as the active provider, then syncs Claude
 * settings. When proxy is off, writes the provider's env; when proxy is on,
 * writes proxy env. On first write, backs up existing settings.
 */
providersRouter.put('/active', (req, res) => {
  const parsed = SetActiveProviderSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json(formatZodError(parsed.error));
    return;
  }
  try {
    setActiveProviderId(parsed.data.providerId);
  } catch {
    res.status(404).json({ error: `Provider not found: ${parsed.data.providerId}` });
    return;
  }
  try {
    ensureFirstWriteBackup();
    if (getEnableOpenpowersProxy()) {
      writeEnvToClaudeSettings(getProxyEnv());
    } else {
      const provider = getProviderById(parsed.data.providerId);
      if (provider) {
        writeEnvToClaudeSettings(getProviderEnv(provider));
      }
    }
    res.status(200).json({ activeProviderId: parsed.data.providerId });
  } catch (err) {
    logger.error(`Failed to sync Claude settings: ${err instanceof Error ? err.message : String(err)}`);
    res.status(500).json({ error: 'Failed to sync Claude settings' });
  }
});

/**
 * POST /openpowers/api/providers
 * Creates a new provider. Validates input with zod; generates UUID and
 * createdAt on the server.
 */
providersRouter.post('/', (req, res) => {
  const parsed = ProviderInputSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json(formatZodError(parsed.error));
    return;
  }
  try {
    const provider = createProvider(parsed.data);
    res.status(201).json(provider);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    if (message.includes('already exists')) {
      res.status(409).json({ error: message });
    } else {
      res.status(500).json({ error: message });
    }
  }
});

/**
 * GET /openpowers/api/providers/proxy
 * Returns the current enableOpenpowersProxy state.
 */
providersRouter.get('/proxy', (_req, res) => {
  const enabled = getEnableOpenpowersProxy();
  res.status(200).json({ enableOpenpowersProxy: enabled });
});

/** Zod schema for setting the proxy enabled state. */
const SetProxySchema = z.object({
  enableOpenpowersProxy: z.boolean(),
});

/**
 * PUT /openpowers/api/providers/proxy
 * Sets the enableOpenpowersProxy flag and syncs Claude settings.
 * Enabling writes proxy env; disabling writes active provider env or
 * restores settings from backup if no active provider is set.
 */
providersRouter.put('/proxy', (req, res) => {
  const parsed = SetProxySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json(formatZodError(parsed.error));
    return;
  }
  try {
    setEnableOpenpowersProxy(parsed.data.enableOpenpowersProxy);
    if (parsed.data.enableOpenpowersProxy) {
      ensureFirstWriteBackup();
      writeEnvToClaudeSettings(getProxyEnv());
    } else {
      const activeProvider = getActiveProvider();
      if (activeProvider) {
        writeEnvToClaudeSettings(getProviderEnv(activeProvider));
      } else {
        restoreClaudeSettings();
      }
    }
    res.status(200).json({ enableOpenpowersProxy: parsed.data.enableOpenpowersProxy });
  } catch (err) {
    logger.error(`Failed to update proxy settings: ${err instanceof Error ? err.message : String(err)}`);
    res.status(500).json({ error: 'Failed to update proxy settings' });
  }
});

/**
 * PUT /openpowers/api/providers/:id
 * Updates an existing provider. Only fields present in the body are modified.
 * When the edited provider is the active provider and proxy is disabled,
 * syncs the provider's model config to Claude settings.
 */
providersRouter.put('/:id', (req, res) => {
  const parsed = ProviderUpdateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json(formatZodError(parsed.error));
    return;
  }
  let provider;
  try {
    provider = updateProvider(req.params.id, parsed.data);
  } catch {
    res.status(404).json({ error: `Provider not found: ${req.params.id}` });
    return;
  }
  try {
    if (getActiveProviderId() === req.params.id && !getEnableOpenpowersProxy()) {
      writeEnvToClaudeSettings(getProviderEnv(provider));
    }
    res.status(200).json(provider);
  } catch (err) {
    logger.error(`Failed to sync Claude settings: ${err instanceof Error ? err.message : String(err)}`);
    res.status(500).json({ error: 'Failed to sync Claude settings' });
  }
});

/**
 * DELETE /openpowers/api/providers/templates/:name
 * Deletes a custom provider template by name. Builtin templates cannot be
 * deleted (returns 403). Non-existent names return 404.
 */
providersRouter.delete('/templates/:name', (req, res) => {
  try {
    const deleted = deleteProviderTemplate(req.params.name);
    if (!deleted) {
      res.status(404).json({ error: `Template not found: ${req.params.name}` });
      return;
    }
    res.status(200).json({ message: `Template "${req.params.name}" deleted successfully` });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    if (message.includes('Cannot delete builtin')) {
      res.status(403).json({ error: message });
    } else {
      res.status(500).json({ error: message });
    }
  }
});

/**
 * DELETE /openpowers/api/providers/:id
 * Removes a provider from the configuration. If the deleted provider was
 * the active provider and the proxy was disabled, restores the original
 * Claude settings from backup.
 */
providersRouter.delete('/:id', (req, res) => {
  const wasActive = getActiveProviderId() === req.params.id;
  const proxyDisabled = !getEnableOpenpowersProxy();
  const found = deleteProvider(req.params.id);
  if (!found) {
    res.status(404).json({ error: `Provider not found: ${req.params.id}` });
    return;
  }
  if (wasActive && proxyDisabled) {
    restoreClaudeSettings();
  }
  res.status(204).send();
});

/**
 * POST /openpowers/api/providers/reset
 * Restores Claude settings from backup (if available), then clears the
 * active provider. If no backup exists, a warning is logged and the
 * active provider is still cleared.
 */
providersRouter.post('/reset', (_req, res) => {
  try {
    restoreClaudeSettings();
  } catch (err) {
    logger.error(`Failed to restore Claude settings: ${err instanceof Error ? err.message : String(err)}`);
  }
  try {
    clearActiveProviderId();
  } catch (err) {
    logger.error(`Failed to clear active provider: ${err instanceof Error ? err.message : String(err)}`);
    res.status(500).json({ error: 'Failed to clear active provider' });
    return;
  }
  res.status(200).json({ activeProviderId: null });
});

/** Zod schema for adding a new provider template. */
const ProviderTemplateInputSchema = z.object({
  name: z.string().min(1, 'Template name is required'),
  baseUrl: z.string(),
  websiteUrl: z.string().optional().default(''),
  iconSvg: z.string().optional().default(''),
  defaultModel: z.string().optional().default(''),
  sonnetModel: z.string().optional().default(''),
  opusModel: z.string().optional().default(''),
  haikuModel: z.string().optional().default(''),
});

/**
 * GET /openpowers/api/providers/templates
 * Returns the full list of provider preset templates.
 */
providersRouter.get('/templates', (_req, res) => {
  try {
    const templates = readProviderTemplates();
    res.status(200).json(templates);
  } catch {
    res.status(500).json({ error: 'Failed to read provider templates' });
  }
});

/**
 * POST /openpowers/api/providers/templates
 * Adds a new provider template. Validates required fields, strips apiKey
 * if present, and rejects duplicate names with 409.
 */
providersRouter.post('/templates', (req, res) => {
  const parsed = ProviderTemplateInputSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json(formatZodError(parsed.error));
    return;
  }
  try {
    const template = addProviderTemplate(parsed.data);
    res.status(201).json(template);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    if (message.includes('already exists')) {
      res.status(409).json({ error: message });
    } else {
      res.status(500).json({ error: message });
    }
  }
});
