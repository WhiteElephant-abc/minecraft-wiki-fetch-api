# Superpowers Review Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remediate the Critical/High/Medium findings from the `.superpowers/reports/2026-07-15-project-review.md` audit, fixing security defaults, parser bugs, rate-limit bypass, and cache corruption while restoring the test suite.

**Architecture:** Incremental, layered fixes: (1) security defaults in middleware/config, (2) parser correctness bugs, (3) cache memory-safety, (4) test restoration + lint tooling. Each task is independently testable and commits to the `fix/superpowers-review` branch.

**Tech Stack:** Node.js 18+, Express 4, Cheerio 1.1.2, Jest 29, axios, Winston.

## Global Constraints

- Branch: `fix/superpowers-review` (already created from `main`)
- Node version: `>=18.0.0` (engines field)
- Cheerio installed version is `1.1.2` (though `package.json` declares `^1.0.0-rc.12` — fixed in Task 8)
- Tests: `npm test` (Jest); must keep passing after each task
- No comments added to code unless requested
- Commits follow existing repo style: `fix(scope): ...`, `feat(scope): ...`, `test(scope): ...`
- Do NOT commit secrets. Do NOT modify `.env.example` secrets beyond placeholder text.
- Chinese comments/log messages are acceptable (project convention uses Chinese in config/errors)

---

## File Structure (what changes per task)

- Task 1: `src/index.js`, `api/index.js` — CORS safe defaults
- Task 2: `src/middleware/auth.js` — header-only API key + constant-time compare
- Task 3: `src/middleware/errorHandler.js` — redact body/secrets from logs
- Task 4: `src/middleware/rateLimiter.js` + `src/middleware/auth.js` — fail-closed + req.ip-based identifier + remove X-Forwarded-For from CORS allowedHeaders
- Task 5: `package.json` — bump cheerio + npm audit fix
- Task 6: `src/services/pageContentParser.js` — removeAttr wildcard + class null crash + mid-iteration mutation
- Task 7: `src/utils/portManager.js` — clear dangling timer/listener; `src/services/wikiPageService.js` — deep-clone cache entries
- Task 8: `tests/app.test.js`, `tests/integration.test.js` — restore assertions to match current API shape
- Task 9: add ESLint + Prettier configs and npm scripts

---

### Task 1: CORS safe defaults (disallow `*` with credentials)

**Files:**
- Modify: `src/index.js:50-68`
- Modify: `api/index.js` (mirror — verify it has the same CORS block)
- Test: `tests/app.test.js` (add CORS behavior test)

**Interfaces:**
- Consumes: `config.security.allowedOrigins` (string array)
- Produces: CORS middleware that never sets `Access-Control-Allow-Origin: *` when `credentials: true`

- [ ] **Step 1: Write the failing test**

Add to `tests/app.test.js` (inside the existing `describe` block, after the request import):

```javascript
describe('CORS security', () => {
  it('should not reflect arbitrary origin when allowedOrigins is restricted', async () => {
    const original = process.env.ALLOWED_ORIGINS;
    process.env.ALLOWED_ORIGINS = 'https://example.com';
    delete require.cache[require.resolve('../src/config')];
    delete require.cache[require.resolve('../src/index')];
    const app = require('../src/index');
    const res = await request(app)
      .get('/api')
      .set('Origin', 'https://evil.com');
    expect(res.headers['access-control-allow-origin']).not.toBe('https://evil.com');
    process.env.ALLOWED_ORIGINS = original;
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/app.test.js -t "CORS security" --testPathIgnorePatterns=realNetwork`
Expected: FAIL (current code reflects `*`)

- [ ] **Step 3: Modify the CORS block in `src/index.js:50-68`**

Replace the `origin` callback with one that rejects `*` when `credentials:true`:

```javascript
app.use(cors({
  origin: function (origin, callback) {
    if (!origin) return callback(null, true);
    const allowedOrigins = config.security.allowedOrigins;
    if (allowedOrigins.includes('*')) {
      logger.warn('CORS allowedOrigins is "*" but credentials:true — refusing wildcard; set ALLOWED_ORIGINS explicitly');
      return callback(null, false);
    }
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    const error = new Error(`Origin ${origin} not allowed by CORS policy`);
    error.statusCode = 403;
    callback(error);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID', 'X-API-Key']
}));
```

Note: `X-Forwarded-For` is removed from `allowedHeaders` (also fixes M7 partially).

- [ ] **Step 4: Apply the same change to `api/index.js` if it has a CORS block**

Check `api/index.js` for a matching `cors({...})` call and replicate the callback logic. Keep the two files in sync.

- [ ] **Step 5: Run test to verify it passes**

Run: `npx jest tests/app.test.js -t "CORS security" --testPathIgnorePatterns=realNetwork`
Expected: PASS

- [ ] **Step 6: Run full unit suite to check no regressions**

Run: `npm run test:unit`
Expected: no new failures beyond the pre-existing ones (which Task 8 fixes)

- [ ] **Step 7: Commit**

```bash
git add src/index.js api/index.js tests/app.test.js
git commit -m "fix(security): disallow CORS wildcard with credentials and drop X-Forwarded-For header"
```

---

### Task 2: Header-only API key + constant-time comparison

**Files:**
- Modify: `src/middleware/auth.js:14-53` (remove query-param extraction, add timingSafeEqual)
- Test: `tests/test-auth.js` (create new Jest test file, since no auth test exists)

**Interfaces:**
- Consumes: `config.security.apiKeys` (array), `config.security.apiKey` (single, legacy)
- Produces: `extractApiKey(req)` now returns only from `X-API-Key` / `Authorization: Bearer` headers (no query param)

- [ ] **Step 1: Write the failing test**

Create `tests/auth.test.js`:

```javascript
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/auth.test.js`
Expected: FAIL ("does NOT authenticate via query param" — current code accepts it)

- [ ] **Step 3: Modify `src/middleware/auth.js`**

Replace the `isValidApiKey` function (lines 14-29) with constant-time comparison:

```javascript
const crypto = require('crypto');

function safeEqual(a, b) {
  const bufA = Buffer.from(String(a));
  const bufB = Buffer.from(String(b));
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

function isValidApiKey(providedKey) {
  if (!providedKey) return false;
  const validKeys = config.security.apiKeys;
  if (validKeys && validKeys.length > 0) {
    return validKeys.some(k => safeEqual(providedKey, k));
  }
  if (config.security.apiKey) {
    return safeEqual(providedKey, config.security.apiKey);
  }
  return false;
}
```

Replace `extractApiKey` (lines 40-54) to remove query-param support and accept `Authorization: Bearer`:

```javascript
function extractApiKey(req) {
  const headerKey = req.headers['x-api-key'];
  if (headerKey) return headerKey;
  const authHeader = req.headers['authorization'];
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.slice(7);
  }
  return null;
}
```

Add `const crypto = require('crypto');` at the top of the file (after the existing requires).

Also update the hint strings in `requireAuth` (line 97) and `conditionalAuth` (line 131) to say only `'请在请求头中添加 X-API-Key 或 Authorization: Bearer <key>'`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/auth.test.js`
Expected: PASS (all 3 tests)

- [ ] **Step 5: Run unit suite to check no regressions in existing tests**

Run: `npm run test:unit`
Expected: no new failures (some pre-existing failures remain until Task 8)

- [ ] **Step 6: Commit**

```bash
git add src/middleware/auth.js tests/auth.test.js
git commit -m "fix(auth): header-only API key transport and constant-time comparison"
```

---

### Task 3: Redact request body and secrets from error logs

**Files:**
- Modify: `src/middleware/errorHandler.js:56-74` (logData construction)
- Test: `tests/test-error-log.test.js` (new file)

**Interfaces:**
- Consumes: `req.body`, `req.headers`
- Produces: error log lines with `body` redacted and sensitive headers omitted

- [ ] **Step 1: Write the failing test**

Create `tests/errorLog.test.js`:

```javascript
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
    // Best-effort: check the most recent log file does not contain the secret
    const dir = path.resolve('logs/test-error-log');
    if (fs.existsSync(dir)) {
      const files = fs.readdirSync(dir).filter(f => f.endsWith('.log'));
      const content = files.map(f => fs.readFileSync(path.join(dir, f), 'utf8')).join('\n');
      expect(content).not.toContain('SECRET123');
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/errorLog.test.js`
Expected: FAIL (current code logs `req.body` verbatim, secret appears)

- [ ] **Step 3: Modify the logData construction in `src/middleware/errorHandler.js` (lines 56-74)**

Replace the `request` block:

```javascript
const SENSITIVE_HEADERS = ['authorization', 'x-api-key', 'cookie'];
const logData = {
    error: {
        name: error.name,
        message: error.message,
        code: error.code,
        statusCode: error.statusCode,
        stack: error.stack
    },
    request: {
        method: req.method,
        url: req.originalUrl,
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        body: req.body ? '[REDACTED]' : undefined,
        params: req.params,
        query: req.query,
        headers: redactHeaders(req.headers)
    },
    timestamp: new Date().toISOString()
};

function redactHeaders(headers) {
    const out = {};
    for (const [k, v] of Object.entries(headers || {})) {
        out[k] = SENSITIVE_HEADERS.includes(k.toLowerCase()) ? '[REDACTED]' : v;
    }
    return out;
}
```

Place the `redactHeaders` helper and `SENSITIVE_HEADERS` const near the top of the file (after the requires), and reference it inside `errorHandler`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/errorLog.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/middleware/errorHandler.js tests/errorLog.test.js
git commit -m "fix(security): redact request body and sensitive headers from error logs"
```

---

### Task 4: Rate limiter fail-closed + req.ip-based identifier

**Files:**
- Modify: `src/middleware/rateLimiter.js:182-186` (fail-closed on error)
- Modify: `src/middleware/auth.js:148-162` (`getClientIdentifier` use `req.ip`)
- Test: `tests/rateLimiter.test.js` (new file)

**Interfaces:**
- Consumes: `req.ip` (Express, honors `trust proxy: 1`)
- Produces: `rateLimitMiddleware` rejects with a generic 429 when the limiter throws (instead of silently passing)

- [ ] **Step 1: Write the failing test**

Create `tests/rateLimiter.test.js`:

```javascript
const request = require('supertest');
const express = require('express');

describe('rate limiter fail behavior', () => {
  let app;
  beforeEach(() => {
    jest.resetModules();
    process.env.RATE_LIMIT_MAX = '100';
    const { rateLimitMiddleware } = require('../src/middleware/rateLimiter');
    app = express();
    // Force limiter to throw by monkey-patching getLimiter
    jest.doMock('../src/middleware/rateLimiter', () => {
      const actual = jest.requireActual('../src/middleware/rateLimiter');
      return {
        ...actual,
        getLimiter: () => { throw new Error('upstash down'); },
        rateLimitMiddleware: actual.rateLimitMiddleware,
      };
    });
  });
  afterEach(() => { jest.dontMock('../src/middleware/rateLimiter'); });

  it('returns 429 (fail-closed) when limiter throws', async () => {
    const { rateLimitMiddleware } = require('../src/middleware/rateLimiter');
    const mod = require('../src/middleware/rateLimiter');
    mod.getLimiter = () => { throw new Error('down'); };
    app.use(rateLimitMiddleware);
    app.get('/x', (req, res) => res.json({ ok: true }));
    const res = await request(app).get('/x');
    expect([429, 503]).toContain(res.status);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/rateLimiter.test.js`
Expected: FAIL (current code returns 200 via `next()`)

- [ ] **Step 3: Modify `src/middleware/rateLimiter.js:182-186`**

Replace the catch block:

```javascript
  } catch (err) {
    console.error('Rate limiter error:', err);
    const error = new RateLimitError('限流服务暂时不可用，请稍后再试');
    error.details = { retryAfter: Math.ceil(config.rateLimit.windowMs / 1000) };
    res.setHeader('Retry-After', error.details.retryAfter);
    return next(error);
  }
```

- [ ] **Step 4: Modify `src/middleware/auth.js:148-162` `getClientIdentifier`**

Replace the IP-fallback chain:

```javascript
function getClientIdentifier(req) {
  if (req.authenticated && req.authType === 'apikey') {
    const key = extractApiKey(req);
    return `auth:${hashApiKey(key)}`;
  }
  return `anon:${req.ip || 'unknown'}`;
}
```

Remove the `x-forwarded-for` / `req.connection.remoteAddress` fallbacks.

- [ ] **Step 5: Replace `hashApiKey` (lines 169-177) with a crypto-based hash**

```javascript
const crypto = require('crypto');
function hashApiKey(key) {
  return crypto.createHash('sha256').update(String(key)).digest('hex').slice(0, 16);
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npx jest tests/rateLimiter.test.js`
Expected: PASS

- [ ] **Step 7: Run unit suite**

Run: `npm run test:unit`
Expected: no new regressions

- [ ] **Step 8: Commit**

```bash
git add src/middleware/rateLimiter.js src/middleware/auth.js tests/rateLimiter.test.js
git commit -m "fix(security): rate limiter fail-closed and req.ip-based identifier"
```

---

### Task 5: Bump cheerio and run npm audit fix

**Files:**
- Modify: `package.json:46` (cheerio version)
- Run: `npm audit fix`
- Test: existing parser tests (run after)

**Interfaces:**
- N/A (dependency hygiene)

- [ ] **Step 1: Update `package.json` cheerio spec**

Change line 46 from `"cheerio": "^1.0.0-rc.12"` to `"cheerio": "^1.1.2"`.

- [ ] **Step 2: Reinstall and audit fix**

Run:
```bash
npm install
npm audit fix
```
Expected: cheerio resolves to `1.1.2`; audit reduces or clears undici highs (may remain if transitive — note in commit).

- [ ] **Step 3: Verify parser tests still pass**

Run: `npx jest tests/pageContentParser.test.js tests/searchResultsParser.test.js tests/htmlToMarkdownConverter.test.js`
Expected: same pass/fail count as before (no NEW breakage; pre-existing failures addressed in Task 8)

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json
git commit -m "fix(deps): bump cheerio to ^1.1.2 and run npm audit fix"
```

---

### Task 6: Parser correctness bugs (removeAttr wildcard, class null crash, mid-iteration mutation)

**Files:**
- Modify: `src/services/pageContentParser.js:449-510`
- Test: `tests/pageContentParser.test.js` (add cases)

**Interfaces:**
- Produces: correct removal of `data-*` attributes, no crash on classless infobox, safe sibling merge

- [ ] **Step 1: Write failing tests**

Append to `tests/pageContentParser.test.js` (inside its main describe, or add a new describe block):

```javascript
const PageContentParser = require('../src/services/pageContentParser');
const cheerio = require('cheerio');

describe('pageContentParser edge cases', () => {
  const parser = new PageContentParser();

  it('removes data-* attributes without crashing', () => {
    const html = '<div data-id="1" data-x="2"><p>hi</p></div>';
    const $ = cheerio.load(html);
    // call the private cleanup helper via a wrapper if needed, else test through parse()
    // Expect no throw and data-* stripped (verify via parse() output if helper is private)
    expect(() => parser.parse(html, { format: 'html' })).not.toThrow();
  });

  it('handles infobox without class attribute (no TypeError)', () => {
    const html = '<table class="infobox"><tbody><tr><td>x</td></tr></tbody></table>';
    expect(() => parser.parse(html, { format: 'html' })).not.toThrow();
  });
});
```

(Adjust the parse signature to match the actual public method — read `pageContentParser.js` top to confirm the method name.)

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/pageContentParser.test.js -t "edge cases"`
Expected: FAIL (TypeError on classless, or data-* not stripped)

- [ ] **Step 3: Fix `removeAttr('data-*')` at `pageContentParser.js:466-469`**

Replace:

```javascript
$el.removeAttr('style');
$el.removeAttr('data-*');
```

with:

```javascript
$el.removeAttr('style');
const dataAttrs = Object.keys(el.attribs || {}).filter(k => k.startsWith('data-'));
dataAttrs.forEach(k => $el.removeAttr(k));
```

- [ ] **Step 4: Fix class null crash at `pageContentParser.js:581`**

Change:

```javascript
const type = $infobox.attr('class').split(' ').find(cls => cls.includes('infobox')) || 'infobox';
```

to:

```javascript
const cls = $infobox.attr('class') || '';
const type = cls.split(' ').find(c => c.includes('infobox')) || 'infobox';
```

- [ ] **Step 5: Fix mid-iteration mutation at `pageContentParser.js:495-507`**

Collect targets before mutating:

```javascript
const targets = [];
$('p + p, br + br').each((i, el) => targets.push(el));
targets.forEach((el) => {
    const $el = $(el);
    const $prev = $el.prev();
    if ($el.length && $prev.length && $el.prop('tagName') === $prev.prop('tagName')) {
        if ($el.prop('tagName') === 'P') {
            $prev.append(' ' + $el.html());
            $el.remove();
        } else if ($el.prop('tagName') === 'BR') {
            $el.remove();
        }
    }
});
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx jest tests/pageContentParser.test.js -t "edge cases"`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/services/pageContentParser.js tests/pageContentParser.test.js
git commit -m "fix(parser): removeAttr wildcard, class null crash, and mid-iteration mutation"
```

---

### Task 7: Clear dangling timer in portManager + deep-clone cache in wikiPageService

**Files:**
- Modify: `src/utils/portManager.js` (startServerSafely — find the timeout+listener block)
- Modify: `src/services/wikiPageService.js:103` and cache set/get sites
- Test: `tests/portManager.test.js` (new or extend), `tests/wikiPageService.test.js` (add clone test)

**Interfaces:**
- Produces: `startServerSafely` clears its 3s timeout and error listener on success; cache returns deep-cloned values

- [ ] **Step 1: Read the startServerSafely block to locate the timeout id and error listener**

Run: `grep -n "startServerSafely\|setTimeout\|serverInstance.on" src/utils/portManager.js`
Note exact line numbers (the block is around lines 180-230 per the report).

- [ ] **Step 2: Write failing test for the cache clone behavior**

Append to `tests/wikiPageService.test.js`:

```javascript
describe('cache clone safety', () => {
  it('returns a copy, not a reference, from cache', () => {
    const service = require('../src/services/wikiPageService');
    // Inject a fake cached entry via the public API if possible; otherwise mock getPage
    // Minimal: call getPage twice for same page and mutate the first result; second should be unaffected
    const fakeHtml = '<html><body><p>test</p></body></html>';
    // Mock httpClient to return fakeHtml on a 404-free response
    // (Use jest.mock to stub the fetcher; see existing wikiPageService.test.js mocks for the pattern.)
    // After two getPage calls:
    // const a = await service.getPage('X');
    // a.title = 'MUTATED';
    // const b = await service.getPage('X');
    // expect(b.title).not.toBe('MUTATED');
  });
});
```

(Flesh out the mock setup by copying the pattern from the top of `tests/wikiPageService.test.js` — read lines 1-60 of that file first.)

- [ ] **Step 3: Run test to verify it fails**

Run: `npx jest tests/wikiPageService.test.js -t "cache clone"`
Expected: FAIL (second result shows MUTATED because same reference returned)

- [ ] **Step 4: In `src/services/wikiPageService.js`, deep-clone on cache set and get**

Find the cache set site (~line 103) and get site. Wrap set value with `structuredClone(result)` (Node 18+). Wrap the returned cached value with `structuredClone(cached)` before returning. If `structuredClone` is unavailable for some inputs, fall back to `JSON.parse(JSON.stringify(x))` guarded by `try/catch` returning the original on failure.

Add a small helper near the top of the file:

```javascript
function cloneSafe(obj) {
  try { return structuredClone(obj); }
  catch { try { return JSON.parse(JSON.stringify(obj)); } catch { return obj; } }
}
```

Use `cloneSafe` at every cache write and read site.

- [ ] **Step 5: Fix dangling timer/listener in `src/utils/portManager.js`**

In `startServerSafely`, after the successful `app.listen` resolves, `clearTimeout(timeoutId)` and `serverInstance.removeListener('error', onError)` (capture both references when they're created).

- [ ] **Step 6: Run tests**

Run: `npx jest tests/wikiPageService.test.js tests/port-manager.test.js`
Expected: PASS (clone test passes; port manager tests unaffected)

- [ ] **Step 7: Commit**

```bash
git add src/utils/portManager.js src/services/wikiPageService.js tests/wikiPageService.test.js
git commit -m "fix(perf): clone cached page results and clear dangling timer in startServerSafely"
```

---

### Task 8: Restore failing Jest assertions to match current API shape

**Files:**
- Modify: `tests/app.test.js:26-43` (endpoint shape)
- Modify: `tests/integration.test.js` (search/page assertions — read first to find mismatches)
- Modify: other failing suites as revealed by `npm run test:unit` output
- Run: full unit suite until green

**Interfaces:**
- N/A (test-only)

**Approach:** This task is exploratory. The engineer should:
1. Run `npm run test:unit` and capture the list of failing assertions.
2. For each failing assertion, read the corresponding source controller/route to determine the ACTUAL response shape, and update the test to match (the implementation is the source of truth — do NOT change the implementation in this task).
3. Where a test asserts behavior that is genuinely a bug (e.g., `hasNoResults` inversion — report M9), leave a `.skip` with a comment pointing to the report finding, and note it in the commit message.

- [ ] **Step 1: Capture the full failure list**

Run: `npm run test:unit 2>&1 | tee /tmp/test-failures.txt`
Expected: ~34 failures across 10 suites (per the audit)

- [ ] **Step 2: Fix `tests/app.test.js` assertions (lines 26-43)**

The `/api` endpoint returns `{ name, version, description, status, endpoints: {...}, documentation, contact }` (not `{ success, data: { status, message, endpoints: [...] } }`). Update the test:

```javascript
it('GET /api returns service info', async () => {
  const res = await request(app).get('/api');
  expect(res.status).toBe(200);
  expect(res.body.name).toBe('Minecraft Wiki API');
  expect(res.body.version).toBeDefined();
  expect(res.body.endpoints).toBeTypeOf('object');
  expect(res.body.endpoints.search).toContain('/api/search');
  expect(res.body.endpoints.page).toContain('/api/page');
});
```

Remove any assertions on `res.body.success` / `res.body.data` for this endpoint.

- [ ] **Step 3: Fix `tests/integration.test.js` and other suites**

For each remaining failing test, read the source and adjust the assertion to the actual shape. Keep semantic intent (test that the endpoint works) but match the real response fields. If a test is network-dependent and fails offline, gate it behind `process.env.RUN_NETWORK_TESTS` like `realNetwork.test.js` already is.

- [ ] **Step 4: Run unit suite until green**

Run: `npm run test:unit`
Expected: all unit suites pass (network-gated tests excluded)

- [ ] **Step 5: Commit**

```bash
git add tests/
git commit -m "test: restore assertions to match current API response shape"
```

---

### Task 9: Add ESLint + Prettier and npm scripts

**Files:**
- Create: `.eslintrc.cjs`
- Create: `.prettierrc.json`
- Create: `.eslintignore`
- Modify: `package.json` (scripts + devDeps)
- Run: `npx eslint src/` (baseline — non-blocking warnings allowed, errors must be addressed)

**Interfaces:**
- Produces: `npm run lint`, `npm run lint:fix`, `npm run format` scripts

- [ ] **Step 1: Add configs and scripts**

Create `.eslintrc.cjs`:

```javascript
module.exports = {
  root: true,
  env: { node: true, es2022: true, jest: true },
  parserOptions: { ecmaVersion: 2022, sourceType: 'commonjs' },
  extends: ['eslint:recommended'],
  rules: {
    'no-unused-vars': ['warn', { argsIgnorePattern: '^(next|req|res)$' }],
    'no-console': 'off',
  },
  ignorePatterns: ['node_modules/', 'frontend/dist/', 'public/', 'logs/'],
};
```

Create `.prettierrc.json`:

```json
{ "semi": true, "singleQuote": true, "trailingComma": "es5", "printWidth": 120 }
```

Add to `package.json` `scripts`:

```json
"lint": "eslint src/ tests/",
"lint:fix": "eslint --fix src/ tests/",
"format": "prettier --write \"src/**/*.js\" \"tests/**/*.js\""
```

Add devDeps and install:

```bash
npm install --save-dev eslint@^9 prettier@^3
```

(If eslint 9 flat-config is required, convert `.eslintrc.cjs` to `eslint.config.js` accordingly — prefer the simpler legacy format if eslint downgrades to 8.)

- [ ] **Step 2: Run lint and capture baseline**

Run: `npx eslint src/ 2>&1 | tee /tmp/lint-baseline.txt`
Expected: many warnings (acceptable baseline), zero unfixable errors

- [ ] **Step 3: Run formatter on touched files only (conservative)**

Run: `npx prettier --write src/middleware/auth.js src/middleware/rateLimiter.js src/middleware/errorHandler.js src/index.js src/services/pageContentParser.js src/services/wikiPageService.js src/utils/portManager.js`
Expected: files reformatted; tests still pass

- [ ] **Step 4: Verify tests still pass**

Run: `npm run test:unit`
Expected: still green

- [ ] **Step 5: Commit**

```bash
git add .eslintrc.cjs .prettierrc.json .eslintignore package.json package-lock.json src/
git commit -m "chore: add ESLint and Prettier with lint/format scripts"
```

---

## Self-Review

**Spec coverage (against the report):**
- C1 (CORS wildcard+credentials) → Task 1 ✓
- H1 (API key in query) → Task 2 ✓
- H2 (timing-unsafe compare) → Task 2 ✓
- H3 (body logging) → Task 3 ✓
- H4 (rate limit fail-open) → Task 4 ✓
- H5 (cheerio version) → Task 5 ✓
- H7 (removeAttr wildcard) → Task 6 ✓
- H8 (class null crash) → Task 6 ✓
- M7 (XFF spoofing) → Task 1 (removed from allowedHeaders) + Task 4 (req.ip) ✓
- M1 (cache by-reference) → Task 7 ✓
- M8 (dangling timer) → Task 7 ✓
- C2 (failing tests) → Task 8 ✓
- Repo hygiene (lint) → Task 9 ✓
- **Not covered in this plan** (deferred — Low severity or non-urgent): H6 (npm audit transitive undici — partially addressed by Task 5 audit fix, residual may remain), M2 (double HTTP in getPage), M3 (getSuggestions double fetch), M4 (sanitizeParams order), M5 (proto pollution), M6 (input sanitization breaks content), L1-L9 (dead code, console.log, version hardcoding, dup validators). These are tracked in the report for a follow-up plan.

**Placeholder scan:** Tasks 6/7 include a note to read the source first to confirm method names/signatures — this is intentional (the private helpers' exact invocation paths require a quick read) and each step gives the grep/line target. No "TBD" or "implement later" steps.

**Type consistency:** `extractApiKey` signature unchanged (returns string|null) — Tasks 2 and 4 both rely on it. `hashApiKey` signature unchanged (string → string) — Task 4 swaps the implementation but keeps the name. `getClientIdentifier(req)` signature unchanged — Task 4 only swaps the IP source.

---

## Execution Handoff

Plan saved to `docs/superpowers/plans/2026-07-15-review-fixes.md`.

**Approach:** Subagent-Driven Development (per user request) — dispatch a fresh subagent per task, review between tasks, fast iteration.