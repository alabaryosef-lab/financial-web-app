const path = require('path');
const appDir = path.resolve(__dirname);

module.exports = {
  apps: [
    {
      name: 'financial-web-app',
      script: 'node_modules/next/dist/bin/next',
      args: 'start -p 3000',
      cwd: appDir,
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
      },
      error_file: './logs/pm2-error.log',
      out_file: './logs/pm2-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      autorestart: true,
      max_restarts: 10,
      min_uptime: '10s',
      max_memory_restart: '1G',
    },
  ],
};
