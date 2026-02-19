#!/bin/bash
# PM2 start script: ensures node_modules/.bin is in PATH so "next" is found
cd "$(dirname "$0")/.."
export PATH="$PWD/node_modules/.bin:$PATH"
exec next start -p "${PORT:-3000}"
