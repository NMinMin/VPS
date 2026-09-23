import crypto from 'crypto';
import { spawn, execSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const HISTORY_FILE = path.join(projectRoot, 'logs', 'deploy_history.json');

// Khôi phục lịch sử deploy từ file logs/deploy_history.json (để không bị mất khi PM2 reload)
function loadHistory() {
  try {
    if (fs.existsSync(HISTORY_FILE)) {
      const content = fs.readFileSync(HISTORY_FILE, 'utf-8');
      return JSON.parse(content);
    }
  } catch (err) {
    console.warn('[Webhook] Failed to load history file:', err.message);
  }
  return [];
}

function saveHistory(history) {
  try {
    const logsDir = path.join(projectRoot, 'logs');
    if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir, { recursive: true });
    fs.writeFileSync(HISTORY_FILE, JSON.stringify(history.slice(0, 30), null, 2), 'utf-8');
  } catch (err) {
    console.warn('[Webhook] Failed to save history file:', err.message);
  }
}

export const deployHistory = loadHistory();

export function syncGitCommitsToHistory() {
  try {
    const rawLog = execSync('git log -n 25 --pretty=format:"%h@@@%s@@@%an@@@%cI"', { 
      cwd: projectRoot,
      encoding: 'utf-8' 
    }).trim();

    if (!rawLog) return deployHistory;

    const commits = rawLog.split('\n').filter(Boolean).map(line => {
      const [hash, message, author, isoDate] = line.split('@@@');
      return { 
        hash: hash?.trim(), 
        message: message?.trim() || '', 
        author: author?.trim() || 'Git', 
        timestamp: isoDate ? new Date(isoDate.trim()).toISOString() : new Date().toISOString() 
      };
    });

    const current = loadHistory();
    const existingMap = new Map();
    for (const item of current) {
      if (item.commitHash) {
        existingMap.set(item.commitHash.toLowerCase().slice(0, 7), item);
      }
    }

    for (const c of commits) {
      if (!c.hash) continue;
      const shortHash = c.hash.toLowerCase().slice(0, 7);
      if (existingMap.has(shortHash)) {
        const existing = existingMap.get(shortHash);
        if (!existing.commitMessage || existing.commitMessage === 'Manual deploy') {
          existing.commitMessage = c.message;
        }
        if (!existing.author || existing.author === 'GitHub') {
          existing.author = c.author;
        }
      } else {
        const newItem = {
          id: `DEP-${c.hash}`,
          source: 'Git Commit',
          commitHash: c.hash,
          commitMessage: c.message,
          author: c.author,
          timestamp: c.timestamp,
          status: 'SUCCESS',
          exitCode: 0,
          logs: `Commit [${c.hash}] ${c.message} bởi ${c.author}`
        };
        current.push(newItem);
        existingMap.set(shortHash, newItem);
      }
    }

    current.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    deployHistory.length = 0;
    deployHistory.push(...current.slice(0, 30));
    saveHistory(deployHistory);

    return deployHistory;
  } catch (err) {
    console.warn('[Webhook] syncGitCommitsToHistory error:', err.message);
    return deployHistory;
  }
}

// Tự động đồng bộ ngay khi khởi động
syncGitCommitsToHistory();

export function verifyGitHubSignature(req) {
  const secret = process.env.WEBHOOK_SECRET || 'phuoc_super_secure_webhook_secret_key_2026';
  const signature = req.headers['x-hub-signature-256'];
  if (!signature) return false;

  const rawBody = req.rawBody || JSON.stringify(req.body);
  const hmac = crypto.createHmac('sha256', secret);
  const digest = `sha256=${hmac.update(rawBody).digest('hex')}`;
  
  const sigBuf = Buffer.from(signature);
  const digBuf = Buffer.from(digest);
  if (sigBuf.length !== digBuf.length) return false;
  return crypto.timingSafeEqual(sigBuf, digBuf);
}

function getCurrentGitInfo() {
  try {
    const hash = execSync('git rev-parse --short HEAD', { cwd: projectRoot }).toString().trim();
    const msg = execSync('git log -1 --pretty=%B', { cwd: projectRoot }).toString().trim().split('\n')[0];
    const author = execSync('git log -1 --pretty=%an', { cwd: projectRoot }).toString().trim();
    return { hash, message: msg, author };
  } catch (e) {
    return { hash: 'local', message: 'Manual deploy', author: 'Admin' };
  }
}

export function triggerAutoDeploy(source = 'GitHub Webhook', commitInfo = null) {
  const currentGit = commitInfo?.hash ? commitInfo : getCurrentGitInfo();

  const deployRecord = {
    id: `DEP-${Date.now()}`,
    source,
    commitHash: currentGit.hash,
    commitMessage: currentGit.message,
    author: currentGit.author || 'GitHub',
    timestamp: new Date().toISOString(),
    status: 'IN_PROGRESS',
    logs: ''
  };
  
  deployHistory.unshift(deployRecord);
  if (deployHistory.length > 30) deployHistory.pop();
  saveHistory(deployHistory);

  const scriptPath = path.join(projectRoot, 'scripts', 'deploy-with-rollback.sh');
  const proc = spawn('bash', [scriptPath], {
    cwd: projectRoot,
    env: { ...process.env, PATH: `/home/phuocadmin/nodejs/bin:${process.env.PATH}` }
  });

  proc.stdout.on('data', (data) => {
    deployRecord.logs += data.toString();
  });

  proc.stderr.on('data', (data) => {
    deployRecord.logs += data.toString();
  });

  proc.on('close', (code) => {
    deployRecord.status = code === 0 ? 'SUCCESS' : 'FAILED_ROLLED_BACK';
    deployRecord.exitCode = code;
    // Cập nhật lại hash mới nhất sau khi git pull xong
    const updatedGit = getCurrentGitInfo();
    if (updatedGit.hash) {
      deployRecord.commitHash = updatedGit.hash;
      deployRecord.commitMessage = updatedGit.message;
    }
    saveHistory(deployHistory);
    console.log(`[Deploy] Finished with status: ${deployRecord.status} (exit ${code})`);
  });

  return deployRecord;
}
