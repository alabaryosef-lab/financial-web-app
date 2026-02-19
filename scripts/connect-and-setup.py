#!/usr/bin/env python3
"""
Connect to Digital Ocean droplet and run setup with password authentication.
Usage: python3 connect-and-setup.py DROPLET_IP PASSWORD
"""
import sys
import subprocess
import os
import secrets
import string

DROPLET_IP = sys.argv[1] if len(sys.argv) > 1 else None
PASSWORD = sys.argv[2] if len(sys.argv) > 2 else None

if not DROPLET_IP or not PASSWORD:
    print("Usage: python3 connect-and-setup.py DROPLET_IP PASSWORD")
    sys.exit(1)

# Generate credentials
DB_NAME = "financial_app"
DB_USER = "app_user"
DB_PASSWORD = ''.join(secrets.choice(string.ascii_letters + string.digits) for _ in range(25))
JWT_SECRET = ''.join(secrets.choice(string.ascii_letters + string.digits) for _ in range(40))

print("=== Generated Credentials ===")
print(f"DB_NAME: {DB_NAME}")
print(f"DB_USER: {DB_USER}")
print(f"DB_PASSWORD: {DB_PASSWORD}")
print(f"JWT_SECRET: {JWT_SECRET}")
print()

# Save credentials locally
from datetime import datetime
timestamp = datetime.now().strftime("%Y%m%d-%H%M%S")
creds_file = f"droplet-credentials-{timestamp}.txt"

with open(creds_file, 'w') as f:
    f.write(f"""========================================
Digital Ocean Droplet Credentials
Generated: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}
Droplet IP: {DROPLET_IP}
========================================

DATABASE CREDENTIALS:
--------------------
DB_HOST: localhost
DB_NAME: {DB_NAME}
DB_USER: {DB_USER}
DB_PASSWORD: {DB_PASSWORD}
DB_PORT: 3306

JWT_SECRET: {JWT_SECRET}

ADMIN CREDENTIALS:
------------------
Email: admin@khalijtamweel.com
Password: admin@Khalijtamweel123

APP INFO:
--------
App URL: http://{DROPLET_IP}:3000
App Directory: /var/www/financial-web-app
SSH Command: ssh root@{DROPLET_IP}

PM2 COMMANDS (run on droplet):
------------------------------
pm2 status
pm2 logs financial-web-app
pm2 restart financial-web-app
pm2 stop financial-web-app

========================================
""")

os.chmod(creds_file, 0o600)
print(f"Credentials saved to: {creds_file}")
print()

# Create remote script
remote_script = f"""#!/bin/bash
export INSTALL_MYSQL=y
export DB_NAME={DB_NAME}
export DB_USER={DB_USER}
export DB_PASSWORD={DB_PASSWORD}
export JWT_SECRET={JWT_SECRET}
export ADMIN_EMAIL=admin@khalijtamweel.com
export ADMIN_PASSWORD=admin@Khalijtamweel123
export PORT=3000

curl -sSL https://raw.githubusercontent.com/WaseemMirzaa/financial-web-app/backend/scripts/digitalocean-setup.sh | bash
"""

# Use expect to handle password
expect_script = f"""#!/usr/bin/expect -f
set timeout 300
spawn ssh -o StrictHostKeyChecking=no root@{DROPLET_IP}
expect {{
    "password:" {{
        send "{PASSWORD}\\r"
        exp_continue
    }}
    "# " {{
        send "bash << 'REMOTE_SCRIPT_END'\\r"
        send "{remote_script.replace(chr(10), '\\r').replace('$', '\\$')}"
        send "REMOTE_SCRIPT_END\\r"
        expect "# "
        send "exit\\r"
    }}
    timeout {{
        puts "Connection timeout"
        exit 1
    }}
}}
expect eof
"""

# Try using expect
try:
    result = subprocess.run(['which', 'expect'], capture_output=True, text=True)
    if result.returncode == 0:
        print("=== Connecting and running setup ===")
        proc = subprocess.Popen(['expect', '-'], stdin=subprocess.PIPE, text=True)
        proc.communicate(input=expect_script)
        if proc.returncode == 0:
            print("\n=== Setup complete! ===")
            print(f"All credentials saved to: {creds_file}")
            sys.exit(0)
        else:
            print("Setup failed. Check output above.")
            sys.exit(1)
    else:
        print("Error: 'expect' command not found.")
        print("Please install expect or run the commands manually on the droplet.")
        print("\nRun this on the droplet:")
        print("=" * 50)
        print(remote_script)
        sys.exit(1)
except Exception as e:
    print(f"Error: {e}")
    print("\nPlease run these commands manually on the droplet:")
    print("=" * 50)
    print(remote_script)
    sys.exit(1)
