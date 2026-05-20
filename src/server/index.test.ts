/**
 * @fileoverview Tests for Express server application entry point
 * @author Meiyuki <meiyukichan@163.com>
 * @copyright 2026 Meiyuki
 */

import fs from 'fs';
import path from 'path';
import os from 'os';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';

// ---- helpers ----

let createApp: (options?: { clientDir?: string }) => import('express').Application;
let tempDir: string;

beforeAll(async () => {
  const mod = await import('./index.js');
  createApp = mod.createApp;
});

beforeAll(() => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpowers-test-'));
  fs.writeFileSync(path.join(tempDir, 'index.html'), '<!DOCTYPE html><html><body>Test Page</body></html>', 'utf-8');
});

afterAll(() => {
  if (tempDir) {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
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
    it('should have /openpowers/api/providers endpoint accessible', async () => {
      const app = createApp({ clientDir: '/non/existent/path' });
      const res = await request(app).get('/openpowers/api/providers');
      expect(res.status).not.toBe(404);
    });
  });

  describe('UI static file serving - when clientDir exists', () => {
    it('should serve index.html at /openpowers/ui', async () => {
      const app = createApp({ clientDir: tempDir });
      const res = await request(app).get('/openpowers/ui');
      expect(res.status).toBe(200);
      expect(res.text).toContain('Test Page');
    });

    it('should serve SPA fallback for /openpowers/ui/* subpaths (serve index.html)', async () => {
      const app = createApp({ clientDir: tempDir });
      const res = await request(app).get('/openpowers/ui/some/sub/path');
      expect(res.status).toBe(200);
      expect(res.text).toContain('Test Page');
    });

    it('should serve static assets from clientDir', async () => {
      fs.writeFileSync(path.join(tempDir, 'test.js'), 'console.log("hello");', 'utf-8');
      const app = createApp({ clientDir: tempDir });
      const res = await request(app).get('/openpowers/ui/test.js');
      expect(res.status).toBe(200);
      expect(res.text).toContain('hello');
    });
  });

  describe('UI static file serving - when clientDir does not exist', () => {
    it('should return friendly message for /openpowers/ui', async () => {
      const app = createApp({ clientDir: '/non/existent/path' });
      const res = await request(app).get('/openpowers/ui');
      expect(res.status).toBe(200);
      expect(res.text).toContain('needs to be built');
    });

    it('should return friendly message for /openpowers/ui/* subpaths', async () => {
      const app = createApp({ clientDir: '/non/existent/path' });
      const res = await request(app).get('/openpowers/ui/any/sub/path');
      expect(res.status).toBe(200);
      expect(res.text).toContain('needs to be built');
    });
  });
});
