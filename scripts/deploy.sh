#!/usr/bin/env bash
# Server deploy: fetch, pull, install, migrate, build, pm2 restart.
# On server once: chmod +x scripts/deploy.sh
# Usage: ./scripts/deploy.sh [--seed-admin]
# Env: APP_DIR (default /var/www/financial-web-app), DEPLOY_BRANCH (default backend-no-firebase)
set -e

APP_DIR="${APP_DIR:-/var/www/financial-web-app}"
BRANCH="${DEPLOY_BRANCH:-backend-no-firebase}"
SEED_ADMIN=false

for arg in "$@"; do
  [ "$arg" = "--seed-admin" ] && SEED_ADMIN=true
done

cd "$APP_DIR"
echo "[deploy] Using $APP_DIR, branch $BRANCH"

echo "[deploy] Fetching and checking out..."
git fetch origin "$BRANCH"
git checkout "$BRANCH"
git pull origin "$BRANCH"

echo "[deploy] Installing dependencies..."
npm install --no-audit --no-fund

echo "[deploy] Running migrations..."
npm run db:migrate

if [ "$SEED_ADMIN" = true ]; then
  echo "[deploy] Seeding admin..."
  npm run seed-admin
fi

echo "[deploy] Building..."
npm run build

echo "[deploy] Restarting PM2..."
pm2 restart financial-web-app
pm2 save

echo "[deploy] Done."
