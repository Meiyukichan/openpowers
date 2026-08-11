/**
 * Express router for /furina/api/config endpoints.
 * Provides GET/PUT for reading and updating the language configuration.
 * @author Meiyuki <meiyukichan@163.com>
 * @copyright 2026 Meiyuki
 */

import * as express from 'express';
import { z } from 'zod';
import { getLanguage, setLanguage } from '../providers-store.js';

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

/** Express router for config API routes. */
export const configRouter = express.default.Router();

// ---------------------------------------------------------------------------
// Zod schemas
// ---------------------------------------------------------------------------

/** Zod schema for updating the language config. */
const SetLanguageSchema = z.object({
  language: z.enum(['chinese', 'english']),
});

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

/**
 * GET /furina/api/config
 * Returns the current Furina configuration, including the language field.
 */
configRouter.get('/', (_req, res) => {
  const language = getLanguage();
  res.status(200).json({ language });
});

/**
 * PUT /furina/api/config
 * Updates the language configuration. Requires body: { language: "chinese" | "english" }.
 */
configRouter.put('/', (req, res) => {
  const parsed = SetLanguageSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: 'Validation failed',
      details: parsed.error.issues.map((issue) => ({
        field: issue.path.map(String).join('.'),
        message: issue.message,
      })),
    });
    return;
  }
  setLanguage(parsed.data.language);
  res.status(200).json({ language: parsed.data.language });
});
