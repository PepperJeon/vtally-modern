# Fact-check: design docs vs. repo reality

Scope: `module-split.md`, `obs-websocket-v5.md`, `native-deps.md`. `feelworld-connector.md` skipped (self-authored). Read-only — no source or doc edits made. External-API claims (obs-websocket protocol, `@julusian/midi`/serialport internals) not re-verified, per instructions.

---

## module-split.md

| claim | stated | actual | OK/WRONG |
|---|---|---|---|
| Total `.ts`/`.tsx` files in `src/` | 109 | 123 (`find src \( -name "*.ts" -o -name "*.tsx" \)`, run twice, stable) | **WRONG** |
| Spec files | 26 | 24 | **WRONG** |
| Non-spec files | 83 | 99 | **WRONG** |
| `%PUBLIC_URL%` occurrences in `public/index.html` | 6 | 6 (`grep -c`) | OK |
| `.eslintrc.js` has `rules: {}` | empty rules object | confirmed, full file read | OK |
| `ObsConnector.ts:245` — `static readonly ID` | line 245 | line 245 | OK |
| `NullConnector.ts:22` | line 22 | line 22 | OK |
| `MockConnector.ts:45` | line 45 | line 45 | OK |
| `AtemConnector.ts:82` | line 82 | line 82 | OK |
| `TestConnector.ts:27` | line 27 | line 27 | OK |
| `VmixConnector.ts:215` | line 215 | line 215 | OK |
| `RolandV60HDConnector.ts:115` | line 115 | line 115 | OK |
| `RolandV8HDConnector.ts:130` — `static readonly ID` | line 130 | line 132 | **WRONG** |
| `ProgramProgress.tsx:2` — type-only `TallyProgramProgressType` import | line 2 | line 2, matches | OK |
| `TallySettingsProgress.tsx:2` — type-only `TallySettingsIniProgressType` import | line 2 | line 2, matches | OK |
| `FlasherPage.tsx:9` — type-only imports from `NodeMcuConnector` | line 9 | line 9, matches | OK |
| `SocketEvents.ts:15` — type-only cross-boundary import | line 15 | line 15, matches | OK |
| `TestConfiguration.ts:1` — `{ ChannelList }` from `MixerCommunicator`, type-only | line 1 | line 1; `ChannelList` is `export type ChannelList = string[] \| null` (`MixerCommunicator.ts:15`) — genuinely type-only | OK |
| 9 `mixer/*/react/*Settings.tsx` files; only some import their `Connector` at runtime just for `.ID` | Obs/Mock/Null import their Connector for `.ID` (3/4/3 occurrences resp.); Atem/RolandV8HD/RolandV60HD/Vmix hardcode the ID string literal instead; Test imports `TestConfiguration` (legit, not just for ID) | Verified by grepping `Connector` and `id:` in all 8 non-`ObsLiveModeSelect` Settings files — exactly matches: Obs 3, Mock 4, Null 3 `.ID` uses via import; Atem/RolandV8HD/RolandV60HD/Vmix have zero `Connector` import, hardcoded string literals (Vmix and Atem even carry `@TODO` comments); Test imports `TestConfiguration`, not `Connector` | OK — precise, not the oversimplified "all Settings.tsx import Connector for .ID" one might assume from a skim |
| `tsconfig.json` `types` array | `["cypress", "jest-extended"]` referenced with a trailing comma | confirmed: `["cypress", "jest-extended",]` — trailing comma after `jest-extended` (last entry), not after `cypress` | OK if doc's wording places the comma correctly (not independently re-read this session's exact module-split.md wording for this specific claim — spot-checked structurally correct) |

**Corrections needed**
- File-count table (§1, ~line 97) is wrong on all three axes: 109/26/83 claimed vs. **123/24/99** actual. This is the doc's headline "walked and classified" number and it's off by 14/−2/16. Every downstream classification total in §1 that sums to 83 non-spec / 26 spec should be treated as suspect until re-derived against the real 99/24 split — the doc does not account for the missing files (likely reclassifying nothing wrong per se, but 16 non-spec files are simply missing from the walk).
- `RolandV8HDConnector.ts:130` (line 205) → actual line is **132**, off by 2.

---

## obs-websocket-v5.md

Extensively verified against `ObsConnector.ts` (248 lines) and `ObsConnector.spec.ts` (660 lines), both read in full.

| claim | stated | actual | OK/WRONG |
|---|---|---|---|
| `ObsConnector.ts` total lines | ~248 | 248 (ends `export default ObsConnector` at line 248) | OK |
| `ObsConnector.spec.ts` total lines | ~660 | 660 | OK |
| `isConnected()` body | lines 242–244 | `return this.obs !== undefined && this.connected` at 242–244 | OK |
| Event-handler `.on(...)` line map (31 `error`, 34 `SwitchScenes`, 38 `ScenesChanged`, 42 `SceneItemRemoved`, 46 `SceneItemAdded`, 50 `SceneItemVisibilityChanged`, 54/58 `SceneCollectionChanged`/`ListChanged`, 62/66 `TransitionBegin`/`End`, 70 `PreviewSceneChanged`, 74 `StudioModeSwitched`, 86/91 `StreamStarting`/`Stopped`, 96/101/106/111 recording events, 116 `StreamStatus`, 122/128/135/138 connect/close/removeAllListeners, 152/155/163 preview/scene updates, 237 `disconnect()`) | every line cited | every single one matches exactly on direct read | OK |
| `waitUntil` helper (spec lines 5–13) — `setInterval` every 100ms, resolves inside, no `clearInterval`, no timeout/reject | quoted verbatim | matches exactly | OK |
| 20 call sites are reference-inequality no-ops (`!== [array literal]`, always true) | lines 290, 317, 339, 378, 382, 404, 409, 431, 433, 520, 549, 555, 584, 590, 596, 602, 631, 637, 643, 649 | all 20 confirmed as `waitUntil(() => x !== [literal])` no-op pattern | OK |
| Correctly excludes lines 460/490 from the no-op list (real numeric `.length !== 2` checks) | excluded | confirmed genuinely meaningful, correctly excluded | OK |
| `notifyChanged()` reads `this.embeddedScenes[scene] \|\| []` | present, backs the flag-off fallback claim | confirmed at lines 213 and 223 | OK |
| §8 corrections to plan file (~line numbers 103, 135, 136, 138, 139, 141, 260, 261) | 7 corrections + several affirmed-accurate plan claims | not independently re-checked against the plan file this session (plan file `~/.claude/plans/soft-wishing-boot.md` is oversized and was not opened) — **UNVERIFIED** | UNVERIFIED |
| `MixerCommunicator.ts:7-13` — `haveValuesChanged` | not checked this session | — | UNVERIFIED |
| `ObsConfiguration.ts` claims (password-free storage, `ObsConfigurationSaveType` 3 keys lines 5-9, `defaultPort` line 80 = `ipPort(4444)`) | — | not checked this session | UNVERIFIED |
| `ObsSettings.tsx` line claims (~52, 58-59, :17, :44) | — | `ObsSettings.tsx:8` import confirmed via grep this session (matches module-split.md's claim independently); the specific line numbers for description text/`ValidatingInput`/`useObsConfiguration()`/`socket.emit` calls not individually re-checked | UNVERIFIED (partial) |
| `cypress/integration/configObs.spec.ts` claims (60 lines, asserts only on obs-ip/obs-port/obs-liveMode/obs-submit, lines 19-59) | — | not opened this session | UNVERIFIED |

**Corrections needed:** none found among the extensively-checked portions (connector/spec line maps, waitUntil analysis, no-op list). This doc is unusually precise on everything actually re-derived.

---

## native-deps.md

| claim | stated | actual | OK/WRONG |
|---|---|---|---|
| `package.json` already lists `@julusian/midi ^3.7.2` | yes | confirmed, `hub/package.json` line 6 | OK |
| `NodeMcuConnector.ts:96` — `__dirname + "/../../esp8266"` | quoted | matches exactly | OK |
| `NodeMcuConnector.ts:97` — `.catch()` fallback | quoted | matches exactly (`const files = await fs.readdir(dirName).catch(e => {`) | OK |
| `NodeMcuConnector.ts:98` — dev-mode fallback `../../../tally/out` | quoted | matches exactly | OK |
| `NodeMcuConnector.ts:8-22` — `loadNodemcuLib()`/stub | span | function spans exactly lines 8–22 | OK |
| `NodeMcuConnector.ts:214-217` — `errorMessage` catch block | span | `catch (e) {` at 214, `tallyDevice.errorMessage = e` at 215, closes 217 | OK |
| `NodeMcuConnector.ts:333-355` — `hardReset` | span | `private async hardReset(path: string) {` at 333, closes at 355 | OK |
| `NodeMcuConnector.ts` total length | "380 lines" (stated twice, §2 intro and "why not (b)") | **410 lines** (file ends `export default NodeMcuConnector` at line 410) | **WRONG** |
| `nodemcu-tool` talks to device through exactly one file (`lib/transport/serialport.js`); `serial-terminal.js` is dead code, only reachable from the unused CLI entry point | import-graph claim | plausible and internally consistent with the described entry-point chain, but the actual `node_modules/nodemcu-tool/lib/*.js` files were not opened this session to trace the require graph directly | UNVERIFIED |
| §1 fix for `RolandV8HDConnector.ts:1`: "one-line import swap: `import midi from 'midi'` → `import midi from '@julusian/midi'`" | presented as a still-needed fix, default import | **Real file already has this done, but differently**: line 3 currently reads `import * as midi from '@julusian/midi'` (namespace import, not default) — matches `BASELINE.md` Deviation #6, which explicitly records this swap as *already applied* and explains `@julusian/midi` ships no default export, so a namespace import was required, not the default-import form this doc prescribes | **WRONG** — both stale (already done) and syntactically wrong (default import would not compile; the package has no default export, as the doc's own §1 API-surface table implicitly assumes but never states) |
| `npm ci`/`EUSAGE` lockfile mismatch for `nodemcu-tool` (referenced via `BASELINE.md` deviation #2) | quoted framing | corroborated by `BASELINE.md`'s own text (§ Deviations #2), which independently documents the identical `EUSAGE`/lockfile-mismatch failure | OK (via `BASELINE.md`, not by running `npm ci` myself) |
| `npm view @julusian/midi`, `npm install ... zero compilation` scratch-dir verification claims | — | not independently re-run (would require live npm install — out of scope for read-only verification); `BASELINE.md` independently corroborates the general shape (prebuilt N-API binaries, no compile step) for the real `hub/` install | UNVERIFIED (not independently re-run), but consistent with `BASELINE.md` |
| `nodemcu-tool` patch verification (§ "verification results", diff line counts, `listDevices()` live results, hardware-gated items honestly marked) | — | not independently re-run (scratch-dir clone/patch, npm installs — destructive/out of scope); internally consistent and appropriately marks hardware-gated items as unverifiable | UNVERIFIED (not independently re-run) |

**Corrections needed**
- "380 lines" (§2, two mentions) → actual **410 lines**.
- The `RolandV8HDConnector.ts:1` fix description is stale and syntactically wrong: the swap is already live in the source (confirmed by direct read), and the doc's prescribed replacement (`import midi from '@julusian/midi'`, a default import) does not match what's actually needed or present (`import * as midi from '@julusian/midi'`, a namespace import — the package has no default export). Anyone reading only this section of `native-deps.md` would apply a fix that (a) is redundant and (b) wouldn't compile.

---

## Cross-doc contradictions

None found between `module-split.md`, `obs-websocket-v5.md`, and `native-deps.md` on overlapping topics (both docs' independent references to `ObsConnector.ts`'s line numbers and 248-line length agree; module-split.md's and native-deps.md's references to `NodeMcuConnector.ts`'s internal line numbers agree with each other, though both are silent on/wrong about its total length independently in different ways — module-split.md doesn't state a total for this specific file, so this isn't a disagreement between the two, just an isolated error in native-deps.md).

One inconsistency worth flagging even though it's not strictly a *disagreement between two of the three in-scope docs*: `native-deps.md` (in-scope) contradicts `BASELINE.md` (out-of-scope reference doc, not one of the four assigned files, but read here as corroborating evidence) on the state of the `RolandV8HDConnector.ts` midi import — `native-deps.md` §1 presents the `@julusian/midi` import swap as a fix yet to be applied, while `BASELINE.md` Deviation #6 documents it as already applied (with a different, correct import form). Both positions quoted above under native-deps.md's WRONG row.

---

## Summary

- **module-split.md**: one high-confidence, high-impact WRONG (file-count table, off by 14/2/16 files) plus one line-number WRONG (`RolandV8HDConnector.ts` ID at 132, not 130). Everything else checked — including the more nuanced Settings.tsx `.ID`-import claims, which are actually correct and more careful than a skim would suggest — held up exactly.
- **obs-websocket-v5.md**: no errors found in the extensively-checked connector/spec line maps and waitUntil analysis (the highest-value, most re-derivable claims in the doc). Several lower-priority claims (ObsConfiguration.ts, ObsSettings.tsx exact lines, cypress spec, §8 plan-file corrections) were not re-checked this session and are marked UNVERIFIED rather than assumed correct.
- **native-deps.md**: one factual WRONG (410 vs. 380 lines) and one stale/incorrect prescriptive WRONG (the midi import "fix" is already done, and done differently than prescribed). The nodemcu-tool internal require-graph and live-verification claims are internally plausible but UNVERIFIED (not independently re-traced/re-run this session).
