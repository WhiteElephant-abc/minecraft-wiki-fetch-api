/**
 * API Key 认证中间件
 * 支持静态 API Key 验证
 */

const config = require('../config');
const { AuthenticationError } = require('../utils/errors');

/**
 * 验证 API Key
 * @param {string} providedKey - 请求中提供的 API Key
 * @returns {boolean} 是否有效
 */
function isValidApiKey(providedKey) {
  if (!providedKey) return false;
  
  // 支持多个 API Key（从 apiKeys 数组中验证）
  const validKeys = config.security.apiKeys;
  if (validKeys && validKeys.length > 0) {
    return validKeys.includes(providedKey);
  }
  
  // 向后兼容单个 apiKey
  if (config.security.apiKey) {
    return providedKey === config.security.apiKey;
  }
  
  return false;
}

/**
 * 从请求中提取 API Key
 * 支持两种方式：
 * 1. 请求头 X-API-Key
 * 2. 查询参数 api_key
 * 
 * @param {object} req - Express 请求对象
 * @returns {string|null} API Key 或 null
 */
function extractApiKey(req) {
  // 优先从请求头获取
  const headerKey = req.headers['x-api-key'];
  if (headerKey) {
    return headerKey;
  }
  
  // 从查询参数获取
  const queryKey = req.query.api_key;
  if (queryKey) {
    return queryKey;
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
    hint: '请在请求头中添加 X-API-Key 或在查询参数中添加 api_key',
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
        hint: '请在请求头中添加 X-API-Key 或在查询参数中添加 api_key',
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
  // 如果已认证，使用 API Key 的 hash
  if (req.authenticated && req.authType === 'apikey') {
    const key = extractApiKey(req);
    return `auth:${hashApiKey(key)}`;
  }
  
  // 否则使用 IP 地址
  const ip = req.ip || 
             req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
             req.connection?.remoteAddress ||
             'unknown';
  
  return `anon:${ip}`;
}

/**
 * 简单的 API Key hash（用于标识，非加密）
 * @param {string} key - API Key
 * @returns {string} Hash 值
 */
function hashApiKey(key) {
  let hash = 0;
  for (let i = 0; i < key.length; i++) {
    const char = key.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(16);
}

module.exports = {
  authMiddleware,
  requireAuth,
  conditionalAuth,
  getClientIdentifier,
  extractApiKey,
  isValidApiKey,
};
