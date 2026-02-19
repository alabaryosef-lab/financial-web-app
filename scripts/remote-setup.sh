#!/bin/bash
# Remote Digital Ocean setup wrapper
# Usage: ./remote-setup.sh DROPLET_IP [SSH_KEY_PATH] [SSH_USER]
# Example: ./remote-setup.sh 123.45.67.89 ~/.ssh/id_rsa root
# Or with password: ./remote-setup.sh 123.45.67.89 "" root

set -e

DROPLET_IP="${1}"
SSH_KEY="${2:-}"
SSH_USER="${3:-root}"
SSH_PORT="${4:-22}"

if [ -z "$DROPLET_IP" ]; then
  echo "Usage: $0 DROPLET_IP [SSH_KEY_PATH] [SSH_USER] [SSH_PORT]"
  echo "Example: $0 123.45.67.89 ~/.ssh/id_rsa root 22"
  exit 1
fi

echo "=== Generating secure database credentials ==="
DB_NAME="financial_app"
DB_USER="app_user"
DB_PASSWORD=$(openssl rand -base64 32 | tr -d "=+/" | cut -c1-25)
JWT_SECRET=$(openssl rand -base64 48 | tr -d "=+/" | cut -c1-40)
TIMESTAMP=$(date +"%Y-%m-%d %H:%M:%S")

echo "DB Name: $DB_NAME"
echo "DB User: $DB_USER"
echo "DB Password: $DB_PASSWORD"
echo "JWT Secret: $JWT_SECRET"
echo ""

# Save credentials locally
CREDS_FILE="droplet-credentials-$(date +%Y%m%d-%H%M%S).txt"
cat > "$CREDS_FILE" << CREDENTIALS
========================================
Digital Ocean Droplet Credentials
Generated: $TIMESTAMP
Droplet IP: $DROPLET_IP
========================================

DATABASE CREDENTIALS:
--------------------
DB_HOST: localhost
DB_NAME: $DB_NAME
DB_USER: $DB_USER
DB_PASSWORD: $DB_PASSWORD
DB_PORT: 3306

JWT_SECRET: $JWT_SECRET

ADMIN CREDENTIALS:
------------------
Email: admin@khalijtamweel.com
Password: admin@Khalijtamweel123

APP INFO:
--------
App URL: http://$DROPLET_IP:3000
App Directory: /var/www/financial-web-app
SSH Command: ssh${SSH_KEY:+ -i $SSH_KEY} $SSH_USER@$DROPLET_IP

PM2 COMMANDS (run on droplet):
------------------------------
pm2 status
pm2 logs financial-web-app
pm2 restart financial-web-app
pm2 stop financial-web-app

========================================
CREDENTIALS

chmod 600 "$CREDS_FILE"
echo "Credentials saved to: $CREDS_FILE"
echo ""

# Build SSH command
SSH_CMD="ssh"
if [ -n "$SSH_KEY" ] && [ -f "$SSH_KEY" ]; then
  SSH_CMD="$SSH_CMD -i $SSH_KEY"
fi
SSH_CMD="$SSH_CMD -p $SSH_PORT -o StrictHostKeyChecking=no"

echo "=== Connecting to droplet ($SSH_USER@$DROPLET_IP) ==="

# Upload setup script
echo "Uploading setup script..."
if [ -n "$SSH_KEY" ] && [ -f "$SSH_KEY" ]; then
  scp -i "$SSH_KEY" -P "$SSH_PORT" -o StrictHostKeyChecking=no scripts/digitalocean-setup.sh "$SSH_USER@$DROPLET_IP:/tmp/setup.sh"
  scp -i "$SSH_KEY" -P "$SSH_PORT" -o StrictHostKeyChecking=no scripts/create-admin-do.js "$SSH_USER@$DROPLET_IP:/tmp/create-admin-do.js"
else
  scp -P "$SSH_PORT" -o StrictHostKeyChecking=no scripts/digitalocean-setup.sh "$SSH_USER@$DROPLET_IP:/tmp/setup.sh"
  scp -P "$SSH_PORT" -o StrictHostKeyChecking=no scripts/create-admin-do.js "$SSH_USER@$DROPLET_IP:/tmp/create-admin-do.js"
fi

# Create remote script with env vars
REMOTE_SCRIPT=$(cat <<EOF
#!/bin/bash
export INSTALL_MYSQL=y
export DB_NAME="$DB_NAME"
export DB_USER="$DB_USER"
export DB_PASSWORD="$DB_PASSWORD"
export JWT_SECRET="$JWT_SECRET"
export ADMIN_EMAIL="admin@khalijtamweel.com"
export ADMIN_PASSWORD="admin@Khalijtamweel123"
export PORT=3000

# Copy scripts to expected location
mkdir -p /tmp/app-scripts
cp /tmp/setup.sh /tmp/app-scripts/digitalocean-setup.sh
cp /tmp/create-admin-do.js /tmp/app-scripts/create-admin-do.js
chmod +x /tmp/app-scripts/digitalocean-setup.sh

# Run setup
bash /tmp/app-scripts/digitalocean-setup.sh
EOF
)

echo "=== Running setup on droplet ==="
if [ -n "$SSH_KEY" ] && [ -f "$SSH_KEY" ]; then
  echo "$REMOTE_SCRIPT" | $SSH_CMD "$SSH_USER@$DROPLET_IP" "bash"
else
  echo "$REMOTE_SCRIPT" | ssh -p "$SSH_PORT" -o StrictHostKeyChecking=no "$SSH_USER@$DROPLET_IP" "bash"
fi

echo ""
echo "=== Setup complete! ==="
echo "Droplet IP: $DROPLET_IP"
echo "App URL: http://$DROPLET_IP:3000"
echo ""
echo "All credentials saved locally to: $CREDS_FILE"
echo ""
echo "Quick summary:"
echo "  Database: $DB_NAME / $DB_USER"
echo "  Admin: admin@khalijtamweel.com / admin@Khalijtamweel123"
echo ""
echo "View full credentials: cat $CREDS_FILE"
