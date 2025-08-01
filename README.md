# Minecraft Wiki API

一个功能完善的 RESTful API 服务，用于抓取、解析和转换 Minecraft Wiki 的内容。

[![Node.js](https://img.shields.io/badge/Node.js-18+-green.svg)](https://nodejs.org/)
[![License](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![API Version](https://img.shields.io/badge/API-v1.0.0-orange.svg)](docs/API_DOCUMENTATION.md)

## ✨ 核心功能

- 🔍 **智能搜索**: 关键词搜索，相关度排序，分页浏览
- 📄 **页面解析**: HTML/Markdown 格式输出，完整内容提取
- 📦 **批量处理**: 支持批量获取多个页面内容
- 💾 **智能缓存**: 多层缓存机制，提升响应速度
- 🚦 **访问控制**: IP 限流，安全防护，健康监控

## 🚀 快速开始

### 环境要求
- Node.js 18.0.0+
- npm 或 yarn

### 安装启动
```bash
# 1. 安装依赖
npm install

# 2. 配置环境变量
cp .env.example .env

# 3. 启动服务
npm run dev  # 开发模式
npm start    # 生产模式

# 4. 验证服务
curl http://localhost:3000/health
```

## 🔧 技术栈

- **后端**: Express.js + Node.js 18+
- **解析**: Cheerio (HTML) + Turndown (Markdown)
- **安全**: Helmet + CORS + Rate Limiting
- **日志**: Winston 结构化日志
- **测试**: Jest + Supertest

## 📚 API 使用

### 基础示例
```bash
# 搜索内容
GET /api/search?q=钻石&limit=10

# 搜索内容（格式化JSON）
GET /api/search?q=钻石&limit=10&pretty=true

# 获取页面
GET /api/page/钻石?format=markdown

# 获取页面（格式化JSON）
GET /api/page/钻石?format=markdown&pretty=true

# 批量获取
POST /api/pages
{"pages": ["钻石", "金锭"], "format": "markdown"}

# 健康检查
GET /health
```

### 🎨 JSON格式化功能

支持通过 `pretty` 参数控制JSON响应格式：

```bash
# 压缩格式（默认）
curl "http://localhost:3000/api/search?q=钻石"

# 格式化输出（便于阅读）
curl "http://localhost:3000/api/search?q=钻石&pretty=true"
```

**支持的参数值**: `true/false`, `1/0`, `yes/no` (大小写不敏感)

**详细 API 文档**: [API_DOCUMENTATION.md](docs/API_DOCUMENTATION.md)

## ⚙️ 配置

主要环境变量：
- `PORT`: 服务器端口 (默认: 3000)
- `WIKI_BASE_URL`: Wiki 基础 URL
- `RATE_LIMIT_MAX`: 每分钟最大请求数 (默认: 100)
- `CACHE_TTL`: 缓存过期时间 (默认: 1800s)

**完整配置指南**: [environment-variables-guide.md](docs/environment-variables-guide.md)

## 🧪 测试

```bash
npm test              # 运行所有测试
npm run test:unit     # 单元测试
npm run test:coverage # 覆盖率报告
```

## 📖 文档

- [📋 API 接口文档](docs/API_DOCUMENTATION.md) - 完整的 API 使用指南
- [⚙️ 环境变量配置指南](docs/environment-variables-guide.md) - 详细的配置说明
- [🏗️ 项目架构文档](docs/PROJECT_STRUCTURE.md) - 项目结构和技术架构

## 📄 许可证

- **项目代码**: [MIT License](./LICENSE)
- **Wiki 内容**: [CC BY-NC-SA 3.0]((https://creativecommons.org/licenses/by-nc-sa/3.0/deed.zh)) (来自中文 Minecraft Wiki)

> ⚠️ **重要提醒**: 本项目获取的 Wiki 内容遵循 CC BY-NC-SA 3.0 许可协议。

## 数据来源版权声明

### Minecraft Wiki 内容

本项目通过 API 获取的 Minecraft Wiki 内容遵循以下版权声明：

**来源**: [中文 Minecraft Wiki](https://zh.minecraft.wiki)

**许可协议**: [知识共享 署名-非商业性使用-相同方式共享 3.0 未本地化版本 (CC BY-NC-SA 3.0)](https://creativecommons.org/licenses/by-nc-sa/3.0/deed.zh)

#### 使用条件

根据 [CC BY-NC-SA 3.0]((https://creativecommons.org/licenses/by-nc-sa/3.0/deed.zh)) 许可协议，使用本项目获取的 Wiki 内容时，您必须遵循以下规则：

1. **署名** - 注明内容来自中文 Minecraft Wiki
2. **非商业性使用** - 不得将内容用于商业目的
3. **相同方式共享** - 如果修改或演绎内容，必须采用相同许可协议发布

#### 内容归属

- **Mojang 内容**: 版权归 Mojang Studios 所有，遵循《Minecraft 使用准则》
- **特别注明内容**: 版权归原作者所有
- **其他内容**: 遵循 CC BY-NC-SA 3.0 许可协议

### 重要提醒

1. **本项目仅提供技术工具**，用于访问和解析公开的 Wiki 内容
2. **用户有责任**遵守相关版权法律和许可协议
3. **商业使用**前请确保获得适当的授权
4. **转载内容**时请注明来自中文 Minecraft Wiki

## 免责声明

1. 本项目不拥有任何 Minecraft Wiki 内容的版权
2. 本项目不对通过 API 获取的内容的准确性、完整性或时效性承担责任
3. 用户使用本项目获取的内容时，应自行承担相关法律责任
4. 如有版权争议，请联系项目维护者进行处理

## 🆘 支持

- 问题报告: [GitHub Issues](https://github.com/rice-awa/minecraft-wiki-fetch-api/issues)
- 联系作者: [issue@rice-awa.top](issue@rice-awa.top) 

---

**Made with ❤️ for the Minecraft community**