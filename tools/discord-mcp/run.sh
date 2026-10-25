#!/usr/bin/env bash
# Starts the vendored Discord MCP for Claude Code. Token comes from backend/.env.
set -euo pipefail
DIR="$(cd "$(dirname "$0")" && pwd)"
set -a; . "$DIR/../../backend/.env"; set +a
if [ ! -d "$DIR/node_modules" ]; then
  (cd "$DIR" && npm ci --omit=dev --ignore-scripts --silent >&2)
fi
exec node "$DIR/build/index.js"
