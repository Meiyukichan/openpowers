/**
 * @fileoverview Shared type definitions and constants for the Anthropic proxy.
 * @author Meiyuki <meiyukichan@163.com>
 * @copyright 2026 Meiyuki
 */

import type { Request } from 'express';
import type { Provider } from '../providers-store.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

// Timeout for /v1/messages route (Anthropic Messages API)
export const MESSAGES_TIMEOUT_MS = 600_000;

// Timeout for all other proxied routes
export const DEFAULT_TIMEOUT_MS = 120_000;

// Hop-by-hop headers removed from forwarded requests
export const HOP_BY_HOP_HEADERS = ['host', 'content-length', 'transfer-encoding'] as const;

// Hop-by-hop header type
export type HopByHopHeader = (typeof HOP_BY_HOP_HEADERS)[number];

// Auth headers that are replaced with provider credentials
export const AUTH_HEADER_X_API_KEY = 'x-api-key';
export const AUTH_HEADER_AUTHORIZATION = 'authorization';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Context assembled at request time for proxy forwarding decisions. */
export interface ProxyContext {
  provider: Provider;
  upstreamUrl: string;
  modifiedHeaders: Record<string, string | string[] | undefined>;
  timeout: number;
  isStreamRequest: boolean;
  parsedBody: string;
}

/** Result of preparing the proxy request context from an Express request. */
export interface PreparedProxyRequest {
  context: ProxyContext;
  method: string;
  params: Record<string, string>;
}
