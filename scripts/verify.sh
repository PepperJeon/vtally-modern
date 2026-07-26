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
  # backstop in case npm/ts-node forked children the PID kill above missed.
  # Match the REAL command lines: `npm run start:frontend` execs
  # `node .../react-scripts/scripts/start.js`, so a "react-scripts start"
  # pattern never matches and the CRA dev server survives every run.
  # `npm run start:frontend` execs node with the RESOLVED script path:
  #   CRA   node .../node_modules/react-scripts/scripts/start.js
  #   Vite  node .../node_modules/.bin/vite
  # Patterns like "react-scripts start" or "vite/bin/vite" match neither, so
  # the dev server outlives every run and the next one aborts on a busy port.
  pkill -f "ts-node.*server\.ts.*--with-test" 2>/dev/null
  pkill -f "react-scripts/scripts/start.js" 2>/dev/null
  pkill -f "bin/vite" 2>/dev/null
}
trap cleanup EXIT INT TERM

# A server left over from an earlier run makes this harness lie: our own backend
# fails to bind, wait_ready succeeds against the STRANGER, and cypress then runs
# against a server started without --with-test (no TestConnector) — dozens of
# spurious failures with no visible cause. Refuse to run instead.
for port in 3000 3001; do
  if lsof -nP -iTCP:$port -sTCP:LISTEN >/dev/null 2>&1; then
    echo "ABORT: port $port is already in use — a previous run's server is still alive."
    lsof -nP -iTCP:$port -sTCP:LISTEN | tail -n +2 | sed 's/^/  /'
    echo "  kill it, then re-run. (Results would be measured against the wrong server.)"
    exit 2
  fi
done

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
  # Dev-proxy direction inverted (plan 0.3): Vite:3001 is the entry point and
  # proxies /socket.io to express:3000. express no longer serves the app shell,
  # so probing :3000 for id="root" can never succeed here.
  APP_URL="http://localhost:3001"
  export NODE_OPTIONS="${NODE_OPTIONS:-}"        # webpack4 legacy-provider no longer needed
else
  WORLD=cra
  UNIT_TEST_CMD="npm run test:ci -- --verbose"
  BUILD_CMD="npm run build:frontend"
  BUNDLE_DIR="$HUB/build"
  CYPRESS_SPEC_DIR="cypress/integration"
  APP_URL="http://localhost:3000"                 # express is the entry point, proxies to CRA:3001
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
  # "$got / $want" reads as "got of total" and it is not — $want is the
  # baseline. Spell it out; the run's own totals are printed separately.
  if [ "$got" -lt "$want" ]; then
    printf "FAIL  %-28s %s  (baseline: %s)\n" "$1" "$got" "$want"
    FAIL=1
  elif [ "$got" -gt "$want" ]; then
    printf "PASS  %-28s %s  (baseline: %s — better, raise it in %s)\n" "$1" "$got" "$want" "$BASELINE"
  else
    printf "PASS  %-28s %s  (baseline: %s)\n" "$1" "$got" "$want"
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

# Server stdout goes to a log, not to ours. Both servers are chatty ("Connecting
# event ... to socket ..." per socket per spec) and inline they bury the pass/fail
# table this script exists to print.
SERVER_LOG=$(mktemp)
start_backend()  { (cd "$HUB" && eval "$BACKEND_CMD")  >>"$SERVER_LOG" 2>&1 & BACKEND_PID=$!;  PIDS+=("$BACKEND_PID"); }
start_frontend() { (cd "$HUB" && eval "$FRONTEND_CMD") >>"$SERVER_LOG" 2>&1 & FRONTEND_PID=$!; PIDS+=("$FRONTEND_PID"); }

# ---------------------------------------------------------------------------
echo "== typecheck =="
(cd "$HUB" && npx tsc -p tsconfig.json --noEmit);        gate_exit "tsc (app)"    $?
(cd "$HUB" && npx tsc -p tsconfig.server.json --noEmit); gate_exit "tsc (server)" $?
echo

echo "== unit tests =="
UNIT_LOG=$(mktemp)
(cd "$HUB" && eval "$UNIT_TEST_CMD") > "$UNIT_LOG" 2>&1
# Two summary dialects:
#   jest    "Test Suites: 1 failed, 32 passed, 33 total"
#   vitest  " Test Files  1 failed | 32 passed (33)"
# "N passed" is common to both; the total is "N total" (jest) or "(N)" (vitest).
n_passed() { echo "$1" | grep -oE '[0-9]+ passed' | grep -oE '[0-9]+' | head -1; }
n_total() {
  local t
  t=$(echo "$1" | grep -oE '[0-9]+ total' | grep -oE '[0-9]+' | head -1)
  [ -z "$t" ] && t=$(echo "$1" | grep -oE '\([0-9]+\)' | tr -d '()' | head -1)
  echo "${t:-0}"
}
SUITE_LINE=$(grep -E '^ *(Test Suites:|Test Files )' "$UNIT_LOG" | tail -1 || true)
TEST_LINE=$(grep -E '^ *Tests[: ]' "$UNIT_LOG" | tail -1 || true)
SUITES_PASSED=$(n_passed "$SUITE_LINE"); SUITES_TOTAL=$(n_total "$SUITE_LINE")
TESTS_PASSED=$(n_passed "$TEST_LINE");   TESTS_TOTAL=$(n_total "$TEST_LINE")
if [ -z "${SUITES_PASSED:-}" ] || [ -z "${TESTS_PASSED:-}" ]; then
  # Never silently report 0 — that reads as a catastrophic regression when the
  # real problem is an unrecognised summary format.
  echo "FAIL  could not parse the test summary. Last lines of $UNIT_LOG:"
  tail -5 "$UNIT_LOG" | sed 's/^/          /'
  FAIL=1
fi
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
  # One probe per dependency, each asserted to be 0 separately. A single
  # combined alternation that matches nothing cannot distinguish "clean" from
  # "my regex is wrong" — five that each match nothing can.
  #
  # NOTE: the package is `obs-websocket-js`. Probing for bare "obs-websocket"
  # also matches ObsSettings.tsx's user-facing copy naming the OBS *plugin*
  # ("the obs-websocket plugin version 4.x"), which is product text, not a
  # library import. That false positive is why this gate failed Phase 1.
  LEAK_TOTAL=0
  for dep in "obs-websocket-js" "nodemcu" "atem-connection" "@julusian" "child_process"; do
    n=$(grep -rl -- "$dep" "$BUNDLE_DIR" 2>/dev/null | wc -l | tr -d ' ')
    if [ "$n" -ne 0 ]; then
      printf "FAIL  %-28s %s: %s file(s)\n" "bundle leak check" "$dep" "$n"
      grep -rl -- "$dep" "$BUNDLE_DIR" 2>/dev/null | sed 's/^/          /'
      LEAK_TOTAL=$((LEAK_TOTAL + n)); FAIL=1
    else
      printf "PASS  %-28s %s: 0\n" "bundle leak check" "$dep"
    fi
  done
else
  printf "FAIL  %-28s (build failed or bundle dir missing: %s)\n" "bundle leak check" "$BUNDLE_DIR"
  FAIL=1
fi
echo

echo "== cypress ($CYPRESS_SPEC_DIR, manual_* excluded — manual_flasher hangs headless via cy.pause()) =="
start_backend
start_frontend
# Two separate readiness facts: the app shell must be served by whichever port
# is the entry point in this world, AND our own backend must still be alive.
# Checking only the shell would let a stranger's server satisfy the gate.
if ! wait_ready "$APP_URL"; then
  echo "FAIL  cypress                       app shell never became ready at $APP_URL"
  FAIL=1
elif ! kill -0 "$BACKEND_PID" 2>/dev/null; then
  echo "FAIL  cypress                       backend died during startup (port already taken?)"
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
    if [ "${f:-0}" -ne 0 ]; then
      # Counts alone are not actionable. Name the failing tests and keep the log.
      grep -E '^\s+[0-9]+\) ' "$CY_LOG" | sed 's/^/     /'
      echo "     log: $CY_LOG"
    fi
    if ! kill -0 "$BACKEND_PID" 2>/dev/null; then
      echo "  WARNING: backend died after $spec (this is the known NodeMcuConnector /flasher crash if spec is smoke.spec.ts — expected, not a new failure). Restarting."
      start_backend
      wait_ready "$APP_URL" || echo "  WARNING: app did not come back up"
    fi
  done < <(cd "$HUB" && ls "$CYPRESS_SPEC_DIR" | grep -v '^manual_' | sort)
  CY_TOTAL=$((CY_PASS + CY_FAIL + CY_PEND))
  gate_count "cypress passed" "$CY_PASS" "$(base cypress_passed)"
  echo "        (total: $CY_PASS/$CY_TOTAL, baseline total: $(base cypress_total), server log: $SERVER_LOG)"
fi
echo

if [ "$FAIL" -eq 0 ]; then echo "RESULT: PASS (≥ baseline on every gate)"; else echo "RESULT: FAIL (see above)"; fi
exit $FAIL
