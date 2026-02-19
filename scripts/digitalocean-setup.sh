#!/bin/bash
# Digital Ocean – full setup from scratch: clone, env, DB, run app
# Run as root on a fresh Ubuntu 22.04 droplet:
#   curl -sSL https://raw.githubusercontent.com/WaseemMirzaa/financial-web-app/backend/scripts/digitalocean-setup.sh | sudo bash
#   Or: sudo bash digitalocean-setup.sh
#
# Optional env vars (set before running):
#   GITHUB_REPO, BRANCH, APP_DIR, APP_USER, NODE_VERSION, PORT
#   DB_HOST, DB_USER, DB_PASSWORD, DB_NAME, DB_PORT
#   JWT_SECRET, INSTALL_MYSQL=y
#   ADMIN_EMAIL (default admin@khalijtamweel.com), ADMIN_PASSWORD (default admin@Khalijtamweel123)
#   ENV_FILE=/path/to/your/.env.local  (copy this file to droplet and use instead of generated template)

set -e

# --- Config (override with env vars) ---
GITHUB_REPO="${GITHUB_REPO:-https://github.com/WaseemMirzaa/financial-web-app.git}"
BRANCH="${BRANCH:-backend}"
APP_DIR="${APP_DIR:-/var/www/financial-web-app}"
APP_USER="${APP_USER:-www-data}"
NODE_VERSION="${NODE_VERSION:-20}"
PORT="${PORT:-3000}"

# DB (use for managed DB or local MySQL)
DB_USER_ENV="${DB_USER:-root}"
DB_PASSWORD_ENV="${DB_PASSWORD:-}"
DB_NAME="${DB_NAME:-financial_app}"
DB_PORT="${DB_PORT:-3306}"
DB_HOST="${DB_HOST:-localhost}"

JWT_SECRET="${JWT_SECRET:-change-me-in-production}"
INSTALL_MYSQL="${INSTALL_MYSQL:-n}"
ADMIN_EMAIL="${ADMIN_EMAIL:-admin@khalijtamweel.com}"
ADMIN_PASSWORD="${ADMIN_PASSWORD:-admin@Khalijtamweel123}"

# --- Ensure root ---
if [ "$(id -u)" -ne 0 ]; then
  echo "Run as root (e.g. sudo bash digitalocean-setup.sh)"
  exit 1
fi

echo "=== Updating system and installing dependencies ==="
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y git curl ufw

echo "=== Installing Node.js ${NODE_VERSION} (via NodeSource) ==="
curl -fsSL https://deb.nodesource.com/setup_${NODE_VERSION}.x | bash -
apt-get install -y nodejs

echo "=== Optional: install MySQL server on this droplet ==="
if [[ "$INSTALL_MYSQL" =~ ^[yY] ]]; then
  apt-get install -y mysql-server
  systemctl start mysql
  systemctl enable mysql
  MYSQL_APP_PASS="${DB_PASSWORD_ENV:-$(openssl rand -base64 24)}"
  mysql -e "CREATE DATABASE IF NOT EXISTS \`${DB_NAME}\`;"
  mysql -e "CREATE USER IF NOT EXISTS '${DB_USER_ENV}'@'localhost' IDENTIFIED BY '${MYSQL_APP_PASS}';"
  mysql -e "GRANT ALL PRIVILEGES ON \`${DB_NAME}\`.* TO '${DB_USER_ENV}'@'localhost'; FLUSH PRIVILEGES;"
  DB_PASSWORD_ENV="$MYSQL_APP_PASS"
  echo "MySQL installed. DB: ${DB_NAME}, user: ${DB_USER_ENV}. Password in .env.local."
fi

echo "=== Allow all required permissions (directories and firewall) ==="
# Allow ports: SSH, HTTP, HTTPS, app
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw allow "${PORT}/tcp"
ufw --force enable || true

echo "=== Clone project from GitHub ==="
mkdir -p "$(dirname "$APP_DIR")"
if [ -d "$APP_DIR/.git" ]; then
  cd "$APP_DIR" && git fetch && git checkout "$BRANCH" && git pull && cd -
else
  git clone -b "$BRANCH" "$GITHUB_REPO" "$APP_DIR"
fi
cd "$APP_DIR"
chown -R "$APP_USER:$APP_USER" "$APP_DIR"
chmod -R 755 "$APP_DIR"

echo "=== Creating .env.local (template from project .env.local.example) ==="
# If ENV_FILE is set and exists (e.g. you uploaded your .env.local), use it; else generate from template
if [ -n "${ENV_FILE}" ] && [ -f "${ENV_FILE}" ]; then
  cp "$ENV_FILE" "$APP_DIR/.env.local"
  echo "Using provided env file: $ENV_FILE"
else
  # Template matches repo .env.local.example; fill from env vars
  cat > "$APP_DIR/.env.local" << ENVFILE
# Database
DB_HOST=${DB_HOST}
DB_USER=${DB_USER_ENV}
DB_PASSWORD=${DB_PASSWORD_ENV}
DB_NAME=${DB_NAME}
DB_PORT=${DB_PORT}

# JWT
JWT_SECRET=${JWT_SECRET}

# Google Translate (optional)
GOOGLE_TRANSLATE_API_KEY=

# Firebase – Web (optional)
NEXT_PUBLIC_FIREBASE_API_KEY=
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=
NEXT_PUBLIC_FIREBASE_PROJECT_ID=
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=
NEXT_PUBLIC_FIREBASE_APP_ID=
NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID=

# Production
NODE_ENV=production
PORT=${PORT}
# NEXT_PUBLIC_APP_URL=https://your-domain.com
# SENDGRID_API_KEY=
# SENDGRID_FROM_EMAIL=
ENVFILE
fi
chown "$APP_USER:$APP_USER" "$APP_DIR/.env.local"
chmod 600 "$APP_DIR/.env.local"

echo "=== Add swap space (for low-memory droplets) ==="
if [ ! -f /swapfile ]; then
  fallocate -l 2G /swapfile 2>/dev/null || dd if=/dev/zero of=/swapfile bs=1M count=2048
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

echo "=== Install app deps, migrate, build ==="
# Stop MySQL temporarily to free memory during npm install
systemctl stop mysql 2>/dev/null || true
sudo -u "$APP_USER" bash -c "cd $APP_DIR && npm install --no-audit --no-fund --prefer-offline || npm ci --no-audit --no-fund"
systemctl start mysql 2>/dev/null || true
sudo -u "$APP_USER" bash -c "cd $APP_DIR && npm run migrate"

echo "=== Create admin user ($ADMIN_EMAIL) in database ==="
sudo -u "$APP_USER" bash -c "cd $APP_DIR && ADMIN_EMAIL='$ADMIN_EMAIL' ADMIN_PASSWORD='$ADMIN_PASSWORD' node scripts/create-admin-do.js"

echo "=== Build app ==="
# Stop MySQL during build to free memory
systemctl stop mysql 2>/dev/null || true
sudo -u "$APP_USER" bash -c "cd $APP_DIR && npm run build"
systemctl start mysql 2>/dev/null || true

echo "=== Install PM2 and start app ==="
npm install -g pm2
NPM_PREFIX=$(npm config get prefix 2>/dev/null || echo "/usr/local")
export PATH="$NPM_PREFIX/bin:/usr/local/bin:/usr/bin:$PATH"
PM2_BIN=$(command -v pm2 || echo "$NPM_PREFIX/bin/pm2")
cd "$APP_DIR" && chmod +x scripts/start-server.sh && PORT=$PORT NODE_ENV=production $PM2_BIN start ecosystem.config.js
cd - >/dev/null
$PM2_BIN save
$PM2_BIN startup systemd -u root --hp /root 2>/dev/null || true

echo "=== Setup complete ==="
echo "App dir: $APP_DIR"
echo "Admin login: $ADMIN_EMAIL / $ADMIN_PASSWORD (change password after first login)"
echo "Env file: $APP_DIR/.env.local (edit DB, JWT, Firebase, SendGrid as needed)"
echo "Port: $PORT (UFW allows 22,80,443,$PORT)"
echo "Commands: pm2 status | pm2 logs financial-web-app | pm2 restart financial-web-app"
