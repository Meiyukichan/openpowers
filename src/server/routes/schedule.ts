/**
 * Express router for /openpowers/api/schedule endpoint.
 * Provides PUT route to check and start the scheduler.
 * @author Meiyuki <meiyukichan@163.com>
 * @copyright 2026 Meiyuki
 */

import * as express from 'express';
import { startScheduler, isSchedulerRunning } from '../memory/scheduler.js';
import { appendLog } from '../memory/schedule-logger.js';

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

/** Express router for schedule API routes. */
export const scheduleRouter = express.default.Router();

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

/**
 * PUT /openpowers/api/schedule
 * Checks if the scheduler is running and starts it if not.
 * Returns { ok: true, started: true } if scheduler was started by this request,
 * or { ok: true, started: false } if it was already running.
 */
scheduleRouter.put('/', (_req, res) => {
  if (isSchedulerRunning()) {
    appendLog('PUT /schedule: scheduler already running');
    res.status(200).json({ ok: true, started: false });
    return;
  }

  appendLog('PUT /schedule: starting scheduler');
  startScheduler();
  res.status(200).json({ ok: true, started: true });
});
