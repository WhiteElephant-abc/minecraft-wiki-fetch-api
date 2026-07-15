const request = require('supertest');
const express = require('express');
const path = require('path');
const fs = require('fs');

describe('error log redaction', () => {
  let app;
  beforeEach(() => {
    jest.resetModules();
    process.env.LOG_FILE = 'true';
    process.env.LOG_DIR = 'logs/test-error-log';
    const logDir = path.resolve('logs/test-error-log');
    if (fs.existsSync(logDir)) {
      fs.rmSync(logDir, { recursive: true, force: true });
    }
    const { asyncHandler } = require('../src/middleware/errorHandler');
    app = express();
    app.use(express.json());
    app.use(asyncHandler(async (req, res) => {
      if (req.body.trigger) throw new Error('boom');
      res.json({ ok: true });
    }));
    const { errorHandler } = require('../src/middleware/errorHandler');
    app.use(errorHandler);
  });

  it('does not log full body contents', async () => {
    await request(app).post('/').send({ trigger: true, api_key: 'SECRET123' });
    const dir = path.resolve('logs/test-error-log');
    if (fs.existsSync(dir)) {
      const files = fs.readdirSync(dir).filter(f => f.endsWith('.log'));
      const content = files.map(f => fs.readFileSync(path.join(dir, f), 'utf8')).join('\n');
      expect(content).not.toContain('SECRET123');
    }
  });
});
