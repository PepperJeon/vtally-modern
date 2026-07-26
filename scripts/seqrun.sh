#!/usr/bin/env bash
# Run a list of cypress specs IN ORDER against one shared, freshly-allocated
# backend+frontend (mirrors how verify.sh runs the whole suite: one long-lived
# server pair, one `cypress run --spec` invocation per file). Used to check
# whether an earlier spec's failure leaks state that breaks a later spec.
# Usage: seqrun.sh <repo-root> <spec1> [spec2] [spec3] ...
set -uo pipefail
ROOT=$1; shift
SPECS=("$@")
cd "$ROOT" || exit 1
HUB=hub

free_port() {
  node -e "
    const s = require('net').createServer();
    s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => console.log(p)); });
  "
}
udp_free_port() {
  node -e "
    const s = require('dgram').createSocket('udp4');
    s.bind(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => console.log(p)); });
  "
}
BACKEND_PORT=$(free_port)
FRONTEND_PORT=$(free_port)
while [ "$FRONTEND_PORT" = "$BACKEND_PORT" ]; do FRONTEND_PORT=$(free_port); done
TALLY_PORT=$(udp_free_port)
APP_URL="http://localhost:$FRONTEND_PORT"
echo "ports: backend=$BACKEND_PORT frontend=$FRONTEND_PORT tally=$TALLY_PORT/udp"

PIDS=()
cleanup() { for p in "${PIDS[@]:-}"; do kill "$p" 2>/dev/null; done; }
trap cleanup EXIT INT TERM

SRV=$(mktemp)
(cd "$HUB" && PORT="$BACKEND_PORT" DEV_PROXY_PORT="$FRONTEND_PORT" TALLY_PORT="$TALLY_PORT" npm run cypress:backend) >>"$SRV" 2>&1 &
BACK=$!; PIDS+=("$BACK")
(cd "$HUB" && PORT="$FRONTEND_PORT" BACKEND_PORT="$BACKEND_PORT" FRONTEND_PORT="$FRONTEND_PORT" npm run start:frontend) >>"$SRV" 2>&1 &
PIDS+=("$!")

tries=90
until curl -s "$APP_URL" 2>/dev/null | grep -q 'id="root"'; do
  tries=$((tries-1)); [ $tries -le 0 ] && { echo "ABORT: app never ready at $APP_URL (log $SRV)"; exit 1; }
  sleep 2
done
echo "app ready at $APP_URL"

for spec in "${SPECS[@]}"; do
  L=$(mktemp)
  (cd "$HUB" && CYPRESS_BASE_URL="$APP_URL" CYPRESS_TALLY_PORT="$TALLY_PORT" npx cypress run --spec "$spec") >"$L" 2>&1
  p=$(grep -oE '[0-9]+ passing' "$L" | grep -oE '[0-9]+' | head -1)
  f=$(grep -oE '[0-9]+ failing' "$L" | grep -oE '[0-9]+' | head -1)
  echo "$spec: ${p:-0} passing / ${f:-0} failing (log $L)"
  grep -E '^\s+[0-9]+\) ' "$L" | sed 's/^/      /' | head -5
  if ! kill -0 "$BACK" 2>/dev/null; then
    echo "      (backend died; restarting)"
    (cd "$HUB" && PORT="$BACKEND_PORT" DEV_PROXY_PORT="$FRONTEND_PORT" TALLY_PORT="$TALLY_PORT" npm run cypress:backend) >>"$SRV" 2>&1 &
    BACK=$!; PIDS+=("$BACK")
    sleep 8
  fi
done
echo "server log: $SRV"
