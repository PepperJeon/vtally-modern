# Phase 0 Baseline — vTally 0.5.2

Date: 2026-07-26
Platform: macOS 26.4.1 (Darwin 25.4.0), darwin-arm64 (Apple Silicon)
Node: v25.9.0
npm: 11.13.0
Commit measured: `36b9eda` (restored v0.5.2 source) + the working-tree changes described below, committed together as this baseline commit.

This is the reference every later modernization phase is measured against. **The gate is "≥ baseline", never "all green"** — this tree was never fully green even in 2022 conditions once run on 2026 tooling, and two Cypress specs require physical hardware that doesn't exist in CI.

---

## Deviations from pristine v0.5.2

The original fork (`PepperJeon/wifi-tally@release-0.5.2`, 2022-02-03) cannot be installed or run unmodified on this machine. Six changes were required just to get *any* signal. **Dependency versions are 2026-resolved within 2022 semver ranges (`^x.y.z`), so this is NOT a historically pure 2022 baseline** — transitive deps have moved forward up to 4 years within their allowed ranges.

1. **`package.json` `cpu` array**: added `"arm64"`. The 2022 file only listed `x64`/`arm`, predating Apple Silicon Node builds; `npm ci`/`npm install` refuse to run at all on `EBADPLATFORM` without it. (The lost v1.0.0 package.json made the identical fix independently, confirming this is a legitimate structural fix, not scope creep.)
2. **`npm ci` was impossible — RESOLVED in Phase 2d**: the npm6-era lockfile pinned `nodemcu-tool` to a git dependency (`github:wifi-tally/NodeMCU-Tool`) whose resolved commit no longer satisfied the semver range under npm 11 (`EUSAGE / Invalid: lock file's nodemcu-tool@ does not satisfy nodemcu-tool@3.2.1`). Fixed by re-pinning `hub/package.json` to a commit SHA on a maintained fork with a serialport 8→13 migration patch: `github:PepperJeon/NodeMCU-Tool#9b5f8d027042155d35ffbcfb33af7fb941c4bdd5` (see `docs/design/native-deps.md` for the patch and verification). `npm ci` now exits 0 against the regenerated lockfile — confirmed twice on a fresh `node_modules`. **`npm ci --legacy-peer-deps` is still required**, but that's the unrelated, already-documented Deviation #6 `react-full-screen`/`react` peer conflict, not a nodemcu-tool issue — a plain `npm ci` with no flag now fails *only* on that peer conflict, with zero nodemcu-tool-related errors.
3. **`npm install` (with install scripts) fails and rolls back**: `@serialport/bindings` (pulled in transitively via `nodemcu-tool`) is a 2021 NAN native addon that cannot compile against Node 25 headers on darwin-arm64 (node-gyp C++ compile error). npm rolls back the entire install when any package's install script fails, so this blocks all dependencies, not just serialport.
   - **Resolution used**: `npm install --ignore-scripts` (2341 packages installed successfully, generating the regenerated `package-lock.json` in this commit), followed by a separate `npx cypress install` (the Cypress binary download is itself a postinstall script, so it has to run manually once dependencies are otherwise in place).
4. **`src/flasher/NodeMcuConnector.ts`**: the top-level `import nodemcuLib from 'nodemcu-tool'` was changed to a lazy `loadNodemcuLib()` that `require`s the module in a try/catch, falling back to a Proxy stub (`onError` is a no-op, `isConnected` synchronously returns `false`, everything else rejects) if the native binding is missing. Without this, `new NodeMcuConnector()` (constructed unconditionally at `src/server.ts:60`) throws `Could not locate the bindings file` and the hub process cannot start at all — not even to serve `/config` for mixers that have nothing to do with flashing. Marked with a `ponytail:` comment in the source.
5. **`midi` native module was broken, then patched (see Deviation #6)** — same root cause class as #3/#4 (a 2021-era native addon, this time for `RolandV8HDConnector.ts`). Unlike #3/#4, this *is* an application source change (one import line), made under an explicit team-lead ruling because Cypress needed a real measurement. See Deviation #6 for the full reasoning and diff.
6. **`src/mixer/rolandV8HD/RolandV8HDConnector.ts`: `midi` → `@julusian/midi`.** The `midi` package (see #5 and the root-cause analysis previously in this section) has no working build on Node 25/darwin-arm64 and blocked both 5 unit-test suites and the entire Cypress baseline (the backend imports `RolandV8HDConnector.ts` unconditionally at startup). This swap was **not** part of the original Phase 0 minimal-measurement mandate — it was pulled forward from the already-planned Phase 2d dependency swap by explicit team-lead override, on the reasoning that Cypress is the sole acceptance mechanism for the Phase 3 frontend redesign, so an unmeasurable Cypress baseline breaks every later phase's ability to know "≥ baseline." This is judged not to be scope creep because the target package and the intent to swap it were already recorded in the modernization plan; Phase 0 is only doing it earlier than planned, not doing something unplanned.
   - **What changed**: `npm uninstall midi && npm install @julusian/midi --legacy-peer-deps --save` (the `--legacy-peer-deps` flag was needed for an unrelated pre-existing peer conflict — `react-full-screen@0.3.2-0` requires `react@^16.8.0` against the tree's `react@17`; this conflict predates the midi swap and simply hadn't surfaced yet because the earlier `--ignore-scripts` install never re-resolved peers). Verified `node -e "require('@julusian/midi')"` succeeds with no native compile step (ships prebuilds).
   - **Import change** (the only line touched in `RolandV8HDConnector.ts`): `import midi from 'midi'` → `import * as midi from '@julusian/midi'`. `@julusian/midi`'s `package.json` has no default export, only named exports (`Input`, `Output`, `Constants`), so a namespace import (`import * as midi`) was used instead of the plan's assumed default import — this keeps every other line in the file (`this.midi = midi`, `new this.midi.Input()`, etc.) unchanged, which is the smallest possible diff.
   - **API compatibility verified against the package's actual `.d.ts` files** (not the plan's claim): `node_modules/@julusian/midi/dist/input.d.ts` and `dist/output.d.ts` confirm `Input`/`Output` classes with `getPortCount()`, `getPortName()`, `isPortOpen()`, `ignoreTypes()`, `openPort()`, `closePort()`, `on('message', (deltaTime, message) => …)`, and (on `Output`) `send()`/`sendMessage()` — every method/event the connector actually uses. The only structural difference found was the missing default export, handled by the import-style change above. `npx tsc -p tsconfig.server.json --noEmit` is clean.

None of these changes touch application business logic, mixer protocol behavior, or test expectations. #1–#4 are exclusively "make 2022 tooling boot on a 2026 machine" fixes; #6 is a single, typed-checked, plan-anticipated dependency swap made to unblock measurement, not a behavior change.

---

## 1. Unit tests (`react-scripts test`, via `npm run test:ci`)

Command actually used (react-scripts 4 → webpack 4 → md4 hashing breaks on OpenSSL 3, confirmed via `ERR_OSSL_EVP_UNSUPPORTED` without the flag):

```bash
CI=true NODE_OPTIONS=--openssl-legacy-provider npm run test:ci -- --verbose
```

**Result (post Deviation #6 midi swap): 25 passed / 1 failed, 26 total suites. 238 passed / 5 failed / 1 skipped, 244 total tests. Total time: 5.655s.**

This ran cleanly to completion — no infrastructure blocker here. The 5 suites that previously failed only via the `midi` native-bindings crash now pass, exactly as expected from the Deviation #6 swap. `VmixConnector.spec.js` remains the sole failure, left as-is per explicit instruction — it is a one-line spec defect (not an environment property), deferred rather than fixed; see row #22.

| # | Spec file | Result | Notes |
|---|---|---|---|
| 1 | `src/components/ChannelSelector.spec.tsx` | PASS | |
| 2 | `src/components/uniqueId.spec.ts` | PASS | |
| 3 | `src/domain/IpAddress.spec.ts` | PASS | |
| 4 | `src/domain/IpPort.spec.ts` | PASS | |
| 5 | `src/domain/Tally.spec.ts` | PASS | |
| 6 | `src/flasher/TallyDevice.spec.ts` | PASS | |
| 7 | `src/flasher/TallySettingsIni.spec.ts` | PASS | |
| 8 | `src/lib/AppConfiguration.spec.ts` | **PASS** (was FAIL) | Unblocked by Deviation #6 — the `midi` bindings crash in its import chain (`MixerDriver.ts` → `RolandV8HDConnector.ts` → `midi`) is gone. |
| 9 | `src/lib/AppConfigurationPersistence.spec.ts` | **PASS** (was FAIL) | Same import chain, unblocked. |
| 10 | `src/lib/MixerCommunicator.spec.ts` | **PASS** (was FAIL) | Same import chain, unblocked. |
| 11 | `src/lib/MixerDriver.spec.ts` | **PASS** (was FAIL) | Direct import of `RolandV8HDConnector.ts`, unblocked. |
| 12 | `src/mixer/atem/AtemConfiguration.spec.ts` | PASS | |
| 13 | `src/mixer/mock/MockConfiguration.spec.ts` | PASS | |
| 14 | `src/mixer/null/NullConfiguration.spec.ts` | PASS | |
| 15 | `src/mixer/obs/ObsConfiguration.spec.ts` | PASS | |
| 16 | `src/mixer/obs/ObsConnector.spec.ts` | PASS | (slowest suite) |
| 17 | `src/mixer/rolandV60HD/RolandV60HDConfiguration.spec.ts` | PASS | |
| 18 | `src/mixer/rolandV60HD/RolandV60HDConnector.spec.js` | PASS | |
| 19 | `src/mixer/rolandV8HD/RolandV8HDConfiguration.spec.ts` | PASS | Pure config object; passed before and after (never imported `midi`). |
| 20 | `src/mixer/test/TestConfiguration.spec.ts` | PASS | |
| 21 | `src/mixer/vmix/VmixConfiguration.spec.ts` | PASS | |
| 22 | `src/mixer/vmix/VmixConnector.spec.js` | **FAIL** (unchanged, left as-is) | Not a bindings issue and not an environment property — it's a one-line defect in the spec itself. `VmixConnector.spec.js:81` binds its mock server with `host: 'localhost'`, while the sibling `RolandV60HDConnector.spec.js:79` binds with `host: '127.0.0.1'`. Both then feed `server.address().address` into `VmixConfiguration.setIp`, which only accepts IPv4. On this machine `localhost` resolves to `::1` first, so Vmix's spec fails where Roland's (which hardcodes the IPv4 literal) doesn't — same `IpAddress` validator, different bind target. One-line fix (`'localhost'` → `'127.0.0.1'` in the spec), deliberately deferred rather than fixed per explicit team-lead instruction: it belongs in the baseline as red, not worked around here. |
| 23 | `src/tally/CommandCreator.spec.ts` | PASS | |
| 24 | `src/tally/CommandParser.spec.ts` | PASS | |
| 25 | `src/tally/TallyConfiguration.spec.ts` | PASS | |
| 26 | `src/tally/TallyContainer.spec.ts` | **PASS** (was FAIL) | Import chain `MixerCommunicator` → `MixerDriver` → `RolandV8HDConnector` → `midi`, unblocked. |

**Root cause of the 5 previously-failing suites (#8–11, #26)**: the `midi` npm package (native NAN/RtMidi addon, last built for Node 12–14 in 2021) had no prebuilt binary for Node 25/darwin-arm64 and could not even be rebuilt on this machine — `npm rebuild midi` failed with C++ compile errors in RtMidi against the current macOS 26 CoreAudio SDK headers. This is fixed by Deviation #6 (`midi` → `@julusian/midi`, which ships prebuilds). `#22`'s failure is unrelated and intentionally untouched — see row #22 for the actual cause (a one-line spec defect, not an environment property).

### What the baseline actually guarantees

A green suite count is not the same as a regression net. `docs/design/test-audit.md` graded every passing unit suite for assertion quality: **12 solid / 7 partial / 1 empty** out of the 20 passing pre-midi-swap, rising to **16 solid / 9 partial / 1 empty** out of 25 now that midi is unblocked. Specifics that matter for later phases:

- **`NullConfiguration.spec.ts` (#14) is empty**: both of its tests contain zero assertions (the source comment itself admits this). 2 of the 238 "passing" tests assert nothing at all — they cannot fail.
- **All 5 mixer-config suites (#12–13, #17, #19, #21) are partial**: they check defaults only via `expect(...).toBeTruthy()`. Consequence: **nothing in this repo would notice a mixer's default value changing** — e.g. OBS's default port silently changing from 4444 to 4455, or any mixer's default IP changing, would still pass. This is a real gap in the regression net, not a hypothetical one.
- **`ObsConnector.spec.ts` (#16) has 19 `waitUntil` call sites that degrade to a fixed ~100ms sleep**, because their predicate compares against a fresh array literal each poll (so it never matches early, never short-circuits). The `toEqual` assertions that follow are still real and still catch regressions — the damage is test slowness and blindness to latency regressions specifically, not silent-green on correctness. (This is the precise finding; an earlier stronger claim by the audit's author — that the assertions themselves were dead — was self-corrected.)

**For unit-testing purposes, there is currently no regression net at all for module 1a (mixer identification via the `midi`-driven Roland connector's runtime behavior beyond default config), 2a (mixer default-value correctness), and 2b (`ObsConnector` timing behavior)** — a later phase touching those areas is not protected by "the suite passed," because the suite's assertions in those areas don't check the thing that would need to regress. Treat "≥ baseline" for those modules as "zero tests exist for this today," not "N tests exist and passed."

---

## 2. Cypress E2E

The Deviation #6 midi swap unblocked the backend (it no longer crashes on startup), so real per-spec results now exist for all 13 non-manual specs, split across two runs of the same freshly-started server pair.

**Servers used**: `NODE_OPTIONS=--openssl-legacy-provider npm run cypress:backend` (express on :3000, proxies to the CRA dev server) + `NODE_OPTIONS=--openssl-legacy-provider npm run start:frontend` (CRA on :3001). Readiness was confirmed by polling `http://localhost:3000` until it returned HTTP 200 with `<div id="root"` present in the body (i.e. the CRA bundle actually served, not just a TCP accept), before invoking `cypress run`.

### Known bug: `/flasher` crashes the entire backend process

**Discovered while bringing Cypress up (not part of the original Phase 0 mandate — flagging as a new finding, and treated as a real product bug, not test noise: an operator clicking the flasher tab killing the hub mid-show is a class of failure this product cannot have).**

`smoke.spec.ts` deep-links to `/flasher`, which the frontend auto-queries over socket.io on mount. That triggers `NodeMcuConnector.getDevice()` at `src/flasher/NodeMcuConnector.ts:173`, whose `await NodeMcuConnector.getLocalFiles()` on line 175 sits **outside** the method's own `try` block (which only starts at line 181). `getLocalFiles()` (defined at `src/flasher/NodeMcuConnector.ts:95-113`) tries `esp8266/` (release path, line 96) then falls back to `../../../tally/out` (dev path, line 98); both are missing in this checkout because it is `hub/`-only, with no sibling `tally/` project. The rejection is therefore unhandled at the `getDevice()` call site and crashes the entire backend ts-node process:
```
Error: ENOENT: no such file or directory, scandir '.../hub/src/flasher/../../../tally/out'
```
This is a genuine, **deterministic** (not flaky) pre-existing bug — an unhandled-rejection code path, structurally different from `VmixConnector`'s `::1` case (which is a one-line spec defect, not an unhandled rejection in application code). It accounts for both of the 2 currently-failing Cypress tests (both inside `smoke.spec.ts`). Per the narrowly-scoped authorization for this baseline (only the midi import was authorized to change), it was **not fixed**. Instead, the run was split: `smoke.spec.ts` was run once (its real result, including the crash-induced failures, is recorded below), then the backend/frontend were restarted cleanly and the remaining 4 specs that hadn't gotten a real measurement (`tally-logs`, `tally-settings`, `tally`, `webtally` — the specs after `smoke.spec.ts` alphabetically that had cascaded to `ECONNREFUSED` in the first run once the backend died) were re-run against the fresh servers. No application code was touched to achieve this beyond the already-authorized Deviation #6 import change.

| # | Spec file | Result | Tests / Passing / Failing / Pending | Notes |
|---|---|---|---|---|
| 1 | `configAtem.spec.ts` | PASS | all passing | |
| 2 | `configNull.spec.ts` | PASS | all passing | |
| 3 | `configObs.spec.ts` | PASS | all passing | |
| 4 | `configRolandV60HD.spec.ts` | PASS | all passing | |
| 5 | `configRolandV8HD.spec.ts` | PASS | all passing | |
| 6 | `configTally.spec.ts` | PASS | 3 pending | Pre-existing `.skip`'d tests, not crash-related |
| 7 | `configVmix.spec.ts` | PASS | all passing | |
| 8 | `flasher.spec.ts` | PASS | 1 pending | Pre-existing literal `- TODO` stub test |
| 9 | `manual_atem.spec.ts` | NOT RUN (hardware required) | — | Requires a physical ATEM at 192.168.178.200; excluded from CI upstream too |
| 10 | `manual_flasher.spec.ts` | NOT RUN (hardware required / hangs headless) | — | Calls `cy.pause()`, hangs indefinitely headless; excluded from CI upstream too |
| 11 | `smoke.spec.ts` | **PARTIAL FAIL** | 6 tests: 2 passing / 2 failing / 2 pending | The 2 failures are `ECONNREFUSED` caused by the backend crash documented above, triggered by this spec's own `/flasher` deep-link test. Root cause is the `NodeMcuConnector` bug, not the midi swap. |
| 12 | `tally-logs.spec.ts` | PASS | 2/2 passing | Re-run against restarted servers |
| 13 | `tally-settings.spec.ts` | PASS | 14 tests: 13 passing / 1 pending | Re-run against restarted servers |
| 14 | `tally.spec.ts` | PASS | 11 tests: 6 passing / 5 pending | Re-run against restarted servers |
| 15 | `webtally.spec.ts` | PASS | 21 tests: 15 passing / 6 pending | Re-run against restarted servers |

**Aggregate across the 13 non-manual specs**: 73 tests total, 53 passing, 2 failing (both attributable to the `NodeMcuConnector` crash bug in `smoke.spec.ts`), 18 pending (pre-existing `.skip`/TODO markers, not related to any deviation), 0 skipped.

---

## How to reproduce this baseline

```bash
cd ~/Documents/GitHub/vtally-modern/hub
npm install --ignore-scripts
npm uninstall midi && npm install @julusian/midi --legacy-peer-deps --save   # Deviation #6
npx cypress install

# Unit tests
CI=true NODE_OPTIONS=--openssl-legacy-provider npm run test:ci -- --verbose

# Cypress — needs BOTH the backend and the CRA dev server; express on :3000 proxies to CRA on :3001
NODE_OPTIONS=--openssl-legacy-provider npm run cypress:backend &
NODE_OPTIONS=--openssl-legacy-provider npm run start:frontend &
# wait until http://localhost:3000 actually serves the app (HTTP 200 + `<div id="root"` present),
# not just accepts a TCP connection, before starting Cypress
npx cypress run --spec "cypress/integration/!(manual_)*.spec.ts"
# note: /flasher deep-links (smoke.spec.ts) crash the backend via a pre-existing NodeMcuConnector
# bug in this hub/-only checkout (see section 2) — restart both servers after that spec if
# re-running the remaining specs
```

---

## What "≥ baseline" means for later phases

A later phase's gate is satisfied only if, on the **same measurement method** (or a documented superset of it):

- **Unit tests**: at least the same 25 suites / 238 tests pass, AND no suite that passes today regresses to failing. `VmixConnector.spec.js`'s `::1` failure is environment-coupled and out of scope unless a phase happens to touch `IpAddress`/`VmixConfiguration`.
- **Cypress**: at least 53 of the 73 tests across the 13 non-manual specs must keep passing, with no currently-passing spec regressing. The 2 currently-failing tests (`smoke.spec.ts`) are caused by the deterministic `NodeMcuConnector.getDevice()`/`getLocalFiles()` unhandled-rejection crash at `src/flasher/NodeMcuConnector.ts:173-175` (documented in section 2) — a real product bug (an operator opening `/flasher` would kill the hub live), not environment noise. Fixing it is a bonus, not a Phase 0 requirement, but any phase that touches `NodeMcuConnector.ts` should fix it rather than leave it, and none should make it worse. The 18 pending tests are pre-existing `.skip`/TODO markers unrelated to any deviation and are not part of the pass/fail gate. `manual_atem` and `manual_flasher` remain permanently excluded (hardware-gated), matching upstream CI.
- No phase gate may claim unit or Cypress numbers that were not actually observed on this machine (or CI) after Phase 0. If a later phase's numbers regress or something becomes unmeasurable again, that phase's report must say so explicitly, the same way this one does — silence or an assumed "still green" is not acceptable per the project's stated rules.
