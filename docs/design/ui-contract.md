# vTally UI Test Contract

This document is the acceptance contract for the frontend rebuild (MUI4 → Tailwind +
shadcn/ui + Radix). The 13 non-manual Cypress specs in `hub/cypress/integration/` drive
the app exclusively through `data-testid` attributes, a handful of custom `data-*` state
attributes, and (in several specs) direct `socket.emit(...)` calls that bypass the DOM
entirely. **If every attribute below is reproduced on the same kind of DOM node with the
same computed values, the existing Cypress suite is a sufficient acceptance test for the
new UI — no spec needs to be rewritten.**

All paths below are relative to `hub/` unless stated otherwise.

## 0. Verified scale (read this first)

Prior estimate handed into this task: **~32 unique test IDs / ~123 Cypress references**.
Actual counts, verified by grepping every spec file in `cypress/integration/`:

| Scope | Unique `data-testid` patterns | Total references (`getTestId()` + raw `*[data-testid=...]`) |
|---|---|---|
| 13 non-manual specs (the redesign's actual gate) | ~90 | **524** (417 `getTestId()` + 107 raw selectors) |
| All 15 specs (incl. 2 hardware-gated manual specs) | ~90 | **599** (458 `getTestId()` + 141 raw selectors) |

**The real contract is ~2.8× more unique test IDs and ~4.3× more total references than
estimated.** Plan the migration schedule against 90 unique IDs / 524 assertions, not 32/123.
It is also more *entangled* than the estimate implied: several specs drive server state directly via
`socket.emit` rather than through the DOM (Hazard-adjacent, see §3), and 8 distinct
`data-*` state attributes carry real application logic, not decoration.

Per-file reference counts (`getTestId()` calls / raw `data-testid=` selector strings):

| Spec | getTestId() | raw selector |
|---|---|---|
| configAtem.spec.ts | 23 | 4 |
| configNull.spec.ts | 5 | 2 |
| configObs.spec.ts | 28 | 5 |
| configRolandV60HD.spec.ts | 20 | 3 |
| configRolandV8HD.spec.ts | 14 | 3 |
| configTally.spec.ts | 25 | 18 |
| configVmix.spec.ts | 29 | 4 |
| flasher.spec.ts | 1 | 0 |
| smoke.spec.ts | 7 | 0 |
| tally-logs.spec.ts | 5 | 0 |
| tally-settings.spec.ts | 141 | 28 |
| tally.spec.ts | 40 | 18 |
| webtally.spec.ts | 79 | 4 |
| **non-manual subtotal** | **417** | **107** |
| manual_atem.spec.ts (hardware-gated) | 0 | 33 |
| manual_flasher.spec.ts (hardware-gated) | 41 | 1 |

---

## 1. `data-testid` inventory

`cy.getTestId(id)` (defined in `cypress/support/commands.ts`) resolves to
`cy.get(\`*[data-testid=${id}]\`)`, optionally chained off a subject. All specs use either
this helper or the equivalent raw `*[data-testid=...]` CSS attribute selector — both are
plain attribute selectors, so **the DOM node that physically carries `data-testid` is what
matters**, not any specific element type. This is the single biggest migration risk: MUI
components generally forward unknown props like `data-testid` to their root DOM node
(sometimes an `<input>`, sometimes a `<div>`/`<span>`/`<button>`); a naive Radix/shadcn
wrapper frequently puts such props on the *outer* wrapper `<div>` even when the visually
equivalent MUI component put them on an *inner* native element. Column **Lands on** below
states the actual DOM element type today. Column **L/C** = **L**iteral string vs.
**C**omputed/template (`${...}`).

### 1.1 Config page — mixer selector & shared shell

| testid | Spec(s) | Source (file:line) | Lands on | L/C |
|---|---|---|---|---|
| `page-config` | configAtem, configNull, configObs, configRolandV60HD, configRolandV8HD, configTally, configVmix, smoke, manual_atem | `components/layout/Layout.tsx:25` (`testId="config"` from `pages/ConfigPage.tsx:16`) | `<div>` | C (`page-${cypressId}`) |
| `page-index` | tally.spec, webtally, smoke | `components/layout/Layout.tsx:25` (`pages/IndexPage.tsx:75`) | `<div>` | C |
| `page-tally-log` | tally-logs | `components/layout/Layout.tsx:25` (`pages/TallyLogPage.tsx:64`) | `<div>` | C |
| `page-tally-web` | webtally | `pages/WebTallyPage.tsx:198` (not via Layout — direct div) | `<div>` | Literal |
| `page-flasher` | flasher, smoke, manual_flasher | `components/layout/Layout.tsx:25` (`pages/FlasherPage.tsx`) | `<div>` | C |
| `page-404` | webtally | `pages/PageNotFound.tsx:7` | `<div>` | Literal |
| `mixer-select` | configAtem, configObs, configRolandV60HD, configRolandV8HD, configTally, configVmix, manual_atem | `components/config/MixerSelection.tsx:66` (`<NativeSelect>`) | wrapper `<div>` (native-select.tsx) — `data-testid` is on the wrapper, not the `<select>`; every referencing spec uses `cy.getTestId('mixer-select').select(...)`/reads via a `select` descendant, which still resolves through the wrapper | Literal |
| `mixer-connected` | manual_atem | `pages/IndexPage.tsx:84` (`<Button>`) | `<button>` | Literal |
| `hub-connected` | **none** — unreferenced by any of the 15 specs | `pages/IndexPage.tsx:81` | `<button>` | Literal |
| `toggle-disconnected` | **none** — unreferenced | `pages/IndexPage.tsx:78` | `<button>` | Literal |
| `toggle-unpatched` | **none** — unreferenced | `pages/IndexPage.tsx:79` | `<button>` | Literal |
| `tallies-connected` | tally.spec (via `data-testid=` counter pattern) | `pages/IndexPage.tsx:87` | `<button>` | Literal |

### 1.2 Per-mixer config panels (all go through `MixerSettingsWrapper` + `ValidatingInput`)

Every mixer panel (`vmix`, `atem`, `rolandV60HD`, `rolandV8HD`, `obs`, `null`, `test`, `mock`)
follows the same shape: `MixerSettingsWrapper` (`components/config/MixerSettingsWrapper.tsx`)
emits the panel-root testid and the `-submit` button; each field uses `ValidatingInput`
(`components/config/ValidatingInput.tsx:66`) which puts `data-testid` **directly on the MUI
`TextField` root**.

**⚠ Hazard H1 (critical — MUI TextField dual-attachment point):** `ValidatingInput.tsx:66`
renders `<TextField data-testid={testId} .../>`. MUI forwards this to the TextField's root
node, but several specs read the *typed value* via a **descendant** selector,
`*[data-testid=x] input` (e.g. `configAtem.spec.ts` "can save" test does
`cy.getTestId("atem-ip").find("input")` / raw `*[data-testid=atem-ip] input`). **Both
selector shapes are load-bearing**: `*[data-testid=x]` alone (existence/visibility/click
checks) and `*[data-testid=x] input` (value assertions after reload). A Radix/shadcn
`<Input>` wrapper must put `data-testid` on the same node hierarchy: the outer field
wrapper must resolve `*[data-testid=x]`, and a real `<input>` must exist beneath it as a
descendant so `*[data-testid=x] input` keeps working. Putting `data-testid` only on the
bare `<input>` (common naive shadcn pattern) breaks nothing here specifically since
`*[data-testid=x] input` would then select nothing — this must be tested explicitly.

| testid | Spec(s) | Source (file:line) | Lands on | L/C |
|---|---|---|---|---|
| `vmix` | configVmix | `MixerSettingsWrapper.tsx:46` via `mixer/vmix/react/VmixSettings.tsx` | `<div>` | Literal |
| `vmix-ip` | configVmix | `ValidatingInput.tsx:66` via VmixSettings.tsx | `<TextField>` root, value on inner `<input>` | Literal |
| `vmix-port` | configVmix | `ValidatingInput.tsx:66` via VmixSettings.tsx | `<TextField>` root / inner `<input>` | Literal |
| `vmix-submit` | configVmix | `MixerSettingsWrapper.tsx:55,57` (two conditional render branches, same testid) | `<button>` | C (`${testId}-submit`) |
| `atem` | configAtem, manual_atem | `MixerSettingsWrapper.tsx:46` via `mixer/atem/react/AtemSettings.tsx` | `<div>` | Literal |
| `atem-ip` | configAtem, manual_atem | `ValidatingInput.tsx:66` via AtemSettings.tsx | `<TextField>` root / inner `<input>` | Literal |
| `atem-port` | configAtem, manual_atem | `ValidatingInput.tsx:66` via AtemSettings.tsx | `<TextField>` root / inner `<input>` | Literal |
| `atem-submit` | configAtem, manual_atem | `MixerSettingsWrapper.tsx:55,57` | `<button>` | C |
| `rolandV60HD` | configRolandV60HD | `mixer/rolandV60HD/react/RolandV60HDSettings.tsx` | `<div>` | Literal |
| `rolandV60HD-ip` | configRolandV60HD | `ValidatingInput.tsx:66` | `<TextField>` / `<input>` | Literal |
| `rolandV60HD-requestInterval` | configRolandV60HD | `ValidatingInput.tsx:66` | `<TextField>` / `<input>` | Literal (accepts comma or dot decimal — locale logic in `ValidatingInput`, not styling) |
| `rolandV60HD-submit` | configRolandV60HD | `MixerSettingsWrapper.tsx:55,57` | `<button>` | C |
| `rolandV8HD` | configRolandV8HD | `mixer/rolandV8HD/react/RolandV8HDSettings.tsx` | `<div>` | Literal |
| `rolandV8HD-request-interval` | configRolandV8HD | `ValidatingInput.tsx:66` | `<TextField>` / `<input>` | Literal — **⚠ Hazard H7**: hyphenated, inconsistent with V60HD's camelCase `rolandV60HD-requestInterval` for the semantically identical field. Preserve exactly as-is (don't "fix" the inconsistency, it would silently break the spec). |
| `rolandV8HD-submit` | configRolandV8HD | `MixerSettingsWrapper.tsx:55,57` | `<button>` | C |
| `obs` | configObs | `mixer/obs/react/ObsSettings.tsx` | `<div>` | Literal |
| `obs-ip` | configObs | `ValidatingInput.tsx:66` | `<TextField>` / `<input>` | Literal |
| `obs-port` | configObs | `ValidatingInput.tsx:66` | `<TextField>` / `<input>` | Literal |
| `obs-liveMode` | configObs | `mixer/obs/react/ObsLiveModeSelect.tsx:51` (`<TextField select>`) | MUI `TextField` w/ `select` prop → renders a native `<select>` internally (not `NativeSelect`) | Literal. Values: `record`/`always`/`stream`. Reload check via `*[data-testid=obs-liveMode] select :selected`. |
| `obs-submit` | configObs | `MixerSettingsWrapper.tsx:55,57` | `<button>` | C |
| `null` | configNull, manual_atem | `mixer/null/react/NullSettings.tsx` | `<div>` | Literal |
| `null-submit` | configNull, manual_atem | `MixerSettingsWrapper.tsx:55,57` | `<button>` | C |
| `test` | (not directly asserted in read specs; used internally by `TestConfiguration`) | `mixer/test/react/TestSettings.tsx` | `<div>` | Literal |
| `test-submit` | configTally (drives Test mixer state for tally.spec-adjacent scenarios) | `MixerSettingsWrapper.tsx:55,57` | `<button>` | C |
| `mock`, `mock-tick`, `mock-channelCount`, `mock-channelNames` | **none** — unreferenced by any of the 13/15 specs, dev-only mixer | `mixer/mock/react/MockSettings.tsx` | mixed | Literal |

### 1.3 Tally Defaults panel (config page) — `components/config/TallySettings.tsx`

| testid | Spec(s) | Source (file:line) | Lands on | L/C |
|---|---|---|---|---|
| `tally-defaults` | configTally | `components/config/TallySettings.tsx:61` (`<MiniPage>`) | `<div>`/`<Container>` | Literal |
| `tally-defaults-ob` | configTally | `components/config/TallySettings.tsx:66` (`BrightnessSlider`, operator brightness) | MUI `Slider` root (non-native, see Hazard H2) | Literal |
| `tally-defaults-sb` | configTally | `components/config/TallySettings.tsx:99` (`BrightnessSlider`, stage brightness) | MUI `Slider` root | Literal |
| `tally-defaults-oc` | configTally | `components/config/TallySettings.tsx:76` (`ColorSchemeSelector`) | `<div>` (also carries `data-value`, see §2) | Literal |
| `tally-defaults-oc-default` / `-yellow-pink` | configTally | `ColorSchemeSelector.tsx:84-85` (per-option `ChipLikeButton`) | MUI `Button` root (`<button>`) | C (`${testId}-${scheme.id}`) |
| `tally-defaults-sc` | configTally | `components/config/TallySettings.tsx:107` (`ColorSchemeSelector`) | `<div>` | Literal |
| `tally-defaults-sc-default` / `-yellow-pink` | configTally | `ColorSchemeSelector.tsx:84-85` | `<button>` | C |
| `tally-defaults-oi` | configTally | `components/config/TallySettings.tsx:86` (`<Checkbox>`) | MUI `Checkbox` root (`<span>` wrapping a real `<input type=checkbox>`) | Literal (also carries `data-value`, see §2) |
| `tally-defaults-sp` | configTally | `components/config/TallySettings.tsx:117` (`<Checkbox>`) | MUI `Checkbox` root | Literal |
| `tally-defaults-submit` | configTally | `components/config/TallySettings.tsx:128` | `<button>` | Literal |

### 1.4 Per-tally settings dialog — `src/components/TallySettings.tsx` (distinct file from §1.3 despite identical class name)

**⚠ H6 — RETRACTED, corrected below.** An earlier pass through this file claimed every
field group in this dialog (`ob`, `sb`, `oc`, `sc`, `oi`, `sp`) emitted the same literal
testid on two DOM nodes ("wrapper + inner control"). **That claim was investigated and
disproven** on a full re-read of `TallySettingsField.tsx`, `BrightnessSlider.tsx`,
`ColorSchemeSelector.tsx`, and `ChipLikeButton.tsx`, confirmed by an exhaustive grep of
every literal occurrence of all six testid strings in `TallySettings.tsx`. The testid
string does appear twice **in source** for each field — once as a `testId={...}` React
prop passed to `TallySettingsField`, once as a `testId={...}` prop passed to the inner
control (or `data-testid={...}` directly on a `Checkbox`) — but `TallySettingsField`
**never renders `data-testid={testId}` on anything of its own**; it only derives
`${testId}-toggle` for its inner `ChipLikeButton`. So the literal testid string reaches
the DOM on **exactly one node per field**, not two. Full evidence and the corrected
recommendation live in `docs/design/spec-changes.md` §4 — read that section before
touching this dialog. Do not re-derive this from scratch; it was already chased down once.

| testid | Spec(s) | Source (file:line) | Lands on | L/C |
|---|---|---|---|---|
| `tally-settings` (dialog root) | tally-settings, webtally | `components/TallySettings.tsx:104` (`<Dialog>`) | `<div>` (MUI Dialog paper) | Literal |
| `tally-settings-ob` | tally-settings, webtally (existence-only) | `components/TallySettings.tsx:119` (`BrightnessSlider`'s `Slider` root; `:115`'s `testId` prop on `TallySettingsField` does not itself render a `data-testid`) | `Slider` root | Literal |
| `tally-settings-ob-toggle` | tally-settings, webtally (in a `.skip`ped test) | `components/TallySettingsField.tsx:30` (`ChipLikeButton`) | `<button>` | C (`${testId}-toggle`) |
| `tally-settings-sb` | tally-settings, webtally | `components/TallySettings.tsx:171` (`Slider` root; `:167`'s prop on `TallySettingsField` is not independently rendered) | `Slider` root | Literal |
| `tally-settings-sb-toggle` | tally-settings | `TallySettingsField.tsx:30` | `<button>` | C |
| `tally-settings-oc` | tally-settings, webtally | `components/TallySettings.tsx:135` (`ColorSchemeSelector` root div; `:131`'s prop on `TallySettingsField` is not independently rendered) | `ColorSchemeSelector` div | Literal |
| `tally-settings-oc-toggle` | tally-settings | `TallySettingsField.tsx:30` | `<button>` | C |
| `tally-settings-oc-default` / `-yellow-pink` | tally-settings | `ColorSchemeSelector.tsx:84-85` | `<button>` | C |
| `tally-settings-sc` | tally-settings, webtally | `components/TallySettings.tsx:185` (`ColorSchemeSelector` root div; `:181`'s prop on `TallySettingsField` is not independently rendered) | `ColorSchemeSelector` div | Literal |
| `tally-settings-sc-toggle` | tally-settings | `TallySettingsField.tsx:30` | `<button>` | C |
| `tally-settings-sc-default` / `-yellow-pink` | tally-settings | `ColorSchemeSelector.tsx:84-85` | `<button>` | C |
| `tally-settings-oi` | tally-settings | `components/TallySettings.tsx:151` (`Checkbox` root; `:145`'s prop on `TallySettingsField` is not independently rendered) | `Checkbox` root | Literal |
| `tally-settings-oi-toggle` | tally-settings | `TallySettingsField.tsx:30` | `<button>` | C |
| `tally-settings-sp` | tally-settings | `components/TallySettings.tsx:201` (`Checkbox` root; `:195`'s prop on `TallySettingsField` is not independently rendered) | `Checkbox` root | Literal |
| `tally-settings-sp-toggle` | tally-settings | `TallySettingsField.tsx:30` | `<button>` | C |
| `tally-settings-submit` | tally-settings | (form submit button, dialog) | `<button>` | Literal |

### 1.5 Tally list / index page — `src/components/Tally.tsx`, `src/components/TallyMenu.tsx`, `src/components/ChannelSelector.tsx`

| testid | Spec(s) | Source (file:line) | Lands on | L/C |
|---|---|---|---|---|
| `tally-${name}` | tally.spec, webtally, tally-logs, manual_atem | `components/Tally.tsx:118` (MUI `Paper`) | `<div>` (Paper default root) | C. Also carries `data-color`/`data-isactive`, see §2. |
| `channel-selector` | tally.spec, manual_atem | `components/ChannelSelector.tsx:37` (`<Select native>`) | `<select>` (native, MUI `native` prop mode) | Literal. Options: first is literal `<option value="">(unpatched)</option>`, then mapped channels, plus a synthetic fallback option for a stale/unknown channel id. |
| `tally-${name}-menu` | tally-logs, webtally | `components/TallyMenu.tsx:74` | `<div>` (menu-trigger wrapper; the inner `IconButton` itself has no testid) | C |
| `tally-${name}-web` | webtally | `TallyMenu.tsx:86` (`MenuItemLink` → `MenuItem` w/ `component={renderLink}`) | `<a>`/`<li>` (router-link MenuItem) | C. Only rendered when `tally.isWebTally()`. |
| `tally-${name}-logs` | tally-logs | `TallyMenu.tsx:96` (`MenuItemLink`) | `<a>`/`<li>` | C |
| `tally-${name}-settings` | **none** — unreferenced by any spec | `TallyMenu.tsx:91` (plain `MenuItem`) | `<li>` | C |
| `tally-${name}-highlight` | **none directly** — highlight behavior tested via `socket.emit` instead | `TallyMenu.tsx:100` — **⚠ placed on MUI `<Tooltip>`**, whose default behavior is to clone its child and attach listeners rather than render its own DOM node; whether `data-testid` actually lands in the DOM here is untested by any spec (not exercised). Treat as unverified/needs-check if kept as-is. | uncertain | C |
| `tally-${name}-remove` | **none directly**, same caveat | `TallyMenu.tsx:106` | uncertain (same Tooltip concern) | C |

### 1.6 Web-tally creation & page — `src/components/TallyCreate.tsx`, `src/pages/WebTallyPage.tsx`

| testid | Spec(s) | Source (file:line) | Lands on | L/C |
|---|---|---|---|---|
| `tally-create` | webtally | `TallyCreate.tsx:110` (trigger button on index page) | `<button>` | Literal (template literal wrapping a static string) |
| `tally-create-popup` | webtally | `TallyCreate.tsx:70` (`<Dialog>`) | `<div>` (Dialog paper) | Literal |
| `tally-create-name` | webtally | `TallyCreate.tsx:84` (`<TextField>`) | `<TextField>` / inner `<input>` | Literal |
| `tally-create-cancel` | webtally | `TallyCreate.tsx:94` | `<button>` | Literal |
| `tally-create-ok` | webtally | `TallyCreate.tsx:96` (disabled while `errorMessage` truthy) | `<button>` | Literal |
| `tally-create-warning` | webtally | `TallyCreate.tsx:74` (MUI `<Alert severity="warning">`) — **⚠ Hazard H8**: this `severity="warning"` is MUI Alert's own unrelated prop (icon/color), not the app's `data-severity` state attribute (§2.4). Do not conflate when rebuilding — the two "severity" concepts are coincidentally named. | `<div>` (Alert root) | Literal |
| `tally-settings-link` | webtally | `pages/WebTallyPage.tsx:203` (`<IconButton>`, opens `TallySettings` dialog) | `<button>` | Literal |
| `page-tally-web` | webtally | see §1.1 | `<div>` | Literal |

### 1.7 Log page — `src/pages/TallyLogPage.tsx`

| testid | Spec(s) | Source (file:line) | Lands on | L/C |
|---|---|---|---|---|
| `page-tally-log` | tally-logs | see §1.1 | `<div>` | C |
| `log-line-${idx}` | **not queried by testid in any spec** — `tally-logs.spec.ts` instead asserts via `cy.contains('*[data-severity=info]', "Hello World")` (attribute+text-content combo) | `TallyLogPage.tsx:50` | `<div>` | C. Also carries `data-severity`, see §2.4. |

### 1.8 Flasher — `src/components/flasher/StepDisplay.tsx`, `src/components/EditSettingsIni.tsx`

| testid | Spec(s) | Source (file:line) | Lands on | L/C |
|---|---|---|---|---|
| `update-software` | flasher, manual_flasher | (FlasherPage panel) | `<div>` | Literal |
| `update-software-now` | manual_flasher | (button) | `<button>` | Literal |
| `progress` | manual_flasher | (progress dialog root) | `<div>` | Literal |
| `progress-close` | manual_flasher | (dialog close button) | `<button>` | Literal |
| `progress-step-initialize`/`-connection`/`-upload`/`-reboot`/`-done` | manual_flasher | `flasher/StepDisplay.tsx:72-76` (`<Step>`) | MUI `Step` root | C (`progress-step-${step.id}`). Also carries `data-done`, see §2.5. |
| `tally-settings` (flasher context) | manual_flasher | `EditSettingsIni.tsx` container | `<div>` | Literal |
| `tally-settings-expert` | manual_flasher | `EditSettingsIni.tsx:47` (`<FormControlLabel>` wrapping a `<Switch>`) | MUI `FormControlLabel` root, **not** the inner `Switch`/`<input type=checkbox>` | Literal. Also carries `data-expertmode`, see §2.6. |
| `tally-settings-all` | manual_flasher | `EditSettingsIni.tsx:67` (`<TextField multiline>`, only when expert mode) | `<TextField>` / inner `<textarea>` | Literal |
| `tally-settings-name`/`-ssid`/`-password`/`-ip`/`-port` | manual_flasher | `EditSettingsIni.tsx:75,82,89,96,103` (only when NOT expert mode) | `<TextField>` / inner `<input>` | Literal |
| `tally-settings-submit` | manual_flasher | `EditSettingsIni.tsx:114` | `<button>` | Literal |

**⚠ Hazard H9:** `EditSettingsIni.tsx` renders two mutually-exclusive representations of the
same domain object (`TallySettingsIni`) — an "expert" raw-textarea mode and a "simple"
per-field mode — that must stay synchronized (`manual_flasher.spec.ts` explicitly types
into simple fields, switches to expert, and asserts the textarea reflects `tally.name=...`).
This cross-mode sync logic must be preserved exactly, not just the DOM shape.

---

## 2. State attribute inventory

These are **not decoration** — several encode literal application/protocol logic
(color computation, brightness math, severity ranking) that must be reproduced exactly.

### 2.1 `data-color`

Two independent computations exist for two different views:

- **`components/Tally.tsx:94-115`** (tally list row, on the same `<Paper>` as `data-testid`):
  starts `"idle"`; → `"unpatched"` if `!tally.isPatched()`; else → `"program"` if
  `programs && tally.isIn(programs)`; else → `"preview"` if `previews && tally.isIn(previews)`;
  else falls through to `"idle"` (patched but in neither list). **Values: `unpatched` |
  `program` | `preview` | `idle`.** Asserted by: `tally.spec.ts`, `manual_atem.spec.ts`.
- **`pages/WebTallyPage.tsx:148-182`** (full-screen web tally view) — if/else on a
  `StateCommand` value: `isLoading` → `"loading"`; `command==="highlight"` → `"highlight"`;
  `command==="on-air"` → `"program"`; `command==="preview"` → `"preview"`;
  `command==="release"` → `"idle"`; `command==="unknown"` → `"unknown"`; else → **TypeScript
  exhaustiveness guard** `((a: never) => {})(command)` at line 181 — a compile-time-only
  safety net, not a runtime branch; **preserve this pattern** (or an equivalent) so a future
  new `StateCommand` variant fails the build instead of silently rendering nothing.
  **Values: `loading` | `highlight` | `program` | `preview` | `idle` | `unknown`.**
  Asserted by: `webtally.spec.ts`. Note: `"loading"` is not directly asserted by any spec —
  present in source, untested value, flag as a coverage gap to preserve carefully anyway.

### 2.2 `data-isactive`

`components/Tally.tsx:106-115`. Boolean, independent axis from `data-color` (e.g. a
disconnected-but-unpatched tally can be `data-isactive="false"` with any `data-color`
value). `false` by default; `true` if `tally.isActive()`. **Values: `true` | `false`.**
Asserted by: `tally.spec.ts`.

### 2.3 `data-value`

Four distinct source sites, all boolean-or-string current-selection state:

| Location | Value type | Source |
|---|---|---|
| `ColorSchemeSelector.tsx:78` (selector root `<div>`) | color-scheme id string, e.g. `"default"` / `"yellow-pink"` | current `value` prop |
| `ColorSchemeSelector.tsx:86` (each per-option `ChipLikeButton`) | same as above — **the parent's current value**, not the option's own id | current `value` prop, repeated per option |
| `components/config/TallySettings.tsx:87` (`tally-defaults-oi` Checkbox) | boolean `operatorShowsIdle` | local state |
| `components/config/TallySettings.tsx:118` (`tally-defaults-sp` Checkbox) | boolean `stageShowsPreview` | local state |
| `components/TallySettings.tsx:152` (`tally-settings-oi` Checkbox) | boolean, `isOiDefault ? defaultSettings.getOperatorShowsIdle() : oi` | ternary on "use default" toggle |
| `components/TallySettings.tsx:202` (`tally-settings-sp` Checkbox) | boolean, `isSpDefault ? defaultSettings.getStageShowsPreview() : sp` | ternary on "use default" toggle |

Asserted by: `configTally.spec.ts` (`tally-defaults-oc`/`-sc` → `data-value` `default`/
`yellow-pink`; `tally-defaults-sp`/`-oi` → `data-value` `true`/`false`).

### 2.4 `data-severity`

`pages/TallyLogPage.tsx:50`. **Priority-ordered ternary chain** (order matters — a log
that is somehow both warning and error reports `warning`, since it's checked first):
`log.isWarning() ? "warning" : (log.isError() ? "error" : (log.isStatus() ? "status" :
"info"))`. **Values: `warning` | `error` | `status` | `info`.** Asserted by:
`tally-logs.spec.ts` via `cy.contains('*[data-severity=info]', "Hello World")` — combined
attribute + text-content selector.

### 2.5 `data-done`

`flasher/StepDisplay.tsx:76`. Direct boolean: `step.done ? "true" : "false"`. Drives the
MUI `Stepper`'s `activeStep` via `Math.max(steps.findIndex(s => s.done === false), 0)`
(line 69) — same underlying `done` flag feeds both the visual current-step indicator and
this attribute. **Values: `true` | `false`.** Asserted by: `manual_flasher.spec.ts` (per
step, with extended timeouts up to 60000ms for the upload step).

### 2.6 `data-expertmode`

`components/EditSettingsIni.tsx:49`. Direct boolean toggle state, `expertMode ? "true" :
"false"`, on the outer `FormControlLabel` (not the inner `Switch`). **Values: `true` |
`false`.** Asserted by: `manual_flasher.spec.ts` (`cy.getTestId("tally-settings-expert").
should("have.attr","data-expertmode","false").click()` — clicks the outer labeled node
directly, not the inner switch input).

### 2.7 `data-selected`

`components/ChipLikeButton.tsx:52`. Direct boolean prop spread onto the underlying MUI
`Button` root: `data-selected={props.selected}`. Generic reusable component, consumed by:
`components/TallySettingsField.tsx:30` (`selected={isDefault}` → renders "default"/"custom"
text) and `components/config/ColorSchemeSelector.tsx:87` (`selected={isSelected}` on each
color-scheme option). **Values: `true` | `false`.** Asserted by: `tally-settings.spec.ts`
(all 6 `-toggle` fields), `webtally.spec.ts` (`tally-settings-ob-toggle`, in a `.skip`ped
test — pattern exists but not currently gating the suite).

### 2.8 `data-brightness`

`pages/WebTallyPage.tsx:184-186`. Exact formula: `(tally?.configuration?.
getOperatorLightBrightness() || defaultTallyConfiguration?.getOperatorLightBrightness() ||
100) / 100` — this **raw fraction** (0–1) is what's exposed in the attribute. It is then
*separately* used to compute the actual background color via `darken(bgColor, 1 -
brightness)` (MUI's `darken()` utility — real color-computation logic that must be
reimplemented with an equivalent color utility for the redesign, not the same value as
the attribute itself). **Values: numeric string, e.g. `"1"` / `"0.75"` / `"0.25"`.**
Asserted by: `webtally.spec.ts` (default brightness, operator-config brightness,
per-tally-override brightness — three distinct precedence levels in the formula above,
all separately tested).

---

## 3. Per-spec summary (13 non-manual specs)

- **`configAtem.spec.ts`** (`/config`, mixer=atem) — validates IP/port format
  enable/disable of the submit button, saves, and reloads to confirm the saved IP/port
  persisted (via `*[data-testid=atem-ip] input`/`atem-port input`). No socket/task usage.
- **`configNull.spec.ts`** (`/config`, mixer=null) — the simplest panel: select null
  mixer, submit, done. No socket/task usage.
- **`configObs.spec.ts`** (`/config`, mixer=obs) — IP/port validation plus the
  `obs-liveMode` native `<select>` (record/always/stream), reload persistence check on
  all three fields. No socket/task usage.
- **`configRolandV60HD.spec.ts`** (`/config`, mixer=rolandV60HD) — IP + request-interval
  validation, accepting either comma or dot as decimal separator. No socket/task usage.
- **`configRolandV8HD.spec.ts`** (`/config`, mixer=rolandV8HD) — same shape as V60HD but
  with the inconsistently-hyphenated `rolandV8HD-request-interval` testid (H7). No
  socket/task usage.
- **`configTally.spec.ts`** (`/config`, Tally Defaults panel) — **imports `socket` from
  `src/hooks/useSocket` and emits `socket.emit('config.change.tallyconfig', ...)`
  directly**, bypassing the UI to seed/verify server-side default tally configuration.
  Also imports `DefaultTallyConfiguration` from `src/tally/TallyConfiguration` and
  `setSliderValue`/`validateSliderValue` from `../browserlib/sliderTestTool` (a
  spec-local helper for driving MUI `Slider` via mouse events, not a `cy.task` plugin).
  Exercises both brightness sliders, both color schemes (`data-value` assertions), both
  boolean checkboxes (`data-value` assertions), and submit.
- **`configVmix.spec.ts`** (`/config`, mixer=vmix) — IP/port validation. **Hazard**: asserts
  presence/absence of a `p.MuiFormHelperText-root` warning about port 8080/8088
  potentially conflicting with vMix's own web UI port — a raw MUI class-name dependency
  (see H3). No socket/task usage.
- **`flasher.spec.ts`** (`/flasher`) — minimal: checks `page-flasher` loads and body text
  contains "Did not find any connected device"; the actual flashing flow is
  `it.skip("TODO")`. No socket/task usage.
- **`smoke.spec.ts`** (`/`, `/config`, `/flasher`) — top-level navigation smoke test.
  **Hazard**: navigates via `cy.contains("Configuration").click()` /
  `cy.contains("Flash").click()` / `cy.contains("Tallies").click()` — pure text-content
  dependence, not testid-based (see H4). No socket/task usage.
- **`tally-logs.spec.ts`** (`/tally/:id/log`) — imports `randomTallyName` helper. Uses
  `cy.task('tally', name)`, `cy.task('tallyLog', {name, message, severity})`,
  `cy.task('tallyCleanup')`, `cy.task('tallyDisconnect', name)` (all from
  `cypress/plugins/tally.ts`, backed by `MockUdpTally`). Asserts `data-severity` combined
  with log text via `cy.contains('*[data-severity=info]', "Hello World")`.
- **`tally-settings.spec.ts`** (per-tally settings dialog, largest spec at 464 lines) —
  imports socket, `DefaultTallyConfiguration`/`TallyConfiguration`,
  `setSliderValue`/`validateSliderValue`, `randomTallyName`. Exercises every field in the
  dialog (§1.4) including all six `-toggle` `data-selected` states. **Nested `context(
  "correctly implements settings into udp commands")`** uses `cy.task("mixerProgPrev",
  {programs, previews})` (from `cypress/plugins/mixer.ts`, itself a server-side
  `socket.emit('config.change.test', ...)`) plus `cy.task('tallyLastCommand', name)` (from
  `cypress/plugins/tally.ts`) to assert **literal UDP protocol byte strings** like
  `"O255/000/000 S255/000/000"` — this spec validates wire-protocol output, not just DOM
  state, and has zero tolerance for behavior drift in the settings→UDP-command pipeline.
- **`tally.spec.ts`** (`/`) — imports `TestConfiguration` from
  `src/mixer/test/test/TestConfiguration` and `socket` directly. Covers connect/disconnect/
  remove counting (`tallies-connected`), patch/unpatch via the `channel-selector` native
  `<select>` and via direct `socket.emit('tally.patch', ...)`, patch/unpatch while
  disconnected, and mixer-driven `data-color` changes via `socket.emit('config.change.
  test', ...)`. Several `it.skip` placeholders exist (highlight, remove, web+udp
  same-name collision, stale channel display, defaults-update propagation) — these are
  **not currently gating** the redesign but describe intended-but-unimplemented behavior.
- **`webtally.spec.ts`** (`/`, `/tally/web-:name`, `/tally/udp-:name`, largest
  non-tally-settings spec at 306 lines) — imports socket, `TestConfiguration`,
  `DefaultTallyConfiguration`/`TallyConfiguration`, `randomTallyName`. Covers: web-tally
  creation (patched/unpatched), name validation (empty/too-long/duplicate), the
  "warning shown only when no UDP tally exists" logic (H8-adjacent), UDP+Web tally
  name-coexistence, deep-linking, "UDP tally can't be used as a web URL" → `page-404`,
  connection status via `events.webTally.subscribe/unsubscribe`, `data-color` changes via
  both mixer patch and direct `tally.patch`, highlight command, disconnected-mixer
  `"unknown"` state, and all three `data-brightness` precedence levels. Contains a
  detailed `.skip`ped test for "should not reset settings when mixer state changes" with
  an explicitly-justified (`eslint-disable` commented) `cy.wait(500)` — a legitimate
  wait-for-negative-assertion pattern, not flakiness, currently inert since skipped.

**Manual/hardware-gated specs (excluded from the 13, noted for completeness):**
`manual_atem.spec.ts` requires a real ATEM (`Cypress.env('atem_ip'/'atem_port')`), uses
raw `*[data-testid=...]` selectors exclusively (0 `getTestId()` calls), and exercises
`cy.task('atemConnect'/'atemDisconnect'/'atemProgram'/'atemPreview'/'atemChannelName', ...)`
(`cypress/plugins/atem.ts`, wrapping the `atem-connection` npm package) plus manual
`cy.pause()` steps for physically unplugging the mixer. `manual_flasher.spec.ts` requires
a real unflashed Tally Light over USB, drives the flasher/settings flow almost entirely via
`getTestId()` (41 calls), and is the sole spec exercising `data-done`/`data-expertmode`.

---

## 4. Hazard list (redesign-unrelated breakage risks)

| # | Hazard | Where | Why it matters |
|---|---|---|---|
| H1 | MUI TextField dual DOM-attachment point | `ValidatingInput.tsx:66`; every config field | See §1.2. Both `*[data-testid=x]` and `*[data-testid=x] input` selectors are used across specs and must both resolve. |
| H2 | **RETRACTED** — Non-native Slider root, helper assumed to need a rewrite | `BrightnessSlider.tsx:47` (MUI `Slider`, not `<input type=range>`); plan doc proposes Radix `Slider` replacement, which is also a non-native root — re-verify attachment point after migration, don't assume parity. | Previously claimed `setSliderValue`/`validateSliderValue` (`cypress/browserlib/sliderTestTool`) drive the slider via mouse/drag events against MUI's internal geometry and would need updating for Radix. **Investigated and disproven**: the helper dispatches `keydown` (End/PageDown/ArrowLeft) at `*[role=slider]` and reads `aria-valuenow` — no mouse events, no geometry. Radix `Slider` supports the same keys and exposes the same attribute on its thumb, so this helper needs no changes. Left in this table (rather than deleted) so nobody re-derives the same wrong finding later. |
| H3a | Raw MUI class-name **spec** dependency (blocking) | `configVmix.spec.ts:45,50` asserts on `p.MuiFormHelperText-root` | Confirmed the **only** raw-`.Mui*`-class assertion in the entire spec suite (repo-wide grep of every `.spec.ts`, manual specs included). This class name has zero meaning outside MUI and will never match post-migration. This is a real spec-blocker with a pre-authorised fix — see `docs/design/spec-changes.md` §1.1 for the exact replacement assertion and the new `data-testid="vmix-port-warning"` attribute it requires. |
| H3b | Raw MUI class-name **styling** dependency (non-blocking, restyle only) | `flasher/StepDisplay.tsx:18-28` styles `& .MuiStepConnector-root`/`& .MuiStepConnector-line` directly by MUI's internal class names | **Not a spec dependency** — confirmed no Cypress spec anywhere queries or asserts against `.MuiStepConnector-*`. This is purely the vertical Stepper's own restyling concern: it has no shadcn/Radix equivalent (no "Stepper" primitive), so it's likely a from-scratch component per the plan doc and must independently re-derive connector-line styling — but it does **not** require touching any spec file. Do not treat this the same as H3a; only H3a forces a pre-authorised spec edit. |
| H4 | Text-content dependence for navigation | `smoke.spec.ts`: `cy.contains("Configuration")`, `cy.contains("Flash")`, `cy.contains("Tallies")` | Any copy rewording during the redesign (very likely, given "new visual design") breaks `smoke.spec.ts` even if every `data-testid`/state attribute is perfectly preserved. This is the one spec that is **not** purely testid/state-driven. |
| H5 | `cy.wait` timing dependence | `webtally.spec.ts`'s `cy.wait(500)` in the `.skip`ped "should not reset settings" test | Currently inert (test is skipped), but if that test is ever un-skipped as part of hardening the suite post-redesign, the explicit wait is a known flake-risk pattern to watch, not remove blindly (it's justified for a negative assertion). |
| H6 | **RETRACTED** — "duplicate testid per field" in the per-tally settings dialog | `components/TallySettings.tsx` — see corrected §1.4 | Previously claimed the same literal testid appeared twice (wrapper + inner control) for all 6 field groups (ob/sb/oc/sc/oi/sp), requiring a preserve-vs-clean-up decision and `.first()`/`.eq()` disambiguation. **Investigated and disproven**: `TallySettingsField` never renders `data-testid={testId}` on its own wrapper — only a derived `${testId}-toggle` on its inner button. Each field's literal testid reaches the DOM on exactly one node. No duplication exists, no `cy.get` resolution-target risk exists, and no spec or component change is needed on this point. See `docs/design/spec-changes.md` §4 for the line-by-line evidence. Left in this table (rather than deleted) so nobody re-derives the same wrong finding later. |
| H7 | Inconsistent testid casing convention | `rolandV60HD-requestInterval` (camelCase) vs. `rolandV8HD-request-interval` (hyphenated) for the semantically identical field across two sibling mixer panels | Looks like a bug/inconsistency worth "fixing," but doing so breaks one of the two specs. Preserve both exactly as-is. |
| H8 | Naming collision: MUI `severity` prop vs. app `data-severity` attribute | `TallyCreate.tsx:74` `<Alert severity="warning">` (MUI's own prop, unrelated) vs. `TallyLogPage.tsx:50` `data-severity` (app state, §2.4) | Purely a naming coincidence but easy to conflate when re-implementing either component — verify each independently against its own spec assertions. |
| H9 | Cross-mode data sync (expert vs. simple settings-ini editor) | `EditSettingsIni.tsx` — see §1.8 | `manual_flasher.spec.ts` explicitly round-trips data between the two representations; this is business logic, not styling, and must be preserved even though it's gated behind a manual/hardware spec (lower priority for the *automated* rollout, but still part of the full contract). |
| H10 | Untested/coverage-gap testids | `toggle-disconnected`, `toggle-unpatched`, `hub-connected` (`IndexPage.tsx`), `tally-${name}-settings` (`TallyMenu.tsx`), `tally-${name}-highlight`/`-remove` (Tooltip-attachment uncertainty, `TallyMenu.tsx:100,106`), `mock`/`mock-*` (dev-only mixer), `data-color="loading"` (WebTallyPage, no spec asserts it directly) | None of these are enforced by the current Cypress suite, so the redesign is technically free to alter them without breaking a spec — but silently dropping them is still a functional regression if any non-Cypress consumer (manual QA, future spec) depends on them. Call this out explicitly rather than omitting silently. |
| H11 | FormDialog triple-testid-per-instance (confirmed — caller located) | `components/layout/FormDialog.tsx:26,35,56,57` — required prop `props["data-testid"]`, spread onto `<Dialog {...props}>` (base testid) plus internally generated `${testId}-close` and `${testId}-submit`; confirmed caller `TallySettings.tsx:103` (`<FormDialog data-testid="tally-settings" ...>`, see §1.4) | Live, not dead code. `<Dialog {...props}>` receives the bare `data-testid` via prop spread (real, distinct from the H6 pattern — this genuinely is one `testId` value producing three separate DOM nodes: dialog root + `-close` + `-submit`), which is correct/intended, not a bug — just note it when re-implementing `FormDialog` so all three survive. |

---

## 5. Machine-checkable contract spec proposal — `data-contract.spec.ts`

Goal: fail in **seconds**, with a **precise message naming the missing testid/attribute
and the component that should own it**, instead of waiting ~4 minutes for a full Cypress
run to discover a DOM-attachment regression. This is a React Testing Library-style unit
test (no Cypress browser, no server, no sockets) that renders each contract-bearing
component in isolation with fixed props and asserts presence + placement of every
`data-testid`/`data-*` attribute from §1–§2. It is deliberately narrow — it does not
assert application *behavior* (that's still Cypress's job), only that the DOM contract
surface exists on the expected node shape.

```ts
// hub/src/__tests__/data-contract.spec.ts
//
// Fast DOM-contract check for the vTally UI test contract (docs/design/ui-contract.md).
// Run with `npm test` (Jest + React Testing Library). No Cypress, no server, no sockets.
// Intent: catch "testid landed on the wrong DOM node after a Radix/shadcn rewrite"
// in milliseconds, with an assertion message that names the exact hazard, instead of
// discovering it via an opaque Cypress timeout after ~4 minutes.

import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

// --- Example: Hazard H1 — ValidatingInput must keep BOTH attachment points ---
import ValidatingInput from "../components/config/ValidatingInput"

describe("data-contract: ValidatingInput (H1 — MUI TextField dual attachment)", () => {
  it("puts data-testid on the field root AND exposes a descendant <input>", () => {
    render(
      <ValidatingInput
        testId="atem-ip"
        label="IP"
        value="10.0.0.1"
        object={{ clone: () => ({ setIp: () => {} }) }}
        setterName="setIp"
        onChange={() => {}}
      />
    )

    // Selector shape #1, used by most specs for existence/visibility/click.
    const root = document.querySelector('*[data-testid="atem-ip"]')
    expect(root, "no node carries data-testid=atem-ip at all").not.toBeNull()

    // Selector shape #2, used by configAtem.spec.ts's reload-persistence check:
    // `*[data-testid=atem-ip] input`. This is the one a naive shadcn <Input>
    // wrapper breaks by putting data-testid directly on the <input> instead of
    // a containing element.
    const innerInput = root!.querySelector("input")
    expect(
      innerInput,
      "H1 violated: *[data-testid=atem-ip] has no descendant <input>. " +
        "configAtem.spec.ts's reload check (`*[data-testid=atem-ip] input`) will fail."
    ).not.toBeNull()
  })
})

// --- Example: TallySettings dialog field testids (H6 retracted — see §1.4/§4) ---
import TallySettings from "../components/TallySettings"

describe("data-contract: TallySettings dialog field testids", () => {
  it.each(["ob", "sb", "oc", "sc", "oi", "sp"] as const)(
    "field group %s emits data-testid=\"tally-settings-%s\" on exactly 1 node",
    (field) => {
      render(<TallySettings /* ...fixed minimal props... */ />)
      const nodes = document.querySelectorAll(`*[data-testid="tally-settings-${field}"]`)
      expect(
        nodes.length,
        `Expected exactly 1 node for tally-settings-${field} (the H6 "duplicate wrapper" ` +
          `claim in this doc's hazard list was investigated and disproven — see §4 of ` +
          `spec-changes.md). Found ${nodes.length}. If this is now 0, the field's control ` +
          `stopped forwarding the literal testid; if it's >1, a new duplication was ` +
          `introduced and should be treated as a real regression, not "expected."`
      ).toBe(1)
    }
  )
})

// --- Example: §2.1 data-color computation, Tally.tsx ---
import Tally from "../components/Tally"

describe("data-contract: Tally.tsx data-color (§2.1)", () => {
  const cases: Array<[string, unknown, string]> = [
    ["unpatched", { isPatched: () => false }, "unpatched"],
    ["program", { isPatched: () => true, isIn: (l: unknown) => l === "programs" }, "program"],
    ["preview", { isPatched: () => true, isIn: (l: unknown) => l === "previews" }, "preview"],
    ["idle (patched, in neither)", { isPatched: () => true, isIn: () => false }, "idle"],
  ]

  it.each(cases)("%s -> data-color=%s", (_label, tallyFixture, expected) => {
    // fixture wiring omitted for brevity — construct minimal Tally-shaped mock
    render(<Tally tally={tallyFixture as never} /* programs/previews fixtures */ />)
    expect(screen.getByTestId(/^tally-/)).toHaveAttribute("data-color", expected)
  })
})

// --- Example: §2.8 data-brightness formula, WebTallyPage.tsx ---
import WebTallyPage from "../pages/WebTallyPage"

describe("data-contract: WebTallyPage data-brightness (§2.8)", () => {
  it("defaults to 1 when no per-tally or operator brightness is configured", () => {
    render(<WebTallyPage /* fixture: no configuration, no defaultTallyConfiguration */ />)
    expect(screen.getByTestId("page-tally-web")).toHaveAttribute("data-brightness", "1")
  })

  it("uses operator default (÷100) when set", () => {
    render(<WebTallyPage /* fixture: defaultTallyConfiguration.getOperatorLightBrightness()=75 */ />)
    expect(screen.getByTestId("page-tally-web")).toHaveAttribute("data-brightness", "0.75")
  })

  it("prefers per-tally override over operator default", () => {
    render(<WebTallyPage /* fixture: tally config=25, operator default=75 */ />)
    expect(screen.getByTestId("page-tally-web")).toHaveAttribute("data-brightness", "0.25")
  })
})

// --- Example: exhaustiveness of StateCommand -> data-color mapping (§2.1) ---
// This one is a compile-time check, not a runtime test: keep the
// `((a: never) => {})(command)` guard (or equivalent) in WebTallyPage.tsx itself
// so `tsc` fails the build if a new StateCommand variant is added without a
// corresponding data-color branch. No Jest test can substitute for this —
// document it here so it isn't silently dropped during the rewrite.
```

**Why this shape**: each `it`/`it.each` block corresponds 1:1 to a row or hazard in
§1/§2/§4 of this document, so a failure message can literally say "see ui-contract.md
§H1" and point at the exact selector pattern a real Cypress spec depends on. Suggested
rollout: write this file incrementally, one `describe` block per component as that
component gets rebuilt, gating each route's Cypress re-enable (per the plan doc's phased
rollout: `/config` → `/` → `/tally/:id/log` → `/tally/:id` webtally → `/flasher`) on its
corresponding `data-contract.spec.ts` blocks passing first. Full Cypress remains the
final gate; this file is a fast pre-check, not a replacement.
