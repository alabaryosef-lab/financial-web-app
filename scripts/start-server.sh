#!/bin/bash
# PM2 start script: custom server ensures handler is ready before accepting connections
cd "$(dirname "$0")/.."
export NODE_ENV="${NODE_ENV:-production}"
export PORT="${PORT:-3000}"
exec node server.js
