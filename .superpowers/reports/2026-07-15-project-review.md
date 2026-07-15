# Superpowers 项目审查报告

**项目**: minecraft-wiki-fetch-api
**日期**: 2026-07-15
**审查范围**: 全栈安全、代码质量、测试、构建配置
**审查方式**: 并行子代理（安全/中间件、服务/工具层、路由/控制器/测试）+ 关键发现人工复核

---

## 执行摘要

项目整体架构清晰（分层 Express + 服务 + 中间件），配置系统完善。但存在若干**着急修复**的问题：

| 优先级 | 数量 | 代表问题 |
|---|---|---|
| 🔴 Critical | 2 | CORS 凭证+通配符默认值；测试套件大面积失效 |
| 🟠 High | 8 | API Key 通过 query 传输；body 全量入日志；限流 fail-open；cheerio 版本声明过期；15 项 npm 漏洞（8 high） |
| 🟡 Medium | 10 | 缓存按引用存储导致污染；双重 HTTP 请求；正则清洗 HTML；重复验证逻辑 |
| 🟢 Low | 9 | 死代码、硬编码版本、console.log 混用等 |

**复核结论**: 已手动验证 (1) `npm test` = 10 failed/17 suites，34/287 测试失败；(2) `npm audit` = 15 漏洞（8 high，undici）；(3) `package.json` 声明 `cheerio:^1.0.0-rc.12` 实装 `1.1.2`。

---

## 🔴 Critical

### C1. CORS `credentials:true` + 通配符默认源
- **位置**: `src/index.js:50-65`、`api/index.js`、`src/config/index.js:95`、`.env.example:180`
- **问题**: `allowedOrigins` 默认 `['*']`，CORS 回调对通配符返回 `true`（反射请求源），同时 `credentials: true`。任意网站可发起带凭证的跨域请求，绕过同源保护。
- **建议**: 默认空数组并强制生产环境显式配置；或检测到 `*` 时强制 `credentials:false`。

### C2. 测试套件大面积失效（质量门禁缺失）
- **位置**: `tests/app.test.js:26-43` 等多个文件
- **问题**: 实测 `npm test` → 10 failed / 17 suites，34/287 测试失败。`app.test.js` 断言 `body.success`/`data.status`/`endpoints 数组`，但 `src/index.js:126-145` 实际返回扁平 `{ name, version, endpoints:{...} }`。测试与实现长期分叉，关键路径实际无有效覆盖。无 ESLint/Prettier/typecheck 兜底。
- **建议**: 修复或重写失配测试；新增断言裸跑 `test-*.js` 脚本（见 H3）；引入 ESLint+Prettier+CI 门禁。

---

## 🟠 High

### H1. API Key 通过查询参数传输
- **位置**: `src/middleware/auth.js:48-51`
- **问题**: 支持 `?api_key=`，会写入服务日志、反向代理日志、浏览器历史、Referer，并经 `req.originalUrl` 被 `errorHandler` 回显（`errorHandler.js:27,67`）。
- **建议**: 仅接受 `Authorization`/`X-API-Key` 头。

### H2. API Key 比较非恒定时间
- **位置**: `auth.js:20,25`（`includes` / `===`）
- **建议**: 使用 `crypto.timingSafeEqual`（先哈希到等长）。

### H3. 错误日志记录完整请求体
- **位置**: `src/middleware/errorHandler.js:69`
- **问题**: `logData.request.body = req.body` 对所有 4xx/5xx 记录，可能含 API Key/凭证/PII。
- **建议**: 脱敏 body 与 Authorization/API-Key 头。

### H4. 限流 fail-open
- **位置**: `src/middleware/rateLimiter.js:182-186`
- **问题**: 限流器抛错时 `return next()` 放行；攻击者诱导 Upstash 配额耗尽即可绕过限流。
- **建议**: 对认证路径 fail-closed，或回退到保守默认配额。

### H5. `cheerio` 版本声明过期
- **位置**: `package.json:46` = `"^1.0.0-rc.12"`，实装 `1.1.2`
- **建议**: 改为 `"^1.1.2"`，避免 lockfile 重新解析时被拉回 RC。

### H6. 依赖漏洞 15 项（8 high）
- 主要为 `undici`（4 条 high）+ `qs`/`picomatch`。
- **建议**: `npm audit fix`，必要时 `--force` 并回归测试。

### H7. `removeAttr('data-*')` 无效
- **位置**: `src/services/pageContentParser.js:469`
- **问题**: cheerio `removeAttr` 不支持通配模式，`data-*` 属性从未移除。
- **建议**: 遍历 `Object.keys(el.attribs).filter(k=>k.startsWith('data-'))` 逐个删除。

### H8. `.attr('class').split(' ')` 空崩
- **位置**: `pageContentParser.js:581`
- **问题**: 无 class 时 `.attr()` 返回 `undefined`，`.split` 抛 TypeError。
- **建议**: `($infobox.attr('class') || '').split(' ')`。

---

## 🟡 Medium

### M1. 缓存按引用存储/返回 → 跨请求污染
- **位置**: `wikiPageService.js:103,571,598,608`
- **建议**: set/get 时 `structuredClone` 或 `JSON.parse(JSON.stringify())`。

### M2. `getPage()` 双重 HTTP 往返
- **位置**: `wikiPageService.js:114`
- **问题**: 先 `checkPageExists()` 再 `fetchPageHtml()`，延迟翻倍，后者已能判存在性。
- **建议**: 合并存在性检测到 HTML 抓取（404/缺失页标记）。

### M3. `getSuggestions()` 双重抓取
- **位置**: `wikiSearchService.js:160-181`
- **问题**: 先调用 `this.search()`，再对同 URL 发第二次请求提取建议，且忽略 `normalizedKeyword`。
- **建议**: 复用首次请求的 HTML。

### M4. `sanitizeParams` 在 body 解析前运行（无效）
- **位置**: `src/index.js:83-86`（`sanitizeParams` 在 `express.json()` 之前）
- **建议**: 移到 body 解析之后，或限定于 `req.query`/`req.params`。

### M5. `sanitizeObject` 未屏蔽 `__proto__`/`constructor`
- **位置**: `errorHandler.js:299-312`
- **建议**: 显式过滤危险键。

### M6. 输入清洗破坏合法内容
- **位置**: `errorHandler.js:294-320`
- **问题**: 全局剥离 `javascript:`/`on\w+=`/`<script>`，会损坏含这些子串的 wiki 页名/搜索词。
- **建议**: 改为输出处编码/转义，不要改写用户原始输入。

### M7. 限流标识可经 `X-Forwarded-For` 伪造
- **位置**: `auth.js:156-161`、`index.js:27,67`
- **问题**: 未用 Express `req.ip`（已遵守 `trust proxy`），且 CORS `allowedHeaders` 放行 `X-Forwarded-For`，客户端可轮换该头获得新桶。
- **建议**: 仅用 `req.ip`；移除该头出 `allowedHeaders`。

### M8. `startServerSafely` 悬挂定时器/监听器
- **位置**: `portManager.js:204-221`
- **问题**: 3s `setTimeout` 与 `error` 监听在成功后未清理，悬挂泄漏。
- **建议**: 成功路径 `clearTimeout` + `removeListener`。

### M9. `searchResultsParser.hasNoResults()` 逻辑疑似反转
- **位置**: `searchResultsParser.js:355-368`
- **问题**: `.mw-search-exists` 在 MediaWiki 中表示"存在匹配"，却用作无结果标志。
- **建议**: 复核并反转语义。

### M10. 正则剥离 HTML 属性（脆弱）
- **位置**: `htmlToMarkdownConverter.js:258-278`
- **建议**: 改用 Cheerio 解析后删属性，避免误伤引号内子串。

---

## 🟢 Low

| # | 位置 | 问题 |
|---|---|---|
| L1 | `config/default.js` | 死文件（32 行，无引用） |
| L2 | `routes/index.js:37` | `healthRoutes` 冗余导出 |
| L3 | `healthController.js:46,214` 等 | 硬编码 `1.0.0`，应读 `npm_package_version` |
| L4 | `searchResultsParser.js:226-253` | `_extractNamespace` 与 `_extractNamespaceFromElement` 重复 |
| L5 | `pageContentParser.js:673` / `htmlToMarkdownConverter.js:542` | `_countWords` 重复实现 |
| L6 | `searchResultsParser.js:110,145` / `memoryCache.js:177` | 用 `console.*` 而非 Winston |
| L7 | `httpClient.js:75-84` | debug 日志含完整响应头，可能泄漏 Set-Cookie |
| L8 | `wikiPageService.js:401` | `wordCount` 实为字符数 |
| L9 | `logger.js:186-197` | `logError` 未保护非 Error 入参 |

---

## 其他观察

- **无 lint/format/typecheck 工具**: 建议引入 ESLint + Prettier，并加入 CI 门禁（与 C2 联动）。
- **`tests/test-*.js` 假测试**: 8+ 个独立脚本基本只 `console.log` 无断言，位于 `tests/` 被误当覆盖；建议迁移到 `scripts/` 或转 Jest。
- **重复验证逻辑**: `validation.js` 中间件与各 Controller 各做一遍校验，易分叉；保留单一来源。
- **HSTS/CSP**: `unsafe-inline` 样式；HSTS 无条件 `includeSubDomains + preload`，建议 gate 到生产环境。
- **body limit `10mb` + 允许 `multipart/form-data`**: 本 API 不消费多部分，建议降至 `1mb` 并移除该类型。
- **`node-fetch` 与 `axios` 同时存在**: 依赖冗余，考虑统一。

---

## 建议修复顺序

1. **C1 CORS** + **H1/H2/H3 API Key**（安全默认值，最快收益）
2. **H4 限流 fail-open** + **M7 XFF 伪造**
3. **C2 测试修复** + 引入 ESLint/Prettier（恢复质量门禁）
4. **H5/H6 依赖升级**
5. **H7/H8 解析器 bug**（影响输出正确性）
6. **M1-M10** 缓存/性能/输入处理
7. **Low 清理**

---

*报告由 superpowers 工作流生成：并行子代理审查 + 关键发现人工复核（npm test / npm audit 实测）。*