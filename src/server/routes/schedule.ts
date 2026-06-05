/**
 * Express router for /openpowers/api/schedule endpoint.
 * Provides PUT route to check and start the scheduler.
 * @author Meiyuki <meiyukichan@163.com>
 * @copyright 2026 Meiyuki
 */

import * as express from 'express';
import { startScheduler, stopScheduler, isSchedulerRunning } from '../memory/scheduler.js';
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

/**
 * DELETE /openpowers/api/schedule
 * Stops the scheduler if it is running.
 * Returns { ok: true, stopped: true } if scheduler was stopped by this request,
 * or { ok: true, stopped: false } if it was not running.
 */
scheduleRouter.delete('/', (_req, res) => {
  if (isSchedulerRunning()) {
    appendLog('DELETE /schedule: stopping scheduler');
    stopScheduler();
    res.status(200).json({ ok: true, stopped: true });
    return;
  }

  appendLog('DELETE /schedule: scheduler not running');
  res.status(200).json({ ok: true, stopped: false });
});

/**
 * POST /openpowers/api/schedule/restart
 * Stops the scheduler first, then starts it again.
 * Returns { ok: true, restarted: true }.
 */
scheduleRouter.post('/restart', (_req, res) => {
  try {
    appendLog('POST /schedule/restart: restarting scheduler');
    stopScheduler();
    startScheduler();
    res.status(200).json({ ok: true, restarted: true });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});
