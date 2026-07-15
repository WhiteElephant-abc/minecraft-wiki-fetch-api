const request = require('supertest');
const express = require('express');
const { getClientIdentifier } = require('../src/middleware/auth');

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

  it('authenticates via Authorization: Bearer header', async () => {
    const res = await request(app).get('/x').set('Authorization', 'Bearer secret-test-key');
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

describe('auth middleware identifier', () => {
  describe('getClientIdentifier', () => {
    it('uses req.ip for anonymous requests', () => {
      const req = { ip: '192.168.1.1', authenticated: false, authType: 'anonymous' };
      expect(getClientIdentifier(req)).toBe('anon:192.168.1.1');
    });

    it('ignores X-Forwarded-For for anonymous requests', () => {
      const req = {
        ip: '192.168.1.1',
        authenticated: false,
        authType: 'anonymous',
        headers: { 'x-forwarded-for': '10.0.0.1, 10.0.0.2' },
        connection: { remoteAddress: '127.0.0.1' },
      };
      expect(getClientIdentifier(req)).toBe('anon:192.168.1.1');
    });

    it('falls back to unknown when req.ip is missing', () => {
      const req = { authenticated: false, authType: 'anonymous', headers: {} };
      expect(getClientIdentifier(req)).toBe('anon:unknown');
    });

    it('uses a 16-character hex sha256 hash for authenticated requests', () => {
      const req = {
        ip: '192.168.1.1',
        authenticated: true,
        authType: 'apikey',
        headers: { 'x-api-key': 'secret-key' },
      };
      const identifier = getClientIdentifier(req);
      expect(identifier).toMatch(/^auth:[a-f0-9]{16}$/);
      expect(identifier).toBe(getClientIdentifier({ ...req }));
      expect(identifier).not.toBe(
        getClientIdentifier({ ...req, headers: { 'x-api-key': 'other-key' } })
      );
    });
  });
});
