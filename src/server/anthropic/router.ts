/**
 * @fileoverview Express router for Anthropic API proxy routes.
 * Registers health check, dedicated /v1/messages routes, and catch-all proxy.
 * @author Meiyuki <meiyukichan@163.com>
 * @copyright 2026 Meiyuki
 */

import * as express from 'express';
import { proxyRequestHandler } from './handler.js';

/**
 * Creates and returns an Express Router with all proxy route handlers.
 * Routes use absolute paths and must be mounted at root (/).
 * @returns Configured Express Router instance
 */
export function createProxyRouter(): express.Router {
  const router = express.default.Router();

  // Health check endpoints
  router.head('/', (_req, res) => {
    res.status(200).end();
  });

  router.get('/', (_req, res) => {
    res.status(200).end();
  });

  // Dedicated Messages API route (600s timeout via handler's getTimeoutForPath)
  router.post('/v1/messages', (req, res) => {
    proxyRequestHandler(req, res);
  });

  // Messages sub-path routes (e.g. count_tokens) — 120s timeout via handler
  router.post('/v1/messages/:path', (req, res) => {
    proxyRequestHandler(req, res);
  });

  // Catch-all dynamic proxy for all other Anthropic API endpoints
  router.all('/{*catchall}', (req, res) => {
    proxyRequestHandler(req, res);
  });

  return router;
}
