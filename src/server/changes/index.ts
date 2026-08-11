/**
 * Express router for /furina/api/changes endpoint.
 * Provides GET routes to list all changes and get individual change details.
 * @author Meiyuki <meiyukichan@163.com>
 * @copyright 2026 Meiyuki
 */

import * as express from 'express';
import { loadOrCreateChangesJson } from '../../commands/change/shared.js';
import { getAllChanges } from './shared.js';

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

/** Express router for changes API routes. */
export const changesRouter = express.default.Router();

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

/**
 * GET /furina/api/changes
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
 * GET /furina/api/changes/all
 * Aggregates changes from all Memory_ directories under ~/.furina/memory/.
 * Accepts optional query parameters: status, cwd, query.
 * Returns a ChangeEntryWithCwd array sorted by updateAt descending.
 */
changesRouter.get('/all', async (req, res) => {
  try {
    const options: Record<string, string> = {};
    const { status, cwd, query } = req.query as Record<string, string | undefined>;

    if (status && status !== '') options.status = status;
    if (cwd && cwd !== '') options.cwd = cwd;
    if (query && query !== '') options.query = query;

    const data = await getAllChanges(options);
    res.status(200).json({ ok: true, data });
  } catch {
    res.status(500).json({ ok: false, error: 'Failed to load aggregated changes data' });
  }
});

/**
 * GET /furina/api/changes/:name
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
