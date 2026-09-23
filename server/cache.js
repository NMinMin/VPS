import { LRUCache } from 'lru-cache';
import Redis from 'ioredis';

// Multi-Tier Cache Metrics
const stats = {
  l1Hits: 0,
  l2Hits: 0,
  misses: 0,
  totalRequests: 0,
  startTime: Date.now()
};

// --- Tier 1: In-Memory LRU Cache ---
const l1Cache = new LRUCache({
  max: 1000, // Maximum 1000 items in RAM
  ttl: 1000 * 60 * 5, // Default 5 minutes TTL
  allowStale: false,
  updateAgeOnGet: true
});

// --- Tier 2: Redis Client (Local CloudPanel Redis :6379) ---
let redisAvailable = false;
let redisErrorMsg = '';

const redis = new Redis({
  host: process.env.REDIS_HOST || '127.0.0.1',
  port: parseInt(process.env.REDIS_PORT || '6379', 10),
  retryStrategy(times) {
    const delay = Math.min(times * 100, 2000);
    return delay;
  },
  maxRetriesPerRequest: 2,
  lazyConnect: false
});

redis.on('connect', () => {
  redisAvailable = true;
  redisErrorMsg = '';
  console.log('[CacheEngine] Connected to Redis at 127.0.0.1:6379');
});

redis.on('error', (err) => {
  redisAvailable = false;
  redisErrorMsg = err.message;
  console.warn('[CacheEngine] Redis connection warning (falling back to L1 LRU):', err.message);
});

export const cacheEngine = {
  /**
   * Lấy dữ liệu đa tầng:
   * 1. Kiểm tra L1 LRU Cache
   * 2. Nếu miss, kiểm tra L2 Redis
   * 3. Nếu hit ở L2, tự động hydrate lại vào L1
   */
  async get(key) {
    stats.totalRequests++;
    const t0 = performance.now();

    // 1. Kiểm tra L1 (RAM)
    const l1Val = l1Cache.get(key);
    if (l1Val !== undefined) {
      stats.l1Hits++;
      const latency = (performance.now() - t0).toFixed(2);
      return {
        data: l1Val,
        tier: 'L1-MEMORY',
        latencyMs: Number(latency),
        cachedAt: Date.now()
      };
    }

    // 2. Kiểm tra L2 (Redis)
    if (redisAvailable) {
      try {
        const redisVal = await redis.get(`app:${key}`);
        if (redisVal) {
          stats.l2Hits++;
          const parsed = JSON.parse(redisVal);
          // Hydrate L1
          l1Cache.set(key, parsed);
          const latency = (performance.now() - t0).toFixed(2);
          return {
            data: parsed,
            tier: 'L2-REDIS',
            latencyMs: Number(latency),
            cachedAt: Date.now()
          };
        }
      } catch (err) {
        console.warn(`[CacheEngine] Redis read error for key ${key}:`, err.message);
      }
    }

    // Miss ở cả 2 tầng
    stats.misses++;
    const latency = (performance.now() - t0).toFixed(2);
    return {
      data: null,
      tier: 'MISS',
      latencyMs: Number(latency)
    };
  },

  /**
   * Lưu dữ liệu vào cả L1 và L2
   */
  async set(key, value, ttlSeconds = 300) {
    // 1. Set vào L1
    l1Cache.set(key, value, { ttl: ttlSeconds * 1000 });

    // 2. Set vào L2 Redis
    if (redisAvailable) {
      try {
        await redis.setex(`app:${key}`, ttlSeconds, JSON.stringify(value));
      } catch (err) {
        console.warn(`[CacheEngine] Redis write error for key ${key}:`, err.message);
      }
    }
    return true;
  },

  /**
   * Xóa một key cụ thể
   */
  async del(key) {
    l1Cache.delete(key);
    if (redisAvailable) {
      try {
        await redis.del(`app:${key}`);
      } catch (err) {
        console.warn(`[CacheEngine] Redis delete error:`, err.message);
      }
    }
  },

  /**
   * Xóa toàn bộ cache ứng dụng
   */
  async clearAll() {
    l1Cache.clear();
    if (redisAvailable) {
      try {
        const keys = await redis.keys('app:*');
        if (keys.length > 0) {
          await redis.del(...keys);
        }
      } catch (err) {
        console.warn(`[CacheEngine] Redis clear error:`, err.message);
      }
    }
    return true;
  },

  /**
   * Lấy danh sách các key đang lưu trong cache
   */
  async getKeys() {
    const l1Keys = Array.from(l1Cache.keys());
    let redisKeys = [];
    if (redisAvailable) {
      try {
        const rawKeys = await redis.keys('app:*');
        redisKeys = rawKeys.map(k => k.replace(/^app:/, ''));
      } catch (e) {
        // ignore
      }
    }
    const allKeys = Array.from(new Set([...l1Keys, ...redisKeys]));
    return allKeys;
  },

  /**
   * Báo cáo thống kê hiệu năng cache
   */
  async getStats() {
    const totalHits = stats.l1Hits + stats.l2Hits;
    const hitRate = stats.totalRequests > 0 
      ? ((totalHits / stats.totalRequests) * 100).toFixed(1) 
      : '0.0';

    let redisKeysCount = 0;
    let redisMemory = '0 KB';
    if (redisAvailable) {
      try {
        const keys = await redis.keys('app:*');
        redisKeysCount = keys.length;
        const info = await redis.info('memory');
        const match = info.match(/used_memory_human:(.*)/);
        if (match) redisMemory = match[1].trim();
      } catch (e) {
        // ignore
      }
    }

    return {
      stats: {
        totalRequests: stats.totalRequests,
        l1Hits: stats.l1Hits,
        l2Hits: stats.l2Hits,
        misses: stats.misses,
        hitRate: `${hitRate}%`,
        uptimeSeconds: Math.floor((Date.now() - stats.startTime) / 1000)
      },
      l1: {
        itemCount: l1Cache.size,
        maxSize: 1000,
        type: 'LRU In-Memory'
      },
      l2: {
        available: redisAvailable,
        type: 'Redis 127.0.0.1:6379',
        keysCount: redisKeysCount,
        memoryUsed: redisMemory,
        error: redisErrorMsg || null
      }
    };
  }
};
