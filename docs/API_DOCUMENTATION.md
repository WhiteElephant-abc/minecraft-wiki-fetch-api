# Minecraft Wiki API 文档

## 概述

Minecraft Wiki API 是一个用于抓取和处理 Minecraft 中文 Wiki 内容的 RESTful API 服务。支持搜索功能、页面内容获取，并提供 HTML 和 Markdown 两种格式输出。

**基础URL**: `http://localhost:3000`  
**API版本**: v1.0.0  
**内容类型**: `application/json`

## 快速开始

### 启动服务器
```bash
npm start
# 或者
npm run dev  # 开发模式
```

服务器启动后访问 http://localhost:3000 查看所有可用端点。

## API 端点

### 1. 搜索 API

#### GET /api/search
搜索 Minecraft Wiki 内容

**查询参数:**
- `q` (必需): 搜索关键词
- `limit` (可选): 结果数量限制，默认10，最大50
- `namespaces` (可选): 命名空间，多个用逗号分隔
- `format` (可选): 响应格式，默认 json

**示例请求:**
```
GET /api/search?q=钻石&limit=5
GET /api/search?q=redstone&namespaces=0,14&limit=10
```

**响应示例:**
```json
{
  "success": true,
  "data": {
    "query": "钻石",
    "results": [
      {
        "title": "钻石",
        "url": "https://zh.minecraft.wiki/w/钻石",
        "snippet": "钻石是游戏中最珍贵的材料之一...",
        "namespace": "主命名空间",
        "timestamp": "2024-01-01T12:00:00Z"
      }
    ],
    "pagination": {
      "limit": 5,
      "totalHits": 25,
      "hasMore": true
    },
    "metadata": {
      "searchTime": 1234,
      "fromCache": false,
      "timestamp": "2024-01-01T12:00:00Z"
    }
  }
}
```

#### GET /api/search/stats
获取搜索服务统计信息

**响应示例:**
```json
{
  "success": true,
  "data": {
    "cache": {
      "enabled": true,
      "size": 42,
      "maxSize": 100
    },
    "service": {
      "uptime": 3600,
      "memory": {...},
      "timestamp": "2024-01-01T12:00:00Z"
    }
  }
}
```

### 2. 页面内容 API

#### GET /api/page/:pageName
获取指定页面的完整内容

**路径参数:**
- `pageName` (必需): 页面名称，支持 URL 编码

**查询参数:**
- `format` (可选): 输出格式 - `html`, `markdown`, `both`，默认 `both`
- `useCache` (可选): 是否使用缓存，默认 `true`
- `includeMetadata` (可选): 是否包含元数据，默认 `true`

**示例请求:**
```
GET /api/page/钻石
GET /api/page/%E9%92%BB%E7%9F%B3?format=markdown
GET /api/page/Diamond?format=html&useCache=false
```

**响应示例:**
```json
{
  "success": true,
  "data": {
    "page": {
      "pageName": "钻石",
      "url": "https://zh.minecraft.wiki/w/钻石",
      "title": "钻石",
      "subtitle": "来自Minecraft Wiki",
      "categories": [
        {
          "name": "材料",
          "url": "https://zh.minecraft.wiki/wiki/Category:Materials"
        }
      ],
      "content": {
        "html": "...",
        "markdown": "# 钻石\n\n**钻石**是游戏中最珍贵的材料之一。\n\n## 获取\n...",
        "text": "钻石是游戏中最珍贵的材料之一...",
        "components": {
          "sections": [...],
          "images": [...],
          "tables": [...],
          "infoboxes": [...],
          "toc": {...}
        }
      },
      "meta": {
        "wordCount": 1234,
        "imageCount": 5,
        "tableCount": 2,
        "sectionCount": 8,
        "processingTime": 1678901234
      }
    },
    "metadata": {
      "requestTime": 1500,
      "format": "both",
      "timestamp": "2024-01-01T12:00:00Z"
    }
  }
}
```

#### POST /api/pages
批量获取多个页面内容

**请求体:**
```json
{
  "pages": ["钻石", "金锭", "铁锭"],
  "format": "markdown",
  "concurrency": 3,
  "useCache": true
}
```

**响应示例:**
```json
{
  "success": true,
  "data": {
    "results": {
      "钻石": {
        "success": true,
        "data": {...}
      },
      "金锭": {
        "success": true,
        "data": {...}
      }
    },
    "summary": {
      "totalPages": 3,
      "successCount": 2,
      "errorCount": 1
    },
    "metadata": {
      "requestTime": 3000,
      "format": "markdown",
      "timestamp": "2024-01-01T12:00:00Z"
    }
  }
}
```

#### GET /api/page/:pageName/exists
检查页面是否存在

**响应示例:**
```json
{
  "success": true,
  "data": {
    "pageName": "钻石",
    "exists": true,
    "pageInfo": {
      "title": "钻石",
      "pageid": 12345
    },
    "redirected": false
  }
}
```

#### DELETE /api/page/:pageName/cache
清除页面缓存

**路径参数:**
- `pageName`: 页面名称或 `all` 清除所有缓存

**响应示例:**
```json
{
  "success": true,
  "message": "页面 \"钻石\" 的缓存已清除"
}
```

#### GET /api/pages/stats
获取页面服务统计信息

### 3. 健康检查 API

#### GET /health
基础健康检查

**响应示例:**
```json
{
  "status": "healthy",
  "timestamp": "2024-01-01T12:00:00Z",
  "uptime": {
    "seconds": 3600,
    "human": "1小时"
  },
  "memory": {
    "used": "45MB",
    "total": "128MB",
    "system": "256MB"
  },
  "service": {
    "name": "minecraft-wiki-api",
    "version": "1.0.0",
    "environment": "development"
  }
}
```

#### GET /health/detailed
详细健康检查（包含依赖服务检查）

#### GET /health/ready
就绪状态检查

#### GET /health/live
存活状态检查

## 错误响应格式

所有错误响应都遵循统一格式：

```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "错误描述",
    "details": "详细信息或建议（可选）",
    "timestamp": "2024-01-01T12:00:00Z"
  }
}
```

### 常见错误码

- `INVALID_PARAMETERS`: 请求参数无效 (400)
- `PAGE_NOT_FOUND`: 页面不存在 (404)
- `RATE_LIMIT_EXCEEDED`: 请求频率超限 (429)
- `INTERNAL_SERVER_ERROR`: 服务器内部错误 (500)
- `SEARCH_ERROR`: 搜索服务错误 (500)
- `PARSE_ERROR`: 内容解析错误 (500)

## 限制和配额

- **请求频率限制**: 默认每分钟100次请求
- **搜索结果限制**: 单次最多50个结果
- **批量页面限制**: 单次最多20个页面
- **并发限制**: 批量请求最多5个并发
- **请求体大小**: 最大10MB

## 缓存机制

API 使用智能缓存系统提升性能：

- **搜索缓存**: TTL 5分钟，LRU 最大100条目
- **页面缓存**: TTL 5分钟，LRU 最大100条目
- **缓存控制**: 可通过 `useCache=false` 跳过缓存
- **缓存清理**: 支持手动清理特定或全部缓存

## 使用示例

### JavaScript/Node.js

```javascript
// 搜索功能
const response = await fetch('http://localhost:3000/api/search?q=钻石&limit=5');
const searchData = await response.json();

// 获取页面内容
const pageResponse = await fetch('http://localhost:3000/api/page/钻石?format=markdown');
const pageData = await pageResponse.json();

// 批量获取页面
const batchResponse = await fetch('http://localhost:3000/api/pages', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    pages: ['钻石', '金锭', '铁锭'],
    format: 'markdown'
  })
});
const batchData = await batchResponse.json();
```

### cURL

```bash
# 搜索
curl "http://localhost:3000/api/search?q=钻石&limit=5"

# 获取页面内容
curl "http://localhost:3000/api/page/钻石?format=markdown"

# 检查健康状态
curl "http://localhost:3000/health"

# 批量获取页面
curl -X POST "http://localhost:3000/api/pages" \
  -H "Content-Type: application/json" \
  -d '{"pages":["钻石","金锭"],"format":"markdown"}'
```

### Python

```python
import requests

# 搜索
response = requests.get('http://localhost:3000/api/search', 
                       params={'q': '钻石', 'limit': 5})
search_data = response.json()

# 获取页面内容
page_response = requests.get('http://localhost:3000/api/page/钻石',
                           params={'format': 'markdown'})
page_data = page_response.json()

# 批量获取
batch_response = requests.post('http://localhost:3000/api/pages',
                             json={'pages': ['钻石', '金锭'], 'format': 'markdown'})
batch_data = batch_response.json()
```

## 部署和配置

### 环境变量

- `NODE_ENV`: 运行环境 (development/production)
- `PORT`: 服务器端口 (默认 3000)
- `WIKI_BASE_URL`: Wiki基础URL
- `CACHE_TTL`: 缓存TTL时间 (毫秒)
- `RATE_LIMIT_MAX`: 请求频率限制

### Docker 部署

```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
EXPOSE 3000
CMD ["npm", "start"]
```

## 支持和反馈

如遇问题或需要功能建议，请：

1. 检查 API 文档和示例
2. 查看服务健康状态 `/health/detailed`
3. 检查请求格式和参数
4. 联系开发团队

## 更新日志

### v1.0.0 (2024-01-01)
- ✅ 实现搜索 API
- ✅ 实现页面内容获取 API
- ✅ 支持 HTML/Markdown 格式输出
- ✅ 实现智能缓存系统
- ✅ 完整的健康检查端点
- ✅ 批量页面获取功能