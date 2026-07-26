# Cypress Coverage Gaps

Companion to `docs/design/ui-contract.md` and `docs/design/spec-changes.md`. Those
documents answer "what does the suite pin down and how." This one answers the
mirror question: **what can Phase 3 break while every gate stays green?**

Method: enumerated every route (`hub/src/pages/`), every client→server event
(`hub/src/lib/SocketEvents.ts`), and every dialog/form component, then checked
which of those a spec actually exercises (not just "the page loads"). Read-only —
no source, spec, or doc-outside-`docs/design/` file was touched.

---

## 1. Per-route coverage

| Route | Covered | Not covered |
|---|---|---|
| `/` (`IndexPage`) | Tally list render, hub-connected/mixer-connected/tallies-connected counts, toggle-disconnected/toggle-unpatched filters, create-tally flow (see §2 for depth) | **"Hub disconnected" alert never asserted** — `IndexPage.tsx:91-96` renders it when `!isHubConnected`, `hub-connected` testid exists, but zero spec references either. Only a mixer-disconnected state is tested, never a hub-disconnected one. |
| `/config` (`ConfigPage`) | Every mixer settings form (Atem/Obs/RolandV60HD/RolandV8HD/Vmix/Null/Test) — valid+invalid input typed, submit-disabled-on-invalid asserted, save+reload persistence checked. Default tally-config slider min-clamp. | **`MockSettings.tsx` has no spec at all** (no `configMock.spec.ts`) — untested via UI, full stop. Submit-disabled **tooltip text** ("The form contains errors") never asserted, only the disabled state. Default-tally-config: `it.skip` for "brightness should dim a light" and "persists through restart" (`components/config/TallySettings.tsx` region). |
| `/flasher` (`FlasherPage`) | **Correction (post-Tailwind/Radix rewrite, `7b8df41`/`3796824` sign-off):** previously listed as covering the default "no device connected" state — that was wrong even before the rewrite. `flasher.spec.ts`'s only test is `it.skip("TODO")`; Mocha never runs a skipped suite's `beforeEach`, so the `cy.get("body").should('contain.text', 'Did not find any connected device')` assertion in that `beforeEach` has never actually executed. The only real coverage of `/flasher` is `smoke.spec.ts`'s `'allows deep links into /flasher'`, which visits the route and asserts `page-flasher` exists — **mount only**, nothing about the device-error state or any other behavior. | Effectively everything active: `flasher.settingsIni` and `flasher.program` emits are only exercised by `manual_flasher.spec.ts` (hardware-gated, never runs in CI). Progress dialog, step-by-step upload UI, success/error states, and now the device-error empty state itself — all untested in CI. `flasher.spec.ts` is a 14-line stub whose one test never runs. Note for future work: this route's Cypress diff was empty across its Tailwind/Radix conversion — "converted and stayed green" here means only "still mounts," not "behavior preserved," precisely because of this gap. |
| `/tally/:id/log` (`TallyLogPage`) | Log line rendering, `data-severity` variants (status/warning/error/info) via `tally-logs.spec.ts`, tally-disconnect log entries. | Nothing notable missing — this route is well covered relative to its simplicity. |
| `/webtally/:id` (`WebTallyPage`) | See §4 — large, specialised, and only partially pinned. | See §4. |
| 404 (`PageNotFound`) | Reached via `webTally.invalid` (invalid udp-tally-as-webtally). | Not reached via an actually-unmatched route path in any spec — only via the one app-level redirect case. |

**Notes for whoever converts `/` (from the routes 3/4 sign-off, `7b8df41`/`3796824`):** the
`/tally/:id/log` and `/flasher` implementer ran into two things during that rebuild that belong to `/`
instead and correctly left them alone rather than racing the other agent converting this route:
- `MiniPage`'s `title` prop needs to accept a `ReactNode`, not just a string — `/`'s heading design
  (§3.2) is two-toned and can't be expressed as a plain string title.
- The hub-disconnected banner (the "Not covered" cell above) has no shared component to reuse or test
  against — it's inline markup in `IndexPage.tsx`, not a pulled-out component.

**Cross-cutting form gap:** across every settings/tally dialog (`FormDialog`),
the **Cancel/close button (`${testId}-close`) is never clicked and asserted** in
any spec — only the Save/submit path is tested. If a redesign silently breaks
"cancel discards changes," nothing catches it.

---

## 2. Client→server events never emitted by any spec

Cross-referenced all 31 events in `ClientSentEvents` (`SocketEvents.ts:44-79`)
against every spec, including `manual_*`.

**Real, actionable gaps (user-triggerable, zero CI coverage):**
- `tally.remove` (`:62`) — `tally.spec.ts:180` has `it.skip('can remove a tally')`. The remove menu item (`TallyMenu.tsx:66`) is never clicked by any running spec.
- `config.change.mock` (`:67`) — no `configMock.spec.ts` exists; `MockSettings.tsx` untested.
- `flasher.settingsIni` (`:77`), `flasher.program` (`:78`) — only exercised by `manual_flasher.spec.ts`, hardware-gated, never runs in CI.

**Likely dead code, not a rewrite risk but worth flagging:**
- ~~The `*.unsubscribe` half of every subscribe pair (`events.mixer.unsubscribe`, `.program.unsubscribe`, `.config.unsubscribe`, `.tally.unsubscribe`, `.channel.unsubscribe`, `.tallyLog.unsubscribe` — 6 events total) has no client-side emit call anywhere in `src/hooks/tracker/*.ts`.~~ **RESOLVED in unit 2b — confirmed dead and removed**, from both `ClientSentEvents` and their `server.ts` handlers. The grep was re-run repo-wide (the path above is pre-restructure; it's `src/client/hooks/tracker/` now) across `src/client/**` and `cypress/**`: no emit site for any of the six. Safe to drop rather than merely unused, because `SocketAwareEvent.register()` attaches its own `"disconnect"` listener — the pipes tear themselves down when the socket goes away, so the explicit unsubscribe was never what prevented dangling listeners. `events.webTally.unsubscribe` is live (`WebTallyPage.tsx`) and stays. *(DECISIONS.md → Architecture)*

Everything else (24 of 31 events) is covered, at least indirectly, by an
existing spec.

---

## 3. State and error paths

| Path | Status |
|---|---|
| Disconnected mixer | Covered — `webtally.spec.ts:214-224` via `config.change.null`. |
| Disconnected hub | **Not covered** — component exists (`IndexPage.tsx:91-96`), never asserted. |
| Tally that never connects (UDP) | Covered — `tally.spec.ts:101-150` (patch/unpatch while disconnected), `tally-logs.spec.ts:30-47` (missing→disconnected log entries). |
| Invalid input rejected | Well covered — every mixer config form types invalid IP/port and asserts submit-disabled, across 5+ spec files. |
| Save failure (server rejects a save) | **Not covered anywhere.** Every "can save" test assumes success and verifies via reload. No spec simulates a server-side save rejection. |
| Reconnect / crash-restart | **Explicitly deferred, not just missing.** `smoke.spec.ts:36`: `it.skip('should instantly show the correct state when the server crashes and is restarted')`. `webtally.spec.ts:302-303`: `it.skip("reconnects when its connection is cut")`, `it.skip("indicates when connection to server is broken")`. These are named, written-out, intentionally-skipped tests — someone already knew this mattered and shelved it. |

---

## 4. `WebTallyPage` — the one that worries me most too

`webtally.spec.ts` (306 lines) is substantial, but it pins the **output states**
of the color mapping, not the **mechanisms** around it:

**Solidly pinned:** `StateCommand` → color (`on-air`/`preview`/`release`/`unknown`
all asserted via `data-color`), invalid-udp-tally → 404, tally-create validation
(name length/duplicate/empty), the numeric `data-brightness` attribute changing
with brightness config.

**Pinned by attribute only, not by actual visible effect:**
- Highlight/strobe (`webtally.spec.ts:203-212`) asserts the `data-color='highlight'`
  testid exists — never asserts the flashing CSS animation itself actually runs.
- Brightness (`:226-269`) asserts the `data-brightness` attribute value changes —
  never asserts the rendered/darkened pixel color is correct. A redesign could
  wire brightness to the wrong CSS property, or break the darken math, and
  `data-brightness` would still read correctly while the screen looked wrong.

**Never touched at all, explicitly skipped:**
- Fullscreen toggle (`handle.enter()`/`.exit()`, `WebTallyPage.tsx:188-215`) — no click, no assertion.
- Wake-lock (`NoSleepJs`) — `it.skip('prevents screen lock on mobile devices when going into full screen')`.
- Operator color-scheme override — `it.skip("uses the operator color scheme")`.
- Default-brightness live-update — `it.skip('updates a tally when defaults are changed')`.
- Settings-reset-on-mixer-change regression — full test body present, `it.skip`'d.
- Settings link/dialog reachable from the web-tally screen itself — never opened via this route (only tested via the separate `TallyMenu` path).

Bottom line: the thing this screen is *for* — "does the light on the phone
actually look right to someone in a studio" — is the least-pinned part of it.
Everything the suite checks is a DOM attribute; nothing checks the rendered
color, the animation, or the fullscreen/wake-lock behavior a studio actually
depends on.

---

## 5. Cannot be covered by Cypress at all (stop expecting it to)

- **UDP protocol to physical tally hardware.** `cy.task('tally', ...)` simulates a UDP socket in Node — it does not exercise real ESP8266 firmware behavior.
- **Real mixer hardware.** Only ATEM has a hardware-gated manual spec (`manual_atem.spec.ts` — configure, state, channel-name update, auto-reconnect); OBS/vMix/RolandV60HD/RolandV8HD have **no hardware-in-the-loop test at all**, manual or otherwise.
- **Flasher hardware.** `manual_flasher.spec.ts` (flash software, write settings.ini) — real ESP8266/serial device required.
- Both `manual_*.spec.ts` files exist, are fully written, and **never run in CI** — treat their coverage as zero for rewrite-risk purposes, exactly as instructed.
- **Electron packaging** — no Electron-specific spec exists.
- **Visual/design correctness** — the suite asserts `data-*` attributes, never pixel output; no screenshot diffing anywhere.
- **Accessibility** — no `cypress-axe`, no role/focus/contrast assertions anywhere in the suite.

---

## 6. Ranked recommendation

Ranked by (likelihood a from-scratch rewrite breaks it silently) × (how bad it
is live, in front of a studio). Five specs, not thirty:

1. **WebTallyPage brightness/highlight → visible effect, not just attribute.** Highest likelihood (brightness math and CSS-animation wiring are exactly the kind of thing a Tailwind rewrite touches) × highest cost (wrong brightness on-air is the whole product failing silently, on the one screen the customer is staring at). Add one assertion on computed style (`getComputedStyle` background color, or the animation actually applying an `is-flashing`-equivalent class) — not a screenshot diff, just closing the "attribute says right, pixel says wrong" gap.
2. **Hub-disconnected banner.** Cheap to add (one `it` visiting `/` with the hub socket down, asserting the existing `Alert`), currently zero coverage despite the component existing and being simple to break by accident during a full rewrite of `Layout`/`IndexPage`.
3. **Reconnect / crash-restart.** Already written out as `it.skip`'d tests in two files — someone already flagged this as important and it never got finished. A full frontend rewrite is exactly the moment socket-reconnection UI logic gets rewritten wrong. Un-skip and finish at least `smoke.spec.ts:36`'s crash-restart case before the rewrite starts, not after.
4. **Dialog cancel/close path.** Every `FormDialog`-based dialog (tally settings, tally create, mixer settings) tests Save but not Cancel. Cheap (one click + assertion per dialog, or even one shared test if the component is generic), and "cancel silently doesn't discard/still saves" is a real, embarrassing class of rewrite bug.
5. **`tally.remove`.** Already has a real `it.skip('can remove a tally')` sitting there — finish it. Low effort (unskip + verify), and it's the only "leaves the tally list in a state the operator didn't intend" gap with an existing test to build on.

**Acceptable risk, don't spend a spec on it:**
- `MockSettings`/`config.change.mock` — dev/test-only mixer type, not a live-show path.
- Flasher active states (`flasher.settingsIni`/`flasher.program`) — real risk exists but is hardware-adjacent and lower-frequency than the on-air paths above; `manual_flasher.spec.ts` already documents intended behavior for whoever eventually wires CI hardware.
- Save-failure handling — real gap, but no evidence any save has ever failed in production; lower priority than the four above.
- ~~The dead `*.unsubscribe` events — confirm-not-fix, no spec needed.~~ **Done in 2b: confirmed dead, then deleted** (see the RESOLVED entry above). No spec was needed or added.
- Submit-disabled tooltip text, fullscreen toggle, wake-lock, operator-color-scheme override, default-brightness live-update — genuinely acceptable risk for Phase 3; each is real but lower-frequency/lower-blast-radius than the top five, and adding specs for all of them is exactly the "thirty specs" outcome to avoid.
