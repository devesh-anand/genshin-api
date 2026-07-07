#!/bin/bash
set -x
echo "=== Starting genshin-api ==="
echo "Current directory: $(pwd)"
echo "Node version: $(node --version)"
echo "NPM version: $(npm --version)"
echo "PORT env var: $PORT"
echo "AWS_ID env var: ${AWS_ID:-(not set)}"
echo "AWS_KEY env var: ${AWS_KEY:-(not set)}"
echo "R2_ID env var: ${R2_ID:-(not set)}"
echo "=== Listing /app directory ==="
ls -la /app/
echo "=== Listing /app/data/characters ==="
ls -la /app/data/characters/ | head -10
echo "=== Starting Node app ==="
exec node index.js

