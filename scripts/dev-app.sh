#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FRONTEND_HOST="${MOCKKIT_DEV_HOST:-localhost}"
FRONTEND_PORT="${MOCKKIT_DEV_PORT:-5173}"
FRONTEND_URL="http://${FRONTEND_HOST}:${FRONTEND_PORT}"
FRONTEND_PID=""

cd "$ROOT"

run_frontend() {
  case "${npm_config_user_agent:-}" in
    pnpm/*)
      pnpm --dir frontend run dev --host "$FRONTEND_HOST" --port "$FRONTEND_PORT" --strictPort
      ;;
    yarn/*)
      yarn --cwd frontend dev --host "$FRONTEND_HOST" --port "$FRONTEND_PORT" --strictPort
      ;;
    *)
      npm run dev --prefix frontend -- --host "$FRONTEND_HOST" --port "$FRONTEND_PORT" --strictPort
      ;;
  esac
}

frontend_is_ready() {
  curl --silent --fail --max-time 2 "$FRONTEND_URL" | grep -q "<title>MockKit</title>"
}

wait_for_frontend() {
  local attempts=80
  for ((i = 1; i <= attempts; i++)); do
    if frontend_is_ready; then
      return 0
    fi
    sleep 0.25
  done

  echo "Timed out waiting for $FRONTEND_URL" >&2
  return 1
}

kill_process_tree() {
  local pid="$1"
  local child

  for child in $(pgrep -P "$pid" 2>/dev/null || true); do
    kill_process_tree "$child"
  done

  kill "$pid" 2>/dev/null || true
}

cleanup() {
  if [[ -n "${FRONTEND_PID:-}" ]]; then
    kill_process_tree "$FRONTEND_PID"
    wait "$FRONTEND_PID" 2>/dev/null || true
    FRONTEND_PID=""
  fi
}
trap cleanup EXIT
trap 'cleanup; exit 130' INT
trap 'cleanup; exit 143' TERM

if frontend_is_ready; then
  echo "Using existing MockKit frontend dev server at $FRONTEND_URL"
else
  run_frontend &
  FRONTEND_PID=$!
fi

wait_for_frontend

MOCKKIT_FRONTEND_DEV_SERVER="$FRONTEND_URL" swift run
