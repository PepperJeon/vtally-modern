#!/usr/bin/env bash
# Mechanical baseline verification harness. Runs every gate a phase must
# clear and prints one pass/fail table compared against scripts/baseline.json
# (the single source of truth for "≥ baseline" — never edit numbers inline
# in prose, edit that file, so a baseline change is a reviewable diff).
#
# Usage: scripts/verify.sh   (run from anywhere, cds to repo root itself)
# Exit code: 0 if every gate is >= baseline, 1 if any gate regressed.
set -uo pipefail
cd "$(dirname "$0")/.."   # repo root
HUB=hub
BASELINE=scripts/baseline.json
FAIL=0
PIDS=()

cleanup() {
  for p in "${PIDS[@]:-}"; do kill "$p" 2>/dev/null; done
  # backstop in case npm/ts-node forked children the PID kill above missed
  pkill -f "ts-node.*server\.ts.*--with-test" 2>/dev/null
  pkill -f "react-scripts start" 2>/dev/null
  pkill -f "vite " 2>/dev/null
}
trap cleanup EXIT INT TERM

base() { node -pe "require('./$BASELINE').$1"; }

# ---------------------------------------------------------------------------
# World detection. Phase 1 replaces CRA/Jest/webpack with Vite/Vitest and
# moves cypress/integration -> cypress/e2e and build output -> dist/client.
# These are the ONLY variables that should need touching after Phase 1 —
# if a script/path changed under Vite, fix it here, not the logic below.
# ---------------------------------------------------------------------------
if [ -f "$HUB/vite.config.ts" ] || [ -f "$HUB/vite.config.js" ]; then
  WORLD=vite
  UNIT_TEST_CMD="npx vitest run"                # TODO(Phase1): confirm script name
  BUILD_CMD="npm run build:frontend"
  BUNDLE_DIR="$HUB/dist/client"
  CYPRESS_SPEC_DIR="cypress/e2e"
  export NODE_OPTIONS="${NODE_OPTIONS:-}"        # webpack4 legacy-provider no longer needed
else
  WORLD=cra
  UNIT_TEST_CMD="npm run test:ci -- --verbose"
  BUILD_CMD="npm run build:frontend"
  BUNDLE_DIR="$HUB/build"
  CYPRESS_SPEC_DIR="cypress/integration"
  export NODE_OPTIONS="--openssl-legacy-provider" # react-scripts4/webpack4 md4 hash breaks on modern OpenSSL
fi
BACKEND_CMD="npm run cypress:backend"   # ts-node --with-test, port 3000
FRONTEND_CMD="npm run start:frontend"   # CRA/Vite dev server, port 3001
echo "world: $WORLD"
echo

# ---------------------------------------------------------------------------
gate_exit() { # gate_exit <label> <exit-status>
  if [ "$2" -eq 0 ]; then printf "PASS  %-28s\n" "$1"
  else printf "FAIL  %-28s (exit %s)\n" "$1" "$2"; FAIL=1; fi
}

gate_count() { # gate_count <label> <got> <want>
  local got=$2 want=$3
  if [ "$got" -lt "$want" ]; then
    printf "FAIL  %-28s %s / %s  (baseline: %s)\n" "$1" "$got" "$3" "$want"
    FAIL=1
  elif [ "$got" -gt "$want" ]; then
    printf "PASS  %-28s %s / %s  (better than baseline — consider raising %s)\n" "$1" "$got" "$3" "$BASELINE"
  else
    printf "PASS  %-28s %s / %s\n" "$1" "$got" "$3"
  fi
}

wait_ready() { # wait_ready <url> -> 0 once it returns 200 with a served app shell
  local url=$1 tries=60 body
  body=$(mktemp)
  while [ $tries -gt 0 ]; do
    code=$(curl -s -o "$body" -w '%{http_code}' "$url" 2>/dev/null || echo 000)
    if [ "$code" = "200" ] && grep -q 'id="root"' "$body"; then rm -f "$body"; return 0; fi
    sleep 2; tries=$((tries - 1))
  done
  rm -f "$body"; return 1
}

start_backend()  { (cd "$HUB" && eval "$BACKEND_CMD")  & BACKEND_PID=$!;  PIDS+=("$BACKEND_PID"); }
start_frontend() { (cd "$HUB" && eval "$FRONTEND_CMD") & FRONTEND_PID=$!; PIDS+=("$FRONTEND_PID"); }

# ---------------------------------------------------------------------------
echo "== typecheck =="
(cd "$HUB" && npx tsc -p tsconfig.json --noEmit);        gate_exit "tsc (app)"    $?
(cd "$HUB" && npx tsc -p tsconfig.server.json --noEmit); gate_exit "tsc (server)" $?
echo

echo "== unit tests =="
UNIT_LOG=$(mktemp)
(cd "$HUB" && eval "$UNIT_TEST_CMD") > "$UNIT_LOG" 2>&1
SUITE_LINE=$(grep '^Test Suites:' "$UNIT_LOG" || true)
TEST_LINE=$(grep '^Tests:' "$UNIT_LOG" || true)
SUITES_PASSED=$(echo "$SUITE_LINE" | grep -oE '[0-9]+ passed' | grep -oE '[0-9]+' || echo 0)
SUITES_TOTAL=$(echo "$SUITE_LINE" | grep -oE '[0-9]+ total' | grep -oE '[0-9]+' || echo 0)
TESTS_PASSED=$(echo "$TEST_LINE" | grep -oE '[0-9]+ passed' | grep -oE '[0-9]+' || echo 0)
TESTS_TOTAL=$(echo "$TEST_LINE" | grep -oE '[0-9]+ total' | grep -oE '[0-9]+' || echo 0)
gate_count "unit suites passed" "${SUITES_PASSED:-0}" "$(base unit_suites_passed)"
gate_count "unit tests passed"  "${TESTS_PASSED:-0}"  "$(base unit_tests_passed)"
echo "        (suites: ${SUITES_PASSED:-0}/${SUITES_TOTAL:-0}, tests: ${TESTS_PASSED:-0}/${TESTS_TOTAL:-0}, log: $UNIT_LOG)"
echo

echo "== production build =="
(cd "$HUB" && eval "$BUILD_CMD"); BUILD_STATUS=$?
gate_exit "production build" $BUILD_STATUS
echo

echo "== bundle leak check (server-only deps must not reach the client bundle) =="
if [ $BUILD_STATUS -eq 0 ] && [ -d "$BUNDLE_DIR" ]; then
  LEAKS=$(grep -rl "obs-websocket\|nodemcu\|atem-connection\|@julusian" "$BUNDLE_DIR" 2>/dev/null | wc -l | tr -d ' ')
  if [ "$LEAKS" -ne 0 ]; then
    printf "FAIL  %-28s %s file(s) leak a server-only dep — MUST be 0\n" "bundle leak check" "$LEAKS"
    FAIL=1
  else
    printf "PASS  %-28s 0 leaked files\n" "bundle leak check"
  fi
else
  printf "FAIL  %-28s (build failed or bundle dir missing: %s)\n" "bundle leak check" "$BUNDLE_DIR"
  FAIL=1
fi
echo

echo "== cypress ($CYPRESS_SPEC_DIR, manual_* excluded — manual_flasher hangs headless via cy.pause()) =="
start_backend
start_frontend
if ! wait_ready "http://localhost:3000"; then
  echo "FAIL  cypress                       servers never became ready"
  FAIL=1
else
  CY_PASS=0 CY_FAIL=0 CY_PEND=0
  while IFS= read -r spec; do
    [ -z "$spec" ] && continue
    CY_LOG=$(mktemp)
    (cd "$HUB" && npx cypress run --spec "$CYPRESS_SPEC_DIR/$spec") > "$CY_LOG" 2>&1
    p=$(grep -oE '[0-9]+ passing' "$CY_LOG" | grep -oE '[0-9]+' | head -1 || echo 0)
    f=$(grep -oE '[0-9]+ failing' "$CY_LOG" | grep -oE '[0-9]+' | head -1 || echo 0)
    n=$(grep -oE '[0-9]+ pending' "$CY_LOG" | grep -oE '[0-9]+' | head -1 || echo 0)
    CY_PASS=$((CY_PASS + ${p:-0})); CY_FAIL=$((CY_FAIL + ${f:-0})); CY_PEND=$((CY_PEND + ${n:-0}))
    echo "  $spec: ${p:-0} passing / ${f:-0} failing / ${n:-0} pending"
    if ! kill -0 "$BACKEND_PID" 2>/dev/null; then
      echo "  WARNING: backend died after $spec (this is the known NodeMcuConnector /flasher crash if spec is smoke.spec.ts — expected, not a new failure). Restarting."
      start_backend
      wait_ready "http://localhost:3000" || echo "  WARNING: backend did not come back up"
    fi
  done < <(cd "$HUB" && ls "$CYPRESS_SPEC_DIR" | grep -v '^manual_' | sort)
  CY_TOTAL=$((CY_PASS + CY_FAIL + CY_PEND))
  gate_count "cypress passed" "$CY_PASS" "$(base cypress_passed)"
  echo "        (total: $CY_PASS/$CY_TOTAL, baseline total: $(base cypress_total))"
fi
echo

if [ "$FAIL" -eq 0 ]; then echo "RESULT: PASS (≥ baseline on every gate)"; else echo "RESULT: FAIL (see above)"; fi
exit $FAIL
