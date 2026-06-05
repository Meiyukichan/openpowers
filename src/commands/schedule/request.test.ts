/**
 * @fileoverview Tests for schedule/request.ts sendApiRequest
 * @author Meiyuki <meiyukichan@163.com>
 * @copyright 2026 Meiyuki
 */

import { describe, it, expect, afterEach, vi } from 'vitest';
import http from 'http';
import { EventEmitter } from 'events';
import { sendApiRequest } from './request.js';

/**
 * Helper: create an HTTP server on a free port that responds with a given
 * status code and optional body.
 */
function createTestServer(
  handler: (req: http.IncomingMessage, res: http.ServerResponse) => void,
): Promise<{ server: http.Server; port: number }> {
  return new Promise((resolve, reject) => {
    const server = http.createServer(handler);
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      if (!addr || typeof addr === 'string') {
        server.close();
        reject(new Error('Failed to get server address'));
        return;
      }
      resolve({ server, port: addr.port });
    });
    server.on('error', reject);
  });
}

/**
 * Helper: create a minimal mock ClientRequest that supports the events
 * and methods used by sendApiRequest. The mock triggers 'timeout' on end().
 */
function createMockRequest(): http.ClientRequest {
  const emitter = new EventEmitter();

  const mockReq = {
    ...emitter,
    // So that listeners registered via .on() work
    on: emitter.on.bind(emitter),
    once: emitter.once.bind(emitter),
    off: emitter.off.bind(emitter),
    emit: emitter.emit.bind(emitter),
    addListener: emitter.addListener.bind(emitter),
    removeListener: emitter.removeListener.bind(emitter),
    // https://nodejs.org/api/http.html#class-httpclientrequest
    // The mock only needs end() and destroy() – both used by sendApiRequest.
    end: vi.fn((_chunk?: any, _encoding?: any, _callback?: any) => {
      // Simulate timeout firing immediately after request is sent
      setImmediate(() => emitter.emit('timeout'));
      return mockReq as unknown as http.ClientRequest;
    }),
    destroy: vi.fn(),
  } as unknown as http.ClientRequest;

  return mockReq;
}

describe('sendApiRequest', () => {
  const activeServers: http.Server[] = [];

  afterEach(() => {
    activeServers.forEach((s) => {
      try { s.close(); } catch { /* ignore */ }
    });
    activeServers.length = 0;
  });

  // ---- success ----

  it('should resolve when server returns 2xx with JSON body', async () => {
    const { server, port } = await createTestServer((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
    });
    activeServers.push(server);

    await expect(
      sendApiRequest(port, 'POST', '/test-path'),
    ).resolves.toBeUndefined();
  });

  // ---- non-2xx ----

  it('should reject with status code error when server returns 500', async () => {
    const { server, port } = await createTestServer((_req, res) => {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'internal error' }));
    });
    activeServers.push(server);

    await expect(
      sendApiRequest(port, 'POST', '/test-path'),
    ).rejects.toThrow('API request returned status 500: {"error":"internal error"}');
  });

  it('should reject with status code error when server returns 404', async () => {
    const { server, port } = await createTestServer((_req, res) => {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not Found');
    });
    activeServers.push(server);

    await expect(
      sendApiRequest(port, 'GET', '/nonexistent'),
    ).rejects.toThrow('API request returned status 404: Not Found');
  });

  // ---- connection error ----

  it('should reject on connection error (server not listening)', async () => {
    // Create and immediately close a server to get a free port
    const { server, port } = await createTestServer((_req, res) => {
      res.writeHead(200);
      res.end();
    });

    // Close the server so the port is free, then try to connect.
    await new Promise<void>((resolve) => server.close(() => resolve()));

    await expect(
      sendApiRequest(port, 'POST', '/test-path'),
    ).rejects.toThrow();
  });

  // ---- timeout ----

  it('should reject with timeout error when request times out', async () => {
    // Mock http.request at a lower level to return a mock ClientRequest
    // that fires timeout immediately. We do NOT mock sendApiRequest.
    const spy = vi.spyOn(http, 'request').mockReturnValue(createMockRequest());

    try {
      await expect(
        sendApiRequest(3939, 'POST', '/timeout-test'),
      ).rejects.toThrow('API request timed out');
    } finally {
      spy.mockRestore();
    }
  });
});
