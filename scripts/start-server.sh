#!/bin/bash
# PM2 start script: use npx so local next is always found
cd "$(dirname "$0")/.."
exec npx next start -p "${PORT:-3000}"
