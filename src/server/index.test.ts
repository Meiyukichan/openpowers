/**
 * @fileoverview Tests for Express server application entry point
 * @author Meiyuki <meiyukichan@163.com>
 * @copyright 2026 Meiyuki
 */

import fs from 'fs';
import path from 'path';
import os from 'os';
import { describe, it, expect, beforeAll, afterAll, vi, beforeEach } from 'vitest';
import request from 'supertest';

// ---- mock providers-store to control proxy flag ----
const { mockGetEnableFurinaProxy } = vi.hoisted(() => ({
  mockGetEnableFurinaProxy: vi.fn(() => false),
}));

vi.mock('./providers-store.js', async () => {
  const actual = await vi.importActual<typeof import('./providers-store.js')>('./providers-store.js');
  return {
    ...actual,
    getEnableFurinaProxy: mockGetEnableFurinaProxy,
  };
});

// Mock scheduler to avoid node-cron import in tests
vi.mock('./memory/scheduler.js', () => ({
  startScheduler: vi.fn(),
  stopScheduler: vi.fn(),
  isSchedulerRunning: vi.fn(() => false),
}));

// ---- helpers ----

let createApp: (options?: { clientDir?: string }) => import('express').Application;
let tempDir: string;

beforeAll(async () => {
  const mod = await import('./index.js');
  createApp = mod.createApp;
});

beforeAll(() => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'furina-test-'));
  fs.writeFileSync(path.join(tempDir, 'index.html'), '<!DOCTYPE html><html><body>Test Page</body></html>', 'utf-8');
});

afterAll(() => {
  if (tempDir) {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

beforeEach(() => {
  mockGetEnableFurinaProxy.mockReturnValue(false);
});

// ---- test suites ----

describe('src/server/index.ts', () => {
  describe('createApp', () => {
    it('should export createApp as a function', () => {
      expect(createApp).toBeDefined();
      expect(typeof createApp).toBe('function');
    });

    it('should return an Express application', () => {
      const app = createApp({ clientDir: '/non/existent/path' });
      expect(app).toBeDefined();
      expect(typeof app.listen).toBe('function');
    });
  });

  describe('API routes', () => {
    it('should have /furina/api/providers endpoint accessible', async () => {
      const app = createApp({ clientDir: '/non/existent/path' });
      const res = await request(app).get('/furina/api/providers');
      expect(res.status).not.toBe(404);
    });

    it('should have /furina/api/schedule endpoint accessible', async () => {
      const app = createApp({ clientDir: '/non/existent/path' });
      const res = await request(app)
        .put('/furina/api/schedule')
        .send({});
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('ok');
      expect(res.body).toHaveProperty('started');
    });

    it('should have /furina/mcp endpoint accessible (not caught by proxy)', async () => {
      const app = createApp({ clientDir: '/non/existent/path' });
      const res = await request(app)
        .post('/furina/mcp')
        .send({
          jsonrpc: '2.0',
          id: 1,
          method: 'initialize',
          params: {
            protocolVersion: '2025-03-26',
            capabilities: {},
            clientInfo: { name: 'test', version: '1.0.0' },
          },
        });
      // Route should not be 404 (missing) or 503 (caught by proxy catch-all when disabled)
      expect(res.status).not.toBe(404);
      expect(res.status).not.toBe(503);
    });
  });

  describe('UI static file serving - when clientDir exists', () => {
    it('should serve index.html at /furina/ui', async () => {
      const app = createApp({ clientDir: tempDir });
      const res = await request(app).get('/furina/ui');
      expect(res.status).toBe(200);
      expect(res.text).toContain('Test Page');
    });

    it('should serve SPA fallback for /furina/ui/* subpaths (serve index.html)', async () => {
      const app = createApp({ clientDir: tempDir });
      const res = await request(app).get('/furina/ui/some/sub/path');
      expect(res.status).toBe(200);
      expect(res.text).toContain('Test Page');
    });

    it('should serve static assets from clientDir', async () => {
      fs.writeFileSync(path.join(tempDir, 'test.js'), 'console.log("hello");', 'utf-8');
      const app = createApp({ clientDir: tempDir });
      const res = await request(app).get('/furina/ui/test.js');
      expect(res.status).toBe(200);
      expect(res.text).toContain('hello');
    });
  });

  describe('UI static file serving - when clientDir does not exist', () => {
    it('should return friendly message for /furina/ui', async () => {
      const app = createApp({ clientDir: '/non/existent/path' });
      const res = await request(app).get('/furina/ui');
      expect(res.status).toBe(200);
      expect(res.text).toContain('needs to be built');
    });

    it('should return friendly message for /furina/ui/* subpaths', async () => {
      const app = createApp({ clientDir: '/non/existent/path' });
      const res = await request(app).get('/furina/ui/any/sub/path');
      expect(res.status).toBe(200);
      expect(res.text).toContain('needs to be built');
    });
  });

  describe('Proxy route integration', () => {
    it('should register proxy routes when enableFurinaProxy is true', async () => {
      mockGetEnableFurinaProxy.mockReturnValue(true);
      const app = createApp({ clientDir: '/non/existent/path' });
      const res = await request(app).head('/');
      expect(res.status).toBe(200);
    });

    it('should still register proxy routes when enableFurinaProxy is false (handler returns 503 per-request)', async () => {
      mockGetEnableFurinaProxy.mockReturnValue(false);
      const app = createApp({ clientDir: '/non/existent/path' });
      const res = await request(app).head('/');
      // Route is always registered; handler checks flag per-request
      expect(res.status).not.toBe(404);
    });

    it('should still serve /furina/api/providers when proxy is enabled', async () => {
      mockGetEnableFurinaProxy.mockReturnValue(true);
      const app = createApp({ clientDir: '/non/existent/path' });
      const res = await request(app).get('/furina/api/providers');
      expect(res.status).not.toBe(404);
    });

    it('should support coexistence: both proxy and /furina routes work on same app', async () => {
      mockGetEnableFurinaProxy.mockReturnValue(true);
      const app = createApp({ clientDir: '/non/existent/path' });

      const proxyRes = await request(app).head('/');
      expect(proxyRes.status).toBe(200);

      const apiRes = await request(app).get('/furina/api/providers');
      expect(apiRes.status).not.toBe(404);
    });
  });
});
