/**
 * MCP marker service providing propose-phase boundary tools.
 * Mounted at /openpowers/mcp in createApp() before the proxy catch-all.
 * @author Meiyuki <meiyukichan@163.com>
 * @copyright 2026 Meiyuki
 */

import * as express from 'express';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { logger } from '../../utils/logger.js';

// ---------------------------------------------------------------------------
// Marker text constants
// ---------------------------------------------------------------------------

/** Text marker returned by the markBeginPropose tool. */
export const MARK_BEGIN_PROPOSE_TEXT =
  "[MARK_OPENPOWERS_PROPOSE_BEGIN]: ignore this message, this is just an MCP marker and has nothing to do with the user's needs.";

/** Text marker returned by the markEndPropose tool. */
export const MARK_END_PROPOSE_TEXT =
  "[MARK_OPENPOWERS_PROPOSE_END]: ignore this message, this is just an MCP marker and has nothing to do with the user's needs.";

// ---------------------------------------------------------------------------
// Tool handlers
// ---------------------------------------------------------------------------

/**
 * Handler for the markBeginPropose tool.
 * Returns a text marker indicating the start of the propose phase.
 * @returns Content array with the begin marker text
 */
export function handleMarkBeginPropose(): { content: Array<{ type: string; text: string }> } {
  return {
    content: [{ type: 'text', text: MARK_BEGIN_PROPOSE_TEXT }],
  };
}

/**
 * Handler for the markEndPropose tool.
 * Returns a text marker indicating the end of the propose phase.
 * @returns Content array with the end marker text
 */
export function handleMarkEndPropose(): { content: Array<{ type: string; text: string }> } {
  return {
    content: [{ type: 'text', text: MARK_END_PROPOSE_TEXT }],
  };
}

// ---------------------------------------------------------------------------
// MCP server factory
// ---------------------------------------------------------------------------

/**
 * Creates a new McpServer instance with marker tools registered.
 * Each request gets its own server instance (stateless mode) to comply
 * with CVE-2026-25536 fix: reusing server instances can cause
 * cross-client data leakage.
 * @returns A configured McpServer instance
 */
function createMcpServer(): McpServer {
  const server = new McpServer({
    name: 'openpowers-marker-service',
    version: '1.0.0',
  });

  server.tool('markBeginPropose', {}, handleMarkBeginPropose);
  server.tool('markEndPropose', {}, handleMarkEndPropose);

  return server;
}

// ---------------------------------------------------------------------------
// Express router
// ---------------------------------------------------------------------------

/** Express router handling MCP JSON-RPC requests via Streamable HTTP transport. */
export const mcpRouter: express.Router = express.default.Router();

/**
 * POST /
 * Handles MCP JSON-RPC requests. Creates a new server and transport per
 * request (stateless mode). The transport automatically processes the
 * JSON-RPC body, dispatches to the correct tool, and writes the response.
 */
mcpRouter.post('/', async (req, res) => {
  try {
    const server = createMcpServer();
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
    });
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (err) {
    logger.error(`MCP request failed: ${err instanceof Error ? err.message : String(err)}`);
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: '2.0',
        id: null,
        error: {
          code: -32603,
          message: 'Internal server error',
        },
      });
    }
  }
});
