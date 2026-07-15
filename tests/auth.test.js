const request = require('supertest');
const express = require('express');

describe('API key auth', () => {
  let app;
  beforeEach(() => {
    jest.resetModules();
    process.env.API_KEY = 'secret-test-key';
    const { authMiddleware } = require('../src/middleware/auth');
    app = express();
    app.use(authMiddleware);
    app.get('/x', (req, res) => res.json({ auth: req.authenticated, type: req.authType }));
  });
  afterEach(() => { delete process.env.API_KEY; });

  it('authenticates via X-API-Key header', async () => {
    const res = await request(app).get('/x').set('X-API-Key', 'secret-test-key');
    expect(res.body).toEqual({ auth: true, type: 'apikey' });
  });

  it('does NOT authenticate via ?api_key query param', async () => {
    const res = await request(app).get('/x?api_key=secret-test-key');
    expect(res.body.auth).toBe(false);
    expect(res.body.type).toBe('anonymous');
  });

  it('rejects wrong key', async () => {
    const res = await request(app).get('/x').set('X-API-Key', 'wrong');
    expect(res.body.auth).toBe(false);
  });
});
