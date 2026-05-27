/**
 * @fileoverview Express router for Anthropic API proxy routes.
 * Registers health check, dedicated /v1/messages routes, and catch-all proxy.
 * @author Meiyuki <meiyukichan@163.com>
 * @copyright 2026 Meiyuki
 */

import * as express from 'express';
import { proxyRequestHandler } from './handler.js';
import { proxyLogger } from './logger.js';

/**
 * Options object for logRequest, grouping all logging parameters.
 * Required: providerHost, method, url, status.
 * Optional: providerModel, clientModel, errorMsg, logger.
 * Logger type supports both info() and error() for status-based log level selection.
 */
export interface LogRequestOptions {
  providerHost: string;
  method: string;
  url: string;
  status: number;
  providerModel?: string;
  clientModel?: string;
  errorMsg?: string;
  logger?: { info: (msg: string) => void; error: (msg: string) => void };
}

/**
 * Express status code + phrase mapping for logging.
 */
const STATUS_PHRASES: Record<number, string> = {
  200: 'OK',
  400: 'Bad Request',
  401: 'Unauthorized',
  403: 'Forbidden',
  404: 'Not Found',
  500: 'Internal Server Error',
  502: 'Bad Gateway',
  503: 'Service Unavailable',
  504: 'Gateway Timeout',
};

/**
 * Logs a request/response entry in uvicorn-like format, using provider host instead of client IP.
 * Uses logger.info() for status < 400 and logger.error() for status >= 400.
 * @param options - The LogRequestOptions object containing all logging parameters
 */
export function logRequest(options: LogRequestOptions): void {
  const { providerHost, method, url, status, providerModel, clientModel, errorMsg, logger } = options;
  const phrase = STATUS_PHRASES[status] || '';
  const hostPart = providerModel ? `${providerHost}:${providerModel}` : providerHost;
  const methodPart = clientModel ? `${clientModel}:${method}` : method;
  const entry = errorMsg
    ? `${hostPart} - "${methodPart} ${url} HTTP/1.1" ${status} ${phrase} - ${errorMsg}`
    : `${hostPart} - "${methodPart} ${url} HTTP/1.1" ${status} ${phrase}`;
  const activeLogger = logger || proxyLogger;
  if (status < 400) {
    activeLogger.info(entry);
  } else {
    activeLogger.error(entry);
  }
}

/**
 * Creates and returns an Express Router with all proxy route handlers.
 * Routes use absolute paths and must be mounted at root (/).
 * @returns Configured Express Router instance
 */
export function createProxyRouter(): express.Router {
  const router = express.default.Router({ mergeParams: true });

  // Health check
  router.head('/', (_req, res) => {
    res.sendStatus(200);
    logRequest({ providerHost: '-', method: 'HEAD', url: '/', status: 200 });
  });

  // Error handler
  router.use((err: Error, req: express.Request, res: express.Response, _next: express.NextFunction) => {
    proxyLogger.error(`${err.message}`);
    res.status(500).json({ error: 'Internal Server Error', message: err.message });
  });

  // Dedicated Messages API route (600s timeout via handler's getTimeoutForPath)
  router.post('/v1/messages', (req, res) => {
    proxyRequestHandler(req, res, (options) => logRequest(options));
  });

  // Messages sub-path routes (e.g. count_tokens) — 120s timeout via handler
  router.post('/v1/messages/:path', (req, res) => {
    proxyRequestHandler(req, res, (options) => logRequest(options));
  });

  // Catch-all dynamic proxy for all other Anthropic API endpoints
  router.all('/{*catchall}', (req, res) => {
    proxyRequestHandler(req, res, (options) => logRequest(options));
  });

  return router;
}
