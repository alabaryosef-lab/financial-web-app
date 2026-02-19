#!/bin/bash
# Run this on the droplet (as root) to fix/start the app: sudo bash droplet-fix-app.sh
set -e
APP_DIR="${APP_DIR:-/var/www/financial-web-app}"
PORT="${PORT:-3000}"
export PATH="/usr/local/bin:/usr/bin:$PATH"

echo "=== Stopping existing PM2 process (if any) ==="
(npx pm2 delete financial-web-app 2>/dev/null || pm2 delete financial-web-app 2>/dev/null) || true

echo "=== Ensuring PM2 is available ==="
npm install -g pm2 2>/dev/null || true
PM2_CMD="pm2"
if ! command -v pm2 >/dev/null 2>&1; then
  PM2_CMD="npx pm2"
  cd "$APP_DIR" && npm install pm2 --save-dev 2>/dev/null && cd - >/dev/null
fi

echo "=== Checking app and build ==="
if [ ! -f "$APP_DIR/package.json" ]; then
  echo "Error: App not found at $APP_DIR. Run digitalocean-setup.sh first."
  exit 1
fi
if [ ! -d "$APP_DIR/.next" ]; then
  echo "Building app..."
  # Stop MySQL to free memory
  systemctl stop mysql 2>/dev/null || true
  cd "$APP_DIR" && npm install --no-audit --no-fund || npm ci --no-audit --no-fund
  npm run build
  cd - >/dev/null
  systemctl start mysql 2>/dev/null || true
fi

echo "=== Starting app with PM2 ==="
cd "$APP_DIR"
chmod +x scripts/start-server.sh
PORT=$PORT NODE_ENV=production $PM2_CMD start ecosystem.config.js
cd - >/dev/null

$PM2_CMD save
$PM2_CMD startup systemd -u root --hp /root 2>/dev/null || true

echo "=== PM2 status ==="
$PM2_CMD status

echo ""
echo "App should be at http://$(curl -s ifconfig.me 2>/dev/null || echo 'YOUR_IP'):$PORT"
echo "Check logs: $PM2_CMD logs financial-web-app"
