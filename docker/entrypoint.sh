#!/bin/sh
set -e

cd /app

if [ "${NODE_ENV:-}" = "production" ]; then
  if [ -z "${BETTER_AUTH_SECRET:-}" ]; then
    echo "FATAL: BETTER_AUTH_SECRET is required in production" >&2
    exit 1
  fi
  if [ -z "${BETTER_AUTH_URL:-}" ]; then
    echo "FATAL: BETTER_AUTH_URL is required in production (e.g. https://syraa.example.com)" >&2
    exit 1
  fi
fi

echo "Running memory schema migrations..."
node packages/memory/dist/migrate.js

echo "Running context schema migrations..."
node packages/context/dist/migrate.js

if [ -n "${BETTER_AUTH_SECRET:-}" ]; then
  echo "Running Better Auth schema migrations..."
  node packages/harness/dist/auth/migrate.js
else
  echo "Skipping Better Auth migrate (BETTER_AUTH_SECRET unset)"
fi

exec "$@"
