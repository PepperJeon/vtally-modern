# Client data-layer audit — `hub/src/client/hooks/**`, `lib/Emitter.ts`, and the pages that consume them

Read-only pass. No source was changed.

Ranked by (likelihood × damage in a live show). Each finding says whether it was
**traced** (followed end to end, can name the line), **traced but not empirically
confirmed** (mechanism certain, I did not load a browser to watch it happen), or
**theoretical**.

C1 was sent to team-lead separately before this report was finished, per instruction.

---

## 0. Coverage

**Read in full, line by line:**

- `lib/Emitter.ts`, `lib/DisconnectedClientSideSocket.ts`
- `hooks/useSocket.ts`, `hooks/useSocketInfo.ts`
- All six trackers: `tracker/{mixer,channel,tally,program,tallylog,config}.ts`
- All thirteen hooks: `useTallies`, `useChannels`, `useMixerInfo`, `useProgramPreview`,
  `useTallyLog`, and the nine exported from `useConfiguration.ts`
- `pages/{IndexPage,WebTallyPage,TallyLogPage,ConfigPage}.tsx`
- `components/config/MixerSelection.tsx`
- `tracker/fakeSocket.ts` and the six tracker specs + `useTallies.spec.tsx`

**Skimmed:**

- `pages/FlasherPage.tsx` — checked its three `socket.on`/`socket.off` pairs for the C1
  shape (they are balanced) and did not audit its progress state machine.
- `components/Tally.tsx`, `ChannelSelector.tsx` — read only where they consume hook
  state.

**Deliberately not covered**, per scope: styling, layout, copy, the `components/ui/**`
primitives, the mixer `Settings` components, and anything the redesign or localisation
passes are currently rewriting. I noticed `MixerSelection.tsx` has already grown a
`useT()` import and left it alone.

I did not run the app or the suite. Everything is static tracing, with one consequence
noted in C7.

---

## 1. Findings

### C1 — `useWebTally` leaks a `connect` listener per visit; a phone can end up rendering another camera's state. **TRACED** — escalated separately

`pages/WebTallyPage.tsx:54-55` registers `socket.on('connect', onConnect)` and
`socket.on('disconnect', onDisconnect)`. The cleanup at `:58-61` calls `onDisconnect()`,
which removes `webTally.state` and `webTally.invalid` — but never
`socket.off('connect', …)` or `socket.off('disconnect', …)`. I grepped every
`socket.off` in `src/client/**`: the only ones are those two plus `FlasherPage`'s three.
There is no other removal path, and `socket` is a module-scope singleton
(`useSocket.ts:21`) that outlives every component.

Two consequences, both traced:

1. **Wrong camera's state.** `onChange` (`:25-29`) never checks the incoming
   `tallyData.name` against this page's `tallyName`, and server-side
   `WebTallyDriver.updateTallyState` emits per-socket with no room separation — one
   socket can sit in several tallies' lists. Visit Cam1, then Cam2, then reconnect: both
   leaked `onConnect`s fire, each re-subscribes its own tally and re-registers its own
   `onChange`, and the mounted page then receives both tallies' `webTally.state`. It
   renders whichever `TallyContainer.updateTallyStates()` emits last — Map insertion
   order, so this is steady, not a flicker.
2. **Phantom connected client.** Needs no second tally: visit a web tally, navigate away
   (cleanup unsubscribes correctly), then reconnect. The leaked `onConnect` re-subscribes,
   `WebTallyDriver.subscribe` → `updateTallyConnections` sets `connectedClients`, and the
   hub reports that web tally as connected with one client while nobody is looking at it.
   `WebTally.isConnected()` is `connectedClients.length > 0`, so `isActive()` is true too.

Fix is two `socket.off` lines in the cleanup, plus — as defence in depth — one line in
`onChange`: `if (tallyData.name !== tallyName) { return }`.

Worth recording: `useWebTally` is the hook cited as the *reference* for the correct
seed-then-subscribe pattern (`socket.connected && onConnect()`, `:57`), and it is right
about that. It gets the race right and the teardown wrong.

---

### C2 — Seven of the thirteen hooks have the exact `useSocketInfo` shape. The fix was applied to eight hooks in the same file and not to these. **TRACED (mechanism) / NOT EMPIRICALLY CONFIRMED (that it fires on a cold load)**

The `useSocketInfo` bug was: seed state during render, subscribe in a passive effect,
never re-read after subscribing, so an event arriving in the render→effect gap is lost
with no recovery path.

`useConfiguration.ts` contains **both** patterns, side by side.

**Correct (8 hooks)** — `useAtemConfiguration` (`:50`), `useMockConfiguration` (`:69`),
`useObsConfiguration` (`:88`), `useRolandV8HDConfiguration` (`:107`),
`useRolandV60HDConfiguration` (`:126`), `useFeelworldConfiguration` (`:145`),
`useVmixConfiguration` (`:164`), `useDefaultTallyConfiguration` (`:183`). Each seeds
`useState(undefined)`, subscribes, **then re-reads the tracker**:

```ts
configTracker.on("obs", onChange)
setObsConfiguration(configTracker.obsConfiguration)   // :97 — the re-read
```

**Has the bug (7 hooks)**, all with a render-time seed and no re-read after subscribing:

| hook | line | seeds from | backing event | self-heals? |
|---|---|---|---|---|
| `useMixerNameConfiguration` | `useConfiguration.ts:16` | `configTracker.mixerName` | `config.state.mixer` | **no** |
| `useAllowedMixersConfiguration` | `useConfiguration.ts:33` | `configTracker.allowedMixers` | `config.state.mixer` | **no** |
| `useMixerInfo` | `useMixerInfo.ts:9` | `mixerTracker.connectionState` | `mixer.state` | **no** |
| `useChannels` | `useChannels.ts:8` | `channelTracker.channels` | `channel.state` | **rarely** |
| `useTallyLog` | `useTallyLog.ts:8` | `tallyLogTracker.logs?.get(id)` | `tally.log.state` | on next log line |
| `useProgramPreview` | `useProgramPreview.ts:9-10` | `programTracker.programs/previews` | `program.state` | on next cut |
| `useTallies` | `useTallies.ts:8` | `tallyTracker.tallies` | `tally.state` | ~1 s |

**The self-heal column is the whole finding.** All seven have identical code shape; what
separates them is whether the backing event repeats. `tally.state` re-fires within a
second of boot (UDP tallies transition DISCONNECTED→CONNECTED and every
`tally.changed` re-emits it), which is why the tally grid is not visibly broken and why
this went unnoticed. The four that sit over non-repeating events do not recover:

- **`useMixerNameConfiguration` + `useAllowedMixersConfiguration`.**
  `MixerSelection.tsx:17` gates on `mixerName === undefined || allowedMixers === undefined`
  and renders `<Spinner />`. Both stuck undefined ⇒ **the config page spins forever.**
  `config.state.mixer` is only re-emitted when someone calls `setMixerSelection`, which
  requires the dropdown that is behind the spinner. Recovery is a page reload.
- **`useChannels`.** `ChannelSelector` renders no options ⇒ **an operator cannot patch a
  tally to a channel.** `channel.state` re-fires only when the mixer reports a new channel
  list — for OBS, only on a scene-list change. During a show, re-patching a swapped camera
  is exactly when you need this.
- **`useMixerInfo`.** Covered in C3, where it stacks with two other defects.

**Why I am not claiming this fires on every cold load, and how to settle it in a minute.**
The mechanism is identical to the confirmed `useSocketInfo` instance, and the timing is
if anything more favourable to the bug: `io()` runs at module eval, `root.render()` runs
in the same task (so render always precedes any socket I/O), the handshake completes
~12 ms later, the server's reply to the tracker's buffered `events.*.subscribe` lands
immediately after that — and effects run ~57 ms after render on a cold load, per the
measurements already recorded in `DECISIONS.md`. That puts the reply inside the gap.

What I cannot rule out from static reading is some ordering detail that rescues it. **The
Cypress suite passing is not evidence either way** — `DECISIONS.md` documents that Cypress
proxies AUT traffic and won this same race by ~12 ms, which is precisely how
`hub-disconnected-banner.spec.ts` passed for weeks while the banner was permanently wrong
on production cold loads. The check is: production build, hard-reload straight onto
`/config`, see whether the spinner ever resolves. Sixty seconds, and it converts this from
traced-mechanism to confirmed-or-refuted.

**One thing to fix beyond the code.** The comment at `useSocketInfo.ts:24-26` — repeated
in `DECISIONS.md` — says *"Every other socket consumer escapes this by constructing its
tracker at module scope."* That reasoning is wrong, and it is very likely why the sweep
stopped at one hook. Module-scope construction stops the **tracker** from missing the
socket event; it does nothing about the **hook** missing the tracker's `emit`. The
trackers are in fact careful about this — `tally.spec.ts:130` and `config.spec.ts:165`
both assert "a late subscriber can read the state it missed", i.e. the tracker
deliberately retains the last value for exactly this purpose. The hooks then throw that
guarantee away by never reading it. Leaving that sentence in place will mislead whoever
looks next.

---

### C3 — The mixer pill on the index page is wrong in three independent ways after a hub restart. **TRACED**

You asked me to confirm `ConfigTracker` and `MixerTracker` still do not re-subscribe.
They do not, and it is deliberate and pinned:

- `tracker/mixer.ts` — constructor emits `events.mixer.subscribe` once (`:15`), no
  `socketEventEmitter.on("connected", …)`. `mixer.spec.ts:115` is a characterization test
  named `BUG: it does NOT re-subscribe when the socket reconnects`, asserting both the
  count stays 1 and `listenerCount("connected") === 0`.
- `tracker/config.ts` — same, `:75`. `config.spec.ts:225`, same named test.
- The other four (`tally`, `channel`, `program`, `tallylog`) all re-subscribe. Confirmed
  by reading each constructor and by `tally.spec.ts:202`.

**What that actually costs, which the specs do not say.** After the hub restarts
mid-show, the server has no memory of the old socket's subscriptions. The four
re-subscribing trackers get fresh state, so **the tally grid and the on-air/preview
state on the index page are correct** — that is the important half, and it works. What
does not come back is `mixer.state` and the whole config surface.

So the mixer pill holds its pre-outage value indefinitely. Both directions are wrong and
both are plausible: green while OBS is still down, or `⊘ 0` while the mixer has been
fine for ten minutes.

Stacked on the same pill, from the same read:

- **`useMixerInfo` is also a C2 instance** (`useMixerInfo.ts:9`) — so it can be stuck
  before any outage, on a plain cold load, because `mixer.state` does not repeat.
- **`null` renders as a definite "disconnected".** `MixerTracker.connectionState` is
  `boolean | null` (`:5`), initialised `null` meaning *not known yet*.
  `IndexPage.tsx:139-141` passes it straight into `StatusPill`'s `connected: boolean`
  and renders `{isMixerConnected ? 1 : 0}`, so "don't know yet" and "the mixer is down"
  are the same pixels: `⊘ 0`, dashed amber border. `hub/tsconfig.json` has
  `"strict": false`, so `strictNullChecks` is off and tsc does not flag the
  `boolean | null` → `boolean` hole.

  This is notable because `WebTallyPage` takes the opposite care with the same
  distinction — `data-color="loading"` versus `data-color="unknown"`, with a comment
  explaining that both mean "do not trust this screen" and the word has to be large. The
  index page's mixer pill collapses that distinction into a confident negative.

Ranking note: this is a *readout* being wrong, not a tally light. It is below C1 for that
reason. It is above C2's other instances because the failure lands in the middle of a
show, on the pill an operator glances at to answer "is my mixer OK", and because a
green-when-down pill actively discourages the check that would find the real problem.

---

### C4 — The tally log page shows "Tally was not found. It may have been removed." during normal loading. **TRACED**

`pages/TallyLogPage.tsx` compares against `undefined` a value whose loading sentinel is
`null`:

```tsx
const tallies = useTallies()                    // Tally[] | null — never undefined
...
const title = tallies === undefined ? undefined : …          // :189
) : tallies !== undefined && !tally ? (                      // :215
  <p>Tally "{tallyId}" was not found. It may have been removed. …</p>
```

`useTallies` returns `tallyTracker.tallies`, typed `Tally[] | null` (`tracker/tally.ts:6`)
and initialised `null`. It is never `undefined`, so `tallies !== undefined` is
**always true** and the branch reduces to `!tally` — which is true for the entire window
before `tally.state` arrives.

The guard that saves it most of the time is the outer `logs === undefined` skeleton at
`:209`. So the message renders only when `logs` has arrived and `tallies` has not.
That ordering is the normal one: `TallyLogPage` imports `useTallyLog` at `:7` and
`useTallies` at `:8`, so `TallyLogTracker` is constructed first, emits
`events.tallyLog.subscribe` first, and the server replies to it first. socket.io delivers
each packet in its own task, so React renders in between.

A tally that is present and healthy is announced as removed, on the page you open
*because* you are worried about that tally. It resolves as soon as `tally.state` lands,
so this is a flash rather than a stuck state — unless `useTallies`' own C2 instance eats
that event, in which case it persists for the ~1 s until the next `tally.changed`.

Separately, when `useTallyLog`'s C2 instance fires, `logs` stays `undefined` and `:209`
shows the **six-bar skeleton forever** rather than the "No log entries yet" message at
`:220` — until the next log line for that tally, which for a quiet healthy tally can be
a long time. No data is lost when it does arrive (see C6).

Fix is `null` in both comparisons, or a single `isLoading` derived once.

---

### C5 — `Emitter` is fine. **TRACED, no action**

You asked specifically, so: I looked for listener leaks, double-subscription, and
single-subscriber assumptions, and found none that matter.

- `emit` copies the Set before iterating (`:34`), so a listener removing itself or a
  sibling mid-emit is safe. `tally.spec.ts:181` pins that.
- Backing each event with a `Set` means registering the same function reference twice
  registers once, and one `off` removes it. This **differs from Node's `EventEmitter`**,
  which allows duplicates and needs N removals — and the difference is in the safer
  direction for the mount/unmount/remount case. It is deliberate and pinned by the
  `subscribe / unsubscribe / subscribe delivers once (StrictMode double-mount)` test
  present in all six tracker specs.
- Every hook's `useEffect` returns a matching `off`. I checked all thirteen; none leaks.
- Throw isolation is absent (one throwing listener stops the rest), but Node's
  `EventEmitter` behaves the same way, so nothing regressed in the swap, and the only
  listeners are `setState` calls.
- `off` deletes the listener but leaves the empty `Set` in the Map. In `TallyLogTracker`,
  which keys events per tally (`log.${tallyId}`), that is one empty Set per tally ever
  viewed. Bounded by the tally count; not worth touching.

Note this is a review of the class, not of React 19's stricter behaviour interacting with
it — `<React.StrictMode>` is currently absent from `main.tsx` and, per `DECISIONS.md`,
cannot return while react-router is on v5. When it does return, the double-mount path the
specs already cover is the one that matters, and it is covered.

---

### C6 — `tallylog.ts`'s array mutation causes no live problem today. It is currently *reducing* the damage of C2. **TRACED**

You asked whether the documented `useSyncExternalStore` blocker bites today. It does not.

```ts
const entry = this.logs.get(tallyId)
entry.push(theLog)                                  // tallylog.ts:34 — mutates in place
this.logs.set(tallyId, entry)
this.emit(`log.${tallyId}`, this.logs.get(tallyId))
```

`useTallyLog:12` copies in the listener (`setLogs(Array.from(logs))`), so React always
receives a fresh reference and re-renders, and `TallyLogPage`'s
`useMemo(..., [logs, …])` at `:120-126` therefore always recomputes. The mutation and the
emit are synchronous and adjacent, so there is no render in between during which a
component could hold the half-mutated array.

The one wrinkle is that `useState(tallyLogTracker.logs?.get(tallyId))` (`:8`) seeds React
with the tracker's **live array instance**, not a copy. In practice that is harmless for
the reason above — and it is what makes `useTallyLog`'s C2 instance non-lossy: if
`tally.log.state` is missed in the render→effect gap, the tracker still populated
`this.logs`, so the next `tally.log` pushes onto the full history and the copy handed to
`setLogs` contains everything. Blank until the next log line, then complete.

The documented blocker is still real for the future and the recorded fix (move the copy
into the update path) is still the right one. Nothing to do now.

---

### C7 — No unit test in this harness can catch C2, structurally. **TRACED — meta-finding**

`useTallies.spec.tsx:55` is the closest thing that exists: *"a component mounting AFTER
the event still sees current state"*. That covers event-then-render. C2 is
render-then-event-then-effect, and Testing Library's `render()` wraps in `act()`, which
flushes effects synchronously before returning. **The gap does not exist in the test
environment**, so no assertion written against this harness can ever observe it.

That is the same reason `hub-disconnected-banner.spec.ts` passed while the banner was
permanently wrong: the spec was measuring a race the test environment does not run.
`DECISIONS.md` already makes the general point — *"Coverage existing is not the same as
coverage being able to fail"* — and this is a second, structural instance of it.

The implication for the `useSyncExternalStore` work already on the roadmap is worth
stating plainly: that refactor removes this entire bug class by construction, because
`getSnapshot` is read at subscribe time rather than seeded at render time. C2 is seven
hand-written instances of the problem `useSyncExternalStore` exists to solve. Fixing the
seven by hand is the right immediate move — one line each, matching the eight correct
hooks in the same file — but it is worth knowing that the deferred refactor is the thing
that makes it unrepeatable.

---

### C8 — Smaller items

All **traced**, none worth interrupting anyone for.

- **`useChannels.ts:10` and the nine `useConfiguration` hooks define `onChange` outside
  the effect** while the effect has `[]` deps. The registered listener is the first
  render's closure forever. It works because the only thing captured is a `setState`
  setter, which React guarantees is stable — but it reads as a bug and will become one
  the moment someone captures a prop in there. `useTallies` and `useProgramPreview`
  define theirs inside the effect, which is the pattern to converge on.
- **`useSocket.ts:42` maps `connect_error` onto `onDisconnection`.** Correct for the
  banner, but it means a transient handshake failure during an otherwise-live session
  emits `"disconnected"` with no matching `"connected"` unless a real connect follows.
  socket.io retries, so a connect does follow; noting it because the two events are not
  symmetric and anything counting them would drift.
- **`useSocket.ts:46`'s `useSocket()` is marked `@deprecated` and has no callers** in
  `src/client/**` (grepped). Its `@ts-ignore`s hide the fact that it takes
  `keyof ClientSentEvents` — events the client *sends* — and registers them as listeners.
  Deletable.
- **`DisconnectedClientSideSocket.cleanUp()` clears only `serverEventEmitter`**
  (`:37-39`), never `clientEventEmitter`. Test-only class, and the tracker specs build a
  fresh harness per test, so nothing leaks across tests today.
- **`IndexPage.tsx:146`** reads `rawTallies.length` inside the branch where
  `nrConnectedTallies !== null`, which does imply `rawTallies` is non-null — correct, but
  only because `countConnectedTallies` returns `null` for exactly the null case. It is one
  refactor away from a null deref, and `strict: false` will not catch it.

---

## 2. What I looked for and did not find

- **No other instance of C1's shape.** `FlasherPage`'s three `socket.on` calls
  (`:25`, `:93`, `:110`) each have a matching `socket.off` (`:30`, `:87`, `:104`) in the
  same effect's cleanup. The trackers register socket listeners in their constructors and
  never remove them, but they are module-scope singletons constructed exactly once, so
  there is nothing to accumulate.
- **The tally-carrying path survives a hub restart correctly.** `TallyTracker`,
  `ProgramTracker`, `ChannelTracker` and `TallyLogTracker` all re-subscribe on
  `"connected"`, and `useWebTally` re-subscribes and *clears* its state on `disconnect`
  (`:39-46`) rather than holding a stale on-air value. That last point is the client-side
  answer to server F1 and it is already right: when the hub tells a web tally the mixer is
  gone, `command` becomes `"unknown"` and the page renders the spinner and
  "No connection to Mixer" (`:173-176`). **F1's fix will make that path reachable for the
  first time; the client needs no change to benefit from it.** I checked specifically.
- **The web tally page — the screen actually taped to a camera — uses only correct
  hooks.** `useWebTally` (correct seed pattern) and `useDefaultTallyConfiguration` (one of
  the eight correct `useConfiguration` hooks). None of C2's seven is on that route. C1 is
  the only finding that reaches it.
- **The six trackers are individually well-built.** Each caches its last value for a late
  subscriber, each builds fresh domain objects per event rather than mutating (except
  `tallylog`, C6), and each has a real spec — the `record()` helper in `fakeSocket.ts`
  even carries a fail-if-never-called guard, which is the discipline `test-audit.md` found
  missing in `ObsConnector.spec.ts`. The problems are in the glue above them, not in them.

---

## 3. Suggested order

1. **C1** — two `socket.off` lines plus the one-line name guard. Only finding that can put
   the wrong camera's state on a camera-mounted screen.
2. **Run the C2 cold-load check** before writing any C2 code. One page load on a
   production build tells you whether you are fixing seven live bugs or seven latent ones,
   and it costs a minute.
3. **C2** — one re-read line per hook, copying what the eight correct hooks in
   `useConfiguration.ts` already do. Do `useMixerNameConfiguration`,
   `useAllowedMixersConfiguration`, `useChannels` and `useMixerInfo` first; those four do
   not self-heal. **Also correct the "constructs its tracker at module scope" sentence** in
   `useSocketInfo.ts:24-26` and `DECISIONS.md`, or the next reader stops at one hook too.
4. **C3** — the re-subscribe half is a three-line change matching the other four trackers,
   and both characterization tests are already written and would flip from asserting the
   bug to asserting the fix. The `boolean | null` half wants a deliberate decision about
   whether the index page grows a third pill state for "not known yet", the way
   `WebTallyPage` already distinguishes loading from unknown.
5. **C4** — `null` for `undefined` in two comparisons.
6. **C8** — hygiene.

The structural note, matching the server audit's: the seven C2 hooks are seven
hand-written instances of the single problem `useSyncExternalStore` solves by
construction, and C7 explains why no test in the current harness can hold them honest
once fixed. That is a second, independent argument for the deferred 1a refactor, on top
of the one already recorded — and this time it comes with a list of the exact seven call
sites it would retire.
