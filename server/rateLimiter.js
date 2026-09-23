import { rateLimit } from 'express-rate-limit';
import { RedisStore } from 'rate-limit-redis';
import Redis from 'ioredis';

const redis = new Redis({
  host: process.env.REDIS_HOST || '127.0.0.1',
  port: parseInt(process.env.REDIS_PORT || '6379', 10),
  maxRetriesPerRequest: null
});

export const rateLimitMetrics = {
  totalBlocked: 0,
  blockedIPs: new Set()
};

// 1. Rate Limiting toàn diện cho API
export const apiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 phút
  limit: 100, // Tối đa 100 request/phút mỗi IP
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  store: new RedisStore({
    sendCommand: (...args) => redis.call(...args),
    prefix: 'rl:api:'
  }),
  handler: (req, res) => {
    rateLimitMetrics.totalBlocked++;
    const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
    rateLimitMetrics.blockedIPs.add(String(clientIp));
    
    res.status(429).json({
      success: false,
      error: 'RATE_LIMIT_EXCEEDED',
      message: 'Cảnh báo: Bạn đã gửi quá nhiều yêu cầu trong thời gian ngắn (Anti-DDoS Rate Limit). Vui lòng thử lại sau 1 phút.',
      retryAfterSeconds: 60
    });
  }
});

// 2. Chống Brute-force nghiêm ngặt cho các tác vụ nhạy cảm (Đăng nhập, Webhook, Benchmark nặng)
export const strictLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 phút
  limit: 25, // Tối đa 25 request/phút
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  store: new RedisStore({
    sendCommand: (...args) => redis.call(...args),
    prefix: 'rl:strict:'
  }),
  handler: (req, res) => {
    rateLimitMetrics.totalBlocked++;
    res.status(429).json({
      success: false,
      error: 'BRUTE_FORCE_DETECTED',
      message: 'Hệ thống phát hiện hành vi Brute-force bất thường. IP của bạn đã bị giới hạn tạm thời!',
      retryAfterSeconds: 60
    });
  }
});
