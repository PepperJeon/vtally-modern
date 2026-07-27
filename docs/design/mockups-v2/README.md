# vTally v2 — visual direction

Three working mockups plus the reasoning. Open any file in a browser; the **KO / EN** and
**라이트 / 다크** buttons in the nav both work, and each file carries its own state controls.

| File | What it shows |
| --- | --- |
| `01-tally-grid.html` | The grid. All six states including on-air-AND-disconnected. Demo strip toggles the hub-down state. |
| `02-config.html` | Config, with the empty-column problem solved. |
| `03-web-tally.html` | The phone. Six states, a live brightness slider, and a 1 m / 3 m viewing-distance switch. |

Nothing under `hub/src` was touched.

---

## 1. The direction

**Instrument, not dashboard.** The 2026 SaaS craft is here — real type hierarchy, restrained
motion, layered surfaces — but the organising idea is that this is a rack unit, not an admin
panel. Three concrete moves carry it:

**Surfaces are edged, not boxed.** Every panel gets a 1px border *plus* a 1px inset top
highlight (`inset 0 1px 0 rgb(255 255 255 / .045)` in dark, solid white in light). That single
line is most of what makes a Linear or Raycast surface read as machined rather than drawn. It
costs one token and replaces the old "slightly lighter header strip", which was the flatness
you were reacting to.

**Chrome is subtracted, not added.** Section headings are 11px uppercase micro-labels sitting
on the background with a hairline rule running off to the right, not header bars with their own
fill. Fewer boxes, more hierarchy.

**A faint machined grid** sits behind everything at ~2% alpha, masked to fade out below the
fold. It is the only decorative element in the product and it is achromatic, so it cannot
compete with state. This is the identity you asked for — it comes from surface and rhythm, not
from a brand hue, because principle 1 of the existing tokens forbids spending hue on anything
but tally state and that principle is correct.

**Density.** Card width 236px (was 250), grid gap 18px (was 32), plus a **status rail** under
the nav and a **meta strip** on every card. The screen now carries hub, mixer, endpoint, tally
count, a per-channel program bus, and per-tally IP + signal + last-seen — all of it state the
hub already knows and never showed. That is the honest way to raise density: say more, not
shrink more.

---

## 2. Token changes

### 2.1 Surfaces — split into a real two-theme set

The old ramp was a single dark ladder. It now becomes semantic tokens with two values each.
The tally-state names are unchanged, so `design-components.md` selectors keep working.

| Token | Dark | Light | Note |
| --- | --- | --- | --- |
| `--bg` | `#0B0E11` | `#F6F7F9` | Light page is off-white, not `#FFF` — cards need somewhere to sit above. |
| `--surface` | `#12161A` | `#FFFFFF` | |
| `--raised` | `#1B2127` | `#FFFFFF` | Was `#1E242B`; darkened slightly so the edge highlight has room to read. |
| `--sunken` | `#0E1216` | `#EDEFF3` | New. Inputs and tracks recess instead of floating. |
| `--border` | `#232B33` | `#E2E6EB` | Was `#2A323B`. |
| `--border-strong` | `#37414C` | `#C3CAD3` | |
| `--text` | `#E3E8ED` | `#111820` | |
| `--text-muted` | `#8A98A8` | `#5B6774` | |
| `--text-subtle` | `#6B7787` | `#78838F` | New tier for micro-labels. UI/large text only in both themes. |

New non-colour tokens: `--edge`, `--edge-soft` (the inset highlight), `--lift` (a real but very
soft shadow — permitted in light, near-invisible in dark, which is fine because `--edge` is
doing the work there).

### 2.2 Tally state — recomputed for light, not inverted

This is the safety-critical part. The finding that drove it:

> In dark, a state fill wants to be **bright** so it separates from a near-black page, and its
> text must then be **near-black**. In light, a fill wants to be **deep** so it separates from
> a white page — and its text must be **white**. Both constraints pull the same direction
> within a theme, and opposite directions between themes. So `--on-fill` is itself
> theme-dependent, and a fill colour cannot be shared.

| Token | Dark | Light | Why the light value |
| --- | --- | --- | --- |
| `--live` | `#FF3B30` | `#C4291E` | `#FF3B30` is 3.31:1 on the light page and 3.55:1 under white text — fails both. |
| `--live-text` | `#FF6257` | `#A81F17` | Text-safe variant for red type on a card. |
| `--live-deep` | `#B3261E` | `#8E1C13` | New. The rail edge drawn inside a live fill. |
| `--preview` | `#34D07A` | `#0E7040` | `#34D07A` is **1.87:1** on white. Unusable; not a tuning problem, a different colour. |
| `--idle` | `#6B7787` | `#6B7787` | **Unchanged.** 4.25:1 against *both* pages — the theme-invariant pivot. |
| `--unpatched` | `#4C8DFF` | `#2563EB` | |
| `--disconnected` | `#8A98A8` | `#5B6774` | Still deliberately neutral grey, never red. |
| `--missing` | `#FFB020` | `#B45309` | `#FFB020` is 1.71:1 on white — the amber footer strip would vanish. |
| `--highlight` | `#FFFFFF` | `#0B0E11` | **Inverts.** A white locate flash on a white page is not a signal. Light-mode locate flashes black. |
| `--on-fill` | `#0B0E11` | `#FFFFFF` | Flips, per the finding above. |

### 2.3 Type

`Pretendard` first, then Inter, then `Apple SD Gothic Neo` / `Noto Sans KR`. Pretendard is the
default Korean UI face and its Latin is a near-Inter clone, so a mixed KO/EN string does not
visibly switch fonts mid-line — which the old `Inter → Lato` stack did badly.

Scale nudged down at the top and up in the middle: card title `1.3125rem` (was 1.75), because
at 236px a 28px Korean name is 4 characters before it truncates. Tracking `-0.02em` (was
-0.015), `--wide` `0.075em` (was 0.06) — Korean uppercase-equivalent labels need more air than
Latin caps do.

**`line-height: 1.62` and `letter-spacing: -0.003em` are applied only under `[lang="ko"]`.**
Korean has no descenders to establish rhythm, so the 1.5 that reads fine in English reads
cramped in Korean; and Korean glyphs are square and full-width, so a hair of negative tracking
stops them looking gappy. English keeps 1.5 / 0.

---

## 3. Contrast

WCAG 2.1 relative luminance. AA = 4.5:1 body, 3:1 large text (≥24px, or ≥19px bold) and
non-text UI. Computed, not estimated.

### 3.1 Dark theme — regression check

Unchanged values, re-verified against the adjusted surfaces (`--raised` `#1B2127`).

| Foreground | Hex | vs `#0B0E11` | vs `#12161A` | vs `#1B2127` | Verdict |
| --- | --- | --- | --- | --- | --- |
| `--text` | `#E3E8ED` | 15.70 | 14.74 | 13.17 | AAA |
| `--text-muted` | `#8A98A8` | 6.58 | 6.18 | 5.52 | AA body |
| `--text-subtle` | `#6B7787` | 4.25 | 3.99 | 3.57 | Large / UI only |
| `--live` | `#FF3B30` | 5.46 | 5.12 | 4.58 | AA body everywhere now — the old `#1E242B` card put it at 4.41 and failed |
| `--live-text` | `#FF6257` | 6.58 | 6.18 | 5.52 | AA body |
| `--preview` | `#34D07A` | 9.63 | 9.04 | 8.08 | AAA |
| `--unpatched` | `#4C8DFF` | 6.05 | 5.68 | 5.07 | AA body |
| `--missing` | `#FFB020` | 10.58 | 9.94 | 8.88 | AAA |
| `--disconnected` | `#8A98A8` | 6.58 | 6.18 | 5.52 | AA body |
| `--idle` | `#6B7787` | 4.25 | 3.99 | 3.57 | Border / indicator only |
| `--highlight` | `#FFFFFF` | 19.35 | 18.18 | 16.24 | AAA |

Text on a dark-theme fill is `#0B0E11`: live **5.46**, preview **9.63**, missing **10.58**,
unpatched **6.05**, highlight **19.35**. All AA body or better.

### 3.2 Light theme

| Foreground | Hex | vs page `#F6F7F9` | vs card `#FFFFFF` | vs sunken `#EDEFF3` | Verdict |
| --- | --- | --- | --- | --- | --- |
| `--text` | `#111820` | 16.67 | 17.87 | 15.52 | AAA |
| `--text-muted` | `#5B6774` | 5.39 | 5.77 | 5.02 | AA body |
| `--text-subtle` | `#78838F` | 3.60 | 3.86 | 3.35 | Large / UI only |
| `--live` | `#C4291E` | 5.32 | 5.70 | 4.95 | AA body |
| `--live-text` | `#A81F17` | 6.82 | 7.31 | 6.35 | AAA body on card |
| `--preview` | `#0E7040` | 5.74 | 6.16 | 5.35 | AA body |
| `--unpatched` | `#2563EB` | 4.82 | 5.17 | 4.49 | AA body (4.49 on sunken → the unpatched `<select>` label is 14px/540, still ≥4.5 on its actual card ground) |
| `--missing` | `#B45309` | 4.68 | 5.02 | 4.36 | AA body |
| `--disconnected` | `#5B6774` | 5.39 | 5.77 | 5.02 | AA body |
| `--idle` | `#6B7787` | 4.25 | 4.55 | 3.95 | Border / indicator only |
| `--highlight` | `#0B0E11` | 18.05 | 19.35 | 16.81 | AAA |

Text on a light-theme fill is `#FFFFFF`:

| Fill | Ratio vs white text | Fill vs page (non-text UI, needs ≥3:1) |
| --- | --- | --- |
| `--live` `#C4291E` | **5.70** | **5.32** |
| `--preview` `#0E7040` | **6.16** | **5.74** |
| `--unpatched` `#2563EB` | **5.17** | **4.82** |
| `--missing` `#B45309` | **5.02** | **4.68** |
| `--highlight` `#0B0E11` | **19.35** | **18.05** |

Every light-theme state colour clears AA body as text and clears 3:1 as a fill against the
page. Nothing in the set is marginal.

### 3.3 Does light mode keep the safety guarantees?

The four redundant carriers from `design-tokens.md` §3.1, checked against light:

1. **Fill vs outline — survives, and gets stronger.** `program` is still the only filled state.
   In dark the fill is *lighter* than the page; in light it is *darker*. Either way the on-air
   card is the single maximum-lightness-contrast object on screen, which is exactly what
   greyscale, deuteranopia and peripheral vision all reduce to. Verified by rendering: on the
   light grid the deep-red card is unmistakable among white outlines.
2. **Shape marker — unaffected.** Geometry, not colour.
3. **Word label — unaffected.** See §4 for a Korean-specific caveat.
4. **Position — unaffected.** On-air sorts to the top under its own rule.

**Two light-mode-specific findings, both fixed in the mockups:**

**The stale-data dim had to be re-tuned per theme.** `opacity: 0.55` on the grid during
hub-disconnect fades toward the page colour. On near-black that keeps live red red; on white it
turns the on-air card *pink* — washing out the one card that most needs to survive. Light uses
`0.66`. This was found by rendering the state, not by reading the CSS.

**Hue reads less saturated in light.** `#0E7040` and `#C4291E` are dark enough that at three
metres they resolve as "a dark bar" before they resolve as green or red. The hue is still
correct and still passes; it just does proportionally less of the work. That is an argument for
the redundant carriers being *more* important in light mode, not less — and it is a reason to
keep dark as the default for control rooms, which the mockups do.

**One residual risk, stated rather than hidden.** In light mode `--missing` `#B45309` and
`--live` `#C4291E` are closer under deuteranopia than their dark-mode counterparts are — both
collapse toward a dark yellow-brown. Three things keep them apart, and none of them is hue:
`missing` never fills a card (it only fills the footer strip, under a card whose own state
colour is separate); it always carries a `⚠` glyph; and its word (`응답 없음` / `NOT REPORTING`)
shares no silhouette with `온에어` / `ON AIR`. I would accept this. If you would not, the
alternative is pushing light-mode `missing` to `#8A5200` (5.96:1 on page, 6.39:1 under white),
which is browner and further from red at the cost of looking less like a warning.

---

## 4. Korean

All copy in the mockups is Korean-first, using the terminology from
`_tally-recovery/tallylite-web/src/i18n/ko.ts` — 탈리, 허브, 믹서, 채널, 밝기, 연결됨. English is
the secondary string on the same node and the toggle swaps them, so the layouts are tested
against both.

**State words.** 온에어 / 프리뷰 / 대기 / 미할당 / 신호 없음 / 응답 없음.

**The finding that matters: Korean weakens carrier 3.** In English, `ON AIR` (6 chars, two
words, one space) and `PREVIEW` (7 chars, one word) have visibly different silhouettes — you
can tell them apart without reading. In Korean, `온에어` and `프리뷰` are both exactly three
syllable blocks of identical width. The word carrier degrades from "distinguishable at a
glance" to "distinguishable only if you read it".

I did **not** solve this by lengthening the Korean, which would be bad Korean. Instead:
`대기` is deliberately two blocks (not `유휴`, which is also two but shares glyph shapes with
`프리뷰`), and the failure states `신호 없음` / `응답 없음` are five blocks with a space —
so the *safety-relevant* words are all silhouette-distinct from the two normal ones. The
program/preview pair leans on carriers 1, 2 and 4, which is what they were designed for. Worth
knowing before someone "improves" the Korean strings.

**Width.** Korean UI copy runs shorter than English for the same meaning, so Korean is not the
binding constraint — English is. The tightest pair on a 236px card is the English footer
`UNPATCHED` + `Connected`, which uses roughly 205px of the 210px available. Verified by render.
Korean's equivalent (`미할당` + `연결됨`) uses about 120px. **The card is sized for English and
Korean fits comfortably**, which is the right way round: if it were sized for Korean, the
English build would truncate a state word, and truncating a state word is forbidden.

**Numerals.** All IPs, ports, channels and counts stay `font-variant-numeric: tabular-nums` in
the mono face regardless of language.

---

## 5. What I'd change that you didn't mention

**Replace the preview card's 3px all-round border with a 4px full-height left rail, present in
every state.** The old scheme changed `border-width` between states (1px idle → 3px preview →
2px dashed unpatched), which shifts inner geometry by 1–2px on every state change; the spec
had to add a `box-sizing` note to work around jitter across a twelve-card grid. A rail that is
always there and only changes colour has no jitter at all, and it reads better peripherally,
because the rails line up into a vertical column of colour down the grid that your eye catches
before it resolves any single card. `program` keeps its solid fill, so carrier 1 is intact.

**The card footer needed a real fix, found by rendering.** `--text-subtle` grey on the on-air
red fill was unreadable. Anything sitting on a state fill has to inherit `--on-fill`, not a
neutral. This is the kind of thing that only shows up when you look at it, and it is one line
of CSS: `.card[data-color="program"] .health { color: var(--on-fill); opacity: .72 }`.

**Give the card a meta strip.** IP, signal strength, and last-seen. The old card had a name, a
selector and a footer — three rows for an object with eight facts. Signal strength in
particular is honest, cheap (the ESP8266 already reports RSSI) and pre-show-useful.

**The `연결 상태` / Link panel on config is new and I think it is the most valuable thing in
these three files.** Mixer state, uptime, last packet age, input count, and the last four
events. The question an operator actually asks on the config screen is not "what are my
settings" — they set those weeks ago — it is *"is the mixer talking to me right now?"*, and
today nothing on the page answers it.

**Status pills become a status rail.** Three pills floating at the top-right is the weakest
possible use of the most valuable strip of the screen. The rail is a bordered instrument strip
with labelled cells, and it includes a **program bus** — every channel as a numbered chip, live
ones filled — so the answer to "what's on air" is available before you parse a single card.

**Sort the demo/QA affordances in.** Each mockup has a bottom strip that switches into the
states that are hard to get to in a browser (hub-down, 3 m viewing distance, every web-tally
command). `coverage-gaps.md` ranks hub-disconnect and web-tally brightness as the two most
under-tested behaviours in the product; making them one click away in the design artefact is
free and it is how I found both of the bugs above.

---

## 6. The counter-argument, since you asked for one

**I do not think "modern SaaS" is the right frame, and I built it anyway because I think the
disagreement is smaller than it sounds.**

Linear, Vercel and Resend are all tools you *work inside* — you have the tab focused, you are
reading, the interface is the task. vTally is a tool you *glance at*. The operator is looking
at the talent. Generous whitespace and long calm scroll rhythms are optimised for sustained
foveal reading, which is the one mode this screen never gets. Taken literally, "2026 SaaS"
would give you a beautiful screen that is worse at its job — that is more or less what happened
to the current UI, which is why it reads as an admin panel: it borrowed the calm without
borrowing the density.

What those products are *actually* good at, and what does transfer, is craft at the small
scale: type that has a real hierarchy instead of three sizes of grey, surfaces with edges,
motion that is present but never in the way, and a refusal to ship a default component
untouched. That is what I took. What I left is the airiness. The result is closer to a Bloomberg
terminal that went to design school than to Linear, and I think that is the right target for a
live-production tool: **dense, calm, and legible from the corner of your eye.**

The mockups are the asked-for direction executed properly — you can judge whether the density I
added is too much or not enough. If you want it more literally Linear-like, the lever is one
number: card gap 18 → 28 and the meta strip off. If you want it further toward instrument, the
lever is also one number: gap 18 → 12 and the card drops to 208px.

---

## 7. What is not here

- Only the three requested screens. `TallyLogPage` and `FlasherPage` are untouched by this
  direction and would need their own pass.
- Responsive behaviour is written into the CSS (the config columns collapse at 1024px, the
  web-tally sidebar at 940px) but is not shown as a separate mockup.
- The per-tally menu, dialogs and the create-tally flow are specified in
  `design-components.md` and are not re-mocked here.
- Fonts load from the system. Pretendard is not bundled; on a machine without it the stack
  falls to `Apple SD Gothic Neo` / `Noto Sans KR`, which is what the screenshots show and is
  close enough to judge the layout by. Bundling it is a real decision to make before build.
