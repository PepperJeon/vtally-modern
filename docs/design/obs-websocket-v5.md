# obs-websocket-js v4 → v5 migration design

Unit 2c of `~/.claude/plans/soft-wishing-boot.md`. Target: `hub/src/mixer/obs/ObsConnector.ts` (248 lines) and `ObsConnector.spec.ts` (660 lines).

All API claims below were verified against:
- obs-websocket protocol 5 reference (`obsproject/obs-websocket@master docs/generated/protocol.md`)
- obs-websocket C++ source (`src/utils/Obs_ArrayHelper.cpp`, `src/utils/Json.h`) for field shapes the protocol doc leaves as `Array<Object>`
- `obs-websocket-js@5.0.8` package metadata, `src/base.ts`, and the published typings

Nothing here is from memory.

---

## 0. Packaging facts that constrain everything else

`npm view obs-websocket-js@5.0.8 exports`:

```json
{
  ".": {
    "import":  { "default": "./dist/msgpack.js" },
    "browser": { "default": "./dist/json.js" },
    "require": { "default": "./dist/msgpack.cjs" }
  },
  "./json":    { "import": "./dist/json.js",    "require": "./dist/json.cjs" },
  "./msgpack": { "import": "./dist/msgpack.js", "require": "./dist/msgpack.cjs" }
}
```

**The bare specifier `'obs-websocket-js'` resolves to the msgpack client under both `require` and `import` in Node.** The connector runs under Node (`tsconfig.server.json`, CJS), so a plain port would give us a client that negotiates the `obswebsocket.msgpack` subprotocol and sends `@msgpack/msgpack`-encoded binary frames. A hand-rolled `ws` mock speaking JSON would never handshake.

> **Decision: import from `'obs-websocket-js/json'`, not `'obs-websocket-js'`.**
> ```ts
> import OBSWebSocket, { EventSubscription, OBSWebSocketError } from 'obs-websocket-js/json'
> ```
> This is also what makes the test harness in §5 possible at all. msgpack buys nothing here — the connector exchanges a few hundred bytes per scene switch.

Second constraint, from `obs-websocket-js/src/base.ts:200-215`:

```ts
this.socket = new WebSocketIpml(url, this.protocol)
...
const protocol = this.socket?.protocol;
if (!protocol) {
    throw new OBSWebSocketError(-1, 'Server sent no subprotocol');
}
if (protocol !== this.protocol) {
    throw new OBSWebSocketError(-1, 'Server sent an invalid subprotocol');
}
```

**The mock server must echo the `obswebsocket.json` subprotocol** (`new WebSocket.Server({ handleProtocols: () => 'obswebsocket.json' })`). Omitting this is the single most likely way the new spec fails with an opaque error. See §5.

Third: `obs-websocket-js@5` declares `"engines": { "node": ">16.0" }`. Root `package.json` currently declares `"engines": { "node": ">=12" }` — bump it in the same commit.

Fourth: transitive deps are `ws@^8`, `crypto-js`, `eventemitter3@5`, `isomorphic-ws`, `@msgpack/msgpack`, `type-fest`, `debug`. No native modules; nothing new leaks into the client bundle beyond what v4 already leaked.

---

## 1. Full event / request mapping

`obs.send(x)` becomes `obs.call(x)`. `obs.on(...)` event names all change. Payload keys move from `kebab-case` to `camelCase` and gain `*Uuid` siblings we ignore.

### 1a. Events

| # | Line | v4 event + payload used | v5 event | v5 payload | Semantics changed? |
|---|------|-------------------------|----------|------------|--------------------|
| 1 | 31 | `'error'` (with `@ts-ignore` for [issue #203](https://github.com/haganbmj/obs-websocket-js/issues/203)) | `'ConnectionError'` | `OBSWebSocketError` (`{code, message}`) | Yes — properly typed in v5, **delete the `@ts-ignore` on line 30**. `'ConnectionOpened'` also now exists. |
| 2 | 34 | `SwitchScenes` → `data["scene-name"]` | `CurrentProgramSceneChanged` | `{sceneName: string, sceneUuid: string}` | **Yes, materially.** See §2 — the *timing* of this event relative to a transition is the crux of the whole redesign. |
| 3 | 38 | `ScenesChanged` (no payload used) | `SceneListChanged` | `{scenes: Array<{sceneName, sceneUuid, sceneIndex}>}` | Yes — v5 hands you the list, so the follow-up `GetSceneList` is now optional for the channel list (still needed for the current-scene resync). Note keys are `sceneName`, **not** `name`. |
| 4 | 42 | `SceneItemRemoved` | `SceneItemRemoved` | `{sceneName, sceneUuid, sourceName, sourceUuid, sceneItemId}` | Name unchanged, payload fully renamed. Now carries `sceneName` → enables *targeted* cache invalidation (§3). |
| 5 | 46 | `SceneItemAdded` | `SceneItemCreated` | `{sceneName, sceneUuid, sourceName, sourceUuid, sceneItemId, sceneItemIndex}` | Renamed. |
| 6 | 50 | `SceneItemVisibilityChanged` | `SceneItemEnableStateChanged` | `{sceneName, sceneUuid, sceneItemId, sceneItemEnabled: boolean}` | Renamed. Note it gives `sceneItemId`, not `sourceName` — you cannot patch the cache in place from the payload alone, you must refetch that one scene. |
| 7 | 54 | `SceneCollectionChanged` | `CurrentSceneCollectionChanged` | `{sceneCollectionName: string}` | Renamed. |
| 8 | 58 | `SceneCollectionListChanged` | `SceneCollectionListChanged` | `{sceneCollections: string[]}` | Unchanged name. Fires when collections are added/removed/renamed — does *not* imply the active scene list changed. Keeping the existing full-resync handler is correct but wasteful; harmless. |
| 9 | 62 | `TransitionBegin` → `data["from-scene"]`, `data["to-scene"]` | `SceneTransitionStarted` | `{transitionName: string, transitionUuid: string}` | **Yes — scene names are gone.** This is risk #1 in the plan. See §2. |
| 10 | 66 | `TransitionEnd` → `data["to-scene"]` | `SceneTransitionEnded` | `{transitionName: string, transitionUuid: string}` | **Yes — scene names gone, plus the protocol doc states verbatim: "Note: Does not appear to trigger when the transition is interrupted by the user."** This forces a watchdog. See §2.5. |
| 11 | 70 | `PreviewSceneChanged` → `data["scene-name"]` | `CurrentPreviewSceneChanged` | `{sceneName: string, sceneUuid: string}` | Renamed only. |
| 12 | 74 | `StudioModeSwitched` → `data["new-state"]` | `StudioModeStateChanged` | `{studioModeEnabled: boolean}` | Renamed only. Known OBS quirk ([obs-websocket#1150](https://github.com/obsproject/obs-websocket/issues/1150)): turning studio mode *off* emits **two** `CurrentProgramSceneChanged` events. Harmless here — `MixerCommunicator.haveValuesChanged` (`MixerCommunicator.ts:7-13`) already dedups. |
| 13 | 86 | `StreamStarting` | `StreamStateChanged` w/ `outputState` ∈ `{OBS_WEBSOCKET_OUTPUT_STARTING, STARTED}` | `{outputActive: boolean, outputState: string}` | **Merged.** 1 event replaces 2. Use `outputActive` directly; do not switch on `outputState`. |
| 14 | 91 | `StreamStopped` | `StreamStateChanged` w/ `outputActive: false` | same | Merged. |
| 15 | 96 | `RecordingStarting` | `RecordStateChanged` | `{outputActive: boolean, outputState: string, outputPath: string\|null}` | Merged, **but pause is not expressible via `outputActive`** — see next two rows. |
| 16 | 101 | `RecordingStopped` | `RecordStateChanged` w/ `outputActive: false` | same | Merged. |
| 17 | 106 | `RecordingPaused` → sets `isRecording = false` | `RecordStateChanged` w/ `outputState === 'OBS_WEBSOCKET_OUTPUT_PAUSED'` | same | **Yes.** `outputActive` stays `true` while paused. To preserve v4 behavior (paused ⇒ not on air) you must special-case `outputState`. Added in obs-websocket v5.1.0 — older 5.0.x servers won't send it. |
| 18 | 111 | `RecordingResumed` → sets `isRecording = true` | `RecordStateChanged` w/ `outputState === 'OBS_WEBSOCKET_OUTPUT_RESUMED'` | same | Same caveat. |
| 19 | 116 | `StreamStatus` → `data.streaming`, `data.recording` | **NO v5 EQUIVALENT** | — | **Deleted with no replacement.** v4 pushed this every ~2s and it was the *only* thing that established initial streaming/recording state at connect — `connect()` (lines 128-141) never queried it. In v5 you **must** call `GetStreamStatus` + `GetRecordStatus` explicitly on connect, otherwise `liveMode: "stream"`/`"record"`/`"streamOrRecord"` starts wrong and stays wrong until the operator toggles something. See §8, Correction 1. |
| 20 | 135 | `ConnectionClosed` (no payload) | `ConnectionClosed` | `OBSWebSocketError` | Name unchanged. Still fires on a *deliberate* `disconnect()`, so the existing "remove the listener before disconnecting" trick (lines 138, 237) remains necessary — or use an explicit flag (§4.3). |

Events with **no v4 counterpart** that the new design needs:

| v5 event | Payload | Why we need it |
|---|---|---|
| `SceneCreated` | `{sceneName, sceneUuid, isGroup}` | `embeddedScenes` cache invalidation (§3). |
| `SceneRemoved` | `{sceneName, sceneUuid, isGroup}` | Same. |
| `SceneNameChanged` | `{sceneUuid, oldSceneName, sceneName}` | Same — a rename changes channel IDs, and `SceneListChanged` does not reliably cover it. |
| `Identified` | `{negotiatedRpcVersion}` | Optional; `connect()` already resolves with this. |

Explicitly **not** used:
- `SceneTransitionVideoEnded` — fires *before* `CurrentProgramSceneChanged` for stingers (see the timeline in §2.2), so clearing transition state on it would blank the outgoing tally too early. Do not wire it.
- `SceneItemListReindexed` — reorder only, no membership change.
- `CurrentSceneTransitionChanged` / `CurrentSceneTransitionDurationChanged` — only relevant if you later drive the watchdog from the real transition duration (§2.5).

### 1b. Requests

| Line | v4 | v5 | Response shape | Notes |
|---|---|---|---|---|
| 155 | `send("GetPreviewScene")` → `data.name` | `call('GetCurrentPreviewScene')` | `{sceneName, sceneUuid, currentPreviewSceneName, currentPreviewSceneUuid}` | Still errors when studio mode is off (`code 506 StudioModeNotActive`), so the existing swallow-the-error pattern (lines 158-160) still works. **Better:** call `GetStudioModeEnabled` → `{studioModeEnabled: boolean}` first and skip the call, so studio mode becomes explicit state instead of an inferred error (§2 needs `studioMode` tracked anyway). |
| 163 | `send("GetSceneList")` → `data.scenes[].name`, `data["current-scene"]` | `call('GetSceneList')` | `{currentProgramSceneName, currentProgramSceneUuid, currentPreviewSceneName, currentPreviewSceneUuid, scenes: Array<{sceneName, sceneUuid, sceneIndex}>}` | **Two changes.** (a) `scene.name` → `scene.sceneName`. (b) `scenes[].sources` **no longer exists** — this is what breaks `embeddedScenes` (§3). Bonus: `currentPreviewSceneName` is returned here too (`null` when studio mode is off), so one call can seed program *and* preview. |
| 128 | `connect({address: "ip:port"})` | `connect(url, password, {rpcVersion: 1})` | `{obsWebSocketVersion, negotiatedRpcVersion}` | §4. |
| — | (implicit `GetAuthRequired` handshake inside v4) | none — Hello/Identify is internal to `connect()` | — | The mock still has to *serve* the handshake (§5). |
| — | n/a | `call('GetSceneItemList', {sceneName})` | `{sceneItems: JsonObject[]}` | **New requirement** for `embeddedScenes`. Element shape in §3.1. |
| — | n/a | `call('GetStreamStatus')` | `{outputActive, outputReconnecting, outputTimecode, outputDuration, outputCongestion, outputBytes, outputSkippedFrames, outputTotalFrames}` | **New requirement**, replaces the deleted `StreamStatus` event. |
| — | n/a | `call('GetRecordStatus')` | `{outputActive, outputPaused, outputTimecode, outputDuration, outputBytes}` | **New requirement.** Note `outputPaused` is a distinct boolean — use `outputActive && !outputPaused` to match v4's `isRecording`. |
| — | n/a | `call('GetStudioModeEnabled')` | `{studioModeEnabled: boolean}` | New, recommended (see `GetPreviewScene` row). |

`callBatch(requests)` exists and sends OpCode 8 / receives OpCode 9. Used in §3 for the N-scene fetch.

---

## 2. The transition state machine

### 2.1 What v4 did

```ts
// ObsConnector.ts:62-69
this.obs.on('TransitionBegin', data => {
    this.notifyProgramChanged([data["from-scene"], data["to-scene"]].filter(scene => scene))
})
this.obs.on('TransitionEnd', data => {
    this.notifyProgramChanged([data["to-scene"]])
})
```

The whole tally correctness argument rested on OBS handing us both scene names. **In v5 both payloads are `{transitionName, transitionUuid}` and contain no scene information whatsoever.** Every name must now be derived from state the connector maintains itself.

### 2.2 Observed v5 event ordering

From [obs-studio#7219](https://github.com/obsproject/obs-studio/issues/7219), a logged real transition (stinger):

```
1. CurrentSceneTransitionChanged
2. SceneTransitionStarted
3. SceneTransitionVideoEnded
4. CurrentProgramSceneChanged     ← the cut point, NOT the transition start
5. SceneTransitionEnded
```

So `CurrentProgramSceneChanged` arrives **inside** the transition window, at the cut. This maps almost exactly onto v4's mock ordering (`ObsConnector.spec.ts:100-109`: `transitionEnd()` sends `SwitchScenes` and *then* `TransitionEnd`) — which is a happy accident that makes the port tractable.

⚠️ For a **plain fade with studio mode off**, whether `CurrentProgramSceneChanged` arrives at the start or at the cut is **not** established by any source I could verify. See Open Question OQ-1. The design below is deliberately **order-independent** so it stays correct either way.

### 2.3 State the connector must now own

Replace the free-floating `programScenes: string[]` (line 20) with:

```ts
private studioMode = false                       // GetStudioModeEnabled / StudioModeStateChanged
private programScene: string | null = null       // authoritative current program
private previewScene: string | null = null       // null whenever studioMode === false
private transitionFrom: string | null = null     // non-null ⟺ a transition is in flight
private transitionTo:   string | null = null     // best-effort destination, studio mode only
private transitionWatchdog: NodeJS.Timeout | null = null
```

and derive what `notifyChanged()` (line 208) consumes:

```ts
/** every scene that is on air at this instant, in v4's [from, to] order */
private get programScenes(): string[] {
    return [this.transitionFrom, this.transitionTo, this.programScene]
        .filter((s): s is string => s !== null)
        .filter((s, i, a) => a.indexOf(s) === i)   // dedup, preserve order
}
private get previewScenes(): string[] {
    return this.previewScene === null ? [] : [this.previewScene]
}
```

Everything downstream — `notifyChanged()` (208-230), `shouldProgramBeShownAsPreview()` (193-206), `embeddedScenes` expansion (211-224) — is **unchanged**. The `Connector` contract (`interfaces.ts:9-13`) and the `MixerCommunicator` call surface are untouched.

The union is what makes the design robust: whether `programScene` updates early or late, `transitionFrom` keeps the outgoing scene lit for the whole transition window, and the incoming scene lights up at whichever of `transitionTo` / `programScene` lands first.

### 2.4 State table

`P` = `programScene`, `V` = `previewScene`, `F` = `transitionFrom`, `T` = `transitionTo`, `S` = `studioMode`.
"reports" = the `programs` argument reaching `MixerCommunicator.notifyProgramPreviewChanged` **before** `embeddedScenes` expansion and **before** the `liveMode` program↔preview swap (both applied unchanged by `notifyChanged()`).

| # | Event | Guard | State transition | Reports (program) | Reports (preview) |
|---|---|---|---|---|---|
| 1 | connect resolved | — | full resync (§2.6): set `S`, `P`, `V`; `F=T=null` | `[P]` | `S ? [V] : []` |
| 2 | `CurrentProgramSceneChanged` | `F === null` (a cut) | `P := sceneName` | `[P]` | unchanged |
| 3 | `CurrentProgramSceneChanged` | `F !== null` (mid-transition) | `P := sceneName` | `[F, T?, P]` deduped | unchanged |
| 4 | `CurrentPreviewSceneChanged` | — | `V := sceneName` | unchanged | `[V]` |
| 5 | `SceneTransitionStarted` | `F === null`, `S === true` | `F := P`; `T := V`; arm watchdog | `[F, T]` | `[V]` |
| 6 | `SceneTransitionStarted` | `F === null`, `S === false` | `F := P`; `T := null`; arm watchdog | `[F]` | `[]` |
| 7 | `SceneTransitionStarted` | `F !== null` (**interrupt**) | `F := P` (P is now the scene we cut to on the aborted transition); `T := S ? V : null`; re-arm watchdog | `[F, T?]` | `S ? [V] : []` |
| 8 | `SceneTransitionEnded` | — | `F := null`; `T := null`; clear watchdog | `[P]` | unchanged |
| 9 | **watchdog fires** (10 s) | `F !== null` | `F := null`; `T := null`; `console.warn` | `[P]` | unchanged |
| 10 | `StudioModeStateChanged {true}` | — | `S := true`; `call('GetCurrentPreviewScene')` → `V` | unchanged | `[V]` |
| 11 | `StudioModeStateChanged {false}` | — | `S := false`; `V := null`; `T := null` | `[F?, P]` | `[]` |
| 12 | `ConnectionClosed` | — | `F=T=V=P=null`; clear watchdog; `notifyMixerIsDisconnected()` | — | — |

Notes on the non-obvious rows:

- **Row 3** is the exact v4 `TransitionBegin` behavior (`[from, to]`), just reached one event later. `T` and `P` are normally equal in studio mode, and the dedup collapses them.
- **Row 7** is the case `ObsConnector.spec.ts:415-438` ("it does not crash when a transition is aborted") covers. In OBS, starting a transition while one is running performs an immediate cut to the pending scene and begins a new transition. Because `CurrentProgramSceneChanged` for that forced cut fires before/with the second `SceneTransitionStarted`, taking `F := P` at that moment captures the correct outgoing scene. If `P` has *not* yet updated, `F := P` is a no-op and the union still holds both — never wrong, at worst one extra scene lit for the transition duration.
- **Row 9** exists solely because of the protocol doc's verbatim note on `SceneTransitionEnded`: *"Does not appear to trigger when the transition is interrupted by the user."* Without it a single interrupted transition pins the outgoing scene on air **forever**. This is the highest-severity failure mode in the whole unit.
- **Row 11**: the OBS bug that emits two `CurrentProgramSceneChanged` on studio-mode-off is absorbed by `MixerCommunicator`'s dedup. No guard needed in the connector.

### 2.5 Watchdog

```ts
// ponytail: fixed ceiling instead of reading the real transition duration.
// SceneTransitionEnded does not fire on user-interrupted transitions, so without
// this the outgoing scene stays lit forever. Upgrade path if 10s is ever too
// coarse: GetCurrentSceneTransition → transitionDuration, refreshed on
// CurrentSceneTransitionChanged / CurrentSceneTransitionDurationChanged.
const transitionWatchdogMs = 10_000
```

10 s is far longer than any sane transition (default 300 ms; stingers up to ~3 s) so it never fires during normal operation, and short enough that a stuck tally self-heals before an operator files a ticket. Must be cleared in `disconnect()` alongside `reconnectTimeout` (line 233).

### 2.6 Full resync (rows 1 and 12)

On every successful connect **and** every reconnect, rebuild from scratch — never carry transition state across a socket:

```ts
const [{ scenes, currentProgramSceneName, currentPreviewSceneName },
       { studioModeEnabled },
       { outputActive: streaming },
       { outputActive: recActive, outputPaused }] = await Promise.all([
    obs.call('GetSceneList'),
    obs.call('GetStudioModeEnabled'),
    obs.call('GetStreamStatus'),
    obs.call('GetRecordStatus'),
])
this.studioMode    = studioModeEnabled
this.programScene  = currentProgramSceneName ?? null
this.previewScene  = studioModeEnabled ? (currentPreviewSceneName ?? null) : null
this.transitionFrom = this.transitionTo = null
this.isStreaming   = streaming
this.isRecording   = recActive && !outputPaused
```

**Reconnect mid-transition therefore lands on the post-transition steady state**, which is the only defensible answer: we cannot know what OBS was doing while we were disconnected, and after a reconnect OBS's `currentProgramSceneName` is authoritative.

`currentProgramSceneName` is documented as nullable ("Can be `null` if non-main canvas or internal state desync") — hence `?? null` and the `filter` in the `programScenes` getter. v4's line 169 `if (data["current-scene"])` guard was doing the same job.

### 2.7 Accepted regression

With studio mode **off**, if OBS turns out to emit `CurrentProgramSceneChanged` at the cut point (OQ-1), the incoming scene lights up ~1 transition duration later than under v4, which had `to-scene` at `TransitionBegin`. There is no fix: at `SceneTransitionStarted` the destination is not in the payload, and `GetCurrentProgramScene` would return the *old* scene. Magnitude ≈ 300 ms for a default fade. Studio mode — the mode that actually matters for tally — is unaffected, because `transitionTo := previewScene` gives us the destination immediately (row 5).

---

## 3. `embeddedScenes` replacement

### 3.1 What v4 did and why it no longer works

```ts
// ObsConnector.ts:15
embeddedScenes: {} = {}

// ObsConnector.ts:178-183
private updateEmbeddedScenes(scenes: OBSWebSocket.Scene[]) {
    this.embeddedScenes = {}
    scenes.forEach(scene => {
        this.embeddedScenes[scene.name] = scene.sources
            .filter(source => source.type === "scene" && source.render === true)
            .map(source => source.name)
    })
}

// ObsConnector.ts:211-224 — consumed here
this.programScenes.forEach(scene => {
    programs.push(scene)
    programs.push(...(this.embeddedScenes[scene] || []))
})
```

v4's `GetSceneList` returned each scene with a nested `sources` array. **v5's `GetSceneList` returns `scenes: Array<{sceneName, sceneUuid, sceneIndex}>` — no `sources` key at all.** One request no longer yields the graph.

Replacement source of truth is `GetSceneItemList`. The protocol doc types the response as `sceneItems: Array<Object>`; the concrete element shape comes from `obs-websocket/src/utils/Obs_ArrayHelper.cpp:160-190`:

```jsonc
{
  "sceneItemId": 3,
  "sceneItemIndex": 0,
  "sceneItemEnabled": true,
  "sceneItemLocked": false,
  "sceneItemTransform": { /* ... */ },
  "sceneItemBlendMode": "OBS_BLEND_NORMAL",
  "sourceName": "Cam 1",
  "sourceUuid": "…",
  "sourceType": "OBS_SOURCE_TYPE_SCENE",   // string, not int — Json.h:27-32
  "inputKind": null,                        // null when sourceType is not _INPUT
  "isGroup": false                          // null when sourceType is not _SCENE
}
```

`sourceType` is a *string* enum, confirmed by `NLOHMANN_JSON_SERIALIZE_ENUM(obs_source_type, {{OBS_SOURCE_TYPE_SCENE, "OBS_SOURCE_TYPE_SCENE"}, …})` in `src/utils/Json.h:27-32`. Do not compare against an integer.

The v4 → v5 predicate translation:

| v4 | v5 |
|---|---|
| `source.type === "scene"` | `item.sourceType === 'OBS_SOURCE_TYPE_SCENE' && item.isGroup === false` |
| `source.render === true` | `item.sceneItemEnabled === true` |
| `source.name` | `item.sourceName` |

The `isGroup === false` clause is new and necessary: OBS groups are *also* `OBS_SOURCE_TYPE_SCENE`, and a group is not a tally-visible scene. (Group *members* are still not traversed — matching v4, which never recursed either. Carried-over limitation, called out in OQ-4.)

### 3.2 When to fetch

```ts
private async rebuildEmbeddedScenes(sceneNames: string[]) {
    const results = await this.obs.callBatch(
        sceneNames.map(sceneName => ({ requestType: 'GetSceneItemList', requestData: { sceneName } }))
    )
    sceneNames.forEach((sceneName, i) => {
        const res = results[i]
        if (!res.requestStatus.result) { this.embeddedScenes[sceneName] = []; return }
        this.embeddedScenes[sceneName] = (res.responseData.sceneItems as any[])
            .filter(item => item.sourceType === 'OBS_SOURCE_TYPE_SCENE'
                         && item.isGroup === false
                         && item.sceneItemEnabled === true)
            .map(item => item.sourceName as string)
    })
    this.notifyChanged()
}
```

`callBatch` (OpCode 8 / 9) collapses N requests into **one round trip**. Use it — it is the difference between "acceptable" and "fallback needed".

### 3.3 Invalidation table

| Event | Scope | Action |
|---|---|---|
| connect / reconnect | all | full rebuild after the §2.6 resync |
| `SceneListChanged` | all | full rebuild (membership of the *set of scenes* changed) |
| `SceneCreated` | one | rebuild `{sceneName}` |
| `SceneRemoved` | one | `delete embeddedScenes[sceneName]`, **no request** |
| `SceneNameChanged` | one | `delete embeddedScenes[oldSceneName]`, rebuild `{sceneName}` |
| `CurrentSceneCollectionChanged` | all | **clear the whole map first**, then full rebuild — names from the old collection must not survive |
| `SceneItemCreated` | one | rebuild `{event.sceneName}` |
| `SceneItemRemoved` | one | rebuild `{event.sceneName}` |
| `SceneItemEnableStateChanged` | one | rebuild `{event.sceneName}` — the payload carries `sceneItemId`, not `sourceName`, so an in-place patch is not possible |
| `SceneItemListReindexed` | — | **ignore** (ordering only) |
| `SceneCollectionListChanged` | — | **ignore** for the cache (only the *list* of collections changed) |

Debounce the per-scene rebuild with a 100 ms trailing timer keyed by scene name. `SceneItemEnableStateChanged` fires once per eyeball click and an operator toggling a stack of sources would otherwise generate a burst of round trips. Clear pending timers in `disconnect()`.

### 3.4 Cost at connect, 50-scene collection

Per-request payload is ~80 bytes; a scene item is 400–600 bytes serialized (`sceneItemTransform` dominates). A 50-scene collection with ~6 items each:

| Strategy | Round trips | Wire bytes | localhost | LAN (~1 ms RTT) | Wi-Fi (~20 ms RTT) |
|---|---|---|---|---|---|
| 50 × `call()` sequential | 50 | ~150 KB | ~50–150 ms | ~200 ms | **~1.0 s** |
| 50 × `call()` (JS-parallel, one socket) | 1 socket flush | ~150 KB | ~20 ms | ~30 ms | ~60 ms |
| **`callBatch` (recommended)** | **1** | ~150 KB | **~20 ms** | **~30 ms** | **~60 ms** |

The connector already runs on a background socket and the first `notifyChanged()` fires from the §2.6 resync **before** the embedded-scene rebuild completes, so this latency does not delay basic tally at all — it only delays embedded scenes lighting up. 60 ms worst case is a non-issue.

> `sceneItemTransform` is ~2/3 of the payload and we never read it. There is no way to request a projection, so this is accepted. If a pathological collection (500+ scenes) ever appears, the fix is the flag in §3.5, not micro-optimization.

### 3.5 Fallback, and: can this ship disabled?

**Yes. `embeddedScenes` can ship disabled without breaking core tally.** Proof from the existing code: `notifyChanged()` reads it as `this.embeddedScenes[scene] || []` at lines 213 and 223. With the map permanently empty, both expansions become no-ops and `programs`/`previews` reduce to exactly the scene names OBS reported. Every non-nested scene — i.e. the overwhelming majority of real setups — behaves identically. Only "Cam 1 is also lit because it appears inside the live Picture-In-Picture scene" is lost.

Recommended shape:

```ts
// ObsConfiguration
detectEmbeddedScenes: boolean = true
```

Ship it **on**. If real-world OBS instances show the rebuild is a problem, flipping it off is a one-line config change with a well-understood, contained degradation. Do **not** build a partial/lazy mode — that is speculative complexity for a cost we have already bounded at ~60 ms.

---

## 4. Connection, auth, reconnect

### 4.1 v4 → v5 handshake

v4 (`ObsConnector.ts:128`):
```ts
this.obs.connect({address: `${ip}:${port}`})
```
Internally: connect → `GetAuthRequired` → optional `Authenticate`.

v5:
```ts
await this.obs.connect(url, password, { rpcVersion: 1 })
```
Internally: TCP+WS upgrade (subprotocol `obswebsocket.json`) → server sends `Hello` (op 0, may carry `authentication: {challenge, salt}`) → client sends `Identify` (op 1, with SHA256 auth string and `eventSubscriptions`) → server sends `Identified` (op 2, `{negotiatedRpcVersion}`). The promise resolves with `{obsWebSocketVersion, negotiatedRpcVersion}`.

Pass `{rpcVersion: 1}` explicitly. Leave `eventSubscriptions` at its default (`EventSubscription.All`) — every event we need is a normal-volume event; none of the high-volume ones are relevant.

### 4.2 URL construction and the password gap

`ObsConfiguration.ts` stores **`ip` (`IpAddress`), `port` (`IpPort`), and `liveMode` — and nothing else. There is no password field.** `ObsConfigurationSaveType` (lines 5-9) has exactly three keys. **A password field must be added.**

Required changes to `ObsConfiguration.ts`:

```ts
export type ObsConfigurationSaveType = {
    ip: string
    port: number
    liveMode?: ObsConfigurationLiveMode
    password?: string          // ← new, optional so existing configs load unchanged
}

password: string = ""          // "" ⇒ no auth

// in fromJson(), after line 29:
this.loadString("password", this.setPassword.bind(this), data)

// in toJson():  password: this.password,

setPassword(password: string | null) { this.password = password ?? ""; return this }
getPassword() { return this.password }
```

`loadString` already exists on the `Configuration` base class (`interfaces.ts:73-88`) — no new plumbing.

URL construction in the connector:

```ts
const url = `ws://${this.configuration.getIp().toString()}:${this.configuration.getPort().toNumber()}`
const password = this.configuration.getPassword() || undefined   // "" must become undefined
```

`connect(url, "")` is **not** the same as `connect(url, undefined)` — an empty string still attempts authentication. Coerce.

Also required, same commit:

| File | Change |
|---|---|
| `ObsConfiguration.ts:80` | `defaultPort = ipPort(4444)` → **`ipPort(4455)`** (obs-websocket 5's default port). Only the *default* changes; `loadIpPort` still honors any saved value, so existing configs are untouched. |
| `mixer/obs/react/ObsSettings.tsx:~52` | The description string literally reads *"The obs-websocket plugin version 4.x.x has to be installed. Version 5 of the plugin is not yet supported."* — invert it. |
| `mixer/obs/react/ObsSettings.tsx` | Add a `ValidatingInput` for `password` with `testId="obs-password"`, mirroring the `obs-ip` / `obs-port` inputs (lines 58-59). No validation rule needed — any string is valid. |
| `package.json` | `obs-websocket-js` `^4.0.3` → `^5.0.8`; add `"ws": "^8"` to **devDependencies**; `engines.node` `>=12` → `>=16`. |

`cypress/integration/configObs.spec.ts` asserts on `obs-ip`, `obs-port`, `obs-liveMode`, `obs-submit` only (lines 19-59). Adding a fourth field does **not** break it — it stays green with no edits.

⚠️ **Security note (needs a human call — OQ-3):** the OBS configuration is round-tripped to the browser (`useObsConfiguration()` in `ObsSettings.tsx:17`, `socket.emit('config.change.obs', config.toJson())` at line 44) and persisted in plaintext to `~/.wifi-tally.json`. Adding a password puts a credential on both paths. Both are already the case for a LAN-local tool with no auth of its own, so this is consistent — but it should be a conscious decision, not a side effect.

### 4.3 Failure, retry, and `isConnected()`

Keep the existing 1 s retry loop (`reconnectTimeoutMs`, line 7) and the closure-recursion shape (lines 122-148). Two changes:

1. **Register `ConnectionClosed` and `ConnectionError` once in `connect()`, not inside the `.then()`** (v4 does it at line 135, so a failure *before* the first successful connect leaves no handler). Replace the `removeAllListeners('ConnectionClosed')` dance (lines 138, 237) with an explicit flag:

```ts
private intentionalDisconnect = false

this.obs.on('ConnectionClosed', err => {
    if (this.intentionalDisconnect) { return }
    this.connected = false
    this.communicator.notifyMixerIsDisconnected()
    console.error("Connection to OBS lost:", err.message)
    this.reconnectTimeout = setTimeout(doConnect, reconnectTimeoutMs)
})
this.obs.on('ConnectionError', err => console.error("obs socket error:", err.message))
```

`disconnect()` sets `intentionalDisconnect = true`, clears `reconnectTimeout` **and** `transitionWatchdog` **and** any pending embedded-scene debounce timers, then calls `this.obs.disconnect()`. `connect()` resets the flag to `false`.

2. **`isConnected()` (lines 242-244) is currently `this.obs !== undefined && this.connected`** — but `obs` is typed `OBSWebSocket | null` and is only ever assigned a truthy value, so the first clause is dead after the first `connect()`. Simplify to `return this.connected`, or use the library's own `this.obs?.identified === true`. `identified` (`base.ts:51-53`) is the precise notion — the socket is open *and* the Identify handshake completed — which is exactly when `call()` is legal (`base.ts:273` throws `'Socket not identified'` otherwise). Prefer:

```ts
isConnected() { return this.obs?.identified === true }
```

This also removes the possibility of `connected` drifting from reality.

`connect()` rejects with `OBSWebSocketError`; useful codes: `-1` bad/missing subprotocol (not an obs-websocket server), `4008` authentication failed, `4009` unsupported RPC version. Log `err.code` and `err.message` — the current `err.error` (line 145) is a v4-ism and will be `undefined` in v5.

Preserve `this.communicator.notifyProgramPreviewChanged(null, null)` at line 152 — it clears stale tally state on mixer switch, and nothing about v5 changes that.

---

## 5. Test strategy

### 5.1 Problems with the current spec (must be fixed regardless of v5)

`ObsConnector.spec.ts:5-13`:

```ts
const waitUntil = (fn) => {
    return new Promise((resolve, _) => {
        setInterval(() => {
            if (fn() === true) { resolve() }
        }, 100)
    })
}
```

Three distinct defects:

1. **`setInterval` is never cleared.** It keeps firing after resolve, forever, for every one of the ~30 calls in the file. Jest tolerates this; **Vitest hangs on teardown** — this is the "미해제 setInterval" the plan flags at line 103.
2. **No timeout.** A never-true predicate hangs the suite instead of failing.
3. **Most call sites are no-ops.** `waitUntil(() => communicator.programs !== ["Scene 1"])` compares an array against a *fresh array literal* — reference inequality, always `true`, resolves on the first tick. This pattern appears at lines 290, 317, 339, 378, 382, 404, 409, 431, 433, 520, 549, 555, 584, 590, 596, 602, 631, 637, 643, 649. **These tests currently pass on timing luck, not on synchronization.** The rewrite must not carry this over.

Replacement:

```ts
const waitUntil = async (fn: () => boolean, timeoutMs = 2000) => {
    const deadline = Date.now() + timeoutMs
    while (!fn()) {
        if (Date.now() > deadline) { throw new Error(`waitUntil timed out: ${fn}`) }
        await new Promise(r => setTimeout(r, 10))
    }
}
```

No leaked handle, fails loudly, and forces every call site to be given a predicate that can actually become true (use `toEqual`-style deep comparison inside the predicate, e.g. `JSON.stringify(communicator.programs) === '["Scene 2"]'`).

`ws` must become an **explicit devDependency**. Today it is only present transitively (v4 → `ws`); v5 also pulls `ws@^8`, but the spec `import WebSocket from 'ws'` at line 2 must not depend on another package's tree.

### 5.2 v5 envelope shapes the mock must speak

Base object for every frame: `{"op": number, "d": object}`.

```jsonc
// Hello (op 0) — server → client, immediately on connection.
// Omit `authentication` entirely for the no-password case.
{ "op": 0, "d": {
    "obsStudioVersion": "30.2.2",
    "obsWebSocketVersion": "5.5.2",
    "rpcVersion": 1
}}

// Hello with auth
{ "op": 0, "d": {
    "obsStudioVersion": "30.2.2", "obsWebSocketVersion": "5.5.2", "rpcVersion": 1,
    "authentication": {
        "challenge": "+IxH4CnCiqpX1rM9scsNynZzbOe4KhDeYcTNS3PDaeY=",
        "salt":      "lM1GncleQOaCu9lT1yeUZhFYnqhsLLP1G5lAGo3ixaI="
    }
}}

// Identify (op 1) — client → server. The mock only needs to receive it.
{ "op": 1, "d": { "rpcVersion": 1, "authentication": "…", "eventSubscriptions": 1023 }}

// Identified (op 2) — server → client.
{ "op": 2, "d": { "negotiatedRpcVersion": 1 }}

// Event (op 5) — server → client.
{ "op": 5, "d": {
    "eventType": "CurrentProgramSceneChanged",
    "eventIntent": 4,
    "eventData": { "sceneName": "Scene 2", "sceneUuid": "…" }
}}

// Request (op 6) — client → server.
{ "op": 6, "d": { "requestType": "GetSceneList", "requestId": "…", "requestData": {} }}

// RequestResponse (op 7) — server → client. requestType/requestId are mirrors.
{ "op": 7, "d": {
    "requestType": "GetSceneList",
    "requestId": "…",
    "requestStatus": { "result": true, "code": 100 },
    "responseData": { "currentProgramSceneName": "Scene 1", "scenes": [...] }
}}

// RequestResponse — failure. No responseData.
{ "op": 7, "d": {
    "requestType": "GetCurrentPreviewScene",
    "requestId": "…",
    "requestStatus": { "result": false, "code": 506, "comment": "Studio mode is not active." }
}}
```

`eventIntent` is not validated by the client; any number works.

### 5.3 The fake-OBS harness

One file, `hub/src/mixer/obs/FakeObs.ts` (test-only), replacing the `global.obsServer` blob at `ObsConnector.spec.ts:64-268`.

```ts
import WebSocket from 'ws'

type Scene = { sceneName: string, items?: SceneItem[] }
type SceneItem = { sourceName: string, sourceType?: string, isGroup?: boolean|null, sceneItemEnabled?: boolean }

export class FakeObs {
    private wss: WebSocket.Server
    private socket: WebSocket | null = null
    port!: number

    // --- world state the tests manipulate ---
    scenes: Scene[] = []
    programScene: string | null = null
    previewScene: string | null = null
    studioMode = false
    streaming = false
    recording = false
    recordPaused = false
    password: string | null = null

    async start() {
        this.wss = new WebSocket.Server({
            port: 0,
            // CRITICAL: obs-websocket-js aborts with OBSWebSocketError(-1,
            // 'Server sent no subprotocol') if this is not echoed. base.ts:207-215
            handleProtocols: () => 'obswebsocket.json',
        })
        // ... await 'listening', capture this.port
        this.wss.on('connection', sck => {
            this.socket = sck
            sck.send(JSON.stringify({ op: 0, d: this.hello() }))
            sck.on('message', raw => this.onMessage(sck, JSON.parse(raw.toString())))
        })
    }
    async stop() { /* close socket + server, await callback */ }

    // --- envelope plumbing ---
    private onMessage(sck, msg) {
        if (msg.op === 1) {            // Identify
            // (optionally verify msg.d.authentication against this.password)
            sck.send(JSON.stringify({ op: 2, d: { negotiatedRpcVersion: 1 } }))
            return
        }
        if (msg.op === 6) {            // Request
            const { requestType, requestId, requestData } = msg.d
            let responseData, status = { result: true, code: 100 }
            try { responseData = this.handleRequest(requestType, requestData ?? {}) }
            catch (e) { status = { result: false, code: e.code ?? 500, comment: e.message } }
            sck.send(JSON.stringify({ op: 7, d: { requestType, requestId, requestStatus: status, responseData }}))
            return
        }
        if (msg.op === 8) { /* RequestBatch → op 9, map over msg.d.requests */ }
    }

    private emit(eventType: string, eventData: object = {}) {
        this.socket?.send(JSON.stringify({ op: 5, d: { eventType, eventIntent: 0, eventData } }))
    }

    // --- request handlers ---
    private handleRequest(type, data) {
        switch (type) {
            case 'GetSceneList': return {
                currentProgramSceneName: this.programScene,
                currentProgramSceneUuid: null,
                currentPreviewSceneName: this.studioMode ? this.previewScene : null,
                currentPreviewSceneUuid: null,
                scenes: this.scenes.map((s, i) => ({ sceneName: s.sceneName, sceneUuid: null, sceneIndex: i })),
            }
            case 'GetCurrentPreviewScene':
                if (!this.studioMode) { throw Object.assign(new Error('Studio mode is not active.'), {code: 506}) }
                return { sceneName: this.previewScene, sceneUuid: null }
            case 'GetStudioModeEnabled': return { studioModeEnabled: this.studioMode }
            case 'GetStreamStatus':      return { outputActive: this.streaming, outputReconnecting: false, outputTimecode: "00:00:00.000", outputDuration: 0, outputCongestion: 0, outputBytes: 0, outputSkippedFrames: 0, outputTotalFrames: 0 }
            case 'GetRecordStatus':      return { outputActive: this.recording, outputPaused: this.recordPaused, outputTimecode: "00:00:00.000", outputDuration: 0, outputBytes: 0 }
            case 'GetSceneItemList': {
                const scene = this.scenes.find(s => s.sceneName === data.sceneName)
                if (!scene) { throw Object.assign(new Error('No such scene.'), {code: 600}) }
                return { sceneItems: (scene.items ?? []).map((it, i) => ({
                    sceneItemId: i + 1, sceneItemIndex: i,
                    sceneItemEnabled: it.sceneItemEnabled ?? true,
                    sceneItemLocked: false, sceneItemBlendMode: 'OBS_BLEND_NORMAL',
                    sourceName: it.sourceName, sourceUuid: null,
                    sourceType: it.sourceType ?? 'OBS_SOURCE_TYPE_INPUT',
                    inputKind: null, isGroup: it.isGroup ?? null,
                }))}
            }
            default: throw new Error(`Request "${type}" not implemented in FakeObs.`)
        }
    }

    // --- operator actions the tests call (the v4 mock's public surface, ported) ---
    cut(scene: string)              { this.programScene = scene; this.emit('CurrentProgramSceneChanged', {sceneName: scene, sceneUuid: null}) }
    transitionStart()               { this.emit('SceneTransitionStarted', {transitionName: 'Fade', transitionUuid: null}) }
    transitionCutPoint(scene: string) { this.programScene = scene; this.emit('CurrentProgramSceneChanged', {sceneName: scene, sceneUuid: null}) }
    transitionEnd()                 { this.emit('SceneTransitionEnded', {transitionName: 'Fade', transitionUuid: null}) }
    setPreview(scene: string)       { this.previewScene = scene; this.emit('CurrentPreviewSceneChanged', {sceneName: scene, sceneUuid: null}) }
    enterStudioMode(preview: string){ this.studioMode = true; this.previewScene = preview; this.emit('StudioModeStateChanged', {studioModeEnabled: true}) }
    exitStudioMode()                { this.studioMode = false; this.previewScene = null; this.emit('StudioModeStateChanged', {studioModeEnabled: false}) }
    changeScenes(scenes: Scene[])   { this.scenes = scenes; this.emit('SceneListChanged', {scenes: scenes.map((s,i)=>({sceneName:s.sceneName, sceneUuid:null, sceneIndex:i}))}) }
    changeSceneCollection(scenes: Scene[], program: string) { this.cut(program); this.scenes = scenes; this.emit('CurrentSceneCollectionChanged', {sceneCollectionName: 'C2'}) }
    setSceneItemEnabled(sceneName, id, enabled) { /* mutate + emit SceneItemEnableStateChanged */ }
    startStream() { this.streaming = true;  this.emit('StreamStateChanged', {outputActive: true,  outputState: 'OBS_WEBSOCKET_OUTPUT_STARTED'}) }
    stopStream()  { this.streaming = false; this.emit('StreamStateChanged', {outputActive: false, outputState: 'OBS_WEBSOCKET_OUTPUT_STOPPED'}) }
    startRecording() { this.recording = true;  this.recordPaused = false; this.emit('RecordStateChanged', {outputActive: true,  outputState: 'OBS_WEBSOCKET_OUTPUT_STARTED', outputPath: null}) }
    stopRecording()  { this.recording = false; this.recordPaused = false; this.emit('RecordStateChanged', {outputActive: false, outputState: 'OBS_WEBSOCKET_OUTPUT_STOPPED', outputPath: '/tmp/x.mkv'}) }
    pauseRecording() { this.recordPaused = true;  this.emit('RecordStateChanged', {outputActive: true, outputState: 'OBS_WEBSOCKET_OUTPUT_PAUSED',  outputPath: null}) }
    resumeRecording(){ this.recordPaused = false; this.emit('RecordStateChanged', {outputActive: true, outputState: 'OBS_WEBSOCKET_OUTPUT_RESUMED', outputPath: null}) }
    killSocket()    { this.socket?.terminate() }   // for reconnect tests
}
```

The v4 mock modelled a transition as a single `transitionBegin(newScene)` call. **Do not port that.** v5's three moments (`started` / cut point / `ended`) are separately observable and the state machine's correctness is *exactly* about what happens between them — the mock must let a test sit in the middle.

`beforeEach` becomes `fake = new FakeObs(); await fake.start()`, `afterEach` becomes `await obs.disconnect(); await fake.stop()`.

### 5.4 Required test cases

**Connection / handshake**
1. connects with no password (`Hello` without `authentication`) → `isConnected() === true`, `communicator.isConnected === true`
2. connects with a password → auth string accepted, identified
3. wrong password → `connect()` rejects, `isConnected() === false`, retry is scheduled
4. server that does **not** echo the subprotocol → surfaces `OBSWebSocketError(-1)`, does not throw unhandled *(this test is the regression guard for §0)*
5. `killSocket()` → `notifyMixerIsDisconnected()`, then auto-reconnect within ~2 s and a full resync
6. `disconnect()` → **no** reconnect attempt (the `intentionalDisconnect` flag), no leaked timers

**Baseline scene state** *(ports of existing tests at spec lines 269, 296, 323, 439, 469, 499)*
7. initial state without studio mode → `programs === ["Scene 1"]`, `previews === []`, channels populated from `sceneName`
8. initial state with studio mode → `programs === ["Scene 1"]`, `previews === ["Scene 2"]`
9. cut → programs follow
10. `CurrentPreviewSceneChanged` → previews follow
11. `SceneListChanged` → channel list updated
12. `CurrentSceneCollectionChanged` (program cut arrives *before* the collection event, as the v4 mock comment at line 141 documents for real OBS) → channels replaced, program correct
13. enter/exit studio mode → previews `[]` ⇄ `["Scene 2"]`

**Transition state machine — the ones that matter (§2.4 rows)**
14. **row 5/3/8, studio mode:** program=Cam1, preview=Cam2 → `transitionStart()` ⇒ `programs === ["Cam 1","Cam 2"]` *immediately, before any program-changed event* → `transitionCutPoint("Cam 2")` ⇒ still `["Cam 1","Cam 2"]` → `transitionEnd()` ⇒ `["Cam 2"]`
15. **row 6/3/8, studio mode OFF:** `transitionStart()` ⇒ `programs === ["Cam 1"]` → `transitionCutPoint("Cam 2")` ⇒ `["Cam 1","Cam 2"]` → `transitionEnd()` ⇒ `["Cam 2"]`
16. **order-independence:** same as 15 but with `transitionCutPoint` fired *before* `transitionStart()` ⇒ final state after `transitionEnd()` is still `["Cam 2"]` and `Cam 2` is live at every intermediate instant *(this is the OQ-1 insurance policy)*
17. **row 7, interrupt:** start Cam1→Cam2, then `transitionCutPoint("Cam 2")` + a second `transitionStart()` toward Cam1 without an intervening `transitionEnd()` ⇒ programs contains Cam2 and (once the cut point lands) Cam1; after the final `transitionEnd()` ⇒ exactly `["Cam 1"]`. **Never throws.** *(replaces spec line 415)*
18. **row 9, watchdog:** `transitionStart()` then **no** `SceneTransitionEnded` ever ⇒ after the watchdog elapses, `programs === [currentProgram]` only. Use fake timers; assert the connector logged a warning.
19. **row 12, reconnect mid-transition:** `transitionStart()`, then `killSocket()`, then let it reconnect ⇒ `transitionFrom` is clear and `programs === [server.programScene]` — no ghost scene survives the socket.
20. **degenerate:** transition where preview === program (operator transitions to the same scene) ⇒ `programs === ["Cam 1"]`, no duplicate entry *(guards the dedup in the `programScenes` getter)*
21. `CurrentProgramSceneChanged` for a scene we already report ⇒ `MixerCommunicator` emits nothing (dedup holds end-to-end)

**embeddedScenes**
22. scene with two enabled nested scenes + one disabled ⇒ `programs === ["Picture In Picture", "Cam 1", "Cam 2"]` *(direct port of spec line 345, with the disabled item now expressed as `sceneItemEnabled: false`)*
23. an item with `sourceType: 'OBS_SOURCE_TYPE_INPUT'` is **not** treated as an embedded scene
24. an item with `sourceType: 'OBS_SOURCE_TYPE_SCENE', isGroup: true` is **not** treated as an embedded scene *(new — groups did not exist as a distinguishable case in v4)*
25. `SceneItemEnableStateChanged` on the live scene ⇒ cache refetched for that scene only, tally updates
26. `SceneRemoved` ⇒ entry dropped with **zero** requests issued
27. `CurrentSceneCollectionChanged` ⇒ map fully cleared before rebuild (no names from the old collection leak)
28. `detectEmbeddedScenes: false` ⇒ **no `GetSceneItemList` request is ever sent**, and case 22's scene reports `["Picture In Picture"]` only

**liveMode** *(direct ports of spec lines 527-657, only the mock's event shapes change)*
29. `"stream"` gates program on `StreamStateChanged.outputActive`
30. `"record"` gates on record active, and `OBS_WEBSOCKET_OUTPUT_PAUSED` ⇒ off air, `..._RESUMED` ⇒ on air
31. `"streamOrRecord"` — either
32. **initial state is correct without any event**: connect while the fake is already `streaming = true` ⇒ `programs` non-empty immediately. *(This is the regression test for the deleted `StreamStatus` event; the v4 suite could not have caught it.)*

### 5.5 Build order

Per the plan (line 135): **write `FakeObs.ts` + tests 1-2 and 7 first, run them against the current v4 connector, and confirm they fail.** Then port the connector. A mock that silently accepts a broken client is worse than no mock.

---

## 6. Implementation checklist

Run everything from `hub/`. Test runner: the repo is still on `react-scripts`/Jest (`package.json` scripts `test:ci`), so both commands are given — use whichever Phase 1 has landed.

| # | Step | Verification |
|---|---|---|
| 1 | `npm i obs-websocket-js@^5` and `npm i -D ws@^8`; bump `engines.node` to `>=16` | `npm ls obs-websocket-js ws` shows 5.0.x and ws 8.x as a direct dep |
| 2 | Add `password` to `ObsConfiguration.ts` (type, field, `fromJson` via `loadString`, `toJson`, getter/setter); change `defaultPort` to `4455` | `npx tsc -p tsconfig.server.json --noEmit` → exit 0 |
| 3 | Write `src/mixer/obs/FakeObs.ts` (§5.3). Nothing else changes yet | `npm run test:ci -- ObsConnector` (or `npx vitest run src/mixer/obs`) → old v4 suite still at baseline |
| 4 | Rewrite `ObsConnector.spec.ts` against `FakeObs`, cases 1-2 and 7 only | Suite **fails** — connector still speaks v4. Failure is the pass condition for this step |
| 5 | Port connection: `import … from 'obs-websocket-js/json'`, `connect(url, password, {rpcVersion:1})`, `ConnectionOpened`/`ConnectionError`/`ConnectionClosed`, `intentionalDisconnect` flag, `isConnected() → this.obs?.identified === true` | cases 1-6 green |
| 6 | Port the resync (§2.6) + rename `GetSceneList` field access (`scene.sceneName`); add `GetStudioModeEnabled`/`GetStreamStatus`/`GetRecordStatus`. Add spec cases 7-13, 32 | cases 1-13, 32 green |
| 7 | Implement the transition state machine (§2.3, §2.4, §2.5) — new fields, derived `programScenes` getter, watchdog. Add spec cases 14-21 | cases 1-21 green |
| 8 | Rename the remaining event handlers (mapping table rows 3-8, 13-18) incl. the record-pause `outputState` special case. Add spec cases 29-31 | cases 1-21, 29-32 green |
| 9 | Replace `updateEmbeddedScenes` with the `GetSceneItemList` + `callBatch` rebuild and the invalidation table (§3.3), behind `detectEmbeddedScenes`. Add spec cases 22-28 | **full `ObsConnector.spec.ts` green** |
| 10 | Update `ObsSettings.tsx`: description text, `obs-password` input | `npx tsc -p tsconfig.json --noEmit` → exit 0 |
| 11 | Full type + unit pass | `npx tsc -p tsconfig.json --noEmit && npx tsc -p tsconfig.server.json --noEmit` → exit 0; `npm run test:ci` ≥ BASELINE.md |
| 12 | Cypress | `npm run cypress:backend &` then `npx cypress run --spec cypress/integration/configObs.spec.ts` → **green** |
| 13 | Full E2E regression | `npx cypress run` ≥ BASELINE.md |
| 14 | Manual smoke against a real OBS ≥ 30 (see OQ-1, OQ-2). Record the exact OBS + obs-websocket version in `BASELINE.md` | studio-mode transition lights both scenes for its full duration; interrupted transition self-clears; a 20+ scene collection connects with no perceptible delay |

Terminal condition: step 9 (`ObsConnector.spec.ts` green) + step 12 (`configObs.spec.ts` green).

---

## 7. Open questions

- **OQ-1 (needs real OBS).** With studio mode **off**, does `CurrentProgramSceneChanged` fire at the *start* of a transition or at the *cut point*? The only logged evidence I found ([obs-studio#7219](https://github.com/obsproject/obs-studio/issues/7219)) is a stinger case and shows the cut point. The §2.4 design is order-independent so it is correct either way, and test 16 pins that — but the answer determines whether §2.7's regression is real or imaginary. **Resolve by watching the event log on a real instance; do not guess in code.**
- **OQ-2 (needs real OBS).** Confirm that interrupting a transition really does suppress `SceneTransitionEnded` (the protocol doc hedges: "Does not *appear* to trigger"). If it in fact fires, the watchdog becomes belt-and-braces rather than load-bearing — keep it either way, but the finding belongs in the code comment.
- **OQ-3 (human decision).** The OBS password will be persisted in plaintext to `~/.wifi-tally.json` and pushed to every connected browser via the existing config socket events. That matches how every other setting already works, but it is the first actual credential. Accept, or scope it out of the client payload?
- **OQ-4 (product call).** Neither v4 nor this design traverses **groups**. A scene nested inside a group inside a live scene will not light up. v4 had the same hole, so this is not a regression — but v5's `isGroup` flag makes it cheaply fixable (one extra `GetGroupSceneItemList` per group). Fix now, or file it?
- **OQ-5 (needs a large real collection).** The §3.4 cost model is arithmetic, not measurement. Someone with a genuine 50-scene collection should confirm the `callBatch` rebuild is imperceptible before we commit to `detectEmbeddedScenes: true` as the default.
- **OQ-6 (compatibility floor).** `OBS_WEBSOCKET_OUTPUT_PAUSED` / `_RESUMED` were added in obs-websocket **v5.1.0**. On 5.0.x, record-pause will not be detected and `liveMode: "record"` will report on-air through a pause. Declare a minimum obs-websocket version (5.1.0+, i.e. OBS 28.0.2+), or add a `GetRecordStatus.outputPaused` poll as a fallback? Recommend declaring the floor — polling for one edge case is not worth it.

---

## 8. Corrections to the plan file

Line references are to `~/.claude/plans/soft-wishing-boot.md`.

**Correction 1 — line 136, `StreamStatus 삭제됨` understates the impact.** True that the event is gone, but the plan reads it as a deletion. It is a deletion *plus a new obligation*: v4's `StreamStatus` (pushed every ~2 s) was the **only** thing that ever established initial streaming/recording state — `connect()` at `ObsConnector.ts:128-141` never queried it. Under v5, `GetStreamStatus` and `GetRecordStatus` **must** be added to the connect path or all three non-`always` live modes start with `isStreaming`/`isRecording` stuck at their `false` initializers (lines 21-22). No existing test would catch this; spec case 32 is added specifically for it.

**Correction 2 — line 138, the transition design is right in outline but omits the failure mode that actually matters.** The plan says *"`TransitionEnd`에서 해제"* (release the flag on TransitionEnd). The protocol reference states verbatim of `SceneTransitionEnded`: *"Note: Does not appear to trigger when the transition is interrupted by the user."* Releasing **only** on that event means one interrupted transition pins the outgoing scene on air permanently. A watchdog (§2.5) is not optional.

Also, the plan's *"`CurrentProgramSceneChanged`와 보존된 preview를 둘 다 live로 취급"* is correct **only in studio mode**. With studio mode off there is no preview scene to preserve, and the destination is genuinely unknowable until the cut point. §2.4 rows 5 and 6 split this; the plan treats it as one case.

**Correction 3 — line 139, the invalidation set is incomplete.** *"`SceneListChanged`/`SceneItem*`에서만 무효화"* misses `SceneNameChanged` (a rename invalidates a key and `SceneListChanged` does not reliably cover it) and `CurrentSceneCollectionChanged` (which requires **clearing** the map, not merely rebuilding — otherwise names from the previous collection persist). Conversely `SceneItemListReindexed` is in the `SceneItem*` family but must be **ignored**. Full table in §3.3.

**Correction 4 — line 136 lists `connect({address})` → `connect('ws://host:port', password)`, but `ObsConfiguration` has no password field to supply one.** `ObsConfigurationSaveType` (`ObsConfiguration.ts:5-9`) is `{ip, port, liveMode?}`. The plan does not schedule adding it, nor the accompanying `ObsSettings.tsx` input, nor the `defaultPort` change from 4444 → **4455**. All three are required for the unit to be usable against a default OBS 30 install. §4.2.

**Correction 5 — packaging, absent from the plan entirely.** `obs-websocket-js@5`'s default export under Node resolves to the **msgpack** build (`exports["."].require → ./dist/msgpack.cjs`). A naive `import OBSWebSocket from 'obs-websocket-js'` yields a client that speaks binary msgpack over the `obswebsocket.msgpack` subprotocol, against which the planned hand-rolled `ws` JSON mock cannot handshake. The import **must** be `'obs-websocket-js/json'`, and the mock server **must** echo the `obswebsocket.json` subprotocol or the client aborts with `OBSWebSocketError(-1, 'Server sent no subprotocol')` (`base.ts:207-215`). This is the most likely cause of an opaque multi-hour stall in this unit; §0 exists for it.

**Correction 6 — line 103's `setInterval` note is right but incomplete.** The leak is real, but the same `waitUntil` helper has a second, worse defect: ~20 of its call sites pass predicates like `() => communicator.programs !== ["Scene 1"]`, which compare against a fresh array literal and are therefore **always true**. Those awaits synchronize nothing; the affected tests currently pass on timing luck. Enumerated in §5.1 — the rewrite must not preserve the pattern.

**Correction 7 — line 141's gate is weaker than it reads.** `cypress/integration/configObs.spec.ts` (60 lines) never connects to OBS; it exercises form validation and persistence only. "`configObs.spec.ts` green" therefore proves the config surface survived, not that the connector works. It stays a valid gate (and adding a password field does not break it), but the *connector's* gate is `ObsConnector.spec.ts` plus the manual smoke at checklist step 14. Worth stating so an autonomous agent does not read a green `configObs` as protocol validation.

Everything else in unit 2c — the ~248/660 line counts, the "mock server first, then the connector" ordering (line 135), the "2-3× the budget of the other units" estimate (risk table line 260), and the "ship it flag-off if blocked, it is not core tally" position on `embeddedScenes` (line 261) — checks out. §3.5 confirms the last one from the code: `notifyChanged()` reads the map as `this.embeddedScenes[scene] || []` at lines 213 and 223, so an empty map degrades cleanly by construction.
