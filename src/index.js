const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

// Import our custom modules
const config = require('./config');
const { logger, requestLoggingMiddleware } = require('./utils/logger');
const { getAvailablePort } = require('./utils/portManager');
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
  startServer();
}

/**
 * Gracefully starts the server with automatic port selection
 */
async function startServer() {
  try {
    let serverPort = config.server.port;

    // Check if auto port selection is enabled
    if (config.server.autoPort) {
      // Get an available port, starting with the configured port
      serverPort = await getAvailablePort(config.server.port, {
        maxAttempts: config.server.maxPortAttempts,
        logAttempts: true
      });
    } else {
      // If auto port is disabled, just validate the configured port
      const { validatePort } = require('./utils/portManager');
      validatePort(config.server.port);
      
      logger.info('Auto port selection is disabled, using configured port', {
        port: config.server.port
      });
    }

    // Start the server on the selected port
    const server = app.listen(serverPort, () => {
      const serverInfo = {
        port: serverPort,
        nodeEnv: config.server.nodeEnv,
        wikiBaseUrl: config.wiki.baseUrl,
        originalPort: config.server.port,
        portChanged: serverPort !== config.server.port,
        autoPortEnabled: config.server.autoPort
      };

      logger.info(`Server started successfully`, serverInfo);
      
      // Console output
      if (config.server.autoPort && serverPort !== config.server.port) {
        console.log(`⚠️  Port ${config.server.port} was occupied, server started on port ${serverPort}`);
      }
      
      console.log(`🚀 Minecraft Wiki API server started on http://localhost:${serverPort}`);
      console.log(`📋 API endpoints:`);
      console.log(`   - GET /api/search?q=钻石`);
      console.log(`   - GET /api/page/钻石`);
      console.log(`   - POST /api/pages`);
      console.log(`   - GET /health`);
      
      if (config.server.autoPort && serverPort !== config.server.port) {
        console.log(`\n💡 Tip: Update your PORT environment variable to ${serverPort} to avoid port conflicts`);
        console.log(`   Or set AUTO_PORT=false to disable automatic port selection`);
      }
    });

    // Handle server errors
    server.on('error', (error) => {
      if (error.code === 'EADDRINUSE') {
        if (config.server.autoPort) {
          logger.error(`Port ${serverPort} is still in use after verification. This should not happen.`, {
            port: serverPort,
            error: error.message
          });
          console.error(`❌ Critical error: Port ${serverPort} is still in use. Please restart the application.`);
        } else {
          logger.error(`Port ${config.server.port} is already in use`, {
            port: config.server.port,
            error: error.message,
            suggestion: 'Enable AUTO_PORT=true for automatic port selection'
          });
          console.error(`❌ Port ${config.server.port} is already in use.`);
          console.error(`   Set AUTO_PORT=true in your environment to enable automatic port selection.`);
        }
      } else {
        logger.error('Server error occurred', {
          error: error.message,
          code: error.code,
          port: serverPort
        });
        console.error(`❌ Server error: ${error.message}`);
      }
      process.exit(1);
    });

    // Graceful shutdown
    const gracefulShutdown = (signal) => {
      logger.info(`Received ${signal}, shutting down gracefully`);
      console.log(`\n🛑 Received ${signal}, shutting down gracefully...`);
      
      server.close((err) => {
        if (err) {
          logger.error('Error during server shutdown', { error: err.message });
          console.error('❌ Error during shutdown:', err.message);
          process.exit(1);
        } else {
          logger.info('Server closed successfully');
          console.log('✅ Server closed successfully');
          process.exit(0);
        }
      });
    };

    // Handle termination signals
    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));

  } catch (error) {
    logger.error('Failed to start server', {
      error: error.message,
      configuredPort: config.server.port,
      autoPortEnabled: config.server.autoPort
    });
    console.error(`❌ Failed to start server: ${error.message}`);
    
    if (config.server.autoPort) {
      console.error('   Please check if all ports in the range are available or increase MAX_PORT_ATTEMPTS.');
    } else {
      console.error('   Please choose a different port or enable AUTO_PORT=true for automatic port selection.');
    }
    
    process.exit(1);
  }
}

module.exports = app;