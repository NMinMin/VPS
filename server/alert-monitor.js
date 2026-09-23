import os from 'os';
import http from 'http';
import https from 'https';
import dotenv from 'dotenv';
dotenv.config();

export const monitorState = {
  cpuUsage: 0,
  ramUsagePercent: 0,
  ramFreeMb: 0,
  ramTotalMb: 0,
  siteOnline: true,
  siteStatusCode: 200,
  siteLatencyMs: 0,
  lastCheck: new Date().toISOString(),
  alerts: []
};

let lastAlertSentTime = 0;

export async function sendTelegramAlert(message) {
  const token = process.env.ALERT_TELEGRAM_BOT_TOKEN;
  const chatId = process.env.ALERT_TELEGRAM_CHAT_ID;

  if (!token || !chatId) {
    console.log(`[Alert Notification (Telegram not configured)]: ${message}`);
    return false;
  }

  const url = `https://api.telegram.org/bot${token}/sendMessage`;
  const payload = JSON.stringify({
    chat_id: chatId,
    text: `🚨 [VPS ALERT - CLOUDPANEL]\n${message}`,
    parse_mode: 'HTML'
  });

  return new Promise((resolve) => {
    const req = https.request(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload)
      }
    }, (res) => {
      resolve(res.statusCode === 200);
    });

    req.on('error', (e) => {
      console.warn('[Alert Error sending Telegram]:', e.message);
      resolve(false);
    });

    req.write(payload);
    req.end();
  });
}

export async function checkSystemHealth() {
  // 1. RAM Calculation
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const usedMem = totalMem - freeMem;
  const ramPercent = Math.round((usedMem / totalMem) * 100);
  
  // 2. CPU Load Calculation
  const cpus = os.cpus();
  const loadAvg = os.loadavg()[0];
  const cpuPercent = Math.min(100, Math.round((loadAvg / cpus.length) * 100));

  monitorState.cpuUsage = cpuPercent;
  monitorState.ramUsagePercent = ramPercent;
  monitorState.ramFreeMb = Math.round(freeMem / 1024 / 1024);
  monitorState.ramTotalMb = Math.round(totalMem / 1024 / 1024);
  monitorState.lastCheck = new Date().toISOString();

  // 3. Website Health Ping
  const t0 = performance.now();
  let isSiteUp = false;
  let code = 0;

  try {
    await new Promise((resolve, reject) => {
      const pingReq = http.get('http://127.0.0.1:3000/api/system/health', { timeout: 4000 }, (res) => {
        code = res.statusCode || 0;
        isSiteUp = code === 200;
        resolve();
      });
      pingReq.on('error', reject);
      pingReq.on('timeout', () => { pingReq.destroy(); reject(new Error('Timeout')); });
    });
  } catch (err) {
    isSiteUp = false;
    code = 503;
  }

  const latency = Math.round(performance.now() - t0);
  monitorState.siteOnline = isSiteUp;
  monitorState.siteStatusCode = code;
  monitorState.siteLatencyMs = latency;

  // 4. Kiểm tra Ngưỡng Cảnh báo (Alert Triggering)
  const now = Date.now();
  const issues = [];

  if (!isSiteUp) {
    issues.push(`Website BỊ SẬP (HTTP Status: ${code})!`);
  }
  if (ramPercent >= 85) {
    issues.push(`Bộ nhớ RAM vượt ngưỡng 85% (${ramPercent}% sử dụng, còn ${monitorState.ramFreeMb} MB)!`);
  }
  if (cpuPercent >= 85) {
    issues.push(`CPU quá tải vượt ngưỡng 85% (${cpuPercent}%)!`);
  }

  if (issues.length > 0) {
    const alertItem = {
      id: `ALT-${now}`,
      timestamp: new Date().toISOString(),
      issues,
      status: 'FIRING'
    };
    monitorState.alerts.unshift(alertItem);
    if (monitorState.alerts.length > 20) monitorState.alerts.pop();

    // Giới hạn tần suất gửi tin nhắn Telegram (5 phút 1 lần để tránh spam)
    if (now - lastAlertSentTime > 5 * 60 * 1000) {
      lastAlertSentTime = now;
      const msg = issues.map(i => `• ${i}`).join('\n') + `\nThời gian: ${new Date().toLocaleString('vi-VN')}`;
      sendTelegramAlert(msg);
    }
  }

  return monitorState;
}

// Khởi chạy vòng lặp kiểm tra định kỳ mỗi 20 giây
setInterval(checkSystemHealth, 20000);
