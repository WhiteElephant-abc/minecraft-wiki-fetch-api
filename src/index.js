const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

// Import our custom modules
const config = require('./config');
const { logger, requestLoggingMiddleware } = require('./utils/logger');

const app = express();

// Security middleware
app.use(helmet());
app.use(cors());

// Rate limiting
const limiter = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.max,
  message: {
    success: false,
    error: {
      code: 'RATE_LIMIT_EXCEEDED',
      message: '请求过于频繁，请稍后再试'
    }
  }
});
app.use(limiter);

// Body parsing middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request logging middleware
app.use(requestLoggingMiddleware());

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    success: true,
    data: {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version || '1.0.0',
      uptime: process.uptime()
    }
  });
});

// API routes placeholder
app.get('/api', (req, res) => {
  res.json({
    success: true,
    data: {
      message: 'Minecraft Wiki API',
      version: '1.0.0',
      endpoints: [
        'GET /api/search?q={keyword}&limit={number}',
        'GET /api/page/{pageName}',
        'GET /health'
      ]
    }
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    error: {
      code: 'NOT_FOUND',
      message: '请求的端点不存在'
    }
  });
});

// Global error handler
app.use((err, req, res, next) => {
  logger.error('Unhandled error:', err);
  
  res.status(err.status || 500).json({
    success: false,
    error: {
      code: err.code || 'INTERNAL_ERROR',
      message: err.message || '服务器内部错误'
    }
  });
});

// Start server only if this file is run directly (not required)
if (require.main === module) {
  app.listen(config.server.port, () => {
    logger.info(`Server is running on port ${config.server.port}`, {
      port: config.server.port,
      nodeEnv: config.server.nodeEnv,
      wikiBaseUrl: config.wiki.baseUrl
    });
    console.log(`🚀 Minecraft Wiki API server started on http://localhost:${config.server.port}`);
  });
}

module.exports = app;