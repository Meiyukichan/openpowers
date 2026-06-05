/**
 * Express router for /openpowers/api/changes endpoint.
 * Provides GET routes to list all changes and get individual change details.
 * @author Meiyuki <meiyukichan@163.com>
 * @copyright 2026 Meiyuki
 */

import * as express from 'express';
import { loadOrCreateChangesJson } from '../../commands/change/shared.js';

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

/** Express router for changes API routes. */
export const changesRouter = express.default.Router();

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

/**
 * GET /openpowers/api/changes
 * Returns the complete changes.json data including framework, version, changes, and archive arrays.
 */
changesRouter.get('/', (_req, res) => {
  try {
    const data = loadOrCreateChangesJson();
    res.status(200).json({ ok: true, data });
  } catch {
    res.status(500).json({ ok: false, error: 'Failed to load changes data' });
  }
});

/**
 * GET /openpowers/api/changes/:name
 * Returns the details of a single change by name, searching both changes and archive arrays.
 * Returns 404 if the change is not found.
 */
changesRouter.get('/:name', (req, res) => {
  try {
    const data = loadOrCreateChangesJson();
    const found =
      data.changes.find((c) => c.name === req.params.name) ??
      data.archive.find((a) => a.name === req.params.name);

    if (!found) {
      res.status(404).json({ ok: false, error: 'Change not found' });
      return;
    }

    res.status(200).json({ ok: true, data: found });
  } catch {
    res.status(500).json({ ok: false, error: 'Failed to load changes data' });
  }
});
