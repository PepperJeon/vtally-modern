# scripts/verify.sh

Mechanical gate for "did this phase pass its gate?" Replaces prose self-reporting:
this script runs every gate a phase must clear and prints one pass/fail table
against `scripts/baseline.json`. Non-zero exit = regression.

```
scripts/verify.sh
```

Gates, in order: `tsc` (app config, server config, both must exit 0) → unit
tests (suites/tests passed vs baseline) → production build (exit 0) →
bundle leak check (`grep -rl "obs-websocket|nodemcu|atem-connection|@julusian"`
over the client bundle output — MUST be 0 hits, these are server-only deps)
→ Cypress (13 non-manual specs, passed count vs baseline).

## Concurrent runs are safe

`verify.sh` allocates its own backend/frontend port pair at startup instead
of hardcoding 3000/3001 (bind port 0, read back what the OS assigned —
race-tolerant even when two runs start in the same second). It plumbs the
chosen ports through `PORT`/`DEV_PROXY_PORT` (backend) and
`PORT`/`BACKEND_PORT`/`FRONTEND_PORT` (frontend, read by
`hub/vite.config.ts`), and through `CYPRESS_BASE_URL` for Cypress. Multiple
worktrees can each run `scripts/verify.sh` at the same time without
stomping each other's servers. The chosen ports are printed at the top of
the output (`ports: backend=... frontend=... tally=.../udp`) so a failed
run can be traced back to its processes.

The tally protocol (`hub/src/server/tally/UdpTallyDriver.ts`) is UDP, not
HTTP, and used to be hardcoded to port 7411 with no override — a second
concurrent run either failed to bind it (its cypress tally specs then time
out waiting for a tally that can never arrive) or received the other run's
tally traffic on top of its own (phantom tallies that look exactly like
cross-spec state leakage but aren't). `TALLY_PORT` is now allocated the same
race-proof way (bind UDP port 0), read by `AppConfiguration.getTallyPort()`
the same way `getHttpPort()` reads `PORT`, and forwarded to the Cypress
mock tally (`hub/cypress/MockUdpTally.ts`, wired up in
`hub/cypress/plugins/tally.ts`) via `CYPRESS_TALLY_PORT` so the mock sends
to the same port the hub is actually listening on. A pre-flight check
(`lsof -iUDP`, no `-sTCP:LISTEN` — UDP has no listen state) aborts if
either the allocated port or the historical default 7411 is already bound,
the same way the TCP check catches a leftover HTTP server.

Cleanup kills only what this run started: tracked PIDs first, then anything
still listening on this run's own ports (`lsof` by port, not `pkill -f`
by command line — a command-line pattern can't distinguish "my server" from
"a sibling worktree's server", since concurrent runs' command lines are
identical).

## Baseline numbers

Live only in `scripts/baseline.json` — never edit a number inside a sentence
in `BASELINE.md` or elsewhere. Raising the baseline is a deliberate, reviewed
diff to that one file. Current values (from Phase 0): 25/26 unit suites,
238/244 unit tests, 53/73 Cypress tests.

`gate_count` in `verify.sh`: `got < want` → FAIL, `got == want` → PASS,
`got > want` → PASS with a note to consider raising the baseline. Nothing
auto-raises it.

### `cypress_failed` — the failure allowlist

`verify.sh` used to gate only `cypress_passed`, a passing *count*. That let a
change land brand-new failing tests and still print `RESULT: PASS`, as long
as it also landed enough new passing tests to raise the ratio — nine new
tests, two of which passed, raised `cypress_passed` from 54 to 58 while two
tests were genuinely red. `cypress_failed` in `baseline.json` closes that
hole: it's an allowlist, not a ratio. `verify.sh` fails the run if the actual
failing count (`CY_FAIL`) exceeds it — the inverse of `gate_count`'s normal
"more is better" logic, since for failures fewer is always better. A newly
introduced failure trips the gate immediately; a previously-red test that
gets fixed does not (it's still `<=` the allowlist, same as `gate_count`
treating `got > want` as a pass).

Every test counted in `cypress_failed` must be named here, so the number is
never a place to quietly hide new red tests:

- **`tally-settings.spec.ts`** (1 test) — racy `cy.task('tallyLastCommand',
  ...)` read with no retry, racing the browser → socket.io → hub → UDP round
  trip. A single flaky read, not a real defect; see the FLAKINESS NOTE at the
  top of `tally-remove.spec.ts` for the full explanation of why this file
  alone uses a bare task read instead of `cy.getTestId(...).should(...)`.

Tests with a *known, reproducible* failure cause are `.skip`'d in their spec
file with a comment naming the cause instead of being added here — Cypress
counts a skipped test as pending, not failing, so it doesn't need an
allowlist entry. As of this writing that's
`dialog-cancel.spec.ts`'s `TallySettings` test (MUI's popover doesn't survive
a second open cycle) and `hub-disconnected-banner.spec.ts`'s second test
(CDP's `goOffline` doesn't reliably re-interrupt an established WebSocket).

## Surviving the Phase 1 restructure

Everything that changes under Vite/Vitest lives in one `if [ -f
"$HUB/vite.config.ts" ]` block near the top of `verify.sh` — detected
automatically by the presence of a Vite config, not hardcoded. After Phase 1
lands, confirm (don't rewrite the rest of the script):

- `UNIT_TEST_CMD` — currently a placeholder guess (`npx vitest run`); update
  to whatever `npm run test` becomes.
- `BUNDLE_DIR` — set to `hub/dist/client`, confirm that's the real Vite
  output path.
- `CYPRESS_SPEC_DIR` — set to `cypress/e2e`, confirm the migration used that
  name (not `cypress/e2e/**` or something else).
- The `NODE_OPTIONS=--openssl-legacy-provider` export is skipped in the Vite
  branch — only needed while react-scripts/webpack 4 is present.

Everything below that block (readiness polling, backend-crash-and-restart
loop, gate table, cleanup trap) is generic and shouldn't need to change.

## Environment knowledge encoded here (paid for once, don't rediscover)

- Installs need `--legacy-peer-deps` (`react-full-screen` has a peer
  conflict). `npm ci` does not work on this lockfile/platform yet — use
  `npm install --legacy-peer-deps`.
- `NODE_OPTIONS=--openssl-legacy-provider` is required for `test:ci`,
  `build:frontend`, and `start:frontend` while react-scripts 4 / webpack 4
  are in use — modern OpenSSL rejects webpack's md4 hashing otherwise.
- Cypress needs **both** servers up: `npm run cypress:backend` (express,
  `--with-test` flag, proxies to the frontend) and `npm run start:frontend`
  (dev server) — each on its own port allocated per run, see above.
  "Ready" means HTTP 200 from the app's entry point **and** `<div id="root"`
  present in the body — an open TCP socket
  or a bare 200 from the proxy before the frontend bundle is served is not
  ready and will cause spurious failures.
- `manual_atem.spec.ts` and `manual_flasher.spec.ts` must never run in this
  harness (excluded via `grep -v '^manual_'`). `manual_atem` needs real ATEM
  hardware; `manual_flasher` calls `cy.pause()` and hangs forever headless
  rather than failing — including it would make the harness itself hang, not
  report a false failure.
- `smoke.spec.ts` deep-links to `/flasher`, which triggers a known bug
  (`NodeMcuConnector.getDevice()`, `hub/src/flasher/NodeMcuConnector.ts:173-175`)
  that crashes the entire backend process. The script detects the dead PID
  after each spec, restarts the backend, waits for readiness again, and
  continues with the remaining specs — printing a `WARNING` line, not a
  failure. That crash-and-restart is how the baseline's 53/73 figure was
  produced in the first place; if the harness can't reproduce it, the
  harness is lying about the baseline. See `BASELINE.md` section 2 for the
  full root-cause writeup.

## `flake2.sh` / `seqrun.sh` — narrowing down a Cypress failure

Two smaller harnesses, same port-allocation trick as `verify.sh` (OS-assigned
ports, so they're safe to run alongside anything else including `verify.sh`
itself). Reach for these instead of re-running the whole suite when a single
spec looks suspicious:

```
scripts/flake2.sh <repo-root> <spec-relative-path> <runs>
scripts/seqrun.sh <repo-root> <spec1> [spec2] [spec3] ...
```

- **`flake2.sh`** runs ONE spec N times, each against a *fresh* backend and
  frontend pair. Use it to ask "is this test flaky on its own?" — every run
  starts from a clean server, so a flip-flopping result points at the spec
  itself (a race, a missing retry), not at state carried over from another
  test.
- **`seqrun.sh`** runs a LIST of specs, in the order given, against ONE
  shared backend and frontend — mirroring exactly how `verify.sh` runs the
  full suite (one long-lived server pair, one `cypress run --spec` call per
  file). Use it to ask "does an earlier spec leave something behind that
  breaks a later one?" — pass the suspect spec plus whatever ran immediately
  before it in a real `verify.sh` run, in the same order.

Both print passing/failing per run and restart the backend automatically if
it dies mid-sequence, matching `verify.sh`'s own crash-and-restart behaviour.

These are exactly the tools that turned two ghost-hunt reports into
reproducible findings: a `.then()`-chained `cy.task('tallyCleanup')` that
skips on a thrown assertion (state leaking into the *next* spec — found with
`seqrun.sh`) and a genuinely racy `cy.task` read with no retry (found with
`flake2.sh`).

## Verification protocol

The implementer does not sign off on its own work. When a phase reports
done, the verifier runs `scripts/verify.sh` against that phase's branch —
not the implementer. A phase passes its gate when this script exits 0.
