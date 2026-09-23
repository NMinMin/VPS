import express from 'express';
import cors from 'cors';
import compression from 'compression';
import path from 'path';
import { fileURLToPath } from 'url';
import os from 'os';
import dotenv from 'dotenv';
import { spawn } from 'child_process';
import fs from 'fs';

dotenv.config();

import { cacheEngine } from './cache.js';
import { pool, testDbConnection } from './db.js';
import { apiLimiter, strictLimiter, rateLimitMetrics } from './rateLimiter.js';
import { verifyGitHubSignature, triggerAutoDeploy, deployHistory, syncGitCommitsToHistory } from './webhook.js';
import { monitorState, checkSystemHealth, sendTelegramAlert } from './alert-monitor.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

const app = express();
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '127.0.0.1';

// Tối ưu hóa nén dữ liệu HTTP (Gzip/Brotli)
app.use(compression({
  threshold: 1024,
  level: 6
}));

app.use(cors());

// Parse JSON đồng thời lưu lại rawBody để xác thực Webhook HMAC SHA256 (Tăng limit 50mb chống lỗi 413 Payload Too Large)
app.use(express.json({
  limit: '50mb',
  verify: (req, res, buf) => {
    req.rawBody = buf;
  }
}));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Bật ETag cho HTTP Caching
app.set('etag', 'strong');

// Áp dụng Rate Limiting cho API (Bỏ qua GitHub Webhook vì đã được bảo vệ độc quyền bởi chữ ký HMAC SHA-256)
app.use('/api/', (req, res, next) => {
  if (req.path.startsWith('/webhook')) {
    return next();
  }
  return apiLimiter(req, res, next);
});

// --- 1. API CACHING BENCHMARK & MULTI-TIER ENGINE ---
app.get('/api/cache/benchmark', strictLimiter, async (req, res) => {
  const queryType = req.query.type || 'analytics';
  const forceRefresh = req.query.refresh === 'true';
  const cacheKey = `dataset:${queryType}`;

  const tStart = performance.now();

  if (!forceRefresh) {
    const cached = await cacheEngine.get(cacheKey);
    if (cached.data) {
      res.setHeader('X-Cache-Status', 'HIT');
      res.setHeader('X-Cache-Tier', cached.tier);
      res.setHeader('X-Cache-Latency', `${cached.latencyMs}ms`);
      res.setHeader('Cache-Control', 'public, max-age=60, stale-while-revalidate=300');
      
      return res.json({
        success: true,
        source: cached.tier,
        isCached: true,
        latencyMs: cached.latencyMs,
        totalTimeMs: Number((performance.now() - tStart).toFixed(2)),
        data: cached.data
      });
    }
  }

  // Giả lập tính toán hoặc đọc DB
  await new Promise(resolve => setTimeout(resolve, 200));

  const generatedData = {
    reportId: `REP-${Math.random().toString(36).substring(2, 8).toUpperCase()}`,
    queryType,
    generatedAt: new Date().toISOString(),
    metrics: {
      totalViews: Math.floor(Math.random() * 50000) + 10000,
      activeUsers: Math.floor(Math.random() * 800) + 200,
      conversionRate: (Math.random() * 8 + 2).toFixed(2) + '%',
      revenueEstimate: '$' + (Math.random() * 20000 + 5000).toLocaleString('en-US', { maximumFractionDigits: 0 }),
      throughput: (Math.random() * 1200 + 400).toFixed(0) + ' req/s'
    },
    sampleRecords: Array.from({ length: 8 }, (_, i) => ({
      id: i + 1,
      title: `Event Log Item #${i + 1}`,
      timestamp: new Date(Date.now() - i * 60000).toLocaleTimeString('vi-VN'),
      status: i % 3 === 0 ? 'Warning' : 'Success',
      payloadSize: `${Math.floor(Math.random() * 50 + 10)} KB`
    }))
  };

  await cacheEngine.set(cacheKey, generatedData, 120);

  const totalTime = Number((performance.now() - tStart).toFixed(2));
  res.setHeader('X-Cache-Status', 'MISS');
  res.setHeader('X-Cache-Tier', 'DB_COMPUTE');
  res.setHeader('Cache-Control', 'public, max-age=60, stale-while-revalidate=300');

  return res.json({
    success: true,
    source: 'FRESH_COMPUTATION',
    isCached: false,
    latencyMs: totalTime,
    totalTimeMs: totalTime,
    data: generatedData
  });
});

app.get('/api/cache/stats', async (req, res) => {
  const stats = await cacheEngine.getStats();
  res.json({ success: true, ...stats });
});

app.get('/api/cache/keys', async (req, res) => {
  const keys = await cacheEngine.getKeys();
  res.json({ success: true, keys });
});

app.post('/api/cache/purge', async (req, res) => {
  const { key } = req.body;
  if (!key || key === 'all') {
    await cacheEngine.clearAll();
    return res.json({ success: true, message: 'Đã xóa sạch toàn bộ Cache (L1 RAM + L2 Redis)!' });
  }

  await cacheEngine.del(key);
  return res.json({ success: true, message: `Đã xóa cache cho key [${key}] thành công!` });
});

// --- 2. API DATABASE & GIẢI TRÌNH TRUY VẤN (EXPLAIN ANALYZE) ---
app.get('/api/db/status', async (req, res) => {
  const mariadbStatus = await testDbConnection();
  const redisStats = await cacheEngine.getStats();
  res.json({
    success: true,
    primaryDb: {
      type: 'MariaDB',
      ...mariadbStatus
    },
    secondaryDb: {
      type: 'Redis Local 6379',
      available: redisStats.l2.available,
      memoryUsed: redisStats.l2.memoryUsed,
      keysCount: redisStats.l2.keysCount
    }
  });
});

app.get('/api/db/explain', strictLimiter, async (req, res) => {
  const targetEmail = req.query.email || 'user_100@gmail.com';

  try {
    // 1. Chạy truy vấn CÓ DÙNG INDEX (idx_email)
    const t0With = performance.now();
    const [explainWith] = await pool.query(
      'EXPLAIN SELECT * FROM access_logs WHERE email = ?',
      [targetEmail]
    );
    const [dataWith] = await pool.query(
      'SELECT * FROM access_logs WHERE email = ? LIMIT 10',
      [targetEmail]
    );
    const timeWith = Number((performance.now() - t0With).toFixed(2));

    // 2. Chạy truy vấn BỎ QUA INDEX (IGNORE INDEX -> Quét toàn bộ bảng Full Table Scan)
    const t0Without = performance.now();
    const [explainWithout] = await pool.query(
      'EXPLAIN SELECT * FROM access_logs IGNORE INDEX (idx_email) WHERE email = ?',
      [targetEmail]
    );
    const [dataWithout] = await pool.query(
      'SELECT * FROM access_logs IGNORE INDEX (idx_email) WHERE email = ? LIMIT 10',
      [targetEmail]
    );
    const timeWithout = Number((performance.now() - t0Without).toFixed(2));

    const speedup = timeWith > 0 ? (timeWithout / timeWith).toFixed(1) : '10.0';

    res.json({
      success: true,
      queryTested: `SELECT * FROM access_logs WHERE email = '${targetEmail}'`,
      speedup: `${speedup}x`,
      withIndex: {
        timeMs: timeWith,
        rowsExamined: explainWith[0]?.rows || 1,
        keyUsed: explainWith[0]?.key || 'idx_email',
        scanType: explainWith[0]?.type || 'ref',
        extra: explainWith[0]?.Extra || '',
        explainPlan: explainWith
      },
      withoutIndex: {
        timeMs: timeWithout,
        rowsExamined: explainWithout[0]?.rows || 10000,
        keyUsed: explainWithout[0]?.key || 'None (FULL SCAN)',
        scanType: explainWithout[0]?.type || 'ALL',
        extra: explainWithout[0]?.Extra || 'Using where',
        explainPlan: explainWithout
      },
      sampleData: dataWith
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// --- 3. API RATE LIMITING & SECURITY ---
app.get('/api/security/stats', (req, res) => {
  res.json({
    success: true,
    totalBlocked: rateLimitMetrics.totalBlocked,
    blockedIpsCount: rateLimitMetrics.blockedIPs.size,
    blockedIps: Array.from(rateLimitMetrics.blockedIPs).slice(0, 10),
    activeRules: {
      globalLimit: '100 req / phút / IP',
      strictLimit: '25 req / phút / IP (Brute-force protection)',
      engine: 'Redis Key-Value Store (:6379)'
    }
  });
});

// --- 4. API GITHUB WEBHOOK & CI/CD AUTO-DEPLOY ---
app.post('/api/webhook/github', (req, res) => {
  const isVerified = verifyGitHubSignature(req);
  if (!isVerified) {
    return res.status(401).json({ success: false, error: 'Chữ ký Webhook không hợp lệ (Invalid HMAC SHA-256 Signature)' });
  }

  const event = req.headers['x-github-event'] || 'push';
  if (event === 'ping') {
    return res.json({ success: true, message: 'Pong! Webhook kết nối thành công tới VPS CloudPanel.' });
  }

  const commitInfo = {
    hash: req.body?.head_commit?.id?.slice(0, 7) || req.body?.after?.slice(0, 7) || '',
    message: req.body?.head_commit?.message || '',
    author: req.body?.head_commit?.author?.name || req.body?.pusher?.name || 'GitHub'
  };

  const record = triggerAutoDeploy(`GitHub Webhook (${event})`, commitInfo);
  return res.json({
    success: true,
    message: 'Tín hiệu Webhook đã được ghi nhận. Quá trình Pull -> Build -> Reload PM2 đang chạy ngầm.',
    deployId: record.id
  });
});

app.get('/api/webhook/history', (req, res) => {
  const history = syncGitCommitsToHistory();
  res.json({ success: true, history });
});

app.post('/api/deploy/trigger', strictLimiter, (req, res) => {
  const record = triggerAutoDeploy('Kích hoạt thủ công từ Dashboard');
  res.json({ success: true, message: 'Đã kích hoạt triển khai CI/CD!', deployId: record.id });
});

// --- 5. API GIÁM SÁT HỆ THỐNG & CẢNH BÁO TỨC THÌ (ALERT MONITOR) ---
app.get('/api/monitor/status', async (req, res) => {
  const health = await checkSystemHealth();
  res.json({ success: true, ...health });
});

app.post('/api/monitor/test-alert', strictLimiter, async (req, res) => {
  const testMsg = `🔔 [TEST CẢNH BÁO] Kiểm tra hệ thống cảnh báo tức thời từ CloudPanel VPS!\nTrạng thái: Hoạt động bình thường.\nThời gian: ${new Date().toLocaleString('vi-VN')}`;
  const sent = await sendTelegramAlert(testMsg);
  res.json({
    success: true,
    sent,
    message: sent 
      ? 'Đã gửi cảnh báo test thành công tới Telegram!' 
      : 'Đã ghi nhận log cảnh báo (Cần điền ALERT_TELEGRAM_BOT_TOKEN và ALERT_TELEGRAM_CHAT_ID trong file .env để nhận tin nhắn qua bot).'
  });
});

// --- 6. API SAO LƯU DỮ LIỆU (BACKUP & RESTORE) ---
app.get('/api/backups', (req, res) => {
  const backupDir = path.join(projectRoot, 'backups');
  if (!fs.existsSync(backupDir)) {
    return res.json({ success: true, files: [] });
  }

  const files = fs.readdirSync(backupDir)
    .filter(f => f.endsWith('.enc'))
    .map(f => {
      const stat = fs.statSync(path.join(backupDir, f));
      return {
        name: f,
        sizeMb: (stat.size / 1024 / 1024).toFixed(2),
        sizeKb: (stat.size / 1024).toFixed(1),
        createdAt: stat.birthtime,
        algorithm: 'OpenSSL AES-256-CBC'
      };
    })
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  res.json({ success: true, files });
});

app.post('/api/backups/run', strictLimiter, (req, res) => {
  const scriptPath = path.join(projectRoot, 'scripts', 'backup-db.sh');
  const proc = spawn('bash', [scriptPath], { cwd: projectRoot });

  let out = '';
  proc.stdout.on('data', (d) => out += d.toString());
  proc.stderr.on('data', (d) => out += d.toString());

  proc.on('close', (code) => {
    res.json({
      success: code === 0,
      exitCode: code,
      output: out,
      message: code === 0 ? 'Sao lưu và mã hóa AES-256 thành công!' : 'Có lỗi khi chạy backup.'
    });
  });
});

// --- 7. API SỨC KHỎE HỆ THỐNG CƠ BẢN ---
app.get('/api/system/health', (req, res) => {
  const memUsage = process.memoryUsage();
  res.json({
    status: 'ONLINE',
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.floor(process.uptime()),
    nodeVersion: process.version,
    platform: process.platform,
    arch: process.arch,
    cpus: os.cpus().length,
    loadAvg: os.loadavg(),
    memory: {
      rss: `${Math.round(memUsage.rss / 1024 / 1024)} MB`,
      heapTotal: `${Math.round(memUsage.heapTotal / 1024 / 1024)} MB`,
      heapUsed: `${Math.round(memUsage.heapUsed / 1024 / 1024)} MB`,
      systemFree: `${Math.round(os.freemem() / 1024 / 1024)} MB`,
      systemTotal: `${Math.round(os.totalmem() / 1024 / 1024)} MB`
    },
    pm2: {
      instanceId: process.env.NODE_APP_INSTANCE || process.env.pm_id || 0,
      pm2_name: process.env.name || 'phuoc-nodejs',
      mode: process.env.exec_mode || 'fork'
    }
  });
});

// --- 8. PHỤC VỤ STATIC ASSETS REACT VỚI HTTP CACHING NÂNG CAO ---
const distPath = path.join(projectRoot, 'dist');

app.use('/assets', express.static(path.join(distPath, 'assets'), {
  maxAge: '1y',
  immutable: true,
  etag: true,
  lastModified: true
}));

app.use(express.static(distPath, {
  maxAge: '1h',
  etag: true
}));

app.get('*', (req, res) => {
  res.setHeader('Cache-Control', 'public, max-age=0, must-revalidate');
  res.sendFile(path.join(distPath, 'index.html'));
});

// Khởi chạy Server
const server = app.listen(PORT, HOST, () => {
  console.log(`[CloudPanel Node.js] Server is running at http://${HOST}:${PORT}`);
  console.log(`[CloudPanel Node.js] Environment: ${process.env.NODE_ENV || 'production'}`);
  console.log(`[CloudPanel Node.js] PID: ${process.pid}`);
});

// Graceful Shutdown
process.on('SIGTERM', () => {
  server.close(() => {
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  server.close(() => {
    process.exit(0);
  });
});
