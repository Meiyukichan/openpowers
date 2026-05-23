/**
 * @fileoverview Tests for the Anthropic proxy handler.
 * @author Meiyuki <meiyukichan@163.com>
 * @copyright 2026 Meiyuki
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { prepareModifiedHeaders, getTimeoutForPath, detectStreamRequest, proxyRequestHandler } from './handler.js';
import type { Request, Response } from 'express';

// ---------------------------------------------------------------------------
// Mocks for main handler dependencies
// ---------------------------------------------------------------------------

const {
  axiosMock,
  getDefaultProviderMock,
  getEnableOpenpowersProxyMock,
  proxyLoggerMock,
} = vi.hoisted(() => ({
  axiosMock: vi.fn(),
  getDefaultProviderMock: vi.fn(),
  getEnableOpenpowersProxyMock: vi.fn(),
  proxyLoggerMock: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('axios', () => ({
  default: axiosMock,
}));

vi.mock('../providers-store.js', () => ({
  getDefaultProvider: getDefaultProviderMock,
  getEnableOpenpowersProxy: getEnableOpenpowersProxyMock,
}));

vi.mock('./logger.js', () => ({
  proxyLogger: proxyLoggerMock,
}));

// ---------------------------------------------------------------------------
// Helpers for creating mock Express Request / Response
// ---------------------------------------------------------------------------

interface MockResponse extends Partial<Response> {
  statusCode: number;
  body: unknown;
  headers: Record<string, string>;
  _status: number;
  _headersSent: boolean;
}

function createMockReq(overrides?: Partial<Request>): Request {
  return {
    method: 'POST',
    path: '/v1/messages',
    url: '/v1/messages',
    headers: {
      'content-type': 'application/json',
      'x-api-key': 'client-key',
    },
    body: JSON.stringify({ model: 'claude-sonnet', max_tokens: 100, messages: [] }),
    query: {},
    on: vi.fn(),
    ...overrides,
  } as unknown as Request;
}

function createMockRes(): MockResponse {
  const res: MockResponse = {
    statusCode: 200,
    body: null,
    headers: {},
    _status: 200,
    _headersSent: false,
    status(code: number) {
      this._status = code;
      return this as unknown as Response;
    },
    setHeader(name: string, value: string | number | string[]) {
      this.headers[name] = String(value);
      return this as unknown as Response;
    },
    json(data: unknown) {
      this.body = data;
      this._headersSent = true;
      return this as unknown as Response;
    },
    send(data: unknown) {
      this.body = data;
      this._headersSent = true;
      return this as unknown as Response;
    },
    end() {
      this._headersSent = true;
      return this as unknown as Response;
    },
    pipe: vi.fn(),
    on: vi.fn(),
    headersSent: false,
  };
  return res;
}

/** Create a mock axios response with a JSON body. */
function mockAxiosJson(status: number, data: unknown, headers?: Record<string, string>) {
  axiosMock.mockResolvedValue({
    status,
    data,
    headers: headers ?? { 'content-type': 'application/json' },
  });
}

/** Create a mock axios stream response. */
function mockAxiosStream(status: number, headers: Record<string, string>) {
  const streamData: { on: ReturnType<typeof vi.fn>; pipe: ReturnType<typeof vi.fn> } = {
    on: vi.fn(),
    pipe: vi.fn(),
  };
  axiosMock.mockResolvedValue({
    status,
    data: streamData,
    headers,
  });
  return streamData;
}

/** Configure a provider mock that the handler can use. */
function setupProvider(baseUrl = 'https://api.anthropic.com', apiKey = 'sk-test-key') {
  getEnableOpenpowersProxyMock.mockReturnValue(true);
  getDefaultProviderMock.mockReturnValue({
    id: 'test-provider',
    name: 'Test Provider',
    apiKey,
    baseUrl,
    defaultModel: '',
    sonnetModel: '',
    opusModel: '',
    haikuModel: '',
    createdAt: new Date().toISOString(),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// prepareModifiedHeaders
// ---------------------------------------------------------------------------

describe('prepareModifiedHeaders', () => {
  it('replaces x-api-key with provider apiKey', () => {
    const incoming = {
      'x-api-key': 'client-key-12345',
      'content-type': 'application/json',
    };
    const result = prepareModifiedHeaders(incoming, 'provider-key-abc');
    expect(result['x-api-key']).toBe('provider-key-abc');
  });

  it('adds x-api-key when not present in original request', () => {
    const incoming = {
      'content-type': 'application/json',
    };
    const result = prepareModifiedHeaders(incoming, 'provider-key-abc');
    expect(result['x-api-key']).toBe('provider-key-abc');
  });

  it('replaces authorization with Bearer token', () => {
    const incoming = {
      authorization: 'Bearer old-token',
      'content-type': 'application/json',
    };
    const result = prepareModifiedHeaders(incoming, 'provider-key-abc');
    expect(result['authorization']).toBe('Bearer provider-key-abc');
  });

  it('adds authorization when not present in original request', () => {
    const incoming = {
      'content-type': 'application/json',
    };
    const result = prepareModifiedHeaders(incoming, 'provider-key-abc');
    expect(result['authorization']).toBe('Bearer provider-key-abc');
  });

  it('removes hop-by-hop headers: host', () => {
    const incoming = {
      host: 'localhost:3939',
      'content-type': 'application/json',
    };
    const result = prepareModifiedHeaders(incoming, 'provider-key');
    expect(result).not.toHaveProperty('host');
  });

  it('removes hop-by-hop headers: content-length', () => {
    const incoming = {
      'content-length': '512',
      'content-type': 'application/json',
    };
    const result = prepareModifiedHeaders(incoming, 'provider-key');
    expect(result).not.toHaveProperty('content-length');
  });

  it('removes hop-by-hop headers: transfer-encoding', () => {
    const incoming = {
      'transfer-encoding': 'chunked',
      'content-type': 'application/json',
    };
    const result = prepareModifiedHeaders(incoming, 'provider-key');
    expect(result).not.toHaveProperty('transfer-encoding');
  });

  it('preserves passthrough headers like anthropic-version', () => {
    const incoming = {
      'anthropic-version': '2023-06-01',
      'anthropic-beta': 'messages-2023-12-15',
      'content-type': 'application/json',
      'user-agent': 'test-agent',
    };
    const result = prepareModifiedHeaders(incoming, 'provider-key');
    expect(result['anthropic-version']).toBe('2023-06-01');
    expect(result['anthropic-beta']).toBe('messages-2023-12-15');
    expect(result['content-type']).toBe('application/json');
    expect(result['user-agent']).toBe('test-agent');
  });

  it('handles case-insensitive header matching for removal', () => {
    const incoming = {
      Host: 'localhost:3939',
      'Content-Length': '512',
      'Transfer-Encoding': 'chunked',
      'Content-Type': 'application/json',
    };
    const result = prepareModifiedHeaders(incoming, 'provider-key');
    expect(result).not.toHaveProperty('Host');
    expect(result).not.toHaveProperty('Content-Length');
    expect(result).not.toHaveProperty('Transfer-Encoding');
    expect(result['Content-Type']).toBe('application/json');
  });
});

// ---------------------------------------------------------------------------
// getTimeoutForPath
// ---------------------------------------------------------------------------

describe('getTimeoutForPath', () => {
  it('returns 600s for /v1/messages', () => {
    expect(getTimeoutForPath('/v1/messages')).toBe(600_000);
  });

  it('returns 600s for /v1/messages with query string', () => {
    expect(getTimeoutForPath('/v1/messages?beta=true')).toBe(600_000);
  });

  it('returns 120s for /v1/models', () => {
    expect(getTimeoutForPath('/v1/models')).toBe(120_000);
  });

  it('returns 120s for root path', () => {
    expect(getTimeoutForPath('/')).toBe(120_000);
  });

  it('returns 120s for arbitrary path', () => {
    expect(getTimeoutForPath('/some/other/path')).toBe(120_000);
  });
});

// ---------------------------------------------------------------------------
// detectStreamRequest
// ---------------------------------------------------------------------------

describe('detectStreamRequest', () => {
  it('returns true when body contains stream: true', () => {
    const body = JSON.stringify({ model: 'claude-sonnet', stream: true });
    expect(detectStreamRequest('application/json', body)).toBe(true);
  });

  it('returns false when body contains stream: false', () => {
    const body = JSON.stringify({ model: 'claude-sonnet', stream: false });
    expect(detectStreamRequest('application/json', body)).toBe(false);
  });

  it('returns false when body has no stream field', () => {
    const body = JSON.stringify({ model: 'claude-sonnet' });
    expect(detectStreamRequest('application/json', body)).toBe(false);
  });

  it('returns false for multipart/form-data content type', () => {
    const body = JSON.stringify({ stream: true });
    expect(detectStreamRequest('multipart/form-data; boundary=abc', body)).toBe(false);
  });

  it('returns false for empty content type', () => {
    const body = JSON.stringify({ stream: true });
    expect(detectStreamRequest('', body)).toBe(false);
  });

  it('returns false when content-type does not start with application/json', () => {
    const body = JSON.stringify({ stream: true });
    expect(detectStreamRequest('text/plain', body)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// proxyRequestHandler — main handler integration tests
// ---------------------------------------------------------------------------

describe('proxyRequestHandler', () => {
  describe('pre-request validation', () => {
    it('returns 503 when proxy is disabled', async () => {
      getEnableOpenpowersProxyMock.mockReturnValue(false);
      const req = createMockReq();
      const res = createMockRes();

      await proxyRequestHandler(req, res as unknown as Response);

      expect(res._status).toBe(503);
      expect(res.body).toEqual({ error: 'OpenPowers proxy is disabled' });
    });

    it('returns 503 when no active provider is configured', async () => {
      getEnableOpenpowersProxyMock.mockReturnValue(true);
      getDefaultProviderMock.mockReturnValue(null);
      const req = createMockReq();
      const res = createMockRes();

      await proxyRequestHandler(req, res as unknown as Response);

      expect(res._status).toBe(503);
      expect(res.body).toEqual({ error: 'No active provider configured' });
    });

    it('returns 503 when provider has no apiKey', async () => {
      setupProvider('https://api.anthropic.com', '');
      const req = createMockReq();
      const res = createMockRes();

      await proxyRequestHandler(req, res as unknown as Response);

      expect(res._status).toBe(503);
      expect(res.body).toEqual({ error: 'Active provider is missing API key' });
    });

    it('returns 503 when provider has no baseUrl', async () => {
      setupProvider('', 'sk-test-key');
      const req = createMockReq();
      const res = createMockRes();

      await proxyRequestHandler(req, res as unknown as Response);

      expect(res._status).toBe(503);
      expect(res.body).toEqual({ error: 'Active provider is missing base URL' });
    });
  });

  describe('body parsing', () => {
    it('returns 400 for invalid JSON body with application/json content-type', async () => {
      setupProvider();
      const req = createMockReq({
        headers: { 'content-type': 'application/json' },
        body: 'not-valid-json{{{',
      });
      const res = createMockRes();

      await proxyRequestHandler(req, res as unknown as Response);

      expect(res._status).toBe(400);
      expect(res.body).toHaveProperty('error');
      expect((res.body as Record<string, unknown>).error).toContain('Invalid JSON');
    });
  });

  describe('non-stream forwarding', () => {
    it('forwards non-stream request and returns JSON response', async () => {
      setupProvider();
      mockAxiosJson(200, { id: 'msg_123', content: [{ text: 'Hello' }] });
      const req = createMockReq({
        body: JSON.stringify({ model: 'claude-sonnet', stream: false, messages: [] }),
      });
      const res = createMockRes();

      await proxyRequestHandler(req, res as unknown as Response);

      expect(res._status).toBe(200);
      expect(res.body).toEqual({ id: 'msg_123', content: [{ text: 'Hello' }] });
      expect(axiosMock).toHaveBeenCalledTimes(1);
    });

    it('forwards non-JSON upstream response as text', async () => {
      setupProvider();
      axiosMock.mockResolvedValue({
        status: 200,
        data: 'plain text response',
        headers: { 'content-type': 'text/plain' },
      });
      const req = createMockReq({
        body: JSON.stringify({ model: 'claude-sonnet', stream: false, messages: [] }),
      });
      const res = createMockRes();

      await proxyRequestHandler(req, res as unknown as Response);

      expect(res._status).toBe(200);
      expect(res.body).toBe('plain text response');
    });
  });

  describe('stream forwarding', () => {
    it('pipes SSE stream to client when upstream returns text/event-stream', async () => {
      setupProvider();
      const streamObj = mockAxiosStream(200, { 'content-type': 'text/event-stream' });
      const req = createMockReq({
        body: JSON.stringify({ model: 'claude-sonnet', stream: true, messages: [] }),
      });
      const res = createMockRes();

      await proxyRequestHandler(req, res as unknown as Response);

      expect(res._status).toBe(200);
      expect(streamObj.pipe).toHaveBeenCalledWith(res);
    });

    it('buffers stream response when upstream returns non-SSE content-type', async () => {
      setupProvider();
      const streamObj = mockAxiosStream(200, { 'content-type': 'application/json' });
      // Simulate stream emitting data, then end
      const chunks = [Buffer.from('{"id":"msg_456"}')];
      let dataHandler: (chunk: Buffer) => void;
      let endHandler: () => void;
      streamObj.on.mockImplementation((event: string, handler: unknown) => {
        if (event === 'data') {
          dataHandler = handler as (chunk: Buffer) => void;
          // Emit all chunks immediately
          for (const chunk of chunks) {
            dataHandler(chunk);
          }
        }
        if (event === 'end') {
          endHandler = handler as () => void;
          endHandler();
        }
      });
      const req = createMockReq({
        body: JSON.stringify({ model: 'claude-sonnet', stream: true, messages: [] }),
      });
      const res = createMockRes();

      await proxyRequestHandler(req, res as unknown as Response);

      expect(res._status).toBe(200);
      expect(res.body).toEqual({ id: 'msg_456' });
    });
  });

  describe('upstream error handling', () => {
    it('returns 502 with JSON error when upstream returns ECONNREFUSED', async () => {
      setupProvider();
      const axiosError = new Error('connect ECONNREFUSED 127.0.0.1:8080');
      (axiosError as NodeJS.ErrnoException).code = 'ECONNREFUSED';
      axiosMock.mockRejectedValue(axiosError);
      const req = createMockReq();
      const res = createMockRes();

      await proxyRequestHandler(req, res as unknown as Response);

      expect(res._status).toBe(502);
      expect(res.body).toHaveProperty('error');
    });

    it('returns 502 with JSON error when upstream times out', async () => {
      setupProvider();
      const axiosError = new Error('timeout of 600000ms exceeded');
      (axiosError as NodeJS.ErrnoException).code = 'ETIMEDOUT';
      axiosMock.mockRejectedValue(axiosError);
      const req = createMockReq();
      const res = createMockRes();

      await proxyRequestHandler(req, res as unknown as Response);

      expect(res._status).toBe(502);
      expect(res.body).toHaveProperty('error');
    });

    it('returns 502 for generic upstream errors without a code', async () => {
      setupProvider();
      axiosMock.mockRejectedValue(new Error('Network failure'));
      const req = createMockReq();
      const res = createMockRes();

      await proxyRequestHandler(req, res as unknown as Response);

      expect(res._status).toBe(502);
      expect(res.body).toHaveProperty('error');
    });

    it('forwards upstream 4xx error status and body as-is', async () => {
      setupProvider();
      axiosMock.mockRejectedValue({
        isAxiosError: true,
        response: {
          status: 429,
          data: { error: { type: 'rate_limit_error', message: 'Too many requests' } },
          headers: { 'content-type': 'application/json' },
        },
      });
      const req = createMockReq();
      const res = createMockRes();

      await proxyRequestHandler(req, res as unknown as Response);

      expect(res._status).toBe(429);
      expect(res.body).toEqual({ error: { type: 'rate_limit_error', message: 'Too many requests' } });
    });

    it('forwards upstream 5xx error status and body as-is', async () => {
      setupProvider();
      axiosMock.mockRejectedValue({
        isAxiosError: true,
        response: {
          status: 500,
          data: { error: { type: 'server_error', message: 'Internal error' } },
          headers: { 'content-type': 'application/json' },
        },
      });
      const req = createMockReq();
      const res = createMockRes();

      await proxyRequestHandler(req, res as unknown as Response);

      expect(res._status).toBe(500);
      expect(res.body).toEqual({ error: { type: 'server_error', message: 'Internal error' } });
    });
  });

  describe('request forwarding configuration', () => {
    it('uses provider baseUrl for upstream URL construction', async () => {
      setupProvider('https://custom.anthropic.example.com', 'sk-custom');
      mockAxiosJson(200, { ok: true });
      const req = createMockReq({
        path: '/v1/models',
        url: '/v1/models',
        body: JSON.stringify({}),
      });
      const res = createMockRes();

      await proxyRequestHandler(req, res as unknown as Response);

      expect(axiosMock).toHaveBeenCalledWith(
        expect.objectContaining({
          url: 'https://custom.anthropic.example.com/v1/models',
        }),
      );
    });

    it('uses 600s timeout for /v1/messages path', async () => {
      setupProvider();
      mockAxiosJson(200, { ok: true });
      const req = createMockReq({
        path: '/v1/messages',
        url: '/v1/messages',
        body: JSON.stringify({}),
      });
      const res = createMockRes();

      await proxyRequestHandler(req, res as unknown as Response);

      expect(axiosMock).toHaveBeenCalledWith(
        expect.objectContaining({
          timeout: 600_000,
        }),
      );
    });

    it('uses 120s timeout for non-messages paths', async () => {
      setupProvider();
      mockAxiosJson(200, { data: [] });
      const req = createMockReq({
        path: '/v1/models',
        url: '/v1/models',
        body: JSON.stringify({}),
      });
      const res = createMockRes();

      await proxyRequestHandler(req, res as unknown as Response);

      expect(axiosMock).toHaveBeenCalledWith(
        expect.objectContaining({
          timeout: 120_000,
        }),
      );
    });
  });
});
