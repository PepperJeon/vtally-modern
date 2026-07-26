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

_pending_

## 4. WebTallyPage — phone-as-tally

_pending_

## 5. FlasherPage — USB firmware wizard

_pending_
