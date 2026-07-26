# vTally Component Design

Component layer built on `design-tokens.md`. Token names are used verbatim; no new
colours are introduced here.

## 1. The tally card

`hub/src/components/Tally.tsx`. The core object of the product. Everything else on the index
page is chrome around a grid of these.

### 1.0 What the card must survive

Two axes, independent, both always visible:

- **Tally state** — `unpatched` | `program` | `preview` | `idle` (`Tally.tsx:94-105`, the
  if/else chain, in that priority order — unpatched wins over program).
- **Transport health** — `connected` | `missing` | `disconnected`, derived from
  `tally.isActive()` and `tally.isMissing()` (`Tally.tsx:127`).

`design-tokens.md` §3.3 states the rule: they never overwrite each other. A card that is
`program` + `disconnected` is a solid red fill **and** a dashed grey outline **and** the word
`NO SIGNAL`. That is the product's worst case and it must be unambiguous.

`highlight` is a third, transient axis — an operator-triggered locate that runs for 10s. It
overrides the fill while active and restores the underlying state when it stops.

### 1.1 Structure and the attribute contract

```
┌─ article  data-testid="tally-${name}" data-color=… data-isactive=…  ← ALL THREE HERE
│           role="group" aria-label="Camera 2, on air, connected"
│  ┌─ header .tally-head ─────────────────────────────────────┐
│  │  [shape]  Camera 2                              [⋮ menu] │
│  └──────────────────────────────────────────────────────────┘
│  ┌─ body ───────────────────────────────────────────────────┐
│  │  <select data-testid="channel-selector">                 │
│  └──────────────────────────────────────────────────────────┘
│  ┌─ footer ─────────────────────────────────────────────────┐
│  │  ON AIR                         192.168.1.44:7411        │
│  └──────────────────────────────────────────────────────────┘
└─
```

**Attribute placement — this is the part that breaks silently.**

| Attribute | Element | Values | Contract ref |
|---|---|---|---|
| `data-testid="tally-${name}"` | the **card root** (`<article>`, replacing MUI `Paper`) | computed | ui-contract §1.5 |
| `data-color` | the **same card root node** | `unpatched` \| `program` \| `preview` \| `idle` | ui-contract §2.1 |
| `data-isactive` | the **same card root node** | `"true"` \| `"false"` | ui-contract §2.2 |
| `data-testid="tally-${name}-menu"` | the menu-trigger **wrapper `<div>`**, not the button inside it | computed | ui-contract §1.5 |
| `data-testid="channel-selector"` | the **native `<select>`** | literal | ui-contract §1.5 |

All three card attributes land on **one node**. `Tally.tsx:118` currently puts them on the
MUI `Paper` root, which renders a single `<div>`. Replace with `<article>` and spread all
three there — do not split them across a wrapper and an inner element, and do not let a
Radix `Slot`/`asChild` swallow them.

`data-color` and `data-isactive` are **state, not styling**. Keep the computation exactly as
`Tally.tsx:94-115` has it (unpatched → program → preview → idle) and drive the CSS *from the
attribute* rather than from a parallel `className` ternary. One source of truth:

```tsx
<article
  data-testid={`tally-${tally.name}`}
  data-color={dataColor}
  data-isactive={isActive}
  data-health={health}          // new: "connected" | "missing" | "disconnected"
  role="group"
  aria-label={`${tally.name}, ${stateLabel}, ${healthLabel}`}
  className="tally-card"
>
```

`data-health` is new and carries no spec obligation (nothing asserts transport health as an
attribute today). It exists so the health styling is attribute-driven like the rest, instead
of a fourth className branch. Adding attributes is safe; moving or removing them is not.

Base class string:

```
w-[250px] overflow-hidden rounded-md bg-surface-raised border border-border
transition-none
```

`transition-none` is not decorative. Per tokens principle 2, a tally must never animate into
a state — 200ms of cross-fade is 200ms of the screen lying during a live show. `--duration-0`
applies to everything bound to `data-color`.

### 1.2 State styling

Selectors key off the attribute, so the DOM stays identical across states and only the
painted result changes.

| State | Card fill | Border | Shape marker | Footer word | Name colour |
|---|---|---|---|---|---|
| `program` | `bg-live` (**solid — the only filled state**) | `border-live` 1px | ● filled circle, `text-on-fill` | `ON AIR` | `text-on-fill` |
| `preview` | `bg-surface-raised` | `border-preview` **3px** | ▲ hollow triangle, `text-preview` | `PREVIEW` | `text-text` |
| `idle` | `bg-surface-raised` | `border-idle` 1px | ▫ small hollow square, `text-n-500` | `IDLE` | `text-text` |
| `unpatched` | `bg-surface-raised` | `border-unpatched` **2px dashed** | ? in hollow circle, `text-unpatched` | `UNPATCHED` | `text-text` |

Fill-vs-outline is the primary CVD carrier (tokens §3.1 carrier 1): grayscale the grid and
the on-air card is still the only solid block. That is a lightness/area difference and it
survives deuteranopia, dimming, and peripheral vision.

```css
.tally-card[data-color="program"]  { background: var(--color-live); border-color: var(--color-live); color: var(--color-on-fill); }
.tally-card[data-color="preview"]  { border-color: var(--color-preview); border-width: 3px; }
.tally-card[data-color="idle"]     { border-color: var(--color-idle); }
.tally-card[data-color="unpatched"]{ border-color: var(--color-unpatched); border-width: 2px; border-style: dashed; }
```

Note the border-width change between states shifts inner geometry by 1–2px. Set
`box-sizing: border-box` and pad the header/body/footer from a fixed inner box so the tally
name does not jitter 2px sideways when a camera goes to preview. Jitter across a 12-card
grid on every state change is visually loud and reads as a glitch.

### 1.3 Transport health — the orthogonal layer

Health is drawn as an **outline outside the card** (via `outline`, which does not participate
in layout and so cannot fight the border-width above) plus a footer word. It never touches
the fill, so it cannot erase `program`.

| Health | Outline | Footer text | Footer bg |
|---|---|---|---|
| `connected` | none | `CONNECTED`, `text-text-muted` | none |
| `missing` | none | `NOT REPORTING`, `text-on-fill` | `bg-missing` (full-width footer strip) |
| `disconnected` | `outline: 2px dashed var(--color-disconnected); outline-offset: 2px` | `NO SIGNAL`, `text-disconnected`, `line-through` | none |

```css
.tally-card[data-health="disconnected"] { outline: 2px dashed var(--color-disconnected); outline-offset: 2px; }
.tally-card[data-health="missing"]   .tally-foot { background: var(--color-missing); color: var(--color-on-fill); }
```

`missing` keeps the existing behaviour from `Tally.tsx:126` (`tallyFootMissing` colours the
whole footer amber) — it was already the loudest thing on the card and tokens principle 7
says failure is louder than success. Keep it.

**Disconnected is deliberately not red.** `--color-disconnected` is `#8A98A8`, a neutral grey,
because a red "dead" indicator two feet from a red "on air" indicator is exactly the
confusion this whole design is built to prevent. The dashed outline and the strikethrough
carry it, not hue.

### 1.4 The combinations

The whole point of the two-axis split. Every cell is reachable in production.

| | `connected` | `missing` | `disconnected` |
|---|---|---|---|
| **`program`** | Red fill, `ON AIR` | Red fill + amber footer, `ON AIR` / `NOT REPORTING` | **Worst case.** Red fill + dashed grey outline + `ON AIR` struck through + `NO SIGNAL` |
| **`preview`** | Green 3px outline, `PREVIEW` | Green outline + amber footer | Green outline + dashed grey outline + `NO SIGNAL` |
| **`idle`** | Grey border, `IDLE` | Grey border + amber footer | Grey border + dashed outline, `NO SIGNAL` |
| **`unpatched`** | Blue dashed border, `UNPATCHED` | Blue dashed + amber footer | Blue dashed + grey dashed outline |

The program+disconnected cell shows **both words** in the footer, not one replacing the
other: `ON AIR` (struck through, `text-on-fill`) on the left, `NO SIGNAL` on the right. The
strikethrough is what says "this state is being asserted but not confirmed" — the mixer
thinks this camera is live, the lamp is not answering. An operator seeing a plain red card
would walk away believing the lamp is lit. Truncation is forbidden; if the card cannot fit
both words the card is too narrow.

`aria-live="assertive"` on the per-card status region for program transitions, `polite` for
everything else (tokens §3.3). Going on air is the one event worth interrupting a screen
reader for.

### 1.5 Highlight

`--color-highlight` is `#FFFFFF`, the only routine full-white fill in the product. Applied as
the card fill with `--color-on-fill` text, overriding whatever `data-color` says, for 10s.
The 1Hz pulse is the single permitted state animation (tokens §2.8) — the operator asked for
something eye-catching and is actively watching for it.

```css
.tally-card[data-highlight="true"] { background: var(--color-highlight); color: var(--color-on-fill); animation: locate-pulse 1s steps(2, jump-none) infinite; }
@media (prefers-reduced-motion: reduce) { .tally-card[data-highlight="true"] { animation: none; } }
```

Reduced motion gets a static white fill — the locate signal still works, it just stops
flashing. `steps(2)` not a sine ease: a hard on/off is more visible across a room than a
smooth fade, and it costs no dark adaptation between pulses that a fade wouldn't.

No new `data-testid` here. Highlight is currently exercised via `socket.emit`, not the DOM
(ui-contract §1.5).

### 1.6 Typography and layout

| Element | Token | Weight | Notes |
|---|---|---|---|
| Tally name | `--text-2xl` (28px) | 600 | `--tracking-tight`. The glance target. Truncate with ellipsis at one line; the name is capped at 26 chars upstream (`TallyCreate.tsx:45`). |
| Footer state word | `--text-xs` (12px) | 600 | uppercase, `--tracking-wide` |
| Footer address | `--text-xs` | 400 | `font-mono`, `tabular-nums` — it is an IP:port |
| Shape marker | 20×20px | — | header left, `--space-2` before the name |

Spacing: header `p-3 pl-4`, body `p-4`, footer `px-4 py-2`. Header and footer separated by
1px `--color-border` hairlines, as today. Card width stays `250px`; the grid gaps by
`--space-8`.

On-air tallies sort to the top of the grid and are separated from the rest by `--space-8`
(tokens §3.1 carrier 4). Spatial position survives colour blindness and peripheral vision in
a way that hue does not.

### 1.7 The per-tally menu

`TallyMenu.tsx`. Radix `DropdownMenu`. Trigger is a 44×44px icon button (tokens §2.5 minimum
hit target — this gets tapped on a phone mid-show).

**Attribute placement:** `data-testid="tally-${name}-menu"` goes on the **wrapper `<div>`**
around the trigger, not the trigger button. `TallyMenu.tsx:74` puts it there today and the
inner `IconButton` deliberately has none. A Radix `DropdownMenu.Trigger` renders the button
itself, so keep the wrapper div — do not collapse it away as "redundant markup". Two specs
depend on it.

| Item | testid | Enabled when | Icon | Notes |
|---|---|---|---|---|
| Connect | `tally-${name}-web` | `tally.isWebTally()` — item is **not rendered** otherwise | link | Router link. Renders `<a>`; testid on the anchor. |
| Settings | `tally-${name}-settings` | always | tune | Opens the per-tally settings dialog |
| Logs | `tally-${name}-logs` | always | subject | Router link, `<a>` |
| Highlight | `tally-${name}-highlight` | `tally.isActive()` | highlight | Disabled + tooltip "Tally is not connected" |
| Remove | `tally-${name}-remove` | `!tally.isConnected()` | delete | Disabled + tooltip "Connected Tallies can not be removed" |

Highlight and Remove are **mutually near-exclusive by design** — you can only locate a lamp
that is answering, and you can only remove one that is not. That is correct product logic
(`TallyMenu.tsx:47-48`), not an oversight; preserve both guards including the early-return in
the handlers, which is the real enforcement (`TallyMenu.tsx:56,64`) — a disabled attribute
alone is not a guard.

**Fix the Tooltip attachment while rebuilding.** `TallyMenu.tsx:100,106` put
`data-testid` on the MUI `<Tooltip>`, which clones its child rather than rendering a node —
so it is genuinely uncertain whether the attribute reaches the DOM at all (ui-contract §1.5,
H10). No spec asserts these, so there is no breakage risk either way. Put the testid on the
**menu item element itself** in the rebuild and let Radix `Tooltip` wrap it. That converts an
unverified attribute into a real one at zero cost.

Radix disables pointer events on `[data-disabled]` items, which kills the tooltip that is
supposed to explain *why* it is disabled. Wrap each disabled item in a `<span>` that owns the
tooltip trigger, the same shape as the existing `<Tooltip><div>` wrapper. Do not use
`aria-disabled` alone to keep events flowing — a screen reader would then announce an item
that does nothing.

Menu surface: `--elevation-2` (`bg-surface-raised`, `border-n-600`, `--shadow-overlay`),
`--radius-lg`. Items `--text-base`, 44px min height, hover `bg-surface-hover`. Disabled items
`text-text-disabled` with the icon at the same opacity — dimmed, still readable, per tokens
§3.2 (`--color-text-disabled` is 4.25:1, valid for large text and UI, and these are 16px
labels which is borderline; keep disabled labels at `--color-n-400` `#8A98A8` = 5.32:1 on the
raised surface instead, and let the tooltip carry the "why").

## 2. shadcn component specs

Only deviations from the shadcn default are listed. Anything not mentioned takes the stock
component unchanged.

### 2.0 Two rules that apply to every wrapper

**Rule A — `data-testid` goes wherever the existing specs already look for it; don't relocate
it to "clean up" the DOM.**

Correction: an earlier draft of this section claimed MUI's `TextField` forwards
`data-testid` straight onto the inner `<input>`, and used that as the reason the replacement
must too. That's backwards — MUI v4 spreads `...other` onto `TextField`'s **root** node (a
`FormControl` `<div>`), not the input; the input only receives it by being a descendant.
`ui-contract.md` §1.2 (Hazard H1) already has this right: `*[data-testid=x]` resolves to the
field's root `<div>`, and `*[data-testid=x] input` is a separate, deliberate descendant
selector some specs use to read the typed value after reload (`configAtem.spec.ts`, etc.).
Both selector shapes are load-bearing.

So the rule isn't "spread onto the interactive element" — it's **match whatever DOM shape the
specs already assert against**:

- If specs only ever touch `*[data-testid=x]` directly (click, existence, reading the value
  off the element itself) and never a descendant selector, `data-testid` can live on the
  interactive element itself — the simple case, e.g. a plain `<Input>` with no wrapper.
- If specs use *both* `*[data-testid=x]` (click/existence) *and* `*[data-testid=x]
  <descendant>` (value reads) — as with every `ValidatingInput` field and `NativeSelect` — put
  `data-testid` on the wrapper so the root selector still resolves, and let the interactive
  descendant resolve on its own tag (`input`, `select`). That's why `ValidatingInput.tsx` and
  `native-select.tsx` put `data-testid` on the wrapper rather than the inner control: it's the
  only placement that satisfies both selector shapes at once, not a shortcut. §2.6 (switch)
  documents the same wrapper-first placement, there because the wrapper is the click target
  rather than because of a descendant selector — same rule, different reason.

Example of the simple case (no descendant selector in play):

```tsx
// wrapper renders: <div data-field><Label/><input data-testid="atem-ip" .../><Help/></div>
function Field({ label, help, error, className, ...rest }: FieldProps) {
  return (
    <div className={cn("flex flex-col gap-1", className)}>
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} aria-describedby={help ? helpId : undefined} {...rest} />
      {help && <p id={helpId} data-testid={`${rest["data-testid"]}-help`}>{help}</p>}
    </div>
  )
}
```

`...rest` lands on `<Input>` → the native `<input>`. `*[data-testid=atem-ip]` resolves to the
input directly; `.type()` and `.should("have.value", ...)` both work without a descendant
selector. Before reusing this shape for a field that currently has a `*[data-testid=x]
<descendant>` spec assertion, check `ui-contract.md` first — moving `data-testid` onto the
descendant breaks the root selector, and moving it onto the wrapper (as `ValidatingInput`/
`NativeSelect` do) is very likely the correct call instead. State the chosen placement in
`data-contract.spec.ts`.

Corollary for Radix: `asChild`/`Slot` merges props onto the child. Verify per component that
your `data-*` survives the merge; `Slot` merges `className` and event handlers specially and
passes the rest through, so it normally does — but a component that destructures props before
spreading will drop them silently.

**Rule B — hue belongs to tally state.** No `variant="destructive"` red buttons, no green
success alerts, no coloured links. Interactive chrome is achromatic (tokens principle 1). The
old theme spent its accent on `#00bc8c`, one glance away from `--color-preview`. Alerts are
the one exception and they are scoped (§2.10).

### 2.1 button

- Drop `variant="destructive"`. Destructive intent is carried by an `AlertDialog` confirm
  step and the word "Remove", not by red. Red means on air.
- `default` variant: `bg-white text-n-950 hover:bg-n-100`. White is a permitted primary
  button fill (tokens §2.1).
- `outline`: `border-n-600 bg-transparent text-text hover:bg-surface-hover`.
- `ghost`: `hover:bg-surface-hover`.
- Min height 44px for every variant including `sm`. shadcn's `sm` is 32px; override it.
  Non-negotiable — a mis-tap on a phone cuts to the wrong camera.
- Focus: `--shadow-focus` (white ring with a 2px `--color-n-950` gap), not shadcn's
  `ring-ring`. Achromatic so it can never be mistaken for a state colour.
- `transition-colors duration-fast`.
- Disabled: `opacity-100` + `text-text-disabled bg-n-600`, not shadcn's `opacity-50` — an
  opacity-dimmed control on a near-black background falls below any usable contrast.

Submit buttons (`${testId}-submit`, ui-contract §1.2) carry `data-testid` on the `<button>`.
shadcn's `Button` spreads `...props` onto the `<button>` by default; keep that, and do not
wrap it in a `Tooltip` that consumes the props.

### 2.2 input

- `bg-n-900 border-n-600 text-text rounded-sm h-11` (44px), `px-3`.
- `placeholder:text-n-500`.
- Focus: `border-border-strong` + `--shadow-focus`. No accent colour.
- The old MUI `variant: "filled"` is preserved in spirit — filled darker than the surface,
  not an outline floating on it. This is why `bg-n-900` sits *below* the card's
  `bg-n-800`: a recessed field reads as an input without needing a border to say so.
- `aria-invalid="true"` → `border-missing` (`#FFB020` amber), never red. Plus an icon and
  text; colour is never the only carrier (tokens §3.3).
- `font-mono tabular-nums` for IP/port/interval fields.
- **Rule A applies.** `data-testid` on the `<input>`.

### 2.3 label

- `text-sm font-medium text-text-muted`, `mb-1`.
- Always a real `<label htmlFor>`. MUI's floating label is dropped — floating labels shrink
  to ~11px when filled, which fails the 2-metre legibility principle and is the first thing
  to disappear at a glance.

### 2.4 select — **native, deliberately**

`MyTheme.tsx` sets `MuiSelect: {native: true}` with the source comment that native components
have better mobile support, and `spec-changes.md` recommends preserving it. Two live specs
depend on the resulting DOM: `mixer-select` is a native `<select>` (ui-contract §1.1),
`channel-selector` is a native `<select>` whose `<option>` list includes a literal
`(unpatched)` entry plus a synthetic fallback option for a stale channel id
(`ChannelSelector.tsx:38-45`), and `obs-liveMode` is read via
`*[data-testid=obs-liveMode] select :selected`.

**Do not install shadcn `select`.** Radix `Select` renders a listbox of `<div role="option">`
— there is no `<select>` and no `<option>` in the DOM, `:selected` matches nothing, and
`cy.select()` does not work. Replacing it would break three specs to gain a styled dropdown.

Style the native element instead. A native `<select>` accepts every box property; only the
popup list is OS-rendered, and on mobile that OS popup is the feature.

```tsx
// components/ui/native-select.tsx
const NativeSelect = React.forwardRef<HTMLSelectElement, React.ComponentProps<"select">>(
  ({ className, ...rest }, ref) => (
    <div className="relative">
      <select
        ref={ref}
        className={cn(
          "h-11 w-full appearance-none rounded-sm bg-n-900 border border-n-600",
          "pl-3 pr-9 text-base text-text",
          "focus-visible:border-border-strong focus-visible:shadow-focus focus-visible:outline-none",
          "disabled:text-text-disabled",
          className
        )}
        {...rest}                    {/* data-testid is destructured out above and lands on
                                          the wrapper <div> instead — see Rule A (§2.0):
                                          mixer-select/channel-selector/obs-liveMode specs need
                                          both the root selector and the native <select> DOM */}
      />
      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 size-4 text-n-400" aria-hidden />
    </div>
  )
)
```

`appearance-none` removes the OS chevron; the absolutely-positioned icon replaces it and is
`pointer-events-none` so clicks fall through to the select. The `<option>` elements themselves
are OS-drawn and mostly unstyleable — on the dark UI, set `color-scheme: dark` on `:root` so
the native popup renders dark rather than a white flash in a dark room. That one CSS
declaration is the whole fix and is why native is affordable here.

Where a rich dropdown is genuinely wanted later (icons, grouping, async), that is a *new*
component with a new testid, not a replacement for these three.

### 2.5 checkbox

Radix `Checkbox`. `tally-defaults-oi` / `-sp` and `tally-settings-oi` / `-sp` carry both
`data-testid` and `data-value` (a boolean string) — ui-contract §2.3.

- Both attributes go on the **Radix `Checkbox.Root` `<button>`**, which is what
  `configTally.spec.ts` clicks and reads `data-value` from. Radix already emits its own
  `data-state="checked|unchecked"`; `data-value` is the app's separate contract and both must
  be present. Do not "consolidate" them.
- Radix renders `<button role="checkbox">` plus a visually-hidden `<input type="checkbox">`
  for form submission. MUI rendered a `<span>` wrapping a real input. Both satisfy an
  attribute selector, so this is fine — but `.check()`/`.uncheck()` Cypress commands only
  work on a real input. The specs use `.click()`, so this is safe. Verify before changing.
- 20×20px box, 44×44px hit area via padding.
- `border-n-500 rounded-xs`; checked → `bg-white text-n-950`, achromatic per Rule B.

### 2.6 switch

`tally-settings-expert` (`EditSettingsIni.tsx:47`) carries `data-testid` **and**
`data-expertmode` on the outer `FormControlLabel`, not the inner switch — and
`manual_flasher.spec.ts` clicks that outer labeled node directly (ui-contract §2.6).

- Keep a labeled wrapper element that owns both attributes and is itself clickable. This is
  the one place where Rule A points at the *wrapper*, because the wrapper is what the spec
  clicks. Implement as `<label data-testid data-expertmode onClick>` containing the Radix
  `Switch` — a `<label>` forwards clicks to its control natively, so no synthetic handler.
- Track `bg-n-600`, thumb `bg-n-100`; checked track `bg-white`, thumb `bg-n-950`.

### 2.7 slider

See §3.2 — the brightness slider is a composed component, not raw shadcn. The base Radix
`Slider` styling lives here:

- Track 4px `bg-n-700`, range `bg-n-100`, thumb 20px `bg-white` with a 44px hit area via a
  transparent `::before`.
- **Hazard H2 — retracted.** This section previously claimed
  `cypress/browserlib/sliderTestTool` drives the slider with synthetic mouse events against
  MUI's internal DOM and would need a rewrite for Radix. Checked the actual helper: it never
  touches mouse events. `setSliderValue` dispatches `keydown` (End/PageDown/ArrowLeft) at
  `*[role=slider]`, and `validateSliderValue` reads the `aria-valuenow` attribute off the same
  element. Radix `Slider` exposes `role="slider"`, responds to the identical key set on its
  thumb, and updates `aria-valuenow` the same way — this helper needs no changes at all.
- `data-testid` goes on `Slider.Root`, matching where MUI put it (`BrightnessSlider.tsx:47`).

### 2.8 dialog

Radix `Dialog`. `FormDialog` (`components/layout/FormDialog.tsx`) takes one `data-testid` and
produces **three** DOM nodes from it: the dialog root, `${testId}-close`, and
`${testId}-submit` (ui-contract H11). That is intended, and `TallySettings.tsx:103` is a live
caller. Preserve all three.

- `data-testid` on `Dialog.Content` (the panel), matching MUI's Dialog-paper placement.
  Not on the overlay, not on the portal root.
- `bg-surface-raised border-n-600 rounded-lg shadow-overlay`, `max-w-md`.
- Overlay `bg-n-950/80` — near-black at 80%, not the pure-black scrim shadcn ships.
- Enter `duration-slow ease-out`; exit `duration-fast`. Dialogs are chrome, so they may
  animate. Nothing inside a dialog that reflects tally state may.
- Radix traps focus and restores it on close — keep both. `tally-create-popup` and
  `tally-settings` are both real modals.
- shadcn's `DialogContent` renders its own close button; `FormDialog` needs that button to
  carry `${testId}-close`. Pass it through rather than adding a second close.

### 2.9 dropdown-menu

Covered by §1.7. The only spec-relevant deviation: `data-testid` on menu **items**, and a
tooltip-bearing `<span>` wrapper for disabled items so the explanation is still reachable.

### 2.10 tooltip

- Radix `Tooltip`. Delay 300ms open, 0ms close.
- `bg-n-800 border-n-600 text-text text-sm rounded-sm px-2 py-1 shadow-overlay`.
- **Nothing load-bearing lives only in a tooltip** (tokens §3.3). Tooltips explain *why* a
  disabled control is disabled; they never carry state, values, or the only copy of a label.
- Do not put `data-testid` on a `Tooltip` root — it wraps and clones rather than rendering a
  node of its own. This is the existing H10 uncertainty in `TallyMenu`; §1.7 resolves it by
  moving the attribute to the item.

### 2.11 alert

`tally-create-warning` (`TallyCreate.tsx:74`) is an MUI `<Alert severity="warning" variant="outlined">`.

- **Hazard H8:** MUI's `severity` prop is unrelated to the app's `data-severity` attribute on
  log lines (§2.4 of the contract). Same word, different concepts. When rebuilding, do not
  emit a `data-severity` attribute on alerts — the log page's `cy.contains('*[data-severity=info]', ...)`
  selector would then match alert nodes and the assertion becomes ambiguous.
- `warning` variant: `border-missing text-missing bg-transparent`, with a triangle-exclamation
  icon. Outlined, not filled — an amber-filled block in a dark room is a bright rectangle
  competing with the tally grid.
- `role="status"` for warning/info; `role="alert"` only for errors that need interruption.
- This is the one place a non-tally hue is permitted, and only amber (`--color-missing`),
  never red or green.

### 2.12 badge

Used for state pills and channel labels.

- `text-2xs font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full`.
- Achromatic by default: `bg-n-700 text-n-300`.
- A badge may take a tally-state colour **only** when it is displaying tally state (e.g. a
  compact list view). Never for counts, versions, or "new".

### 2.13 separator

- `bg-border` (`--color-n-700`), 1px. Decorative only — its 1.49:1 contrast means it can
  never be the sole indicator of a boundary (tokens §3.2). Where a boundary is meaningful,
  use `--color-border-strong`.
- `role="none"` unless it is semantically separating list groups.

### 2.14 progress

The flasher upload progress (`step.current`/`step.max`, `StepDisplay.tsx:84`).

- Track `bg-n-700`, indicator `bg-n-100`. Achromatic (Rule B).
- Height 6px, `rounded-full`.
- `role="progressbar"` with `aria-valuenow/min/max` — Radix gives this, keep it.
- Indeterminate state uses the same bar with a sweeping highlight, not a spinner swap, so the
  layout does not jump when a byte count arrives.
- `tabular-nums` on the `(current/max)` text so the digits stop dancing during an upload.

## 3. Hand-built components

Two components have no shadcn or Radix equivalent. Both are small; neither justifies a
dependency.

### 3.1 Vertical Stepper — `flasher/StepDisplay.tsx`

Replaces MUI `Stepper`/`Step`/`StepLabel`. shadcn has no stepper primitive and Radix has no
stepper at all.

**Contract:** `data-testid="progress-step-${step.id}"` and `data-done="true|false"` both on
the **step root element**, one node each, exactly as `StepDisplay.tsx:75-76` has them.
`manual_flasher.spec.ts` asserts `data-done` per step with timeouts up to 60s for the upload
step. Five ids: `initialize`, `connection`, `upload`, `reboot`, `done`.

**Free rein on styling.** `StepDisplay.tsx:18-28` reaches into `.MuiStepConnector-root` /
`.MuiStepConnector-line` — but ui-contract H3b confirms no spec anywhere queries those class
names. It is a styling dependency only. Re-derive the connector from scratch.

**Structure** — an `<ol>`, because it is an ordered list of steps and that is what a screen
reader should hear:

```tsx
type StepType = {
  id: string; label: string
  done: boolean; active: boolean; error: boolean; skipped: boolean
  current?: number; max?: number
}

function StepDisplay({ steps }: { steps: StepType[] }) {
  return (
    <ol className="relative flex flex-col" aria-label="Flash progress">
      {steps.map((step, i) => (
        <li
          key={step.id}
          data-testid={`progress-step-${step.id}`}
          data-done={step.done ? "true" : "false"}
          data-state={stateOf(step)}          // "error" | "complete" | "active" | "skipped" | "pending"
          aria-current={step.active ? "step" : undefined}
          className="group relative flex gap-3 pb-4 last:pb-0"
        >
          {/* connector: a pseudo-element on the icon column, not a separate node */}
          <span className="relative flex w-6 shrink-0 justify-center
                           before:absolute before:top-7 before:bottom-[-1rem] before:w-1
                           before:bg-n-600 group-last:before:hidden
                           group-data-[state=complete]:before:bg-n-300">
            <StepIcon step={step} />
          </span>
          <span className="min-w-0 flex-1 pt-0.5">
            <span className="text-base text-text group-data-[state=pending]:text-text-muted">{step.label}</span>
            {step.max != null && (step.active || step.done) && (
              <span className="ml-2 text-sm text-text-muted tabular-nums">({step.current}/{step.max})</span>
            )}
          </span>
        </li>
      ))}
    </ol>
  )
}
```

`stateOf(step)` mirrors the existing icon precedence in `TheStepIcon`
(`StepDisplay.tsx:51-59`), extended with `skipped`, which the current icon function does not
handle at all despite `StepType` declaring it:

```ts
const stateOf = (s: StepType) =>
  s.error ? "error" : s.done ? "complete" : s.skipped ? "skipped" : s.active ? "active" : "pending"
```

Note the ordering difference: `error` before `done` (as today), but `skipped` is checked
before `active` because a skipped step is never active. `data-done` stays a straight
`step.done` boolean and is **not** derived from `data-state` — `done` and `complete` must not
drift apart, and the spec reads `data-done`.

**States:**

| `data-state` | Icon | Icon colour | Label | Connector below |
|---|---|---|---|---|
| `complete` | filled check circle | `text-n-100` | `text-text` | `bg-n-300` (solid, walked) |
| `active` | 20px spinner ring | `text-n-100` | `text-text` `font-medium` | `bg-n-600` |
| `error` | filled X circle | `text-live-text` | `text-live-text` | `bg-n-600` |
| `skipped` | hollow dash circle | `text-n-500` | `text-text-muted line-through` | `bg-n-600` dashed |
| `pending` | hollow circle | `text-n-600` | `text-text-muted` | `bg-n-600` |

**Correction (routes 3/4 sign-off):** `complete` originally spec'd `text-preview` for the check icon.
`--color-preview` is a tally semantic (see `design-tokens.md` §1 principle 1) and must not be spent on
"this step finished" — that teaches the eye green sometimes means *preview*, sometimes means *done*,
which is exactly the ambiguity the palette exists to prevent. Use `text-n-100` instead: it's already the
brightest neutral in this same table (`active`'s spinner), so a walked step reads as "arrived at full
neutral prominence" without borrowing tally hue. `bg-n-300` for the connector below stays — it's a
neutral-ramp token already, no borrow.

`--color-live-text` (`#FF6257`) for the error, not `--color-live` — on `--color-n-800` the
plain live red is 4.41:1 and fails AA body (tokens §3.2). This is the one place a red is
allowed off the tally card, because a failed flash is a genuine error and the flasher page
shows no tally states.

The spinner is the single exception to the no-animation rule outside highlight: it is
progress feedback, not state, and it lives on a page with no live tallies on it. Under
`prefers-reduced-motion`, swap it for a static filled dot — the `data-state="active"` and
`aria-current="step"` still carry the meaning.

**Connector as a pseudo-element**, not a `<div>`: it cannot be focused, cannot be read by a
screen reader, and cannot shift layout. `group-last:before:hidden` removes the dangling tail
after the final step. `before:bottom-[-1rem]` reaches into the `pb-4` gap so the line is
continuous between icons.

The old implementation drove `activeStep` from
`Math.max(steps.findIndex(s => !s.done), 0)` (`StepDisplay.tsx:69`) and let MUI decide each
step's appearance. Here each step carries its own `data-state`, so the `findIndex` disappears
— one less derived value to go stale. `step.active` already comes in on the step object.

### 3.2 Brightness slider with value bubble — `config/BrightnessSlider.tsx`

Radix `Slider` has no value label. MUI's `valueLabelDisplay="auto"` + `valueLabelFormat`
(`BrightnessSlider.tsx:53-54`) is what renders "off" at 0 and `${val}%` elsewhere.

**Contract:** `data-testid={testId}` on `Slider.Root`, matching MUI's placement
(`BrightnessSlider.tsx:47`). Used by `tally-defaults-ob`, `tally-defaults-sb`,
`tally-settings-ob`, `tally-settings-sb`.

**`data-brightness` is not on this component.** It lives on `page-tally-web`
(`WebTallyPage.tsx:198`) as the raw 0–1 fraction, computed by the precedence chain in
ui-contract §2.8 — per-tally override, then operator default, then 100, all ÷100. Do not move
it here; three separate `webtally.spec.ts` assertions read it off the page root. Mentioned
because both attributes concern brightness and it is an easy mistake.

**`data-value`** is a separate contract on the *checkbox and colour-scheme* components
(ui-contract §2.3), not on this slider. Do not add it here.

```tsx
type BrightnessSliderProps = {
  value: number | null
  testId: string
  onChange: (value: number) => void
  minValue?: number
  minMessage?: string
  disabled?: boolean
}

function BrightnessSlider({ value, testId, onChange, minValue = 0, minMessage, disabled = false }: BrightnessSliderProps) {
  const [dragging, setDragging] = useState(false)
  const [focused, setFocused] = useState(false)
  const v = value ?? 0
  const showBubble = dragging || focused

  return (
    <div className="pt-6">                       {/* headroom for the bubble */}
      <SliderPrimitive.Root
        data-testid={testId}
        value={[v]}
        min={0} max={100} step={1}
        disabled={disabled}
        onValueChange={([next]) => onChange(Math.max(next, minValue))}
        onPointerDown={() => setDragging(true)}
        onPointerUp={() => setDragging(false)}
        className="relative flex h-5 w-full touch-none select-none items-center data-[disabled]:opacity-100"
      >
        <SliderPrimitive.Track className="relative h-1 w-full rounded-full bg-n-700 data-[disabled]:bg-n-800">
          <SliderPrimitive.Range className="absolute h-full rounded-full bg-n-100 data-[disabled]:bg-n-600" />
        </SliderPrimitive.Track>

        {/* tick marks at 0/20/40/60/80/100, purely decorative */}
        {[0, 20, 40, 60, 80, 100].map(m => (
          <span key={m} aria-hidden
                style={{ left: `${m}%` }}
                className="pointer-events-none absolute size-1 -translate-x-1/2 rounded-full bg-n-600" />
        ))}

        <SliderPrimitive.Thumb
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          aria-label="Brightness"
          aria-valuetext={v === 0 ? "off" : `${v} percent`}
          className="relative block size-5 rounded-full bg-white
                     focus-visible:shadow-focus focus-visible:outline-none
                     data-[disabled]:bg-n-500
                     after:absolute after:-inset-3 after:content-['']"   /* 44px hit area */
        >
          <span
            data-brightness-bubble
            aria-hidden
            className={cn(
              "pointer-events-none absolute bottom-7 left-1/2 -translate-x-1/2 whitespace-nowrap",
              "rounded-sm bg-n-700 px-2 py-0.5 text-xs font-semibold tabular-nums text-text",
              "transition-opacity duration-fast",
              showBubble ? "opacity-100" : "opacity-0"
            )}
          >
            {v === 0 ? "off" : `${v}%`}
          </span>
        </SliderPrimitive.Thumb>
      </SliderPrimitive.Root>

      {minMessage && focused && v === minValue && (
        <p className="mt-1 text-sm text-text-muted">{minMessage}</p>
      )}
    </div>
  )
}
```

**Follow behaviour.** The bubble is a child of `Slider.Thumb`, so Radix's own transform
positions it — no `getBoundingClientRect`, no resize listener, no rAF. It tracks the thumb
exactly, including during keyboard changes and window resize, because it *is* the thumb.
`left-1/2 -translate-x-1/2` centres it; at 0% and 100% it overhangs the track slightly, which
is correct — clamping it would decouple it from the thumb and reintroduce the maths.

**Visibility.** Shown on drag or keyboard focus, matching MUI's `"auto"`. Opacity only, never
`display` — a mounted-then-hidden bubble has stable geometry, so it does not pop in at the
wrong place on the first frame of a drag. This is chrome, so `--duration-fast` is permitted;
the *value* itself updates instantly.

**The "off" state.** At `v === 0` the bubble reads `off`, not `0%`, per
`valueLabelFormat` (`BrightnessSlider.tsx:54`). This is real: 0 means the lamp is dark, and
`0%` invites the reading "0% of the way through some scale". `aria-valuetext` carries the same
word so a screen reader hears "off" too — `aria-valuenow="0"` alone would announce "0".

`minValue` clamps in `onValueChange` (as `BrightnessSlider.tsx:40` does) rather than via the
`min` prop, so the track still spans 0–100 and the operator can see that there is a floor
they are being held above. `minMessage` explains it on focus at the floor.

**Disabled** uses colour, not opacity: `opacity-100` with `bg-n-600` track and `bg-n-500`
thumb. The old code did `darken(white, 0.6)` for the same reason — a 50%-opacity control on a
near-black background disappears.

**H2, retracted (see §2.7):** `cypress/browserlib/sliderTestTool` does not drive this with
mouse/pointer events at all — it dispatches `keydown` at `*[role=slider]` and reads
`aria-valuenow`. Radix `Slider` supports the same keys and the same attribute on its thumb, so
no rewrite is needed here either.

## 4. The colour utility

`WebTallyPage.tsx` uses MUI's `darken()`, `fade()` and `getContrastText()` as **logic, not
styling**. The background colour is an arbitrary `rgb()` string coming out of
`ColorScheme.ts` at runtime (`bgColor = colorScheme.program.toCss()`, line 164), dimmed by a
user-set brightness (`darken(bgColor, 1 - brightness)`, line 185), and the text colour is
then derived from whatever that produced (`getContrastText(bgColor)`, line 186).

Tailwind cannot do this. There is no class for "40% of an unknown colour computed at
runtime". Dropping `@material-ui/core` requires reimplementing these three functions.

Roughly 30 lines, no dependency. `hub/src/lib/color.ts`:

```ts
type Rgb = { r: number; g: number; b: number }

/** Parse "#rgb" | "#rrggbb" | "rgb(r, g, b)" | "rgba(r, g, b, a)". Throws on anything else. */
export function parseColor(input: string): Rgb {
  const s = input.trim()
  if (s[0] === "#") {
    const h = s.length === 4
      ? s[1] + s[1] + s[2] + s[2] + s[3] + s[3]
      : s.slice(1, 7)
    const n = parseInt(h, 16)
    if (h.length !== 6 || Number.isNaN(n)) throw new Error(`bad color: ${input}`)
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 }
  }
  const m = s.match(/^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/i)
  if (!m) throw new Error(`bad color: ${input}`)
  return { r: +m[1], g: +m[2], b: +m[3] }
}

const clamp255 = (n: number) => Math.min(255, Math.max(0, Math.round(n)))

/** Multiply each sRGB channel by `factor` (0 = black, 1 = unchanged). */
export function dim(color: string, factor: number): string {
  const { r, g, b } = parseColor(color)
  const f = Math.min(1, Math.max(0, factor))
  return `rgb(${clamp255(r * f)}, ${clamp255(g * f)}, ${clamp255(b * f)})`
}

/** Same colour at a given alpha. */
export function fade(color: string, alpha: number): string {
  const { r, g, b } = parseColor(color)
  return `rgba(${r}, ${g}, ${b}, ${Math.min(1, Math.max(0, alpha))})`
}

/** WCAG 2.1 relative luminance, 0 (black) – 1 (white). */
export function luminance(color: string): number {
  const { r, g, b } = parseColor(color)
  const ch = (v: number) => {
    const c = v / 255
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
  }
  return 0.2126 * ch(r) + 0.7152 * ch(g) + 0.0722 * ch(b)
}

/** WCAG contrast ratio between two colours, 1:1 – 21:1. */
export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

/** Black or white — whichever has more contrast against `background`. */
export function contrastText(background: string): "#0B0E11" | "#FFFFFF" {
  return luminance(background) > 0.1791 ? "#0B0E11" : "#FFFFFF"
}
```

### Notes on each

**`dim(color, factor)` replaces `darken(color, 1 - brightness)`.** The signature is
inverted on purpose: every call site passes `1 - brightness` today
(`WebTallyPage.tsx:185`), which is a double negative around a value that is already a
0–1 brightness fraction. `dim(bgColor, brightness)` says the same thing once.

The multiply happens in **sRGB space, not linear light** — this deliberately matches MUI v4's
`darken`, which multiplies the raw channel values. It is not photometrically "correct"
dimming, but it is what the current UI does, and more importantly it matches what the
firmware does to the LED: scaling the PWM duty cycle per channel. The screen preview and the
lamp should agree. Converting to linear here would make the preview diverge from the hardware
in the name of colour-science purity. Do not.

`rgb(0, 1, 0)` (the idle LED, `ColorScheme.ts`) dims to `rgb(0, 0, 0)` at any factor below
0.5 because of the rounding — correct, the lamp is off, and tokens §2.3 says render that
honestly.

**`fade(color, alpha)`** is a direct replacement for MUI's `fade` — same name, same
behaviour, used at `WebTallyPage.tsx:30,35,39,43,52` for 70%-opacity chrome text over an
arbitrary background. No maths, just format conversion.

**`contrastText` uses WCAG relative luminance**, not a naive `(r+g+b)/3` or the
`(299r+587g+114b)/1000` YIQ brightness. Those weight green far too little for this palette:
naive brightness on `rgb(0,255,0)` (the preview LED) gives 85/255, reading it as "dark" and
picking white text at a real contrast of **1.37:1** — invisible. WCAG luminance gives 0.715,
picks black, and gets **15.30:1**.

The `0.1791` threshold is the exact crossover where white and black give equal contrast:
solve `(L+0.05)/0.05 = 1.05/(L+0.05)` → `L = √(1.05 × 0.05) − 0.05 = 0.1791`. Above it black
wins, below it white wins. Hardcoding the constant avoids computing two ratios per render.

**This changes behaviour versus MUI, deliberately.** MUI's `getContrastText` does not pick
maximum contrast — it returns white unless white falls below a `contrastThreshold` of 3, which
puts its crossover at `L = 0.3`. In the band `0.1791 < L < 0.3` MUI picks white where black is
measurably better. That band contains the product's most important colour:

| Background | White | Black | MUI picks | `contrastText` picks |
|---|---|---|---|---|
| `rgb(255,0,0)` program LED | 4.00:1 | **5.25:1** | white | **black** |
| `rgb(255,0,255)` yellow-pink preview | 3.14:1 | **6.70:1** | white | **black** |
| `rgb(0,255,0)` preview LED | 1.37:1 | **15.30:1** | black | black |
| `rgb(255,255,0)` yellow-pink program | 1.07:1 | **19.56:1** | black | black |
| `rgb(0,0,255)` unknown LED | **8.59:1** | 2.44:1 | white | white |

So the full-brightness on-air web tally goes from white-on-red (4.00:1) to black-on-red
(5.25:1). That is a visible change and it is the right one — it is also what
`design-tokens.md` §2.2 already mandates ("text on a coloured fill is always
`--color-n-950`, never white; white-on-red would be 3.55:1 and fails"). The utility and the
token spec now agree instead of contradicting each other.

`contrastText` returns `#0B0E11` (`--color-n-950`) rather than literal `#000`, per the same
token rule. Pure black next to a bright fill blooms in a dark room. Against every background
in the table the difference is under 0.1 of a ratio point.

No spec asserts text colour on `page-tally-web`, so this change is free of contract risk.
`data-brightness` itself is untouched — it is the raw fraction, computed by the precedence
chain in ui-contract §2.8, and is *not* the value passed to `dim()` after any transformation.

### The check

```ts
// hub/src/lib/color.test.ts — one runnable check, no fixtures
import { dim, fade, luminance, contrastRatio, contrastText } from "./color"

test("color utils", () => {
  expect(dim("rgb(255, 0, 0)", 0.5)).toBe("rgb(128, 0, 0)")
  expect(dim("#ff0000", 1)).toBe("rgb(255, 0, 0)")
  expect(dim("rgb(0, 1, 0)", 0.25)).toBe("rgb(0, 0, 0)")      // idle LED stays off
  expect(fade("#fff", 0.7)).toBe("rgba(255, 255, 255, 0.7)")
  expect(luminance("#000")).toBeCloseTo(0, 5)
  expect(luminance("#fff")).toBeCloseTo(1, 5)
  expect(contrastRatio("#fff", "#000")).toBeCloseTo(21, 2)

  // the naive-brightness trap: green must get black text
  expect(contrastText("rgb(0, 255, 0)")).toBe("#0B0E11")
  // the MUI-divergence case
  expect(contrastText("rgb(255, 0, 0)")).toBe("#0B0E11")
  expect(contrastText("rgb(0, 0, 255)")).toBe("#FFFFFF")
})
```

Five lines of the utility are pure formatting; the two that need a check are `luminance`
(the transfer-function branch at 0.03928 is easy to get wrong) and the `contrastText`
threshold. Both are covered above.

## 5. Migration table

Every component in `hub/src/components/` and the MUI primitives they lean on.

| Existing | Verdict | Reasoning |
|---|---|---|
| `Tally.tsx` (MUI `Paper` + `makeStyles`) | **Hand-build** (§1) | `Paper` is a `<div>` with a border; the work is the two-axis state matrix, not the container. |
| `TallyMenu.tsx` (`Menu`/`MenuItem`/`IconButton`) | **shadcn `dropdown-menu`** | Direct Radix equivalent. Keep the testid-bearing wrapper `<div>` and fix the Tooltip attachment (§1.7). |
| `TallyCreate.tsx` (`Dialog` + `TextField` + `Alert`) | **shadcn `dialog` + `input` + `alert`** | All three have equivalents. Name validation logic is unchanged app code. |
| `TallySettings.tsx` (per-tally, `FormDialog`) | **shadcn `dialog`** | H11: one testid must still produce root + `-close` + `-submit`. |
| `TallySettingsField.tsx` | **Keep as-is, restyle** | Pure composition (label + default/custom toggle + control). Renders no `data-testid` of its own — only `${testId}-toggle`. H6 retracted; do not "clean up". |
| `ChipLikeButton.tsx` | **Merge into shadcn `button`** | It is a `Button` with `data-selected` and a selected style. Becomes `<Button variant="outline" data-selected={...}>` + a `data-[selected=true]` class. One less component. |
| `ChannelSelector.tsx` (`Select native`) | **Hand-build native (§2.4)** | Radix `Select` renders no `<select>`/`<option>`; `tally.spec.ts` drives it as a native select. Styling a native element is ~15 lines. |
| `MixerSelection.tsx` (`NativeSelect`) | **Same native select** | Same reasoning; `mixer-select` is asserted as `<select>` in 7 specs. |
| `ObsLiveModeSelect.tsx` (`TextField select`) | **Same native select** | `configObs.spec.ts` reads `*[data-testid=obs-liveMode] select :selected`. Radix has no `:selected`. |
| `ValidatingInput.tsx` (`TextField`) | **shadcn `input` + Rule A wrapper (§2.0)** | H1 is the highest-risk item in the whole migration: 8 mixer panels, both selector shapes. |
| `config/TallySettings.tsx` (defaults panel) | **Keep, restyle** | Layout + state container. Its children migrate; it does not. |
| `config/ColorSchemeSelector.tsx` | **Keep, restyle** | Carries `data-value` on the root div and on each option button. Bespoke swatch UI with no primitive equivalent; the buttons become shadcn `button`s. |
| `config/BrightnessSlider.tsx` | **Hand-build on Radix `slider` (§3.2)** | Radix has no value bubble. ~40 lines, no dependency. |
| `config/MixerSettingsWrapper.tsx` | **Keep, restyle** | Emits `${testId}` + `${testId}-submit`; pure structure. |
| `flasher/StepDisplay.tsx` (`Stepper`) | **Hand-build (§3.1)** | No shadcn or Radix stepper exists. `<ol>` + pseudo-element connector. |
| `EditSettingsIni.tsx` (`Switch` + `FormControlLabel` + `TextField`) | **shadcn `switch` + `input`** | H9 cross-mode sync is app logic and survives untouched. `data-expertmode` stays on the clickable label wrapper (§2.6). |
| `layout/FormDialog.tsx` | **Keep, rebuild on shadcn `dialog`** | The 1-testid→3-nodes behaviour is intended and has a live caller. |
| `layout/Layout.tsx` | **Keep, restyle** | Emits `page-${cypressId}`. Structural. |
| `layout/MiniPage.tsx` | **Keep, restyle** | Panel container; `tally-defaults` lands on it. |
| `layout/MyTheme.tsx` (MUI theme) | **Drop** | Replaced by the `@theme` block in `design-tokens.md` §2.9. Its `MuiSelect: {native: true}` decision survives as §2.4; its `variant: "filled"` survives as the `bg-n-900` recessed input; its `color: "secondary"` accent is deliberately not carried over (tokens principle 1). |
| `pages/TallyLogPage.tsx` log lines | **Keep, restyle** | `data-severity` is a priority-ordered ternary (warning → error → status → info) — app logic. Do not emit `data-severity` anywhere else (H8). |
| `pages/WebTallyPage.tsx` | **Keep, restyle + §4** | The `darken`/`fade`/`getContrastText` calls become `dim`/`fade`/`contrastText`. Keep the `((a: never) => {})(command)` exhaustiveness guard at line 181 so a new `StateCommand` fails the build. |
| MUI `Typography` | **Drop** | Replaced by the type scale in tokens §2.4 as plain elements + classes. |
| MUI `Tooltip` | **shadcn `tooltip`** | Direct equivalent. Never the sole carrier of information. |
| MUI `Checkbox` | **shadcn `checkbox`** | Keep `data-value` alongside Radix's `data-state` (§2.5). |
| MUI `CircularProgress` | **Hand-build, ~10 lines** | An SVG circle with `stroke-dasharray` animation. Not worth a primitive. Used in two places (`StepDisplay`, `WebTallyPage` loading). |
| MUI `Alert` (`@material-ui/lab`) | **shadcn `alert`** | Drops the `@material-ui/lab` dependency entirely — it is the only thing imported from it. |
| MUI icons (`@material-ui/icons`) | **`lucide-react`** | shadcn's default icon set. Map: `MoreVert`→`MoreVertical`, `Subject`→`FileText`, `Delete`→`Trash2`, `Highlight`→`Lightbulb`, `Link`→`Link`, `Tune`→`SlidersHorizontal`, `Cancel`→`XCircle`, `CheckCircle`→`CheckCircle2`, `PauseCircleFilledRounded`→`Circle`. |
| `makeStyles` / JSS | **Drop** | Tailwind utilities + attribute selectors. Removes the runtime style engine entirely. |

**Net:** 3 hand-built components (tally card, stepper, brightness slider), 1 hand-built
primitive (native select), 1 utility module (`lib/color.ts`), ~10 shadcn installs, and 4
dependencies removed (`@material-ui/core`, `@material-ui/icons`, `@material-ui/lab`, JSS).

**Highest-risk items, in order:** H1 (`ValidatingInput`, 8 panels × 2 selector shapes), H2
(`sliderTestTool` needs rewriting for Radix before `configTally` and `tally-settings` pass
again), the native-select decision (3 specs break if Radix `Select` is used), and H4
(`smoke.spec.ts` breaks on any nav copy change — the one spec that is not testid-driven).
