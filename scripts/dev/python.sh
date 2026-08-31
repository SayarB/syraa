#!/usr/bin/env bash
# Run a Python module with repo venv when available (used by npm scripts).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
export PYTHONPATH="$ROOT/services/ingest-worker${PYTHONPATH:+:$PYTHONPATH}"
if [[ -x "$ROOT/.venv/bin/python3" ]]; then
  exec "$ROOT/.venv/bin/python3" "$@"
fi
exec python3 "$@"
