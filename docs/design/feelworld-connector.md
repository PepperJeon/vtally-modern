# Feelworld Connector — Design Doc

Status: **design only, net-new feature, no hardware access yet**. Nothing here has been implemented or tested against a physical switcher.

## 0. Why this doc exists and its legal constraint

The lost v1.0.0 README and the `tallylite-web` marketing site both list Feelworld as a supported mixer. No implementation of that survives anywhere — not in the recovered `wifi-tally` fork, not in any local copy. This is **net-new work**, not a restoration.

The wire protocol used here was learned by reading [`redyau/multitally`](https://github.com/redyau/multitally) (`lib/api.dart`), a Dart tally client. **That repository publishes no LICENSE file**, which under default copyright means "all rights reserved" — we have no license to copy its code. Protocol facts (byte layout, command numbers, checksum algorithm) are not copyrightable; the specific expression (variable names, control flow, comments, file structure) is. This doc and the eventual implementation:

- describe the protocol in prose and hex tables, not by transcribing Dart source,
- are independently corroborated below against a second, MIT-licensed source, and
- must be implemented from this description, not by porting `api.dart`.

**Do not open `multitally`'s `lib/api.dart` side-by-side with the vTally implementation while writing it.** Read it once to extract facts, close it, write independently.

## 1. Protocol reference

### 1.1 Corroboration status

Two independent sources were checked against the protocol summary handed down from the plan:

| Source | License | What it gave us |
|---|---|---|
| `redyau/multitally` `lib/api.dart` | **None published** — facts-only, no code reuse | Original protocol description (frame layout, checksum, connect/tally commands) |
| [`bitfocus/companion-module-rgblink-mini`](https://github.com/bitfocus/companion-module-rgblink-mini) `api/rgblinkapiconnector.js` + `api/rgblinkminiconnector.js` | **MIT** (verified via `package.json`) | Independent implementation of the *same 19-byte frame family*, for the RGBlink mini — same lineage RGBlink hardware Feelworld's L-series is built on. Confirms frame layout, checksum algorithm, and connect command **byte-for-byte** against a real captured example. Also reveals detail the plan didn't have: command correlation, flow control, and a caveat about the tally response shape. |

Everything below is marked **CONFIRMED** (both sources agree, or the Companion module shows it against a real logged frame) or **ASSUMPTION** (only `multitally` says it, unverified against real hardware or a second source).

Official Feelworld manuals for the L1 and L2 Plus (checked via B&H's hosted PDF and ManualsLib) document only the XPOSE / Feelworld Live app-based control path and IP/subnet setup. They do not publish this UDP protocol. No Bitfocus Companion module exists for Feelworld switchers as of this writing — only a `companion-module-requests` issue for the L4 (a different, unrelated model that uses a completely different hex-command protocol, `A5E9...`, not this one). So there is no direct third-party source for the *Feelworld* L1/L2 Plus specifically; corroboration is by protocol family (RGBlink), which is the best available evidence short of a packet capture from real hardware.

### 1.2 Frame layout — CONFIRMED

Fixed 19-byte ASCII frame, both directions:

```
offset:  0    1    2-3   4-5   6-7   8-9   10-11 12-13 14-15 16-17  18
byte:    '<'  T/F  ADDR  SEQ   CMD   DAT1  DAT2  DAT3  DAT4  SUM    '>'
```

- `'<'` and `'>'` are literal start/end markers.
- Byte 1 is `'T'` for a transmitted (host→device) frame, `'F'`(eedback) for a device→host response. This matches the plan's summary and is confirmed byte-for-byte by the Companion module's field table.
- Every other field is two uppercase hex ASCII digits representing one byte (`ADDR`, `SEQ`, `CMD`, `DAT1`..`DAT4`, `SUM`) — 7 payload bytes + 1 checksum byte, 8 bytes total, hex-encoded to 16 characters, plus the 3 framing characters = 19.

### 1.3 Checksum — CONFIRMED

```
SUM = (ADDR + SEQ + CMD + DAT1 + DAT2 + DAT3 + DAT4) mod 256
```

Sum the 7 raw byte values (not their hex string forms), truncate to the low 8 bits, format as 2 uppercase hex digits. The Companion module implements exactly this and validates every inbound frame by recomputing it. `'<'`, the T/F marker, the SUM field itself, and `'>'` are excluded from the sum.

**Worked example (hand-computed):** a connect frame with `ADDR=0x00 SEQ=0x00 CMD=0x68 DAT1=0x66 DAT2=0x01 DAT3=0x00 DAT4=0x00`:

```
SUM = 0x68 + 0x66 + 0x01 = 0xCF
frame = "<T00006866010000CF>"
```

This exact byte sequence (as an `F`-prefixed response, `<F00006866010000CF>`) appears as a literal example in the RGBlink mini connector's source, confirming both the checksum math and the connect command bytes independently of `multitally`.

### 1.4 Sequence numbers — CONFIRMED

`SEQ` is an 8-bit counter, starts at 0, increments per sent frame, **wraps from 0xFF back to 0x00** (not to 1 — genuine wraparound to zero). Its role: correlate a response to the request that produced it. The Companion module correlates on the substring `ADDR+SEQ+CMD` (6 hex chars) rather than SEQ alone — worth adopting, since ADDR is constant in our single-device case but CMD distinguishes concurrent request types if we ever pipeline more than one outstanding request.

The plan's phrasing — "response's seq must equal the request's" — is correct but incomplete: it's really "response's ADDR+SEQ+CMD must equal the request's" as the correlation key, with SEQ as the primary rotating discriminator.

### 1.5 Read/write flag on DAT1 — CONFIRMED (as a family convention)

The plan's "`dat1 |= 1` = read" is confirmed as a real convention in the RGBlink family, but it's per-command-pair, not a universal single bit: e.g. PIP mode is `0x1E` write / `0x1F` read, source switch is `0x02` write / `0x03` read — always "even = write, odd = read" for that command's DAT1 pair. It does **not** apply to the tally-status command (`DAT1=0x40`, no `0x41` variant is used — 0x40 already means "read this status").

### 1.6 Connect / handshake — CONFIRMED

Request: `CMD=0x68 DAT1=0x66 DAT2=0x01 DAT3=0x00 DAT4=0x00` ("connect"). `DAT2=0x00` with the same CMD/DAT1 is disconnect.

```
seq=0x00: <T00006866010000CF>
```

Success is layered:
1. **Base-protocol success** (CONFIRMED pattern, both sources): a response frame arrives whose `ADDR+SEQ+CMD` matches the request within the timeout window.
2. **Application-level success** (CONFIRMED via Companion module, not stated by `multitally`): the response's `DAT2` should be `0x01` (connected) — if the device echoes `DAT2=0x00` back to a connect request, or something unexpected, treat it as a rejected/failed handshake even though the frame correlated. **This is a detail `multitally` omitted; treat it as belt-and-suspenders on top of, not a replacement for, sequence correlation.**

### 1.7 Tally / program-preview status — CONFIRMED core, ASSUMPTION on response shape

Request: `CMD=0xF1 DAT1=0x40 DAT2=0x01 DAT3=0x00 DAT4=0x00`.

```
seq=0x01: <T0001F14001000032>
  (SUM = 0xF1 + 0x40 + 0x01 = 0x132 -> 0x32 mod 256)
```

This matches the plan exactly and is corroborated by the Companion module ("special status 22" request uses the identical `F1, 40, 01, 00, 00`).

**Where the two sources diverge — flag this loudly:**

- **`multitally`'s claim** (per the plan): the tally request gets **two 19-byte response datagrams**; read `resp[0]` and `resp[2]` off "the second" one for program/preview.
- **RGBlink mini's actual behavior** (per the Companion module source): the device sends a standard 19-byte **acknowledgement** frame first (`F140011600` — note `DAT3=0x16`= decimal 22, i.e. "22 bytes of status coming"), and then a **separate, non-standard 22-byte payload** that does *not* follow the `<T/F...>` frame format at all. Inside that raw 22-byte payload, **byte index 0 is preview** and **byte index 2 is program**, each a value 0–3 that gets +1'd to produce input number 1–4. The RGBlink code also notes program-status-via-this-path is unreliable ("feedback for PGM contains bad data") and falls back to remembering what was last commanded instead of trusting the device's echo.

These are not necessarily contradictory — "two 19-byte frames" and "one 19-byte ack + one raw 22-byte frame" could both be surface descriptions of the same underlying UDP behavior (a 19-byte frame and a 22-byte frame, with `multitally` possibly treating the 22-byte one loosely as "frame-shaped" since it also starts with a marker byte in practice). **We do not know which description is accurate for Feelworld firmware without capturing real traffic.** Both possibilities must be handled defensively:

- **ASSUMPTION A** (`multitally`-shaped): two 19-byte frames, `program = second[0]`, `preview = second[2]` (as literal byte values, no +1 — the plan doesn't mention an offset).
- **ASSUMPTION B** (RGBlink-shaped): one 19-byte ack + one 22-byte raw payload, `preview = payload[0] + 1`, `program = payload[2] + 1`.

The parser (§4) must be written to detect frame length on receipt and route to the correct decode path, and the test suite (§4) must include fixtures for **both** shapes so that whichever one real hardware turns out to use, the existing test proves the parser handles it — this is exactly the situation the ship-gate in §5 exists for.

### 1.8 UDP port — ASSUMPTION, unresolved

Neither source gives a Feelworld-specific default port. `multitally`'s Dart source (not re-quoted here per the legal constraint) is presumably configured per-device by its users rather than hardcoded; the RGBlink Companion module defaults to port **1000** but exposes it as a required user-entered config field, implying "we don't actually know the fixed port, ask the operator." **Do not assume 1000 works for Feelworld** — treat port as a required, user-supplied `IpPort` field with no meaningful default (or default to 1000 purely as a starting guess, clearly labeled as such in the settings UI help text).

### 1.9 Address field — ASSUMPTION

`ADDR` defaults to `0x00` in both sources for a single-device link. Multi-device addressing (RS-485-style daisy chains under one IP, which some RGBlink docs imply exist) is out of scope — hardcode `ADDR=0x00`.

## 2. Fit with vTally's existing architecture

All paths below are relative to `hub/src/` in the current (pre-Phase-1-reorg) tree. If Phase 1's `src/server` / `src/client` / `src/shared` split lands first, `Configuration` classes and the `*.ID` constant move to `src/shared/mixer/feelworld/`, the connector moves to `src/server/mixer/feelworld/`, and the settings component moves to `src/client/mixer/feelworld/react/` — the registration points and code themselves are unaffected, only their directory.

### 2.1 New files

| File | Mirrors | Purpose |
|---|---|---|
| `hub/src/mixer/feelworld/FeelworldConfiguration.ts` | `mixer/rolandV60HD/RolandV60HDConfiguration.ts` | `ip`, `port`, `requestInterval` fields; `fromJson`/`toJson`/`clone`; extends `Configuration` |
| `hub/src/mixer/feelworld/FeelworldConfiguration.spec.ts` | `RolandV60HDConfiguration.spec.ts` | Unit tests for the getters/setters/round-trip above |
| `hub/src/mixer/feelworld/FeelworldConnector.ts` | `mixer/rolandV60HD/RolandV60HDConnector.ts` | Implements `Connector` (§2.2 below has the design, it is **not** a copy of Roland's HTTP-polling shape — UDP needs its own socket lifecycle, see §3) |
| `hub/src/mixer/feelworld/FeelworldConnector.spec.ts` | `mixer/vmix/VmixConnector.spec.js` (mock server pattern) | Spins up a real mock UDP server, see §4 |
| `hub/src/mixer/feelworld/react/FeelworldSettings.tsx` | `mixer/rolandV60HD/react/RolandV60HDSettings.tsx` | Settings form: IP, port, request interval |

### 2.2 `Connector` / `Configuration` contract (`hub/src/mixer/interfaces.ts`)

```ts
export interface Connector {
    connect() : void
    disconnect() : void
    isConnected(): boolean
}

export abstract class Configuration {
    abstract fromJson(data: object): void
    abstract toJson(): object
    abstract clone(): Configuration
    // + protected loadIpAddress/loadIpPort/loadNumber/loadString helpers
}
```

`FeelworldConfiguration` extends `Configuration` exactly like `RolandV60HDConfiguration` does — same three fields (`ip: IpAddress`, `port: IpPort`, `requestInterval: number`), same `loadIpAddress`/`loadIpPort`/`loadNumber` helper usage, same `defaultIp`/`defaultPort`/`defaultRequestInterval` static pattern. No new fields needed for v1 (no `ADDR` config — hardcoded per §1.9).

`FeelworldConnector implements Connector`. `connect()`/`disconnect()`/`isConnected()` — see §3 for what happens inside, since unlike Roland (HTTP `http.get` per poll, no persistent connection object) this needs a persistent UDP socket plus in-flight request bookkeeping.

### 2.3 What must be notified — `hub/src/lib/MixerCommunicator.ts`

The connector receives a `MixerCommunicator` in its constructor (same as every other connector) and must call, on the same cadence Roland does:

- `communicator.notifyMixerIsConnected()` — once, when the connect handshake (§1.6) succeeds.
- `communicator.notifyMixerIsDisconnected()` — when a poll cycle times out / errors (see §3.4 for exactly when).
- `communicator.notifyProgramPreviewChanged(programs: string[], previews: string[])` — after each successful tally poll, only if changed (the communicator already de-dupes internally via `haveValuesChanged`, so the connector can call this every poll without hand-rolled diffing — Roland does exactly this).
- `communicator.notifyChannelNames(count, names)` is **not applicable** here — Feelworld gives no input-name query in this protocol (confirmed absent from both sources); channel identity is purely numeric (§3.5), same as Roland V-60HD, which also never calls this method.

### 2.4 Registration chain — `hub/src/lib/MixerDriver.ts`

Exact edits, mirroring the existing `RolandV60HDConnector` entry:

```ts
// import
import FeelworldConnector from '../mixer/feelworld/FeelworldConnector'

// inside changeMixer(), in the if/else if chain (MixerDriver.ts:83-107):
} else if(newMixerId === FeelworldConnector.ID) {
    MixerClass = FeelworldConnector
    this.getCurrentMixerSettings = this.configuration.getFeelworldConfiguration.bind(this.configuration)
}

// getAllowedMixers (MixerDriver.ts:133-154) — see §5, DEV-ONLY GATE:
if (isDev) {
    mixers.push(FeelworldConnector.ID) // NOT in the always-on list — see ship gate
}
```

### 2.5 Config storage — `hub/src/lib/AppConfiguration.ts`

Mirror the `rolandV60HD*` touch points exactly (currently at lines 8, 23, 44, 108-109, 132, 196-203):

```ts
// import (near line 8)
import FeelworldConfiguration from '../mixer/feelworld/FeelworldConfiguration'

// field (near line 23)
feelworldConfiguration: FeelworldConfiguration

// constructor init (near line 44)
this.feelworldConfiguration = new FeelworldConfiguration()

// fromJson (near line 108-109)
if (data.feelworld) {
    this.feelworldConfiguration.fromJson(data.feelworld)
}

// toJson (near line 132)
feelworld: this.feelworldConfiguration.toJson(),

// getter/setter (near line 196-203)
getFeelworldConfiguration() {
    return this.feelworldConfiguration.clone()
}
setFeelworldConfiguration(feelworldConfiguration: FeelworldConfiguration) {
    this.feelworldConfiguration = feelworldConfiguration.clone()
    this.emitter.emit("config.changed.feelworld", this.feelworldConfiguration)
}
```

### 2.6 Socket.io wiring — `hub/src/server.ts`

Three touch points, mirroring the `rolandV60HD` pattern:

1. Import `FeelworldConfiguration` (near the other mixer config imports, ~line 21).
2. Add to the `configEvents` array (~line 124-143) and to the `events.config.subscribe` initial-state emit (~line 144-155):
   ```ts
   new SocketAwareEvent(myEmitter, 'config.changed.feelworld', socket, (socket, feelworldConfiguration) => {
       socket.emit('config.state.feelworld', feelworldConfiguration.toJson())
   }),
   // ...
   socket.emit('config.state.feelworld', myConfiguration.getFeelworldConfiguration().toJson())
   ```
3. Add the inbound change handler (~line 278-286, next to `config.change.rolandV60HD`):
   ```ts
   socket.on('config.change.feelworld', (newFeelworldConfiguration, newMixerName) => {
       const feelworld = new FeelworldConfiguration()
       feelworld.fromJson(newFeelworldConfiguration)
       myConfiguration.setFeelworldConfiguration(feelworld)
       if (newMixerName) {
           myConfiguration.setMixerSelection(newMixerName)
       }
   })
   ```

### 2.7 Client-side config tracking — `hub/src/hooks/tracker/config.ts`

Mirror the `rolandV60HD` block (currently lines 7, 20, 53-56):
```ts
import FeelworldConfiguration from '../../mixer/feelworld/FeelworldConfiguration'
// field
feelworldConfiguration?: FeelworldConfiguration
// handler
socket.on('config.state.feelworld', (feelworld) => {
    this.feelworldConfiguration = new FeelworldConfiguration()
    this.feelworldConfiguration.fromJson(feelworld)
    this.emit('feelworld', this.feelworldConfiguration)
})
```

### 2.8 Client-side hook — `hub/src/hooks/useConfiguration.ts`

Mirror `useRolandV60HDConfiguration()` (currently lines 125-141) as `useFeelworldConfiguration()` — same `useState` + `configTracker.on('feelworld', ...)`/`.off(...)` shape, subscribing to the `'feelworld'` event added in §2.7.

### 2.9 Settings UI — `hub/src/mixer/rolandV60HD/react/RolandV60HDSettings.tsx` pattern

`FeelworldSettings.tsx` follows the identical structure: `useFeelworldConfiguration()`, three `ValidatingInput`s (`ip`, `port`, `requestInterval`), `MixerSettingsWrapper` with `testId="feelworld"`, `socket.emit('config.change.feelworld', config.toJson(), props.id)` on save, `defaultProps = { id: "feelworld", label: "Feelworld" }`. No fields beyond Roland's three are needed (no channel-count override — Feelworld's channel count is fixed, see §3.5).

Register in `hub/src/pages/ConfigPage.tsx`: import and add `<FeelworldSettings />` inside `<MixerSelection>`, alongside the existing entries (line 23 area). **This is gated by the same dev-only mechanism as §5** — `MixerSelection`'s child list should only render settings for mixers `MixerDriver.getAllowedMixers()` actually returns for the current mode, so no separate UI-side gate is needed if §5's gate is implemented correctly; verify this assumption holds by checking `MixerSelection.tsx` before wiring it in.

## 3. Design decisions and rationale

### 3.1 Poll interval

Roland V-60HD's default is **250ms**, chosen for 8 sequential HTTP requests per cycle against an embedded HTTP server. Feelworld's tally query is a **single** UDP round-trip per poll (one `CMD=0xF1` request covers all inputs at once — unlike Roland's per-input polling), so the flooding concern is lower per-cycle, but UDP has no built-in backpressure and small embedded devices (Feelworld L1/L2 Plus target market) can still be overwhelmed by a tight loop with no rate limiting.

The RGBlink Companion module — the closest real-world reference for *this exact device family* — defaults its status polling to **once per second (1000ms)**, explicitly slower than Roland's 250ms, and separately caps outstanding unanswered commands at 5 with a 15-second expiry. That's strong evidence a fast poll rate is not necessary or advisable for this hardware class.

**Decision:** default `requestInterval = 1000ms` (not 250ms like Roland), configurable via the same `ValidatingInput` field Roland exposes, so an operator with a switcher that tolerates faster polling can lower it. Document in the settings UI that going much below 1000ms is unverified and may overwhelm the device, mirroring the RGBlink module's conservative default.

### 3.2 UDP socket lifecycle: persistent, not per-request

`multitally`'s Dart implementation reportedly opens and closes a UDP socket per request (per the task brief) — wasteful, and also fragile: a fresh socket each time means no way to distinguish "device didn't answer this specific request" from "device is unreachable," and it defeats OS-level socket reuse.

The RGBlink Companion module's approach — **one long-lived UDP socket for the life of the connection**, created in `connect()`/`createSocket()`, destroyed in `disconnect()`/`onDestroy()` — is safe here specifically *because* of the sequence-number correlation scheme (§1.4): a persistent socket lets us track exactly which outstanding requests haven't been answered yet (matching the RGBlink module's `SentCommandStorage` pattern), which a per-request socket cannot do across requests.

**Decision:** one `dgram.createSocket('udp4')` per `FeelworldConnector` instance, opened in `connect()`, closed in `disconnect()`. `vTally` already has a working reference for a persistent `dgram` socket in `hub/src/tally/UdpTallyDriver.ts` (bind + `on('message')` + `on('error')`) — model the connector's socket setup on that, not on Roland's HTTP-per-poll shape, since this is the codebase's only existing example of long-lived `dgram` usage.

### 3.3 Sequence number wraparound at 0xFF

Confirmed (§1.4): SEQ wraps `0xFF -> 0x00`. Because we run one poll at a time (no request pipelining planned for v1 — see §3.6), wraparound only matters if a very old, very late response arrives after SEQ has wrapped all the way around and collides with a new request's SEQ. Given a 1000ms+ poll interval and a LAN-local UDP round-trip (sub-10ms typically), 256 polls take at least 256 seconds to wrap — collisions this way are exceptionally unlikely, but the timeout policy in §3.4 (discard anything outside its request window) means even a collision is harmless: a stray late response either gets ignored (its correlation key no longer matches an outstanding request) or, in the pathological case, gets matched to the wrong outstanding request. **Mitigation:** never have more than one outstanding tally request in flight at once (see §3.6) — this makes collision impossible by construction, sidestepping the need for a request-id disambiguation scheme entirely. Simpler than what the RGBlink module does (which allows up to 5 outstanding) because we don't need that module's throughput.

### 3.4 Timeout, retry, and connection-loss detection

There is no protocol-level keepalive (confirmed absent in both sources — RGBlink module explicitly has no reconnect-on-error logic; connectivity is inferred purely from whether polls get answered).

**Decision**, modeled on Roland's `processResponseError`/reconnect-via-next-successful-poll pattern, adapted for UDP's fire-and-forget nature (no `error` event fires for "nobody answered," only for local socket errors like EADDRINUSE):

- Each poll: send the tally request, start a timeout timer (**suggest 3x the request interval, minimum 1500ms**, so a single slow response doesn't flap the connection state).
- If a response correlates before the timeout: cancel the timer, parse it (§1.7 dual-path parser), call `notifyProgramPreviewChanged`, and if `connected === false`, flip to `true` and call `notifyMixerIsConnected()` (same "reconnect on next good response" pattern Roland uses).
- If the timeout fires with no correlated response: if `connected === true`, flip to `false` and call `notifyMixerIsDisconnected()`. Do **not** retry immediately — just let the next scheduled poll (§3.1 interval) try again. This mirrors Roland's model of "polling interval is also the retry interval," and avoids building a separate retry/backoff mechanism nobody asked for.
- The `dgram` socket's own `'error'` event (bind failure, ENETUNREACH, etc.) should also trigger `notifyMixerIsDisconnected()` immediately, not wait for a timeout.

No exponential backoff, no jitter — the RGBlink reference doesn't do this either, and a fixed 1s+ interval against a single LAN device doesn't warrant it. `// ponytail: fixed-interval retry, add backoff only if this connector is ever used against many devices at once or over a lossy link`.

### 3.5 Input → channel mapping

Neither source states Feelworld's input count. RGBlink mini is a 4-input device (per its manuals); Feelworld L1/L2 Plus are marketed as 4–8 input switchers depending on model (L1: 4, L2 Plus: up to 8 per public listings — **unverified against an authoritative Feelworld spec doc**, flagged as ASSUMPTION). Roland V-60HD hardcodes 8 channels (`input_status: number[8]`, loop `i < 8`).

**Decision:** do not hardcode a channel count. Decode whatever program/preview input numbers the tally response actually contains (§1.7) and pass them straight through as `programs`/`previews` string arrays to `notifyProgramPreviewChanged`, exactly as Roland does with its already-filtered `programs`/`previews` arrays. If the device reports input 5 on a 4-input model, that's the device's problem to report correctly, not ours to clamp — matches the "read what's there" behavior implicit in `notifyProgramPreviewChanged`'s generic `ChannelList` (string[] | null) type, which has no fixed-size assumption baked in.

### 3.6 No request pipelining

Only one outstanding tally request at a time (contrast with RGBlink's "up to 5 outstanding"). Simpler, sidesteps §3.3's wraparound concern, and matches this connector's actual need — one query type, one device, no reason to overlap requests.

## 4. Test plan without hardware

### 4.1 Mock UDP server

Mirror `VmixConnector.spec.js`'s pattern (real server bound to `port: 0` on `localhost`, connector points at the OS-assigned ephemeral port, `MockCommunicator` capturing `notifyProgramPreviewChanged`/`notifyMixerIsConnected`/`notifyMixerIsDisconnected` calls) and `RolandV60HDConnector`'s reconnect-on-next-success behavior, but over `dgram` instead of `net`/`http`:

```ts
// FeelworldConnector.spec.ts — sketch, not final code
const mockServer = dgram.createSocket('udp4')
mockServer.on('message', (msg, rinfo) => {
    const frame = msg.toString()
    // parse ADDR/SEQ/CMD/DAT1-4 from the incoming frame (test helper, independent
    // of the connector's own parser — do NOT import the connector's parsing code
    // here, or a bug in both would cancel out undetected)
    if (cmd === '68') {
        mockServer.send(buildResponse({ addr, seq, cmd, dat1: '66', dat2: '01', dat3: '00', dat4: '00' }), rinfo.port, rinfo.address)
    } else if (cmd === 'F1') {
        // configurable per-test: respond with Assumption-A shape or Assumption-B shape
    }
})
mockServer.bind(0, 'localhost')
```

Tests, each independently toggleable per the two response-shape assumptions in §1.7:

1. **Framing/checksum on send** — mock server asserts every frame it receives from the connector is exactly 19 bytes, matches `<T{ADDR}{SEQ}{CMD}...{SUM}>`, and that `SUM` is correct for the payload (catches an off-by-one in checksum math before it ever reaches real hardware).
2. **Sequence handling** — assert SEQ increments by 1 per sent frame and wraps `0xFF -> 0x00` after 256 sends (drive the connector through 260 poll cycles with `vi.useFakeTimers()`/interval mocking, don't literally wait 260 seconds).
3. **Connect success/failure** — mock responds with `DAT2=0x01` → `notifyMixerIsConnected()` called; mock responds with `DAT2=0x00` (or doesn't respond at all) → connector stays/reports disconnected.
4. **Tally parsing, shape A** — mock returns two standard 19-byte frames; assert `notifyProgramPreviewChanged` gets the right program/preview arrays from `second[0]`/`second[2]`.
5. **Tally parsing, shape B** — mock returns one 19-byte ack + one raw 22-byte payload; assert the same, decoded via `payload[0]+1`/`payload[2]+1`.
6. **Timeout behavior** — mock server stops responding mid-test; assert `notifyMixerIsDisconnected()` fires after the timeout window (§3.4) and not before; assert a subsequent good response flips it back via `notifyMixerIsConnected()`.
7. **Checksum rejection** — mock sends back a frame with a deliberately wrong SUM; assert the connector drops it (logs a warning, does not call any `notify*`) rather than parsing garbage.
8. **Config round-trip** — `FeelworldConfiguration.spec.ts`, structured exactly like `RolandV60HDConfiguration.spec.ts`: get/set for `ip`/`port`/`requestInterval`, default restoration on `null`, `fromJson`/`toJson`/`clone`.

### 4.2 What cannot be validated without a physical Feelworld L1 or L2 Plus

- **Which of §1.7's Assumption A or B is real.** This is the single most important open question and it is *not* determinable from any documentation, mock, or code reading — only a packet capture (Wireshark) against real Feelworld hardware, or a manufacturer protocol doc, resolves it.
- Whether Feelworld's firmware even uses `ADDR=0x00`/port defaults, or requires per-unit configuration the way RGBlink's Companion module implies.
- Real-world UDP round-trip latency and packet loss characteristics on actual Feelworld hardware over Wi-Fi vs. wired — this determines whether the 1000ms/1500ms defaults in §3.1/§3.4 are well-tuned or need adjustment.
- Whether the device's own tally-relay behavior (if it has one, unconfirmed) interacts with our polling in any surprising way.
- Actual input count per model (L1 vs. L2 Plus) — §3.5 is designed not to need this, but it should still be confirmed to write accurate documentation/marketing copy later.
- Any firmware-version-dependent protocol differences (the RGBlink module's HELP.md explicitly calls out firmware-version behavior differences within just the RGBlink mini family, e.g. mini-edge extra polling commands) — Feelworld may have similar version skew.

## 5. Ship gate

**Status quo:** `tallylite-web` and the lost v1.0.0 README already advertise Feelworld support. That claim is currently **unbacked by any code** — flag this as a live marketing/reality mismatch to whoever owns those surfaces; it predates this design doc and isn't fixed by writing this doc.

Until this connector is verified against a real Feelworld L1 or L2 Plus (specifically: §4.2's open questions are answered, especially which tally-response shape is real), it **must not** be listed as supported anywhere, and must not ship where general users can select it.

**Mechanism**, mirroring how `MockConnector` is already dev-gated in `MixerDriver.getAllowedMixers` (`hub/src/lib/MixerDriver.ts:133-154`):

```ts
static getAllowedMixers = function(isDev: boolean, isTest: boolean) {
    let mixers = [
        MockConnector.ID,
        TestConnector.ID,
        NullConnector.ID,
        AtemConnector.ID,
        ObsConnector.ID,
        RolandV8HDConnector.ID,
        RolandV60HDConnector.ID,
        VmixConnector.ID,
    ]
    if (!isDev) {
        mixers = mixers.filter(id => id !== MockConnector.ID && id !== FeelworldConnector.ID)
    }
    // ...
}
```

i.e. `FeelworldConnector.ID` is **only ever added to the mixer list conditionally on `isDev`**, exactly like `MockConnector` — never added to the unconditional base array the way `RolandV60HDConnector` is. This makes it invisible in `MixerSelection` for production builds (assuming §2.9's assumption about `MixerSelection` deriving from `getAllowedMixers` holds — verify before relying on it) and unreachable via `config.change.feelworld` handling on the server for non-dev instances... actually note: `changeMixer()` checks `getAllowedMixers(...).includes(newMixerId)` before switching (`MixerDriver.ts:65-68`), so even a manually-crafted socket event can't activate it outside dev mode. That's the real enforcement point, not the UI.

**To promote to production-supported**, a human must, in order:
1. Test against a real Feelworld L1 **and** a real L2 Plus (both, since §4.2 flags model/firmware skew as an open risk).
2. Resolve §1.7's Assumption A vs. B (and update `FeelworldConnector`'s parser + spec fixtures to only support the confirmed shape, deleting the speculative branch for the wrong one).
3. Confirm §1.8's port and §3.5's channel counts against real devices; update defaults/UI copy accordingly.
4. Move `FeelworldConnector.ID` out of the `isDev`-only branch into the unconditional array in `getAllowedMixers`, next to `RolandV60HDConnector.ID`.
5. Only then update `tallylite-web` / any README to claim support again — and cite the versions/models actually tested.

## 6. Implementation checklist

Each item includes its own verification step — no "verify everything at the end" batch step.

1. **`FeelworldConfiguration.ts` + `.spec.ts`** (§2.2, §2.5 fields). *Verify:* `npx vitest run` (or `jest`, whichever this phase of the project uses) green on the new spec file alone.
2. **`FeelworldConnector.ts`** — connect/disconnect/socket lifecycle only, no parsing yet; connect() opens the `dgram` socket and sends the handshake frame per §1.6/§3.2. *Verify:* manually instantiate against a throwaway `nc -ul` listener or a 5-line scratch script, confirm the exact byte string `<T00006866010000CF>` appears on the wire (matches §1.3's worked example).
3. **Checksum + frame-building helpers**, unit-tested in isolation (pure functions, no socket). *Verify:* table-driven test against 3-4 hand-computed checksums including the two worked examples in this doc.
4. **Sequence number tracking + wraparound**. *Verify:* test 4.1 item 2.
5. **Tally request/response parsing, both shape A and shape B behind a to-be-decided runtime or config flag** (§1.7). *Verify:* test 4.1 items 4 and 5, both passing independently.
6. **Timeout/reconnect logic** (§3.4). *Verify:* test 4.1 item 6, using fake timers, no real 1.5s+ sleeps in the test suite.
7. **Checksum validation on receive, reject bad frames** (§1.7 defensive parsing). *Verify:* test 4.1 item 7.
8. **`MixerDriver.ts`, `AppConfiguration.ts`, `server.ts`, `hooks/tracker/config.ts`, `hooks/useConfiguration.ts` registration** (§2.4-§2.8), with `FeelworldConnector.ID` in the **dev-only** branch of `getAllowedMixers` (§5) from the very first commit that adds it there — never land it in the unconditional list, even temporarily. *Verify:* `npm run dev` (or equivalent) with `isDev=true`, confirm Feelworld appears in the mixer dropdown; confirm it does **not** appear when running in a non-dev config (spin up the server with dev flags off and check the socket-emitted `allowedMixers` list, or add a one-line assertion test on `getAllowedMixers(false, false)`).
9. **`FeelworldSettings.tsx` + `ConfigPage.tsx` registration** (§2.9). *Verify:* Cypress/E2E smoke test opening the config page in dev mode, filling the IP/port/interval fields, saving, and confirming `config.change.feelworld` fires with the right payload — same shape as an existing `configRolandV60HD`-style Cypress spec if one exists to copy from.
10. **Full mock-server integration spec** (§4.1) exercising connect → poll → tally-change → disconnect → reconnect end to end. *Verify:* green run, plus confirm it fails loudly (not silently) if either shape-A or shape-B decoding is broken — i.e. don't let one shape's test accidentally no-op.
11. **Documentation**: update this file's §1.7/§1.8/§3.5/§4.2 "unresolved" markers to "confirmed" as real-hardware answers come in, rather than leaving stale ASSUMPTION labels once they're no longer assumptions. *Verify:* no ASSUMPTION label remains in this doc that hardware testing has actually resolved.
12. **Ship-gate promotion** (§5's 5-step list), only after 1-11 are done and a human has hardware in hand. *Verify:* `getAllowedMixers(false, false)` includes `FeelworldConnector.ID`, and a marketing-facing doc update is drafted separately (not silently — call it out to whoever owns `tallylite-web`).
