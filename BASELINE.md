# Phase 0 Baseline — vTally 0.5.2

Date: 2026-07-26
Platform: macOS 26.4.1 (Darwin 25.4.0), darwin-arm64 (Apple Silicon)
Node: v25.9.0
npm: 11.13.0
Commit measured: `36b9eda` (restored v0.5.2 source) + the working-tree changes described below, committed together as this baseline commit.

This is the reference every later modernization phase is measured against. **The gate is "≥ baseline", never "all green"** — this tree was never fully green even in 2022 conditions once run on 2026 tooling, and two Cypress specs require physical hardware that doesn't exist in CI.

---

## Deviations from pristine v0.5.2

The original fork (`PepperJeon/wifi-tally@release-0.5.2`, 2022-02-03) cannot be installed or run unmodified on this machine. Five changes were required just to get *any* signal. **Dependency versions are 2026-resolved within 2022 semver ranges (`^x.y.z`), so this is NOT a historically pure 2022 baseline** — transitive deps have moved forward up to 4 years within their allowed ranges.

1. **`package.json` `cpu` array**: added `"arm64"`. The 2022 file only listed `x64`/`arm`, predating Apple Silicon Node builds; `npm ci`/`npm install` refuse to run at all on `EBADPLATFORM` without it. (The lost v1.0.0 package.json made the identical fix independently, confirming this is a legitimate structural fix, not scope creep.)
2. **`npm ci` is impossible**: the npm6-era lockfile pins `nodemcu-tool` to a git dependency (`github:wifi-tally/NodeMCU-Tool`) whose resolved commit no longer satisfies the semver range under npm 11 (`EUSAGE / Invalid: lock file's nodemcu-tool@ does not satisfy nodemcu-tool@3.2.1`). There is no fix short of re-pinning the dependency, which is out of scope for Phase 0.
3. **`npm install` (with install scripts) fails and rolls back**: `@serialport/bindings` (pulled in transitively via `nodemcu-tool`) is a 2021 NAN native addon that cannot compile against Node 25 headers on darwin-arm64 (node-gyp C++ compile error). npm rolls back the entire install when any package's install script fails, so this blocks all dependencies, not just serialport.
   - **Resolution used**: `npm install --ignore-scripts` (2341 packages installed successfully, generating the regenerated `package-lock.json` in this commit), followed by a separate `npx cypress install` (the Cypress binary download is itself a postinstall script, so it has to run manually once dependencies are otherwise in place).
4. **`src/flasher/NodeMcuConnector.ts`**: the top-level `import nodemcuLib from 'nodemcu-tool'` was changed to a lazy `loadNodemcuLib()` that `require`s the module in a try/catch, falling back to a Proxy stub (`onError` is a no-op, `isConnected` synchronously returns `false`, everything else rejects) if the native binding is missing. Without this, `new NodeMcuConnector()` (constructed unconditionally at `src/server.ts:60`) throws `Could not locate the bindings file` and the hub process cannot start at all — not even to serve `/config` for mixers that have nothing to do with flashing. Marked with a `ponytail:` comment in the source.
5. **`midi` native module is also broken and was left unpatched (see "Cypress" section below)** — same root cause class as #3/#4 (a 2021-era native addon, this time for `RolandV8HDConnector.ts`), but this one was **not** patched, so the backend server still cannot start. This is the reason Cypress could not be run — see below.

None of these changes touch application logic, business behavior, or test expectations. They are exclusively "make 2022 tooling boot on a 2026 machine" fixes.

---

## 1. Unit tests (`react-scripts test`, via `npm run test:ci`)

Command actually used (react-scripts 4 → webpack 4 → md4 hashing breaks on OpenSSL 3, confirmed via `ERR_OSSL_EVP_UNSUPPORTED` without the flag):

```bash
CI=true NODE_OPTIONS=--openssl-legacy-provider npm run test:ci -- --verbose
```

**Result: 20 passed / 6 failed, 26 total suites. 211 passed / 5 failed, 216 total tests. Total time: 6.245s.**

This ran cleanly to completion — no infrastructure blocker here, unlike Cypress. All 6 suite failures below are genuine (pre-existing or environment-triggered), not measurement gaps.

| # | Spec file | Result | Notes |
|---|---|---|---|
| 1 | `src/components/ChannelSelector.spec.tsx` | PASS | |
| 2 | `src/components/uniqueId.spec.ts` | PASS | |
| 3 | `src/domain/IpAddress.spec.ts` | PASS | |
| 4 | `src/domain/IpPort.spec.ts` | PASS | |
| 5 | `src/domain/Tally.spec.ts` | PASS | |
| 6 | `src/flasher/TallyDevice.spec.ts` | PASS | |
| 7 | `src/flasher/TallySettingsIni.spec.ts` | PASS | |
| 8 | `src/lib/AppConfiguration.spec.ts` | **FAIL** | Suite failed to run: `Could not locate the bindings file` for `midi` (imports `MixerDriver.ts` → `RolandV8HDConnector.ts` → `midi`). Same root cause as deviation #5. |
| 9 | `src/lib/AppConfigurationPersistence.spec.ts` | **FAIL** | Same `midi` bindings failure, same import chain. |
| 10 | `src/lib/MixerCommunicator.spec.ts` | **FAIL** | Same `midi` bindings failure, same import chain. |
| 11 | `src/lib/MixerDriver.spec.ts` | **FAIL** | Same `midi` bindings failure, direct import. |
| 12 | `src/mixer/atem/AtemConfiguration.spec.ts` | PASS | |
| 13 | `src/mixer/mock/MockConfiguration.spec.ts` | PASS | |
| 14 | `src/mixer/null/NullConfiguration.spec.ts` | PASS | |
| 15 | `src/mixer/obs/ObsConfiguration.spec.ts` | PASS | |
| 16 | `src/mixer/obs/ObsConnector.spec.ts` | PASS | (5.4s — the slow one) |
| 17 | `src/mixer/rolandV60HD/RolandV60HDConfiguration.spec.ts` | PASS | |
| 18 | `src/mixer/rolandV60HD/RolandV60HDConnector.spec.js` | PASS | |
| 19 | `src/mixer/rolandV8HD/RolandV8HDConfiguration.spec.ts` | PASS | Pure config object, doesn't import `midi` — hence passes despite #22 failing. |
| 20 | `src/mixer/test/TestConfiguration.spec.ts` | PASS | |
| 21 | `src/mixer/vmix/VmixConfiguration.spec.ts` | PASS | |
| 22 | `src/mixer/vmix/VmixConnector.spec.js` | **FAIL** | Not a bindings issue — genuine environment difference. `VmixConfiguration.setIp` is called with the loopback address returned by Node's `net` module in this sandbox, which resolves to `::1` (IPv6) instead of `127.0.0.1` (IPv4); the app's `IpAddress` validator only accepts IPv4 and throws `Invalid IP address: ::1`. Pre-existing test/environment coupling, not something Phase 0 should fix. |
| 23 | `src/tally/CommandCreator.spec.ts` | PASS | |
| 24 | `src/tally/CommandParser.spec.ts` | PASS | |
| 25 | `src/tally/TallyConfiguration.spec.ts` | PASS | |
| 26 | `src/tally/TallyContainer.spec.ts` | **FAIL** | Same `midi` bindings failure (imports `MixerCommunicator` → `MixerDriver` → `RolandV8HDConnector` → `midi`). |

**Root cause of every FAIL except #22**: the `midi` npm package (native NAN/RtMidi addon, last built for Node 12–14 in 2021) has no prebuilt binary for Node 25/darwin-arm64 and cannot even be rebuilt on this machine — `npm rebuild midi` fails with C++ compile errors in RtMidi against the current macOS 26 CoreAudio SDK headers (`AudioGetCurrentHostTime` macro/header conflicts: "expected ';' after top level declarator", "redefinition of 'UInt64' as different kind of symbol"). This is a real, structural incompatibility, not a flaky failure — every suite that transitively imports `RolandV8HDConnector.ts` (and therefore `midi`) fails identically.

---

## 2. Cypress E2E — NOT MEASURABLE on this machine

**Reason**: the backend server (`npm run cypress:backend`, i.e. `ts-node --project tsconfig.server.json src/server.ts --env=development --with-test`) crashes immediately on startup — before binding to port 3000 — with the exact same `midi` native-bindings error documented above (`Could not locate the bindings file`, thrown from `node_modules/bindings/bindings.js:126`, uncaught, process exits). `MixerDriver.ts` (imported unconditionally by `server.ts`) imports `RolandV8HDConnector.ts`, which imports `midi` at module load time, so the backend cannot start regardless of which mixer is selected or which specs would be run.

Investigated and rejected as a Phase-0 fix:
- **Rebuilding `midi` for Node 25/arm64**: fails, see the compiler errors above. Confirmed via `npm rebuild midi`.
- **Applying the same lazy-load/Proxy-stub pattern used for `nodemcu-tool` (deviation #4) to `RolandV8HDConnector.ts`'s `midi` import**: this would very likely work (it's the same class of problem, same fix shape), but it is a source-code behavior change to a mixer driver, and Phase 0's mandate is explicitly *not* to modify application code beyond what's strictly necessary to get a measurement — this is a judgment call about scope that belongs to whoever picks up Phase 1/2, not something to sneak into the baseline. Flagging it here as the obvious next step if Cypress needs to run before Phase 2d (which already plans to touch `midi` → `@julusian/midi`).

**No Cypress spec results were observed or recorded — none should be inferred as passing or failing.** All 15 specs are marked NOT RUN below.

| # | Spec file | Result | Notes |
|---|---|---|---|
| 1 | `configAtem.spec.ts` | NOT RUN | Backend would not start |
| 2 | `configNull.spec.ts` | NOT RUN | Backend would not start |
| 3 | `configObs.spec.ts` | NOT RUN | Backend would not start |
| 4 | `configRolandV60HD.spec.ts` | NOT RUN | Backend would not start |
| 5 | `configRolandV8HD.spec.ts` | NOT RUN | Backend would not start |
| 6 | `configTally.spec.ts` | NOT RUN | Backend would not start |
| 7 | `configVmix.spec.ts` | NOT RUN | Backend would not start |
| 8 | `flasher.spec.ts` | NOT RUN | Backend would not start |
| 9 | `manual_atem.spec.ts` | NOT RUN (hardware required) | Requires a physical ATEM at 192.168.178.200; excluded from CI upstream too (`.github/workflows/cypress.yml` uses `!(manual_)*.spec.ts`) |
| 10 | `manual_flasher.spec.ts` | NOT RUN (hardware required / hangs headless) | Calls `cy.pause()`, hangs indefinitely in headless mode; excluded from CI upstream too |
| 11 | `smoke.spec.ts` | NOT RUN | Backend would not start |
| 12 | `tally-logs.spec.ts` | NOT RUN | Backend would not start |
| 13 | `tally-settings.spec.ts` | NOT RUN | Backend would not start |
| 14 | `tally.spec.ts` | NOT RUN | Backend would not start |
| 15 | `webtally.spec.ts` | NOT RUN | Backend would not start |

13 of these (all but `manual_atem`/`manual_flasher`) are the specs upstream CI actually ran; all 13 are currently un-measurable here for the reason above.

---

## How to reproduce this baseline

```bash
cd ~/Documents/GitHub/vtally-modern/hub
npm install --ignore-scripts
npx cypress install

# Unit tests (works)
CI=true NODE_OPTIONS=--openssl-legacy-provider npm run test:ci -- --verbose

# Cypress (currently blocked — see above)
NODE_OPTIONS=--openssl-legacy-provider npm run cypress:backend &
# ... server will crash on startup with a `midi` bindings error; this is expected on this machine today
npx cypress run --spec "cypress/integration/!(manual_)*.spec.ts"
```

---

## What "≥ baseline" means for later phases

A later phase's gate is satisfied only if, on the **same measurement method** (or a documented superset of it):

- **Unit tests**: at least the same 20 suites / 211 tests pass, AND no suite that passes today regresses to failing. The 5 suites failing today due to the `midi` bindings problem are expected to start passing once Phase 2d replaces `midi` with `@julusian/midi` (or once the backend is otherwise made startable) — that is a net *improvement* over baseline, not a requirement. `VmixConnector.spec.js`'s `::1` failure is environment-coupled and out of scope unless a phase happens to touch `IpAddress`/`VmixConfiguration`.
- **Cypress**: baseline is "not measurable" (0 of 13 non-manual specs observed). The bar for any later phase is therefore simply **getting the backend to start at all** and observing real pass/fail — at that point the standard becomes not regressing whatever passes first, then working towards all 13. `manual_atem` and `manual_flasher` remain permanently excluded (hardware-gated), matching upstream CI.
- No phase gate may claim Cypress numbers that were not actually observed on this machine (or CI) after Phase 0. If Cypress still can't run in a later phase, that phase's report must say so explicitly, the same way this one does — silence or an assumed "still green" is not acceptable per the project's stated rules.
