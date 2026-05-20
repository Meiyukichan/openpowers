/**
 * Express router for /api/providers CRUD endpoints.
 * Handles create, read, update, delete, and toggle operations for Claude providers.
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
  toggleProvider,
  getActiveProviderId,
  setActiveProviderId,
  ProviderInputSchema,
  ProviderUpdateSchema,
} from '../providers-store.js';

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

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

/**
 * GET /api/providers
 * Returns the full list of configured providers as a JSON array.
 */
providersRouter.get('/', (_req, res) => {
  const providers = loadProviders();
  res.status(200).json(providers);
});

/**
 * GET /api/providers/active
 * Returns the currently active provider ID, or null if none is set.
 */
providersRouter.get('/active', (_req, res) => {
  const activeProviderId = getActiveProviderId();
  res.status(200).json({ activeProviderId });
});

/**
 * PUT /api/providers/active
 * Sets the specified provider as the active provider. Validates the provider ID
 * exists before persisting the active state.
 */
providersRouter.put('/active', (req, res) => {
  const parsed = SetActiveProviderSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json(formatZodError(parsed.error));
    return;
  }
  try {
    setActiveProviderId(parsed.data.providerId);
    res.status(200).json({ activeProviderId: parsed.data.providerId });
  } catch {
    res.status(404).json({ error: `Provider not found: ${parsed.data.providerId}` });
  }
});

/**
 * POST /api/providers
 * Creates a new provider. Validates input with zod; generates UUID, enabled=true,
 * and createdAt on the server.
 */
providersRouter.post('/', (req, res) => {
  const parsed = ProviderInputSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json(formatZodError(parsed.error));
    return;
  }
  const provider = createProvider(parsed.data);
  res.status(201).json(provider);
});

/**
 * PUT /api/providers/:id
 * Updates an existing provider. Only fields present in the body are modified.
 */
providersRouter.put('/:id', (req, res) => {
  const parsed = ProviderUpdateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json(formatZodError(parsed.error));
    return;
  }
  try {
    const provider = updateProvider(req.params.id, parsed.data);
    res.status(200).json(provider);
  } catch {
    res.status(404).json({ error: `Provider not found: ${req.params.id}` });
  }
});

/**
 * DELETE /api/providers/:id
 * Removes a provider from the configuration.
 */
providersRouter.delete('/:id', (req, res) => {
  const found = deleteProvider(req.params.id);
  if (!found) {
    res.status(404).json({ error: `Provider not found: ${req.params.id}` });
    return;
  }
  res.status(204).send();
});

/**
 * PATCH /api/providers/:id/toggle
 * Inverts the enabled field of the specified provider.
 */
providersRouter.patch('/:id/toggle', (req, res) => {
  try {
    const provider = toggleProvider(req.params.id);
    res.status(200).json(provider);
  } catch {
    res.status(404).json({ error: `Provider not found: ${req.params.id}` });
  }
});
