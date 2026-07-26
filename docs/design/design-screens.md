# vTally — Screen Designs

Composes the primitives in `design-tokens.md` and `design-components.md` into the five
screens. Token names are used verbatim; nothing new is invented here.

Source paths are post-Phase-1: pages at `hub/src/client/pages/`, components at
`hub/src/client/components/`, shared logic at `hub/src/shared/`.

Where `coverage-gaps.md` says a thing is unguarded by tests, this document treats "make being
wrong visible to a human" as a design requirement, not a nicety. Those places are marked
**UNGUARDED**.

---

## 0. The shell — `layout/Layout.tsx`

Every screen except `WebTallyPage` sits inside it. `WebTallyPage` deliberately does not —
it is a full-bleed surface with no chrome (§4).

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ [vTally]   Tallies   Configuration   Flash                                   │ ← 64px bar
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│   ← page content, max-width 1440px, px-6, mt-6                               │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
```

- Bar: `bg-surface` (`--color-n-900`), `border-b border-border`, height 64px, `px-6`.
  Not sticky — the tally grid should own the viewport, and a sticky bar costs 64px of grid
  on a laptop.
- Logo 106×40 `/logo-with-text.svg`, `mr-6`.
- Nav links: `Button variant="ghost"`, `text-base`, 44px min height. Active route gets
  `bg-surface-hover` + `text-text`; inactive `text-text-muted`. **Achromatic** — no accent,
  no coloured underline (tokens principle 1).
- **Nav copy is frozen.** `smoke.spec.ts` asserts the literal strings `Tallies`,
  `Configuration`, `Flash` — the one spec that is not testid-driven (ui-contract H4).
  Restyle freely; do not reword.
- `data-testid="page-${testId}"` stays on the outermost `<div>`, unchanged.

**Responsive.** Below 640px the three links become icon-only, with the same words kept in an
`sr-only` span (the spec matches on text — do not delete the strings). No hamburger; three
items do not earn a menu.

---

## 1. IndexPage — the tally grid

`hub/src/client/pages/IndexPage.tsx`. The primary screen. An operator glances at it
mid-show, from two metres, while looking at something else.

### 1.1 Layout

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│ [vTally]  Tallies  Configuration  Flash                                          │
├──────────────────────────────────────────────────────────────────────────────────┤
│                                                                                  │
│  ┌ filters ─────────────────────┐        ┌ status ──────────────────────────┐    │
│  │ [✓ Show Disconnected]        │        │ [● HUB]  [● MIXER]  [ 3 / 4 ]    │    │
│  │ [✓ Show Unpatched]           │        └──────────────────────────────────┘    │
│  └──────────────────────────────┘                                                │
│                                                                                  │
│  ON AIR ──────────────────────────────────────────────────────────────────────   │
│  ┌────────────┐  ┌╌╌╌╌╌╌╌╌╌╌╌╌┐                                                  │
│  │████████████│  ╎████████████╎   ← solid red fill, sorted to top                │
│  │██ CAM 1 ███│  ╎██ CAM 4 ███╎                                                  │
│  │██ ON AIR ██│  ╎█ O̶N̶ ̶A̶I̶R̶  NO SIGNAL                                            │
│  └────────────┘  └╌╌╌╌╌╌╌╌╌╌╌╌┘   ← CAM 4: on air AND disconnected               │
│                                                                                  │
│  (space-8 gap — the spatial break IS the CVD carrier)                            │
│                                                                                  │
│  ┌────────────┐  ┌────────────┐  ┌────────────┐  ┌╌╌╌╌╌╌╌╌╌╌╌╌┐  ┌╌╌╌╌╌╌╌╌╌╌╌╌┐  │
│  │▲ CAM 2     │  │▫ CAM 3     │  │▫ CAM 5     │  ╎? CAM 6     ╎  ╎     +      ╎  │
│  │  PREVIEW   │  │  IDLE      │  │  NO SIGNAL │  ╎  UNPATCHED ╎  ╎ Add tally  ╎  │
│  └────────────┘  └────────────┘  └────────────┘  └╌╌╌╌╌╌╌╌╌╌╌╌┘  └╌╌╌╌╌╌╌╌╌╌╌╌┘  │
│                                                                                  │
└──────────────────────────────────────────────────────────────────────────────────┘
```

Grid:

```css
display: grid;
grid-template-columns: repeat(auto-fill, 250px);
gap: var(--space-8);
justify-content: start;
```

Fixed 250px track, not `1fr` — the card width is specified in components §1.6, and stretching
it across a 4K monitor breaks the type-to-box ratio the 28px name was sized against.
`auto-fill`, not `auto-fit`, so a lone on-air card stays 250px instead of ballooning to fill
the row.

**The toolbar splits into two groups.** This is a change from today's single `ButtonGroup`
(`IndexPage.tsx:77-89`). Filters *change what you see*; status pills *tell you what is true*.
Fusing them into one segmented control means an operator can click a status pill expecting
something to happen. Left group interactive, right group a readout, `justify-between`.

### 1.2 The two filters

`toggle-disconnected` / `toggle-unpatched`. Both default **on** (`useState(true)`).

```
┌──────────────────────────┐   ┌──────────────────────────┐
│ ✓  Show Disconnected     │   │    Show Unpatched        │
└──────────────────────────┘   └──────────────────────────┘
   pressed (default)               unpressed (filtering)
```

- `<Button variant="outline">` with `aria-pressed`, 44px min height, `text-sm`,
  `text-transform: none` (preserved from today's `classes.button`).
- Pressed: `bg-surface-hover border-border-strong text-text` + a check glyph.
  Unpressed: `bg-transparent border-n-600 text-text-muted`, no glyph.
- **Achromatic.** Today's `color="primary"` renders these teal — one glance from
  `--color-preview` (tokens principle 1). Drop it. The pressed state survives greyscale via
  the glyph and border weight, not fill hue.
- `data-testid` stays on the `<button>` (Rule A, components §2.0).

**When a filter is hiding something, say so.** Rendered directly below the filter row
whenever `!showDisconnected || !showUnpatched`:

```
⚠  3 tallies hidden by filters                                        [Show all]
```

`text-sm text-missing`, `role="status"`. New. The failure mode it prevents: an operator turns
off "show disconnected" during setup, forgets, and can no longer see that a camera's light is
dead. A filter that silently removes safety information has to announce itself. `[Show all]`
sets both back to `true`.

Keep `createTallyList` (`IndexPage.tsx:39-52`) — the active-first, then-`localeCompare` sort
is tokens §3.1 carrier 4 (spatial position as a CVD-proof carrier) and it already works.

### 1.3 The "ON AIR" section break

```
ON AIR ─────────────────────────────────────────────────────────
```

`text-xs`/`600`/uppercase/`tracking-wide`/`text-text-muted`, with a `border-border` rule
filling the remaining width, `mb-4`. Rendered **only when at least one tally is on air**.
There is no matching "OTHER" heading — a heading over the resting state adds permanent chrome
to label the 95% case.

One correction to the sort. `isActive()` is *transport health*, not program state; the
existing sort puts connected tallies first, which is not the same as putting live ones first.
The heading needs program state. Three keys, one added:

```ts
(a, b) => +b.isProgram() - +a.isProgram()
       || +b.isActive()  - +a.isActive()
       || a.name.localeCompare(b.name)
```

This also fixes the worst case: an on-air-but-disconnected tally currently sorts *below* an
idle-but-connected one, i.e. the single most urgent card on the screen is not at the top.

### 1.4 Status pills — hub / mixer / tallies

`data-testid="hub-connected"` / `"mixer-connected"` / `"tallies-connected"`. Today each
renders an icon plus `1` or `0`, and the only thing distinguishing connected from
disconnected is that digit. `0` and `1` are one glyph apart at two metres.

```
┌───────────────┐  ┌───────────────┐  ┌───────────────┐
│ ●  HUB        │  │ ●  MIXER      │  │  3 / 4        │
└───────────────┘  └───────────────┘  └───────────────┘

┌ ╌╌╌╌╌╌╌╌╌╌╌╌╌ ┐
╎ ⊘  HUB        ╎   ← disconnected: slashed dot, amber, dashed border
└ ╌╌╌╌╌╌╌╌╌╌╌╌╌ ┘
```

| Pill | Connected | Disconnected |
|---|---|---|
| Hub | `●` `text-preview`, label `text-text`, `border-border` | `⊘` `text-missing`, label `text-missing`, `border-missing` dashed |
| Mixer | same | same |
| Tallies | `n / total`, `tabular-nums` | shows `?` while `tallies === null` |

- Rendered as `<div role="status" tabindex="0" data-testid=… data-connected="true|false">`,
  not `<button>`. They do nothing when clicked; `tabindex="0"` keeps the tooltip
  keyboard-reachable without lying about clickability.
- **Keep the numeric content** (`1`/`0`) in the DOM — several specs read these testids. The
  state marker is added beside it, not swapped for it.
- Tooltip copy unchanged: `"Hub connected"` / `"Hub disconnected"`, etc.
- The tallies pill shows `connected / total`. `3` alone is meaningless; `3 / 4` says one is
  dead. Note `countConnectedTallies` currently counts over the **filtered** list
  (`IndexPage.tsx:72`), so with "show disconnected" off the count silently becomes `n / n` —
  the display agrees with itself and hides the problem. Count both numbers over unfiltered
  `rawTallies`.

### 1.5 The hub-disconnected banner — **UNGUARDED**

`IndexPage.tsx:91-96`. `coverage-gaps.md` #2: the component exists, renders on
`!isHubConnected`, and **no spec references it at all**. A rewrite can delete it outright and
every gate stays green. So it is designed to be the loudest thing on the screen — if it
regresses, a human sees it on the first run.

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│ [vTally]  Tallies  Configuration  Flash                                          │
├══════════════════════════════════════════════════════════════════════════════════┤ ← 3px amber
│ ⚠  HUB DISCONNECTED                                                              │
│    The information below might be outdated.                                      │
│    Reconnecting automatically — you can also reload the page.        [ Reload ]  │
├──────────────────────────────────────────────────────────────────────────────────┤
│                                                                                  │
│  ┌ filters ─────┐                    ┌ status ──────────────────────────────┐    │
│  │ …            │                    │ [⊘ HUB]  [⊘ MIXER]  [ ? ]           │    │
│                                                                                  │
│  ╔══════════════════════════════════════════════════════════════════════════╗    │
│  ║  ┌────────────┐  ┌────────────┐  ┌────────────┐   grid at opacity 0.55,  ║    │
│  ║  │  CAM 1     │  │  CAM 2     │  │  CAM 3     │   pointer-events intact  ║    │
│  ║  └────────────┘  └────────────┘  └────────────┘                          ║    │
│  ╚══════════════════════════════════════════════════════════════════════════╝    │
└──────────────────────────────────────────────────────────────────────────────────┘
```

Four independent carriers, so no single CSS mistake can hide it:

1. **A full-width bar directly under the nav** — `bg-surface`, `border-t-[3px] border-missing`,
   `role="alert"`. Full-bleed, outside the content container: it is a property of the page,
   not of the grid.
2. **The grid dims to `opacity: 0.55`.** This carrier survives even if the banner fails to
   render, and it is the honest statement — every card below is a cached value of unknown
   age. Pointer events stay on; an operator may still want to read an IP off a card. Not
   `filter: grayscale()`, which would destroy the state colours, the one thing still worth
   reading.
3. **Every status pill flips to its disconnected form** (§1.4). Driven off the same
   `isHubConnected`, so it is free.
4. **`document.title` gains a `⚠ ` prefix.** Two lines, and an operator with the hub on a
   background tab finds out.

Copy, one word changed (`displayed information` → `information below`, since it now sits
above what it describes):

```
HUB DISCONNECTED
The information below might be outdated.
Reconnecting automatically — you can also reload the page.
```

**Amber `--color-missing`, not red**, despite today's `severity="error"`. A red band across
the top of the tally screen is exactly the confusion tokens §2.2 exists to prevent —
peripheral vision reads red as "something is on air". Amber is the degraded-attention colour.
Components §2.11 already restricts alerts to amber for this reason.

`[ Reload ]` is new — `Button variant="outline"`, `window.location.reload()`. The copy already
tells the operator to reload; make it one tap.

**This does not replace the test.** `coverage-gaps.md` ranks it #2 and it costs one `it`. The
four carriers make a regression *visible*, not *caught*.

### 1.6 The add-tally affordance

`TallyCreate.tsx`. Stays as the last item in the grid rather than moving to the toolbar: it
is card-shaped, it sits where the next tally will appear, and a toolbar button would put a
non-state control in the one region reserved for state.

```
┌ ╌╌╌╌╌╌╌╌╌╌╌╌ ┐
╎              ╎    250px, same height as a tally card
╎      +       ╎    border-dashed border-n-600, bg-transparent
╎  Add tally   ╎    text-text-muted; hover → border-n-500 text-text
╎              ╎
└ ╌╌╌╌╌╌╌╌╌╌╌╌ ┘
```

Dashed and unfilled so it never competes with a real card. Always sorts last, after the
on-air group. The dialog is `dialog` §2.8 plus the `tally-create-warning` alert (§2.11),
unchanged.

### 1.7 States

| State | Condition | Render |
|---|---|---|
| **Loading** | `tallies === null` | Toolbar renders (pills show `?`); grid shows **3 skeleton cards** — `bg-surface-raised border-border animate-pulse`, no text. Not a spinner: a spinner gives no sense of the layout that is coming. Today this renders literally nothing (`IndexPage.tsx:99`, `@TODO: loading`). |
| **Empty — none at all** | `rawTallies.length === 0` | Centred in the grid area: `No tallies yet` (`text-xl`) + `Tallies appear here once they connect to the hub.` (`text-sm text-text-muted`), plus the add-tally card. |
| **Empty — filtered out** | `tallies.length === 0` but `rawTallies.length > 0` | `All 6 tallies are hidden by your filters` + `[Show all]`. Distinct from the above — telling an operator "no tallies" when they have six is a lie the UI can easily tell. |
| **Hub disconnected** | `!isHubConnected` | §1.5. Last-known grid stays, dimmed. Never blanked: stale data beats no data, provided it is labelled stale. |
| **Mixer disconnected** | `!isMixerConnected` | Pill only, no banner. States freeze but the hub still knows the lights; smaller failure, and it already has covered tests. Tallies fall to idle on their own, which is honest. |
| **Error** | — | There is none. Socket failure *is* the hub-disconnected state. Do not add a second error surface. |

### 1.8 Responsive

| Width | Grid | Toolbar |
|---|---|---|
| ≥1024px | `repeat(auto-fill, 250px)` | filters left, status right, one row |
| 640–1023px | same, 2–3 columns naturally | same row; status pills drop word labels, keep marker + digit |
| <640px | single 250px column, `justify-content: center` | filters stack full-width; status pills wrap to their own row, centred |

The card never shrinks below 250px. A phone at 375px fits one card with margin, which is
correct — a phone on this page is doing a spot check. The show view on a phone is
`WebTallyPage`.

---

## 2. ConfigPage — mixer selection + settings

`hub/src/client/pages/ConfigPage.tsx`. Two panels: the mixer (selector + the selected
mixer's form) and the tally defaults. Set up before a show, rarely touched during one — so
this screen optimises for *not making a mistake*, not for speed.

### 2.1 Layout

Today both panels are `MiniPage` → MUI `Container maxWidth="sm"`, so they stack in a narrow
column down the middle of a 2560px monitor. Keep the narrow measure (forms are read
top-to-bottom and a 1400px-wide field row is unreadable), but put the two panels
**side by side above 1024px** — the tally defaults are what you check *after* choosing a
mixer, and stacking them means scrolling past a long form to reach them.

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│ [vTally]  Tallies  Configuration  Flash                                          │
├──────────────────────────────────────────────────────────────────────────────────┤
│                                                                                  │
│ ┌ Video Mixer ─────────────────────────┐  ┌ Tally Defaults ────────────────────┐ │
│ │ Select a Video Mixer to use.         │  │                                    │ │
│ │                                      │  │  Operator light brightness         │ │
│ │ ┌──────────────────────────────┐     │  │  ├──────●───────────────┤  70%     │ │
│ │ │ vMix                      ▾  │     │  │                                    │ │
│ │ └──────────────────────────────┘     │  │  Operator light colours            │ │
│ │ ──────────────────────────────────   │  │  [■ Default] [■ Yellow-Pink]       │ │
│ │                                      │  │                                    │ │
│ │ vMix                                 │  │  ☑ Shows idle state                │ │
│ │ Connects to any vMix over network    │  │                                    │ │
│ │ using the TCP API. ↗                 │  │  ─────────────────────────────     │ │
│ │                                      │  │                                    │ │
│ │ vMix IP                              │  │  Stage light brightness            │ │
│ │ ┌──────────────────────────────┐     │  │  ├────────────●─────────┤  90%     │ │
│ │ │ 192.168.1.10                 │     │  │                                    │ │
│ │ └──────────────────────────────┘     │  │  Stage light colours               │ │
│ │                                      │  │  [■ Default] [■ Yellow-Pink]       │ │
│ │ vMix Port                            │  │                                    │ │
│ │ ┌──────────────────────────────┐     │  │  ☐ Shows preview state             │ │
│ │ │ 8088                         │     │  │                                    │ │
│ │ └──────────────────────────────┘     │  ├────────────────────────────────────┤ │
│ │ ⚠ This is the Web UI port, not the   │  │                          [ Save ]  │ │
│ │   TCP API port. Leave blank for      │  └────────────────────────────────────┘ │
│ │   the default.                       │                                        │
│ ├──────────────────────────────────────┤                                        │
│ │                            [ Save ]  │                                        │
│ └──────────────────────────────────────┘                                        │
└──────────────────────────────────────────────────────────────────────────────────┘
```

Panel container (`MiniPage`, restyled): `bg-surface`, `border border-border`,
`rounded-md`, header `px-4 py-3` with `border-b border-border`, body `p-6`, footer
`px-6 py-4` with `border-t border-border`. Title `text-xl`/`600` — today it is
`Typography variant="h1"` inside a card, which is wrong at every level (three `h1`s on the
page); use `<h2>` and let the type scale carry the size.

Column widths: `grid-template-columns: minmax(0, 560px) minmax(0, 480px)`, `gap: var(--space-8)`,
`justify-content: start`. Fixed measures, not fractions — a form field should be ~480px wide
regardless of monitor.

### 2.2 The mixer selector

`data-testid="mixer-select"`, a **native `<select>`** (components §2.4 — Radix `Select`
renders no `<select>`/`<option>` and breaks seven specs). Full width of the panel, 44px,
`bg-n-900`, chevron drawn as an `::after`.

Set `color-scheme: dark` on `:root` so the OS-drawn option list is dark. Without it, opening
this dropdown in a dark control room produces a white flash — the one thing tokens principle 4
exists to prevent.

The selector and the form below it are separated by a `border-border` rule, because the
selector *changes* what is below it and that relationship should be visible.

### 2.3 The eight mixer forms — one shape

`MixerSettingsWrapper` already is the shape. It is not redesigned, it is tightened.

```
┌──────────────────────────────────────────────┐
│  {title}                                     │  ← text-lg / 600
│  {description}                               │  ← text-sm / text-text-muted
│                                              │
│  {n × ValidatingInput}                       │  ← stacked, never side by side
│                                              │
├──────────────────────────────────────────────┤  ← border-t border-border
│                                    [ Save ]  │
└──────────────────────────────────────────────┘
```

Rules that apply to all eight (`Atem`, `Obs`, `RolandV60HD`, `RolandV8HD`, `Vmix`, `Null`,
`Mock`, `Test`):

- **Fields stack vertically, one per row.** Today `ValidatingInput` sets
  `margin: 0 16px 16px 0` on an inline-block `TextField`, so IP and Port sit side by side and
  wrap unpredictably. An IP and a port on one line invite typing one into the other — which
  is precisely the mistake the vMix warning exists to catch. One field per row, `gap-4`,
  `max-width: 420px`.
- **Label above the field**, real `<label htmlFor>` (components §2.3). MUI's floating label
  shrinks to ~11px once filled, which fails the legibility principle.
- **Help text slot is always reserved**, `min-height: 1.25rem` below each field, even when
  empty. Otherwise the vMix warning appearing mid-type shoves the Save button down while the
  operator is reaching for it.
- **Description goes above the fields, not above the title.** Today `MixerSettingsWrapper`
  renders `description` before `title` (lines 47–50), so you read what it does before you
  read what it is. Swap.
- **Save is the only action.** No Cancel — the form is the live config, and the escape hatch
  is navigating away. `coverage-gaps.md` notes the cancel path is untested across every
  dialog; the mixer panel simply does not have one, which is one fewer untested path.
- `data-testid={testId}` on the panel `<div>`, `${testId}-submit` on the `<button>`
  (ui-contract §1.2). Unchanged.
- `Null`, `Mock` and `Test` render no fields at all — `MixerSettingsWrapper` already handles
  `children === undefined` by dropping the title and field block. Keep. For those, show just
  the description in the body and no footer, so an empty panel does not present a Save button
  that saves nothing.

**Empty-state copy for the field-less mixers.** They currently render a bare panel. Give each
one sentence in `text-sm text-text-muted`: e.g. `No settings — this mixer reports a fixed
test pattern.` A panel with a title and nothing under it reads as a loading failure.

### 2.4 Field states — `ValidatingInput`

Four states, all in the same 420px box so nothing shifts:

```
  vMix IP                                     ← label, text-sm text-text-muted
┌──────────────────────────────────┐
│ 192.168.1.10                     │          rest: border-n-600, bg-n-900
└──────────────────────────────────┘
                                              ← help slot, reserved, empty

  vMix IP
┌──────────────────────────────────┐
│ 192.168.1.10                     │          focus: border-border-strong + white ring
└──────────────────────────────────┘

  vMix Port
┌──────────────────────────────────┐
│ 99999                            │          invalid: border-missing, aria-invalid
└──────────────────────────────────┘
⚠ invalid                                     ← text-sm text-missing + icon

  vMix Port
┌──────────────────────────────────┐
│ 8088                             │          valid, but suspicious
└──────────────────────────────────┘
⚠ This is the Web UI port, not the TCP API
  port. Leave blank for the default.
```

- **Invalid is amber `--color-missing`, never red.** Red on this page would be the same hue
  as on-air. Components §2.2 already mandates this. Plus an icon and text — colour is never
  the only carrier.
- `font-mono tabular-nums` on IP/port/interval fields. `1` vs `l` vs `I` in an IP address is
  a real support ticket.
- `data-testid` goes on the `<input>` (Rule A, components §2.0). This is the migration's
  highest-risk item — eight panels, two selector shapes.

**The warning pattern, generalised.** vMix is the only mixer that ships a `warningMessage`
today (`VmixSettings.tsx:57`: you typed 8088, the Web UI port, into the TCP API field). It is
the most useful thing on this page and the pattern deserves a name:

> **Suspicion, not validation.** The value is *legal* — the form saves, the button stays
> enabled — but it is probably not what you meant. It renders in the same help slot as an
> error, in the same amber, with the same icon, and it never blocks. Distinguishable from an
> error by one thing: the field border stays `border-n-600`.

That distinction is thin, and deliberately so. An operator does not need to learn a taxonomy;
they need to see amber text under a field they just typed in. The border is what tells them
whether Save will work, and Save's own disabled state is the authoritative answer.

Other places this pattern should be applied (not required now, but this is the hook):
a port below 1024, an IP in a different subnet from the hub's own, a `0.0.0.0` address.

**Disabled Save.** `canBeSaved === false` → button disabled, wrapped in a `<span>` that owns
the tooltip (`The form contains errors`) so the explanation survives the disabled state
(components §1.7, same fix as the menu). Disabled styling is `text-text-disabled bg-n-600`,
**not** `opacity-50` — an opacity-dimmed control on near-black disappears.
`coverage-gaps.md` notes the tooltip text itself is never asserted; the disabled state is.

### 2.5 Tally defaults panel

`components/config/TallySettings.tsx`. Six controls in three pairs, currently a flat list of
six identically-weighted headings. Group them, because "operator light" and "stage light" are
two different lamps and the current layout makes that a reading exercise:

```
OPERATOR LIGHT                    ← text-xs/600/uppercase/tracking-wide/text-text-muted
  Brightness      [slider]  70%
  Colours         [■ Default] [■ Yellow-Pink]
  ☑ Shows idle state
─────────────────────────────      ← separator
STAGE LIGHT
  Brightness      [slider]  90%
  Colours         [■ Default] [■ Yellow-Pink]
  ☐ Shows preview state
```

- Sliders are the composed `BrightnessSlider` (components §3.2) with its value bubble;
  testids `tally-defaults-ob` / `-sb` on `Slider.Root`.
- The operator slider has `minValue = DefaultTallyConfiguration.minOperatorLightBrightness`
  and `minMessage="Operator Light can not be turned off."`. Keep the floor visible on the
  track (§3.2: clamp in `onValueChange`, do not set `min`) so the operator can see they are
  being held above zero rather than concluding the slider is broken.
- Colour-scheme swatches render the **exact LED `rgb()`** at the selected brightness
  (tokens §2.3) — hardware truth, not styled. The `yellow-pink` option carries its rationale
  inline as `text-2xs text-text-muted`: `Better contrast for red-green colour blindness.`
  Tokens §3.1 requires it be surfaced, not buried.
- Checkboxes carry both `data-testid` and `data-value` on the Radix `Checkbox.Root`
  (components §2.5). Achromatic when checked — `bg-white text-n-950`, not the current
  `color="primary"` teal.

**One bug to fix while here.** `TallySettings.tsx:61` passes `data-testid="tally-defaults"`
to `MiniPage`, which destructures only `{title, addHeaderContent, contentPadding, testId,
children}` and drops it — so that attribute is not in the DOM today. Pass `testId="tally-defaults"`.
Nothing currently asserts it (only the `-ob`/`-sb`/`-oi`/`-sp` children are), so this is a
free correction, but do not "discover" it later and assume it was removed on purpose.

### 2.6 States

| State | Condition | Render |
|---|---|---|
| **Loading — mixer** | `mixerName === undefined \|\| allowedMixers === undefined` | Panel chrome + title render immediately; body shows **field skeletons** (label bar + input bar, `animate-pulse`), not a centred spinner. The panel shape is known before the data is; showing it prevents the layout jump. |
| **Loading — a mixer form** | `MixerSettingsWrapper isLoading` | Same treatment, inside the mixer panel only. Selector stays interactive. |
| **Loading — defaults** | `!settings` | Same. |
| **Empty** | — | Not reachable. There is always a mixer selected (`Null` is one) and defaults always have values. |
| **Invalid input** | any field invalid | §2.4. Save disabled + tooltip. Well covered by specs across 5+ files. |
| **Save rejected by server** | — | **Not covered by any spec** (`coverage-gaps.md` §3) and not handled in the UI at all today — `socket.emit` is fire-and-forget. Design: on save, the button enters a 2s pending state (`Saving…`, disabled); on the config echoing back changed, it shows `Saved` for 2s; if no echo arrives within 5s, the footer shows `⚠ Save not confirmed — the hub may not have received it.` in amber with a `[Try again]`. Nothing else changes. This is the honest version of a fire-and-forget socket: it cannot know the save failed, so it says it cannot confirm rather than claiming success. |
| **Hub disconnected** | `!isHubConnected` | Same banner as §1.5, and every Save button disables with the tooltip `Hub disconnected — changes cannot be saved.` Saving into a dead socket silently discards the edit. |

### 2.7 Responsive

| Width | Layout |
|---|---|
| ≥1024px | two columns, `560px` + `480px` |
| <1024px | single column, mixer panel first, `max-width: 560px` |
| <640px | single column, panels full-width, fields full-width, `p-4` instead of `p-6` |

Fields never exceed 420px even in a wide panel. A 900px-wide text input for a port number
looks like a mistake and reads worse.

## 3. TallyLogPage — log viewer

`hub/src/client/pages/TallyLogPage.tsx`. Route `/tally/:id/log`. Reached from the per-tally
menu. Read after something went wrong, usually while someone is waiting.

`coverage-gaps.md` rates this route well covered — `data-severity` variants are asserted by
`tally-logs.spec.ts`. So the job here is purely to make it scannable, and the one hard
constraint is: **do not emit `data-severity` anywhere outside a log line.** The log spec uses
`cy.contains('*[data-severity=info]', …)`, and an alert component that also emitted
`data-severity` would make that selector ambiguous (ui-contract H8).

### 3.1 Layout

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│ [vTally]  Tallies  Configuration  Flash                                          │
├──────────────────────────────────────────────────────────────────────────────────┤
│                                                                                  │
│ ┌────────────────────────────────────────────────────────────────────────────┐   │
│ │  Camera 2 · Logs                    [All ▾]  [ Search…        ]  [↓ Latest] │   │ ← sticky
│ ├────────────────────────────────────────────────────────────────────────────┤   │
│ │▏ 14:02:11.204   Connected from 192.168.1.42:7411                           │   │
│ │▏ 14:02:11.310   Subscribed to channel 2                                    │   │
│ │▎ 14:07:48.001   Missing — no keep-alive for 5s                             │   │  amber
│ │▍ 14:07:53.114   Disconnected                                               │   │  red
│ │▏ 14:08:02.550   Connected from 192.168.1.42:7411                           │   │
│ │▌ 14:08:02.601   Patched to channel 2                                       │   │  status
│ │  …                                                                         │   │
│ ├────────────────────────────────────────────────────────────────────────────┤   │
│ │  1,284 lines · showing 1,284                                               │   │
│ └────────────────────────────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────────────────────────┘
```

Panel `max-width: 1100px` — wide enough for a full message on one line, narrow enough that
the eye can return to the left edge. Not `maxWidth="sm"` as today; a log at 600px wraps
every second line and becomes unreadable.

### 3.2 The log line

This is the one real change. Today severity is a **full-width background fill**
(`bgWarning` / `bgError` / `bgStatus`), so a run of twenty warnings is a solid amber block
several hundred pixels tall. In a dark room that is a light source, and it destroys the
scanning rhythm that monospace rows exist to provide.

Replace the fill with a **4px left rail** plus a tinted background at low alpha:

```
▏ 14:02:11.204   Connected from 192.168.1.42:7411        ← info: n-600 rail, no tint
▌ 14:08:02.601   Patched to channel 2                    ← status: n-100 rail, n-850 tint
▎ 14:07:48.001   Missing — no keep-alive for 5s          ← warning: missing rail, 8% tint
▍ 14:07:53.114   Disconnected                            ← error: live rail, 8% tint
```

| `data-severity` | Rail | Row background | Timestamp | Message |
|---|---|---|---|---|
| `info` | 4px `--color-n-600` | none (zebra `n-850` on odd rows) | `text-n-500` | `text-text` |
| `status` | 4px `--color-n-100` | `--color-n-850` | `text-n-400` | `text-text` |
| `warning` | 4px `--color-missing` | `color-mix(in srgb, var(--color-missing) 8%, transparent)` | `text-n-400` | `text-missing` |
| `error` | 4px `--color-live` | `color-mix(in srgb, var(--color-live) 8%, transparent)` | `text-n-400` | `text-live-text` |

`--color-live-text` (`#FF6257`) for the message, not `--color-live` — on the surface the
plain live red is 4.41:1 and fails AA body (tokens §3.2). The rail may use the full
`--color-live` because it is non-text UI at 3:1.

This is one of the two places a red is permitted off a tally card (the other is the flasher's
failed step, components §3.1). It is defensible: this page shows no tally states at all, so
there is nothing for the red to be confused with, and a log error genuinely is an error.

Row: `display: grid; grid-template-columns: 4px 11ch 1fr`, `font-mono`, `text-sm`,
`py-1 px-0`, `align-items: baseline`. The rail is a grid column, not a border, so it cannot
be collapsed by a border-collapse rule and it aligns perfectly across rows.

**Timestamp.** Today it renders `dateTime.toISOString()` — 24 characters of
`2024-03-11T14:02:11.204Z` on every row, where 20 of them are identical down the whole page
and the operator is standing in UTC+1. Render **local `HH:mm:ss.SSS`** in the fixed column,
with the full ISO string in a `title` attribute and in the `<time datetime>` attribute so it
is still machine-readable and copyable. `tabular-nums` so the columns do not dance.
When the date changes mid-log, insert a date separator row rather than putting the date on
every line:

```
──── 12 March 2024 ────────────────────────────────────────
```

`<time datetime>` keeps the full ISO value, so nothing that reads the DOM loses information.
Confirm no spec asserts the visible ISO text before shipping this — `tally-logs.spec.ts`
matches on message content and `data-severity`, but that is worth one grep, not an assumption.

`data-testid="log-line-${idx}"` and `data-severity` stay on the row root, one node, exactly
as today (`TallyLogPage.tsx:50`).

**Also fix the missing React key**: `key={idx}` is currently set on the inner `<div>` inside
`Log`, not on the `<Log>` element in the `.map()` (`TallyLogPage.tsx:66`), so React warns and
reconciliation is index-based on an append-only list. Move the key to the mapped element.

### 3.3 Scanning at 1,000+ lines

The stated case: a tally has produced thousands of lines. Four things, in order of value:

1. **Severity filter** — `[All ▾]` native select: `All` / `Warnings & errors` / `Errors`.
   Client-side, one `.filter()`. The single highest-value control on the page: "show me only
   what went wrong" is why anyone opens a log.
2. **Text search** — one input, case-insensitive substring against `log.message`. Matching
   substrings get `bg-n-700` highlight. No regex, no query language.
3. **Newest at the bottom, auto-scroll pinned** — the log appends, so the interesting end is
   the bottom. Auto-scroll to bottom on new lines **only when already within 100px of the
   bottom**; otherwise show the `[↓ Latest]` button with an unread count
   (`↓ 14 new`). Scrolling up to read something and being yanked back down is the classic
   log-viewer failure.
4. **Windowing above ~2,000 rows.** Not before. 1,000 `<div>`s render fine; 20,000 do not.
   `@tanstack/react-virtual` if it becomes real, but the log is in-memory and bounded by
   session length, so measure first. A fixed 28px row height makes this trivial when needed.

Explicitly **not** doing: pagination (breaks Ctrl-F and the mental model of a continuous
log), log level colour legend (four rails with words next to them are self-evident),
or a download button (the operator's next step after reading a log is fixing the rig, not
filing it).

The footer line `1,284 lines · showing 340` is the honest counterpart to the filter — the
same principle as §1.2, a filter that hides information must say how much.

### 3.4 States

| State | Condition | Render |
|---|---|---|
| **Loading** | `logs === undefined` | 6 skeleton rows at the fixed 28px height, `animate-pulse`. Today renders `""` with a `@TODO: loading` (`TallyLogPage.tsx:66`). |
| **Empty — no logs** | `logs.length === 0` | Centred in the panel body: `No log entries yet` + `Entries appear as the tally connects, reports state, or fails.` `text-text-muted`. |
| **Empty — filtered out** | filter/search matches nothing | `No lines match “timeout”` + `[Clear filters]`. Distinct from the above. |
| **Unknown tally** | `tallies` loaded but no `tally` with that id | Title falls back and the panel shows `Tally “web-xyz” was not found. It may have been removed.` with a link back to `/`. Today the title renders the string `undefined's Logs` (`TallyLogPage.tsx:65`) — literally, because `tally?.name` is `undefined` inside a template literal. Fix. |
| **Tally not yet loaded** | `tallies === undefined` | Title shows a skeleton bar, not `undefined's Logs`. Same root cause as above; the two are distinguishable by whether `tallies` is loaded at all. |
| **Hub disconnected** | `!isHubConnected` | Same banner as §1.5. The log stops appending; add a terminal row in the list itself: `── connection to hub lost ──`, `text-missing`, centred, so the gap in the log is *in* the log rather than something the reader has to infer. |

Panel title: `Camera 2 · Logs`, `text-xl`/`600`, with `Camera 2` in `text-text` and `Logs` in
`text-text-muted`. Not `Camera 2's Logs` — the possessive breaks on names ending in `s` and
buys nothing.

### 3.5 Responsive

| Width | Layout |
|---|---|
| ≥1024px | panel 1100px, header controls on one row |
| 640–1023px | panel full-width, header wraps to two rows (title, then controls) |
| <640px | timestamp column drops to `HH:mm:ss` (9ch), message wraps with a hanging indent to the message column so wrapped lines stay visually attached to their row |

The rail and severity tint survive at every width. They are the only thing that must.

## 4. WebTallyPage — phone-as-tally

`hub/src/client/pages/WebTallyPage.tsx`. Route `/tally/:tallyId` where `tallyId` starts
`web-`. A phone gaffer-taped next to a camera, seen by talent and crew from three metres, in
a dark studio, for four hours.

**This screen has no Layout chrome and never gets any.** No nav bar, no panel, no card. The
viewport is the light. Everything else is a compromise of the one job.

### 4.1 The design constraint, stated once

Legibility at three metres in the dark beats aesthetics, and it beats consistency with the
rest of the product. Concretely, that means:

- The fill is **the entire viewport**, `100vw × 100dvh` (`dvh`, not `vh` — iOS Safari's
  address bar eats `vh` and leaves a strip of white page background at the bottom, which on a
  black idle screen is a bright bar pointed at the talent).
- Type is `clamp(2rem, 12vw, 8rem)`. The name has to be readable from where the camera
  operator stands, not from where the phone is.
- Nothing moves except the highlight strobe.
- Chrome (settings and fullscreen buttons) is drawn at **70% alpha of the derived text
  colour** — visible if you look for it, invisible if you are not.

### 4.2 The five `StateCommand`s plus loading

What an operator actually sees. Colours are the LED values from `ColorScheme.ts`
(tokens §2.3), rendered exactly, dimmed by brightness — hardware truth, per tokens
principle 6.

| `command` | `data-color` | Fill (default scheme) | Word | Chrome |
|---|---|---|---|---|
| — (loading) | `loading` | `--color-n-800` `#1E242B` | `Waiting for data` | spinner only, no buttons |
| `on-air` | `program` | `rgb(255,0,0)` × brightness | `On Program` | visible |
| `preview` | `preview` | `rgb(0,255,0)` × brightness | `On Preview` | visible |
| `release` | `idle` | `rgb(0,1,0)` × brightness → effectively black | `Idle` | visible |
| `highlight` | `highlight` | white/black 4Hz strobe | `Highlight` | visible |
| `unknown` | `unknown` | `--color-n-800` `#1E242B` | `No connection to Mixer` | spinner, no buttons |

```
  on-air                     preview                    release (idle)
┌─────────────────┐        ┌─────────────────┐        ┌─────────────────┐
│              ⚙  │        │              ⚙  │        │              ⚙  │
│                 │        │                 │        │                 │
│    CAMERA 2     │  red   │    CAMERA 2     │ green  │    CAMERA 2     │ black
│                 │  fill  │                 │  fill  │                 │
│   On Program    │        │   On Preview    │        │      Idle       │
│              ⛶  │        │              ⛶  │        │              ⛶  │
└─────────────────┘        └─────────────────┘        └─────────────────┘
   black text                 black text                 grey text

  highlight                  unknown / loading
┌─────────────────┐        ┌─────────────────┐
│ ███████████████ │        │                 │
│ ██ CAMERA 2 ███ │ 4Hz    │      ( ◜ )      │  n-800
│ ███████████████ │ white  │                 │
│ ██ Highlight ██ │  ↔     │ No connection   │
│ ███████████████ │ black  │    to Mixer     │
└─────────────────┘        └─────────────────┘
```

Keep the `((a: never) => {})(command)` exhaustiveness guard (`WebTallyPage.tsx:181`). A new
`StateCommand` must fail the build rather than render a silent default. It is four characters
of insurance on the screen that can least afford a default.

**Three notes on the states as they stand:**

1. **`release` renders as black, and that is correct.** `rgb(0,1,0)` is the lamp being off;
   tokens §2.3 says render that honestly. But a black phone screen is indistinguishable from
   a phone that has died, gone to sleep, or lost the page. So the idle state keeps the name
   and the word `Idle` visible in `--color-n-500` — the *only* thing on screen, dim enough
   not to spill light onto the set, present enough to prove the page is alive. This is the
   difference between "the light is off" and "the light is broken", and from three metres
   they otherwise look identical.
2. **`unknown` and `loading` look nearly the same and mean different things.** Both are
   `n-800` with a spinner. Their words differ and that is currently the entire distinction.
   Keep the shared appearance — both mean "do not trust this screen" and that is the
   operationally important message — but make the words large: `text-4xl` at least, not the
   default-size `Typography` they get today.
3. **`preview` full-brightness green gets black text** (`contrastText` → `#0B0E11`,
   15.30:1). The current MUI `getContrastText` picks black there too, so no change. `on-air`
   red **changes from white to black text** (4.00:1 → 5.25:1), per components §4. That is a
   visible, deliberate improvement and no spec asserts text colour on this page.

### 4.3 Brightness — **UNGUARDED**

`coverage-gaps.md` #1: `webtally.spec.ts` asserts that the `data-brightness` attribute value
changes. It never asserts the rendered pixel. **The attribute can be perfectly correct while
the screen is fully wrong** — wire the dim to the wrong CSS property, or break `dim()`, and
every gate stays green while an on-air light shows at 10%.

The precedence chain is fixed by ui-contract §2.8 and does not change:
per-tally override → operator default → `100`, all ÷ 100.

Design so that a human sees the breakage on the first run:

1. **One computed value, used twice.** The dimmed colour is computed once
   (`dim(bgColor, brightness)`) and drives both `background-color` and, via
   `contrastText(dimmed)`, the text colour. If the dim breaks, the *text colour* breaks with
   it — black text on a bright fill becomes white text on a bright fill, or vice versa, which
   is instantly visible. A brightness bug that only affects the background can hide; one that
   also inverts the text cannot. Never compute the text colour from the *undimmed* colour as
   a shortcut.
2. **The brightness readout is on screen while the settings sheet is open**, showing the
   applied percentage next to the slider, over the live fill. Not a preview swatch — the
   actual page background *is* the preview. An operator dragging the slider sees the room
   light change; if it does not change, the bug is discovered in the two seconds after it is
   introduced.
3. **`data-brightness` stays exactly as it is** — raw 0–1 fraction on `page-tally-web`
   (`WebTallyPage.tsx:198`), three specs read it. Do not move it to the slider component
   (components §3.2 warns about exactly this).
4. **Brightness never applies to the highlight strobe.** Locate is an operator asking
   "which light is this?" — dimming it defeats the request. The strobe is full white/black
   regardless of the brightness setting, and that is existing behaviour
   (`classes.highlight` sets its own colours before `bgColor` is dimmed). Preserve it, and
   note it, because "brightness applies everywhere" is a very natural thing to assume during
   a rewrite.

**Add the one assertion.** `coverage-gaps.md` ranks it #1 and it is one
`getComputedStyle(el).backgroundColor` check on the on-air state at a known brightness. The
design makes a break visible; the test makes it caught. Both.

### 4.4 Highlight — **UNGUARDED**

`webtally.spec.ts:203-212` asserts `data-color="highlight"` exists. It never asserts the
animation runs. A rewrite that drops the `@keyframes` leaves the attribute correct and the
locate function dead.

The current animation is a 0.25s (4Hz) `step-start` white↔black alternation. **Keep 4Hz and
keep `step-start`.** This is faster than the 1Hz specified for the *tally card* in components
§1.5, and the difference is deliberate: the card is one of twelve on a monitor being scanned;
the phone is a single light in a room that someone is sweeping their eyes across looking for
it. Faster is easier to catch peripherally. A hard step, not a fade — a fade spends half its
cycle at intermediate greys that read as neither.

```
t=0.00s  ██████  white
t=0.125s ░░░░░░  black
t=0.25s  ██████  white     …
```

Design for visible failure: the highlight state is the only state whose **word changes to
`Highlight`** and whose fill is achromatic. If the animation dies, the screen sits on a
static black fill reading `Highlight` — which is obviously wrong to anyone looking at it,
rather than quietly reverting to something plausible. Do not fall back to the underlying
state's colour when the animation is unsupported.

`prefers-reduced-motion: reduce` → static **white** fill (not black), per tokens §2.8. The
locate signal still works; it stops flashing. White because a static white phone in a dark
studio is still findable and a static black one is not.

**Photosensitivity.** 4Hz full-field white↔black is below the 3-flashes-per-second general
threshold only in the sense that it exceeds it — this *is* a flashing pattern, and it is
intentional and operator-triggered. Two mitigations, both cheap: it is never automatic (it
happens only when someone clicks Highlight), and it stops on its own after 10s
(components §1.5). Do not make it a persistent mode.

### 4.5 Entry state — naming and choosing the tally

A web tally is created from the index page (`TallyCreate.tsx`), not from this route. The
dialog is the entry point:

```
┌ Create Web Tally ────────────────────────────┐
│                                              │
│  ⚠ Hardware tallies register themselves      │  ← tally-create-warning, only when
│    and should not be created here.           │    no UDP tally exists yet
│                                              │
│  A web tally can be viewed in any browser.   │
│                                              │
│  Name                                        │
│  ┌────────────────────────────────────────┐  │
│  │ Camera 2                               │  │  ← autofocus, max 26 chars
│  └────────────────────────────────────────┘  │
│  8 / 26                                      │  ← new: live counter
│                                              │
│  Channel                                     │
│  ┌────────────────────────────────────────┐  │
│  │ (unpatched)                         ▾  │  │
│  └────────────────────────────────────────┘  │
│                                              │
│                       [ Cancel ]  [ Create ] │
└──────────────────────────────────────────────┘
```

- Three validation messages already exist and are spec-asserted: empty → `Please enter a
  name`, >26 → `name must not be longer than 26 characters`, duplicate → `a tally with the
  name X already exists`. Today they live **only in a tooltip on the disabled Create button**
  (`TallyCreate.tsx:95`). Tokens §3.3: nothing load-bearing lives only in a tooltip. Render
  the message under the field, in amber, with the icon — and keep the tooltip as well, since
  a spec may read it.
- Add the `8 / 26` counter. A 26-char limit that only announces itself at character 27 is a
  trap; the operator has already typed the name they wanted.
- `tally-create-cancel` / `tally-create-ok` testids unchanged. Note `coverage-gaps.md`: the
  cancel path is untested here as everywhere.

**Arriving at the route.** The phone gets there via the tally menu's `Connect` item
(`tally-${name}-web`) — in practice, someone messages a link or shows a QR code. Two
additions worth the space, both on the index card menu rather than here: the Connect item
copies the absolute URL, and the tally settings dialog shows a QR code for it. A phone that
has to type `http://192.168.1.5:3000/tally/web-Camera%202` is a phone that ends up on the
wrong tally.

**Invalid tally** → `PageNotFound` with `Tally with name X not found.` Already implemented
(`WebTallyPage.tsx:144-146`) and spec-covered via `webTally.invalid`. Keep. Add a
`[Back to tallies]` link — a phone with no browser chrome in fullscreen has no other way out.

### 4.6 Fullscreen and wake lock

`coverage-gaps.md`: fullscreen is never clicked by any spec, and wake-lock has an `it.skip`.
Both are studio-critical and both are invisible when broken until the show.

```
  windowed                        fullscreen
┌─────────────────┐             ┌─────────────────┐
│  ⌂ 14:23    📶  │ ← OS bar    │                 │
├─────────────────┤             │                 │
│              ⚙  │             │    CAMERA 2     │
│    CAMERA 2     │             │                 │
│   On Program    │             │   On Program    │
│              ⛶  │             │              ⛶  │
└─────────────────┘             └─────────────────┘
                                 chrome fades out after 3s of no touch
```

- Enter fullscreen → `noSleep.enable()`; exit → `noSleep.disable()`. Already correct
  (`WebTallyPage.tsx:188-195`), including the unmount cleanup. Preserve both, and preserve
  the cleanup especially — a leaked wake lock drains the phone that is meant to run all show.
- In fullscreen, chrome (⚙ and ⛶) **fades to 0 opacity after 3 seconds without a touch**, and
  returns on any touch. Not `display: none` — it must stay focusable and hit-testable, so a
  tap anywhere in the corner brings it back. 44×44px targets throughout (tokens §2.5).
- **The wake lock needs a visible state.** It is the single most consequential invisible
  behaviour on this page: if it silently fails, the phone sleeps mid-show and the light goes
  out. When fullscreen is active, show a small `⦿ screen kept awake` line at 70% alpha in the
  bottom-left, and if `noSleep.enable()` throws or the page is not fullscreen, show
  `⚠ screen may sleep` in amber instead. Two words, and the failure stops being silent.
- `nosleep.js` is a `<video>` hack. Migrate to the Wake Lock API where available
  (`navigator.wakeLock.request('screen')`), keeping nosleep as the fallback — the source
  already flags this (`WebTallyPage.tsx:137`). Out of scope for the design, in scope for the
  visible-state requirement above: the indicator should reflect whichever mechanism actually
  succeeded.

### 4.7 States

| State | Condition | Render |
|---|---|---|
| **Loading** | `!tally \|\| !command` | `n-800` fill, `min(30vw, 30vh)` spinner, `Waiting for data` at `text-4xl`. No settings or fullscreen buttons — there is nothing to configure yet. |
| **Not found** | `isValid === false` | `PageNotFound`, §4.5. |
| **Mixer down** | `command === "unknown"` | `n-800` fill, spinner, `No connection to Mixer`. Distinct from loading only by the word; both mean do not trust this screen. |
| **Hub socket lost** | socket disconnect | `useWebTally.onDisconnect` clears `tally` and `command`, so the page **falls back to the loading state** — which is honest (it no longer knows anything) but indistinguishable from a slow first load. Add a `⚠ Disconnected — reconnecting` line in amber below the spinner once a disconnect has actually been observed. `coverage-gaps.md` lists `it.skip("indicates when connection to server is broken")` — this is the design for it. |
| **Idle** | `command === "release"` | Black fill, dim name + `Idle` in `n-500`. §4.2 note 1. |
| **Error** | — | There is no other error surface. A tally that cannot be resolved is a 404; anything else is one of the above. |

### 4.8 Responsive

There is one layout and it is centred. Portrait phone is the design target; everything else
falls out of `flex; align-items: center; justify-content: center`.

| Case | Behaviour |
|---|---|
| Portrait phone | name at `clamp(2rem, 12vw, 8rem)`, word at `clamp(1rem, 5vw, 2.5rem)` below it |
| Landscape phone | same, `vw`-based clamp keeps the name from overflowing a 700px-wide 320px-tall viewport; cap at `20vh` too |
| Tablet / desktop | same, capped at `8rem` so it does not become absurd; the fill is the point, not the type |
| Very long name | name wraps to two lines and the clamp shrinks; never truncate. A truncated tally name on a camera is worse than a small one. |

Name is centred, `font-weight: 700`, `tracking-tight`, `text-transform: none` — show it as
the operator typed it. `overflow-wrap: anywhere` so a 26-character name with no spaces still
fits.

## 5. FlasherPage — USB firmware wizard

`hub/src/client/pages/FlasherPage.tsx`. Plug an ESP8266 tally into the machine running the
hub over USB, edit its `tally-settings.ini`, and update its firmware. Used once per device,
usually by someone who has not done it before, often while frustrated that it did not work
the first time.

`coverage-gaps.md`: everything active here is exercised only by `manual_flasher.spec.ts`,
which is hardware-gated and never runs in CI. `flasher.spec.ts` is a 14-line stub covering
the "no device" state. Treat the whole page as **UNGUARDED** below the device-detection line.

### 5.1 Layout — a stack of panels that appear as they become relevant

The page is progressive: each panel exists only when the previous one has succeeded. That is
already how it works (`FlasherPage.tsx:130,150` gate on `tallyDevice.update` and
`nodeMcuVersion`); the design keeps it and makes the progression legible.

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│ [vTally]  Tallies  Configuration  Flash                                          │
├──────────────────────────────────────────────────────────────────────────────────┤
│                                                                                  │
│  ┌ Tally Flasher ──────────────────────────────────────────────────────  ⟳  ┐    │
│  │  Update the configuration or software of a hardware tally light.         │    │
│  │                                                                          │    │
│  │  ● Device on /dev/ttyUSB0 · NodeMCU 3.0.0                                │    │
│  └──────────────────────────────────────────────────────────────────────────┘    │
│                                                                                  │
│  ┌ Software Update ─────────────────────────────────────────────────────────┐    │
│  │  ⚠ The software on this tally can be updated.                            │    │
│  ├──────────────────────────────────────────────────────────────────────────┤    │
│  │                                                          [ Update now ]  │    │
│  └──────────────────────────────────────────────────────────────────────────┘    │
│                                                                                  │
│  ┌ Edit tally-settings.ini ─────────────────────────────────────────────────┐    │
│  │  Tally name    [ Camera 2                    ]                           │    │
│  │  Wifi SSID     [ studio-5g                   ]                           │    │
│  │  Wifi password [ ••••••••                    ]                           │    │
│  │  ───────────────────────────────────────────────────────────────────     │    │
│  │  [ ○—] Expert mode                                                       │    │
│  ├──────────────────────────────────────────────────────────────────────────┤    │
│  │                                                            [ Save ]      │    │
│  └──────────────────────────────────────────────────────────────────────────┘    │
└──────────────────────────────────────────────────────────────────────────────────┘
```

Panels are the same `MiniPage` chrome as ConfigPage (§2.1), single column,
`max-width: 720px`, `gap: var(--space-6)`. Wider than the config panels because the
settings.ini editor in expert mode is a key/value table.

The reload control (`⟳`) stays in the first panel's header, `aria-label="reload"`, disabled
while loading or uploading. It is the single most-used control on the page — the honest
workflow here is plug, fail, wiggle the cable, retry.

### 5.2 Device detection

Three outcomes, all already implemented in `flasher/Help.tsx`, all keeping their copy:

| Condition | Panel body |
|---|---|
| `tallyDevice === undefined` | Loading — see §5.6 |
| `tallyDevice.path === undefined` | `Did not find any connected device.` + `[Try again]`, then the four-item **Possible fixes** list |
| `nodeMcuVersion === undefined` | `Device was found, but could not determine if LUA is running.` + `[Try again]`, then its own three-item fixes list |
| both present | Success line: `● Device on /dev/ttyUSB0 · NodeMCU 3.0.0` |

The "possible fixes" pattern is the best thing on this page and should not be flattened into
a single sentence during the rewrite. A USB device that does not appear has four plausible
causes and the user cannot guess which; enumerating them is the whole value.

Styling: the warning is `alert` §2.11 in amber, **outlined not filled**. The fixes list is a
second, quieter block — `bg-surface-hover`, `border-border`, `text-sm`, `<ul>` with
`list-disc pl-5 gap-2`. Not an `alert` with `severity="info"`: it is reference material, not
a notification, and a second coloured alert stacked under the first is noise. The
`ExternalLink` to the USB driver page keeps an `↗` glyph and `text-text` with an underline —
achromatic, per tokens principle 1 (the current `theme.palette.info.main` blue is dropped).

One conditional item is worth preserving exactly: when the page is *not* on localhost, the
list gains `The tally has to be connected to the computer that runs the hub. It does not work
on remote machines.` That is the single most common misunderstanding and it only appears when
it applies.

### 5.3 Firmware unavailable — the honest empty state

The firmware lives at `<hub>/esp8266` in a release package, or `<repo>/tally/out` in a dev
checkout after `make build`. In a hub-only checkout **neither exists**, and
`NodeMcuConnector.getLocalFiles()` now returns `[]` rather than throwing (the crash fix has
landed; before it, opening `/flasher` killed the backend process).

But `[]` is not yet an honest *screen*. `doFilesNeedUpdate([])` returns `false`, which maps
to `update: "up-to-date"` — so a hub with no firmware at all tells the operator **"The
software on this Tally is up to date."** That is a false all-clear, and it is worse than the
crash was, because a crash is obviously a bug and a green checkmark is not.

`UpdateType` already has the right value: `"not-available"`
(`shared/flasher/TallyDevice.ts:26`). Set it when `getLocalFiles()` returns empty, and render
this:

```
┌ Software Update ─────────────────────────────────────────────────────────────┐
│                                                                              │
│  ⓘ  Firmware not available on this hub                                       │
│                                                                              │
│     This copy of the hub does not ship the tally firmware, so it cannot       │
│     check for or install software updates. Editing tally-settings.ini         │
│     below still works normally.                                              │
│                                                                              │
│     Looked in:                                                               │
│       esp8266/          (release package)                                    │
│       ../tally/out/     (development checkout — run `make build`)            │
│                                                                              │
│     Install a release build of vTally to enable firmware updates.  ↗ Docs    │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
```

Four things this state must do, and the reasoning for each:

1. **Say it is the hub that is missing something, not the tally.** The operator's default
   reading of any message on this page is "my device has a problem". The heading names the
   hub explicitly.
2. **Show both paths that were checked, verbatim.** This is the difference between a support
   ticket and a fix. Someone in a dev checkout reads `../tally/out/` and knows to run
   `make build`; someone on a release reads `esp8266/` and knows their package is incomplete.
   Monospace, `text-sm`, `text-text-muted`.
3. **Say what still works.** `tally-settings.ini` editing is independent of the firmware
   files and remains fully functional. Without this line the operator assumes the whole page
   is dead and stops.
4. **No button.** There is no action the UI can offer — no retry, no download. A `[Try again]`
   that re-checks a directory that will not appear is a lie. The resolution is outside the
   app and the text says so.

Rendered as a **neutral informational block**, not an amber warning: `bg-surface-hover`,
`border-border`, `ⓘ` in `text-n-300`. Amber would put this at the same visual weight as "your
tally is not responding", and it is not that — it is a capability the build does not have.
Nothing is broken.

The panel is **still rendered**. Today `FlasherPage.tsx:130` only mounts the Software Update
panel when `update` is `updateable` or `up-to-date`, so `not-available` produces nothing at
all — a blank space where a panel should be, which reads as a rendering failure. Extend the
condition to include `not-available` and let the panel explain itself. That blank is the
current behaviour's remaining half of the bug.

`data-testid="update-software"` stays on the panel; `update-software-now` is simply not
rendered, as it is not rendered for `up-to-date` today.

### 5.4 The vertical stepper and progress dialog

The stepper is specified in components §3.1 — `<ol>`, `data-testid="progress-step-${id}"` and
`data-done` on each `<li>`, five ids (`initialize`, `connection`, `upload`, `reboot`, `done`),
pseudo-element connector. Not restated here.

Where it lives: inside the `progress` dialog, which opens on Save or Update now and cannot be
dismissed while `isUploading` (`disableBackdropClick` / `disableEscapeKeyDown`). Preserve
both — closing mid-flash leaves a half-written device.

```
┌ Upload ──────────────────────────────────┐
│                                          │
│  ✓  Initialize                           │
│  │                                       │
│  ✓  Connect to device                    │
│  │                                       │
│  ◐  Upload files          (3 / 7)        │  ← active: spinner + tabular count
│  │  ████████████░░░░░░░░░░░░             │  ← progress bar, achromatic
│  ○  Reboot                               │
│  │                                       │
│  ○  Done                                 │
│                                          │
├──────────────────────────────────────────┤
│                              [ Close ]   │  ← disabled while uploading
└──────────────────────────────────────────┘
```

- The upload step is the only one with a bar. `progress` §2.14: track `bg-n-700`, indicator
  `bg-n-100`, 6px, `tabular-nums` on the count so digits stop dancing.
- Failure sets `data-state="error"` on the step: filled X in `--color-live-text` `#FF6257`,
  label in the same. Second permitted red off a tally card (components §3.1) — this page
  shows no tally states, and a failed flash is a genuine error.
- On error, `[Close]` re-enables and the error message renders below the stepper in the same
  amber-outlined alert used elsewhere. **The dialog does not auto-close on failure** — today
  it stays open, correctly, and success auto-reloads the device (`handleReload()` in the
  progress callback). Keep both.
- `manual_flasher.spec.ts` waits up to 60s on the upload step's `data-done`. The bar and
  count are what make that minute survivable for a human watching it.

### 5.5 The settings.ini editor and expert mode

`EditSettingsIni.tsx`. Two modes over one data structure.

```
  simple mode                          expert mode
┌──────────────────────────┐         ┌────────────────────────────────────┐
│ Tally name               │         │ [key]            [value]           │
│ [ Camera 2            ]  │         │ tally_name       Camera 2          │
│ Wifi SSID                │   →     │ wifi_ssid        studio-5g         │
│ [ studio-5g           ]  │         │ wifi_password    ••••••            │
│ Wifi password            │         │ station_ip       192.168.1.42      │
│ [ ••••••              ]  │         │ …                                  │
├──────────────────────────┤         ├────────────────────────────────────┤
│ [ ○—] Expert mode        │         │ [ —● ] Expert mode                 │
└──────────────────────────┘         └────────────────────────────────────┘
```

- The toggle is `switch` §2.6 — the one place `data-testid` goes on the **wrapper**, because
  `manual_flasher.spec.ts` clicks the outer labelled node. `data-testid="tally-settings-expert"`
  and `data-expertmode` both on a clickable `<label>` containing the Radix `Switch`.
- Cross-mode sync (edit in simple, switch to expert, see the change) is app logic and survives
  the restyle untouched. It is worth one line in the panel, though: expert mode is a
  *different view of the same values*, not a different form, and a first-time user does not
  know that. `Shows every key in the file. Changes made here and in simple mode are the same
  settings.` in `text-sm text-text-muted` under the toggle.
- When `!tallyDevice.tallySettings`, the amber outlined alert `tally-settings.ini does not
  exist yet and will be created.` renders above the fields. Keep verbatim — it is the
  difference between "I am editing" and "I am creating", and it changes what a cautious user
  does next.
- Password fields are `type="password"` with a reveal toggle. A wifi password typed blind
  into a device that will be taped to a truss is worth one eye icon.

### 5.6 States

| State | Condition | Render |
|---|---|---|
| **Loading** | `tallyDevice === undefined` | First panel body shows a spinner (today: `Spinner`). Keep the spinner here rather than skeletons — this is a hardware probe of unknown duration, not a data fetch with a known shape, and the panel below it genuinely does not exist yet. Disable the reload button while it runs. |
| **No device** | `path === undefined` | §5.2. Only the first panel renders. |
| **Device, no LUA** | `nodeMcuVersion === undefined` | §5.2. Only the first panel renders — correct, since neither update nor settings can be read. |
| **Firmware unavailable** | `update === "not-available"` | §5.3. Software Update panel renders with the informational block; settings panel renders normally. |
| **Up to date** | `update === "up-to-date"` | `The software on this Tally is up to date.` No button. **Green is wrong here** — components Rule B and tokens principle 1 keep hue for tally state. Render it as `✓ Up to date` in `text-text` with a `text-n-300` check, in the same neutral block as §5.3. The current `severity="success"` outlined alert is the last coloured non-amber alert in the app; drop the colour, keep the sentence. |
| **Updateable** | `update === "updateable"` | Amber outlined alert + `[Update now]`. Unchanged. |
| **Uploading** | `isUploading` | Progress dialog open and undismissable; reload disabled; both panels' buttons disabled. |
| **Upload failed** | `progress.error` | §5.4. Dialog stays open, `[Close]` enabled, error text below the stepper. |
| **Hub disconnected** | `!isHubConnected` | Same banner as §1.5. Every action disabled — the flasher runs entirely over the socket, so a dead socket means nothing on this page works. |

### 5.7 Responsive

| Width | Layout |
|---|---|
| ≥768px | single column, panels `max-width: 720px`, expert-mode table two columns |
| <768px | panels full-width; expert-mode table becomes stacked `key` above `value` pairs |
| <640px | dialog goes full-screen (`inset: 0`, no radius) so the stepper is never cramped |

The flasher is realistically used on a laptop — the device is plugged into the machine
running the hub. Below 768px is a courtesy, not a target.

---

## 6. What is deliberately not designed

- **A light theme.** Declined, not deferred (tokens §2). A light UI in a dark control room is
  a flashlight in the operator's face.
- **A dashboard / overview screen.** IndexPage is the overview. A second summary screen would
  compete with it for the operator's glance and add a place for the two to disagree.
- **Toasts.** Nothing in this product is both transient and important. Save confirmation lives
  in the footer next to the button that caused it (§2.6); failures live where the failure is.
- **A settings page for the app itself.** There is nothing to put on it.
- **Animation on any tally state.** Tokens principle 2. The only two permitted animations in
  the product are the locate strobe (§4.4) and the flasher's step spinner (components §3.1),
  and both live where no tally state is on screen — except the strobe, which *is* the state.

## 7. Mockups

`docs/design/mockups/` — self-contained HTML, no build step, open directly in a browser.

| File | Shows |
|---|---|
| `tally-grid.html` | IndexPage: one on-air, one **on-air AND disconnected** (§1.1, the worst case), preview, idle, idle+missing, idle+disconnected, unpatched, and the add-tally card. Greyscale the page and the on-air cards are still the only solid blocks. |
| `web-tally.html` | WebTallyPage: on-air at 100% and at 40% (the unguarded brightness path, §4.3), preview, idle, the 4Hz locate strobe, unknown, hub-disconnected, and fullscreen with the wake-lock indicator. |
