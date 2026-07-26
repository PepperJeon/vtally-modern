# vTally Design Foundation

Foundation layer for the vTally hub UI. Two follow-on specs (components, screens) build on the token
names defined here — the names are the contract, treat them as stable.

Source of the decisions below: `hub/src/components/layout/MyTheme.tsx` (old MUI/Bootswatch-Darkly
theme), `hub/src/tally/ColorScheme.ts` (physical LED colour schemes), `hub/src/components/Tally.tsx`
(the states that actually exist today).

**States that exist in the product** — the whole design hangs off these, so they are listed once, here:

| State | Source | Meaning |
| --- | --- | --- |
| `program` | `Tally.tsx` — tally is in `programs` | On air. Being broadcast right now. |
| `preview` | `Tally.tsx` — tally is in `previews` | Next up / cued. |
| `idle` | default branch | Patched, connected, not selected. |
| `unpatched` | `!tally.isPatched()` | Device exists but no channel assigned. Operator error state. |
| `highlight` | `ColorScheme.highlight` | "Identify this light" — operator-triggered locate. |
| `connected` / `missing` / `disconnected` | tally footer | Transport health. **Orthogonal to the above.** A tally can be `program` *and* `disconnected` — that is the worst case in the product and the UI must be able to show both at once. |

---

## 1. Design principles

**1. Hue is reserved for tally state. Nothing else gets to be colourful.**
If a button, a link, a chart, or a brand flourish is red or green, it competes with the one signal
that matters. Interactive chrome is achromatic (white / neutral). The old theme spent its accent
colour (`#00bc8c`) on text fields and links — that green is one glance away from *preview*.
This isn't limited to interactive chrome: tally state colours (`--color-live`, `--color-preview`,
`--color-idle`) are reserved exclusively for tally state, full stop. A stepper's "done" step, a form's
"saved" toast, a chart's positive series — none of them get to reach for `--color-preview` just because
green reads as "good." Everything that isn't tally state picks from the neutral ramp (`--color-n-*`)
instead. (Caught in the routes 3/4 sign-off: `design-components.md` §3.1's stepper had borrowed
`text-preview` for a completed step — fixed there, generalised here so the next component doesn't
re-derive the same borrow.)

**2. State changes are instant. Never animate a tally into a state.**
A 200ms cross-fade means that for 200ms the screen is showing something that is not true. In a live
show, "briefly wrong" is wrong. Transitions are permitted only on hover, focus, and overlays —
never on `program`/`preview`/`idle`.

**3. Readable at 2 metres, from the corner of an eye.**
The operator is looking at the mixer, the talent, or the clock — not at this screen. Tally identity
and state must resolve in a peripheral half-second glance: large type, high contrast, big colour
areas, no dependence on reading a 12px label.

**4. Dark by default, but never pure black and never full-brightness white.**
The room is dark and the operator's eyes are adapted. `#000` next to `#fff` blooms and leaves
after-images; the screen becomes a light source pointed at someone who needs their night vision.
Background is a near-black neutral, brightest text stops short of white. White is spent only on the
`highlight`/locate signal, where a flash *is* the point.

**5. Colour is never the only carrier of state.**
Red-green colour vision deficiency affects roughly 1 in 12 men, and program-vs-preview is exactly a
red-green distinction. The product already acknowledges this — `ColorScheme.ts` ships a
`yellow-pink` scheme "intended to give better contrast for the red-green color blind". The UI must
carry that same commitment natively: every state also has a shape, a position, and a word.

**6. Show the LED colours truthfully; style the UI separately.**
When the UI previews a colour scheme it renders the exact `rgb()` the lamp will emit — including
`rgb(255,0,0)` and `rgb(0,1,0)`, unmodified, uncorrected, no opacity, no gradient. Those swatches
are a hardware readout, not decoration. UI state colours are a *separate*, tuned set (§2). A
designer might reasonably want to prettify the swatches; do not.

**7. Failure is louder than success.**
Idle is quiet to the point of near-invisibility. Disconnected, missing, and unpatched are loud,
because those are the states where the operator's model of the rig has diverged from reality and
they don't yet know it.

## 2. Tokens

Dark-first and dark-only. There is no light theme, and building one is not deferred work — it is
declined work. A light UI in a dark control room is a flashlight in the operator's face. If a
daylight/OB-truck case ever appears, it is a *dimmer* (reduce backlight, keep the palette), not an
inverted palette.

All values are literal. Paste-ready for Tailwind v4 `@theme`.

### 2.1 Neutrals

Cool-shifted greys (a hint of blue) so that a warm alert (`--warn` amber) and a hot state (`--live`
red) separate from the chrome rather than sitting in it.

| Token | Hex | Use |
| --- | --- | --- |
| `--color-n-950` | `#0B0E11` | App background. Also the text colour on any bright fill. |
| `--color-n-900` | `#12161A` | Surface — panels, sidebar, table body. |
| `--color-n-850` | `#171C21` | Surface hover / zebra rows. |
| `--color-n-800` | `#1E242B` | Raised surface — tally card, dialog, popover. |
| `--color-n-700` | `#2A323B` | Hairline borders, dividers (decorative only). |
| `--color-n-600` | `#3A444F` | Input borders at rest, disabled fills. |
| `--color-n-500` | `#6B7787` | Meaningful borders, disabled text, `idle` state colour. |
| `--color-n-400` | `#8A98A8` | Secondary / muted text. |
| `--color-n-300` | `#A3B0BD` | Tertiary emphasis, icon default. |
| `--color-n-200` | `#C7D0D9` | — |
| `--color-n-100` | `#E3E8ED` | Primary text. **The brightest routine value — not white.** |
| `--color-white` | `#FFFFFF` | Reserved: `highlight`/locate, and primary button fills only. |

### 2.2 Semantic tally state colours

These are the UI colours, tuned for legibility on a dark surface. They are **not** the LED values —
see §2.3 for those.

Contrast ratios given against `--color-n-950` (`#0B0E11`, app bg) and `--color-n-800` (`#1E242B`,
card bg). WCAG thresholds: 4.5:1 for body text, 3:1 for large text (≥24px, or ≥19px bold) and for
non-text UI (borders, indicators, icons).

| Token | Hex | vs `n-950` | vs `n-800` | Notes |
| --- | --- | --- | --- | --- |
| `--color-live` | `#FF3B30` | **5.46:1** | **4.41:1** | Program / on air. Passes AA text on app bg; on card bg it is just under 4.5 — use for fills, borders, and large text there, not 15px body copy. |
| `--color-live-text` | `#FF6257` | **6.58:1** | **5.32:1** | The text-safe live red. Use anywhere live-coloured text sits on a card. |
| `--color-preview` | `#34D07A` | **9.63:1** | **7.78:1** | Preview / cued. Safe as text at any size on any surface. |
| `--color-idle` | `#6B7787` | **4.25:1** | **3.43:1** | Patched, not selected. ≥3:1 → valid as a border/indicator. **Never as text** — idle labels use `--color-n-400`. |
| `--color-unpatched` | `#4C8DFF` | **6.05:1** | **4.89:1** | No channel assigned. Lifted from the LED's `rgb(0,0,255)`, which is 2.25:1 and unreadable. |
| `--color-disconnected` | `#8A98A8` | **6.58:1** | **5.32:1** | Transport down. Deliberately neutral-grey, not red: it must not read as "on air" at a glance. Carried primarily by a dashed border + strikethrough, not hue. |
| `--color-missing` | `#FFB020` | **10.58:1** | **8.55:1** | Connected but not reporting — the degraded/attention state (old theme's `warning`). |
| `--color-highlight` | `#FFFFFF` | **19.35:1** | **15.64:1** | Operator-triggered locate. The only routine use of pure white on a surface. |

Text **on** a coloured fill is always `--color-n-950` (`#0B0E11`), never white:

| Fill | On-fill text | Ratio |
| --- | --- | --- |
| `--color-live` `#FF3B30` | `#0B0E11` | **5.46:1** |
| `--color-preview` `#34D07A` | `#0B0E11` | **9.63:1** |
| `--color-missing` `#FFB020` | `#0B0E11` | **10.58:1** |
| `--color-highlight` `#FFFFFF` | `#0B0E11` | **19.35:1** |
| `--color-unpatched` `#4C8DFF` | `#0B0E11` | **6.05:1** |

White-on-red would be 3.55:1 and fails. Do not.

### 2.3 LED preview colours (hardware truth — do not restyle)

Straight from `hub/src/tally/ColorScheme.ts`. Render these exactly, at the brightness the user has
selected, wherever the UI shows what the lamp will look like.

```css
/* Default scheme */
--led-default-program:   rgb(255, 0, 0);
--led-default-preview:   rgb(0, 255, 0);
--led-default-highlight: rgb(255, 255, 255);
--led-default-unknown:   rgb(0, 0, 255);
--led-default-idle:      rgb(0, 1, 0);    /* effectively off — render as near-black, honestly */

/* Yellow-Pink scheme — the built-in CVD-safe option */
--led-ylwpnk-program:    rgb(255, 255, 0);
--led-ylwpnk-preview:    rgb(255, 0, 255);
--led-ylwpnk-highlight:  rgb(255, 255, 255);
--led-ylwpnk-unknown:    rgb(0, 0, 255);
--led-ylwpnk-idle:       rgb(0, 1, 0);
```

`rgb(0,1,0)` will render as visually black. That is correct and must not be "fixed" to a visible
grey — the lamp is off, and the swatch says so. Give the idle swatch a `--color-n-600` border so the
operator can see the swatch exists at all.

### 2.4 Type

**Base is 16px, not 15px. This reverses the old theme's `htmlFontSize: 15`.**
That 15px came from matching Bootswatch-Darkly's density, and a non-16px root fights the browser
default: it silently rescales anything specced in `px`, and it shrinks the result for users who have
raised their OS/browser font size. Distance legibility is bought with the *scale* — a 24px tally
name reads further than a 15px root ever did — not by nudging the root down and then compensating
everywhere. If the 15px density is genuinely wanted back, change one token (`--text-base`) rather
than the root, and the ratios in §3 still hold.

Font: `Inter` — a screen-optimised grotesque with real tabular figures (needed for IPs, ports,
channel numbers) and unambiguous `1`/`l`/`I`. Fall back through the old stack.

```css
--font-sans: Inter, Lato, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
--font-mono: "JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace;

--text-2xs:   0.6875rem; /* 11px  — legal, badge microcopy. Never for state. */
--text-xs:    0.75rem;   /* 12px  — table meta, footer chrome */
--text-sm:    0.875rem;  /* 14px  — secondary text, form help */
--text-base:  1rem;      /* 16px  — body, form values */
--text-lg:    1.125rem;  /* 18px  — section labels */
--text-xl:    1.375rem;  /* 22px  — card titles */
--text-2xl:   1.75rem;   /* 28px  — tally name on a card. Glance target. */
--text-3xl:   2.25rem;   /* 36px  — screen title */
--text-4xl:   3rem;      /* 48px  — full-screen / kiosk state readout */

--text-2xs--line-height: 1.45;
--text-xs--line-height:  1.45;
--text-sm--line-height:  1.5;
--text-base--line-height:1.5;
--text-lg--line-height:  1.4;
--text-xl--line-height:  1.3;
--text-2xl--line-height: 1.2;
--text-3xl--line-height: 1.15;
--text-4xl--line-height: 1.05;

--font-weight-normal:   400;
--font-weight-medium:   500;
--font-weight-semibold: 600;
--font-weight-bold:     700;

--tracking-tight:  -0.015em;  /* ≥28px */
--tracking-normal:  0;
--tracking-wide:    0.06em;   /* ALL-CAPS state labels only */
```

Rules: state labels are `--text-xs` / `600` / `--tracking-wide` / uppercase. Tally names are
`--text-2xl` / `600`. Weight below 400 does not exist here — the old theme's `fontWeightLight: 300`
and 300-weight `h1`/`h2` are dropped, because thin strokes on a dark background at distance are the
first thing to disappear. All numeric readouts (IP, port, channel, tally count) use
`font-variant-numeric: tabular-nums`.

### 2.5 Spacing

4px base, no half-steps.

```css
--spacing: 0.25rem;   /* Tailwind v4 multiplier: p-4 → 16px */

--space-0:  0;
--space-1:  0.25rem;  /*  4px */
--space-2:  0.5rem;   /*  8px */
--space-3:  0.75rem;  /* 12px */
--space-4:  1rem;     /* 16px — default gap inside a card */
--space-5:  1.25rem;  /* 20px */
--space-6:  1.5rem;   /* 24px — card padding */
--space-8:  2rem;     /* 32px — gap between cards */
--space-10: 2.5rem;   /* 40px */
--space-12: 3rem;     /* 48px — section separation */
--space-16: 4rem;     /* 64px */
--space-24: 6rem;     /* 96px */
```

Minimum interactive hit target: **44×44px**. Non-negotiable — this gets touched on a phone mid-show,
and a mis-tap cuts to the wrong camera.

### 2.6 Radii

```css
--radius-none: 0;
--radius-xs:   2px;   /* swatch, tag */
--radius-sm:   4px;   /* input, button */
--radius-md:   8px;   /* card */
--radius-lg:   12px;  /* dialog, popover */
--radius-xl:   16px;  /* full-screen web-tally panel */
--radius-full: 9999px;/* status dot, pill */
```

### 2.7 Elevation

In a dark room a drop shadow is nearly invisible, so **elevation is expressed by surface lightness +
a hairline border**, not by shadow. Shadows exist only to detach true overlays from the page.

```css
--elevation-0: var(--color-n-900);  /* + 1px solid --color-n-700 */
--elevation-1: var(--color-n-800);  /* + 1px solid --color-n-700 */
--elevation-2: var(--color-n-800);  /* + 1px solid --color-n-600 + --shadow-overlay */

--shadow-overlay: 0 8px 24px -4px rgb(0 0 0 / 0.6), 0 2px 6px -2px rgb(0 0 0 / 0.5);
--shadow-focus:   0 0 0 2px var(--color-n-950), 0 0 0 4px var(--color-white);
```

Focus ring is white and achromatic — per principle 1, it must never be mistakable for a state
colour. 4px total, drawn outside a 2px background-coloured gap so it survives on any fill.

There is no coloured glow on the live state. A red bloom around an on-air card looks great in a
mockup and destroys dark adaptation across an eight-hour show.

### 2.8 Motion

```css
--duration-0:    0ms;    /* ALL tally state changes. See principle 2. */
--duration-fast: 120ms;  /* hover, focus, button press */
--duration-base: 180ms;  /* disclosure, tab switch, inline expand */
--duration-slow: 240ms;  /* dialog / drawer enter */

--ease-out:  cubic-bezier(0.2, 0, 0, 1);
--ease-in:   cubic-bezier(0.4, 0, 1, 1);
--ease-both: cubic-bezier(0.4, 0, 0.2, 1);
```

`--duration-0` is a real token and is used deliberately: any element bound to `program` / `preview` /
`idle` / `unpatched` sets `transition: none`. Under `prefers-reduced-motion: reduce`, every other
duration collapses to `--duration-0` too.

The one permitted animation on a state is the operator-triggered `highlight`/locate flash — a 1Hz
white pulse, because the operator asked for something eye-catching and is watching for it. It stops
on its own after 10s.

### 2.9 The `@theme` block

```css
@import "tailwindcss";

@theme {
  /* neutrals */
  --color-n-950: #0B0E11;
  --color-n-900: #12161A;
  --color-n-850: #171C21;
  --color-n-800: #1E242B;
  --color-n-700: #2A323B;
  --color-n-600: #3A444F;
  --color-n-500: #6B7787;
  --color-n-400: #8A98A8;
  --color-n-300: #A3B0BD;
  --color-n-200: #C7D0D9;
  --color-n-100: #E3E8ED;

  /* semantic surfaces & text */
  --color-bg:            var(--color-n-950);
  --color-surface:       var(--color-n-900);
  --color-surface-hover: var(--color-n-850);
  --color-surface-raised:var(--color-n-800);
  --color-border:        var(--color-n-700);
  --color-border-strong: var(--color-n-500);
  --color-text:          var(--color-n-100);
  --color-text-muted:    var(--color-n-400);
  --color-text-disabled: var(--color-n-500);
  --color-on-fill:       var(--color-n-950);

  /* tally state */
  --color-live:         #FF3B30;
  --color-live-text:    #FF6257;
  --color-preview:      #34D07A;
  --color-idle:         #6B7787;
  --color-unpatched:    #4C8DFF;
  --color-disconnected: #8A98A8;
  --color-missing:      #FFB020;
  --color-highlight:    #FFFFFF;

  /* LED hardware truth */
  --color-led-program:   rgb(255 0 0);
  --color-led-preview:   rgb(0 255 0);
  --color-led-highlight: rgb(255 255 255);
  --color-led-unknown:   rgb(0 0 255);
  --color-led-idle:      rgb(0 1 0);
  --color-led-yp-program: rgb(255 255 0);
  --color-led-yp-preview: rgb(255 0 255);

  /* type */
  --font-sans: Inter, Lato, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  --font-mono: "JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace;
  --text-2xs: 0.6875rem;  --text-2xs--line-height: 1.45;
  --text-xs:  0.75rem;    --text-xs--line-height:  1.45;
  --text-sm:  0.875rem;   --text-sm--line-height:  1.5;
  --text-base:1rem;       --text-base--line-height:1.5;
  --text-lg:  1.125rem;   --text-lg--line-height:  1.4;
  --text-xl:  1.375rem;   --text-xl--line-height:  1.3;
  --text-2xl: 1.75rem;    --text-2xl--line-height: 1.2;
  --text-3xl: 2.25rem;    --text-3xl--line-height: 1.15;
  --text-4xl: 3rem;       --text-4xl--line-height: 1.05;
  --tracking-tight: -0.015em;
  --tracking-wide:   0.06em;

  /* space, radius, shadow, motion */
  --spacing: 0.25rem;
  --radius-xs: 2px;  --radius-sm: 4px;  --radius-md: 8px;
  --radius-lg: 12px; --radius-xl: 16px;
  --shadow-overlay: 0 8px 24px -4px rgb(0 0 0 / 0.6), 0 2px 6px -2px rgb(0 0 0 / 0.5);
  --shadow-focus:   0 0 0 2px var(--color-n-950), 0 0 0 4px #FFFFFF;
  --duration-0: 0ms; --duration-fast: 120ms; --duration-base: 180ms; --duration-slow: 240ms;
  --ease-out: cubic-bezier(0.2, 0, 0, 1);
  --ease-in:  cubic-bezier(0.4, 0, 1, 1);
  --ease-both:cubic-bezier(0.4, 0, 0.2, 1);
}

@media (prefers-reduced-motion: reduce) {
  :root {
    --duration-fast: 0ms; --duration-base: 0ms; --duration-slow: 0ms;
  }
}
```

## 3. Accessibility

### 3.1 The red-green problem, stated plainly

This product's core distinction is **red = on air** vs **green = next**. That is the single hardest
pair for the most common colour vision deficiency. Roughly 8% of men and 0.5% of women have some
red-green CVD; deuteranomaly/deuteranopia alone is about 6% of men.

Under deuteranopia, `--color-live` `#FF3B30` and `--color-preview` `#34D07A` both collapse toward a
muddy yellow-brown. They do **not** become identical — live simulates darker and more saturated,
preview lighter — but the residual difference is a lightness difference of the same kind that
dimming a screen or catching it peripherally would erase. It is not a difference you bet a live
broadcast on.

**So: how does someone with deuteranopia tell on-air from preview at a glance?**

Four redundant carriers, every one of which works with the colour removed entirely. A deuteranopic
operator uses whichever lands first in peripheral vision — in practice, fill vs no-fill.

1. **Fill vs outline (the primary non-colour carrier).**
   `program` is the *only* state rendered as a **solid filled** card — the whole card background is
   the state colour, with `--color-on-fill` text on it. `preview` is an **outline**: normal
   `--color-surface-raised` background, 3px state-coloured border, unfilled. Grayscale the screen
   and the on-air camera is still the one solid block among outlines. This is a lightness/area
   difference, not a hue difference, and it survives every form of CVD including achromatopsia.

2. **Shape marker, top-left of every tally card, 20×20px.**
   - `program` — filled **circle** ●
   - `preview` — hollow **triangle** ▲ (pointing right: "next")
   - `idle` — small hollow **square** ▫
   - `unpatched` — **question mark** in a hollow circle
   - `disconnected` — **slashed circle** ⊘
   - `missing` — **exclamation** in a hollow triangle
   Distinct silhouettes, not the same glyph recoloured. Filled vs hollow tracks the fill rule above.

3. **Word label, always rendered, never a tooltip.**
   `ON AIR` / `PREVIEW` / `IDLE` / `UNPATCHED` / `NO SIGNAL` / `NOT REPORTING`, at `--text-xs` /
   `600` / uppercase / `--tracking-wide`, in the card footer. `ON AIR` rather than `PROGRAM`:
   two short words, distinct silhouette from `PREVIEW`, and it is what operators say out loud.
   Truncation is forbidden — if the card is too narrow for the label, the card is too narrow.

4. **Position — sorting, not just styling.**
   In any tally list or grid, on-air tallies sort to the top and are visually separated from the
   rest by `--space-8`. The operator learns "top of the list is live" as a spatial fact, and spatial
   facts survive colour blindness, low light, and peripheral vision.

Additionally: the **CVD-safe LED scheme is surfaced in the UI, not buried in settings.**
`ColorScheme.ts` already ships `yellow-pink` (`rgb(255,255,0)` program / `rgb(255,0,255)` preview) —
a blue-yellow axis pair that stays distinguishable under both protanopia and deuteranopia. It gets
first-class placement in the colour scheme picker with its rationale visible, not a footnote. Note
this switches the *lamps*; carriers 1–4 above are what fix the *screen*, and they are always on
regardless of which scheme is selected.

### 3.2 Contrast — every text/background pair specified

Computed per WCAG 2.1 relative-luminance. AA = 4.5:1 body / 3:1 large (≥24px, or ≥19px bold) and
non-text UI. AAA = 7:1 body / 4.5:1 large.

**On `--color-bg` `#0B0E11`:**

| Foreground | Hex | Ratio | Verdict |
| --- | --- | --- | --- |
| `--color-text` | `#E3E8ED` | **15.84:1** | AAA |
| `--color-text-muted` | `#8A98A8` | **6.58:1** | AA body, AAA large |
| `--color-n-300` | `#A3B0BD` | **8.76:1** | AAA |
| `--color-text-disabled` | `#6B7787` | **4.25:1** | Large text / UI only — never body copy |
| `--color-live` | `#FF3B30` | **5.46:1** | AA body |
| `--color-live-text` | `#FF6257` | **6.58:1** | AA body, AAA large |
| `--color-preview` | `#34D07A` | **9.63:1** | AAA |
| `--color-unpatched` | `#4C8DFF` | **6.05:1** | AA body |
| `--color-missing` | `#FFB020` | **10.58:1** | AAA |
| `--color-disconnected` | `#8A98A8` | **6.58:1** | AA body |
| `--color-idle` | `#6B7787` | **4.25:1** | UI/border only |
| `--color-highlight` | `#FFFFFF` | **19.35:1** | AAA |
| `--color-border` | `#2A323B` | **1.49:1** | Decorative hairline only — carries no meaning |
| `--color-border-strong` | `#6B7787` | **4.25:1** | Passes 3:1 for meaningful UI boundaries |

**On `--color-surface` `#12161A`:**

| Foreground | Hex | Ratio | Verdict |
| --- | --- | --- | --- |
| `--color-text` | `#E3E8ED` | **14.88:1** | AAA |
| `--color-text-muted` | `#8A98A8` | **6.18:1** | AA body |
| `--color-live` | `#FF3B30` | **5.12:1** | AA body |
| `--color-preview` | `#34D07A` | **9.04:1** | AAA |
| `--color-unpatched` | `#4C8DFF` | **5.68:1** | AA body |
| `--color-missing` | `#FFB020` | **9.94:1** | AAA |
| `--color-border-strong` | `#6B7787` | **3.99:1** | AA non-text |

**On `--color-surface-raised` `#1E242B` (the tally card):**

| Foreground | Hex | Ratio | Verdict |
| --- | --- | --- | --- |
| `--color-text` | `#E3E8ED` | **12.81:1** | AAA |
| `--color-text-muted` | `#8A98A8` | **5.32:1** | AA body |
| `--color-live` | `#FF3B30` | **4.41:1** | **Fails AA body** → fills/borders/large text only. For live-coloured text on a card, use `--color-live-text`. |
| `--color-live-text` | `#FF6257` | **5.32:1** | AA body |
| `--color-preview` | `#34D07A` | **7.78:1** | AAA |
| `--color-unpatched` | `#4C8DFF` | **4.89:1** | AA body |
| `--color-missing` | `#FFB020` | **8.55:1** | AAA |
| `--color-idle` | `#6B7787` | **3.43:1** | AA non-text; border only |
| `--color-disconnected` | `#8A98A8` | **5.32:1** | AA body |

**On coloured fills (text is always `--color-on-fill` `#0B0E11`):**

| Fill | Ratio | Verdict |
| --- | --- | --- |
| `--color-live` `#FF3B30` | **5.46:1** | AA body. The `ON AIR` label on a live card is 28px/600 → also AAA large. |
| `--color-preview` `#34D07A` | **9.63:1** | AAA |
| `--color-missing` `#FFB020` | **10.58:1** | AAA |
| `--color-unpatched` `#4C8DFF` | **6.05:1** | AA body |
| `--color-highlight` `#FFFFFF` | **19.35:1** | AAA |

**Focus ring** `--shadow-focus` — white `#FFFFFF` on any surface: minimum **15.64:1** (raised card),
worst case against a `--color-highlight` white fill is handled by the 2px `--color-n-950` inner gap,
which is 19.35:1 against white. Focus is visible on every possible background in the product.

### 3.3 The rest

**Keyboard.** Every control reachable by Tab in DOM order; visible focus everywhere (`:focus-visible`,
never `outline: none` without a replacement). No focus trap outside modal dialogs. The destructive
actions — repatching a channel, forcing a tally state — are never the first focusable element in
their container.

**Screen readers.** Tally state changes announce via `aria-live="polite"` on a per-tally status
region. Program transitions specifically use `aria-live="assertive"` — going on air is the one event
worth interrupting for. The card carries `role="group"` with
`aria-label="Camera 2, on air, connected"`. Existing `data-color` / `data-isactive` attributes on the
card (`Tally.tsx:118`) stay — they are the test hooks — but they are not the accessibility layer.

**Connection state is separate from tally state, visually and semantically.** A card can be
`program` + `disconnected`: solid red fill, plus a dashed 2px `--color-disconnected` outline drawn
outside it and the `NO SIGNAL` word in the footer. The two never overwrite each other, because
"on air but the light is dead" is the state an operator most needs to see and the one a
single-colour-slot design would hide.

**Motion.** `prefers-reduced-motion: reduce` zeroes all durations (§2.8) and replaces the `highlight`
pulse with a static white fill — the locate signal still works, it just stops flashing.

**Zoom / text scaling.** All type in `rem`; layout survives 200% browser zoom and OS text scaling
without clipping state labels. This is the concrete payoff of moving the root back to 16px.

**Not relied on:** hue alone (§3.1), hover-only information, tooltips for anything load-bearing,
colour-only form validation (errors get an icon and text), and animation as a state signal.
