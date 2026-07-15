/**
 * API Key 认证中间件
 * 支持静态 API Key 验证
 */

const crypto = require('crypto');
const config = require('../config');
const { AuthenticationError } = require('../utils/errors');

function safeEqual(a, b) {
  const bufA = Buffer.from(String(a));
  const bufB = Buffer.from(String(b));
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * 验证 API Key
 * @param {string} providedKey - 请求中提供的 API Key
 * @returns {boolean} 是否有效
 */
function isValidApiKey(providedKey) {
  if (!providedKey) return false;

  const validKeys = config.security.apiKeys;
  if (validKeys && validKeys.length > 0) {
    return validKeys.some((k) => safeEqual(providedKey, k));
  }

  if (config.security.apiKey) {
    return safeEqual(providedKey, config.security.apiKey);
  }

  return false;
}

/**
 * 从请求中提取 API Key
 * 支持两种方式：
 * 1. 请求头 X-API-Key
 * 2. 请求头 Authorization: Bearer <key>
 *
 * @param {object} req - Express 请求对象
 * @returns {string|null} API Key 或 null
 */
function extractApiKey(req) {
  const headerKey = req.headers['x-api-key'];
  if (headerKey) return headerKey;
  const authHeader = req.headers['authorization'];
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.slice(7);
  }
  return null;
}

/**
 * 认证中间件
 * 验证请求中的 API Key，设置 req.authenticated 标志
 *
 * 如果未配置 API_KEY，则所有请求都视为已认证（向后兼容）
 */
function authMiddleware(req, res, next) {
  const hasApiKeyConfig = config.security.apiKeys.length > 0 || config.security.apiKey;

  // 未配置 API Key 时，所有请求视为已认证
  if (!hasApiKeyConfig) {
    req.authenticated = true;
    req.authType = 'none';
    return next();
  }

  const providedKey = extractApiKey(req);

  if (isValidApiKey(providedKey)) {
    req.authenticated = true;
    req.authType = 'apikey';
    return next();
  }

  // 未提供或无效的 API Key
  req.authenticated = false;
  req.authType = 'anonymous';
  return next();
}

/**
 * 需要认证的中间件
 * 用于保护特定端点
 */
function requireAuth(req, res, next) {
  if (req.authenticated) {
    return next();
  }

  const error = new AuthenticationError('此端点需要有效的 API Key');
  error.details = {
    hint: '请在请求头中添加 X-API-Key 或 Authorization: Bearer <key>',
    endpoint: req.originalUrl,
  };

  return next(error);
}

/**
 * 条件认证中间件
 * 根据配置决定是否需要认证
 *
 * @param {string} feature - 功能名称（如 'batch', 'cacheClear'）
 * @returns {function} Express 中间件
 */
function conditionalAuth(feature) {
  return (req, res, next) => {
    const protection = config.security.endpointProtection;

    // 如果端点保护未启用，直接放行
    if (!protection.enabled) {
      return next();
    }

    // 检查特定功能的保护配置
    const featureMap = {
      batch: protection.requireAuthForBatch,
      cacheClear: protection.requireAuthForCacheClear,
    };

    const requiresAuth = featureMap[feature];

    if (requiresAuth && !req.authenticated) {
      const error = new AuthenticationError(`此功能需要有效的 API Key`);
      error.details = {
        hint: '请在请求头中添加 X-API-Key 或 Authorization: Bearer <key>',
        feature,
      };
      return next(error);
    }

    return next();
  };
}

/**
 * 获取客户端标识符
 * 用于限流的 key
 *
 * @param {object} req - Express 请求对象
 * @returns {string} 客户端标识符
 */
function getClientIdentifier(req) {
  if (req.authenticated && req.authType === 'apikey') {
    const key = extractApiKey(req);
    return `auth:${hashApiKey(key)}`;
  }
  return `anon:${req.ip || 'unknown'}`;
}

function hashApiKey(key) {
  return crypto.createHash('sha256').update(String(key)).digest('hex').slice(0, 16);
}

module.exports = {
  authMiddleware,
  requireAuth,
  conditionalAuth,
  getClientIdentifier,
  extractApiKey,
  isValidApiKey,
};
