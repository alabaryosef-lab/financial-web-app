#!/bin/bash
# Deployment script: stash, pull, install, migrate, build, seed admin, restart with PM2
# Usage: bash scripts/deploy.sh [branch]
#   branch: git branch to pull (default: backend)

set -e

BRANCH="${1:-backend}"
APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$APP_DIR"

echo "=== Deployment Script ==="
echo "App directory: $APP_DIR"
echo "Branch: $BRANCH"
echo ""

# Check if .env.local exists
if [ ! -f "$APP_DIR/.env.local" ]; then
  echo "ERROR: .env.local not found. Please create it first."
  exit 1
fi

# Stash any local changes
echo "=== Stashing local changes ==="
git stash push -m "Auto-stash before deploy $(date +%Y-%m-%d\ %H:%M:%S)" || echo "No changes to stash"

# Pull latest code
echo "=== Pulling latest code from $BRANCH ==="
git fetch origin
git checkout "$BRANCH"
git pull origin "$BRANCH"

# Install dependencies
echo "=== Installing dependencies ==="
npm install --no-audit --no-fund

# Run database migrations
echo "=== Running database migrations ==="
npm run migrate || {
  echo "WARNING: Migration failed. Continuing anyway..."
}

# Build the application
echo "=== Building application ==="
npm run build

# Check/seed admin user
echo "=== Checking/Seeding admin user ==="
npm run seed-admin || {
  echo "WARNING: Admin seed failed. Continuing anyway..."
}

# Check if PM2 is installed
if ! command -v pm2 &> /dev/null; then
  echo "=== Installing PM2 ==="
  npm install -g pm2
fi

# Check if app is already running
PM2_APP_NAME="financial-web-app"
if pm2 list | grep -q "$PM2_APP_NAME"; then
  echo "=== Restarting PM2 app ==="
  pm2 restart "$PM2_APP_NAME"
else
  echo "=== Starting PM2 app ==="
  pm2 start ecosystem.config.js
fi

# Save PM2 process list
echo "=== Saving PM2 process list ==="
pm2 save

# Setup PM2 startup (if not already configured)
echo "=== Setting up PM2 startup ==="
if ! pm2 startup | grep -q "already setup"; then
  STARTUP_CMD=$(pm2 startup systemd -u "$USER" --hp "$HOME" | grep -v "PM2" | tail -1)
  if [ -n "$STARTUP_CMD" ]; then
    echo "Run this command to enable PM2 startup:"
    echo "$STARTUP_CMD"
  fi
else
  echo "PM2 startup already configured"
fi

echo ""
echo "=== Deployment complete ==="
echo "App status:"
pm2 status "$PM2_APP_NAME"
echo ""
echo "View logs: pm2 logs $PM2_APP_NAME"
echo "Restart: pm2 restart $PM2_APP_NAME"
echo "Stop: pm2 stop $PM2_APP_NAME"
