/**
 * Configuration management system
 * Handles environment variables and provides default values
 */

require('dotenv').config();

const config = {
  // Server Configuration
  server: {
    port: parseInt(process.env.PORT) || 3000,
    nodeEnv: process.env.NODE_ENV || 'development',
  },

  // Wiki Configuration
  wiki: {
    baseUrl: process.env.WIKI_BASE_URL || 'https://zh.minecraft.wiki',
    requestTimeout: parseInt(process.env.REQUEST_TIMEOUT) || 10000,
    maxRetries: parseInt(process.env.MAX_RETRIES) || 3,
    userAgent: process.env.USER_AGENT || 'MinecraftWikiAPI/1.0.0 (https://github.com/minecraft-wiki-api)',
  },

  // Cache Configuration
  cache: {
    redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',
    ttl: parseInt(process.env.CACHE_TTL) || 1800, // 30 minutes
    memoryCache: {
      maxSize: parseInt(process.env.MEMORY_CACHE_MAX_SIZE) || 1000,
      searchTtl: parseInt(process.env.SEARCH_CACHE_TTL) || 300, // 5 minutes
      pageTtl: parseInt(process.env.PAGE_CACHE_TTL) || 1800, // 30 minutes
    },
  },

  // Rate Limiting Configuration
  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW) || 60000, // 1 minute
    max: parseInt(process.env.RATE_LIMIT_MAX) || 100,
  },

  // Logging Configuration
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    enableConsole: process.env.NODE_ENV !== 'production',
    logDir: process.env.LOG_DIR || 'logs',
  },

  // Search Configuration
  search: {
    defaultLimit: parseInt(process.env.SEARCH_DEFAULT_LIMIT) || 10,
    maxLimit: parseInt(process.env.SEARCH_MAX_LIMIT) || 50,
  },
};

/**
 * Validates required configuration values
 * @throws {Error} If required configuration is missing
 */
function validateConfig() {
  const required = [
    { key: 'wiki.baseUrl', value: config.wiki.baseUrl },
  ];

  for (const { key, value } of required) {
    if (!value) {
      throw new Error(`Required configuration missing: ${key}`);
    }
  }

  // Validate numeric values
  if (config.wiki.requestTimeout < 1000) {
    throw new Error('REQUEST_TIMEOUT must be at least 1000ms');
  }

  if (config.wiki.maxRetries < 0 || config.wiki.maxRetries > 10) {
    throw new Error('MAX_RETRIES must be between 0 and 10');
  }

  if (config.server.port < 1 || config.server.port > 65535) {
    throw new Error('PORT must be between 1 and 65535');
  }
}

/**
 * Gets configuration value by dot notation path
 * @param {string} path - Dot notation path (e.g., 'wiki.baseUrl')
 * @param {*} defaultValue - Default value if path not found
 * @returns {*} Configuration value
 */
function get(path, defaultValue = undefined) {
  const keys = path.split('.');
  let current = config;

  for (const key of keys) {
    if (current === null || current === undefined || !(key in current)) {
      return defaultValue;
    }
    current = current[key];
  }

  return current;
}

/**
 * Checks if the application is running in development mode
 * @returns {boolean}
 */
function isDevelopment() {
  return config.server.nodeEnv === 'development';
}

/**
 * Checks if the application is running in production mode
 * @returns {boolean}
 */
function isProduction() {
  return config.server.nodeEnv === 'production';
}

/**
 * Checks if the application is running in test mode
 * @returns {boolean}
 */
function isTest() {
  return config.server.nodeEnv === 'test';
}

// Validate configuration on module load
try {
  validateConfig();
} catch (error) {
  console.error('Configuration validation failed:', error.message);
  process.exit(1);
}

module.exports = {
  ...config,
  get,
  isDevelopment,
  isProduction,
  isTest,
  validateConfig,
};