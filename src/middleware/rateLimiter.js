/**
 * 速率限制中间件
 * 支持 Upstash Redis 分布式限流和内存限流
 */

const { Ratelimit } = require('@upstash/ratelimit');
const { Redis } = require('@upstash/redis');
const config = require('../config');
const { RateLimitError } = require('../utils/errors');
const { getClientIdentifier } = require('./auth');

// 限流器实例缓存
let upstashLimiter = null;
let memoryStore = null;

/**
 * 初始化 Upstash 限流器
 * @returns {Ratelimit|null}
 */
function initUpstashLimiter() {
  if (!config.upstash.redisRestUrl || !config.upstash.redisRestToken) {
    return null;
  }

  const redis = new Redis({
    url: config.upstash.redisRestUrl,
    token: config.upstash.redisRestToken,
  });

  // 创建两个限流器：匿名用户和认证用户
  return {
    anonymous: new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(config.rateLimit.anonymous, `${config.rateLimit.windowMs} ms`),
      analytics: true,
      prefix: 'ratelimit:anon',
    }),
    authenticated: new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(config.rateLimit.authenticated, `${config.rateLimit.windowMs} ms`),
      analytics: true,
      prefix: 'ratelimit:auth',
    }),
  };
}

/**
 * 内存存储限流器（开发环境降级方案）
 */
class MemoryRateLimiter {
  constructor() {
    this.requests = new Map();
    this.windowMs = config.rateLimit.windowMs;

    // 定期清理过期记录
    setInterval(() => {
      const now = Date.now();
      for (const [key, data] of this.requests) {
        if (now - data.startTime > this.windowMs) {
          this.requests.delete(key);
        }
      }
    }, this.windowMs);
  }

  async limit(identifier, maxRequests) {
    const now = Date.now();
    const record = this.requests.get(identifier);

    if (!record || now - record.startTime > this.windowMs) {
      // 新窗口
      this.requests.set(identifier, { count: 1, startTime: now });
      return {
        success: true,
        limit: maxRequests,
        remaining: maxRequests - 1,
        reset: now + this.windowMs,
      };
    }

    if (record.count >= maxRequests) {
      // 超过限制
      return {
        success: false,
        limit: maxRequests,
        remaining: 0,
        reset: record.startTime + this.windowMs,
      };
    }

    // 增加计数
    record.count++;
    return {
      success: true,
      limit: maxRequests,
      remaining: maxRequests - record.count,
      reset: record.startTime + this.windowMs,
    };
  }
}

/**
 * 获取限流器实例
 * @returns {object}
 */
function getLimiter() {
  // 优先使用 Upstash
  if (config.rateLimit.store === 'upstash') {
    if (!upstashLimiter) {
      upstashLimiter = initUpstashLimiter();
    }
    if (upstashLimiter) {
      return { type: 'upstash', limiter: upstashLimiter };
    }
  }

  // 降级到内存存储
  if (!memoryStore) {
    memoryStore = new MemoryRateLimiter();
  }
  return { type: 'memory', limiter: memoryStore };
}

/**
 * 速率限制中间件
 */
async function rateLimitMiddleware(req, res, next) {
  // 跳过健康检查端点
  if (config.rateLimit.skipHealthCheck && req.path.startsWith('/health')) {
    return next();
  }

  const { type, limiter } = getLimiter();
  const identifier = getClientIdentifier(req);

  // 根据认证状态选择不同的配额
  const maxRequests = req.authenticated ? config.rateLimit.authenticated : config.rateLimit.anonymous;

  try {
    let result;

    if (type === 'upstash') {
      // 使用 Upstash 限流器
      const rateLimiter = req.authenticated ? limiter.authenticated : limiter.anonymous;
      result = await rateLimiter.limit(identifier);
    } else {
      // 使用内存限流器
      result = await limiter.limit(identifier, maxRequests);
    }

    // 设置响应头
    res.setHeader('X-RateLimit-Limit', result.limit);
    res.setHeader('X-RateLimit-Remaining', result.remaining);
    res.setHeader('X-RateLimit-Reset', result.reset);

    if (!result.success) {
      const error = new RateLimitError('请求过于频繁，请稍后再试');
      error.details = {
        limit: result.limit,
        remaining: result.remaining,
        reset: new Date(result.reset).toISOString(),
        retryAfter: Math.ceil((result.reset - Date.now()) / 1000),
      };

      // 设置 Retry-After 头
      res.setHeader('Retry-After', error.details.retryAfter);

      return next(error);
    }

    return next();
  } catch (err) {
    console.error('Rate limiter error:', err);
    const error = new RateLimitError('限流服务暂时不可用，请稍后再试');
    error.details = { retryAfter: Math.ceil(config.rateLimit.windowMs / 1000) };
    res.setHeader('Retry-After', error.details.retryAfter);
    return next(error);
  }
}

/**
 * 创建自定义限流中间件
 * 用于特定端点的更严格限流
 *
 * @param {object} options - 限流选项
 * @param {number} options.max - 最大请求数
 * @param {number} options.windowMs - 时间窗口（毫秒）
 * @returns {function} Express 中间件
 */
function createRateLimiter(options = {}) {
  const max = options.max || config.rateLimit.anonymous;
  const windowMs = options.windowMs || config.rateLimit.windowMs;

  const store = new Map();

  // 定期清理
  setInterval(() => {
    const now = Date.now();
    for (const [key, data] of store) {
      if (now - data.startTime > windowMs) {
        store.delete(key);
      }
    }
  }, windowMs);

  return async (req, res, next) => {
    const identifier = getClientIdentifier(req);
    const now = Date.now();
    const record = store.get(identifier);

    if (!record || now - record.startTime > windowMs) {
      store.set(identifier, { count: 1, startTime: now });
      res.setHeader('X-RateLimit-Limit', max);
      res.setHeader('X-RateLimit-Remaining', max - 1);
      return next();
    }

    if (record.count >= max) {
      const error = new RateLimitError('请求过于频繁，请稍后再试');
      error.details = {
        limit: max,
        remaining: 0,
        retryAfter: Math.ceil((record.startTime + windowMs - now) / 1000),
      };
      res.setHeader('Retry-After', error.details.retryAfter);
      return next(error);
    }

    record.count++;
    res.setHeader('X-RateLimit-Limit', max);
    res.setHeader('X-RateLimit-Remaining', max - record.count);
    return next();
  };
}

module.exports = {
  rateLimitMiddleware,
  createRateLimiter,
  getLimiter,
};
