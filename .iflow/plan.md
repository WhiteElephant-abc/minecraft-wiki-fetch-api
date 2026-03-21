## 实施计划：API 速率限制与认证系统

### 架构设计

```
请求流程：
Request → Rate Limiter (Upstash) → Auth Middleware → Route Handler
              ↓                          ↓
         检查限流配额              验证 API Key
         (认证用户更高)            设置 req.authenticated
```

### 端点保护分级

| 端点 | 访问级别 | 说明 |
|------|---------|------|
| `/health/*` | 公开 | 健康检查，无限流 |
| `/api/search` | 公开 | 基础搜索，低限流 |
| `/api/page/:name` | 公开 | 单页面获取，低限流 |
| `/api/page/:name/exists` | 公开 | 存在检查 |
| `/api/pages` (POST) | 需认证 | 批量获取，高限流 |
| `/api/page/:name/cache` (DELETE) | 需认证 | 清除缓存 |
| `/*/stats` | 公开 | 统计信息 |

### 实施步骤

**1. 安装依赖** (`package.json`)
```
npm install @upstash/redis @upstash/ratelimit
```

**2. 扩展配置** (`src/config/index.js`)
- 添加 Upstash Redis 配置项
- 扩展 rateLimit 配置（区分 `anonymous` 和 `authenticated` 配额）
- 添加端点保护级别配置

**3. 创建认证中间件** (`src/middleware/auth.js`)
- 静态 API Key 验证
- 从 `X-API-Key` 请求头或 `api_key` 查询参数读取
- 设置 `req.authenticated = true/false`
- 支持多 API Key（逗号分隔）

**4. 创建速率限制中间件** (`src/middleware/rateLimiter.js`)
- 使用 `@upstash/ratelimit` 库
- 基于 IP + 认证状态作为限流 key
- 返回标准 `RateLimit-*` 响应头
- 健康检查端点跳过限流

**5. 更新路由保护**
- `src/routes/pages.js`: 保护 POST `/api/pages` 和 DELETE `/api/page/:name/cache`
- 创建路由中间件组合函数

**6. 更新入口文件** (`api/index.js`, `src/index.js`)
- 替换现有的内存限流为 Upstash 方案
- 添加认证中间件

**7. 更新环境变量**
- `.env.example`: 添加 Upstash 配置和分级限流说明
- `.env.vercel`: 优化 serverless 环境配置

### 新增环境变量

| 变量名 | 说明 | 示例 |
|--------|------|------|
| `UPSTASH_REDIS_REST_URL` | Upstash Redis REST URL | `https://xxx.upstash.io` |
| `UPSTASH_REDIS_REST_TOKEN` | Upstash Redis Token | `xxx...` |
| `API_KEY` | API 密钥（支持多个，逗号分隔） | `key1,key2,key3` |
| `RATE_LIMIT_ANONYMOUS` | 未认证用户配额 | `50` |
| `RATE_LIMIT_AUTHENTICATED` | 认证用户配额 | `200` |

### 配置便捷性
- 所有配置通过环境变量控制
- 未配置 `UPSTASH_*` 时自动降级到内存存储（开发友好）
- 未配置 `API_KEY` 时禁用认证（保持向后兼容）