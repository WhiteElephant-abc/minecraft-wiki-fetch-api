const request = require('supertest');
const express = require('express');

describe('rate limiter fail behavior', () => {
  let app;
  let originalLimit;
  let limiter;
  let rateLimitMiddleware;
  let errorHandler;

  beforeEach(() => {
    jest.resetModules();
    process.env.RATE_LIMIT_MAX = '100';
    const rateLimiterModule = require('../src/middleware/rateLimiter');
    rateLimitMiddleware = rateLimiterModule.rateLimitMiddleware;
    limiter = rateLimiterModule.getLimiter().limiter;
    originalLimit = limiter.limit.bind(limiter);
    limiter.limit = async () => { throw new Error('限流器不可用'); };
    errorHandler = require('../src/middleware/errorHandler').errorHandler;

    app = express();
    app.use(rateLimitMiddleware);
    app.get('/x', (req, res) => res.json({ ok: true }));
    app.use(errorHandler);
  });

  afterEach(() => {
    limiter.limit = originalLimit;
  });

  it('returns 429 (fail-closed) when limiter throws', async () => {
    const res = await request(app).get('/x');
    expect(res.status).toBe(429);
    expect(res.headers['retry-after']).toBeDefined();
    expect(res.body.success).toBe(false);
  });
});
