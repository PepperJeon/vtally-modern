# Tally Wire Protocol

> **Note on this file's location.** This document was requested at
> `documentation/protocol.md`; the actual (previously empty) file lives one
> level deeper, at `documentation/docs/protocol.md`, matching the rest of the
> mkdocs `docs/` tree (`docs/tally.md`, `docs/getting-started/...`). This is
> that file.

This document describes the UDP wire protocol between the **hub**
(`hub/src/tally/*`) and the **tally firmware** (`tally/src/my-tally.lua`,
running on an ESP8266/NodeMCU). It does not cover **Web Tallies** — browser
tally clients use a separate Socket.IO channel (`WebTallyDriver.ts`,
`webTally.state` events) that has no relationship to the wire format below.

Every claim here is backed by a specific line in the current source. Where
the source doesn't answer the question, that's stated explicitly as an open
question rather than guessed.

Sources read in full to write this document:

- Hub: `hub/src/tally/CommandCreator.ts`, `CommandParser.ts`,
  `UdpTallyDriver.ts`, `TallyConfiguration.ts`, `ColorScheme.ts`,
  `TallyContainer.ts`, `hub/src/domain/Tally.ts`,
  `hub/src/lib/AppConfiguration.ts`, `hub/src/flasher/TallySettingsIni.ts`
- Tally: `tally/src/my-tally.lua`
- History: `Changelog.md`

---

## 1. Transport

- **Protocol:** UDP (IPv4). Hub: `dgram.createSocket('udp4')`
  (`UdpTallyDriver.ts`). Tally: `net.createUDPSocket()`
  (`my-tally.lua`).
- **Port:** `7411` on both ends — hub's `AppConfiguration.tallyPort` default
  and the tally's hardcoded `listenPort = 7411`. They match today; nothing
  in the protocol negotiates or advertises the port, it's a shared constant
  baked into two independent codebases.
- **Who initiates:** the tally. On boot, `MyTally:connect()` opens the UDP
  socket, binds a receive handler, and immediately calls `self:sendInfo()`
  — a `tally-ho` message to the hub's configured address. The hub never
  "discovers" a tally; a tally has to announce itself first, and the hub
  learns the tally's UDP `address`/`port` from the packet it receives.
- **Tally re-announce cadence:** every **1000 ms**, unconditionally, via a
  recurring `tmr.create():alarm(1000, tmr.ALARM_AUTO, ...)` timer, as long
  as the socket is ready (`MyTally:isReady()`). This is not conditional on
  whether the tally thinks it's connected — it always re-sends `tally-ho`.
- **Hub keep-alive cadence:** every `1000 / tallyKeepAlivesPerSecond` ms,
  default **100 ms** (`tallyKeepAlivesPerSecond = 10` in
  `AppConfiguration.ts`). On this interval the hub sends the *current full
  state* to **every active tally**, regardless of that tally's own recent
  liveness — this is the only packet-loss compensation mechanism in the
  protocol. There is no ACK, no retry-on-loss, no sequence number. If a
  state packet is dropped, the tally simply gets the (still-current) state
  again at most ~100 ms later on the next keep-alive tick. The in-code
  comment on this interval: "the more keep alives you send the less likely
  it is that the tally shows a wrong state, but you send more packages over
  the network."
- **What happens on packet loss:**
  - Hub → tally: covered above — self-healing within one keep-alive
    interval (default 100 ms worst case).
  - Tally → hub: no compensation beyond the tally's unconditional 1000 ms
    `tally-ho` re-announce. If a `tally-ho` or `log` packet is lost, the hub
    simply doesn't hear it; there's no request/response, so nothing is
    retried specifically — the next scheduled `tally-ho` (≤1 s later) is
    what re-establishes liveness.
- **Hub-side liveness state machine** (`UdpTallyDriver`'s `setInterval`,
  every **500 ms**), driven purely by *time since the hub last received any
  packet from that tally*:
  - `CONNECTED` — most recent state.
  - `MISSING` — no packet received for more than `tallyTimeoutMissing`
    (default **3000 ms**).
  - `DISCONNECTED` — no packet received for more than
    `tallyTimeoutDisconnected` (default **30000 ms**).
  Both thresholds are configurable via `setTallyTimeoutMissing()` /
  `setTallyTimeoutDisconnected()`, which guard against being set below
  1000 ms, but ship with the fixed defaults above.
- **Tally-side liveness check** (independent of the hub's): the tally
  considers itself connected to the hub if it received **any** UDP packet
  within the last **3,000,000 µs (3 s)** — computed via `tmr.now()` diffing
  in `MyTally.isConnected()`, checked on the same 1000 ms timer that drives
  re-announcement. There is no explicit heartbeat/ping message; *any*
  packet from the hub (i.e., any state command) counts as "hub is alive."
  This 3 s window numerically matches the hub's `tallyTimeoutMissing`
  default, but the two are computed completely independently on each side
  — nothing enforces they stay in sync if one default changes.

---

## 2. Messages

Two message classes, one direction each. All are line-based ASCII/UTF-8 text
terminated with `\n`. There is no binary framing, no length prefix beyond
what's embedded in the fixed-width text format itself.

### 2.1 Hub → Tally: state command

Built in `CommandCreator.ts`, parsed in `tally/src/my-tally.lua`'s
`parseMessage()`. Two fixed-length variants, distinguished purely by total
string length.

#### Static color (25 characters, no flash)

```
O<opR><opG><opB> S<stR><stG><stB>
```

with each `<xx>` a **zero-padded 3-digit decimal** (`padStart(3, "0")` on
the hub side), where:

- `O###/###/###` — operator-light RGB (`op*`), separated by `/`.
- ` S###/###/###` — stage-light RGB (`st*`), separated by `/`.
- Exact character positions the Lua parser validates: index 1 = `"O"`,
  index 5 = `"/"`, index 9 = `"/"`, indices 13–14 = `" S"`, index 18 =
  `"/"`, index 22 = `"/"` (1-based, matching `data:sub(...)` in the Lua
  source).
- Total length: **25 characters**.

**Worked example** — operator light red (255,0,0), stage light green
(0,255,0):

```
O255/000/000 S000/255/000
```

#### Static color + flash pattern (34 characters)

Same 25-character prefix, followed by:

```
 0x<HH> <DDD>
```

- ` 0x` — literal marker (checked at indices 26–28).
- `<HH>` — an **8-bit flash pattern**, encoded as **2-digit uppercase
  hex** (`padStart(2,"0").toUpperCase()`, e.g. `AA`, `80`). Each bit
  represents one of 8 equal time-slices; `1` = full brightness for that
  slice, `0` = dimmed. Decoded device-side by manually testing against the
  table `{128,64,32,16,8,4,2,1}` in a loop — Lua 5.1 (what NodeMCU runs)
  has no native bitwise operators, so this table-based decomposition is a
  deliberate workaround for that language limitation, not a stylistic
  choice.
- ` ` — literal space (index 31).
- `<DDD>` — **total flash-cycle duration in milliseconds**, zero-padded to
  3 decimal digits (`padStart(3,"0")`).
- Total length: **34 characters**.

**Worked example** — `highlight` state (see §3): white light, alternating
fast (fixed `0xAA` / 125 ms in `CommandCreator.ts`):

```
O255/255/255 S255/255/255 0xAA 125
```

`0xAA` = `10101010` in binary → slices 1,3,5,7 full brightness, slices
2,4,6,8 dimmed, repeating over a 125 ms total cycle.

### 2.2 Tally → Hub: control messages

Built and parsed with the exact same `string.format` / matching regex
template on both sides (`my-tally.lua`'s `send()` methods and
`CommandParser.ts`), so no drift is possible short of someone editing only
one side.

- **Announce:**
  ```
  tally-ho "<name>"
  ```
  Sent once on boot and then every 1000 ms unconditionally (§1). `<name>`
  is the tally's configured display name (from `tally-settings.ini`,
  truncated to 26 characters since firmware v0.1-alpha3 — see
  `firmware-survey.md`).

  Worked example: `tally-ho "Camera 1"`

  On receipt, the hub calls `tallyReported()`, which is what resets the
  hub's liveness clock for that tally and (if not previously known)
  registers it.

- **Log:**
  ```
  log "<name>" <SEVERITY> "<message>"
  ```
  `<SEVERITY>` is one of the tally firmware's log levels as plain text
  (e.g. `INFO`, `WARNING`, `ERROR`). If the hub's parser doesn't recognize
  the severity token, it defaults to `"ERROR"` and logs a console warning
  — it does not reject the message.

  Worked example: `log "Camera 1" WARNING "invalid package: garbage"`

  On receipt the hub both calls `tallyReported()` (any packet counts as
  liveness) and stores the entry via `container.addLog()`, surfaced in the
  hub UI's per-tally log view.

- **Framing / exact-format footnote:** the Lua `send()` function appends a
  literal `"\n"` to every outgoing message (`listenSocket:send(port, ip,
  data .. "\n")`). This trailing newline is not part of any documented
  "spec" elsewhere and is easy to miss if re-implementing either side from
  scratch.

- **Malformed input:** if a received packet doesn't match either expected
  regex, `CommandParser.ts` throws `InvalidCommandError`. `UdpTallyDriver`
  catches this **non-fatally** — it's logged as a warning, the packet is
  dropped, and no state changes. Symmetrically, if the tally's
  `parseMessage()` gets something matching neither the 25- nor 34-char
  shape (or with a marker character in the wrong position), it returns
  `nil`, `MyLog.warning('invalid package: %s', data)` is logged locally,
  and the packet is simply discarded — the tally does **not** send any
  error back to the hub. A malformed/unrecognized packet is silent from
  the hub's point of view.

---

## 3. State semantics

### 3.1 State precedence

Computed once per tally, per keep-alive/update cycle, in
`CommandCreator.getState()`, in this fixed priority order (highest first):

1. **`highlight`** — tally has been explicitly highlighted from the hub UI
   (`TallyContainer.highlight()`), independent of program/preview state.
2. **`unknown`** — the tally is patched to a channel (`isPatched()`) *and*
   the mixer/source for that channel is disconnected — i.e., the hub can't
   determine real on-air/preview status.
3. **`on-air`** — the patched channel is currently the program/on-air
   source.
4. **`preview`** — the patched channel is currently the preview source.
5. **`release`** — fallback: none of the above (patched but neither
   program nor preview, or unpatched).

### 3.2 Color scheme → RGB mapping

The hub resolves a state to concrete RGB values using one of two built-in
color schemes (`ColorScheme.ts`), selected per-tally/per-default via
`TallyConfiguration`:

| State | `default` scheme | `yellow-pink` scheme |
|---|---|---|
| on-air (program) | red `255,0,0` | yellow `255,255,0` |
| preview | green `0,255,0` | magenta `255,0,255` |
| highlight | white `255,255,255` | white `255,255,255` |
| unknown | blue `0,0,255` | blue `0,0,255` |
| idle (release, when shown) | near-off green `0,1,0` | near-off green `0,1,0` |

`highlight`, `unknown`, and idle are identical across both schemes — only
`on-air`/`preview` differ. The device firmware has **zero concept of "color
scheme"**; it only ever receives already-resolved RGB numbers over the wire.
"Color scheme" is a purely hub-side abstraction.

### 3.3 Brightness

Per-channel brightness is applied **after** color-scheme resolution, via
`Color.withBrightness()`:

```
finalChannel = Math.ceil(channel * brightness / 100)
```

applied independently to R, G, and B, for the operator light and the stage
light (which can have different brightness settings — see §4). Like color
scheme, brightness is a hub-side-only concept: the device never receives a
"brightness" value, only the final post-multiplied RGB.

### 3.4 Flash patterns

Only two states currently use a flash pattern (both fixed constants in
`CommandCreator.ts`, not configurable per-tally):

- `highlight`: pattern `0xAA`, duration `125` ms.
- `unknown`: pattern `0x80`, duration `250` ms.

`on-air`, `preview`, and `release` are always sent as the 25-character
static-color variant (no flash suffix).

### 3.5 Highlight duration

`TallyContainer.highlight()` sets `tally.highlight = true` and schedules a
`setTimeout` to call `deHighlight()` after
`AppConfiguration.getTallyHighlightTime()` — default **1000 ms**
(`tallyHighlightTime = 1000 // ms`). This is the duration the *hub UI*
keeps a manually-triggered highlight active before reverting to normal
state resolution (§3.1); it is unrelated to the 125 ms flash-cycle duration
sent in the wire message itself (§3.4/§2.1) — one governs how long
"highlight" stays the winning state, the other governs how fast the LED
blinks while it is.

### 3.6 Operator vs. stage light, and idle

Every state command always carries **two independent RGB triples** — one
for the operator-facing light, one for the stage-facing light — computed
from the same state but potentially different color-scheme/brightness
settings per light (`TallyConfiguration` has separate
`operatorLightBrightness`/`stageLightBrightness` etc.). Two configuration
flags gate whether "idle" (near-off) is shown instead of the resolved
state:

- `stageShowsPreview` (default `true`) — whether the stage light shows the
  `preview` color, or is suppressed to idle instead.
- `operatorShowsIdle` (default `true`) — whether the operator light shows
  idle (dim) at `release`, or is left at whatever `release` resolves to.

These are hub-only settings; the device firmware has no awareness of
"operator vs. stage" as a protocol-level distinction — it just draws
whatever two RGB triples it's told (device-side LED handling for
operator/stage was established in the firmware survey from
`tally/src/my-led.lua`; not re-verified in this document).

---

## 4. Configuration / settings path

Two entirely separate channels, with no overlap:

### 4.1 Runtime, hub-pushable (never a discrete "settings" message)

Lives in `TallyConfiguration.ts` / `DefaultTallyConfiguration`, in hub
memory/config, per-tally (each field defaulting to `undefined` = "inherit
global default"):

- `operatorLightBrightness`, `stageLightBrightness` (global default
  100/100; operator brightness is floored at `minOperatorLightBrightness =
  1` with a `console.warn`, so the operator light can never be fully off by
  misconfiguration — stage light *can* go to 0).
- `colorScheme` (`"default"` or `"yellow-pink"`).
- `stageShowsPreview`, `operatorShowsIdle` (booleans, §3.6).

**None of these are ever transmitted to the device as a settings message.**
They're baked into the plain RGB values of every state command (§2.1, §3).
The tally has no way to query or be told its brightness/color-scheme
configuration directly — it only ever sees the numeric result. Changing
these on the hub takes effect on the next keep-alive tick (≤100 ms later)
with no device-side acknowledgment step.

*(Not independently re-verified in this document: exactly where
`TallyConfiguration` persists across hub restarts. Prior research
identified `$HOME/.wifi-tally.json` as the hub's general config store — the
v0.1.0 changelog entry moved hub config there — but the specific save/load
code path for `TallyConfiguration` was not opened in this pass. Treat as a
well-supported inference, not a directly cited fact.)*

### 4.2 Flasher-only, USB-serial (`tally-settings.ini`)

Written exclusively by `NodeMcuConnector.writeTallySettingsIni()` over a
serial connection (via `nodemcu-tool`), never over the UDP wire protocol.
Exactly 5 keys, defined in `TallySettingsIni.ts`:

| Key | Purpose |
|---|---|
| `station.ssid` | WiFi network to join |
| `station.password` | WiFi password |
| `hub.ip` | Hub address the tally sends `tally-ho`/`log` to |
| `hub.port` | Hub UDP port (protocol-level default 7411, but stored/settable independently) |
| `tally.name` | Display name sent in `tally-ho` |

These require physical USB access to the device and a full reflash-adjacent
operation (upload + hard reset, per `writeTallySettingsIni`'s progress
states). There is no way to change WiFi credentials, hub address, or the
tally's own name remotely over UDP — by design, since the tally can't even
find the hub without `hub.ip`/`hub.port` first.

---

## 5. Versioning and compatibility

**There is no version handshake anywhere in this protocol.** Confirmed by
reading both sides' source directly, not inferred from the changelog: no
message type carries a version field, no message type is a
capability/handshake request, and the tally's `connect()` sequence goes
straight from socket setup to sending `tally-ho` — nothing waits for or
requests version confirmation from the hub before normal operation begins.

### 5.1 What actually happens on a version mismatch, traced

**What's fact-checked, from source:**

- The changelog records exactly **one** deliberate wire-protocol break:
  **v0.4.0**, explicitly called out as *"Code on the Tally HAS changed.
  Tallies and the Hub will not be able to communicate unless you also
  update the .lc files on the Tallies,"* and driven by hitting the
  ESP8266/NodeMCU's memory limit.
- Every other changelog entry that speaks to tally-code impact says the
  opposite — v0.2.0, v0.3.0, v0.4.2, v0.5.0 all explicitly state *"Code on
  the Tally did not change."* v0.4.1 is conditional ("only need to update
  ... if you plan on using the new ... red-green-blue WS2812 light").
- The **current** `parseMessage()` in `my-tally.lua` strictly validates
  total string length (must be exactly 25 or 34) and literal marker
  characters at fixed byte offsets before accepting a packet; anything else
  is silently discarded with a local `MyLog.warning`, and nothing is sent
  back to the hub (§2.2, "Malformed input").

**What is a well-supported hypothesis, not a confirmed fact:** the exact
pre-v0.4.0 wire format is **not present in this checkout** —
`tally/src/my-tally.lua` reflects only the current (post-v0.4.0) protocol,
and the old version was not available to inspect directly. So the honest
answer to "what happens when a v0.5.2 hub talks to v0.3.x firmware" splits
into two parts:

1. For firmware between v0.4.0 and today (inclusive), the wire format is
   unchanged (only the flash-pattern/highlight capability was added in
   v0.4.0 onward, per the changelog's own framing) — so a v0.5.2 hub and,
   say, v0.4.2 firmware should interoperate fully at the protocol level.
   This part is directly supported by the "did not change" statements
   holding continuously across v0.4.0→v0.5.x.
2. For firmware **older than v0.4.0** (e.g., genuine v0.3.x), the wire
   format was different — but *how* different is not something this
   checkout can verify, since that Lua source no longer exists here. The
   best-supported hypothesis, based purely on how the *current* parser
   treats any packet it doesn't recognize, is **silent failure**: a modern
   25/34-character command sent to old firmware would very likely fail
   that firmware's own length/marker checks (whatever they were) and get
   logged locally as an invalid package — the light simply never updates,
   with no error visible to the hub or the operator. This is inference
   from present-day parser behavior applied backward across an assumed-but-
   unverified old format, not a fact about the actual v0.3.x code.
   **Open question:** what did the pre-v0.4.0 `parseMessage()` actually
   look like, and did malformed-packet handling behave the same way then?
   Not answerable from this checkout.

### 5.2 Proposed lightweight handshake

Given that the *only* historical protocol break was forced by hitting
NodeMCU's memory ceiling, any proposal has to stay small. The smallest
change that makes a mismatch **detectable** (not necessarily
auto-resolvable) without adding a new message type:

> Append a short protocol-version field to the already-recurring `tally-ho`
> message:
> ```
> tally-ho "<name>" <protocolVersion>
> ```
> e.g. `tally-ho "Camera 1" 1`

Rationale:

- `tally-ho` is already sent every 1000 ms unconditionally — no new timer,
  no new socket traffic pattern, no new failure mode to design for.
- A single small integer (1–2 ASCII digits) is a negligible memory/flash
  cost on the device side compared to the memory pressure that caused the
  v0.4.0 break.
- The hub side can compare the received `<protocolVersion>` against its own
  expected value and surface a clear, loud UI warning ("Tally X is running
  protocol vN, hub expects vM — update firmware") instead of the current
  silent-failure behavior (§5.1). It requires zero change to the existing
  state-command format (§2.1), which is the direction that actually needs
  to stay memory-lean on the device.
- Backward compatibility during rollout: `CommandParser.ts`'s `tally-ho`
  regex would need to treat the version field as optional so that
  pre-handshake firmware (which won't send it) doesn't get rejected as
  malformed — this keeps the change non-breaking for the transition period,
  unlike v0.4.0's break.

This is a proposal, not an implemented feature — no source was changed to
write this document.

---

## 6. Compatibility matrix

Assembled directly from `Changelog.md` (read start-to-newest-entry; see
caveat below). "Tally code" = whether the `.lc`/`.lua` files on the device
needed to change for that hub release.

| Hub version | Tally firmware compatibility |
|---|---|
| **v1.0.0** ("Modernization Release") | **Not stated re: tally/firmware** in the changelog entry — see open question below. |
| v0.5.1 | Not explicitly stated either way in the entry read. |
| v0.5.0 | **No change** — "Code on the Tally did not change." |
| v0.4.2 | **No change** from v0.4.1 — "Code on the Tally did not change from v0.4.1." |
| v0.4.1 | **Conditional** — only needed if using the new RGB WS2812 light support. Also: a packaging bugfix, `init.lua` was missing from the release archive. |
| v0.4.0 | **Breaking.** *"Tallies and the Hub will not be able to communicate unless you also update the .lc files on the Tallies."* Driven by hitting NodeMCU's memory limit. This is the only documented wire-protocol break. |
| v0.3.0 | **No change** — "Code on the Tally did not change. If you are doing an upgrade there is no need to modify the Tallies." |
| v0.2.1 | Not explicitly stated (bugfix entry: tally/config persistence). |
| v0.2.0 | **No change** — same wording as v0.3.0. |
| v0.1.0 | **Breaking**, but hardware/config, not wire-protocol per se: hub config path moved (`hub/config.json` → `$HOME/.wifi-tally.json`), stage-light wiring moved pins D2–D4 → D1–D3, firmware build moved off-repo onto Travis, and firmware needed updating for the new `ws2812` module. |
| v0.1-alpha4 | Packaging bugfix — compiled `.lc` release files were broken, then fixed. |
| v0.1-alpha3 | Multiple breaking device-side changes: tally name truncated to 26 chars, pinout changed, plus several new features (boot-reason logging, 10-entry log buffer, separate operator LED, dim idle indicator, onboard LED power indicator, invalid-`settings.ini` blue-blink error state, 200 ms fast-reconnect on auth timeout). |

**Practical summary:** as of today's protocol, any firmware from v0.4.0
onward should interoperate with the current hub for standard states;
`highlight`/`unknown` flash behavior specifically depends on v0.4.0+.
Anything older than v0.4.0 is untested/unverifiable from this checkout
(§5.1).

**Open questions, flagged rather than guessed at:**

1. **`v1.0.0` vs. `hub/package.json`.** The changelog's newest, top-listed
   entry is `v1.0.0 - Modernization Release`, claiming a Node.js 24+ /
   Vite / Electron 33 / React 19 rewrite. `hub/package.json` in this
   checkout currently reports `"version": "0.5.2"` and
   `"engines": {"node": ">=12"}` — inconsistent with that changelog entry.
   This appears related to an in-flight "Phase 1 — build system swap"
   effort visible elsewhere in the team's task list, but that connection
   has not been independently confirmed here, and this document does not
   resolve the discrepancy — it's noted as-is for team-lead to reconcile.
2. **Changelog completeness.** This matrix was built from the changelog
   content available in this read; if there are more/older entries beyond
   what was captured, they are not reflected here (unlikely to change the
   practical summary above, but not exhaustively verified).
3. **Pre-v0.4.0 wire format**, per §5.1 — not present in this checkout.
