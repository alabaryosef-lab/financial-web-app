#!/bin/bash
# Copy-paste this entire block on the droplet (as root) to fix and start the app:
#
# curl -sSL https://raw.githubusercontent.com/WaseemMirzaa/financial-web-app/backend/scripts/droplet-fix-app.sh -o /tmp/fix.sh && chmod +x /tmp/fix.sh && bash /tmp/fix.sh
#
# Or run these commands one by one:
# export PATH="/usr/local/bin:/usr/bin:$PATH"
# npm install -g pm2
# cd /var/www/financial-web-app
# test -d .next || (npm ci && npm run build)
# pm2 delete financial-web-app 2>/dev/null; PORT=3000 NODE_ENV=production pm2 start npm --name financial-web-app -- start
# pm2 save && pm2 startup systemd -u root --hp /root
# pm2 status
