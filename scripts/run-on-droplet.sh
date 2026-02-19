#!/bin/bash
# Run this script directly on the droplet after SSH'ing in
# Copy-paste the entire content and run: bash <(cat << 'SCRIPT_END'
# Or save as run-on-droplet.sh and run: bash run-on-droplet.sh

export INSTALL_MYSQL=y
export DB_NAME=financial_app
export DB_USER=app_user
export DB_PASSWORD=ClzP4qAbubCly4ZlGXGhaGwqn
export JWT_SECRET=teAEpEMiLpMJHdb39skEww70520e1Ow5SeEmcnQh
export ADMIN_EMAIL=admin@khalijtamweel.com
export ADMIN_PASSWORD=admin@Khalijtamweel123
export PORT=3000

# Download and run setup script
curl -sSL https://raw.githubusercontent.com/WaseemMirzaa/financial-web-app/backend/scripts/digitalocean-setup.sh | bash
