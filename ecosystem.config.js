export default {
  apps: [
    {
      name: 'phuoc-nodejs',
      cwd: process.cwd(),
      script: 'server/index.js',
      instances: 2,
      exec_mode: 'cluster',
      autorestart: true,
      watch: false,
      max_memory_restart: '350M',
      restart_delay: 2000,
      exp_backoff_restart_delay: 100,
      max_restarts: 10,
      error_file: './logs/pm2-error.log',
      out_file: './logs/pm2-out.log',
      merge_logs: true,
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
        HOST: '127.0.0.1',
        REDIS_HOST: '127.0.0.1',
        REDIS_PORT: 6379
      }
    }
  ]
};
