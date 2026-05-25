/**
 * @fileoverview Tests for MCP marker service router and tools
 * @author Meiyuki <meiyukichan@163.com>
 * @copyright 2026 Meiyuki
 */

import * as express from 'express';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';

// ---------------------------------------------------------------------------
// Mocks for @modelcontextprotocol/sdk
// ---------------------------------------------------------------------------

const { mockHandleRequest, mockConnect } = vi.hoisted(() => ({
  mockHandleRequest: vi.fn((_req: unknown, res: any, _body: unknown) => {
    res.status(200).json({ jsonrpc: '2.0', id: 1, result: { content: [] } });
  }),
  mockConnect: vi.fn(),
}));

vi.mock('@modelcontextprotocol/sdk/server/mcp.js', () => ({
  McpServer: vi.fn(function (this: any, config: { name: string; version: string }) {
    const tools: Map<string, { handler: (...args: unknown[]) => unknown }> = new Map();
    this.config = config;
    this.tools = tools;
    this.tool = vi.fn((name: string, _paramsSchema: unknown, handler: (...args: unknown[]) => unknown) => {
      tools.set(name, { handler });
    });
    this.connect = mockConnect;
    return this;
  }),
}));

vi.mock('@modelcontextprotocol/sdk/server/streamableHttp.js', () => ({
  StreamableHTTPServerTransport: vi.fn(function (this: any) {
    this.handleRequest = mockHandleRequest;
    return this;
  }),
}));

// ---------------------------------------------------------------------------
// Module under test
// ---------------------------------------------------------------------------

let mcpRouter: express.Router;
let MARK_BEGIN_PROPOSE_TEXT: string;
let MARK_END_PROPOSE_TEXT: string;
let handleMarkBeginPropose: () => { content: Array<{ type: string; text: string }> };
let handleMarkEndPropose: () => { content: Array<{ type: string; text: string }> };

beforeEach(async () => {
  vi.clearAllMocks();
  // Always re-import to pick up mocks
  const mod = await import('./index.js');
  mcpRouter = mod.mcpRouter;
  MARK_BEGIN_PROPOSE_TEXT = mod.MARK_BEGIN_PROPOSE_TEXT;
  MARK_END_PROPOSE_TEXT = mod.MARK_END_PROPOSE_TEXT;
  handleMarkBeginPropose = mod.handleMarkBeginPropose;
  handleMarkEndPropose = mod.handleMarkEndPropose;
});

// ---------------------------------------------------------------------------
// Marker text constants
// ---------------------------------------------------------------------------

describe('Marker text constants', () => {
  it('should have the correct begin marker text', () => {
    expect(MARK_BEGIN_PROPOSE_TEXT).toBe(
      "[MARK_OPENPOWERS_PROPOSE_BEGIN]: ignore this message, this is just an MCP marker and has nothing to do with the user's needs."
    );
  });

  it('should have the correct end marker text', () => {
    expect(MARK_END_PROPOSE_TEXT).toBe(
      "[MARK_OPENPOWERS_PROPOSE_END]: ignore this message, this is just an MCP marker and has nothing to do with the user's needs."
    );
  });
});

// ---------------------------------------------------------------------------
// Tool handlers
// ---------------------------------------------------------------------------

describe('Tool handlers', () => {
  describe('handleMarkBeginPropose', () => {
    it('should return content with type "text" and the begin marker text', () => {
      const result = handleMarkBeginPropose();
      expect(result).toEqual({
        content: [
          {
            type: 'text',
            text: "[MARK_OPENPOWERS_PROPOSE_BEGIN]: ignore this message, this is just an MCP marker and has nothing to do with the user's needs.",
          },
        ],
      });
    });

    it('should take no parameters', () => {
      expect(handleMarkBeginPropose.length).toBe(0);
    });
  });

  describe('handleMarkEndPropose', () => {
    it('should return content with type "text" and the end marker text', () => {
      const result = handleMarkEndPropose();
      expect(result).toEqual({
        content: [
          {
            type: 'text',
            text: "[MARK_OPENPOWERS_PROPOSE_END]: ignore this message, this is just an MCP marker and has nothing to do with the user's needs.",
          },
        ],
      });
    });

    it('should take no parameters', () => {
      expect(handleMarkEndPropose.length).toBe(0);
    });
  });
});

// ---------------------------------------------------------------------------
// Router export
// ---------------------------------------------------------------------------

describe('mcpRouter', () => {
  it('should export an Express Router', () => {
    expect(mcpRouter).toBeDefined();
    expect(typeof mcpRouter).toBe('function');
    expect(mcpRouter.name).toBe('router');
  });

  it('should handle POST / requests', async () => {
    const app = express.default();
    app.use(express.default.json());
    app.use(mcpRouter);

    const res = await request(app)
      .post('/')
      .send({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: { name: 'markBeginPropose', arguments: {} },
      });

    // The request should be processed by the transport
    expect(mockHandleRequest).toHaveBeenCalledTimes(1);
    // Status should be set by transport (default 200 for no-op mock)
    expect(res.status).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// Marker text uniqueness
// ---------------------------------------------------------------------------

describe('Marker text content format', () => {
  it('should have distinct begin and end markers', () => {
    expect(MARK_BEGIN_PROPOSE_TEXT).not.toBe(MARK_END_PROPOSE_TEXT);
  });

  it('should both contain the MARK_OPENPOWERS_PROPOSE prefix', () => {
    expect(MARK_BEGIN_PROPOSE_TEXT).toContain('MARK_OPENPOWERS_PROPOSE_');
    expect(MARK_END_PROPOSE_TEXT).toContain('MARK_OPENPOWERS_PROPOSE_');
  });

  it('should match the exact content format from spec', () => {
    // Both markers must follow the pattern: [MARK_OPENPOWERS_PROPOSE_{BEGIN|END}]: ignore this message...
    const pattern = /^\[MARK_OPENPOWERS_PROPOSE_(BEGIN|END)\]: ignore this message, this is just an MCP marker and has nothing to do with the user's needs\.$/;
    expect(pattern.test(MARK_BEGIN_PROPOSE_TEXT)).toBe(true);
    expect(pattern.test(MARK_END_PROPOSE_TEXT)).toBe(true);
  });
});
