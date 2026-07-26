# Pre-Authorised Cypress Spec Changes

Companion to `docs/design/ui-contract.md`. This document is the sole authority for
"which assertions may change and why" during the MUI4 → Tailwind/shadcn rebuild.
Nothing outside it may be touched without human sign-off (§3).

**Important correction before anything else:** `ui-contract.md`'s Hazard H6
("duplicate testid per field" in `TallySettings.tsx`) was **wrong** and has been
retracted at source in that document (its H6 hazard-list row and §1.4 table are
now corrected, not just noted here). See §4 below for the full evidence. Do not
plan around the original claim.

---

## 0. Method

Every spec file under `cypress/integration/*.spec.ts` (excluding `manual_*.spec.ts`,
which require physical hardware and are out of scope for the automated gate) was
grepped for: raw `.Mui*` class-name strings, `:selected`/native-`<select>` reliance,
and DOM-ordering operators (`.eq()`, `.first()`, `.last()`, `.within()`,
`nth-child`). Findings below are exhaustive for those patterns, not a sample.

---

## 1. Assertions that MUST change (real MUI-internal-class dependency)

**Correction:** this section previously claimed `configVmix.spec.ts:45,50` (§1.1) was
the only raw-`.Mui*`-class assertion in the suite. That was scoped to the `/config`
route only — `cypress/e2e/tally-remove.spec.ts` (route 2, the tally menu) also
asserts on `.MuiMenuItem-root`/`.Mui-disabled` (§1.2 below). §1.2 was drafted as
NOT AUTHORISED and has since been **authorised** (see §1.2) for the route-2
conversion; it is implemented there.

### 1.1 `configVmix.spec.ts:45` and `:50`

```ts
// it('shows a warning when Web UI Port is set')
cy.getTestId("vmix-port").type("{selectall}8099")
cy.getTestId("vmix-submit").should('be.enabled')
cy.getTestId("vmix-port").not('p.MuiFormHelperText-root')          // line 45

cy.getTestId("vmix-port").type("{selectall}8088")
cy.getTestId("vmix-submit").should('be.enabled')
cy.getTestId("vmix-port").contains('p.MuiFormHelperText-root', "This will probably not work.")  // line 50
```

**Why it can't survive:** the assertion depends on MUI's `TextField`/`FormHelperText`
internals rendering a `<p class="MuiFormHelperText-root">` as a sibling inside the
`vmix-port` field wrapper. `.MuiFormHelperText-root` is an MUI-generated class name;
once MUI is removed there is no equivalent class, generated or otherwise, for a
Tailwind/shadcn `Input` component to produce. The assertion is not testing "a
warning is shown" — it's testing "MUI rendered a specific internal node."

**What it's actually testing (user-visible behaviour to preserve):** vMix's port
field shows a warning helper message reading exactly `"This will probably not
work."` when the port is 8088 (a port vMix's own Web UI is likely already using),
and shows no warning for other ports (e.g. 8099).

**Proposed replacement — requires a new attribute on the redesigned component:**

Add `data-testid="vmix-port-warning"` to whatever element renders the helper/warning
text under the redesigned vMix port field (this is a new requirement on the
implementer — the current DOM has no dedicated testid for this node, only the
outer `vmix-port` input carries one).

```ts
// port 8099 — no warning
cy.getTestId("vmix-port").type("{selectall}8099")
cy.getTestId("vmix-submit").should('be.enabled')
cy.getTestId("vmix-port-warning").should('not.exist')

// port 8088 — warning present, same copy
cy.getTestId("vmix-port").type("{selectall}8088")
cy.getTestId("vmix-submit").should('be.enabled')
cy.getTestId("vmix-port-warning").should('contain.text', "This will probably not work.")
```

This is not weaker than the original: it still asserts presence/absence and the
exact copy of the warning, just through a stable selector instead of an MUI
internal.

### 1.2 `tally-remove.spec.ts:39,46,48,61,62` — AUTHORISED

**AUTHORISED** by the team lead at the start of the route-2 (`/` + `/tally/:tallyId`)
conversion, on the grounds stated below: `.MuiMenuItem-root`/`.Mui-disabled` cannot
exist under a Radix `DropdownMenu.Item`, and the replacement asserts the same
user-visible behaviour (remove disabled while connected, clickable once
disconnected, for both UDP and web tallies) through a stable selector. Implemented
as written, using `aria-disabled` — Radix sets it on the item itself, so no
`.find()` is needed and the testid now sits on the clickable node.

```ts
// line 39 — still connected: remove must stay disabled
cy.getTestId(`tally-${name}-remove`).find('.MuiMenuItem-root').should('have.class', 'Mui-disabled')

// line 46 — after disconnect: remove becomes enabled
cy.getTestId(`tally-${name}-remove`).find('.MuiMenuItem-root').should('not.have.class', 'Mui-disabled')

// line 48 — click the (now enabled) remove item
cy.getTestId(`tally-${name}-remove`).find('.MuiMenuItem-root').click()

// line 61 — web tally variant: remove is enabled immediately, no isConnected gate
cy.getTestId(`tally-${name}-remove`).find('.MuiMenuItem-root').should('not.have.class', 'Mui-disabled')

// line 62 — click
cy.getTestId(`tally-${name}-remove`).find('.MuiMenuItem-root').click()
```

**Why it can't survive:** all five assertions depend on `.MuiMenuItem-root` (MUI's
generated class on each `<Menu>` item) and its sibling `.Mui-disabled` state class.
Both are MUI-internal; a Radix `DropdownMenu.Item` produces neither. As with §1.1,
these are testing "MUI rendered this internal node in this state," not the actual
user-visible behaviour (whether the remove option is clickable).

**What it's actually testing (user-visible behaviour to preserve):** the tally
menu's "remove" item is disabled while the tally is still connected, and becomes
clickable (and removes the tally) once it disconnects — for both UDP-backed and
web tallies.

**Stable-selector replacement (implemented):** put `data-testid="tally-${name}-remove"`
directly on the menu item element itself (it already carries that testid per
`TallyMenu.tsx`, wrapped via `.find('.MuiMenuItem-root')` only to reach the actual
clickable/disableable node) and assert disabled state via the native `disabled`
attribute or `aria-disabled`, whichever the redesigned `DropdownMenu.Item`
surfaces, instead of a MUI class name:

```ts
// line 39 replacement
cy.getTestId(`tally-${name}-remove`).should('have.attr', 'aria-disabled', 'true')

// line 46 replacement
cy.getTestId(`tally-${name}-remove`).should('not.have.attr', 'aria-disabled', 'true')

// lines 48/61/62 replacement — click directly on the testid'd node
cy.getTestId(`tally-${name}-remove`).click()
```

This assumes the testid already resolves to the clickable item itself (per §2.0
Rule A's "no descendant selector in play" case) rather than a wrapper — confirm
against the actual redesigned `TallyMenu.tsx` before implementing, since that
determines whether `.click()`/`.should(...)` need a `.find()` at all.

### Note: what does NOT belong in this section

`StepDisplay.tsx` (`src/components/flasher/StepDisplay.tsx:19-28`) contains
`"& .MuiStepConnector-root"` / `"& .MuiStepConnector-line"` inside a `makeStyles`
call. This is **restyling of the vertical Stepper component**, not a spec
assertion — a repo-wide grep of every `*.spec.ts` file (manual specs included)
confirms `.MuiStepConnector` never appears in any spec. It's a legitimate rebuild
concern (already tracked as `ui-contract.md` Hazard H3, "restyle the Stepper
connector") but it does **not** force any spec edit and must not be conflated with
§1.1. There is exactly one MUI-class spec dependency in this codebase, not several.

---

## 2. Fragile-but-survivable assertions

### 2.1 Text-content navigation — `smoke.spec.ts:14,17,20`

```ts
it('Navigation is working', () => {
  cy.visit('/')
  cy.getTestId("page-index")
  cy.contains("Configuration").click()
  cy.getTestId("page-config")
  cy.contains("Flash").click()
  cy.getTestId("page-flasher")
  cy.contains("Tallies").click()
  cy.getTestId("page-index")
})
```

**Recommendation: update the spec, don't freeze the copy.** The rebuild is
explicitly a new visual design; nav-label copy ("Configuration" / "Flash" /
"Tallies") is exactly the kind of thing a redesign is entitled to change (icon-only
nav, renamed sections, etc.), and there's no reason to preserve it as a contract.
Preserving it would mean the copy is accidentally load-bearing for a passing test
suite — the opposite of the coupling this whole exercise is trying to remove.

**Required attribute addition:** add `data-testid` to each nav item (e.g.
`nav-configuration`, `nav-flash`, `nav-tallies`) so the replacement is
testid-based, not string-based:

```ts
cy.getTestId("nav-configuration").click()
cy.getTestId("page-config")
cy.getTestId("nav-flash").click()
cy.getTestId("page-flasher")
cy.getTestId("nav-tallies").click()
cy.getTestId("page-index")
```

This spec edit is pre-authorised **once the redesign's nav copy is finalised**,
not before — see the boundary rule in §3.

### 2.2 Native-`<select>` reliance

Sites found (all outside manual specs):

- `configObs.spec.ts:58` — `cy.get("*[data-testid=obs-liveMode] select :selected").should("have.value", "stream")`
- `tally.spec.ts` (≈8 sites, e.g. lines 68, 73, 90, 94, 118, 123, 142, 146) — `*[data-testid=tally-${name}] *[data-testid=channel-selector] :selected`
- `webtally.spec.ts:63` — same `channel-selector :selected` pattern

**Recommendation: preserve, do not update.** `src/components/layout/MyTheme.tsx:102-104`:

```ts
MuiSelect: {
  // native components have better support on mobile
  native: true,
},
```

This is a deliberate, source-commented mobile-accessibility decision, not an
MUI default left on by accident. `ObsLiveModeSelect.tsx` (`TextField select`) and
`MixerSelection.tsx` (`NativeSelect`) both honour it and both render a real native
`<select>`. The redesign should keep native `<select>` for these fields (at least
on mobile breakpoints) rather than swap to a custom-styled listbox — a custom
listbox would be strictly worse for mobile users and the spec's reliance on
`:selected` correctly reflects a real, intended platform behaviour rather than an
implementation accident. No spec edit needed as long as the redesign keeps a real
`<select>` element under these testids.

### 2.3 Element-ordering assumptions

None found. A repo-wide grep for `.eq(`, `.first()`, `.last()`, `.within(`,
`nth-child`/`nth-of-type` across every spec turns up only string-equality checks
(`expect(lastCommand).to.eq("O255/...")`) in `tally-settings.spec.ts`, asserting
UDP protocol output strings — unrelated to DOM ordering. There is no DOM
sibling-order or list-position assumption anywhere in the suite. No action needed;
listed here only because the team-lead's brief asked for it to be checked.

---

## 3. Hard boundary — instructions to the implementing agent

> You are implementing the MUI4 → Tailwind/shadcn rebuild. The following rules on
> `hub/cypress/` are non-negotiable and pre-date your task; you did not author them
> and may not override them.
>
> **You MAY edit, in exactly these two files, exactly these changes:**
> - `cypress/integration/configVmix.spec.ts` lines 45 and 50 — replace the
>   `p.MuiFormHelperText-root` assertions with the `vmix-port-warning` testid
>   assertions specified in §1.1 of this document, **once** you have added
>   `data-testid="vmix-port-warning"` to the corresponding element in your
>   redesigned component.
> - `cypress/integration/smoke.spec.ts` lines 14, 17, 20 — replace the
>   `cy.contains(...)` navigation clicks with `cy.getTestId(...)` calls per §2.1,
>   **once** the nav item testids you add match what §2.1 specifies (or a variant
>   you've agreed with a human reviewer beforehand).
>
> **You MAY NOT touch any other line in any spec file for any reason**, including
> but not limited to: making a test pass, removing a test that fails, weakening an
> assertion (e.g. `.should('exist')` → removed, `.should('contain.text', X)` →
> `.should('exist')`, exact match → partial match), commenting out a test,
> adding `.skip()`, changing a `data-testid` string referenced by a spec (adjust
> your component instead so it emits the string the spec already expects), or
> changing which selector a spec uses to reach an element.
>
> **If a spec fails and the fix is not one of the two pre-authorised edits above:**
> the fix is in your component, not the spec. **You (the implementing agent) may
> not decide this yourself.** Escalate to the orchestrating agent (the agent
> coordinating this rebuild task, not necessarily a human) and stop editing until
> it answers.
>
> `cypress/integration/manual_*.spec.ts` are out of scope entirely (hardware
> required) — do not run, fix, or edit them as part of this rebuild.
>
> **Sign-off, not self-certification.** Before any merge, `git diff` against
> `hub/cypress/` must be run and reviewed line-by-line by a human or by a
> separate reviewing agent — never by you, the implementing agent, and never as
> a step you perform on yourself. A green Cypress run is not evidence this rule
> was followed — only the diff review is. This is the actual mechanism this
> document exists to enforce; do not let it collapse into "the agent said it
> only touched the authorised lines."

### 3.1 The actual approval chain

This section originally said an escalation goes "to a human." In practice it
goes to whichever agent is orchestrating the rebuild, and that agent is not
always a human. Writing down what the boundary actually promises, so the
promise and the practice match:

1. **The implementing agent** never decides a spec change on its own — no
   exceptions, including "obviously safe" ones. It escalates and stops.
2. **The orchestrating agent** may authorise a spec edit itself, without going
   further up the chain, **only if** the edit is one of these three kinds:
   - **removes a race** (e.g. converts a single-sample read into a polling
     `.should()` assertion, with the asserted value unchanged),
   - **fixes test cleanup/isolation** (e.g. makes an `afterEach` teardown run
     even when an earlier assertion in the test threw), or
   - **follows a moved/renamed module** (e.g. updates an `import` path after a
     restructure, with no change to what the test does).

   Every such authorisation must be recorded — in the commit message that makes
   the change, and in the running log below — naming the file(s), what changed,
   and why it falls into one of the three kinds above. "I approved it" is not
   sufficient; the reasoning has to be checkable by someone who wasn't in the
   conversation.
3. **Anything else escalates past the orchestrating agent to the human owner**,
   and does not proceed until the owner answers. This specifically includes:
   deleting or `.skip()`-ing a test, weakening an assertion (exact match →
   partial match, `.should('contain.text', X)` → `.should('exist')`, a
   threshold relaxed), and anything not cleanly one of the three kinds in (2).
   The orchestrating agent does not get to decide these by itself, regardless
   of time pressure or how confident it is in the reasoning — that confidence
   is exactly what this rule doesn't trust unchecked, on either side of the
   chain.

An agent citing this document as its own authorisation for a change must be
able to name which of the three kinds in (2) the change is. If it can't, the
change wasn't authorised — restating "I decided" in different words doesn't
make it one of the three kinds.

### 3.2 Running log of orchestrator-authorised spec changes

| Date | File(s) | What changed | Kind (§3.1.2) | Authorised by | Why |
|---|---|---|---|---|---|
| 2026-07-26 | `configTally.spec.ts`, `manual_atem.spec.ts`, `tally-settings.spec.ts`, `tally.spec.ts`, `webtally.spec.ts` (10 lines, commit `fb96fb6`) | `import` paths updated after the Cypress 6→15 / `cypress/integration`→`cypress/e2e` restructure moved the imported modules | follows a moved module | orchestrating agent | Paths were dangling post-restructure; `git diff -U0` confirmed all 10 changed lines are `import` statements, zero assertions/selectors/testids touched |
| 2026-07-26 | `dialog-cancel.spec.ts`, `hub-disconnected-banner.spec.ts`, `tally-remove.spec.ts` (commit `273201f`) | `afterEach` cleanup hardened so `cy.task('tallyCleanup')` runs even when an earlier assertion in the test threw (previously chained off a `.then()` a thrown assertion could skip, leaking mock tallies onto the shared backend) | fixes cleanup/isolation | orchestrating agent | Prevented one test's failure from cascading into unrelated later tests via leaked backend state |
| 2026-07-26 | `tally-settings.spec.ts` (14 sites) | `cy.task('tallyLastCommand', name).then(v => expect(v).to.eq(X))` → `cy.task('tallyLastCommand', name).should('eq', X)` | removes a race | orchestrating agent | `.then()` samples the task result exactly once; `.should()` polls it until it matches or times out. Asserted values unchanged — verified this is **not yet proven to have fixed the underlying flake** (see note below) |

| 2026-07-27 | `tally-remove.spec.ts` (lines 39, 46, 48, 61, 62) | `.find('.MuiMenuItem-root')` + `.Mui-disabled` class assertions → `aria-disabled` on the item itself (§1.2) | human sign-off, §1.2 now AUTHORISED | team lead (explicit, at task hand-off) | MUI's generated classes cannot exist under a Radix `DropdownMenu.Item`. Same states, same outcomes, stable selector; the testid now sits on the clickable node so no `.find()` is needed |

**Flagging one entry above for the human owner, not deciding it here:** commit
`273201f` also added `.skip()` to one test each in `dialog-cancel.spec.ts` and
`hub-disconnected-banner.spec.ts` (with comments naming the unresolved cause).
Per §3.1.3, `.skip()`-ing a test is not one of the three orchestrator-authorisable
kinds — it removes coverage, full stop, regardless of the comment explaining
why. It shipped under an orchestrator-only authorisation before this section
existed to say it shouldn't. Not reverting it unilaterally (that's its own
undiscussed decision), but recording it here as a rule violation to settle,
not as a fourth clean log entry.

**Note on the third entry:** `flake2.sh` (6 isolated runs of `tally-settings.spec.ts`
alone) still shows inconsistent results after this edit (4/6 clean). Root-caused
to `MixerDriver.changeMixer()` broadcasting a null/unknown program-preview state
to tallies before the real new state arrives (`src/server/lib/MixerDriver.ts:73-77`)
— two racing broadcasts, not one slow one, so `.should()`'s retry does not fully
close the gap. The edit is still logged here because it's a strict improvement
(same assertions, no longer single-sampling) and was authorised as such, not
because it has been shown to fix the flake end-to-end.

---

## 4. The duplicate-testid decision — CORRECTION, not a decision

`ui-contract.md`'s Hazard H6 states that each of the six field groups in
`TallySettings.tsx` (`ob`, `oc`, `oi`, `sb`, `sc`, `sp`) emits the same literal
testid string on two DOM nodes (a wrapper + an inner control), and frames this as
something to "preserve vs. clean up." **This is incorrect.** It does not survive a
full read of `TallySettingsField.tsx`, `BrightnessSlider.tsx`,
`ColorSchemeSelector.tsx`, and `ChipLikeButton.tsx`, confirmed by an exhaustive
grep of every literal occurrence of each testid string in `TallySettings.tsx`:

```
tally-settings-ob: line 115 testId="tally-settings-ob" (prop, TallySettingsField)
                    line 119 testId="tally-settings-ob" (prop, BrightnessSlider)
tally-settings-oc: line 131 testId="tally-settings-oc" (prop, TallySettingsField)
                    line 135 testId="tally-settings-oc" (prop, ColorSchemeSelector)
tally-settings-oi: line 145 testId="tally-settings-oi" (prop, TallySettingsField)
                    line 151 data-testid="tally-settings-oi" (Checkbox, DOM)
tally-settings-sb: line 167 testId="tally-settings-sb" (prop, TallySettingsField)
                    line 171 testId="tally-settings-sb" (prop, BrightnessSlider)
tally-settings-sc: line 181 testId="tally-settings-sc" (prop, TallySettingsField)
                    line 185 testId="tally-settings-sc" (prop, ColorSchemeSelector)
tally-settings-sp: line 195 testId="tally-settings-sp" (prop, TallySettingsField)
                    line 201 data-testid="tally-settings-sp" (Checkbox, DOM)
```

The string appears twice in **source**, but only once as `testId={...}` gets
turned into `data-testid` on an actual DOM node:

- `TallySettingsField.tsx` receives `testId` as a prop but only ever derives
  `${testId}-toggle` from it, for its inner `ChipLikeButton`. It never renders
  `data-testid={testId}` (the bare string) on anything — not on its own wrapping
  `<div>`, not anywhere else. `ChipLikeButton` in turn spreads
  `{...props}` from its caller (which is `data-testid={`${testId}-toggle`}`,
  already suffixed) — it does not separately receive or forward the parent's bare
  `testId`.
- `BrightnessSlider.tsx:47` renders `data-testid={testId}` on exactly one node —
  the MUI `Slider` root — inside an untestid'd wrapper `<div>`.
- `ColorSchemeSelector.tsx:78` renders `data-testid={testId}` on exactly one node
  — the outer `<div className={classes.root}>`. Its per-option `ChipLikeButton`s
  carry a *different*, derived id (`${testId}-${scheme.id}`), not a second copy of
  the parent testid.
- For `oi`/`sp`, the `Checkbox` itself is the only DOM node carrying the literal
  string — `TallySettingsField` wrapping it contributes nothing but the derived
  `-toggle` id.

**Conclusion: there is no duplicate testid in the DOM anywhere in
`TallySettings.tsx`.** Every unqualified `cy.get('[data-testid=tally-settings-*]')`
(if any spec used that pattern instead of `cy.getTestId`, the project's typed
helper) already resolves to exactly one element per field, today, in the current
MUI implementation. `tally-settings.spec.ts` and `webtally.spec.ts`'s existing
selectors are not at risk from this pattern, and no spec change and no component
change are required on this point. This section exists to formally retract H6, not
to record a preserve-vs-clean-up decision — there is nothing to decide.

(H6's likely origin: `TallySettingsField` accepting a `testId` prop reads, at a
skim, like it should render it — it doesn't. That's a one-line misreading in the
original inventory pass, not a real pattern in the code.)

---

## 5. Residual-risk note — what a green Cypress run will and won't prove

After the changes in §1 and §2.1 are made (and only those), a fully green
`cypress:open` / `cypress run` on the rebuilt frontend proves:

- **DOM/testid/state-attribute parity** for every `data-testid` and `data-*`
  attribute currently asserted on (per `ui-contract.md`'s ~90 patterns / 524
  references) — the redesigned components expose the same hooks in the same
  places, with the same values, for the same interactions.
- **Native-`<select>` behaviour parity** for `obs-liveMode`, `channel-selector`,
  `mixer-select` — real `<select>` elements with selectable options, still
  reachable via `:selected`.
- **Protocol-output parity** for `tally-settings.spec.ts`'s UDP command
  assertions — the settings UI still produces byte-identical wire commands for
  the same user inputs.
- **The one pre-authorised behavioural swap** — the vMix port warning is present
  for port 8088 and absent otherwise, with the same copy, via a new stable
  selector instead of an MUI internal.

It does **not** prove:

- **Visual or design correctness.** Nothing here asserts colour, spacing,
  typography, layout, responsiveness, or that the Tailwind/shadcn version looks
  like the approved design at all — Cypress here is a behavioural/DOM-contract
  suite, not a visual regression suite.
- **Accessibility.** No a11y assertions exist in this suite (no `axe`, no
  role/label checks beyond what a couple of `aria-label`s happen to satisfy
  incidentally). A green run says nothing about screen-reader usability, focus
  order, or contrast.
- **Cross-browser behaviour.** Cypress here runs in one browser context; nothing
  is asserted about Safari/Firefox-specific rendering differences, which matter
  more once MUI's cross-browser normalisation is gone.
- **Correct placement/semantics of any newly-added attribute** beyond what's
  explicitly asserted. `vmix-port-warning` and the `nav-*` testids only prove the
  element with that id exists and contains the expected text at the moment of
  assertion — not that it's the *right* element architecturally, not that it's
  announced correctly to assistive tech, not that it doesn't also duplicate
  content elsewhere.
- **That §3's boundary rule was actually followed.** A green run today only
  proves the specs *currently in the repo* pass against today's DOM. It cannot
  detect whether an implementation agent quietly weakened an assertion outside
  the two pre-authorised edits — that requires a diff review of
  `cypress/integration/*.spec.ts` against this document before merge, every time,
  not inference from CI status. Green and "the acceptance suite still means
  something" are not the same fact, and this document is what makes the
  difference checkable.
