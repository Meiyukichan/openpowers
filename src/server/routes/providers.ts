/**
 * Express router for /furina/api/providers CRUD endpoints and active provider management.
 * @author Meiyuki <meiyukichan@163.com>
 * @copyright 2026 Meiyuki
 */

import * as express from 'express';
import { z } from 'zod';
import axios from 'axios';
import {
  loadProviders,
  createProvider,
  updateProvider,
  deleteProvider,
  getActiveProviderId,
  setActiveProviderId,
  clearActiveProviderId,
  getEnableFurinaProxy,
  setEnableFurinaProxy,
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

/**
 * Checks if an upstream 403 response indicates an authentication error
 * (bad/expired key) vs a permission error (valid key, no access to model).
 *
 * Anthropic-format providers return structured error bodies:
 *   { type: "error", error: { type: "authentication_error", ... } }
 *   { type: "error", error: { type: "permission_error", ... } }
 *
 * A "permission_error" with a model-access code (e.g. 1220 on Zhipu) means
 * the key was accepted but the model is not available — key is still valid.
 */
function isUpstreamAuthError(data: unknown): boolean {
  if (!data || typeof data !== 'object') return true; // unknown format → assume auth error
  const body = data as Record<string, unknown>;
  // Anthropic error format: { type: "error", error: { type: "..." } }
  if (body.type === 'error' && body.error && typeof body.error === 'object') {
    const errObj = body.error as Record<string, unknown>;
    // "authentication_error" = bad key; anything else (permission_error, etc.) = key accepted
    return errObj.type === 'authentication_error';
  }
  // OpenAI format: { error: { message: "...", type: "invalid_api_key" } }
  if (body.error && typeof body.error === 'object') {
    const errObj = body.error as Record<string, unknown>;
    if (errObj.type === 'invalid_api_key' || errObj.type === 'invalid_request_error') {
      return true;
    }
  }
  // If string contains common auth-failure keywords
  if (typeof body.message === 'string') {
    const msg = body.message.toLowerCase();
    return msg.includes('invalid') && msg.includes('key');
  }
  // Default: assume non-auth error (key accepted)
  return false;
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
 * GET /furina/api/providers
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
 * GET /furina/api/providers/active
 * Returns the currently active provider ID, or null if none is set.
 */
providersRouter.get('/active', (_req, res) => {
  const activeProviderId = getActiveProviderId();
  res.status(200).json({ activeProviderId });
});

/**
 * PUT /furina/api/providers/active
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
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes('disabled')) {
      res.status(400).json({ error: message });
    } else {
      res.status(404).json({ error: message });
    }
    return;
  }
  try {
    ensureFirstWriteBackup();
    if (getEnableFurinaProxy()) {
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
 * POST /furina/api/providers
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
 * GET /furina/api/providers/proxy
 * Returns the current enableFurinaProxy state.
 */
providersRouter.get('/proxy', (_req, res) => {
  const enabled = getEnableFurinaProxy();
  res.status(200).json({ enableFurinaProxy: enabled });
});

/** Zod schema for setting the proxy enabled state. */
const SetProxySchema = z.object({
  enableFurinaProxy: z.boolean(),
});

/**
 * PUT /furina/api/providers/proxy
 * Sets the enableFurinaProxy flag and syncs Claude settings.
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
    setEnableFurinaProxy(parsed.data.enableFurinaProxy);
    if (parsed.data.enableFurinaProxy) {
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
    res.status(200).json({ enableFurinaProxy: parsed.data.enableFurinaProxy });
  } catch (err) {
    logger.error(`Failed to update proxy settings: ${err instanceof Error ? err.message : String(err)}`);
    res.status(500).json({ error: 'Failed to update proxy settings' });
  }
});

/** Zod schema for toggling a provider's enabled state. */
const SetEnabledSchema = z.object({
  enabled: z.boolean(),
});

/**
 * PUT /furina/api/providers/:id/enabled
 * Toggles the enabled state of a provider. When disabling, clears the active
 * provider ID and syncs Claude settings if the disabled provider was active.
 */
providersRouter.put('/:id/enabled', (req, res) => {
  const parsed = SetEnabledSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json(formatZodError(parsed.error));
    return;
  }
  const wasActive = getActiveProviderId() === req.params.id;
  let provider;
  try {
    provider = updateProvider(req.params.id, { enabled: parsed.data.enabled });
  } catch {
    res.status(404).json({ error: `Provider not found: ${req.params.id}` });
    return;
  }
  try {
    if (parsed.data.enabled === false && wasActive && !getEnableFurinaProxy()) {
      restoreClaudeSettings();
    } else if (parsed.data.enabled === false && wasActive && getEnableFurinaProxy()) {
      writeEnvToClaudeSettings(getProxyEnv());
    }
    res.status(200).json(provider);
  } catch (err) {
    logger.error(`Failed to sync Claude settings: ${err instanceof Error ? err.message : String(err)}`);
    res.status(500).json({ error: 'Failed to sync Claude settings' });
  }
});

/**
 * PUT /furina/api/providers/:id
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
    if (getActiveProviderId() === req.params.id && !getEnableFurinaProxy()) {
      writeEnvToClaudeSettings(getProviderEnv(provider));
    }
    res.status(200).json(provider);
  } catch (err) {
    logger.error(`Failed to sync Claude settings: ${err instanceof Error ? err.message : String(err)}`);
    res.status(500).json({ error: 'Failed to sync Claude settings' });
  }
});

/**
 * DELETE /furina/api/providers/templates/:name
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
 * DELETE /furina/api/providers/:id
 * Removes a provider from the configuration. If the deleted provider was
 * the active provider and the proxy was disabled, restores the original
 * Claude settings from backup.
 */
providersRouter.delete('/:id', (req, res) => {
  const wasActive = getActiveProviderId() === req.params.id;
  const proxyDisabled = !getEnableFurinaProxy();
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
 * POST /furina/api/providers/reset
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
 * GET /furina/api/providers/templates
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
 * POST /furina/api/providers/templates
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

// ---------------------------------------------------------------------------
// Validate endpoint
// ---------------------------------------------------------------------------

/** Zod schema for validating provider API key. */
const ProviderValidateSchema = z.object({
  baseUrl: z.string().min(1),
  apiKey: z.string().min(1),
});

/**
 * POST /furina/api/providers/validate
 * Validates an API key by calling the upstream /v1/models endpoint
 * with a 5 second timeout. Does not store the key.
 */
providersRouter.post('/validate', async (req, res) => {
  // Guard: reject oversized request bodies (> 1kb)
  if (JSON.stringify(req.body).length > 1024) {
    res.status(413).json({ error: 'Request body too large' });
    return;
  }

  const parsed = ProviderValidateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Missing required fields: baseUrl, apiKey' });
    return;
  }

  const { baseUrl, apiKey } = parsed.data;
  const url = `${baseUrl.replace(/\/+$/, '')}/v1/messages`;

  // Auth header combinations to try in order.
  // Some providers reject requests when both x-api-key and authorization are present.
  // Others require one or the other. We try progressively simpler combinations.
  const authCombinations: Array<Record<string, string>> = [
    // Anthropic format: x-api-key
    { 'x-api-key': apiKey },
    // OpenAI / DeepSeek / Zhipu format: Authorization Bearer
    { 'authorization': `Bearer ${apiKey}` },
    // Raw authorization without Bearer prefix (some providers)
    { 'authorization': apiKey },
  ];

  try {
    let upstreamRes: any;
    for (const authHeaders of authCombinations) {
      upstreamRes = await axios({
        method: 'POST',
        url,
        headers: {
          ...authHeaders,
          'content-type': 'application/json',
          'anthropic-version': '2023-06-01',
        },
        data: { model: 'test', max_tokens: 1, messages: [{ role: 'user', content: 'hi' }] },
        timeout: 5000,
        validateStatus: () => true,
      });

      // If not 401/403, stop trying more auth combinations
      if (upstreamRes.status !== 401 && upstreamRes.status !== 403) {
        break;
      }
    }

    // Guard: upstreamRes is always assigned because authCombinations is non-empty
    const finalRes = upstreamRes!;

    if (finalRes.status === 200 || finalRes.status === 400) {
      // 200 = valid key with working request; 400 = valid key but bad request format
      res.status(200).json({
        valid: true,
        models: finalRes.data.data || [],
      });
    } else if (finalRes.status === 401) {
      // 401 = always invalid key
      const upstreamError = typeof finalRes.data === 'object'
        ? JSON.stringify(finalRes.data)
        : String(finalRes.data || '');
      res.status(200).json({
        valid: false,
        error: 'Authentication failed: invalid API key',
        upstreamError: upstreamError || undefined,
      });
    } else if (finalRes.status === 403) {
      // 403 can mean either invalid key OR valid key but no access to the requested model.
      // Check if upstream indicates a non-auth error (e.g. model access permission).
      const isAuthError = isUpstreamAuthError(finalRes.data);
      if (isAuthError) {
        const upstreamError = typeof finalRes.data === 'object'
          ? JSON.stringify(finalRes.data)
          : String(finalRes.data || '');
        res.status(200).json({
          valid: false,
          error: 'Authentication failed: invalid API key',
          upstreamError: upstreamError || undefined,
        });
      } else {
        // Key accepted but model/resource not available — key is valid
        res.status(200).json({
          valid: true,
          models: finalRes.data.data || [],
        });
      }
    } else {
      const upstreamError = typeof finalRes.data === 'object'
        ? JSON.stringify(finalRes.data)
        : String(finalRes.data || '');
      res.status(200).json({
        valid: false,
        error: `Validation failed: upstream returned ${finalRes.status}`,
        upstreamError: upstreamError || undefined,
      });
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    const code = (err as NodeJS.ErrnoException).code;

    if (code === 'ETIMEDOUT' || code === 'ECONNABORTED') {
      res.status(200).json({
        valid: false,
        error: 'Validation timeout: upstream did not respond within 5s',
      });
    } else {
      res.status(200).json({
        valid: false,
        error: `Validation failed: ${message}`,
      });
    }
  }
});
