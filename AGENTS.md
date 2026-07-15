# AGENTS.md

本文件为 OpenCode 会话提供仓库专属指引。Minecraft Wiki API 是一个 Node.js/Express 服务，用于抓取、解析并转换中文 Minecraft Wiki 内容。

## 部署入口与运行方式

项目同时支持三种运行形态，入口文件不同：

- **本地/服务器常驻**：`src/index.js`
  - `npm run dev`：nodemon 开发模式，监听文件变更
  - `npm start`：生产模式启动
  - 默认端口 `3000`，开启 `AUTO_PORT=true` 时若被占用会自动寻找可用端口
- **Vercel Serverless**：`api/index.js`
  - `npm run dev:serverless` / `vercel dev`：本地模拟 Serverless
  - `npm run deploy` / `vercel --prod`：生产部署
  - `vercel.json` 控制路由：`/api`、`/api/*`、`/health`、`/health/*` 全部转发到 `api/index.js`
- **Docker**：`docker compose up -d`
  - 容器内固定 `PORT=3000`、`AUTO_PORT=false`
  - 默认 `RATE_LIMIT_STORE=memory`、`LOG_FILE=false`

## 前端控制台

- 源码在 `frontend/`，使用 Vue + Vite
- 构建命令：`npm run build`（产出到 `frontend/dist`）
- 开发命令：`npm run frontend:dev`
- `src/index.js` 会优先提供 `frontend/dist`，未构建时回退到 `public/`
- Vercel 通过 `package.json` 的 static-build 构建前端，`vercel.json` 将根路径指向 `index.html`

## 常用开发与测试命令

- `npm test`：运行全部 Jest 测试（默认不含真实网络请求测试）
- `npm run test:unit`：排除 `tests/realNetwork.test.js`
- `npm run test:network`：单独运行真实网络请求测试，依赖外部 Wiki 可达
- `npm run test:coverage`：生成覆盖率报告，阈值 80%（分支/函数/行/语句）
- `npm run test:watch`：监听模式运行测试

测试配置见 `jest.config.js`：测试文件匹配 `tests/**/*.test.js`，`src/index.js` 不计入覆盖率。

## 项目结构

- `src/index.js`：传统服务器入口
- `api/index.js`：Vercel Serverless 入口
- `src/routes/`：路由定义（search、page、health），`pages.js` 同时挂载到 `/api/page` 和 `/api/pages`
- `src/controllers/`：请求处理逻辑
- `src/services/`：核心业务（URL 构建、HTML 解析、Markdown 转换、Wiki 页面抓取）
- `src/middleware/`：错误处理、认证、限流、参数校验、JSON 格式化
- `src/utils/`：日志、HTTP 客户端、内存缓存、端口管理、错误类
- `src/config/index.js`：统一配置管理，模块加载时即校验

## 配置与环境变量

配置集中在 `src/config/index.js`，加载时调用 `dotenv.config()` 并立即执行 `validateConfig()`，校验失败会直接 `process.exit(1)`。

开发前可复制 `.env.example` 为 `.env` 并按需调整。关键变量：

- `PORT`：默认 `3000`
- `HOST`：默认 `0.0.0.0`
- `NODE_ENV`：`development` / `production` / `test`
- `WIKI_BASE_URL`：默认 `https://zh.minecraft.wiki`
- `REQUEST_TIMEOUT`：默认 `10000` ms
- `MAX_RETRIES`：默认 `3`
- `RATE_LIMIT_STORE`：`memory` / `redis` / `upstash`，默认 `memory`
- `RATE_LIMIT_ANONYMOUS` / `RATE_LIMIT_AUTHENTICATED`：默认 `50` / `200`
- `API_KEY`：支持多个 Key，逗号分隔
- `ALLOWED_ORIGINS`：默认 `*`
- `AUTO_PORT`：默认 `true`

> **CORS 陷阱**：`ALLOWED_ORIGINS=*` 时，由于代码中设置了 `credentials: true`，服务端会拒绝通配符并返回 403。生产环境务必显式设置具体来源，多个用逗号分隔。

## 认证与限流

- `API_KEY` 通过请求头 `X-API-Key` 或 `Authorization: Bearer <key>` 传递
- 受保护端点：
  - `POST /api/pages`：批量获取（由 `REQUIRE_AUTH_FOR_BATCH` 控制，默认需认证）
  - `DELETE /api/page/:pageName/cache`：清除缓存（由 `REQUIRE_AUTH_FOR_CACHE_CLEAR` 控制，默认需认证）
- `/health/*`、`GET /api/search`、`GET /api/page/:name` 默认公开
- 限流在 `src/middleware/rateLimiter.js` 中实现，未配置 Upstash 时自动降级为内存存储

## 开发注意事项

- 新增环境变量后，需在 `src/config/index.js` 中读取并加入 `validateConfig()` 校验（如适用）
- `tests/setup.js` 会将 `NODE_ENV` 设为 `test`，`PORT` 设为 `0`（随机端口），日志级别设为 `error`
- 真实网络测试位于 `tests/realNetwork.test.js`，运行前确认网络可达，避免在 CI 中默认执行
- Vercel 部署必须确保 `vercel.json` 随代码一起提交，否则 `/health` 等路径会 404
