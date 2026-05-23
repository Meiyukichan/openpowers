/**
 * @fileoverview Core proxy forwarding handler for the Anthropic API proxy.
 * Handles auth injection, dual-layer stream detection, upstream forwarding,
 * and error handling.
 * @author Meiyuki <meiyukichan@163.com>
 * @copyright 2026 Meiyuki
 */

import axios, { type AxiosRequestConfig } from 'axios';
import type { Request, Response } from 'express';
import { HOP_BY_HOP_HEADERS, MESSAGES_TIMEOUT_MS, DEFAULT_TIMEOUT_MS } from './types.js';
import { getDefaultProvider, getEnableOpenpowersProxy, type Provider } from '../providers-store.js';
import { proxyLogger, createSessionLogger } from './logger.js';
import { getProviderBySessionId } from '../../utils/session.js';

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
 * Exact /v1/messages gets 600s; all other paths (including /v1/messages/:path) get 120s.
 * @param reqPath - The incoming request path
 * @returns Timeout in milliseconds
 */
export function getTimeoutForPath(reqPath: string): number {
  // Strip query string for matching
  const pathOnly = reqPath.split('?')[0];
  if (pathOnly === '/v1/messages') {
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
// Model mapping
// ---------------------------------------------------------------------------

/**
 * Maps a client model name to a provider-specific model name using
 * case-insensitive keyword matching.
 * @param model - The original model name from the client request
 * @param provider - The target provider configuration
 * @returns The mapped provider model name, or the original model if the target is empty
 */
export function mapModel(model: string, provider: Provider): string {
  const modelLower = model.toLowerCase();
  const defaultModel = provider.defaultModel || model;
  if (modelLower.includes('haiku')) {
    return provider.haikuModel || defaultModel;
  }
  if (modelLower.includes('opus')) {
    return provider.opusModel || defaultModel;
  }
  if (modelLower.includes('sonnet')) {
    return provider.sonnetModel || defaultModel;
  }
  return defaultModel;
}

// ---------------------------------------------------------------------------
// Main proxy request handler
// ---------------------------------------------------------------------------

/**
 * Express request handler for the Anthropic API proxy.
 * Validates provider configuration, extracts session metadata from body,
 * resolves session-level provider when available, prepares authenticated
 * headers, detects streaming, maps model names using the active provider,
 * forwards the request to the upstream provider, and handles all error
 * scenarios with the appropriate logger (session or global).
 * @param req - Express Request object
 * @param res - Express Response object
 */
export async function proxyRequestHandler(
  req: Request,
  res: Response,
  onResponse?: (host: string, method: string, url: string, status: number, providerModel?: string, clientModel?: string, errorMsg?: string) => void,
): Promise<void> {
  // Check if proxy is enabled
  if (!getEnableOpenpowersProxy()) {
    res.status(503).json({ error: 'OpenPowers proxy is disabled' });
    return;
  }

  // Load default provider (may be overridden by session provider)
  const defaultProvider = getDefaultProvider();
  if (!defaultProvider) {
    res.status(503).json({ error: 'No active provider configured' });
    return;
  }

  // Parse body and extract session metadata before resolving final provider
  const contentType = req.headers['content-type'] as string | undefined;
  let rawBody = typeof req.body === 'string' ? req.body : JSON.stringify(req.body ?? '');

  let isStreamRequest = false;
  let clientModel: string | undefined;
  let providerModel: string | undefined;
  let sessionId: string | undefined;
  if (contentType && contentType.startsWith('application/json')) {
    let parsedBody: Record<string, unknown> | null = null;
    try {
      parsedBody = JSON.parse(rawBody);
    } catch {
      res.status(400).json({ error: 'Invalid JSON in request body' });
      return;
    }
    isStreamRequest = detectStreamRequest(contentType, rawBody);

    // Extract session_id from metadata.user_id (JSON string)
    if (parsedBody?.metadata) {
      const metadata = parsedBody.metadata as Record<string, unknown>;
      if (typeof metadata.user_id === 'string') {
        try {
          const userId = JSON.parse(metadata.user_id) as Record<string, unknown>;
          if (typeof userId.session_id === 'string') {
            sessionId = userId.session_id;
          }
        } catch {
          // Silent fallback: invalid JSON in user_id
        }
      }
    }

    // Store client model before provider resolution for later model mapping
    if (parsedBody?.model) {
      clientModel = parsedBody.model as string;
    }
  }

  // Resolve provider: use session provider if session_id is present and valid
  let provider: Provider = defaultProvider;
  let activeLogger = proxyLogger;
  if (sessionId) {
    const sessionProvider = getProviderBySessionId(sessionId);
    if (sessionProvider) {
      provider = sessionProvider;
      activeLogger = createSessionLogger(sessionId);
    }
  }

  // Validate final provider configuration
  if (!provider.apiKey) {
    res.status(503).json({ error: 'Active provider is missing API key' });
    return;
  }
  if (!provider.baseUrl) {
    res.status(503).json({ error: 'Active provider is missing base URL' });
    return;
  }

  const providerHost = provider.baseUrl.replace(/\/+$/, '').replace('https://', '').replace('http://', '');

  // Construct upstream URL
  const baseUrl = provider.baseUrl.replace(/\/+$/, '');
  const reqPath = req.originalUrl || req.url || '/';
  const upstreamUrl = `${baseUrl}${reqPath}`;

  // Prepare auth-injected headers
  const modifiedHeaders = prepareModifiedHeaders(req.headers, provider.apiKey);

  // Apply model replacement for JSON requests using the resolved provider
  if (contentType && contentType.startsWith('application/json') && clientModel) {
    const parsedBody = JSON.parse(rawBody);
    parsedBody.model = mapModel(clientModel, provider);
    providerModel = parsedBody.model as string;
    rawBody = JSON.stringify(parsedBody);
  }

  // Determine timeout
  const timeout = getTimeoutForPath(reqPath);

  // Build axios request config
  const config: AxiosRequestConfig = {
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
          activeLogger.error(`Upstream stream error: ${err.message}`);
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
        res.on('finish', () => onResponse?.(providerHost, req.method, reqPath, upstreamRes.status, providerModel, clientModel));
        return;
      }

      // Layer 2: upstream returned non-SSE response — buffer and return as JSON
      const chunks: Buffer[] = [];
      const upstreamStream = upstreamRes.data;

      // Handle client disconnect
      req.on('close', () => {
        if (typeof upstreamStream.destroy === 'function') {
          upstreamStream.destroy();
        }
      });

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
      onResponse?.(providerHost, req.method, reqPath, upstreamRes.status, providerModel, clientModel);

      // Log non-2xx responses with error details
      if (upstreamRes.status < 200 || upstreamRes.status >= 300) {
        activeLogger.warn(`Upstream returned ${upstreamRes.status}: ${fullBody} | request body: ${rawBody}`);
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
    res.on('finish', () => onResponse?.(providerHost, req.method, reqPath, upstreamRes.status, providerModel, clientModel));

    // Log non-2xx responses with error details
    if (upstreamRes.status < 200 || upstreamRes.status >= 300) {
      activeLogger.warn(`Upstream returned ${upstreamRes.status}: ${JSON.stringify(upstreamRes.data)} | request body: ${rawBody}`);
    }
  } catch (err: unknown) {
    handleAxiosError(err, res, providerHost, req.method, reqPath, activeLogger, onResponse, providerModel, clientModel);
  }
}

// ---------------------------------------------------------------------------
// Error handling helpers
// ---------------------------------------------------------------------------

/**
 * Handles errors from the axios upstream call.
 * Connection/timeout errors → 502.
 * Upstream HTTP errors (4xx/5xx) → forwarded as-is.
 * @param err - The caught error
 * @param res - Express Response object
 * @param logger - The active logger instance (session or global)
 */
function handleAxiosError(
  err: unknown,
  res: Response,
  providerHost: string,
  method: string,
  reqPath: string,
  logger: { error: (msg: string) => void; warn: (msg: string) => void },
  onResponse?: (host: string, method: string, url: string, status: number, providerModel?: string, clientModel?: string, errorMsg?: string) => void,
  providerModel?: string,
  clientModel?: string,
): void {
  // Check for axios error with a response (upstream returned HTTP error)
  if (axios.isAxiosError(err) && err.response) {
    const upstreamStatus = err.response.status;
    logger.warn(`Upstream returned ${upstreamStatus}: ${JSON.stringify(err.response.data)}`);
    res.status(upstreamStatus);
    if (err.response.headers) {
      copyUpstreamHeaders(res, err.response.headers as Record<string, string | string[] | undefined>);
    }
    if (typeof err.response.data === 'string') {
      try {
        res.json(JSON.parse(err.response.data));
      } catch {
        res.send(err.response.data);
      }
    } else {
      res.json(err.response.data);
    }
    onResponse?.(providerHost, method, reqPath, upstreamStatus, providerModel, clientModel);
    return;
  }

  // Connection or timeout error
  const message = err instanceof Error ? err.message : String(err);
  const code = (err as NodeJS.ErrnoException).code;
  let errorMsg = message;

  if (code === 'ECONNREFUSED') {
    logger.error(`Upstream connection refused: ${message}`);
    errorMsg = `Connection refused: ${message}`;
  } else if (code === 'ETIMEDOUT') {
    logger.error(`Upstream timeout: ${message}`);
    errorMsg = `Request timeout: ${message}`;
  } else {
    logger.error(`Upstream request error: ${message}`);
    errorMsg = `Request error: ${message}`;
  }

  res.status(502).json({ error: 'Bad Gateway', message });
  onResponse?.(providerHost, method, reqPath, 502, providerModel, clientModel, errorMsg);
}
