import crypto from 'crypto';
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

export const deployHistory = [];

export function verifyGitHubSignature(req) {
  const secret = process.env.WEBHOOK_SECRET || 'phuoc_super_secure_webhook_secret_key_2026';
  const signature = req.headers['x-hub-signature-256'];
  if (!signature) return false;

  const rawBody = req.rawBody || JSON.stringify(req.body);
  const hmac = crypto.createHmac('sha256', secret);
  const digest = `sha256=${hmac.update(rawBody).digest('hex')}`;
  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(digest));
}

export function triggerAutoDeploy(source = 'GitHub Webhook') {
  const deployRecord = {
    id: `DEP-${Date.now()}`,
    source,
    timestamp: new Date().toISOString(),
    status: 'IN_PROGRESS',
    logs: ''
  };
  deployHistory.unshift(deployRecord);
  if (deployHistory.length > 20) deployHistory.pop();

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
    console.log(`[Deploy] Finished with status: ${deployRecord.status} (exit ${code})`);
  });

  return deployRecord;
}
