/**
 * @fileoverview Tests for the Anthropic proxy router.
 * @author Meiyuki <meiyukichan@163.com>
 * @copyright 2026 Meiyuki
 */

import * as express from 'express';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';

// ---------------------------------------------------------------------------
// Mock proxyRequestHandler to isolate route-matching tests
// ---------------------------------------------------------------------------

const { proxyRequestHandlerMock } = vi.hoisted(() => ({
  proxyRequestHandlerMock: vi.fn((_req, res) => {
    res.status(200).json({ proxied: true });
  }),
}));

vi.mock('./handler.js', () => ({
  proxyRequestHandler: proxyRequestHandlerMock,
}));

// Mock logger for testing logRequest
const { proxyLoggerMockForRouter } = vi.hoisted(() => ({
  proxyLoggerMockForRouter: {
    info: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('./logger.js', () => ({
  proxyLogger: proxyLoggerMockForRouter,
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Stores the router for app-creation after it has been imported. */
let createProxyRouter: () => express.Router;

/**
 * Creates an Express app with the proxy router mounted at root.
 * Simulates how createApp() would integrate the proxy router.
 */
function createAppWithProxy(): express.Application {
  const app = express.default();
  app.use(express.default.json());
  app.use(createProxyRouter());
  return app;
}

beforeEach(async () => {
  vi.clearAllMocks();
  // Always re-import the router fresh to pick up mocks
  const mod = await import('./router.js');
  createProxyRouter = mod.createProxyRouter;
});

// ---------------------------------------------------------------------------
// logRequest — status-based logging with LogRequestOptions
// ---------------------------------------------------------------------------

describe('logRequest', () => {
  /** Holds the logRequest function after dynamic import. */
  let logRequest: (options: Record<string, unknown>) => void;

  beforeEach(async () => {
    vi.clearAllMocks();
    // Dynamic import to get logRequest (will be exported after GREEN phase)
    const mod = await import('./router.js');
    logRequest = (mod as Record<string, unknown>).logRequest as (options: Record<string, unknown>) => void;
  });

  it('uses logger.info when status < 400 (status 200)', () => {
    const logger = { info: vi.fn(), error: vi.fn() };
    logRequest({
      providerHost: 'api.example.com',
      method: 'POST',
      url: '/v1/messages',
      status: 200,
      logger,
    });
    expect(logger.info).toHaveBeenCalledTimes(1);
    expect(logger.error).not.toHaveBeenCalled();
  });

  it('uses logger.info when status < 400 (status 302)', () => {
    const logger = { info: vi.fn(), error: vi.fn() };
    logRequest({
      providerHost: 'api.example.com',
      method: 'GET',
      url: '/redirect',
      status: 302,
      logger,
    });
    expect(logger.info).toHaveBeenCalledTimes(1);
    expect(logger.error).not.toHaveBeenCalled();
  });

  it('uses logger.error when status >= 400 (status 400)', () => {
    const logger = { info: vi.fn(), error: vi.fn() };
    logRequest({
      providerHost: 'api.example.com',
      method: 'POST',
      url: '/v1/messages',
      status: 400,
      logger,
    });
    expect(logger.error).toHaveBeenCalledTimes(1);
    expect(logger.info).not.toHaveBeenCalled();
  });

  it('uses logger.error when status >= 400 (status 502)', () => {
    const logger = { info: vi.fn(), error: vi.fn() };
    logRequest({
      providerHost: 'api.example.com',
      method: 'POST',
      url: '/v1/messages',
      status: 502,
      logger,
    });
    expect(logger.error).toHaveBeenCalledTimes(1);
    expect(logger.info).not.toHaveBeenCalled();
  });

  it('uses proxyLogger when no logger is provided and status is 200', () => {
    logRequest({
      providerHost: 'api.example.com',
      method: 'GET',
      url: '/v1/models',
      status: 200,
    });
    expect(proxyLoggerMockForRouter.info).toHaveBeenCalledTimes(1);
  });

  it('uses proxyLogger.error when no logger is provided and status is 500', () => {
    logRequest({
      providerHost: 'api.example.com',
      method: 'GET',
      url: '/v1/models',
      status: 500,
    });
    expect(proxyLoggerMockForRouter.error).toHaveBeenCalledTimes(1);
  });

  it('formats entry with required fields only', () => {
    const logger = { info: vi.fn(), error: vi.fn() };
    logRequest({
      providerHost: 'api.example.com',
      method: 'POST',
      url: '/v1/messages',
      status: 200,
      logger,
    });
    const msg = logger.info.mock.calls[0][0];
    expect(msg).toContain('api.example.com');
    expect(msg).toContain('POST /v1/messages');
    expect(msg).toContain('200');
    expect(msg).toContain('OK');
  });

  it('formats entry with providerModel and clientModel', () => {
    const logger = { info: vi.fn(), error: vi.fn() };
    logRequest({
      providerHost: 'api.example.com',
      method: 'POST',
      url: '/v1/messages',
      status: 200,
      providerModel: 'claude-sonnet',
      clientModel: 'gpt-4',
      logger,
    });
    const msg = logger.info.mock.calls[0][0];
    expect(msg).toContain('api.example.com:claude-sonnet');
    expect(msg).toContain('gpt-4:POST');
  });

  it('formats entry with errorMsg', () => {
    const logger = { info: vi.fn(), error: vi.fn() };
    logRequest({
      providerHost: 'api.example.com',
      method: 'POST',
      url: '/v1/messages',
      status: 502,
      errorMsg: 'Connection refused',
      logger,
    });
    const msg = logger.error.mock.calls[0][0];
    expect(msg).toContain('502 Bad Gateway');
    expect(msg).toContain('Connection refused');
  });
});

// ---------------------------------------------------------------------------
// Router creation
// ---------------------------------------------------------------------------

describe('createProxyRouter', () => {
  it('returns an Express Router', () => {
    const router = createProxyRouter();
    expect(router).toBeDefined();
    expect(typeof router).toBe('function');
    expect(router.name).toBe('router');
  });
});

// ---------------------------------------------------------------------------
// Dedicated /v1/messages route
// ---------------------------------------------------------------------------

describe('POST /v1/messages', () => {
  it('forwards request to proxyRequestHandler', async () => {
    const app = createAppWithProxy();
    const body = { model: 'claude-sonnet', max_tokens: 100, messages: [] };
    const res = await request(app)
      .post('/v1/messages')
      .send(body);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ proxied: true });
    expect(proxyRequestHandlerMock).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// Dedicated /v1/messages/:path sub-route
// ---------------------------------------------------------------------------

describe('POST /v1/messages/:path', () => {
  it('forwards /v1/messages/count_tokens to proxyRequestHandler', async () => {
    const app = createAppWithProxy();
    const body = { model: 'claude-sonnet', messages: [] };
    const res = await request(app)
      .post('/v1/messages/count_tokens')
      .send(body);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ proxied: true });
    expect(proxyRequestHandlerMock).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// Catch-all /:path route (ALL methods)
// ---------------------------------------------------------------------------

describe('Catch-all /:path', () => {
  it('forwards GET /v1/models to proxyRequestHandler', async () => {
    const app = createAppWithProxy();
    const res = await request(app).get('/v1/models');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ proxied: true });
    expect(proxyRequestHandlerMock).toHaveBeenCalledTimes(1);
  });

  it('forwards POST /v1/files to proxyRequestHandler', async () => {
    const app = createAppWithProxy();
    const res = await request(app).post('/v1/files');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ proxied: true });
    expect(proxyRequestHandlerMock).toHaveBeenCalledTimes(1);
  });

  it('forwards PUT /some/path to proxyRequestHandler', async () => {
    const app = createAppWithProxy();
    const res = await request(app).put('/some/path').send({ key: 'value' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ proxied: true });
    expect(proxyRequestHandlerMock).toHaveBeenCalledTimes(1);
  });

  it('forwards DELETE /some/path to proxyRequestHandler', async () => {
    const app = createAppWithProxy();
    const res = await request(app).delete('/some/path');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ proxied: true });
    expect(proxyRequestHandlerMock).toHaveBeenCalledTimes(1);
  });

  it('forwards PATCH /some/path to proxyRequestHandler', async () => {
    const app = createAppWithProxy();
    const res = await request(app).patch('/some/path').send({ key: 'value' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ proxied: true });
    expect(proxyRequestHandlerMock).toHaveBeenCalledTimes(1);
  });
});
