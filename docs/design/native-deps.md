# Native dependency strategy

Both native modules in vTally broke on a stock 2026 dev machine (node v25.9.0, npm 11.13.0, darwin-arm64) — see `BASELINE.md`. Root cause for both is the same: they're 2021-era NAN addons with no prebuild for current Node/Electron ABIs. This doc verifies the fix for `midi`, makes the call on `nodemcu-tool`/serialport, and lays out Electron packaging + CI so this doesn't happen again.

**Verified on this machine** (installed in a scratch dir outside the repo, not `hub/`):
```
mkdir /tmp/nativetest && cd /tmp/nativetest && npm init -y
npm install @julusian/midi serialport
```
Both installed in ~3s with **zero compilation** — prebuilt binaries downloaded, no `node-gyp rebuild` invoked. That's the signal that matters: these packages ship prebuilds for this ABI.

---

## 1. `@julusian/midi` — confirmed drop-in

`npm view @julusian/midi` → deps are `node-addon-api ^6.1.0` + `pkg-prebuilds ^1.1.0` (prebuild-fetch tooling, N-API 7). This is [Julusian's maintained fork of node-midi](https://github.com/Julusian/node-midi), kept alive specifically because upstream `midi` stalled on NAN. Prebuilds published for N-API version 7, which is forward-compatible with every Node/Electron release that supports N-API 7+ (Node ≥10, all current Electron) — no per-Node-version prebuild matrix needed, unlike `@serialport/bindings-cpp` below.

API surface checked against every call site in `RolandV8HDConnector.ts`:

| Connector uses | `@julusian/midi` has it | 
|---|---|
| `new midi.Input()` / `new midi.Output()` | yes |
| `.getPortCount()` | yes |
| `.getPortName(i)` | yes |
| `.openPort(i)` | yes |
| `.isPortOpen()` | yes |
| `.ignoreTypes(false, true, true)` | yes |
| `.on('message', (deltaTime, message) => ...)` | yes |
| `.sendMessage(sysex_msg)` | yes |
| `.closePort()` | yes |

Confirmed live via `node -e` against the installed package — `Object.getOwnPropertyNames` on `Input.prototype` / `Output.prototype` lists exactly these methods, no renames. **Zero signature differences.** The fix in `RolandV8HDConnector.ts:1` is a one-line import swap: `import midi from 'midi'` → `import midi from '@julusian/midi'`. `package.json` already lists `@julusian/midi ^3.7.2` as a dependency — only the source import needs updating (not done here per instructions: no source edits).

---

## 2. `nodemcu-tool` / serialport — the real decision

### Recommendation: **(a) — patch the fork's serialport transport to serialport 13.** Keep `nodemcu-tool` and all 380 lines of `NodeMcuConnector.ts`.

### Why, with the numbers that make it easy

`nodemcu-tool@3.2.1` (the `wifi-tally` fork) talks to the device through exactly **one file**, `lib/transport/serialport.js` (traced via `nodemcu-connector.js` → `scriptable-serial-terminal.js` → `serialport.js`; a second file, `serial-terminal.js`, also does `require('serialport')` but is dead code — nothing requires it). Everything else in `nodemcu-tool` (Lua upload/download protocol, file listing, checksum verification, hard-reset sequencing) is transport-agnostic and untouched by a serialport version bump.

That one file uses three serialport-8-era APIs that changed shape in serialport 10+:

```js
const _serialport = require('serialport');                 // was default-export constructor
const _delimiterParser = _serialport.parsers.Delimiter;     // was namespaced parser
...
_device = new _serialport(devicename, {...});               // constructor call
...
return _serialport.list();                                   // static list
```

serialport 13's equivalents, confirmed working locally:
```js
const { SerialPort } = require('serialport');
const { DelimiterParser } = require('@serialport/parser-delimiter');
...
_device = new SerialPort(devicename, {...});
...
return SerialPort.list();
```
Verified with `node -e`: `SerialPort` is a constructor, `SerialPort.list` is a static function, `DelimiterParser` is a constructor — all present in `serialport@13.0.0` + `@serialport/parser-delimiter`, installed with prebuilds, no compile step.

So the patch is **~4 line changes in 1 file**, not a rewrite. `@serialport/bindings-cpp@13.0.1` (the actual native module) depends on `node-addon-api 8.3.0` + `node-gyp-build 4.8.4` — N-API, prebuilds ship in the npm tarball itself (no separate download step, no `prebuild-install` network fetch to fail).

### Why not the alternatives

- **(b) drop `nodemcu-tool`, talk to the device directly**: throws away all 380 lines of `NodeMcuConnector.ts`'s working, tested protocol logic (mutex handling, retry-with-backoff on `checkConnection`/`execute`, file upload+verify+rename, hard-reset re-sync) and the Lua-command protocol itself, to reimplement against raw `serialport`. This is the actual NodeMCU firmware-management protocol (Lua REPL over serial), not esptool binary flashing — there's no shortcut library for it. Far more effort and risk than a 4-line patch, for no benefit since (a) is available.
- **(c) drop the flasher from the desktop app**: flashing target tally devices is a core hub feature per the connector's own domain model (`TallyDevice`, `program()`, `writeTallySettingsIni()`), not an edge case — cutting it from the flagship distribution to dodge a 4-line patch is a worse trade than just doing the patch.
- **(d)**: nothing better identified — (a) is strictly cheaper than every alternative and preserves the whole existing surface.

### Bonus: this is also the `npm ci` fix

`BASELINE.md` deviation #2: `npm ci` currently fails outright because `nodemcu-tool` is pinned to `github:wifi-tally/NodeMCU-Tool`, and the lockfile's resolved commit doesn't satisfy npm 11's semver check against the git ref. Re-pinning to a patched fork commit (published as a proper git tag, or better, published to npm under a scoped name like `@vtally/nodemcu-tool`) fixes both problems in the same change: reproducible installs come back, and the native compile failure goes away. Do this as one PR against `wifi-tally/NodeMCU-Tool` (or a vTally-owned fork if upstream is unresponsive) — don't patch `node_modules` in place, that doesn't survive a fresh install.

### Verification commands (for the implementer)

```bash
# 1. confirm serialport 13 installs clean with no compile, in a scratch dir
mkdir /tmp/t && cd /tmp/t && npm init -y && npm install serialport @serialport/parser-delimiter
node -e "const {SerialPort}=require('serialport'); const {DelimiterParser}=require('@serialport/parser-delimiter'); console.log(typeof SerialPort, typeof SerialPort.list, typeof DelimiterParser)"
# expect: function function function

# 2. after patching the fork and re-pinning package.json, from hub/:
npm ci                      # must succeed now that the dep isn't a floating git ref
node -e "require('nodemcu-tool'); console.log('ok')"   # must not throw "Could not locate the bindings file"

# 3. full regression
npx cypress run --spec "cypress/integration/flasher.spec.ts"
```

---

## 3. Why N-API modules don't have this problem (and NAN modules do)

NAN (Native Abstractions for Node.js) addons compile directly against V8's C++ API. V8's ABI changes across Node major versions — sometimes across minors — so a NAN addon compiled for Node 14 has binary-incompatible V8 struct layouts by Node 20+, and its headers may not even compile against a newer V8/Node-API header set (this is exactly the `AudioGetCurrentHostTime`/`UInt64` clash `midi` hit against macOS 26's SDK headers). Every Node upgrade is a potential rebuild-or-break event, and since there's no ABI stability guarantee, nobody bothers shipping prebuilds for more than a couple of Node versions — hence `prebuild-install` finding nothing for Node 25 and falling through to a source rebuild, which then also fails because the addon's C++ predates current toolchain/SDK behavior.

N-API (and `node-addon-api`, the C++ wrapper over the N-API C ABI) is a **stable ABI contract** Node commits to keeping compatible across versions — a module built for N-API version N runs unmodified on any future Node (and Electron, which implements the same N-API surface) that supports version N or higher. That's what makes `pkg-prebuilds`/`node-gyp-build`-style tooling viable: publish one set of prebuilt binaries per platform+arch, and they keep working across Node upgrades without a rebuild. This is also why `@julusian/midi` and `@serialport/bindings-cpp` installed here with zero compilation — they're both N-API.

**Practical rule for future native deps**: check `npm view <pkg> dependencies` for `node-addon-api` or N-API usage before adding anything with native code. NAN-based packages are a standing liability that will break on the next Node major.

---

## 4. Electron packaging plan

No Electron scaffolding exists in the repo yet (`vtally-modern/` has `hub/`, `tally/`, `firmware/` — no `electron/` dir, no `electron-builder` config). This section is a plan for whoever adds it, covering the two natives that will survive (`@julusian/midi`, patched `serialport`-based `nodemcu-tool`).

### Rebuild strategy: prebuilds first, `@electron/rebuild` as fallback

Both surviving natives (`node-addon-api`/N-API based) ship prebuilds keyed by N-API version, not by exact Node ABI — `pkg-prebuilds` (`@julusian/midi`) and `node-gyp-build` (`@serialport/bindings-cpp`) both check for a matching prebuild first and only fall back to compiling if none exists. Electron's N-API implementation matches whatever N-API version its bundled Node/V8 supports, so **the existing prebuilds should just work inside Electron without a rebuild step** — this is the main practical benefit of having moved off NAN.

Still wire up `@electron/rebuild` (via `electron-builder`'s built-in native-rebuild step, or explicitly in `afterPack`) as a safety net: run it once per CI matrix cell (see §5) so a broken prebuild fails the build instead of shipping. Don't hand-roll a `node-gyp rebuild --target=<electron-version>` step — `@electron/rebuild` already knows Electron's ABI/headers and is the standard tool.

### `asarUnpack` — required for both

Electron's asar packing breaks native addons two ways: (1) `dlopen`/`require` cannot load a `.node` file from inside an asar archive, and (2) `node-gyp-build`/`pkg-prebuilds`'s own path-resolution logic (`fs.readdir`-ing a `prebuilds/` directory) doesn't work against asar's virtual FS either. Both must be unpacked:

```json
"build": {
  "asarUnpack": [
    "node_modules/@julusian/midi/**",
    "node_modules/serialport/**",
    "node_modules/@serialport/**",
    "node_modules/nodemcu-tool/**"
  ]
}
```
(`nodemcu-tool` itself has no native code, but it `require()`s `serialport` at runtime from inside its own directory — keep it unpacked alongside its native dependency chain rather than debugging why the JS half can't find the addon.)

### `extraResources` — for the firmware payload, not the natives

`NodeMcuConnector.ts:96` does `__dirname + "/../../esp8266"` to find the `.lc`/`.lua` firmware files to flash, with a dev-mode fallback at `:98` to `../../../tally/out`. Neither path survives packaging as-is:
- `__dirname` inside an asar-packed app resolves to a path *inside* the archive (`app.asar/dist/flasher`), and `fs.readdir` against a path that's never been `asarUnpack`ed will fail — which is fine, because...
- ...the existing `.catch()` fallback at line 97 already retries a second path on failure. **Preserve this fallback branch** — don't "clean it up" — but *also* add packaging config so the primary path resolves correctly, rather than relying on the fallback alone (the fallback's `tally/out` path is explicitly commented as a dev-only location and won't exist in a packaged app either).

Plan: ship the `esp8266` firmware directory via `extraResources` (which places files unpacked, next to the app, addressable via `process.resourcesPath`) and point the connector at it with an environment-aware path — e.g. `process.resourcesPath + "/esp8266"` when `process.resourcesPath` exists (Electron), current relative logic otherwise. This does mean a small source change to `NodeMcuConnector.ts` is needed at packaging time; flagging it here since it's out of this doc's no-source-edit scope, for whoever implements Electron support:

```json
"build": {
  "extraResources": [{ "from": "../tally/out", "to": "esp8266" }]
}
```

### All three targets

- **macOS (arm64 + x64)**: build both architectures explicitly (`electron-builder --mac --arm64 --x64` or `universal`, but universal binaries double the native-addon burden — prefer separate arm64/x64 builds unless there's a hard requirement for a single universal artifact). Code-signing + notarization is a separate concern not covered here.
- **Windows**: no CoreAudio-style header conflicts to worry about, but confirm `@julusian/midi` prebuilds cover `win32-x64` and (if targeted) `win32-arm64` — `npm view @julusian/midi` doesn't break prebuild coverage out by platform in the CLI output; check the GitHub Releases prebuild manifest for the package before committing to arm64 Windows support.
- **Linux**: serialport on Linux needs `udev`-based device permissions (not a packaging concern, but document it — flashing will silently fail with `EACCES` on `/dev/ttyUSB0` without a udev rule granting the user access, same as the existing non-Electron npm/Pi distribution presumably already handles).

---

## 5. CI matrix that would have caught both failures

Neither failure needed hardware to catch — `require('midi')` and `require('nodemcu-tool')` throw on missing bindings the moment they're imported, and `npm rebuild` reproduces the compile failure without a device attached. A matrix that installs and boots the server (not just runs unit tests) on the target platforms would have caught this before it reached a developer's machine:

| OS | Node | Arch | Why |
|---|---|---|---|
| macOS 14+ (or matching CI image) | 20 (current LTS), 22 | arm64 | Apple Silicon is now the default dev machine — this is exactly what broke here. |
| ubuntu-latest | 20, 22 | x64 | Primary server/Pi-adjacent target; also cheapest to run wide. |
| windows-latest | 20, 22 | x64 | Desktop target. |

For each cell:
```bash
npm ci          # or npm install if the git-dep issue in §2 isn't fixed yet
node -e "require('./src/server')"   # or an equivalent smoke boot — must not throw on import
npm run test:ci
```
The critical addition versus current CI (check `.github/workflows/`) is **actually booting the server process**, not just running Jest — that's the only thing that would have caught the `midi` import crashing `server.ts` at module load time, since the affected Jest suites already did fail loudly (BASELINE.md's 5 FAILs) but nothing before this baseline effort apparently treated "5 suites can't even load" as a release blocker.

Add Node 25 (or whatever is newest) as an allowed-to-fail informational row, not a gate — it's useful advance warning for the next Node major without blocking releases on it.

Once Electron packaging exists, add a fourth row per OS that runs `@electron/rebuild` against the pinned Electron version and asserts the two native addons load inside a minimal Electron main-process smoke test.

---

## 6. Should the lazy-load + Proxy stub pattern stay permanently?

### Argument for keeping it
A broadcast tally hub's core job is relaying program/preview state to physical devices over the network — that has nothing to do with USB firmware flashing. If `nodemcu-tool`'s native binding is missing (bad install, unsupported platform, whatever), failing the *entire* process because one peripheral feature can't load is a disproportionate blast radius. The stub pattern (already applied, `NodeMcuConnector.ts:8-22`) correctly scopes the failure to the flasher alone.

### Argument against
A silently-degraded flasher is worse than a loud startup crash **if nobody notices**. The current stub only logs to `console.error` server-side — an operator watching the UI, not the terminal, has no signal that flashing is broken until they try to use it and get a rejected promise with a generic message. Silent degradation is exactly the failure mode that let `nodemcu-tool` stay unpatched (and `midi` stay broken) long enough for it to surface as this whole investigation instead of at install time.

### Recommendation: keep it, but make it loud in the UI

The pattern should stay **only if** paired with an explicit, always-checkable availability signal — it must never be indistinguishable from "flasher present but idle." The connector already has the right shape for this: `flasher.device` is the existing socket event that reports `TallyDevice` state to the frontend (`NodeMcuConnector.getDevice()` populates a `TallyDevice` with `errorMessage` on failure — see `:214-217`). Extend that contract:

- On startup, if `loadNodemcuLib()` fell back to the stub, emit a persistent `flasher.device` (or a new `flasher.unavailable`) payload carrying the reason string already captured in `FLASHER_UNAVAILABLE`/the caught error message — not just a log line.
- The frontend's flasher UI must render this as a distinct state (e.g. "Flashing unavailable — nodemcu-tool failed to load: `<reason>`"), visually different from "no device connected." Right now every stub method rejects with the same generic `FLASHER_UNAVAILABLE` message regardless of *why* loading failed (missing binding vs. wrong platform vs. something else) — worth threading the original caught error's message through instead of the fixed string, so the UI can show the real cause.
- Once §2's patch lands and `nodemcu-tool` has real N-API prebuilds, this code path should almost never trigger in practice — but keep it as defense-in-depth for the platforms/architectures that genuinely aren't covered by prebuilds, rather than deleting it.

This is a source change (not made here per instructions) — flagging the exact spot (`NodeMcuConnector.ts:8-22` plus wherever `flasher.device` is emitted in `server.ts`/the socket layer) for whoever implements it.

---

## nodemcu-tool patch — verification results

**Base commit**: `f4d1503df4825381e9042e155c5e57bd94e6eba8` (`wifi-tally/NodeMCU-Tool`, resolved via `hub/package-lock.json`'s `nodemcu-tool` entry — this is exactly the commit vTally's `npm ci` needs). Cloned and patched in a scratch dir (`/private/tmp/.../scratchpad/nodemcu/NodeMCU-Tool`), not in this repo.

### Diff — 12 lines changed, 1 file of logic + package.json

Confirms the design doc's ~4-line estimate almost exactly (it's 5 changed lines in `serialport.js`, plus the two dependency lines). Full diff saved to `docs/design/nodemcu-tool.patch`. Summary:

- `lib/transport/serialport.js`: `require('serialport')` (default-export constructor) → `const { SerialPort } = require('serialport')`; `_serialport.parsers.Delimiter` → `const { DelimiterParser } = require('@serialport/parser-delimiter')`; constructor call switched from positional `new SerialPort(devicename, {baudRate, autoOpen})` to the object form `new SerialPort({ path: devicename, baudRate, autoOpen })` (serialport 10+ dropped the positional-path constructor); `_serialport.list()` → `SerialPort.list()`. `.open()`/`.close()`/`.write()`/`.set()`/`.flush()`/`.drain()` callback signatures are unchanged — no other edits needed.
- `package.json`: `serialport` bumped `^8.0.5` → `^13.0.0`, added `@serialport/parser-delimiter ^13.0.0`.
- Confirmed `lib/transport/serial-terminal.js` (the other file that touches `serialport` directly) is genuinely dead code for vTally's usage: it's only `require()`d by `lib/cli/nodemcu-tool.js` (the CLI binary entry point), which vTally never invokes — the library entry point (`package.json main`, `lib/nodemcu-connector.js`) only pulls in `scriptable-serial-terminal.js` → `serialport.js`. Left `serial-terminal.js` unpatched and unreferenced from the verified path; it would still need the same fix if the CLI binary is ever used standalone.

### What was run, and what passed

1. **Clean install, no compilation.** `rm -rf node_modules package-lock.json && npm install` — completed in ~8s, only npm's usual deprecation warnings, no `node-gyp`/`gyp rebuild` invoked. `node_modules/@serialport/bindings-cpp/prebuilds/darwin-x64+arm64/@serialport+bindings-cpp.node` present as a shipped prebuild (plus every other platform/arch — the tarball ships all of them, no network prebuild-fetch step). Resolved versions: `serialport@13.0.0`, `@serialport/parser-delimiter@13.0.0`, `@serialport/bindings-cpp@13.0.0`.
2. **Loads without throwing.** `node -e "require('./lib/transport/serialport.js')"` → OK. `node -e "require('./lib/nodemcu-connector.js')"` → OK, and `Object.keys()` on the returned module lists exactly: `onError, disconnect, connect, isConnected, checkConnection, compile, deviceInfo, listDevices, download, upload, execute, format, fsinfo, remove, softreset, hardreset, run`. Every API `NodeMcuConnector.ts` calls (`onError`, `connect`, `checkConnection`, `execute`, `listDevices`, `deviceInfo`, `fsinfo`, `download`, `upload`, `hardreset`, `disconnect`, `isConnected`) is present with the same name and the same call arity as before the patch (verified by reading `lib/connector/*.js` — none of those wrapper signatures changed, only the transport layer underneath them did).
3. **`listDevices()` exercised live, no hardware attached.** `listDevices(true)` (unfiltered) → resolved with 2 real system serial devices (`/dev/tty.debug-console`, `/dev/tty.Bluetooth-Incoming-Port`) — proves `SerialPort.list()` works end-to-end through the patched transport. `listDevices(false)` (vendor-ID filtered, what vTally's flasher UI actually calls) → resolved with an empty array, no throw — correct behavior with no ESP8266 plugged in.
4. **`connect()`/error path exercised against a nonexistent device path.** `connect('/dev/tty.nonexistent-fake-device', 115200, false)` rejected with `Cannot open port "/dev/tty.nonexistent-fake-device"`, and the registered `onError` callback fired with the underlying `ENOENT`-style message first — matches the pre-patch promise-reject/error-callback shape exactly (traced through the unchanged `.open(callback)` logic). Note: `isConnected()` reports `true` even after this failed connect, because `_device` is assigned before `.open()`'s callback runs and the error path never resets it to `null` — this is pre-existing behavior in the original serialport-8 code too (unrelated to the patch, not something introduced or fixed here).

### What remains hardware-gated (cannot verify without a physical ESP8266 over USB)

- `checkConnection()`, `deviceInfo()`, `fsinfo()` against a real device — these depend on the NodeMCU Lua REPL actually responding over the wire.
- `download()`/`upload()` — the file-transfer + verify round trip (`saveFileUpload` in `NodeMcuConnector.ts`) needs a device with a Lua filesystem to write to and read back from.
- `hardreset()` and the reconnect-after-reboot loop in `NodeMcuConnector.ts:333-355`.
- Real-world `DelimiterParser` behavior against the actual `\r\n>` REPL prompt framing (the parser construction and pipe wiring were verified to run without error, but no real byte stream was pushed through it).
- End-to-end `program()` / `writeTallySettingsIni()` flows in `NodeMcuConnector.ts` — these compose all of the above.

### Publishing steps (for a human to execute — not done here per instructions)

1. Fork `wifi-tally/NodeMCU-Tool` to `PepperJeon/NodeMCU-Tool` on GitHub.
2. Apply `docs/design/nodemcu-tool.patch` on top of commit `f4d1503df4825381e9042e155c5e57bd94e6eba8` in that fork, commit, push.
3. Re-pin `hub/package.json`'s `nodemcu-tool` dependency from `"github:wifi-tally/NodeMCU-Tool"` to `"github:PepperJeon/NodeMCU-Tool#<new-commit-sha>"` — use the commit SHA, not a branch name, so `npm ci` stays reproducible (a branch ref is exactly what makes npm 11 refuse the current lockfile).
4. Run `npm install` in `hub/` to regenerate the lockfile against the new pin, then `npm ci` to confirm it's reproducible, then re-run the verification steps above (plus the hardware-gated ones, with a tally plugged in) against the real `hub/` install.

**Status**: forked to `PepperJeon/NodeMCU-Tool` (branch `serialport-13`, commit `9b5f8d027042155d35ffbcfb33af7fb941c4bdd5`, based on `f4d1503d`). Not yet re-pinned in `hub/package.json` — held pending another in-flight change to that file (the `@julusian/midi` swap). Not opened as a PR upstream: `wifi-tally/NodeMCU-Tool` last received a push on 2021-02-24 and has zero PR history in either direction — treated as dormant, skipped per the "skip if no maintainer activity" call.

### Known upstream bug found during verification (not fixed here, out of scope for a pure API-migration patch)

`lib/transport/serialport.js`, `connect()` (~line 25 pre-patch / same in the patched version): `_device = new SerialPort({...})` assigns the device handle *before* `.open()`'s callback runs, and the callback's error branch (`if (err){ reject(err) }`) never resets `_device` back to `null`. Net effect: after a `connect()` call that fails (bad path, device unplugged, permission error), `isConnected()` still reports `true`.

Confirmed live: `connect()` against a nonexistent path rejected as expected, but `isConnected()` afterward returned `true`.

This predates the serialport 13 migration — same shape existed against serialport 8. One-line fix would be to null `_device` in the `.open()` error branch:
```js
_device.open(function(err){
    if (err){
        _device = null;   // <- add this
        reject(err);
    }else{
        resolve();
    }
});
```

**Why it matters for vTally — confirmed, not just theoretical**: `NodeMcuConnector.ts` guards cleanup/disconnect calls with `if (this.nodemcu && this.nodemcu.isConnected())` (e.g. `:219`, `:269`, `:329`) and `saveFileUpload` throws if `!this.nodemcu.isConnected()` (`:381-383`). Traced it live: after a failed `connect()`, `nm.isConnected()` reads `true` as expected, and then `nm.disconnect()` (which calls `_device.close()`) **rejects** with `Port is not open` rather than throwing, no-op'ing, or hanging.

That means in `getDevice()` (`NodeMcuConnector.ts:173-221`), if `this.connect(device.path)` at `:191` throws (device unplugged mid-scan, permission error, etc.), the `catch` block at `:214` sets `tallyDevice.errorMessage` and returns a valid `TallyDevice` — but then the **unguarded `finally` block at `:218-220`** runs `await this.nodemcu.disconnect()`, which rejects. A rejection inside `finally` replaces whatever the `try`/`catch` was about to return, so the caller gets `Port is not open` instead of the intended `TallyDevice` with a populated `errorMessage`. Same shape applies to `program()` (`:268-270`, not awaited — becomes an unhandled rejection instead) and `writeTallySettingsIni()` (`:328-330`, same). Net effect: a failed connection attempt can silently swap a clean, informative error result for a confusing "Port is not open" one, or an unhandled rejection.

Not fixed here — flagging for a separate, deliberate patch (either the one-line upstream fix above, or wrapping the `finally` blocks' `disconnect()` calls in their own try/catch on the vTally side) rather than folding either into this pure API-migration diff.

### Pin verification — the actual point of forking (`npm ci` must work)

Tested in an isolated scratch dir (`/private/tmp/.../scratchpad/pin-test/`, outside both `vtally-modern` and the patched fork checkout) — a throwaway `package.json` with a single dependency: `"nodemcu-tool": "github:PepperJeon/NodeMCU-Tool#9b5f8d027042155d35ffbcfb33af7fb941c4bdd5"` (SHA pin on the non-default `serialport-13` branch, exactly what the real re-pin will use).

1. **`npm install` resolves the SHA pin.** Clean success, generates a `package-lock.json` recording that exact `github:...#9b5f8d0...` resolution.
2. **serialport 13 installs with prebuilds, zero compilation.** `node_modules/@serialport/bindings-cpp/prebuilds/darwin-x64+arm64/@serialport+bindings-cpp.node` present; no `node-gyp`/build directories anywhere under `node_modules`.
3. **`npm ci` works — exit code 0.** Deleted `node_modules`, ran `npm ci` twice against the lockfile from step 1: both succeeded, no integrity/resolution errors, only npm's routine deprecation warnings (unrelated packages). This is the deviation-#2 fix from `BASELINE.md` confirmed working: a commit-SHA git pin, unlike the current branch-name pin, satisfies npm 11's lockfile check.
4. **`require()` loads clean.** `require('nodemcu-tool')` (package version `3.2.1`, transitively resolving `serialport@13.0.0`) returns the full expected API surface (`onError, disconnect, connect, isConnected, checkConnection, compile, deviceInfo, listDevices, download, upload, execute, format, fsinfo, remove, softreset, hardreset, run`) with no throw.

**Conclusion: the SHA-pin approach is confirmed to work end-to-end.** No need to fall back to vendoring. The re-pin task, once unblocked, is just: change the one `nodemcu-tool` line in `hub/package.json` to `"github:PepperJeon/NodeMCU-Tool#9b5f8d027042155d35ffbcfb33af7fb941c4bdd5"`, run `npm install` to regenerate `hub/package-lock.json`, then confirm `npm ci` in `hub/` — this exact sequence already proven to work in isolation.

### Re-pin executed in the real repo (Phase 2d)

Done for real, not just in the scratch dir. `hub/package.json`'s `nodemcu-tool` line changed from `"github:wifi-tally/NodeMCU-Tool"` to `"github:PepperJeon/NodeMCU-Tool#9b5f8d027042155d35ffbcfb33af7fb941c4bdd5"`, `hub/package-lock.json` regenerated against it (`npm install --legacy-peer-deps`, run after Phase 1's dependency graph changes — Vite, Vitest, Cypress 15, TypeScript 5.9 — landed).

Re-verified against the real lockfile, not the isolated scratch-dir one:
- `npm install --legacy-peer-deps` resolved cleanly (161 added / 143 removed / 106 changed packages vs. the pre-repin lockfile).
- `rm -rf node_modules && npm ci --legacy-peer-deps` — **exit 0**, run twice on a fresh `node_modules` both times.
- `require('nodemcu-tool')` returns all 17 API methods; `require('serialport/package.json').version` → `13.0.0`; no compile step observed.
- **Isolated the `--legacy-peer-deps` requirement**: a plain `npm ci` (no flag) was also tried fresh, and it fails — but only on the pre-existing `react-full-screen@0.3.2-0` / `react@17` peer conflict (`BASELINE.md` Deviation #6, already known, unrelated to nodemcu-tool). Zero nodemcu-tool/serialport errors appear in that failure. This confirms the git-dependency reproducibility problem itself (Deviation #2) is fully closed; the remaining flag requirement is a separate, already-documented issue.

**BASELINE.md Deviation #2 updated to reflect this is resolved.**
