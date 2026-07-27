# Localisation Plan — Korean default, English secondary

Companion to `docs/design/spec-changes.md` (which governs every spec edit named
here) and `docs/design/ui-contract.md`. No source was changed to write this
document; every count below comes from the tree as of 2026-07-27.

**The headline:** externalising the strings and flipping the default to Korean
are two different projects, and the test suite only cares about the second one.
Doing them in that order makes almost all of the risk disappear. The plan is
built around that split.

---

## 1. Spec compatibility — settled first, because nothing else can land until it is

### 1.0 Correction to §1.1's count, found during implementation

**§1.1 below undercounts by six.** Its grep covered `cy.contains` /
`should('contain'` / `.contains(` / `have.text` — the assertion styles — and
missed a *selector* style that is equally text-coupled: `.select()` matching an
`<option>` by its label.

```
webtally.spec.ts:47   .select("Channel 1")
webtally.spec.ts:56   .select("Channel 1")
tally.spec.ts:65      .select("Channel 1")
tally.spec.ts:70      .select("(unpatched)")
tally.spec.ts:115     .select("Channel 1")
tally.spec.ts:120     .select("(unpatched)")
```

Cypress's `.select()` accepts a value *or* a label, and these six pass the
label. Both strings are `ChannelSelector.tsx` copy, so all six break on a naive
Korean flip exactly like the sixteen in §1.1.

**Corrected totals: 22 automated Cypress + 7 Vitest = 29**, plus the 2
hardware-only sites. The strategy is unaffected — the locale pin covers a
label-matching `.select()` identically to a `contains()` — but the number in
§1.1 was wrong and is left there with this correction above it rather than
quietly edited.

Two `.select()` families are **not** at risk and were checked rather than
assumed: the mixer dropdown (`select('obs')`, `select('atem')`, …) and the OBS
live-mode dropdown (`select('record')`, `select('always')`, …) both select by
**value**, so their labels are free to be translated. That is why
`i18n/en.tsx`'s `mixers` and `obs.liveMode` tables exist at all.

### 1.1 The real count

`grep -rn "cy\.contains\|should('contain\|should(\"contain\|\.contains(\|have\.text" hub/cypress/` returns **67 hits**. One
(`hub-disconnected-banner.spec.ts:18`) is a comment. Of the remaining 66,
**16 assert on translatable UI copy in automated specs**, 2 more in
hardware-only `manual_*` specs, and **48 are immune**.

Immune, with the reason each is immune:

| Count | Sites | Why it survives translation |
|---|---|---|
| 26 | `tally-settings` ×9, `tally` ×9, `webtally` ×7, `tally-logs:23` | `contains(name)` — the tally name is user data (§4) |
| 14 | `hub-disconnected-banner` 52/56/60, `tally` 22/28/34/41/44/49, `manual_atem` 44/55/94/97/106 | digits (`"0"`, `"1"`, `"2"`) rendered by `StatusPill` |
| 4 | `tally-logs` 32/35/38/41 | log text the spec itself injected via `cy.task('tallyLog', …)` |
| 2 | `manual_atem` 80/82 (`"Foobar"`, `"Hello World"`) | ATEM channel names, arriving from the mixer over the wire |
| 1 | `manual_flasher:62` (`"tally.name=" + name`) | `tally-settings.ini` file content, not UI copy |
| 1 | `hub-disconnected-banner:18` | a comment |

At risk — the complete list:

| # | Site | String | Where it lives |
|---|---|---|---|
| 1–3 | `smoke.spec.ts` 14, 17, 20 | `"Configuration"`, `"Flash"`, `"Tallies"` | `Layout.tsx:25-27` |
| 4 | `tally.spec.ts:40` | `"missing"` (case-insensitive) | `Tally.tsx:64,97` — the `Health` union |
| 5–12 | `tally.spec.ts` 68, 73, 90, 94, 118, 123, 142, 146 | `"Channel 1"`, `"(unpatched)"` | `ChannelSelector.tsx:35,37,39` |
| 13 | `webtally.spec.ts:63` | `"Channel 1"` | same |
| 14 | `configVmix.spec.ts:50` | `"This will probably not work."` | `VmixSettings.tsx:50` |
| 15–16 | `tally-logs.spec.ts` 44, 46 | `"Tally got missing"`, `"Tally got disconnected"` | **server** — `UdpTallyDriver.ts:74,80` |
| (17–18) | `manual_flasher.spec.ts` 30, 35 | `"The software on this Tally is up to date."` | `FlasherPage.tsx:199` — out of scope, hardware-only |

### 1.2 Vitest is also exposed, and the lead's brief did not mention it

`src/client/components/ChannelSelector.spec.tsx` calls `getByText` 20 times.
Seven of those target translatable copy — lines **13, 38, 42, 77, 81, 89, 122**
(`"(unpatched)"` ×2, and the `Channel ${id}` fallback label ×5). The other
thirteen target `Channel` objects' own `name` data (`"Channel One"`,
`"Channel 42"`), which is immune for the same reason as tally names.

**Total that breaks on a naive Korean flip: 16 Cypress + 7 Vitest = 23.**

### 1.3 The three options, evaluated

**Option A — the specs run against a pinned English locale, forced from test
infrastructure.**

Cost: **zero spec-file edits.** Two non-spec files change:

```ts
// hub/cypress/support/e2e.ts
Cypress.on('window:before:load', win => {
  win.localStorage.setItem('vtally.lang', 'en')
})
```

```ts
// hub/src/client/setupTests.ts
import { setLanguage } from './i18n'
setLanguage('en')
```

`window:before:load` rather than a `beforeEach`: it fires on every `cy.visit`
before any app code runs, so it works regardless of whether the origin is
already established and regardless of Cypress's between-test storage clearing.
No app code learns it is under test — the key it reads is the same key the
language switcher writes in production.

Cost: the automated suite then never exercises the shipping default. Real gap,
and it is closable — see §1.4.

**Option B — convert all 16 to testids.**

Cost: 16 spec edits + new attributes. Only **two** are pre-authorised:
`smoke.spec.ts` 14/17/20 (§2.1, gated on final nav copy) and
`configVmix.spec.ts:50` (§1.1, already implemented via `vmix-port-warning`).
The other thirteen are not. Worse, `tally.spec.ts:40` → a testid is precisely
"changing which selector a spec uses to reach an element," forbidden outright to
the implementing agent by §3 and **not** one of the three orchestrator-authorisable
kinds in §3.1.2. It escalates to the human owner. Thirteen separate escalations
to make a translation land is not a plan, it is a queue.

There is also a correctness objection: `tally.spec.ts:40` asserting the literal
word "missing" is a *weaker* test than it looks, but converting it to
`should('have.attr','data-health','missing')` would assert an attribute the card
already carries for styling — the operator-visible word would then be untested
in any language. Option B trades copy coverage for nothing.

**Option C — English default in test builds only.**

Rejected. The tested artefact stops being the shipped artefact, which is the one
failure mode a test suite cannot detect on your behalf. `e2e/electron-smoke.spec.ts`
exists specifically because "unpackaged ≠ packaged" bit this project before.

**Chosen: A.** It costs zero spec edits, needs no escalation, and leaves every
existing assertion exactly as strong as it is today.

### 1.4 Closing the gap Option A opens

Add **one new file**, `hub/cypress/e2e/i18n.spec.ts`. Creating a spec is not
editing one, so §3 does not bite. It asserts what Option A stops covering:

- default locale with no stored preference and a `ko` browser is Korean;
- the switcher flips the UI and persists across reload;
- `document.documentElement.lang` tracks the active language;
- one Korean string is actually rendered (not a key, not English).

### 1.5 A rule gap to settle before implementing, not after

§3's boundary is written against "any spec file". `cypress/support/e2e.ts` is
not a spec file, but the change proposed in §1.3 pins the locale for **every
spec in the suite** — spec-wide effect while sitting outside the rule's letter.
That is the shape of thing §3.1 exists to catch, and I am not going to
self-authorise it by pointing at the wording.

**Escalate to the human owner before Phase 0 starts**, with the specific
question: does §3's boundary extend to `cypress/support/**` and
`src/client/setupTests.ts`? If yes, this change needs owner sign-off like any
other. If no, say so in §3 so the next agent does not have to re-litigate it.
Either answer is workable; the ambiguity is not.

---

## 2. Library choice — recommend **not** i18next

### 2.1 What the app actually needs

Counted across `src/client/**/*.tsx` (excluding specs), roughly **130
translatable string sites** in 27 files. The heaviest are `FlasherPage.tsx`
(15), `flasher/Help.tsx` (14), `config/TallySettings.tsx` (10),
`IndexPage.tsx` (9), `TallyLogPage.tsx` (8).

Requirements, exhaustively:

- key → string lookup, two languages
- interpolation (`${nrHidden} tallies hidden`, `${tally.name} · Logs`)
- exactly **two** English plural sites — `IndexPage.tsx:155` (`tally`/`tallies`)
  and `TallyLogPage.tsx:245` (`line`/`lines`). Korean has no grammatical plural.
- re-render on language change
- browser detection + persistence

Not needed: namespaces, lazy-loaded locale bundles (this is an Electron/LAN app
that must work with no internet — `smoke.spec.ts` has a skipped test asserting
exactly that), ICU message format, context/gender, date/number/currency
formatting (the one date format is hand-rolled at `TallyLogPage.tsx:48` and is
locale-neutral `HH:mm:ss.SSS`), RTL, translation-management backends.

### 2.2 The recommendation

**Use a typed module with a React context — roughly 40 lines — modelled on the
pattern already in `_tally-recovery/tallylite-web/src/i18n/`.** That directory
declares `en.ts` as the shape and `export const ko: Translations` against it.
This is the product's existing i18n pattern; it is not being invented here.

The decisive argument is not bundle size, it is the missing-key question the
brief raised. With `type Translations = typeof en` and `const ko: Translations`,
**a missing Korean key is a TypeScript compile error.** There is no missing-key
runtime behaviour to design, because a build with a missing key does not exist.
Every runtime answer available in i18next — silently fall back to English, or
show `tally.status.missing` to the operator — is worse than not shipping.

i18next's real strengths (lazy namespace loading, CLDR plural categories,
translator-facing JSON, a backend ecosystem) map onto: a bundle that must be
offline anyway, two plural sites both already solved by a ternary, one
bilingual maintainer, and no TMS. Roughly 20–25 KB gzipped (`i18next` +
`react-i18next` + `browser-languagedetector`; approximate, not measured here)
buys features this app does not use, and swaps a compile-time guarantee for a
runtime fallback.

React 19 / Vite 5 compatibility is not the deciding factor — `react-i18next` v15
supports React 19 fine. It is simply the wrong size of tool.

**What would flip this recommendation:** a third language with non-trivial
plural rules (Russian, Arabic, Polish), a non-developer translator who needs
JSON files and a TMS, or locale bundles growing past ~50 KB each such that lazy
loading pays for itself. None is on the roadmap. Revisit at the third language,
not before.

### 2.3 Shape

```
hub/src/client/i18n/
  en.ts      // the source of truth AND the type
  ko.ts      // const ko: Translations
  index.ts   // context, provider, useT(), setLanguage(), detect, persist
```

Nested objects mirroring the route structure (`nav.*`, `index.*`, `tally.*`,
`config.*`, `flasher.*`, `log.*`, `webtally.*`), matching how the recovery file
is organised. Interpolation stays a function, not a template mini-language:

```ts
// en.ts
hiddenByFilters: (n: number) => `${n} ${n === 1 ? "tally" : "tallies"} hidden by filters`,
// ko.ts
hiddenByFilters: (n: number) => `필터로 숨겨진 탈리 ${n}개`,
```

Functions in the translation object mean the two English plural sites keep the
ternary they already have, Korean drops it, and TypeScript checks the arity of
both. No plural engine.

`useT()` returns the active table; components read `t.index.hiddenByFilters(n)`.
Property access rather than a `t("index.hiddenByFilters")` string key, so a typo
is a compile error and rename-symbol works across the codebase.

---

## 3. Language selection

**Detection.** `navigator.language.startsWith('ko') ? 'ko' : 'en'` — only on
first run, when nothing is stored.

**Persistence.** `localStorage['vtally.lang']`. Not the server's
`AppConfiguration`: the hub is one process serving many clients (operator laptop
in English, a phone acting as a web tally in Korean), and a server-side language
would force them to agree. Per-browser is the correct granularity, and it is
what makes §1.3's Cypress hook possible without a test-only code path.

**Where the control lives.** In `Layout.tsx`'s nav bar, right-aligned, as a
two-state `EN / 한국어` toggle. There is no settings page, and the two candidate
homes are both wrong: `ConfigPage` is mixer configuration (a web-tally phone
never goes there), and a new settings route is a page built to hold one control.
`Layout` is on every route including `/tally/:tallyId` and `/flasher`.

`WebTallyPage` in fullscreen has no nav — acceptable, since the language is
chosen before going fullscreen and persists.

**Interaction with `smoke.spec.ts`:** that spec navigates by `cy.contains("Configuration")`
/ `"Flash"` / `"Tallies"`. Adding a nav element reading `EN` or `한국어` does not
collide with any of those substrings. Verify after implementing; do not assume.

---

## 4. What is NOT translated

| Thing | Decision | Why |
|---|---|---|
| Tally names | never | user data (`Tally.tsx:91`, and 26 spec assertions depend on it) |
| Channel names from the mixer | never | arrive over the wire from ATEM/OBS/vMix |
| `Channel ${id}` fallback label | **translate** | `ChannelSelector.tsx:35,39` — this is app copy, not mixer data |
| `(unpatched)` | **translate** | `ChannelSelector.tsx:35` — app copy |
| Mixer product names | never | ATEM, OBS Studio, vMix, Roland V-60HD/V-8HD, FeelWorld. `ko.ts` in the recovery keeps all five in Latin |
| IP addresses, ports, MAC | never | |
| `tally-settings.ini` keys/content | never | machine-readable file format |
| Log severity `data-severity` values | never | DOM attribute, asserted by `tally-logs.spec.ts` |
| Server log lines | **out of scope — see §4.1** | |

### 4.1 Server-side text: recommend out of scope, and here is the cost

Log lines reach the UI through `TallyLogPage`, and they come from **two**
sources:

1. **The hub server — 4 hardcoded strings.** `UdpTallyDriver.ts:74,80` and
   `WebTallyDriver.ts:74,92`. Two of these are asserted by
   `tally-logs.spec.ts:44,46`.
2. **The tally firmware — arbitrary strings, over the wire.**
   `tally/src/my-log.lua` → `my-tally.lua:98` sends
   `log "<name>" <severity> "<message>"` by UDP; `shared/tally/CommandParser.ts:66`
   parses it and constructs a `Log` verbatim. The hub never authors these and
   cannot know their set.

So "translate the logs" is not a 4-string job. To make the log page Korean you
would have to:

- replace the wire format's free-text `message` with a message **id + params**,
  changing `CommandParser`/`CommandCreator` and their spec files;
- version the UDP protocol, because a new hub must still read logs from
  already-flashed firmware in the field;
- translate the Lua firmware's log strings and reflash every device;
- add a server-side catalogue keyed to the wire ids.

That is a protocol change and a firmware release to translate a diagnostic view.
**Recommend: server and firmware log text stays English.** Operators read these
alongside GitHub issues and firmware source, both English. Translate the log
page's *chrome* — filter labels, `"No log entries yet."`, `"Clear filters"`,
`"↓ N new"`, `"N lines"` — and leave the log lines themselves.

Free benefit: `tally-logs.spec.ts:44,46` stop being at-risk assertions, dropping
the exposed automated count from 16 to 14.

---

## 5. Accessibility

- **`<html lang>`** — `index.html:11` hardcodes `lang="en"`. Set it at runtime
  alongside the language state (`document.documentElement.lang = lang`). Note
  the comment block above that tag concerns `data-theme` only; `lang` on the
  same element is unrelated and is not covered by it.
- **`<title>`** — `index.html:31` is `vTally Hub`, and `IndexPage.tsx:79`
  prefixes `⚠ ` onto it on hub disconnect. Translate via `useEffect`; the
  existing `/^⚠ /` strip is language-agnostic and keeps working.
- **`<noscript>`** at `index.html:35` cannot be translated at runtime. Ship both
  languages in it, Korean first.
- **`Tally.tsx:70`** builds `aria-label={`${tally.name}, ${stateWord[dataColor]}, ${health}`}`
  by concatenation in English word order. This must become one template function
  per language — Korean puts the state after a topic marker and does not comma-list
  the same way. Concatenated aria-labels are the classic silent i18n failure:
  visually correct, unusable in a screen reader.
- **`aria-label="Severity filter"` / `"Search log messages"`** (`TallyLogPage.tsx:166,175`)
  and every `title=` on `StatusPill` (`IndexPage.tsx:137,140,146`) are
  invisible copy that translation passes routinely miss. They are in scope.

---

## 6. Korean-hostile things already in the UI

Found by reading, not speculation. Each names a file and line.

1. **`uppercase` is meaningless on Hangul — 5 sites, 3 files.**
   `Tally.tsx:93` (the card's state strip), `IndexPage.tsx:63` (pill labels),
   `IndexPage.tsx:117` (`Hub disconnected`), `IndexPage.tsx:163` (`On Air`),
   `config/TallySettings.tsx`. On Korean these are no-ops, so the visual
   hierarchy that uppercase creates **silently disappears** — the text does not
   break, it just stops standing out. Replace the emphasis carrier with weight
   or size for `ko`, do not simply drop the class.

   Note `Tally.tsx:41-44` already documents that the DOM keeps lowercase
   `missing` while CSS uppercases it — that arrangement is what makes
   `tally.spec.ts:40` pass. Under Option A it keeps working untouched.

2. **`tracking-wide` alongside every one of those `uppercase` classes.**
   Letter-spacing on Hangul pulls syllable blocks apart and reads as broken
   typesetting, not emphasis. Must be `ko:`-gated off, not inherited.

3. **`ON AIR` / `on air` (`Tally.tsx:20`) should probably stay English.**
   It is control-room jargon that Korean broadcast crews use as-is; `ko.ts` in
   the recovery keeps `ON AIR` untranslated in the web-tally feature block.
   Decide deliberately — this is the highest-stakes string in the product.

4. **Korean line breaking.** `TallyLogPage.tsx:92` uses `break-words`. CSS
   default `word-break: normal` breaks Korean between any two syllables, which
   is legal but ugly. Korean prose blocks want `word-break: keep-all` plus
   `overflow-wrap: anywhere`. Applies to the paragraph copy in
   `IndexPage.tsx:118-119`, `TallyLogPage.tsx:213-222`, `FlasherPage.tsx:190-197`.

5. **No Korean webfont.** `lato-font` is a dependency and Lato has no Hangul, so
   Korean falls back to the system face (Apple SD Gothic Neo / Malgun Gothic /
   Noto Sans KR) with different metrics — vertical rhythm and cap height shift
   between languages. Either accept the shift or bundle a subset Noto Sans KR.
   Bundling costs ~1–2 MB even subsetted, on an app that must work offline;
   accepting the system font costs nothing. Recommend accepting it, and checking
   the two fixed-height rows (`h-11` nav/pill, `Tally.tsx:93` strip) still look
   right.

6. **Fixed-width containers.** The `w-[250px]` tally card
   (`Tally.tsx:75`, `TallyCreate.tsx:119`, `IndexPage.tsx:170`) is the one to
   watch: its footer row puts state and health side by side
   (`Tally.tsx:95-102`). Korean glyphs are full-width, so `연결 끊김` occupies
   roughly the same space as `disconnected` despite being a third the character
   count — likely fine, must be eyeballed. The rest
   (`max-w-[420|480|560|600|720|1100px]`) are maxima on form columns and are safe.
   `TallyLogPage.tsx:83`'s `12ch` column holds an ASCII timestamp — unaffected.

7. **Title-case English labels** — `Show Disconnected`, `Show Unpatched`
   (`IndexPage.tsx:127,130`), `Update now`, `Clear filters`. Korean has no case
   distinction, so mechanical translation flattens the button-ness out of them.
   These need written Korean, not translated Korean, and terminology must match
   `_tally-recovery/tallylite-web/src/i18n/ko.ts`: 탈리, 믹서, 허브, 채널,
   웹 탈리, 설정, 문서, 연결됨.

   **Caveat on that file:** it is the *marketing site's* vocabulary, not the
   hub's. It supplies voice and the six or so shared nouns above; it has no
   entry for `unpatched`, `missing`, `preview`, `flash`, or `patch`. Those are
   new coinages and should be decided once, written into `ko.ts`, and not
   re-invented per component.

---

## 7. Ordered plan

**Phase 0 — spec compatibility. Lands alone, before any string moves.**
0a. Escalate §1.5 (does §3 cover `cypress/support/**` and `setupTests.ts`?) and wait for the answer.
0b. Add the `window:before:load` hook to `cypress/support/e2e.ts` and the `setLanguage('en')` call to `setupTests.ts` — both no-ops until Phase 1 exists.
0c. Full Cypress + Vitest run, green, before proceeding.

**Phase 1 — infrastructure, English only.**
`i18n/en.ts`, `i18n/index.ts`, provider in `App.tsx`. No component touched, no
`ko.ts` yet. Suite must still be green — it will be, because nothing rendered
has changed.

**Phase 2 — extraction, route by route, English still the only language.**
Order by risk, lowest first: `flasher` → `config` → `tally-log` → `webtally` →
`index` → `Layout`/`Tally`/`ChannelSelector` last, since those carry 12 of the
14 remaining at-risk assertions. Each route is one commit and one green run. Any
red here is a real extraction bug, not an i18n design problem — this is the phase
that earns the split.

**Phase 3 — `ko.ts`.** Compile-checked against `en.ts`. Terminology per §6.7.
Not wired to anything yet; still English at runtime, suite still green.

**Phase 4 — switcher, `<html lang>`, aria-labels, `ko:`-gated typography (§6.1, §6.2, §6.4).**
Default still English. Manual QA in Korean by switching.

**Phase 5 — flip the default to Korean, and add `cypress/e2e/i18n.spec.ts` (§1.4).**
The one commit where the specs' locale pin matters. If Phase 0 was done right,
this commit changes one line of detection logic and adds one spec file.

Phases 1–4 are all zero-risk to the suite. The entire test exposure of this
project is Phase 0 and Phase 5.

### Spec edits this plan requires

**Zero edits to any file under `hub/cypress/e2e/`.** One new file added there
(§1.4). Two non-spec test-infrastructure files changed (§1.3), pending the §1.5
ruling. `spec-changes.md` §2.1 and §1.1's pre-authorised edits are *not* consumed
by this work and remain available.
