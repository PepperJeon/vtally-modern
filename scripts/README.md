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
→ distribution (pack the npm tarball, install it outside the repo, run the
installed binary, require it to actually serve the app — exit 0) → Cypress
(13 non-manual specs, passed count vs baseline).

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

## Distribution gate

`production build` above only proves `vite build` succeeds in place — it
never assembles, packs, or installs `scripts/build.sh`'s npm tarball, which
is the actual shipping route for headless and Raspberry Pi users. That gap
is exactly how `build.sh` sat broken for weeks after the Vite migration:
every other gate was green because none of them touch the distribution
path. The `distribution` gate closes it by reproducing the manual check:

1. run `scripts/build.sh` for real (backend `tsc`, `vite build`, the
   jq-stripped `package.json`, `npm install --package-lock-only`)
2. `npm pack` the result
3. install that tarball into a fresh `mktemp -d` directory *outside the
   repo* (`npm install <tarball>`), proving it installs standalone rather
   than relying on anything already present in this checkout
4. start the installed `vtally` binary on its own OS-assigned port
   (`free_port`, same race-proof allocation as backend/frontend/tally)
5. reuse `wait_ready` — the same HTTP-200-plus-`id="root"` readiness signal
   Cypress waits on below — against the installed binary
6. fetch one real `<script src>`/`<link href>` asset out of the served HTML
   and require 200 on it too, so a shell that references a bundle the
   install never wrote fails the gate instead of passing on a static `/`

Cleanup mirrors the rest of the harness: the server's PID is tracked in the
same `PIDS` array the trap already kills, its port is added to the same
port-based kill backstop, and the temp install directory is removed in
`cleanup()` itself — so a `Ctrl-C` mid-gate tears down exactly as cleanly as
a normal pass or fail. This gate is exit-code only (like `tsc`/`production
build`/`bundle leak check`) — it has no `baseline.json` entry because
there's no count to compare, only pass or fail.

Adds a full backend+frontend build plus an `npm install` to every run.
Default is to run it — the failure this closes is precisely "nobody
remembers to run the optional check" — but it can be skipped with
`SKIP_DIST_GATE=1 scripts/verify.sh` when iterating on something unrelated.

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

- **`tally-settings.spec.ts`** (1 test, `'correctly implements settings into
  udp commands'`) — was two distinct flakes stacked in the same test; one is
  now fixed, one remains:
  - **Fixed** (`b4bbadc`): the test mixer's config compare used raw
    `toJson()`, which includes live `programs`/`previews` — every
    `mixerProgPrev` cypress task call looked like a settings change and
    restarted the connector, producing a transient `(null, null)` read on
    `tallyLastCommand`. `Configuration.getRestartFingerprint()` (defaults to
    `toJson()`, overridden to `{}` on `TestConfiguration`) is what
    `MixerDriver` now compares, so live program/preview values no longer
    trigger a restart. Confirmed gone across 15 `flake2.sh` runs (0
    occurrences), down from 5/15 before the fix.
  - **Remaining** (not fixed, root cause not identified): the test's second
    `cy.task('tallyLastCommand', ...).should('eq', ...)` assertion — the one
    following a *second* `mixerProgPrev` call — sometimes stalls permanently
    on the *first* `mixerProgPrev`'s value and never resolves within
    Cypress's retry window. 3/15 `flake2.sh` runs after the fix above (was
    masked by the restart bug before). Ruled out: the `config.changed.test`
    subscription `TestConnector` holds (same emitter instance confirmed at
    `server.ts:63-79`, live throughout, never torn down in this sequence
    since the tally-settings-submit that precedes it doesn't touch the test
    mixer's `{}` fingerprint so no restart fires); and any server-side delay
    (`config.change.test` → UDP wire is fully synchronous via
    `TallyContainer`'s `program.changed` listener, not gated on the 100ms
    keep-alive, which would self-heal a drop anyway). Remaining candidate:
    `cypress/plugins/mixer.ts:13`'s `socket.emit('config.change.test', ...)`
    returns `null` with no ack, so a lost or delayed *delivery* of that
    second emit fits the symptom — needs live socket-level instrumentation
    to confirm, not yet done. Tracked for Phase 3.
- **`dialog-cancel.spec.ts`** (1 test) — `'closes without saving edits when
  Cancel is clicked'` fails reproducibly on a second open cycle: MUI's
  popover doesn't survive the settings dialog being reopened after Cancel.
  Root cause not yet identified; tracked for Phase 3.

These two used to be `.skip`'d instead of allowlisted. A permanent skip
vanishes from the run output entirely — nobody sees it's still broken — while
a permanently red, undocumented test just trains people to ignore red. Named
allowlist entries avoid both: the count is visible, the cause is on record,
and `verify.sh` still trips if a *new* failure shows up alongside them.

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

- Installs need `--legacy-peer-deps`. The cause is no longer
  `react-full-screen` — that package is gone as of the React 19 upgrade — but
  the flag is still required: `@types/node@12` does not satisfy vite's
  `peerOptional @types/node ^18.0.0 || >=20.0.0`. Use
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
