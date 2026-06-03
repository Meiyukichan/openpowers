/**
 * @fileoverview Tests for config API routes
 * @author Meiyuki <meiyukichan@163.com>
 * @copyright 2026 Meiyuki
 */

import * as express from 'express';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';

// ---- mocks for providers-store ----

const {
  getLanguageMock,
  setLanguageMock,
} = vi.hoisted(() => ({
  getLanguageMock: vi.fn(),
  setLanguageMock: vi.fn(),
}));

vi.mock('../providers-store.js', () => ({
  getLanguage: getLanguageMock,
  setLanguage: setLanguageMock,
}));

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

let configRouter: express.Router;

beforeEach(async () => {
  vi.clearAllMocks();
  const mod = await import('./config.js');
  configRouter = mod.configRouter;
});

describe('GET /openpowers/api/config', () => {
  it('should return 200 with language "chinese" when store has chinese', async () => {
    getLanguageMock.mockReturnValue('chinese');

    const app = express.default();
    app.use(express.default.json());
    app.use('/openpowers/api/config', configRouter);

    const res = await request(app).get('/openpowers/api/config');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ language: 'chinese' });
  });

  it('should return 200 with language "english" when store has english', async () => {
    getLanguageMock.mockReturnValue('english');

    const app = express.default();
    app.use(express.default.json());
    app.use('/openpowers/api/config', configRouter);

    const res = await request(app).get('/openpowers/api/config');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ language: 'english' });
  });
});

describe('PUT /openpowers/api/config', () => {
  it('should update language and return 200 when language is "english"', async () => {
    getLanguageMock.mockReturnValue('chinese');

    const app = express.default();
    app.use(express.default.json());
    app.use('/openpowers/api/config', configRouter);

    const res = await request(app)
      .put('/openpowers/api/config')
      .send({ language: 'english' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ language: 'english' });
    expect(setLanguageMock).toHaveBeenCalledWith('english');
  });

  it('should update language and return 200 when language is "chinese"', async () => {
    getLanguageMock.mockReturnValue('english');

    const app = express.default();
    app.use(express.default.json());
    app.use('/openpowers/api/config', configRouter);

    const res = await request(app)
      .put('/openpowers/api/config')
      .send({ language: 'chinese' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ language: 'chinese' });
    expect(setLanguageMock).toHaveBeenCalledWith('chinese');
  });

  it('should return 400 when language field is missing', async () => {
    const app = express.default();
    app.use(express.default.json());
    app.use('/openpowers/api/config', configRouter);

    const res = await request(app)
      .put('/openpowers/api/config')
      .send({});

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
    expect(setLanguageMock).not.toHaveBeenCalled();
  });

  it('should return 400 when language field is invalid', async () => {
    const app = express.default();
    app.use(express.default.json());
    app.use('/openpowers/api/config', configRouter);

    const res = await request(app)
      .put('/openpowers/api/config')
      .send({ language: 'french' });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
    expect(setLanguageMock).not.toHaveBeenCalled();
  });

  it('should return 400 when body is not an object', async () => {
    const app = express.default();
    app.use(express.default.json());
    app.use('/openpowers/api/config', configRouter);

    const res = await request(app)
      .put('/openpowers/api/config')
      .send('not-json');

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
    expect(setLanguageMock).not.toHaveBeenCalled();
  });
});
