#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FRONTEND_URL="${MOCKKIT_FRONTEND_DEV_SERVER:-http://127.0.0.1:5173}"

cd "$ROOT"

run_frontend() {
  case "${npm_config_user_agent:-}" in
    pnpm/*)
      pnpm --dir frontend run dev -- --host 127.0.0.1 --port 5173 --strictPort
      ;;
    yarn/*)
      yarn --cwd frontend dev --host 127.0.0.1 --port 5173 --strictPort
      ;;
    *)
      npm run dev --prefix frontend -- --host 127.0.0.1 --port 5173 --strictPort
      ;;
  esac
}

wait_for_frontend() {
  local attempts=80
  for ((i = 1; i <= attempts; i++)); do
    if curl --silent --fail --output /dev/null "$FRONTEND_URL"; then
      return 0
    fi
    sleep 0.25
  done

  echo "Timed out waiting for $FRONTEND_URL" >&2
  return 1
}

run_frontend &
FRONTEND_PID=$!

cleanup() {
  kill "$FRONTEND_PID" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

wait_for_frontend

MOCKKIT_FRONTEND_DEV_SERVER="$FRONTEND_URL" swift run
