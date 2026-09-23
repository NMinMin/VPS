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
