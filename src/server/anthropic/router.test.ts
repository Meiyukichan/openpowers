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
// Health check routes
// ---------------------------------------------------------------------------

describe('Health check routes', () => {
  it('HEAD / returns 200 OK with no body', async () => {
    const app = createAppWithProxy();
    const res = await request(app).head('/');
    expect(res.status).toBe(200);
    // HEAD responses have no body
    expect(res.text).toBeUndefined();
  });

  it('GET / returns 200 OK', async () => {
    const app = createAppWithProxy();
    const res = await request(app).get('/');
    expect(res.status).toBe(200);
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
