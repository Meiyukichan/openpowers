/**
 * @fileoverview Core proxy forwarding handler for the Anthropic API proxy.
 * Handles auth injection, dual-layer stream detection, upstream forwarding,
 * and error handling.
 * @author Meiyuki <meiyukichan@163.com>
 * @copyright 2026 Meiyuki
 */

import axios from 'axios';
import type { Request, Response } from 'express';
import { HOP_BY_HOP_HEADERS, MESSAGES_TIMEOUT_MS, DEFAULT_TIMEOUT_MS } from './types.js';
import { getDefaultProvider, getEnableOpenpowersProxy } from '../providers-store.js';
import { proxyLogger } from './logger.js';

/**
 * Prepares the headers for forwarding to the upstream provider.
 * Replaces x-api-key and authorization with provider credentials,
 * and removes hop-by-hop headers.
 * @param incomingHeaders - Headers from the incoming client request
 * @param providerApiKey - The active provider's API key
 * @returns Modified headers ready for upstream forwarding
 */
export function prepareModifiedHeaders(
  incomingHeaders: Record<string, string | string[] | undefined>,
  providerApiKey: string,
): Record<string, string | string[] | undefined> {
  const headers: Record<string, string | string[] | undefined> = {};

  for (const [key, value] of Object.entries(incomingHeaders)) {
    const lowerKey = key.toLowerCase();
    if (HOP_BY_HOP_HEADERS.includes(lowerKey as typeof HOP_BY_HOP_HEADERS[number])) {
      continue;
    }
    headers[key] = value;
  }

  headers['x-api-key'] = providerApiKey;
  headers['authorization'] = `Bearer ${providerApiKey}`;

  return headers;
}

/**
 * Determines the upstream request timeout based on the request path.
 * /v1/messages gets 600s; all other paths get 120s.
 * @param reqPath - The incoming request path
 * @returns Timeout in milliseconds
 */
export function getTimeoutForPath(reqPath: string): number {
  // Strip query string for matching
  const pathOnly = reqPath.split('?')[0];
  if (pathOnly === '/v1/messages' || pathOnly.startsWith('/v1/messages/')) {
    return MESSAGES_TIMEOUT_MS;
  }
  return DEFAULT_TIMEOUT_MS;
}

/**
 * Detects whether the client request is a streaming request.
 * Layer 1: parses the JSON body and checks for stream === true.
 * Non-JSON (e.g. multipart/form-data) requests are treated as non-streaming.
 * @param contentType - The Content-Type header of the request
 * @param rawBody - The raw request body string
 * @returns true if the request should be treated as a stream
 */
export function detectStreamRequest(contentType: string | undefined, rawBody: string): boolean {
  if (!contentType || !contentType.startsWith('application/json')) {
    return false;
  }
  try {
    const parsed = JSON.parse(rawBody);
    return parsed.stream === true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Upstream response header copying
// ---------------------------------------------------------------------------

// Response headers to exclude when copying from upstream to client
const RESPONSE_HOP_BY_HOP_HEADERS = ['content-length', 'transfer-encoding'];

/**
 * Copies headers from the upstream response to the Express response,
 * excluding hop-by-hop headers that are connection-specific.
 * @param res - Express response object
 * @param upstreamHeaders - Headers from the upstream response
 */
function copyUpstreamHeaders(
  res: Response,
  upstreamHeaders: Record<string, string | string[] | undefined>,
): void {
  for (const [key, value] of Object.entries(upstreamHeaders)) {
    const lowerKey = key.toLowerCase();
    if (RESPONSE_HOP_BY_HOP_HEADERS.includes(lowerKey)) {
      continue;
    }
    if (value !== undefined) {
      res.setHeader(key, value as string | number | string[]);
    }
  }
}

// ---------------------------------------------------------------------------
// Main proxy request handler
// ---------------------------------------------------------------------------

/**
 * Express request handler for the Anthropic API proxy.
 * Validates provider configuration, prepares authenticated headers,
 * detects streaming, forwards the request to the upstream provider,
 * and handles all error scenarios.
 * @param req - Express Request object
 * @param res - Express Response object
 */
export async function proxyRequestHandler(req: Request, res: Response): Promise<void> {
  // Check if proxy is enabled
  if (!getEnableOpenpowersProxy()) {
    res.status(503).json({ error: 'OpenPowers proxy is disabled' });
    return;
  }

  // Load active provider
  const provider = getDefaultProvider();
  if (!provider) {
    res.status(503).json({ error: 'No active provider configured' });
    return;
  }

  // Validate provider configuration
  if (!provider.apiKey) {
    res.status(503).json({ error: 'Active provider is missing API key' });
    return;
  }
  if (!provider.baseUrl) {
    res.status(503).json({ error: 'Active provider is missing base URL' });
    return;
  }

  // Construct upstream URL
  const baseUrl = provider.baseUrl.replace(/\/+$/, '');
  const reqPath = req.path || req.url || '/';
  const upstreamUrl = `${baseUrl}${reqPath}`;

  // Prepare auth-injected headers
  const modifiedHeaders = prepareModifiedHeaders(req.headers, provider.apiKey);

  // Parse body for stream detection
  const contentType = req.headers['content-type'] as string | undefined;
  const rawBody = typeof req.body === 'string' ? req.body : JSON.stringify(req.body ?? '');

  let isStreamRequest = false;
  if (contentType && contentType.startsWith('application/json')) {
    try {
      JSON.parse(rawBody);
    } catch {
      res.status(400).json({ error: 'Invalid JSON in request body' });
      return;
    }
    isStreamRequest = detectStreamRequest(contentType, rawBody);
  }

  // Determine timeout
  const timeout = getTimeoutForPath(reqPath);

  // Build axios request config
  const config: Record<string, unknown> = {
    method: req.method,
    url: upstreamUrl,
    headers: modifiedHeaders,
    data: rawBody,
    timeout,
    validateStatus: () => true, // Accept all status codes for manual handling
  };

  if (isStreamRequest) {
    config.responseType = 'stream';
  }

  try {
    proxyLogger.info(`Proxying ${req.method} ${reqPath} -> ${upstreamUrl} (stream=${isStreamRequest})`);
    const upstreamRes = await axios(config);

    // Handle stream response
    if (isStreamRequest) {
      const upstreamContentType = (upstreamRes.headers['content-type'] || '') as string;

      if (upstreamContentType.includes('text/event-stream')) {
        // Layer 2: upstream returns SSE — pipe directly to client
        res.status(upstreamRes.status);
        copyUpstreamHeaders(res, upstreamRes.headers as Record<string, string | string[] | undefined>);

        const upstreamStream = upstreamRes.data;

        // Handle upstream stream errors
        upstreamStream.on('error', (err: Error) => {
          proxyLogger.error(`Upstream stream error: ${err.message}`);
          if (!res.headersSent) {
            res.end();
          }
        });

        // Handle client disconnect
        req.on('close', () => {
          if (typeof upstreamStream.destroy === 'function') {
            upstreamStream.destroy();
          }
        });

        upstreamStream.pipe(res);
        return;
      }

      // Layer 2: upstream returned non-SSE response — buffer and return as JSON
      const chunks: Buffer[] = [];
      const upstreamStream = upstreamRes.data;

      await new Promise<void>((resolve, reject) => {
        upstreamStream.on('data', (chunk: Buffer) => {
          chunks.push(chunk);
        });
        upstreamStream.on('end', () => {
          resolve();
        });
        upstreamStream.on('error', (err: Error) => {
          reject(err);
        });
      });

      const fullBody = Buffer.concat(chunks).toString('utf-8');
      res.status(upstreamRes.status);
      copyUpstreamHeaders(res, upstreamRes.headers as Record<string, string | string[] | undefined>);

      // Try to parse as JSON, fall back to raw text
      try {
        const jsonBody = JSON.parse(fullBody);
        res.json(jsonBody);
      } catch {
        res.setHeader('content-type', upstreamContentType || 'text/plain');
        res.send(fullBody);
      }
      return;
    }

    // Non-stream response: upstreamRes.data is already parsed as JSON (or text)
    res.status(upstreamRes.status);
    copyUpstreamHeaders(res, upstreamRes.headers as Record<string, string | string[] | undefined>);

    // If the upstream data is a string (non-JSON), send it as text
    if (typeof upstreamRes.data === 'string') {
      res.send(upstreamRes.data);
    } else {
      res.json(upstreamRes.data);
    }
  } catch (err: unknown) {
    handleAxiosError(err, res);
  }
}

// ---------------------------------------------------------------------------
// Error handling helpers
// ---------------------------------------------------------------------------

/**
 * Handles errors from the axios upstream call.
 * Connection/timeout errors → 502.
 * Upstream HTTP errors (4xx/5xx) → forwarded as-is.
 * @param err - The catched error
 * @param res - Express Response object
 */
function handleAxiosError(err: unknown, res: Response): void {
  // Check for axios error with a response (upstream returned HTTP error)
  if (err && typeof err === 'object' && 'isAxiosError' in err && 'response' in err) {
    const axiosErr = err as { response?: { status: number; data: unknown; headers: Record<string, string | string[] | undefined> } };
    if (axiosErr.response) {
      const upstreamStatus = axiosErr.response.status;
      proxyLogger.warn(`Upstream returned ${upstreamStatus}`);
      res.status(upstreamStatus);
      copyUpstreamHeaders(res, axiosErr.response.headers);
      if (typeof axiosErr.response.data === 'string') {
        try {
          res.json(JSON.parse(axiosErr.response.data));
        } catch {
          res.send(axiosErr.response.data);
        }
      } else {
        res.json(axiosErr.response.data);
      }
      return;
    }
  }

  // Connection or timeout error
  const message = err instanceof Error ? err.message : String(err);
  const code = (err as NodeJS.ErrnoException).code;

  if (code === 'ECONNREFUSED') {
    proxyLogger.error(`Upstream connection refused: ${message}`);
  } else if (code === 'ETIMEDOUT') {
    proxyLogger.error(`Upstream timeout: ${message}`);
  } else {
    proxyLogger.error(`Upstream request error: ${message}`);
  }

  res.status(502).json({ error: 'Bad Gateway', message });
}
