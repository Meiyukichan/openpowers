/**
 * @fileoverview Shared type definitions and constants for the Anthropic proxy.
 * @author Meiyuki <meiyukichan@163.com>
 * @copyright 2026 Meiyuki
 */

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

// Timeout for /v1/messages route (Anthropic Messages API)
export const MESSAGES_TIMEOUT_MS = 600_000;

// Timeout for all other proxied routes
export const DEFAULT_TIMEOUT_MS = 120_000;

// Hop-by-hop headers removed from forwarded requests
export const HOP_BY_HOP_HEADERS = ['host', 'content-length', 'transfer-encoding'] as const;

