/**
 * @fileoverview Tests for the Anthropic proxy handler.
 * @author Meiyuki <meiyukichan@163.com>
 * @copyright 2026 Meiyuki
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { prepareModifiedHeaders, getTimeoutForPath, detectStreamRequest, proxyRequestHandler, mapModel, tryLogLastMessage } from './handler.js';
import type { Request, Response } from 'express';

// ---------------------------------------------------------------------------
// Mocks for main handler dependencies
// ---------------------------------------------------------------------------

const {
  axiosMock,
  isAxiosErrorMock,
  getDefaultProviderMock,
  getProviderBySessionIdMock,
  getEnableOpenpowersProxyMock,
  proxyLoggerMock,
  createSessionLoggerMock,
  writeSessionBodyJsonMock,
} = vi.hoisted(() => ({
  axiosMock: vi.fn(),
  isAxiosErrorMock: vi.fn(
    (payload: unknown): boolean =>
      typeof payload === 'object' && payload !== null && (payload as Record<string, unknown>).isAxiosError === true,
  ),
  getDefaultProviderMock: vi.fn(),
  getProviderBySessionIdMock: vi.fn(),
  getEnableOpenpowersProxyMock: vi.fn(),
  proxyLoggerMock: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
  createSessionLoggerMock: vi.fn(),
  writeSessionBodyJsonMock: vi.fn(),
}));

// Attach isAxiosError to the default axios mock so that `axios.isAxiosError()` works
vi.mock('axios', () => ({
  default: Object.assign(axiosMock, { isAxiosError: isAxiosErrorMock }),
  isAxiosError: isAxiosErrorMock,
}));

vi.mock('../providers-store.js', () => ({
  getDefaultProvider: getDefaultProviderMock,
  getEnableOpenpowersProxy: getEnableOpenpowersProxyMock,
}));

vi.mock('./logger.js', () => ({
  proxyLogger: proxyLoggerMock,
  createSessionLogger: createSessionLoggerMock,
}));

vi.mock('../../utils/session.js', () => ({
  getProviderBySessionId: getProviderBySessionIdMock,
  writeSessionBodyJson: writeSessionBodyJsonMock,
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
  const streamData: { on: ReturnType<typeof vi.fn>; pipe: ReturnType<typeof vi.fn>; destroy: ReturnType<typeof vi.fn> } = {
    on: vi.fn(),
    pipe: vi.fn(),
    destroy: vi.fn(),
  };
  axiosMock.mockResolvedValue({
    status,
    data: streamData,
    headers,
  });
  return streamData;
}

/** Configure a provider mock that the handler can use. */
function setupProvider(
  baseUrl = 'https://api.anthropic.com',
  apiKey = 'sk-test-key',
  models?: { defaultModel?: string; sonnetModel?: string; opusModel?: string; haikuModel?: string },
) {
  getEnableOpenpowersProxyMock.mockReturnValue(true);
  getDefaultProviderMock.mockReturnValue({
    id: 'test-provider',
    name: 'Test Provider',
    apiKey,
    baseUrl,
    defaultModel: models?.defaultModel ?? '',
    sonnetModel: models?.sonnetModel ?? '',
    opusModel: models?.opusModel ?? '',
    haikuModel: models?.haikuModel ?? '',
    createdAt: new Date().toISOString(),
  });
}

/** Create a session-level provider mock. */
function setupSessionProvider(
  baseUrl = 'https://session.api.example.com',
  apiKey = 'sk-session-key',
  models?: { defaultModel?: string; sonnetModel?: string; opusModel?: string; haikuModel?: string },
) {
  return {
    id: 'session-provider',
    name: 'Session Provider',
    apiKey,
    baseUrl,
    defaultModel: models?.defaultModel ?? '',
    sonnetModel: models?.sonnetModel ?? '',
    opusModel: models?.opusModel ?? '',
    haikuModel: models?.haikuModel ?? '',
    createdAt: new Date().toISOString(),
  };
}

/** Create a session logger mock. */
const sessionLoggerMock = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
};

beforeEach(() => {
  vi.clearAllMocks();
  createSessionLoggerMock.mockReturnValue(sessionLoggerMock);
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

  it('returns 120s for /v1/messages/:path sub-path (e.g. count_tokens)', () => {
    expect(getTimeoutForPath('/v1/messages/count_tokens')).toBe(120_000);
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
// mapModel
// ---------------------------------------------------------------------------

import type { Provider } from '../providers-store.js';

function createProvider(overrides?: Partial<Provider>): Provider {
  return {
    id: 'test-provider',
    name: 'Test Provider',
    apiKey: 'sk-test',
    baseUrl: 'https://api.example.com',
    defaultModel: '',
    sonnetModel: '',
    opusModel: '',
    haikuModel: '',
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

describe('mapModel', () => {
  it('maps haiku model to provider haikuModel', () => {
    const provider = createProvider({ haikuModel: 'anthropic/claude-3.5-haiku' });
    expect(mapModel('claude-haiku-3-5', provider)).toBe('anthropic/claude-3.5-haiku');
  });

  it('maps sonnet model to provider sonnetModel', () => {
    const provider = createProvider({ sonnetModel: 'anthropic/claude-sonnet-4' });
    expect(mapModel('claude-sonnet-4-20250514', provider)).toBe('anthropic/claude-sonnet-4');
  });

  it('maps opus model to provider opusModel', () => {
    const provider = createProvider({ opusModel: 'anthropic/claude-opus-4' });
    expect(mapModel('claude-opus-4', provider)).toBe('anthropic/claude-opus-4');
  });

  it('maps unknown model to provider defaultModel', () => {
    const provider = createProvider({ defaultModel: 'anthropic/claude-sonnet-4' });
    expect(mapModel('gpt-5', provider)).toBe('anthropic/claude-sonnet-4');
  });

  it('falls back to defaultModel when haikuModel is empty', () => {
    const provider = createProvider({ haikuModel: '', defaultModel: 'anthropic/default' });
    expect(mapModel('claude-haiku-3-5', provider)).toBe('anthropic/default');
  });

  it('falls back to defaultModel when sonnetModel is empty', () => {
    const provider = createProvider({ sonnetModel: '', defaultModel: 'anthropic/default' });
    expect(mapModel('claude-sonnet', provider)).toBe('anthropic/default');
  });

  it('falls back to defaultModel when opusModel is empty', () => {
    const provider = createProvider({ opusModel: '', defaultModel: 'anthropic/default' });
    expect(mapModel('claude-opus-4', provider)).toBe('anthropic/default');
  });

  it('preserves original model when both haikuModel and defaultModel are empty', () => {
    const provider = createProvider({ haikuModel: '', defaultModel: '' });
    expect(mapModel('claude-haiku-3-5', provider)).toBe('claude-haiku-3-5');
  });

  it('preserves original model when defaultModel is empty', () => {
    const provider = createProvider({ defaultModel: '' });
    expect(mapModel('gpt-5', provider)).toBe('gpt-5');
  });

  it('matches haiku case-insensitively', () => {
    const provider = createProvider({ haikuModel: 'anthropic/claude-3.5-haiku' });
    expect(mapModel('CLAUDE-HAIKU-3-5', provider)).toBe('anthropic/claude-3.5-haiku');
  });

  it('matches sonnet case-insensitively', () => {
    const provider = createProvider({ sonnetModel: 'anthropic/claude-sonnet-4' });
    expect(mapModel('CLAUDE-SONNET-4', provider)).toBe('anthropic/claude-sonnet-4');
  });

  it('matches opus case-insensitively', () => {
    const provider = createProvider({ opusModel: 'anthropic/claude-opus-4' });
    expect(mapModel('CLAUDE-OPUS-4', provider)).toBe('anthropic/claude-opus-4');
  });

  it('haiku keyword takes priority over other keywords', () => {
    const provider = createProvider({
      haikuModel: 'anthropic/haiku',
      sonnetModel: 'anthropic/sonnet',
    });
    expect(mapModel('claude-haiku-sonnet', provider)).toBe('anthropic/haiku');
  });
});

// ---------------------------------------------------------------------------
// tryLogLastMessage
// ---------------------------------------------------------------------------

describe('tryLogLastMessage', () => {
  const logger = { info: vi.fn() };

  beforeEach(() => {
    logger.info.mockClear();
  });

  it('logs last message when status is 200 and body has non-empty messages array', () => {
    const body = {
      messages: [
        { role: 'user', content: 'hello' },
        { role: 'assistant', content: 'hi there' },
      ],
    };
    tryLogLastMessage(logger, 'api.example.com', 'POST', '/v1/messages', 200, body);

    expect(logger.info).toHaveBeenCalledTimes(1);
    const msg = logger.info.mock.calls[0][0] as string;
    expect(msg).toContain('200 OK');
    expect(msg).toContain('last message:');
    expect(msg).toContain('"role":"assistant"');
  });

  it('logs last message when status is 400 and body has non-empty messages array', () => {
    const body = {
      messages: [
        { role: 'user', content: 'hello' },
      ],
    };
    tryLogLastMessage(logger, 'api.example.com', 'POST', '/v1/messages', 400, body);

    expect(logger.info).toHaveBeenCalledTimes(1);
    const msg = logger.info.mock.calls[0][0] as string;
    expect(msg).toContain('400 Bad Request');
    expect(msg).toContain('last message:');
  });

  it('does NOT log when status is 200 but messages array is empty', () => {
    tryLogLastMessage(logger, 'api.example.com', 'POST', '/v1/messages', 200, { messages: [] });

    expect(logger.info).not.toHaveBeenCalled();
  });

  it('does NOT log when status is 200 but body has no messages field', () => {
    tryLogLastMessage(logger, 'api.example.com', 'POST', '/v1/messages', 200, { id: 'msg_123', content: [{ text: 'Hello' }] });

    expect(logger.info).not.toHaveBeenCalled();
  });

  it('does NOT log and does NOT throw when body is a non-JSON string', () => {
    expect(() => {
      tryLogLastMessage(logger, 'api.example.com', 'POST', '/v1/messages', 200, 'plain text response');
    }).not.toThrow();
    expect(logger.info).not.toHaveBeenCalled();
  });

  it('does NOT log and does NOT throw when body is null', () => {
    expect(() => {
      tryLogLastMessage(logger, 'api.example.com', 'POST', '/v1/messages', 200, null);
    }).not.toThrow();
    expect(logger.info).not.toHaveBeenCalled();
  });

  it('does NOT log when status is 500 even with non-empty messages', () => {
    tryLogLastMessage(logger, 'api.example.com', 'POST', '/v1/messages', 500, {
      messages: [{ role: 'assistant', content: 'Hello' }],
    });

    expect(logger.info).not.toHaveBeenCalled();
  });

  it('does NOT log when status is 200 but messages is not an array', () => {
    tryLogLastMessage(logger, 'api.example.com', 'POST', '/v1/messages', 200, { messages: 'not-an-array' });

    expect(logger.info).not.toHaveBeenCalled();
  });

  it('formats the log entry with providerModel and clientModel', () => {
    const body = {
      messages: [{ role: 'assistant', content: 'Response text' }],
    };
    tryLogLastMessage(logger, 'api.example.com', 'POST', '/v1/messages', 200, body, 'claude-sonnet', 'gpt-4');

    expect(logger.info).toHaveBeenCalledTimes(1);
    const msg = logger.info.mock.calls[0][0] as string;
    expect(msg).toContain('api.example.com:claude-sonnet');
    expect(msg).toContain('gpt-4:POST');
    expect(msg).toContain('200 OK');
    expect(msg).toContain('last message:');
  });

  it('formats the log entry without optional model params', () => {
    const body = {
      messages: [{ role: 'assistant', content: 'Hello' }],
    };
    tryLogLastMessage(logger, 'api.example.com', 'POST', '/v1/messages', 200, body);

    expect(logger.info).toHaveBeenCalledTimes(1);
    const msg = logger.info.mock.calls[0][0] as string;
    expect(msg).toContain('api.example.com');
    expect(msg).toContain('"POST /v1/messages HTTP/1.1"');
    expect(msg).toContain('200 OK');
    expect(msg).toContain('last message:');
    expect(msg).toContain('"role":"assistant"');
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

    it('logs error and ends response on upstream SSE stream error', async () => {
      setupProvider();
      const streamObj = mockAxiosStream(200, { 'content-type': 'text/event-stream' });

      let errorCb: ((err: Error) => void) | undefined;
      streamObj.on.mockImplementation((event: string, cb: unknown) => {
        if (event === 'error') {
          errorCb = cb as (err: Error) => void;
        }
      });

      const req = createMockReq({
        body: JSON.stringify({ model: 'claude-sonnet', stream: true, messages: [] }),
      });
      const res = createMockRes();

      await proxyRequestHandler(req, res as unknown as Response);

      expect(errorCb).toBeDefined();
      errorCb!(new Error('Stream broken'));

      expect(proxyLoggerMock.error).toHaveBeenCalledWith('Upstream stream error: Stream broken');
      expect(res._headersSent).toBe(true);
    });

    it('destroys upstream stream when client disconnects during SSE streaming', async () => {
      setupProvider();
      const streamObj = mockAxiosStream(200, { 'content-type': 'text/event-stream' });
      streamObj.destroy = vi.fn();

      let closeCb: (() => void) | undefined;
      const req = createMockReq({
        body: JSON.stringify({ model: 'claude-sonnet', stream: true, messages: [] }),
        on: vi.fn((event: string, cb: unknown) => {
          if (event === 'close') {
            closeCb = cb as () => void;
          }
          return req as unknown as Request;
        }) as unknown as Request['on'],
      });
      const res = createMockRes();

      await proxyRequestHandler(req, res as unknown as Response);

      expect(closeCb).toBeDefined();
      closeCb!();

      expect(streamObj.destroy).toHaveBeenCalled();
    });

    it('destroys upstream stream when client disconnects during non-SSE buffering', async () => {
      setupProvider();
      const streamObj = mockAxiosStream(200, { 'content-type': 'application/json' });
      streamObj.destroy = vi.fn();

      // Register stream event handlers but DON'T trigger end — stream stays open
      const dataHandlers: Array<(chunk: Buffer) => void> = [];
      let errorHandler: ((err: Error) => void) | undefined;
      streamObj.on.mockImplementation((event: string, handler: unknown) => {
        if (event === 'data') {
          dataHandlers.push(handler as (chunk: Buffer) => void);
        }
        if (event === 'error') {
          errorHandler = handler as (err: Error) => void;
        }
        // Do not trigger 'end' or 'error' — stream stays pending
      });

      // Capture the close callback on req
      let closeCb: (() => void) | undefined;
      const req = createMockReq({
        body: JSON.stringify({ model: 'claude-sonnet', stream: true, messages: [] }),
        on: vi.fn((event: string, cb: unknown) => {
          if (event === 'close') {
            closeCb = cb as () => void;
          }
          return req as unknown as Request;
        }) as unknown as Request['on'],
      });
      const res = createMockRes();

      // Start the handler — it will be waiting on the buffering Promise
      const handlerPromise = proxyRequestHandler(req, res as unknown as Response);

      // Flush microtasks so handler resumes after await axios(config) and
      // registers req.on('close') + stream event listeners
      await Promise.resolve();

      // Emit some data so stream listeners are registered by the handler
      dataHandlers.forEach(h => h(Buffer.from('{"id":"msg_123"}')));
      // Flush microtasks after emitting data
      await Promise.resolve();

      // Simulate client disconnect
      expect(closeCb).toBeDefined();
      closeCb!();

      expect(streamObj.destroy).toHaveBeenCalled();

      // Resolve the pending handler promise by emitting stream error after destroy
      // (destroy() on a real stream triggers error/close, so we simulate that here)
      errorHandler!(new Error('Stream destroyed'));
      await handlerPromise;
    });

    it('does not throw when upstream stream has no destroy method on non-SSE client disconnect', async () => {
      setupProvider();
      const streamObj = mockAxiosStream(200, { 'content-type': 'application/json' });
      // Stream has NO destroy method — simulating a non-standard stream object
      delete (streamObj as Record<string, unknown>).destroy;

      // Register stream event handlers but DON'T trigger end
      const dataHandlers: Array<(chunk: Buffer) => void> = [];
      let errorHandler: ((err: Error) => void) | undefined;
      streamObj.on.mockImplementation((event: string, handler: unknown) => {
        if (event === 'data') {
          dataHandlers.push(handler as (chunk: Buffer) => void);
        }
        if (event === 'error') {
          errorHandler = handler as (err: Error) => void;
        }
      });

      // Capture the close callback on req
      let closeCb: (() => void) | undefined;
      const req = createMockReq({
        body: JSON.stringify({ model: 'claude-sonnet', stream: true, messages: [] }),
        on: vi.fn((event: string, cb: unknown) => {
          if (event === 'close') {
            closeCb = cb as () => void;
          }
          return req as unknown as Request;
        }) as unknown as Request['on'],
      });
      const res = createMockRes();

      // Start the handler
      const handlerPromise = proxyRequestHandler(req, res as unknown as Response);

      // Flush microtasks so handler resumes and registers event listeners
      await Promise.resolve();

      // Emit some data
      dataHandlers.forEach(h => h(Buffer.from('{"test":true}')));
      await Promise.resolve();

      // Simulate client disconnect — should NOT throw despite missing destroy
      expect(closeCb).toBeDefined();
      expect(() => closeCb!()).not.toThrow();

      // Resolve the pending handler promise
      errorHandler!(new Error('Stream destroyed'));
      await handlerPromise;
    });

    it('sends buffered non-JSON stream content as text', async () => {
      setupProvider();
      const streamObj = mockAxiosStream(200, { 'content-type': 'text/html' });
      const htmlContent = '<html><body>Error</body></html>';

      streamObj.on.mockImplementation((event: string, handler: unknown) => {
        if (event === 'data') {
          (handler as (chunk: Buffer) => void)(Buffer.from(htmlContent));
        }
        if (event === 'end') {
          (handler as () => void)();
        }
      });

      const req = createMockReq({
        body: JSON.stringify({ model: 'claude-sonnet', stream: true, messages: [] }),
      });
      const res = createMockRes();

      await proxyRequestHandler(req, res as unknown as Response);

      expect(res._status).toBe(200);
      expect(res.headers['content-type']).toBe('text/html');
      expect(res.body).toBe(htmlContent);
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

    it('returns 502 when buffered upstream stream emits error', async () => {
      setupProvider();
      const streamObj = mockAxiosStream(200, { 'content-type': 'application/json' });

      streamObj.on.mockImplementation((event: string, handler: unknown) => {
        if (event === 'error') {
          (handler as (err: Error) => void)(new Error('Upstream connection lost'));
        }
      });

      const req = createMockReq({
        body: JSON.stringify({ model: 'claude-sonnet', stream: true, messages: [] }),
      });
      const res = createMockRes();

      await proxyRequestHandler(req, res as unknown as Response);

      expect(res._status).toBe(502);
      expect(res.body).toHaveProperty('error', 'Bad Gateway');
      expect(proxyLoggerMock.error).toHaveBeenCalledWith(
        expect.stringContaining('Upstream connection lost'),
      );
    });

    it('forwards upstream error with string response body as-is', async () => {
      setupProvider();
      axiosMock.mockRejectedValue({
        isAxiosError: true,
        response: {
          status: 502,
          data: '<html>502 Bad Gateway</html>',
          headers: { 'content-type': 'text/html' },
        },
      });
      const req = createMockReq();
      const res = createMockRes();

      await proxyRequestHandler(req, res as unknown as Response);

      expect(res._status).toBe(502);
      expect(res.body).toBe('<html>502 Bad Gateway</html>');
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

  describe('model replacement', () => {
    it('replaces sonnet model with provider sonnetModel in forwarded body', async () => {
      setupProvider('https://api.anthropic.com', 'sk-key', {
        sonnetModel: 'anthropic/claude-sonnet-4',
      });
      mockAxiosJson(200, { id: 'msg_1' });
      const req = createMockReq({
        body: JSON.stringify({ model: 'claude-sonnet-4-20250514', max_tokens: 100, messages: [] }),
      });
      const res = createMockRes();

      await proxyRequestHandler(req, res as unknown as Response);

      expect(axiosMock).toHaveBeenCalledTimes(1);
      const config = axiosMock.mock.calls[0][0];
      const forwardedBody = JSON.parse(config.data);
      expect(forwardedBody.model).toBe('anthropic/claude-sonnet-4');
    });

    it('replaces haiku model with provider haikuModel in forwarded body', async () => {
      setupProvider('https://api.anthropic.com', 'sk-key', {
        haikuModel: 'anthropic/claude-3.5-haiku',
      });
      mockAxiosJson(200, { id: 'msg_2' });
      const req = createMockReq({
        body: JSON.stringify({ model: 'claude-haiku-3-5', messages: [] }),
      });
      const res = createMockRes();

      await proxyRequestHandler(req, res as unknown as Response);

      const config = axiosMock.mock.calls[0][0];
      const forwardedBody = JSON.parse(config.data);
      expect(forwardedBody.model).toBe('anthropic/claude-3.5-haiku');
    });

    it('replaces opus model with provider opusModel in forwarded body', async () => {
      setupProvider('https://api.anthropic.com', 'sk-key', {
        opusModel: 'anthropic/claude-opus-4',
      });
      mockAxiosJson(200, { id: 'msg_3' });
      const req = createMockReq({
        body: JSON.stringify({ model: 'claude-opus-4', messages: [] }),
      });
      const res = createMockRes();

      await proxyRequestHandler(req, res as unknown as Response);

      const config = axiosMock.mock.calls[0][0];
      const forwardedBody = JSON.parse(config.data);
      expect(forwardedBody.model).toBe('anthropic/claude-opus-4');
    });

    it('replaces unknown model with provider defaultModel in forwarded body', async () => {
      setupProvider('https://api.anthropic.com', 'sk-key', {
        defaultModel: 'anthropic/claude-sonnet-4',
      });
      mockAxiosJson(200, { id: 'msg_4' });
      const req = createMockReq({
        body: JSON.stringify({ model: 'gpt-5', messages: [] }),
      });
      const res = createMockRes();

      await proxyRequestHandler(req, res as unknown as Response);

      const config = axiosMock.mock.calls[0][0];
      const forwardedBody = JSON.parse(config.data);
      expect(forwardedBody.model).toBe('anthropic/claude-sonnet-4');
    });

    it('forwards body without model field unchanged', async () => {
      setupProvider('https://api.anthropic.com', 'sk-key', {
        sonnetModel: 'anthropic/claude-sonnet-4',
      });
      mockAxiosJson(200, { id: 'msg_5' });
      const req = createMockReq({
        body: JSON.stringify({ max_tokens: 100, messages: [] }),
      });
      const res = createMockRes();

      await proxyRequestHandler(req, res as unknown as Response);

      const config = axiosMock.mock.calls[0][0];
      const forwardedBody = JSON.parse(config.data);
      expect(forwardedBody.model).toBeUndefined();
      expect(forwardedBody.max_tokens).toBe(100);
    });

    it('preserves original model when target sonnetModel is empty', async () => {
      setupProvider('https://api.anthropic.com', 'sk-key', {
        sonnetModel: '',
      });
      mockAxiosJson(200, { id: 'msg_6' });
      const req = createMockReq({
        body: JSON.stringify({ model: 'claude-sonnet', messages: [] }),
      });
      const res = createMockRes();

      await proxyRequestHandler(req, res as unknown as Response);

      const config = axiosMock.mock.calls[0][0];
      const forwardedBody = JSON.parse(config.data);
      expect(forwardedBody.model).toBe('claude-sonnet');
    });

    it('does not replace model when content-type is not application/json', async () => {
      setupProvider('https://api.anthropic.com', 'sk-key', {
        sonnetModel: 'anthropic/claude-sonnet-4',
      });
      mockAxiosJson(200, { id: 'msg_7' });
      const req = createMockReq({
        headers: { 'content-type': 'multipart/form-data' },
        body: JSON.stringify({ model: 'claude-sonnet', messages: [] }),
      });
      const res = createMockRes();

      await proxyRequestHandler(req, res as unknown as Response);

      const config = axiosMock.mock.calls[0][0];
      expect(config.data).toBe(JSON.stringify({ model: 'claude-sonnet', messages: [] }));
    });
  });

  describe('metadata session routing', () => {
    it('uses session provider when metadata.user_id contains valid session_id', async () => {
      const sessionProvider = setupSessionProvider('https://session.api.com', 'sk-session');
      getProviderBySessionIdMock.mockReturnValue(sessionProvider);
      setupProvider('https://default.api.com', 'sk-default');
      mockAxiosJson(200, { id: 'msg_session' });

      const req = createMockReq({
        body: JSON.stringify({
          model: 'claude-sonnet',
          max_tokens: 100,
          messages: [],
          metadata: {
            user_id: JSON.stringify({ session_id: 'test-session-123' }),
          },
        }),
      });
      const res = createMockRes();

      await proxyRequestHandler(req, res as unknown as Response);

      expect(getProviderBySessionIdMock).toHaveBeenCalledWith('test-session-123');
      const config = axiosMock.mock.calls[0][0];
      expect(config.url).toContain('session.api.com');
      expect(config.headers['x-api-key']).toBe('sk-session');
    });

    it('uses default provider when metadata field is missing', async () => {
      setupProvider('https://default.api.com', 'sk-default');
      mockAxiosJson(200, { id: 'msg_no_meta' });

      const req = createMockReq({
        body: JSON.stringify({
          model: 'claude-sonnet',
          max_tokens: 100,
          messages: [],
          // no metadata field
        }),
      });
      const res = createMockRes();

      await proxyRequestHandler(req, res as unknown as Response);

      expect(getProviderBySessionIdMock).not.toHaveBeenCalled();
      const config = axiosMock.mock.calls[0][0];
      expect(config.url).toContain('default.api.com');
      expect(config.headers['x-api-key']).toBe('sk-default');
    });

    it('uses default provider when metadata.user_id is not valid JSON', async () => {
      setupProvider('https://default.api.com', 'sk-default');
      mockAxiosJson(200, { id: 'msg_invalid_json' });

      const req = createMockReq({
        body: JSON.stringify({
          model: 'claude-sonnet',
          max_tokens: 100,
          messages: [],
          metadata: {
            user_id: 'not-valid-json{{{',
          },
        }),
      });
      const res = createMockRes();

      await proxyRequestHandler(req, res as unknown as Response);

      expect(getProviderBySessionIdMock).not.toHaveBeenCalled();
      const config = axiosMock.mock.calls[0][0];
      expect(config.url).toContain('default.api.com');
    });

    it('uses default provider when metadata.user_id lacks session_id field', async () => {
      setupProvider('https://default.api.com', 'sk-default');
      mockAxiosJson(200, { id: 'msg_no_session_id' });

      const req = createMockReq({
        body: JSON.stringify({
          model: 'claude-sonnet',
          max_tokens: 100,
          messages: [],
          metadata: {
            user_id: JSON.stringify({ other_field: 'value' }),
          },
        }),
      });
      const res = createMockRes();

      await proxyRequestHandler(req, res as unknown as Response);

      expect(getProviderBySessionIdMock).not.toHaveBeenCalled();
      const config = axiosMock.mock.calls[0][0];
      expect(config.url).toContain('default.api.com');
    });

    it('falls back to default provider when getProviderBySessionId returns null', async () => {
      getProviderBySessionIdMock.mockReturnValue(null);
      setupProvider('https://default.api.com', 'sk-default');
      mockAxiosJson(200, { id: 'msg_fallback' });

      const req = createMockReq({
        body: JSON.stringify({
          model: 'claude-sonnet',
          max_tokens: 100,
          messages: [],
          metadata: {
            user_id: JSON.stringify({ session_id: 'test-session-456' }),
          },
        }),
      });
      const res = createMockRes();

      await proxyRequestHandler(req, res as unknown as Response);

      expect(getProviderBySessionIdMock).toHaveBeenCalledWith('test-session-456');
      const config = axiosMock.mock.calls[0][0];
      expect(config.url).toContain('default.api.com');
      expect(config.headers['x-api-key']).toBe('sk-default');
    });

    it('uses session logger when session provider is active', async () => {
      const sessionProvider = setupSessionProvider('https://session.api.com', 'sk-session');
      getProviderBySessionIdMock.mockReturnValue(sessionProvider);
      setupProvider('https://default.api.com', 'sk-default');
      mockAxiosJson(200, { id: 'msg_logger' });

      const req = createMockReq({
        body: JSON.stringify({
          model: 'claude-sonnet',
          max_tokens: 100,
          messages: [],
          metadata: {
            user_id: JSON.stringify({ session_id: 'test-session-789' }),
          },
        }),
      });
      const res = createMockRes();

      await proxyRequestHandler(req, res as unknown as Response);

      expect(createSessionLoggerMock).toHaveBeenCalledWith('test-session-789');
    });

    it('uses proxyLogger when session provider is null', async () => {
      getProviderBySessionIdMock.mockReturnValue(null);
      setupProvider('https://default.api.com', 'sk-default');
      mockAxiosJson(200, { id: 'msg_proxy_logger_fallback' });

      const req = createMockReq({
        body: JSON.stringify({
          model: 'claude-sonnet',
          max_tokens: 100,
          messages: [],
          metadata: {
            user_id: JSON.stringify({ session_id: 'test-session-null' }),
          },
        }),
      });
      const res = createMockRes();

      await proxyRequestHandler(req, res as unknown as Response);

      expect(createSessionLoggerMock).not.toHaveBeenCalled();
    });

    it('does not parse metadata for non-JSON requests', async () => {
      setupProvider('https://default.api.com', 'sk-default');
      mockAxiosJson(200, { id: 'msg_non_json' });

      const req = createMockReq({
        headers: { 'content-type': 'multipart/form-data' },
        body: JSON.stringify({
          model: 'claude-sonnet',
          messages: [],
          metadata: {
            user_id: JSON.stringify({ session_id: 'test-session' }),
          },
        }),
      });
      const res = createMockRes();

      await proxyRequestHandler(req, res as unknown as Response);

      expect(getProviderBySessionIdMock).not.toHaveBeenCalled();
      expect(createSessionLoggerMock).not.toHaveBeenCalled();
    });

    it('uses session logger for logging when session provider is active and upstream error occurs', async () => {
      const sessionProvider = setupSessionProvider('https://session.api.com', 'sk-session');
      getProviderBySessionIdMock.mockReturnValue(sessionProvider);
      setupProvider('https://default.api.com', 'sk-default');
      mockAxiosJson(500, { error: 'Server error' });

      const req = createMockReq({
        body: JSON.stringify({
          model: 'claude-sonnet',
          messages: [],
          metadata: {
            user_id: JSON.stringify({ session_id: 'test-session-log' }),
          },
        }),
      });
      const res = createMockRes();

      await proxyRequestHandler(req, res as unknown as Response);

      expect(sessionLoggerMock.warn).toHaveBeenCalledWith(expect.stringContaining('Server error'));
      expect(proxyLoggerMock.warn).not.toHaveBeenCalled();
    });
  });
});
