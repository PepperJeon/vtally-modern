# Backend audit — `hub/src/server/**` + its `hub/src/shared/**` dependencies

Read-only pass. No source was changed. One pass, one reviewer.

Ranked by (likelihood × damage in a live broadcast), not by severity label. Every
finding says whether it was **traced** (I followed the code path end to end and can
name the line where it goes wrong) or is **theoretical** (the shape is wrong but I
could not confirm the triggering condition from this checkout).

---

## 0. Coverage of this audit — what I actually read

**Read in full, line by line, and traced:**

- `server.ts`, `lib/` (all 5 files), `tally/` (all 3 files)
- `mixer/` — every connector: `atem`, `obs`, `vmix`, `rolandV60HD`, `rolandV8HD`,
  `feelworld`, `mock`, `null`, `test`
- `flasher/NodeMcuConnector.ts`
- `shared/domain/Tally.ts`, `shared/domain/Log.ts`,
  `shared/tally/CommandCreator.ts`, `shared/tally/CommandParser.ts`,
  `shared/mixer/interfaces.ts`
- `tally/src/my-tally.lua` + `my-log.lua` + `my-log-buffer.lua` (device side, to
  check the protocol claims)

**Skimmed, not audited:**

- `shared/mixer/*/…Configuration.ts` (10 files) — read for `getRestartFingerprint`
  and load/validate behaviour only. I did **not** check each getter's defaults
  against the UI or the docs. `test-audit.md` already flags that the five
  `toBeTruthy()` "has a default" tests are blind to which default; that gap is
  unchanged and I did not close it.
- `shared/flasher/TallySettingsIni.ts`, `TallyDevice.ts`
- `shared/lib/color.ts`, `shared/tally/ColorScheme.ts`,
  `shared/tally/TallyConfiguration.ts` — read the brightness/colour math enough to
  confirm §3.2/§3.3 of `protocol.md`, not enough to claim the arithmetic is right
  at the boundaries.
- `shared/domain/IpAddress.ts` / `IpPort.ts`
- The spec files: read `MixerDriver.spec.ts`, `MixerCommunicator.spec.ts`,
  `ObsConnector.spec.ts` (partially), and grepped the rest. I did not run the suite.

**Not covered at all:** `src/client/**`, `cypress/**`, `electron/**`.

I did not run the hub. Everything below is static tracing.

---

## 1. The findings

### F1 — Losing the mixer connection does not clear program state, on every connector. Tallies keep showing the last state indefinitely. **TRACED**

This is the single most important finding and it is systemic, not a one-connector slip.

`CommandCreator.getState()` (`shared/tally/CommandCreator.ts:9-22`) resolves to
`"unknown"` — the blue flashing "hub can't tell" state — **only** when
`programs === null`. That is the entire mechanism by which a tally is allowed to
say "I don't know".

`programs` becomes `null` in exactly three places in the whole server tree:

```
src/server/lib/MixerDriver.ts:75        — operator switches mixers
src/server/mixer/null/NullConnector.ts:15 — the do-nothing mixer, at connect
src/server/mixer/obs/ObsConnector.ts:137  — OBS, at *initial* connect only
```

(verified by grep for `notifyProgramPreviewChanged(null` / `notifyProgramChanged(null`
across `src/server/`; those three are the only non-spec hits.)

**No connector ever nulls program state when it loses the mixer.** Every failure
path calls `communicator.notifyMixerIsDisconnected()` and stops there:

| connector | disconnect handler | line | resets programs? |
|---|---|---|---|
| obs | `ConnectionClosed` | `ObsConnector.ts:68-74` | **no** |
| atem | `'disconnected'` | `AtemConnector.ts:53-61` | **no** |
| vmix | `'close'` | `VmixConnector.ts:90-103` | **no** |
| rolandV60HD | `processResponseError` | `RolandV60HDConnector.ts:75-82` | **no** |
| rolandV8HD | — (none exists, see F2) | — | **no** |
| feelworld | `onTimeout` | `FeelworldConnector.ts:108-117` | **no** |

`MixerCommunicator.currentPrograms` therefore keeps the last value it saw. The
100 ms keep-alive in `UdpTallyDriver.ts:90-94` reads
`this.container.lastPrograms` and keeps re-sending that stale list to every tally,
forever, at 10 Hz.

**What a user sees.** OBS crashes, or the network switch drops a port, mid-show.
Camera 2 was on air. Camera 2's tally stays solid red. Camera 1's tally stays dark.
The hub UI's mixer pill correctly flips to disconnected — but nobody is looking at
the hub, they are looking at the lights. The Camera 1 operator believes they are
safe and steps out of frame; the Camera 2 operator believes they are live and holds
a shot that is no longer going anywhere. This is precisely the "stale idle while the
camera is actually live" case that the `pingInterval: 1000 / pingTimeout: 2000`
decision (`DECISIONS.md`, Architecture) was written to prevent on the *web tally*
transport — and it is wide open one layer up, on the mixer side, where the heartbeat
decision does not reach.

The `unknown` state, its `0x80`/250 ms flash pattern, and the whole §3.1 precedence
rule that puts `unknown` above `on-air` exist for exactly this scenario. As written,
that path is only reachable when the *operator* switches mixers — never when the
mixer actually goes away.

**Would a test catch it?** No, and the best mixer suite in the tree walks straight
past it. `ObsConnector.spec.ts:125-135` ("reconnects and resyncs after the socket
dies") does:

```
fake.programScene = "Scene 2"
fake.killSocket()
await waitUntil(() => communicator.isConnected === false, ...)
await waitUntil(() => connector.isConnected(), "a reconnect", 5000)
await waitForPrograms(["Scene 2"])
```

It asserts the disconnect *notification* and the post-reconnect programs. It asserts
nothing about `communicator.programs` **during** the outage — where the value is
still `["Scene 1"]`. The test passes with the bug present.

**The fix is one line per connector** (`notifyProgramPreviewChanged(null, null)`
alongside each `notifyMixerIsDisconnected()`), or better, one line inside
`MixerCommunicator.notifyMixerIsDisconnected()` so every current and future
connector gets it — that is where all six callers already route through.

---

### F2 — `RolandV8HDConnector` has no liveness detection whatsoever. **TRACED**

`mixer/rolandV8HD/RolandV8HDConnector.ts`.

`connected` is set `true` once at `:79` and is only ever set `false` in
`disconnect()` (`:124`), which is called solely by `MixerDriver.changeMixer`. There
is no error handler, no timeout, no watchdog on the MIDI input.

Unplug the V-8HD's USB cable, or power-cycle the mixer, mid-show:

- `midi_input` stops delivering `'message'` events — silently.
- `isConnected()` keeps returning `true`, so the hub UI's mixer pill stays green.
- `input_status` (`:27`) keeps its last values.
- `processInputStatus` is never called again, so `notifyProgramPreviewChanged` is
  never called again, so `currentPrograms` never changes.
- Every tally holds its last state at 10 Hz, indefinitely, with nothing anywhere in
  the system indicating anything is wrong.

This is F1 with the detection layer also missing. It is the worst combination in the
tree: the hub is confidently wrong and has no way to find out.

Compare `FeelworldConnector`, which does implement a request timeout
(`FeelworldConnector.ts:95, 108-117`), and `ObsConnector`, which has both a
connection-closed handler and a transition watchdog. This is the connector-contract
inconsistency the brief asked about, and it is the sharpest instance of it.

The `Connector` interface (`shared/mixer/interfaces.ts:4-8`) is three methods and
says nothing about liveness, so nothing structurally prevents this.

**Would a test catch it?** There is no `RolandV8HDConnector.spec`. No.

---

### F3 — A failed config write kills the hub process. **TRACED**

`lib/AppConfigurationPersistence.ts:55-96`.

```ts
private scheduleSave() {
    if (this.saveTimeout) { return }
    this.saveTimeout = setTimeout(this.save.bind(this), 500)   // :57
}

async save() {
    ...
    return new Promise((resolve, reject) => {
        fs.writeFile(tmpName, ..., err => {
            if (err) { ...; reject(err); return }              // :83
            fs.rename(tmpName, this.fileName, renameErr => {
                if (renameErr) { ...; reject(renameErr) }      // :89
```

`setTimeout` discards the returned promise. When `save()` rejects — disk full,
read-only `$HOME`, permissions on `~/.wifi-tally.json.tmp`, an SD card that has
gone read-only, which is the normal end-of-life mode for a Raspberry Pi card — that
is an **unhandled promise rejection**. Node ≥15 terminates the process by default.

This is the same shape as the two flasher bugs fixed yesterday (an async operation
whose rejection has no handler), but this one is on the *routine* path: it fires on
every debounced config change, i.e. every time an operator patches a tally, renames
a channel, or adjusts brightness.

**What a user sees.** Mid-show, the operator patches a camera to a different channel.
The hub exits. On a Pi, `forever-monitor` restarts it — every tally goes dark for the
restart window, then re-registers. In Electron, the app just quits. Either way, the
write that triggered it fails again on the next attempt, so it repeats.

The `close()` path in `server.ts:403` (`await myPersistence?.save()`) *is* awaited
and its rejection is handled by the caller — so the crash is specific to the
debounce timer, not to the explicit save.

**Would a test catch it?** No. `AppConfigurationPersistence.spec.ts` has no write-failure
case at all (grepped: the only `console.error` assertions are about parse failures on
*load*).

**Related, lower confidence — THEORETICAL:** the temp file name is a fixed
`${this.fileName}.tmp` (`:79`). Two hubs sharing a home directory (a Pi service plus
someone running the Electron app against the same `CONFIG_FILE`) would interleave
write-then-rename on the same temp path, and `rename` would publish a partially
written file — defeating the atomicity the temp-file pattern was added for.
`app.requestSingleInstanceLock()` only guards Electron-against-Electron. I could not
construct a single-process interleaving because `save()` clears the pending timer
synchronously at `:62-65`, so I am not claiming this one happens.

---

### F4 — `NodeMcuConnector.withMutex()` is a fourth `disconnect()` call site that yesterday's `safeDisconnect()` fix did not cover. **TRACED**

`flasher/NodeMcuConnector.ts:50-70`.

```ts
const interval = setInterval(() => {
    const mutexAquired = tryToAquireMutex()
    if (mutexAquired) {
        clearInterval(interval)
        if (this.nodemcu.isConnected()) {
            console.warn("Serial terminal was not closed by previous process.")
            this.nodemcu.disconnect()            // :58 — not awaited, not caught
        }
        resolve(true)
    }
}, 100)
```

`DECISIONS.md` records the root cause precisely: *"nodemcu-tool's `isConnected()`
reporting `true` after a failed `connect()`, so `disconnect()` rejected with 'Port is
not open'"*. The fix added `safeDisconnect()` (`:168-176`) and applied it to the three
`finally` blocks at `:250`, `:300`, `:360`.

`:58` is guarded by the *same lying `isConnected()`* the fix was written for, and calls
the *same raw `disconnect()`* — inside a `setInterval` callback, where the returned
rejected promise has no handler at all. Unhandled rejection → process exit.

This is the "grep every caller" case: the ticket named three sites, the shared helper
was written correctly, and one caller was missed.

**What a user sees.** Operator opens `/flasher` after a previous flash left the serial
terminal open. The hub exits. Same blast radius as F3.

**Would a test catch it?** There is no spec for `NodeMcuConnector`. No.

---

### F5 — `AtemConnector.connect()` drops a rejected promise on the floor. **TRACED**

`mixer/atem/AtemConnector.ts:45`:

```ts
this.myAtem.connect(this.configuration.getIp().toString(), this.configuration.getPort().toNumber())
```

`atem-connection`'s signature is `connect(address: string, port?: number): Promise<void>`
(confirmed at `node_modules/atem-connection/dist/atem.d.ts:53`). Not awaited, no
`.catch()`. `MixerDriver.changeMixer` calls `connect()` and does
`await Promise.resolve(ret)` (`MixerDriver.ts:119-120`), but `AtemConnector.connect()`
returns `undefined`, so there is nothing to await — the rejection escapes.

The `'error'` listener at `:41` handles *emitted* errors, not a rejected connect
promise; these are different channels in atem-connection.

**What a user sees.** Operator types a hostname instead of an IP into ATEM settings
and saves. Address resolution fails, the promise rejects, unhandled → hub exits. Also
reachable from a saved config at boot if the ATEM's DHCP lease moved and the stored
address no longer resolves.

Every other connector avoids this by either being callback/event-based (`vmix`,
`rolandV60HD`, `rolandV8HD`, `feelworld`) or attaching a `.catch()`
(`ObsConnector.ts:155`). ATEM is the outlier.

**Would a test catch it?** There is no `AtemConnector.spec`. No.

---

### F6 — `MixerDriver.changeMixer()` is async and both its callers ignore the returned promise. **TRACED**

`lib/MixerDriver.ts:39` (constructor) and `:58` (the `config.changed` handler) both
call `this.changeMixer(...)` bare. `changeMixer` is `async` with a `try/finally` and
**no `catch`** (`:72-124`), so anything thrown by `disconnect()`, `new MixerClass(...)`,
or `connect()` becomes an unhandled rejection.

Concretely reachable: `RolandV8HDConnector.connect()` calls
`new this.midi.Input()` (`:32`) with no guard — if `@julusian/midi`'s native binding
throws (the exact failure the flasher's lazy-load stub exists to survive), the throw
propagates out of `changeMixer` with nothing to catch it. Same for
`RolandV8HDConnector.disconnect()` calling `this.midi_output.closePort()` (`:122`)
when `connect()` never opened a port.

This is a lower-likelihood crash than F3/F4 — it needs a specific hardware/binding
failure — but it is the same shape and the same consequence, and it is one line to
close (`.catch(e => console.error(...))` on both call sites).

**Would a test catch it?** `MixerDriver.spec.ts` awaits `changeMixer` explicitly in all
three of its tests, so it exercises the happy path only and would never observe the
unawaited-caller problem. No.

---

### F7 — `hardReset()` throws from inside a bare `setTimeout`, which is an uncaught exception, not a rejection. **TRACED**

`flasher/NodeMcuConnector.ts:372-374`:

```ts
const failTimeout = setTimeout(() => {
    throw new Error("Could not connect to NodeMCU after hardreset.")
}, 10000)
```

A `throw` inside a `setTimeout` callback does not reject the enclosing `async`
function — there is no promise linkage. It surfaces as an uncaught exception on the
event loop and terminates the process. The surrounding `try/catch` in `program()`
(`:292`) and `writeTallySettingsIni()` (`:352`) cannot see it.

Compounding it: the loop it is meant to bound (`:377-384`) is a tight
`while(!rebootSuccess)` with **no delay** between `checkConnection()` attempts, so for
those 10 s it spins as fast as the serial layer will let it.

**What a user sees.** Someone flashes a spare tally between segments. The device does
not come back (bad cable, wrong firmware, dead board). Ten seconds later the hub
process dies, taking every live tally with it.

Not on the live path, but the flasher UI is reachable at any time and the damage is
total, which is why it ranks here rather than lower.

**Would a test catch it?** No spec exists. No.

---

### F8 — A UDP socket error permanently disables all UDP tallies, then crashes the process. **TRACED**

`tally/UdpTallyDriver.ts:26-29`:

```ts
this.io.on('error', (err) => {
    console.log(`server error: ${err.stack}`);
    this.io.close();
});
```

The socket is closed and **never rebound**. Two consequences, in order:

1. The two intervals (`:62` liveness, `:90` keep-alive) are still running. The
   keep-alive calls `this.io.send(...)` (`:124`) on a closed socket. Node's
   `dgram.Socket.send()` runs a health check and throws `ERR_SOCKET_DGRAM_NOT_RUNNING`
   synchronously when the socket is not running. That throw is inside a `setInterval`
   callback with no `try` — uncaught exception, process exit, within 100 ms of the
   error.
2. Before that, and if the throw path somehow does not fire (no active tallies to
   send to), every UDP tally goes silent: the hub stops receiving, so the liveness
   timer walks each tally CONNECTED → MISSING (3 s) → DISCONNECTED (30 s). Tallies
   stop getting keep-alives once `isActive()` goes false, and the device side, which
   treats *any* received packet as "hub alive" on its own 3 s clock
   (`protocol.md` §1), falls back to its own no-hub behaviour.

The realistic trigger is `EADDRINUSE` at bind (`:59`) — a leftover hub process, or a
Pi service and the Electron app on one machine, which is exactly the scenario
`app.requestSingleInstanceLock()` was added for but only covers Electron-vs-Electron.
On Linux, an ICMP port-unreachable from a tally that powered off can also surface as
an `error` event on a connected UDP socket.

Note this is *not* a regression from the interval-tracking fix — `close()` (`:99-103`)
correctly clears both timers, but `close()` is only called from the Electron quit
path, never from the error handler.

**Would a test catch it?** There is no `UdpTallyDriver.spec`. No.

---

### F9 — Config changes made while a mixer connection is in flight are silently discarded. **TRACED**

`lib/MixerDriver.ts:41-44`:

```ts
this.emitter.on('config.changed', () => {
    if (this.isChangingMixer) {
        return
    }
```

`isChangingMixer` is set at `:71` and cleared in the `finally` at `:123`, spanning two
awaits: `disconnect()` (`:78`) and `connect()` (`:120`). Any `config.changed` emitted
during that window returns immediately — no queue, no retry, no log line. The change
is already committed to `AppConfiguration` and will be persisted and shown in the UI,
but the connector is never told.

The window is not small. `ObsConnector.connect()` calls `doConnect()` which is a
websocket connect plus a four-call `resync()`; `VmixConnector.connect()` has a 5 s
`waitForHelloPeriod`; `AtemConnector.connect()` is asynchronous with no bound.

**What a user sees.** OBS is unreachable at the configured address, so the hub is
looping through `scheduleReconnect()` (1 s). The operator realises the IP is wrong and
corrects it. If the save lands inside a connect attempt, the hub keeps retrying the
*old* address and the UI shows the *new* one. The operator sees correct settings and a
disconnected mixer, with no explanation, and the only recovery is to change the
setting again and get lucky on the timing.

Note the guard is not protecting against re-entrancy in any meaningful sense —
`changeMixer` sets the flag synchronously before its first await, so two overlapping
`changeMixer` calls from this handler are impossible anyway. The guard's only effect
is to drop the update.

**Would a test catch it?** `MixerDriver.spec.ts` awaits every `changeMixer` before
changing config, so it never enters the window. No.

---

### F10 — `TestConnector` and `NullConnector` never emit `mixer.connected`/`mixer.disconnected`. This explains the unexplained `MIXER 0` observation in `DECISIONS.md`. **TRACED**

`mixer/test/TestConnector.ts` — `connect()` sets `this.connected = true` and publishes
channels and program/preview, but never calls
`communicator.notifyMixerIsConnected()`. `disconnect()` never calls
`notifyMixerIsDisconnected()`. `NullConnector` likewise emits neither.

There are two independent sources of truth for mixer connectivity, and they disagree:

- **Snapshot path** — `server.ts:135`, on `events.mixer.subscribe`, emits
  `myMixerDriver.isConnected()`, which reads `currentMixerInstance.isConnected()`,
  i.e. `TestConnector.connected` → `true`.
- **Event path** — `MixerCommunicator.isConnected` (`:32`), only ever changed by
  `notifyMixerIsConnected/Disconnected`, which `TestConnector` never calls. No
  `mixer.connected` event is ever emitted in test mode.

So a client that subscribes *after* the test mixer is up reads `true` from the
snapshot; a client that was already subscribed keeps whatever the pill last showed and
never receives a correction.

`DECISIONS.md` records this under "Deferred work" as *"Unexplained, single
observation: `MIXER 0` while program state was demonstrably live … It followed a
`config.change.test` emit"*, and names the right suspect: *"whether a test-mixer config
change can leave `MixerDriver.isConnected()` false while `TestConnector` keeps
publishing program/preview."* The mechanism is the inverse of that guess but the same
seam. Trace:

1. `config.change.test` → `setTestConfiguration` → `config.changed`.
2. `MixerDriver` sees the restart fingerprint changed → `changeMixer("test")`.
3. Old `TestConnector.disconnect()` — emits nothing.
4. `MixerDriver.ts:75` — `notifyProgramPreviewChanged(null, null)`.
5. New `TestConnector.connect()` — publishes real program/preview, emits nothing.

The already-subscribed browser receives `program.state` with live values (step 5) and
**no** `mixer.state` at any point. Its pill shows whatever it showed before — which,
for a hub that had previously run a real connector or had ever emitted
`mixer.disconnected`, is `0`. That is the screenshot.

I am confident in the mechanism. I have not reproduced it, so treat the mapping to
that specific screenshot as strongly-supported rather than proven.

This is test-mode-only in its current form, and `TestConnector` is gated behind
`HUB_WITH_TEST`. The reason it still matters: the two-sources-of-truth seam is
structural, applies to every connector, and means a Cypress suite running against the
test mixer is asserting on a pill whose value it cannot deterministically predict.
That is a plausible contributor to the `tally-settings.spec.ts` flake, though I have
not traced that link.

---

### F11 — After an error-driven reconnect, `VmixConnector` loses its own socket reference: `isConnected()` lies, `disconnect()` becomes a no-op, and the orphaned connector keeps writing program state. **TRACED**

`mixer/vmix/VmixConnector.ts:40-49`:

```ts
const reconnectClient = () => {
    this.disconnect().then(() =>
        this.reconnectTimeout = setTimeout(() => {
            ...
            client.connect(...)      // :46 — the closure variable, not this.client
        }, 200)
    )
}
```

`disconnect()` sets `this.client = undefined` at `:209`. The reconnect then revives the
socket through the **closure** variable `client` and never reassigns `this.client`.
Three consequences, all permanent for the life of that connector instance:

1. **`isConnected()` returns `false` forever** (`:213`, `this.client !== undefined`),
   even after the socket is fully reconnected and `VERSION OK` / `SUBSCRIBE OK TALLY`
   have both arrived. The hub UI mixer pill reads disconnected while vMix is feeding
   correct, live tally data — a lying `isConnected()`, the same class as the
   `nodemcu-tool` one.
2. **A later `disconnect()` cannot destroy the socket** (`:192`,
   `this.client && !this.client.destroyed` → false). The TCP connection leaks.
3. **Worst: the orphaned connector keeps publishing.** `client.on('data', this.onData)`
   is still bound, so `handleTallyCommand` keeps calling
   `communicator.notifyProgramPreviewChanged` on the *shared* communicator. Switch from
   vMix to ATEM after a reconnect has happened, and the dead vMix connector fights the
   live ATEM connector for program state on the same object — last writer wins, at
   whatever rate vMix sends TALLY updates.

Consequence 3 is a direct "tally shows the wrong state" bug: during a show, a camera's
light is driven by whichever of two mixers most recently spoke.

`reconnectClient()` is reached from `client.on('close', hadError)` (`:101`) — i.e. any
TCP-level error, which for a mixer on a venue network is routine — and from the
5 s hello timeout (`:67`).

**Would a test catch it?** `VmixConnector.spec.js` is the suite currently red for the
unrelated `localhost`/`::1` bind mismatch (`DECISIONS.md`), and it does not exercise
the error-reconnect path regardless. No.

---

### F12 — `RolandV60HDConnector` reports connected before any request has succeeded, and publishes on out-of-order responses. **TRACED**

`mixer/rolandV60HD/RolandV60HDConnector.ts:26-33`:

```ts
connect() {
    for (let i = 0; i < 8; i++) { this.sourceConnections[i] = setInterval(...) }
    this.connected = true                          // :31
    this.communicator.notifyMixerIsConnected()     // :32
}
```

Nothing has been sent yet. Point the hub at an IP with no V-60HD on it and the mixer
pill goes green immediately and stays green until the first HTTP error callback lands.
This is a UI lie rather than a wrong tally — program state correctly stays `null`
(nothing calls `notifyProgramPreviewChanged` until a real response arrives), so tallies
show `unknown` as they should.

Second, separate issue at `:70`:

```ts
if (address === 8) { this.processInputStatus(this.communicator) }
```

The eight `http.get` polls are independent, concurrent, and unordered. The publish is
gated on input 8's response arriving, not on all eight having arrived. Two effects:

- If input 8's request errors while 1–7 succeed, `processInputStatus` is never called
  and the accumulated `input_status` is never published — the hub silently sits on
  fresher data than it is showing.
- If input 8's response for cycle N arrives before inputs 1–7's, the published frame
  mixes cycle N and cycle N−1. During a cut, that can briefly put two cameras on
  program at once. It self-corrects on the next interval, so damage is bounded to
  roughly one poll period.

Third, `:38`: `res.on('data', data => this.processResponse(data, address))` treats each
chunk as a whole response, with no accumulation and no status-code check. The payloads
(`"onair"`, `"selected"`, `"unselected"`) are short enough to always arrive in one
chunk in practice, so this is **theoretical** — but a chunked or proxied response would
be parsed as `default:` → `0` → off-air. An HTTP 500 body would do the same.

`RolandV8HDConnector` has the identical `channel_idx === 7` gate (`:70`), but MIDI over
USB is ordered, so the out-of-order variant does not apply there.

---

### F13 — `FeelworldConnector` never re-sends the connect handshake after a timeout. **TRACED (code) / THEORETICAL (impact)**

`mixer/feelworld/FeelworldConnector.ts`. `sendConnectRequest()` is called exactly once,
from `connect()` (`:48`). After `onTimeout()` → `markDisconnected()` (`:116`), the only
thing the poll interval keeps doing is `sendTallyRequest()`.

If the device requires the `0x68` handshake before it will answer `0xF1` tally requests
— which is what the connector's own `§1.6` reference implies — then a Feelworld mixer
that reboots or drops off the network mid-show never gets re-handshaked, and the hub
stays disconnected until the operator manually re-selects the mixer.

Marked partly theoretical because the design doc says this connector is unverified
against real hardware, so I cannot confirm the device actually gates on the handshake.
The code-level fact — that the handshake is sent once and never again — is certain.

Two smaller things in the same file, both **theoretical**:

- `disconnect()` calls `this.socket.close()` (`:64`) unguarded. If the socket already
  errored, `close()` throws `ERR_SOCKET_DGRAM_NOT_RUNNING`. The `'error'` handler
  (`:42-45`) marks disconnected but neither closes nor clears `this.socket`, so this is
  reachable. `UdpTallyDriver.close()` (`:102`) wraps the same call in `try/catch`;
  Feelworld does not. Same inconsistency between two files owned by the same codebase.
- `this.socket.send()` (`:97`) is called from the poll interval with no `try`. Same
  crash shape as F8 if the socket has gone unhealthy.
- `handleTallyPayload` (`:170-184`) picks between two mutually incompatible wire
  interpretations at runtime based on a 22-byte length check. Assumption B reads
  *preview* from byte 0 and *program* from byte 2; Assumption A reads *program* from
  byte 0. **If the guess is wrong, program and preview are swapped on every camera** —
  the on-air camera shows green, the standby camera shows red. The connector is
  correctly gated out of production via `getAllowedMixers` (`MixerDriver.ts:152-157`),
  which is the right call; this is the item to resolve before that gate comes off.

---

### F14 — `protocol.md` §2.2 documents a log severity token the firmware never sends and the parser does not accept. **TRACED**

`protocol.md` §2.2 states: *"`<SEVERITY>` is one of the tally firmware's log levels as
plain text (e.g. `INFO`, `WARNING`, `ERROR`)"*.

Both implementations use `WARN`, not `WARNING`:

- Device: `tally/src/my-log-buffer.lua` defines `WARN = "WARN"`, and
  `my-log.lua:35` maps `warning = createLog(buffer.WARN)`, so the wire token is `WARN`.
- Hub: `shared/tally/CommandParser.ts:59` accepts exactly `"INFO" | "WARN" | "ERROR"`;
  anything else logs a console warning and is **downgraded to `ERROR`**.

The two sides agree. The document is wrong. That matters more than a typo normally
would, because §2.2's stated purpose is to let someone re-implement either side from
the doc alone — and doing so from `WARNING` would silently produce every warning
logged as an error in the hub UI.

While confirming this I checked the rest of the wire format against the source and
found no other mismatch: the 25/34-character variants, `padStart(3,"0")` /
`padStart(2,"0").toUpperCase()`, the `0xAA`/125 and `0x80`/250 constants, the
`tally-ho "<name>"` and `log "<name>" <SEV> "<msg>"` shapes, the trailing `\n`, the
non-fatal `InvalidCommandError` handling, and the 3000/30000 ms hub-side thresholds all
match `CommandCreator.ts`, `CommandParser.ts`, `UdpTallyDriver.ts` and
`AppConfiguration.ts` exactly as documented.

The doc's own note that the 3 s timeout is *"computed completely independently on each
side — nothing enforces they stay in sync"* is accurate and remains true: `my-tally.lua`
hardcodes 3,000,000 µs, `AppConfiguration.ts:61` hardcodes `tallyTimeoutMissing = 3000`,
and `setTallyTimeoutMissing()` (`:348`) lets the hub side be moved at runtime with no
mechanism to tell the device. `server.ts:88` already exercises that divergence in test
mode (sets it to 1000 ms).

---

### F15 — Smaller lifecycle and hygiene items

Grouped because individually none of these will lose a show. All **traced** unless noted.

- **`getLocalFiles()` is awaited outside the `try` that guards it** —
  `NodeMcuConnector.ts:206` (`getDevice`) and `:255` (`program`). This is the exact
  shape of the bug fixed yesterday. It is *mostly* closed because `getLocalFiles`
  returns `[]` on `readdir` failure, but the `Promise.all(fs.stat(...))` at `:118-125`
  can still reject if a firmware file disappears between `readdir` and `stat`. That
  rejection escapes `getDevice()`, and `server.ts:336` calls it with `.then()` and no
  `.catch()` → unhandled rejection. Narrow trigger, familiar shape, one `try` away.
- **Three socket handlers in `server.ts` invoke async work with no error path** —
  `:336` (`flasher.device.get`), `:341` (`flasher.settingsIni`), `:347`
  (`flasher.program`). The latter two discard the returned promise entirely. `program()`
  and `writeTallySettingsIni()` do catch internally and return `false`, so today these
  are latent rather than live; `getDevice` is the one with a real path, above.
- **`TallyContainer.highlight()` schedules an untracked `setTimeout`**
  (`TallyContainer.ts:120`). Highlighting the same tally twice inside the 1000 ms window
  leaves two pending timers, and the first de-highlights early — the operator's second
  highlight visibly ends short. Also never cleared on shutdown. Cosmetic; the operator
  is standing at the hub when it happens.
- **`UdpTallyDriver.lastTallyReport` is never pruned** (`:16`). Keyed by tally name and
  written on every packet (`:105`); `TallyContainer.remove()` does not clear the
  corresponding entry. Bounded by the number of distinct tally names ever seen, so this
  is a leak in name only over a broadcast.
- **`WebTallyDriver.sockets` keeps an entry per tally name forever**
  (`WebTallyDriver.ts:16`), never removed when the tally is removed. The per-socket
  `disconnect` handler (`:84`) does empty the array, so no socket is retained.
- **`WebTallyDriver.subscribe()` registers its `disconnect` listener at `:84`, before
  the `if (tally)` check at `:88`.** On the unknown-tally error path a listener is added
  for a subscription that was refused. Harmless (`unsubscribe` is a no-op for an absent
  entry), but it is one line out of order.
- **`SocketAwareEvent.unregister()` removes the emitter listener but not the
  `socket.on("disconnect")` listener it added** (`SocketAwareEvent.ts:38, 47`). Only
  ever called from that same disconnect handler, so nothing accumulates in practice.
- **`NodeMcuConnector.withMutex()`'s polling interval has no timeout** (`:52`). If the
  mutex is held by an operation that never completes, the interval polls at 10 Hz
  forever and the caller's promise never settles — the flasher UI hangs with no error.
  Separate from F4, same function.
- **`getDevice()` assigns a raw `Error` object to `tallyDevice.errorMessage`**
  (`:246`). `JSON.stringify(new Error("x"))` is `{}`, so the UI receives an empty
  error. This is the concrete blocker behind the "Loud UI failure for the flasher
  lazy-load stub" item already in `DECISIONS.md`; noting the mechanism, not
  re-litigating the decision.

---

## 2. Security

Proportionate to what this is: a LAN appliance on a production network.

**Nothing I found is worse than the plaintext-OBS-password item already flagged as an
open decision.** I did not re-litigate that one.

Two things worth stating, neither new:

- The config socket pushes the full `ObsConfiguration` to **every** browser that emits
  `events.config.subscribe` (`server.ts:182`), with no authentication of any kind on the
  socket. Same for the vMix/ATEM/Feelworld addresses. That is the known item.
- The device-side WiFi PSK is handled the same way in the other direction:
  `flasher.settingsIni` (`server.ts:341`) accepts a full `tally-settings.ini` string —
  including `station.password` — from any connected browser and writes it to hardware
  over serial. It is never persisted server-side and never echoed back, so it is
  strictly narrower than the OBS case, but it means the WiFi PSK crosses the unauthenticated
  socket in plaintext too.

There is no authentication, no origin check, and no rate limit on any socket event.
For a hub bound to all interfaces on a venue LAN that means anyone on the network can
re-patch every tally, switch the mixer, or trigger a firmware flash. Given this class
of product that is probably the accepted design, and it is unchanged by the rebuild —
I am recording it, not proposing it as a finding.

No injection, path traversal, or deserialization issue found. `AppConfiguration.fromJson`
and the `Configuration.load*` helpers type-check every field and log rather than throw
on bad input. The `execute()` Lua command strings in `NodeMcuConnector` interpolate
filenames (`:430`, `:437`) that come from the firmware directory listing and a fixed
constant, not from user input.

---

## 3. What I did not find

Stated so the absence is on the record rather than implied:

- I found no case of the specific `useSocketInfo` shape — *seed state at construction,
  subscribe afterwards, miss the event in between* — in server code. Every
  `events.*.subscribe` handler in `server.ts` registers its pipes **before** emitting the
  current snapshot (`:133-136`, `:148-153`, `:177-187`, `:199-201`, `:229-238`,
  `:247-249`), which is the safe order. The server is single-threaded and the emit is
  synchronous within the handler, so there is no gap. That bug class is genuinely absent
  here. F10 is a different failure (the event is never sent at all), not the same one.
- Construction order in `server.ts` is safe for the same reason but by a different
  mechanism: `AppConfigurationPersistence` (`:91`) loads config and fires
  `config.changed` before `TallyContainer` (`:94`) and `MixerDriver` (`:98`) exist, so
  those events land on an empty listener set — but both constructors read
  `configuration.getTallies()` / `getMixerSelection()` **directly** rather than relying
  on the event. Correct, though it is correct by construction rather than by design, and
  a fourth consumer added later would not inherit the property.
- `AppConfiguration.fromJson`'s `channelsByMixer` migration (`:129-143`) is correct.
  `loadString("mixer", ...)` runs first, so the legacy flat `channels` array is keyed to
  the mixer that was selected when it was written, exactly as its comment claims. I
  looked specifically for the off-by-one where the migration keys to `""`; it is not
  there.
- The atomic write in `AppConfigurationPersistence.save()` is correct as written
  (temp + `rename`), and `server.ts:403` correctly persists before closing sockets,
  closing the debounce-window hole the Electron work identified.
- `UdpTallyDriver.close()` clears both intervals and releases the socket correctly.
  I checked every other `setInterval`/`setTimeout` in the server tree for the same
  untracked-handle problem; the remaining ones are F15's `highlight()` timeout and
  `withMutex()`'s poller. All connector intervals are cleared in their `disconnect()`.

---

## 4. Suggested order of work

Ranked by (likelihood × damage), which is not the same as ranked by effort — the top
item is also close to the cheapest.

1. **F1** — one line in `MixerCommunicator.notifyMixerIsDisconnected()` covers all six
   connectors. Highest damage, lowest cost, and it makes the `unknown` state reachable
   for the first time in the situation it was designed for.
2. **F3, F4, F5, F6, F7** — the five unhandled-rejection / uncaught-exception paths.
   Each is one `.catch()` or one `try`. F3 and F4 are the ones on routine paths.
3. **F2** — `RolandV8HD` liveness. Needs a design decision (watchdog on inbound MIDI,
   or treat a missed poll response as loss), not just a line.
4. **F11** — one line (`this.client = client` after the reconnect), but confirm against
   `VmixConnector.spec.js` once its `::1` defect is fixed.
5. **F8, F9, F10, F12, F13** — real, each needs a small design call rather than a
   mechanical fix.
6. **F14** — doc correction, `WARNING` → `WARN`.
7. **F15** — hygiene, at leisure.

The recurring structural cause behind F1, F2, F10 and F12 is that
`shared/mixer/interfaces.ts`'s `Connector` contract is three methods and says nothing
about **when** a connector must report loss, or what it must do to program state when it
does. Nine implementations have made nine different choices. If one thing changes beyond
the individual fixes, it should be that contract — and a shared connector test suite run
against all nine, which is the only way this class of divergence stops recurring.
