# Test suite audit — assertion theatre inventory

Scope: all 26 `hub/src/**/*.spec.*` files (3052 lines), plus a lighter pass over the 15 `hub/cypress/integration/*.spec.ts`.

Purpose: decide which of the 20 currently-passing suites in `BASELINE.md` are real regression gates and which are not, so that "≥ baseline" means something per unit of work.

**Inventory only. Nothing was changed.** No source edits, no git commands.

---

## 0. Headline

| | |
|---|---|
| Suites that are solid regression gates today | **12** |
| Suites that are partial gates (catch structural breakage, miss value regressions) | **7** |
| Suites worth **zero** as a gate | **1** (`NullConfiguration.spec.ts` — both tests have no assertion) |
| Currently-failing suites whose *content* is sound but unmeasured | **4** |
| Currently-failing suites whose content is sound *and* whose failure is a one-word bug in the test itself | **1** (`VmixConnector.spec.js`) |
| Currently-failing suites with an unverified race inside | **1** (`AppConfigurationPersistence.spec.ts`) |

**The single most consequential finding is not in this table.** It is that the three suites gating unit **2a (`channelsByMixer`)** — `AppConfiguration`, `AppConfigurationPersistence`, `MixerCommunicator` — are all in the `midi`-blocked set. Their gate value today is **zero, not weak**. Details in §7.

**One correction to my own earlier framing.** I told you the `ObsConnector.spec.ts` `waitUntil` sites "pass on timing luck". That is accurate but I should be precise about the failure direction: an always-true predicate makes `waitUntil` resolve on its first 100 ms tick, so those call sites degrade from *synchronisation* to a **fixed 100 ms sleep**. The `toEqual` assertions that follow are real deep comparisons. The failure mode is therefore flakiness and blindness to timing regressions — **not** silently-green assertions. That is a smaller problem than "asserts nothing", and I do not want the plan to inherit an overstatement.

---

## 1. Predicates that are always true or always false

### 1.1 `ObsConnector.spec.ts` — 19 `waitUntil` sites (SEVERITY: MEDIUM)

```js
// ObsConnector.spec.ts:5-13
const waitUntil = (fn) => {
    return new Promise((resolve, _) => {
        setInterval(() => { if (fn() === true) { resolve() } }, 100)
    })
}
```

Every call site of the form `waitUntil(() => communicator.programs !== ["Scene 1"])` compares an array reference against a **freshly allocated literal**. Never equal, therefore always `true`, therefore resolves on the first 100 ms tick regardless of connector state.

| Line | Predicate | Verdict |
|---|---|---|
| 290 | `communicator.programs !== ["Scene 1"]` | always true |
| 317 | `communicator.previews !== ["Scene 2"]` | always true |
| 339 | `communicator.programs !== ["Scene 1"]` | always true |
| 378 | `communicator.programs !== ["Cam 1"]` | always true |
| 382 | `communicator.programs !== ["Cam 2"]` | always true |
| 404 | `communicator.programs !== ["Cam 1"]` | always true |
| 409 | `communicator.programs !== ["Cam 1", "Cam 2"]` | always true |
| 431 | `communicator.programs !== ["Cam 1"]` | always true |
| 433 | `communicator.programs !== ["Cam 1", "Cam 2"]` | always true |
| 520 | `communicator.previews !== ["Scene 2"]` | always true |
| 549 | `communicator.previews !== []` | always true |
| 555 | `communicator.previews !== ["Scene 1"]` | always true |
| 584 | `communicator.previews !== []` | always true |
| 590 | `communicator.previews !== ["Scene 1"]` | always true |
| 596 | `communicator.previews !== []` | always true |
| 602 | `communicator.previews !== ["Scene 1"]` | always true |
| 631 | `communicator.previews !== []` | always true |
| 637 | `communicator.previews !== ["Scene 1"]` | always true |
| 643 | `communicator.previews !== []` | always true |
| 649 | `communicator.previews !== ["Scene 1"]` | always true |

Three call sites in the same file are **sound** and should be preserved as the model: `460` and `490` (`communicator.channels.length !== 2` — number comparison) and `516` (`communicator.previews !== null` — primitive). The 12 `waitUntil(() => obs.isConnected())` sites are also sound.

- **Appears to test:** "wait until the connector has reacted to the event, then assert the new state."
- **Actually tests:** "sleep 100 ms, then assert the new state."
- **Severity:** MEDIUM. Not a false pass — assertions still run and still compare deeply. But (a) the suite goes red nondeterministically on a loaded CI box, and (b) a change that makes the connector 200 ms slower to react is invisible-to-flaky rather than a clean failure. For a tally system, reaction latency *is* the product.
- **Minimal fix:** the deep-comparison predicate plus a timeout, in the rewritten helper (see §2.1). E.g. `waitUntil(() => JSON.stringify(communicator.programs) === '["Scene 2"]')`.
- **Note:** this file is being rewritten from scratch for obs-websocket v5 (unit 2c), so the fix lands there for free. The *pattern* must not be copied forward.

### 1.2 Config-suite "has a default" tests — 5 suites (SEVERITY: MEDIUM, and directly relevant to 2c)

The five mixer-config specs are clones of one template. Each contains:

```ts
// ObsConfiguration.spec.ts:10-13 (and :34-37, :24-30, :48-54)
it("has a default", () => {
    const conf = createDefaultObsConfiguration()
    expect(conf.getPort()).toBeTruthy()
})
```

| File | Lines |
|---|---|
| `mixer/obs/ObsConfiguration.spec.ts` | 12, 29, 36, 53 |
| `mixer/atem/AtemConfiguration.spec.ts` | 12, 29, 36, 53 |
| `mixer/vmix/VmixConfiguration.spec.ts` | 12, 29, 36, 53 |
| `mixer/rolandV60HD/RolandV60HDConfiguration.spec.ts` | 12, 29, 36, 53, 60, 77 |
| `mixer/rolandV8HD/RolandV8HDConfiguration.spec.ts` | 10, 22 |

- **Appears to test:** the configuration has correct defaults.
- **Actually tests:** the getter returns *something non-falsy*. An `IpPort` or `IpAddress` object is always truthy, so this assertion cannot fail short of the getter returning `undefined`.
- **Severity:** MEDIUM, and immediately load-bearing: **unit 2c changes `ObsConfiguration.defaultPort` from `ipPort(4444)` to `ipPort(4455)`, and not one test in this repo would notice.** The same hole means nobody would catch an accidental default-IP change on any of the five mixers.
- Compounding: `it("allows to restore the default")` (lines 24-30, 48-54) does `setPort(1234)` → `setPort(null)` → `expect(getPort()).toBeTruthy()`. It asserts a default was restored, not *which* default. `setPort(null)` setting the port to `1` would pass.
- **Minimal fix:** one assertion per suite, `expect(conf.getPort().toNumber()).toEqual(4455)`. Two lines total per file, and it converts the intended default into a pinned fact.
- Same template also has two mislabeled test names in the IP block — `ObsConfiguration.spec.ts:38` `it("allows to set an IpPort")` and `:43` `it("allows to set a number")` both actually exercise IP addresses/strings. Cosmetic, but it is the tell that the template was cloned five times without review.

### 1.3 `toBeFalsy` / `toBeTruthy` on values with several falsy shapes (SEVERITY: LOW)

| Location | Pattern | Note |
|---|---|---|
| `lib/AppConfiguration.spec.ts:121` | `expect(tallies[1]?.channelId).toBeFalsy()` | intent is "WebTally has no channel"; passes on `undefined`, `null`, `""`, `0` |
| `mixer/mock/MockConfiguration.spec.ts:87-89` | `expect(channels[n].name).toBeFalsy()` | intent is "name cleared" |
| `mixer/mock/MockConfiguration.spec.ts:97` | `expect(conf.getChannelNames().toString()).toBeFalsy()` | `[].toString()` is `""`, but so is `[null].toString()` |

- **Severity:** LOW. Redundant rather than dangerous — the surrounding assertions in each test do the real work.
- **Minimal fix:** `toBeUndefined()` / `toEqual("")` as appropriate. Not urgent.

### 1.4 Non-finding: object/array identity comparisons elsewhere

I checked every `!==`/`===` in the other 25 files. `MockConfiguration.spec.ts:123` and `:138` (`expect(loadedConf.getChannels()).toEqual(conf.getChannels())`) look like self-comparison but are genuine — they compare two independently-constructed instances with Jest deep equality, and a `clone()` that failed to copy channels would produce the default count rather than 7 and fail. No action.

---

## 2. Awaits that don't await anything meaningful

### 2.1 Three copies of the same leaky `waitUntil` (SEVERITY: MEDIUM)

Identical 9-line helper, copy-pasted:

| File | Lines |
|---|---|
| `mixer/obs/ObsConnector.spec.ts` | 5-13 |
| `mixer/vmix/VmixConnector.spec.js` | 5-13 |
| `mixer/rolandV60HD/RolandV60HDConnector.spec.js` | 5-13 |

Two defects shared by all three:
1. **`setInterval` is never cleared.** It keeps firing after `resolve()`, for the life of the process, once per call. ~30 calls in `ObsConnector.spec.ts` alone. Jest tolerates it; **Vitest hangs on teardown** — this is the blocker flagged at plan line 103.
2. **No timeout.** A predicate that never becomes true hangs until the runner's 5 s default rather than failing with a useful message.

**Important distinction:** the Vmix and RolandV60HD call sites use *sound* predicates and are not assertion theatre:

```js
// VmixConnector.spec.js:118, 131 — boolean flag, genuine
await waitUntil(() => vmix.wasHelloReceived === true).then(() => ...)
// VmixConnector.spec.js:144, 159, 173 — compared against undefined, genuine
await waitUntil(() => communicator.programs !== undefined).then(() => ...)
// RolandV60HDConnector.spec.js:117 — compound, genuine
await waitUntil(() => communicator.programs !== undefined && rolandV60HD.isConnected()).then(() => ...)
```

The `await x.then(assert)` shape also parses correctly (`await (waitUntil(...).then(...))`), so the assertions do run inside the test. These two files have a *timer leak*, not a *logic* problem.

- **Minimal fix:** one shared helper, three imports:
```ts
const waitUntil = async (fn: () => boolean, timeoutMs = 2000) => {
    const deadline = Date.now() + timeoutMs
    while (!fn()) {
        if (Date.now() > deadline) { throw new Error(`waitUntil timed out: ${fn}`) }
        await new Promise(r => setTimeout(r, 10))
    }
}
```

### 2.2 `fs.write` not awaited before the assertion depends on it (SEVERITY: MEDIUM, UNVERIFIED)

```ts
// AppConfigurationPersistence.spec.ts:44-52
tmp.file((err, path, fd) => {
    if (err) { throw err }
    fs.write(fd, "Hello World", (err) => { if (err) { throw err }})   // ← async, not awaited

    const emitter = new EventEmitter()
    const config = new AppConfiguration(emitter)
    expect(() => {
        new AppConfigurationPersistence(config, emitter, path)        // ← reads the file synchronously
    }).toThrow(Error)
```

Same shape at line 63 (`'{"invalid": "JSON"'`).

- **Appears to test:** "a file containing garbage causes a throw."
- **Actually tests:** a race. `fs.write` dispatches to the libuv threadpool; the constructor's synchronous read runs on the main thread immediately after. If the write has not landed, the file is empty, `AppConfigurationPersistence` takes the *empty-file* path (warn, no throw), and `expect(...).toThrow(Error)` fails.
- **Severity:** MEDIUM but **unverified** — this suite is one of the 6 currently failing (on the `midi` import), so its behaviour on this machine has never been observed. It passed in 2022 CI, so the race evidently resolved in that environment's favour. Do not assume it still will.
- **Minimal fix:** `fs.writeSync(fd, "Hello World")`. One word.
- **Action:** re-check this the moment the `midi` blocker lifts. It is the only finding in this audit whose severity I cannot pin from reading alone.

### 2.3 `cy.wait(500)` as synchronisation (SEVERITY: LOW)

`cypress/integration/webtally.spec.ts:294` — the only hard sleep in the Cypress suite. Everything else uses Cypress's built-in retry-until-assertion, which is correct. Flagging for completeness; not worth touching until that spec is rewritten in Phase 3.

---

## 3. Tests with no assertion at all

### 3.1 `NullConfiguration.spec.ts` — both tests (SEVERITY: LOW in effect, HIGH as a signal)

```ts
// NullConfiguration.spec.ts:7-15
describe('fromJson/toJson', () => {
    it("does work", () => {
        const conf = createDefaultNullConfiguration()
        const loadedConf = createDefaultNullConfiguration()
        loadedConf.fromJson(conf.toJson())
        // it does not throw an error. Apart from that it does not have any settings to check
    })
})
// :17-24 — clone(), same shape, same comment
```

- **Appears to test:** JSON round-trip and cloning.
- **Actually tests:** that the two calls do not throw. The comment says so outright.
- **Severity:** LOW in consequence (`NullConfiguration` genuinely holds nothing), but it means **2 of the 211 "passing tests" in `BASELINE.md` assert nothing**, and this suite contributes 1 to the "20 passing suites" headline while providing no regression signal at all.
- **Minimal fix:** `expect(() => { ... }).not.toThrow()`. Makes the intent explicit and keeps the suite honest.

### 3.2 `AppConfiguration.spec.ts:38` — skipped stub

```ts
test.skip('it can persist null configuration', done => {
    // it is empty -> so it does not really matter
})
```

Reported as skipped, not passing, so it does not inflate the count. Harmless. Note it takes a `done` parameter it never calls — if the `.skip` were ever removed it would hang for 5 s and then fail.

### 3.3 Non-finding: assertions inside event handlers

`MixerCommunicator.spec.ts:13-17` asserts inside an `emitter.on("program.changed", ...)` handler — the classic never-runs hazard. **It is correctly guarded:**

```ts
emitter.on("program.changed", ({programs, previews}) => {
    eventSeen++
    expect(programs).toEqual(expectedPrograms)
    ...
})
...
expect(eventSeen).toEqual(1)   // ← the guard
```

The counter assertion outside the handler proves the handler ran, and `EventEmitter.emit` is synchronous so a throw inside propagates into the test. **This is the pattern the rest of the codebase should copy.** No action.

### 3.4 Cypress specs with no explicit `should()`/`expect()`

`smoke.spec.ts` (0), `configNull.spec.ts` (0), `tally-logs.spec.ts` (0), `flasher.spec.ts` (1).

This is **not** assertion theatre. `cy.getTestId(...)` wraps `cy.get`, and `cy.get`/`cy.contains` fail the test if the selector does not resolve within the timeout — an implicit existence assertion. `tally-logs.spec.ts` in particular does real work via `cy.contains('*[data-severity=warning]', "…")`, which pins both the state attribute and the text.

The real limitation is narrower: these specs assert **existence and navigation, never content or computed state**. `smoke.spec.ts:14-21` clicks through three routes and checks only that each page's root testid appears. That is a genuine smoke test and appropriate for its name. `flasher.spec.ts` at 14 lines is the thin one.

- **Severity:** LOW. Rating them as "presence-only" in §7 rather than treating them as behavioural gates.
- `smoke.spec.ts:35-36` holds two `it.skip` stubs with no body at all — `'should not rely on resources from the internet'` and `'should instantly show the correct state when the server crashes and is restarted'`. The second is exactly the reconnect regression that plan unit **2d** intends to fix (`ConfigTracker`/`MixerTracker` do not re-subscribe on reconnect). The upstream author knew about it and left a named placeholder. Worth adopting rather than re-deriving.

---

## 4. `done`-callback tests that can pass by timing out

Four in `AppConfigurationPersistence.spec.ts` (lines 24, 41, 58, 145) — the plan says 3; it is 4, the fourth being the top-level `save/load persists data` at line 145.

**None of them can pass by timing out.** Jest fails a test whose `done` is never called. The hazard is the opposite one, and it is real:

```ts
// :27-28, :44-45, :61-62, :146-147
tmp.file((err, path) => {
    if (err) { throw err }    // ← throws on a later tick, outside the test's try/catch
```

A throw inside the `tmp.file` callback surfaces as an unhandled exception on a different tick. Jest's attribution of those to the correct test is unreliable — the usual outcome is a confusing failure in whichever test happens to be running, or a process-level error.

- **Severity:** LOW (the error paths only fire if `tmp` itself fails, which is rare).
- **Minimal fix:** these are the three the plan already schedules for Promise conversion in Phase 1e. `tmp-promise` is **already a direct dependency** (`package.json` line 15) while `tmp` is only a devDependency type — so the conversion is `const {path} = await tmp.file()` with no new dependency. Fold the fourth (line 145) into the same change.

---

## 5. Leaked timers and handles

| Location | Leak | Impact |
|---|---|---|
| `ObsConnector.spec.ts:5-13` | uncleared `setInterval`, ~30 instances | Vitest teardown hang |
| `VmixConnector.spec.js:5-13` | same helper, 5 instances | same |
| `RolandV60HDConnector.spec.js:5-13` | same helper, 1 instance | same |
| `VmixConnector.spec.js:67-69` | `setTimeout` inside the mock server's `SUBSCRIBE TALLY` handler, fires 100 ms later | if the socket closes first the guard `sck.writable &&` saves it; not a leak in practice, but it does mean the tally response is deliberately delayed 100 ms — the tests depend on that timing |
| `AppConfigurationPersistence.spec.ts:12, 26, 43, 60` | `console.warn` / `console.error` replaced and **never restored** | see below |

### 5.1 The `console` monkeypatch (SEVERITY: LOW-MEDIUM)

```ts
// AppConfigurationPersistence.spec.ts:12
console.warn = () => { warningsLogged++ }
// :43
console.error = () => { errorsLogged++ }
```

Replaced globally, never restored. Jest gives each spec file its own `console`, so this does not leak across files — but for the remainder of *this* file (the three fixture-loading tests at 78-142 and `save/load persists data` at 145) both `console.warn` and `console.error` are silently piped into a closed-over counter from a test that already finished. Any genuine error logged during migration-fixture loading is swallowed.

- **Severity:** LOW-MEDIUM. Doesn't cause false passes, but it blinds precisely the tests that unit **2a** is about to modify (the v0.2.1/v0.3.0/v0.4.0 migration fixtures). If a `channelsByMixer` migration starts logging `error loading property "channels"`, nobody sees it.
- **Minimal fix:** `jest.spyOn(console, 'warn').mockImplementation()` + `afterEach(() => jest.restoreAllMocks())`. Under Vitest, `vi.spyOn` / `vi.restoreAllMocks`.

---

## 6. Order dependence and shared state

I looked for the failure mode you named — module-level singletons leaking between tests. **The good news: almost none of it is reachable from the current unit tests.**

| Singleton | Reachable from a spec? |
|---|---|
| `flasher/NodeMcuConnector.ts:31` `let mutex = false` | **No.** No spec imports `NodeMcuConnector`. `TallyDevice.spec.ts` only touches `TallyDevice`/`TallySettingsIni`. |
| `hooks/useSocket.ts:12` module-scope `socket` | **No longer accurate — corrected in unit 2b.** This row originally read "the trackers … have **no specs at all**". Seven tracker specs exist as of the Phase 1 restructure: `src/client/hooks/tracker/{channel,config,mixer,program,tally,tallylog}.spec.ts` plus `src/client/hooks/useTallies.spec.tsx`. They drive a fake socket (`tracker/fakeSocket.ts`), not the module-scope one, so the *singleton-leak* answer is still **No** — but the coverage claim was wrong. |
| `server.ts:39-60` (`io`, `myConfiguration`, `myMixerDriver`, `myNodeMcuConnector`, …) | **No.** No spec imports `server.ts`. |

What *is* shared:

| Location | Shared thing | Verdict |
|---|---|---|
| `ObsConnector.spec.ts:67`, `VmixConnector.spec.js:52`, `RolandV60HDConnector.spec.js:53` | `global.obsServer` / `global.vMixServerConfig` / `global.rolandV60HDServerConfig` | Reassigned wholesale in `beforeEach` and torn down in `afterEach`. Safe, if ugly. Note `ObsConnector.spec.ts`'s `afterEach` closes the server but does **not** null the global — harmless within a file. |
| `TallySettingsIni.spec.ts:13` | one `tallySettingsIni` instance shared across 5 tests in the `describe("parse()")` block | Those 5 tests are read-only (`getStationSsid()` etc.), so no order dependence today. Latent: adding one mutating test to that block would silently couple the five. LOW. |
| `CommandCreator.spec.ts:7` | `const defaultConfig = new DefaultTallyConfiguration()` shared across the describe | Read-only in all cases. LOW. |

**Conclusion: order dependence is not a live problem in the current unit suite.** It becomes one the moment Phase 1a converts the trackers to `useSyncExternalStore` and someone writes the first tracker spec — those *are* module singletons with a shared `Set` of subscribers. Worth a note in the Phase 1a work item, not an action now.

---

## 7. Trust rating per suite

Rating scale:
- **A — trusted gate.** Tight assertions on exact values. A behavioural regression fails this suite.
- **B — partial gate.** Catches structural/round-trip breakage; blind to specific classes of value regression.
- **C — presence only.** Proves the thing exists/doesn't throw. Near-zero regression signal.
- **F — no signal.**
- **?** — content unmeasured on this machine.

### Currently passing (20)

| Suite | Trust | Why |
|---|---|---|
| `tally/CommandCreator.spec.ts` | **A** | Exact wire-string equality (`"O255/000/000 S255/000/000"`). The tightest suite in the repo — this is what pins tally output. |
| `tally/CommandParser.spec.ts` | **A** | Exact error-message matching, both happy and error paths. |
| `tally/TallyConfiguration.spec.ts` | **A** | Table-driven with boundary cases (`-1→0`, `101→100`, `undefined`, `null`). |
| `domain/IpAddress.spec.ts` | **A** | Table-driven, 4 valid + 10 invalid incl. whitespace variants. |
| `domain/IpPort.spec.ts` | **A** | Table-driven, 5 valid + 7 invalid incl. `0`, `-42`, `3.141`. |
| `domain/Tally.spec.ts` | **A** | Full round-trip, both tally types, defaults *and* set values. |
| `flasher/TallySettingsIni.spec.ts` | **A** | Exact full-file string equality after mutation. Shared instance is read-only. |
| `flasher/TallyDevice.spec.ts` | **A** | 10-field round-trip. |
| `mixer/test/TestConfiguration.spec.ts` | **A** | Round-trip + clone, exact values. |
| `components/ChannelSelector.spec.tsx` | **A** | Real DOM, option count, values, `onChange` payload incl. the `null` unpatched case. This is the suite Phase 3's `data-contract` work will lean on. |
| `mixer/mock/MockConfiguration.spec.ts` | **A−** | Thorough (throw cases, string/array/comma parsing, trimming). Three `toBeFalsy` at 87-89, 97 are the only softness. |
| `components/uniqueId.spec.ts` | **A−** | 1000-iteration uniqueness. `expect(seenIds).not.toContain(id)` on a `Set` works in both Jest and Vitest; `seenIds.has(id)` would be clearer. |
| `mixer/obs/ObsConfiguration.spec.ts` | **B** | Round-trip and clone-aliasing are genuine. **Blind to default-value changes** (§1.2) — will not notice 4444→4455. No `liveMode` default or `isValidLiveMode` coverage. |
| `mixer/atem/AtemConfiguration.spec.ts` | **B** | Same template, same hole. |
| `mixer/vmix/VmixConfiguration.spec.ts` | **B** | Same. |
| `mixer/rolandV60HD/RolandV60HDConfiguration.spec.ts` | **B** | Same, plus `requestInterval`. |
| `mixer/rolandV8HD/RolandV8HDConfiguration.spec.ts` | **B** | Same, thinnest of the five (46 lines, `requestInterval` only). |
| `mixer/rolandV60HD/RolandV60HDConnector.spec.js` | **B** | Exactly **one** test, happy path only. Predicate is sound; timer leaks. No coverage of disconnect, HTTP error, or polling-interval behaviour. |
| `mixer/obs/ObsConnector.spec.ts` | **B** | 11 tests with real deep-equality assertions covering cut/transition/studio-mode/liveMode — genuinely broad. Downgraded from A for the 19 sleep-synchronised sites (§1.1). Being rewritten in 2c anyway. |
| `mixer/null/NullConfiguration.spec.ts` | **F** | Zero assertions (§3.1). |

### Currently failing (6)

| Suite | Blocker | Trust *if unblocked* | Why |
|---|---|---|---|
| `lib/MixerCommunicator.spec.ts` | `midi` import | **A** | The best-constructed suite in the repo — event counters as guards, debounce semantics pinned step by step. |
| `lib/AppConfiguration.spec.ts` | `midi` import | **A−** | 10 round-trip tests across every mixer config. Optional chaining (`tallies[0]?.name`) is safe — `undefined !== "Tally 01"` still fails. One `toBeFalsy` at 121. |
| `lib/MixerDriver.spec.ts` | `midi` import | **B** | `toContain`/`not.toContain` pairs are real; `expect(length).toBeGreaterThan(2)` is filler. Only covers `getAllowedMixers`, nothing about driver switching. |
| `tally/TallyContainer.spec.ts` | `midi` import | **A−** | Single test, but a real create→update→remove lifecycle against real config state. |
| `lib/AppConfigurationPersistence.spec.ts` | `midi` import | **B?** | Migration-fixture tests (78-142) are excellent and exactly what 2a needs. But contains the unverified write race (§2.2) and the console monkeypatch (§5.1). **Verify before relying on it.** |
| `mixer/vmix/VmixConnector.spec.js` | `::1` | **B** | 5 tests, sound predicates, real XML/TALLY parsing assertions. Timer leaks. See §8. |

### Cypress (15) — light pass

| Suite | Trust | Note |
|---|---|---|
| `tally-settings.spec.ts` | **A** | 464 lines, ~100 assertions. By far the most substantial E2E. |
| `webtally.spec.ts` | **A−** | 306 lines, ~38 assertions incl. the computed `data-brightness`/`data-color` values Phase 3.1 must preserve. One `cy.wait(500)` at :294. |
| `tally.spec.ts` | **A−** | ~29 assertions on tally list state. |
| `configTally.spec.ts` | **B+** | 15 assertions. |
| `configObs.spec.ts` | **B** | Validation + save/reload persistence. Adding an `obs-password` field will not break it — but it also will not test it. |
| `configAtem` / `configVmix` / `configRolandV60HD` / `configRolandV8HD` | **B** | Same shape, 6-13 assertions each. |
| `smoke.spec.ts` | **C** | Navigation + route existence only. Correct for its name. Two `it.skip` stubs (§3.4). |
| `configNull.spec.ts` | **C** | Select → submit → reload → panel present. |
| `tally-logs.spec.ts` | **B** | Better than its zero-`should()` count suggests — `cy.contains('*[data-severity=warning]', "…")` pins attribute *and* text. |
| `flasher.spec.ts` | **C** | 14 lines. |
| `manual_atem.spec.ts` | **—** | Hardware-gated, permanently excluded. |
| `manual_flasher.spec.ts` | **—** | Hardware-gated; `cy.pause()` hangs headless. |

**All 15 are currently unmeasured** (backend cannot start — `midi`). Their trust ratings are potential, not observed.

---

## 8. The honest baseline number

You asked for my view. Here it is, with the two questions separated because they have different answers.

### Q1: "Is the true baseline higher than 20/26?"

**Yes — the *achievable* number is 26/26, and 6 of the 6 failures are infrastructure, not behaviour.** But that is not the useful framing, because 5 of those 6 are blocked on one import and the sixth is blocked on one word.

The `VmixConnector.spec.js` `::1` failure is **a bug in the test, not environment coupling**, and the proof is sitting in the sibling file:

```js
// VmixConnector.spec.js:79-82
server.listen({ port: 0, host: 'localhost' }, ...)
//                       ^^^^^^^^^^^ resolves to ::1 on this machine
global.vMixServerConfig.serverIp = server.address().address   // → "::1"

// RolandV60HDConnector.spec.js:77-80  — same helper, written correctly
server.listen({ port: 0, host: '127.0.0.1' }, ...)
```

Both specs feed `server.address().address` straight into a `Configuration.setIp()` that only accepts IPv4. RolandV60HD binds to `127.0.0.1` and gets `"127.0.0.1"` back; Vmix binds to `'localhost'` and gets `"::1"` back on a dual-stack machine. **`BASELINE.md` classifies this as "pre-existing test/environment coupling, not something Phase 0 should fix" — that classification is right about scope but wrong about cause.** It is a one-word fix in the test file, zero app-code risk, and it should not be carried as a permanent asterisk. Worth correcting in `BASELINE.md` even if the fix waits.

(Aside: `IpAddress` accepts the literal string `"localhost"` — `IpAddress.spec.ts:8` — so `host: 'localhost'` was probably *intended* to work and the author didn't realise `address()` returns the resolved address, not the requested host.)

### Q2: "How many suites are solid once assertion theatre is discounted?"

Counting only suites I would trust to fail on a real regression:

- **12 suites are grade A/A− and passing today.** That is the honest solid number for the *currently green* set.
- Add **4 more** (`MixerCommunicator`, `AppConfiguration`, `TallyContainer`, `MixerDriver`) the moment `midi` is unblocked — they read as A/A−/B and are blocked purely on an import.
- **7 suites are grade B** — real but partial. They will catch "you broke the round-trip"; they will not catch "you changed a default".
- **1 suite (`NullConfiguration`) is worth nothing** and should stop being counted.

> **So: 12 solid / 7 partial / 1 empty out of the 20 passing. Post-`midi`-unblock the ceiling is 16 solid / 9 partial / 1 empty out of 26.**
>
> I would rather you carry **"12 solid today, 16 solid once `midi` is fixed"** than "20 passing".

### Q3 (the one that actually decides gating): per-unit gate strength

This is the number that determines whether "≥ baseline" protects each unit of work, and it is worse than the suite counts suggest.

| Unit | Suites that would catch a regression | Gate strength |
|---|---|---|
| **2a `channelsByMixer`** | `AppConfiguration`, `AppConfigurationPersistence`, `MixerCommunicator` — **all three are in the `midi`-blocked set**. Plus Cypress, also 0/13 measured. | **ZERO.** Not weak — zero. Every test that would notice a `getChannels()`/`setChannels()` regression is currently unmeasured. Unblocking `midi` is a hard prerequisite for 2a, not a nice-to-have. |
| **2b socket.io v2→v4** | Cypress only (the plan says so itself: "여기선 Cypress가 socket 통합 테스트다"). ~~Currently 0/13 measured.~~ **Superseded:** the Cypress suite is measured and green; see `scripts/baseline.json` for the live numbers (never restated here — this table has already gone stale once). | **REAL, and it earned its keep** — 2b's one genuine regression (the "Hub disconnected" banner going dead) was caught by `hub-disconnected-banner.spec.ts` and by nothing else. Still nothing covers the socket *transport* itself. |
| **2c obs-websocket v5** | `ObsConnector.spec.ts` (grade B, being replaced), `ObsConfiguration.spec.ts` (grade B, blind to the port-default change), `configObs.spec.ts` (unmeasured). | **WEAK, and self-repairing** — 2c rewrites its own gate. The `ObsConfiguration` default-port hole (§1.2) is the one thing to fix outside that rewrite. |
| **2d `midi`→`@julusian/midi`, atem deep import** | **`AtemConnector.ts` has no spec at all.** `MixerDriver.spec.ts` covers only `getAllowedMixers`. | **NEAR-ZERO.** The plan already flags this (risk #9: "AtemConnector엔 스펙이 없으므로 얇은 연결 테스트 추가"). Confirmed accurate. |
| **2e Feelworld (new)** | None yet — greenfield, spec written alongside. | N/A. |
| **1a `useSyncExternalStore`** | **No spec exists for any of the 7 trackers or 8 hooks.** | **ZERO.** The plan calls 1a "계획 전체에서 레버리지 최고" and it is, but it is also the largest unguarded refactor in the plan. |

### Recommended order change

Two things follow that I'd raise before Phase 1 starts:

1. **Unblock `midi` before 2a, not during 2d.** `BASELINE.md` §Deviations #5 already identifies the fix (the same lazy-load/Proxy-stub pattern already applied to `nodemcu-tool` in deviation #4) and explicitly defers the judgment call to whoever picks up Phase 1/2. That is now: it converts 2a's gate from zero to three A-grade suites and unblocks all 13 Cypress specs at once. It is the highest-leverage single change in the audit.
2. **Write tracker specs before 1a, not after.** 1a rewrites 7 files that have zero test coverage, and the same change introduces the first genuine module-singleton shared state in the test surface (§6). A handful of `subscribe`/`getSnapshot` tests written against the *current* EventEmitter trackers would give 1a an actual gate and cost far less than debugging a silent tracker regression through Cypress.

Neither is a fix I've applied — flagging only, as instructed.
