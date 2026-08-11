/**
 * Express server application entry point.
 * Mounts provider API routes at /furina/api/* and serves React SPA build output at /furina/ui/*.
 * @author Meiyuki <meiyukichan@163.com>
 * @copyright 2026 Meiyuki
 */

import * as express from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { providersRouter } from './routes/providers.js';
import { configRouter } from './routes/config.js';
import { scheduleRouter } from './routes/schedule.js';
import { createProxyRouter } from './anthropic/router.js';
import { mcpRouter } from './mcp/index.js';
import { changesRouter } from './changes/index.js';
// Resolve dist/client/ directory relative to the compiled output location.
// At runtime: dist/server/index.js -> ../client -> dist/client/
const moduleDirname = path.dirname(fileURLToPath(import.meta.url));
const defaultClientDir = path.join(moduleDirname, '..', 'client');

/**
 * Creates and configures the Express application.
 * Mounts provider CRUD routes at /furina/api/providers, the frontend SPA at /furina/ui,
 * and conditionally registers proxy routes at root level when enableFurinaProxy is true.
 * @param options - Optional configuration
 * @param options.clientDir - Path to the frontend build output directory.
 *   Defaults to dist/client/ relative to the package root.
 * @returns Configured Express application instance
 */
export function createApp(options?: { clientDir?: string; beforeProxy?: (app: express.Application) => void }): express.Application {
  const app = express.default();
  app.use(express.default.json({ limit: '50mb' }));

  // API routes
  app.use('/furina/api/providers', providersRouter);
  app.use('/furina/api/config', configRouter);
  app.use('/furina/api/schedule', scheduleRouter);
  app.use('/furina/api/changes', changesRouter);
  app.use('/furina/mcp', mcpRouter);

  // Resolve client directory
  const clientDir = options?.clientDir ?? defaultClientDir;

  // UI static files or missing-build message
  if (fs.existsSync(clientDir)) {
    app.use('/furina/ui', express.default.static(clientDir, { redirect: false }));
    // SPA fallback: serve index.html for any /furina/ui subpath not matching a static file
    app.use('/furina/ui', (_req, res) => {
      res.sendFile(path.join(clientDir, 'index.html'), { dotfiles: 'allow' });
    });
  } else {
    // Friendly message when the frontend has not been built yet
    const message = 'The UI needs to be built first. Please run the build command to generate the frontend assets.';
    app.use('/furina/ui', (_req, res) => {
      res.status(200).type('text/plain').send(message);
    });
  }

  // Hook for registering routes before the proxy catch-all intercepts all requests
  if (options?.beforeProxy) {
    options.beforeProxy(app);
  }

  // Proxy routes — always mounted; enabled/disabled checked per-request in the handler
  app.use(createProxyRouter());

  return app;
}
