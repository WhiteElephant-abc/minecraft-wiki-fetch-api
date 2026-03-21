# API Key 管理系统计划

> 状态：待定（未开始实施）

## 目标

为 Minecraft Wiki API 添加一个用户友好的 API Key 管理界面，允许用户通过 GitHub OAuth 登录后自行创建和管理 API Key。

---

## 功能需求

### 用户侧功能

- **OAuth 登录**：支持 GitHub 账号一键登录
- **API Key 管理**：
  - 创建新的 API Key（可设置备注、过期时间）
  - 查看已创建的 API Key 列表
  - 删除/撤销 API Key
  - 查看 API Key 使用统计（可选）
- **使用配额查看**：查看当前请求配额使用情况

### 管理侧功能（可选）

- 用户管理
- 全局限流配置
- 使用统计仪表盘

---

## 技术架构

```
┌─────────────────────────────────────────────────────────────────┐
│                        Frontend (React/Vue)                      │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐  │
│  │ Login Page  │  │ Dashboard   │  │ API Key Management     │  │
│  │ (OAuth)     │  │             │  │ - Create / Delete       │  │
│  └─────────────┘  └─────────────┘  │ - Usage Stats           │  │
│                                     └─────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                     Backend API Routes                           │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐  │
│  │ /auth/*     │  │ /api-keys/* │  │ /user/*                 │  │
│  │ OAuth flow  │  │ CRUD ops    │  │ Profile & Stats         │  │
│  └─────────────┘  └─────────────┘  └─────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                     Data Storage                                 │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │ Upstash Redis / Vercel KV                                   ││
│  │ - User sessions                                             ││
│  │ - API Keys (hashed)                                         ││
│  │ - User metadata                                             ││
│  └─────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────┘
```

---

## 实施步骤

### Phase 1: OAuth 基础设施

1. **创建 GitHub OAuth App**
   - 在 GitHub Settings → Developer settings → OAuth Apps 创建应用
   - 配置回调 URL：`https://your-domain.vercel.app/auth/callback`
   - 获取 `Client ID` 和 `Client Secret`

2. **添加依赖**
   ```bash
   npm install jose @auth/core next-auth-auth0
   # 或使用轻量级方案
   npm install cookie jose
   ```

3. **环境变量**
   ```
   GITHUB_CLIENT_ID=your-github-client-id
   GITHUB_CLIENT_SECRET=your-github-client-secret
   OAUTH_REDIRECT_URL=https://your-domain.vercel.app/auth/callback
   JWT_SECRET=your-jwt-secret-for-session
   ```

### Phase 2: 认证路由

创建以下路由：

```
/auth/login       - 重定向到 GitHub OAuth
/auth/callback    - OAuth 回调处理
/auth/logout      - 登出
/auth/me          - 获取当前用户信息
```

**核心代码示例**：

```javascript
// api/auth/login.js
export default function handler(req, res) {
  const params = new URLSearchParams({
    client_id: process.env.GITHUB_CLIENT_ID,
    redirect_uri: process.env.OAUTH_REDIRECT_URL,
    scope: 'read:user user:email',
    state: generateState() // 防止 CSRF
  });
  res.redirect(`https://github.com/login/oauth/authorize?${params}`);
}

// api/auth/callback.js
export default async function handler(req, res) {
  const { code, state } = req.query;
  
  // 验证 state
  // 用 code 换取 access_token
  // 获取用户信息
  // 创建 session JWT
  // 设置 cookie 并重定向到管理页面
}
```

### Phase 3: API Key 存储

使用 Upstash Redis 存储 API Key：

```javascript
// 数据结构
// user:{github_id} -> { email, name, avatar, created_at }
// apikeys:{github_id} -> [ { key_hash, prefix, note, created_at, expires_at }, ... ]
// key:{key_hash} -> { github_id, rate_limit_tier, created_at }

// api/api-keys/index.js
// GET  - 列出用户的 API Keys（不返回完整 key，只返回前缀）
// POST - 创建新的 API Key
// DELETE - 删除 API Key
```

### Phase 4: 前端界面

在 `public/` 目录下创建管理页面：

```
public/
├── index.html          # 现有 API 测试控制台
├── dashboard/
│   ├── index.html      # 仪表盘首页
│   ├── login.html      # 登录页面
│   └── api-keys.html   # API Key 管理页面
└── assets/
    └── dashboard.css   # 管理界面样式
```

**界面设计要点**：
- 简洁现代的设计风格（延续现有控制台风格）
- 响应式布局
- 创建 API Key 时显示一次完整 key（之后只显示前缀）
- 支持设置备注和过期时间

### Phase 5: 集成现有认证中间件

更新 `src/middleware/auth.js`：

```javascript
// 扩展 isValidApiKey 函数
// 支持从 Upstash Redis 验证用户创建的 API Key
async function isValidApiKey(providedKey) {
  // 1. 检查是否是管理员配置的静态 API Key
  if (config.security.apiKeys.includes(providedKey)) {
    return true;
  }
  
  // 2. 检查是否是用户创建的 API Key
  const keyHash = hashApiKey(providedKey);
  const keyData = await redis.get(`key:${keyHash}`);
  if (keyData) {
    req.apiKeyOwner = keyData.github_id;
    return true;
  }
  
  return false;
}
```

---

## 数据模型

### User

```json
{
  "github_id": "12345678",
  "login": "username",
  "email": "user@example.com",
  "name": "Display Name",
  "avatar_url": "https://avatars.githubusercontent.com/u/...",
  "created_at": "2024-01-01T00:00:00Z",
  "last_login": "2024-01-15T12:00:00Z"
}
```

### API Key

```json
{
  "key_hash": "abc123...",
  "key_prefix": "mcwa_abc...",  // 显示给用户看的前缀
  "note": "My development key",
  "created_at": "2024-01-01T00:00:00Z",
  "expires_at": "2025-01-01T00:00:00Z",  // 可选
  "last_used": "2024-01-15T12:00:00Z",
  "request_count": 1234
}
```

---

## 安全考虑

1. **API Key 存储**：只存储 key 的 hash 值，不存储明文
2. **Key 前缀**：使用 `mcwa_` 前缀便于识别
3. **CSRF 防护**：OAuth 流程使用 state 参数
4. **Session 管理**：JWT 存储在 httpOnly cookie 中
5. **Rate Limiting**：管理界面本身也需要限流

---

## 环境变量清单

```bash
# GitHub OAuth
GITHUB_CLIENT_ID=
GITHUB_CLIENT_SECRET=
OAUTH_REDIRECT_URL=

# Session
JWT_SECRET=

# Storage (复用现有的 Upstash)
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=

# 可选：管理功能
ADMIN_GITHUB_IDS=  # 管理员的 GitHub ID，逗号分隔
```

---

## 文件结构（预估）

```
api/
├── index.js              # 现有入口
├── auth/
│   ├── login.js          # OAuth 登录
│   ├── callback.js       # OAuth 回调
│   ├── logout.js         # 登出
│   └── me.js             # 获取当前用户
├── api-keys/
│   ├── index.js          # CRUD 操作
│   └── [id].js           # 单个 key 操作
└── user/
    └── stats.js          # 用户统计

src/
├── middleware/
│   ├── auth.js           # 更新：支持用户 API Key
│   └── session.js        # 新增：Session 验证
├── services/
│   ├── oauthService.js   # 新增：OAuth 处理
│   └── apiKeyService.js  # 新增：API Key 管理
└── utils/
    └── jwt.js            # 新增：JWT 工具

public/
├── index.html            # 现有
└── dashboard/
    ├── index.html
    ├── login.html
    └── api-keys.html
```

---

## 时间估算（仅供参考）

| 阶段 | 工作量 | 说明 |
|------|--------|------|
| Phase 1: OAuth 基础设施 | 小 | 配置 GitHub App，添加环境变量 |
| Phase 2: 认证路由 | 中 | 实现 OAuth 流程和 Session 管理 |
| Phase 3: API Key 存储 | 中 | Redis 数据模型和 CRUD 操作 |
| Phase 4: 前端界面 | 中 | 管理页面 UI 开发 |
| Phase 5: 集成测试 | 小 | 更新现有中间件，测试完整流程 |

---

## 可选扩展

1. **多种 OAuth 提供商**：支持 Google、GitLab 等
2. **API Key 配额**：不同用户不同配额
3. **Webhook 通知**：API Key 使用异常时通知
4. **审计日志**：记录 API Key 创建/删除操作
5. **团队协作**：支持创建团队，共享 API Key

---

## 开始实施前需要确认

- [ ] 是否需要多租户/团队功能？
- [ ] API Key 是否需要设置过期时间？
- [ ] 是否需要区分不同配额等级？
- [ ] 管理界面是否需要 i18n 支持？
- [ ] 是否需要邮件通知功能？

---

## 参考资源

- [GitHub OAuth Apps 文档](https://docs.github.com/en/developers/apps/building-oauth-apps)
- [Upstash Redis 文档](https://upstash.com/docs/redis)
- [Vercel KV 文档](https://vercel.com/docs/storage/vercel-kv)
- [JWT 最佳实践](https://auth0.com/blog/jwt-authentication-best-practices/)
