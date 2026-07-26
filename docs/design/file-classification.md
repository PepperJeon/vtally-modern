# Authoritative file classification — `hub/src`

Read-only, run against `/Users/jbjeon/Documents/GitHub/vtally-modern` (not the Phase-1 worktree).

## How derived

```
cd hub/src
find . -type f | wc -l                                            # 125 — every extension present is .ts/.tsx/.js, no .json/.css/assets under src
find . -type f | sed 's/.*\.//' | sort | uniq -c                  # 2 js, 81 ts, 42 tsx
find . -type f \( -name "*.ts" -o -name "*.tsx" \) | wc -l        # 123
find . -type f \( -name "*.spec.ts" -o -name "*.spec.tsx" -o -name "*.spec.js" -o -name "*.spec.jsx" \) | wc -l   # 26 (24 .spec.ts/.tsx + 2 .spec.js)
find . -type f \( -name "*.ts" -o -name "*.tsx" \) ! -name "*.spec.*" | wc -l   # 99 non-spec
```

Classification: extracted `module-split.md`'s three per-file tables (§1) verbatim into a
list, then diffed that list against the real 99 non-spec files with `comm`. **Result: zero
files in the filesystem are absent from the table, and zero table entries are stale/typo'd
— `comm -23`/`comm -13` both returned empty.** Every real file is already classified
somewhere in `module-split.md`'s tables at the per-row level; spot-checked all 21
shared-classified files' actual `import` statements (all clean — no hidden node
dependency, two are type-only crossings already flagged in the doc's §2).

**So there are no missing files to newly classify.** The "16 non-spec files missing" is not
a gap in the per-file table — it's the doc's own **summary paragraph** (lines 95–97)
undercounting its own table:

| | doc's stated total (line 95/97) | actual count in doc's own table (recounted by hand from the rows) |
|---|---|---|
| shared/ | 26 | **21** |
| server/ | 13 | **19** |
| client/ | 44 | **59** |
| **sum** | **83** | **99** |

The per-row classifications are correct; the arithmetic sentence summarizing them is wrong
on all three axes (and happens to net out to exactly the 16-file gap the fact-check
flagged). Nothing needs to be "found" — the fix is replacing that one paragraph with the
table below.

## Real three-way split (21 / 19 / 59, sum 99)

### shared/ (21 files)

| File | Notes |
|---|---|
| `domain/Channel.ts` | no imports |
| `domain/IpAddress.ts` | no imports |
| `domain/IpPort.ts` | no imports |
| `domain/Log.ts` | no imports |
| `domain/Tally.ts` | imports `TallyConfiguration`, `Log` (both shared) |
| `mixer/interfaces.ts` | imports `IpAddress`, `IpPort` |
| `mixer/atem/AtemConfiguration.ts` | imports `IpAddress`/`IpPort`/`interfaces` |
| `mixer/mock/MockConfiguration.ts` | imports `Channel`/`interfaces` |
| `mixer/null/NullConfiguration.ts` | imports `interfaces` only |
| `mixer/obs/ObsConfiguration.ts` | imports `IpAddress`/`IpPort`/`interfaces` |
| `mixer/rolandV60HD/RolandV60HDConfiguration.ts` | imports `IpAddress`/`IpPort`/`interfaces` |
| `mixer/rolandV8HD/RolandV8HDConfiguration.ts` | imports `interfaces` only |
| `mixer/vmix/VmixConfiguration.ts` | imports `IpAddress`/`IpPort`/`interfaces` |
| `mixer/test/TestConfiguration.ts` | type-only `ChannelList` from server `MixerCommunicator.ts` (§2 fix) |
| `tally/ColorScheme.ts` | no imports |
| `tally/CommandParser.ts` | imports `Log` |
| `tally/TallyConfiguration.ts` | imports `ColorScheme` |
| `tally/CommandCreator.ts` | type-only `ChannelList` from server `MixerCommunicator.ts` (§2 fix) |
| `flasher/TallyDevice.ts` | imports sibling `TallySettingsIni` |
| `flasher/TallySettingsIni.ts` | imports `escape-string-regexp` (pure npm) |
| `lib/SocketEvents.ts` | 15 imports, all type-only per doc §2 (verified: mixer `*SaveType`s, `ChannelList`, domain types, `TallyDevice`/`NodeMcuConnector` types) |

(+ new file `shared/mixer/ids.ts`, doesn't exist yet, per §3 of the doc.)

### server/ (19 files)

| File |
|---|
| `server.ts` |
| `lib/AppConfiguration.ts` |
| `lib/AppConfigurationPersistence.ts` |
| `lib/MixerCommunicator.ts` |
| `lib/MixerDriver.ts` |
| `lib/ServerEventEmitter.ts` |
| `lib/SocketAwareEvent.ts` |
| `mixer/atem/AtemConnector.ts` |
| `mixer/mock/MockConnector.ts` |
| `mixer/null/NullConnector.ts` |
| `mixer/obs/ObsConnector.ts` |
| `mixer/rolandV60HD/RolandV60HDConnector.ts` |
| `mixer/rolandV8HD/RolandV8HDConnector.ts` |
| `mixer/vmix/VmixConnector.ts` |
| `mixer/test/TestConnector.ts` |
| `flasher/NodeMcuConnector.ts` |
| `tally/TallyContainer.ts` |
| `tally/WebTallyDriver.ts` |
| `tally/UdpTallyDriver.ts` |

### client/ (59 files)

`index.tsx`, `App.tsx`, `react-app-env.d.ts`, `setupTests.ts` (see Ambiguous, below),
`components/ChannelSelector.tsx`, `components/ChipLikeButton.tsx`, `components/EditSettingsIni.tsx`,
`components/ExternalLink.tsx`, `components/Tally.tsx`, `components/TallyCreate.tsx`,
`components/TallyMenu.tsx`, `components/TallySettings.tsx`, `components/TallySettingsField.tsx`,
`components/config/BrightnessSlider.tsx`, `components/config/ColorSchemeSelector.tsx`,
`components/config/MixerSelection.tsx`, `components/config/MixerSettingsWrapper.tsx`,
`components/config/TallySettings.tsx`, `components/config/ValidatingInput.tsx`,
`components/flasher/Help.tsx`, `components/flasher/StepDisplay.tsx`,
`components/layout/FormDialog.tsx`, `components/layout/Layout.tsx`, `components/layout/MiniPage.tsx`,
`components/layout/MyTheme.tsx`, `components/layout/Spinner.tsx`, `components/uniqueId.ts`,
`components/flasher/ProgramProgress.tsx` (type-only crossing), `components/flasher/TallySettingsProgress.tsx` (type-only crossing),
`mixer/atem/react/AtemSettings.tsx`, `mixer/mock/react/MockSettings.tsx`, `mixer/null/react/NullSettings.tsx`,
`mixer/obs/react/ObsSettings.tsx`, `mixer/obs/react/ObsLiveModeSelect.tsx`, `mixer/rolandV60HD/react/RolandV60HDSettings.tsx`,
`mixer/rolandV8HD/react/RolandV8HDSettings.tsx`, `mixer/test/react/TestSettings.tsx`, `mixer/vmix/react/VmixSettings.tsx`,
`pages/ConfigPage.tsx`, `pages/FlasherPage.tsx` (type-only crossing), `pages/IndexPage.tsx`, `pages/PageNotFound.tsx`,
`pages/TallyLogPage.tsx`, `pages/WebTallyPage.tsx`,
`hooks/useSocket.ts` (currently `events`, needs §6 conversion), `hooks/useChannels.ts`, `hooks/useConfiguration.ts`,
`hooks/useMixerInfo.ts`, `hooks/useProgramPreview.ts`, `hooks/useSocketInfo.ts`, `hooks/useTallies.ts`, `hooks/useTallyLog.ts`,
`hooks/tracker/channel.ts`, `hooks/tracker/config.ts`, `hooks/tracker/mixer.ts`, `hooks/tracker/program.ts`,
`hooks/tracker/tally.ts`, `hooks/tracker/tallylog.ts` (all 6 currently `events`, needs §6 conversion),
`lib/DisconnectedClientSideSocket.ts` (currently `events`, needs §6 conversion)

## New vs. already in module-split.md's tables

**None.** As shown above, all 99 real non-spec files are already present, by exact name, in
the doc's per-file tables. The Phase-1 agent does not need to newly classify any file — it
needs the doc's summary/total paragraph (§1, lines 95–97) replaced with the counts above,
and (if it wants a flat reference instead of re-deriving from the tables) can use the three
lists above directly.

## Spec files (26, not 24)

The fact-check's 24 came from a `find` limited to `-name "*.ts" -o -name "*.tsx"`, which
misses two spec files that are plain `.js`:

- `mixer/rolandV60HD/RolandV60HDConnector.spec.js`
- `mixer/vmix/VmixConnector.spec.js`

Add those to the 24 `.spec.ts`/`.spec.tsx` files and the real spec count is **26** — which
matches `module-split.md`'s stated 26 exactly. **`module-split.md`'s spec count was right
all along**; the fact-check's 24 undercounted by excluding `.js` specs. Full list of 26:

```
components/ChannelSelector.spec.tsx      components/uniqueId.spec.ts
domain/IpAddress.spec.ts                 domain/IpPort.spec.ts
domain/Tally.spec.ts                     flasher/TallyDevice.spec.ts
flasher/TallySettingsIni.spec.ts         lib/AppConfiguration.spec.ts
lib/AppConfigurationPersistence.spec.ts  lib/MixerCommunicator.spec.ts
lib/MixerDriver.spec.ts                  mixer/atem/AtemConfiguration.spec.ts
mixer/mock/MockConfiguration.spec.ts     mixer/null/NullConfiguration.spec.ts
mixer/obs/ObsConfiguration.spec.ts       mixer/obs/ObsConnector.spec.ts
mixer/rolandV60HD/RolandV60HDConfiguration.spec.ts
mixer/rolandV60HD/RolandV60HDConnector.spec.js   <- .js
mixer/rolandV8HD/RolandV8HDConfiguration.spec.ts
mixer/test/TestConfiguration.spec.ts     mixer/vmix/VmixConfiguration.spec.ts
mixer/vmix/VmixConnector.spec.js         <- .js
tally/CommandCreator.spec.ts             tally/CommandParser.spec.ts
tally/TallyConfiguration.spec.ts         tally/TallyContainer.spec.ts
```

Implication for Vitest config: the two `.js` specs (`RolandV60HDConnector.spec.js`,
`VmixConnector.spec.js`) need `include` patterns that don't restrict to `.ts`/`.tsx`, or
they'll silently drop out of the Phase-1 test run. Only one spec (`ChannelSelector.spec.tsx`)
needs `jsdom`; the rest are node-environment, per `module-split.md` §5 (not independently
re-verified this pass, but consistent with the classification above — every other spec's
subject file is `server/`- or `shared/`-classified).

## Ambiguous cases

- **`setupTests.ts`** — module-split.md itself flags this as undecided ("`client/` (or
  `shared/`, see §5)"). It's `jest-dom` matcher setup consumed only by
  `ChannelSelector.spec.tsx`. Argument for `client/`: it's test-harness config for a
  component test, natural home next to the component tree. Argument for `shared/`: it has
  zero React/DOM-specific code itself (just `import '@testing-library/jest-dom'`) and
  Vitest config files conventionally live outside the three trees entirely, so forcing it
  into either bucket is somewhat arbitrary either way. Leaving unresolved — low stakes, one
  file, doesn't block anything else.
- **`react-app-env.d.ts`** — not really "classified" in the server/client/shared sense; it's
  a CRA ambient-types file with no runtime code, likely deleted outright once Vite's own
  `vite-env.d.ts` replaces it. Doc already notes this. Not a real ambiguity, flagging only
  so the Phase-1 agent doesn't wonder why it's not doing anything with it.
- **`mixer/mock/MockConnector.ts`, `mixer/null/NullConnector.ts`, `mixer/test/TestConnector.ts`**
  — no device I/O, no Node builtin, no Node-only npm package. Classified `server/` purely
  because they import `MixerCommunicator` (server) directly (not type-only — used as a
  constructor param type and to call `.notifyMixerIsConnected()` etc., i.e. genuinely
  instantiated/called, not just type-annotated). This is a real design choice, not a
  filesystem ambiguity: if `MixerCommunicator`'s server-only surface were ever split into a
  thin shared interface + server implementation, these three could move to `shared/`. As
  written today, they correctly belong in `server/`.

No other files were ambiguous — every other classification traces to an unambiguous direct
or type-only import chain.
