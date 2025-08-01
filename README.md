# Minecraft Wiki API

一个用于抓取和转换 Minecraft 中文 Wiki 内容的 API 服务。

## 项目结构

```
minecraft-wiki-api/
├── src/                    # 源代码目录
│   └── index.js           # 主应用入口文件
├── tests/                  # 测试文件目录
│   ├── setup.js           # Jest 测试配置
│   └── app.test.js        # 应用基础测试
├── config/                 # 配置文件目录
│   └── default.js         # 默认配置文件
├── logs/                   # 日志文件目录
├── .env.example           # 环境变量示例文件
├── jest.config.js         # Jest 测试配置
└── package.json           # 项目依赖和脚本配置
```

## 核心依赖

- **express**: Web 框架
- **axios**: HTTP 客户端，用于发送请求
- **cheerio**: 服务端 jQuery，用于 HTML 解析
- **turndown**: HTML 转 Markdown 转换器
- **winston**: 日志记录库
- **cors**: 跨域资源共享中间件
- **helmet**: 安全中间件
- **express-rate-limit**: 请求频率限制中间件
- **dotenv**: 环境变量管理

## 开发依赖

- **nodemon**: 开发时自动重启服务器
- **jest**: 测试框架
- **supertest**: HTTP 断言库

## 快速开始

1. 安装依赖：
```bash
npm install
```

2. 复制环境变量文件：
```bash
cp .env.example .env
```

3. 启动开发服务器：
```bash
npm run dev
```

4. 运行测试：
```bash
npm test
```

## API 端点

- `GET /health` - 健康检查
- `GET /api` - API 信息和可用端点列表

## 环境变量

参考 `.env.example` 文件配置以下环境变量：

- `PORT`: 服务器端口 (默认: 3000)
- `NODE_ENV`: 运行环境 (development/production)
- `WIKI_BASE_URL`: Wiki 基础 URL
- `LOG_LEVEL`: 日志级别 (info/debug/error)
- `RATE_LIMIT_WINDOW`: 限流时间窗口
- `RATE_LIMIT_MAX`: 限流最大请求数