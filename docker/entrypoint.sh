#!/bin/sh
set -e

cd /app

echo "Running memory schema migrations..."
node packages/memory/dist/migrate.js

echo "Running context schema migrations..."
node packages/context/dist/migrate.js

exec "$@"
