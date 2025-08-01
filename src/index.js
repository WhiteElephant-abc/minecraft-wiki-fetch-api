const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

// Import our custom modules
const config = require('./config');
const { logger, requestLoggingMiddleware } = require('./utils/logger');
const { apiRoutes, healthRoutes } = require('./routes');

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
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Request logging middleware
app.use(requestLoggingMiddleware());

// Mount routes
app.use('/health', healthRoutes);
app.use('/api', apiRoutes);

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    name: 'Minecraft Wiki API',
    version: '1.0.0',
    description: 'API service for scraping Minecraft Chinese Wiki content',
    endpoints: {
      search: 'GET /api/search?q={keyword}&limit={number}',
      page: 'GET /api/page/{pageName}?format={html|markdown|both}',
      batchPages: 'POST /api/pages',
      pageExists: 'GET /api/page/{pageName}/exists',
      health: 'GET /health',
      healthDetailed: 'GET /health/detailed',
      ready: 'GET /health/ready',
      live: 'GET /health/live'
    },
    documentation: 'https://github.com/your-repo/minecraft-wiki-api',
    timestamp: new Date().toISOString()
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    error: {
      code: 'NOT_FOUND',
      message: '请求的端点不存在',
      availableEndpoints: [
        'GET /api/search',
        'GET /api/page/:pageName',
        'POST /api/pages',
        'GET /health'
      ]
    }
  });
});

// Global error handler
app.use((err, req, res, next) => {
  logger.error('Unhandled error:', {
    error: err.message,
    stack: err.stack,
    url: req.url,
    method: req.method,
    ip: req.ip
  });
  
  res.status(err.status || 500).json({
    success: false,
    error: {
      code: err.code || 'INTERNAL_ERROR',
      message: process.env.NODE_ENV === 'production' ? '服务器内部错误' : err.message,
      timestamp: new Date().toISOString()
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
    console.log(`📋 API endpoints:`);
    console.log(`   - GET /api/search?q=钻石`);
    console.log(`   - GET /api/page/钻石`);
    console.log(`   - POST /api/pages`);
    console.log(`   - GET /health`);
  });
}

module.exports = app;