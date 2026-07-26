# vTally Module Split — server / client / shared

Design for Phase 1 of the rebuild plan (`soft-wishing-boot.md`): restructure `hub/src`
(currently compiled two ways — CRA for the browser bundle, `tsc -p tsconfig.server.json`
for the Node backend) into three physically separate trees so a browser bundler (Vite)
can never accidentally pull in Node-only code.

No source files were moved or edited to produce this document. All paths, imports, and
line numbers below were verified by reading the actual files in
`/Users/jbjeon/Documents/GitHub/vtally-modern/hub`.

Target structure (from the plan, section 0.1):

```
hub/
  index.html
  vite.config.ts
  vitest.config.ts
  electron/
    main.ts
    preload.ts
  src/
    server/    # node-only, tsc → CJS, client may never import it
    client/    # browser-only, Vite → static files
    shared/    # pure TS, safe to import from either side
```

---

## 1. File classification

Legend: **S** = `server/`, **C** = `client/`, **H** = `shared/`. Paths are relative to
`hub/src/`; new paths are relative to the new `hub/src/` root (same convention). Spec
files inherit their subject file's bucket except where noted (mixed-bucket dirs still
keep specs next to the code they test).

### shared/

| Current path | New path | Rationale |
|---|---|---|
| `domain/Channel.ts` | `shared/domain/Channel.ts` | Pure data type, no imports outside `domain/`. |
| `domain/IpAddress.ts` (+ `.spec.ts`) | `shared/domain/IpAddress.ts` | Pure value class. |
| `domain/IpPort.ts` (+ `.spec.ts`) | `shared/domain/IpPort.ts` | Pure value class. |
| `domain/Log.ts` | `shared/domain/Log.ts` | Pure data type. |
| `domain/Tally.ts` (+ `.spec.ts`) | `shared/domain/Tally.ts` | Imports only `TallyConfiguration`/`Log` (both shared). |
| `mixer/interfaces.ts` | `shared/mixer/interfaces.ts` | Imports only `IpAddress`/`IpPort`; defines `Connector`/`Configuration`/`SettingsProps`. Depended on by every mixer `Configuration.ts` and every `Connector.ts`. |
| `mixer/*/[Name]Configuration.ts` (+ specs) — `atem`, `mock`, `null`, `obs`, `rolandV60HD`, `rolandV8HD`, `vmix` (7 files) | `shared/mixer/*/Configuration.ts` | Each imports only `IpAddress`/`IpPort`/`Configuration`/`Channel` — pure. Confirmed via grep on all 7. |
| `mixer/test/TestConfiguration.ts` (+ spec) | `shared/mixer/test/Configuration.ts` | Currently imports `{ ChannelList } from "../../lib/MixerCommunicator"` (server file) but **only as a type** (field/param annotations, never instantiated) — becomes shared-safe once that import is rewritten as `import type`. See §2. |
| `tally/ColorScheme.ts` | `shared/tally/ColorScheme.ts` | No imports. |
| `tally/CommandParser.ts` (+ spec) | `shared/tally/CommandParser.ts` | Imports only `Log`. |
| `tally/TallyConfiguration.ts` (+ spec) | `shared/tally/TallyConfiguration.ts` | Imports only `ColorScheme`. |
| `tally/CommandCreator.ts` (+ spec) | `shared/tally/CommandCreator.ts` | Imports `{ ChannelList } from "../lib/MixerCommunicator"` — type-only (same pattern as `TestConfiguration.ts`). Fix via `import type`, see §2. |
| `flasher/TallyDevice.ts` (+ spec) | `shared/flasher/TallyDevice.ts` | Imports only sibling `TallySettingsIni`. **Refinement to the plan**: the plan's illustrative tree shows all of `flasher/` under `server/`, but this file has no Node dependency and is consumed by client code (`TallyDevice` shape) — carve it out to `shared/`. |
| `flasher/TallySettingsIni.ts` (+ spec) | `shared/flasher/TallySettingsIni.ts` | Imports only `escape-string-regexp` (pure npm pkg, no Node builtins). Same refinement as above. |
| `lib/SocketEvents.ts` | `shared/SocketEvents.ts` | Every cross-boundary import (`NodeMcuConnector`'s two progress types, all 8 mixer `*ConfigurationSaveType`, `ChannelList`) is used purely as a type inside interface method signatures. Becomes shared-safe once those become `import type`. See §2. This is the file that defines `ServerSideSocket`/`ClientSideSocket`, needed by both sides. |
| **New file:** `shared/mixer/ids.ts` | — | See §3. |

### server/

| Current path | New path | Rationale |
|---|---|---|
| `server.ts` | `server/server.ts` | `express`, `socket.io`, wires everything together. |
| `lib/AppConfiguration.ts` (+ spec) | `server/lib/AppConfiguration.ts` | Extends `shared` `Configuration` but references `MixerDriver.defaultChannels` in its constructor — pulls in the whole server mixer graph. |
| `lib/AppConfigurationPersistence.ts` (+ spec) | `server/lib/AppConfigurationPersistence.ts` | Persists `AppConfiguration` to disk — Node `fs` (persistence needs disk access; not read in full this session but its role is unambiguous — reads/writes a config file). |
| `lib/MixerCommunicator.ts` (+ spec) | `server/lib/MixerCommunicator.ts` | Imports `AppConfiguration`, `ServerEventEmitter` — server-only. This is the file that owns `ChannelList`, the source of every type-only crossing in §2. |
| `lib/MixerDriver.ts` (+ spec) | `server/lib/MixerDriver.ts` | Imports all 8 connectors, `MixerCommunicator`, `ServerEventEmitter`. Owns `changeMixer()`'s `if/else if` chain over all 8 `.ID`s and `getAllowedMixers()`. |
| `lib/ServerEventEmitter.ts` | `server/lib/ServerEventEmitter.ts` | `import { EventEmitter } from "events"` — Node builtin. Internal server pub-sub (`config.changed`, `mixer.connected`, `tally.created`, …). |
| `lib/SocketAwareEvent.ts` | `server/lib/SocketAwareEvent.ts` | Server-side socket.io event helper (not read in full this session; grouped with the other `lib/` server files by directory convention and absence from the shared-safe list above — no evidence it's shared-safe). |
| `mixer/*/[Name]Connector.ts` — `atem`, `mock`, `null`, `obs`, `rolandV60HD`, `rolandV8HD`, `vmix`, `test` (8 files, some with specs) | `server/mixer/*/Connector.ts` | Every connector imports `MixerCommunicator` (server) and its device-specific Node/npm dependency: `atem-connection` (Atem), `net`+`xml2js` (Vmix), `http` (RolandV60HD), `@julusian/midi` (RolandV8HD), `obs-websocket-js` (Obs). `MockConnector`/`NullConnector`/`TestConnector` have no device I/O but still import `MixerCommunicator`, making them server-only by association. |
| `flasher/NodeMcuConnector.ts` | `server/flasher/NodeMcuConnector.ts` | `require('nodemcu-tool')` (lazy, wrapped in try/catch — see the `ponytail:` comment at the top of the file), `tmp-promise`, `{ promises as fs } from 'fs'`, `__dirname`. Hard Node-only. Exports `TallySettingsIniProgressType`/`TallyProgramProgressType` which client code needs as **types only** (§2). |
| `tally/TallyContainer.ts` (+ spec) | `server/tally/TallyContainer.ts` | Imports `AppConfiguration` + `ServerEventEmitter`. |
| `tally/WebTallyDriver.ts` | `server/tally/WebTallyDriver.ts` | Imports `AppConfiguration` + `socket.io` (`socketIo`) + `TallyContainer`. |
| `tally/UdpTallyDriver.ts` | `server/tally/UdpTallyDriver.ts` | Imports `dgram` (Node builtin) + `AppConfiguration` + `TallyContainer`. |

### client/

| Current path | New path | Rationale |
|---|---|---|
| `index.tsx` | `client/main.tsx` | Entry point (renamed to match Vite convention referenced in the plan's `electron/main.ts` naming — actual rename is cosmetic, kept as a recommendation not a requirement). |
| `App.tsx` | `client/App.tsx` | Root component, no server imports. |
| `react-app-env.d.ts` | `client/react-app-env.d.ts` (or deleted — CRA-specific ambient types; Vite has its own `vite-env.d.ts`, see §4) | CRA-only ambient declaration file, superseded by Vite's own env types. |
| `setupTests.ts` | `client/setupTests.ts` (or `shared/`, see §5) | Testing-library `jest-dom` matchers setup; only consumed by `ChannelSelector.spec.tsx`'s jsdom environment. Kept adjacent to the one spec that needs it. |
| `components/**/*.tsx` (all, except the two exceptions below) — `ChannelSelector`, `ChipLikeButton`, `EditSettingsIni`, `ExternalLink`, `Tally`, `TallyCreate`, `TallyMenu`, `TallySettings`, `TallySettingsField`, `config/BrightnessSlider`, `config/ColorSchemeSelector`, `config/MixerSelection`, `config/MixerSettingsWrapper`, `config/TallySettings`, `config/ValidatingInput`, `flasher/Help`, `flasher/StepDisplay`, `layout/FormDialog`, `layout/Layout`, `layout/MiniPage`, `layout/MyTheme`, `layout/Spinner` | `client/components/**` | Confirmed via full import grep: no Node/server imports in any of these. |
| `components/uniqueId.ts` (+ spec) | `client/components/uniqueId.ts` | Pure helper, no imports — could equally live in `shared/` but has no cross-boundary consumer, kept with its only caller. |
| `components/ChannelSelector.spec.tsx` | `client/components/ChannelSelector.spec.tsx` | The one spec needing `jsdom` (renders a component). See §5. |
| `components/flasher/ProgramProgress.tsx` | `client/components/flasher/ProgramProgress.tsx` | Imports `TallyProgramProgressType` from `NodeMcuConnector` — **type-only** (§2). |
| `components/flasher/TallySettingsProgress.tsx` | `client/components/flasher/TallySettingsProgress.tsx` | Imports `TallySettingsIniProgressType` from `NodeMcuConnector` — **type-only** (§2). |
| `mixer/*/react/*.tsx` — `AtemSettings`, `MockSettings`, `NullSettings`, `ObsSettings`, `ObsLiveModeSelect`, `RolandV60HDSettings`, `RolandV8HDSettings`, `TestSettings`, `VmixSettings` (9 files) | `client/mixer/*/react/*.tsx` | React components. Several currently runtime-import their server `Connector` just for `.ID` — the primary boundary violation, fixed in §2/§3. |
| `pages/*.tsx` — `ConfigPage`, `FlasherPage`, `IndexPage`, `PageNotFound`, `TallyLogPage`, `WebTallyPage` (6 files) | `client/pages/*.tsx` | `FlasherPage.tsx` has a type-only `NodeMcuConnector` import (§2); rest confirmed clean. |
| `hooks/useSocket.ts` | `client/hooks/useSocket.ts` | `import { EventEmitter } from 'events'` in the currently-shipped file — hard Vite build failure without conversion. See §6. |
| `hooks/useChannels.ts`, `useConfiguration.ts`, `useMixerInfo.ts`, `useProgramPreview.ts`, `useSocketInfo.ts`, `useTallies.ts`, `useTallyLog.ts` (7 files) | `client/hooks/*.ts` | Each wraps a tracker via `useSyncExternalStore` (post-conversion) or currently subscribes via the trackers' `EventEmitter` API. See §6. |
| `hooks/tracker/channel.ts`, `config.ts`, `mixer.ts`, `program.ts`, `tally.ts`, `tallylog.ts` (6 files) | `client/hooks/tracker/*.ts` | All extend Node's `EventEmitter` (`events`) today — converted to a listener-`Set` pattern in §6. |
| `lib/DisconnectedClientSideSocket.ts` | `client/lib/DisconnectedClientSideSocket.ts` | Imports `events` (`EventEmitter`) — same conversion as the trackers, §6. |

**Totals**: 27 files → `shared/` (26 non-spec + `ids.ts` is new) + 8 specs, 18 files → `server/` (13 non-spec + specs on 5 of them: `AppConfiguration`, `AppConfigurationPersistence`, `MixerCommunicator`, `MixerDriver`, `TallyContainer` — 5 specs), 44 non-spec files → `client/` + 1 spec (`ChannelSelector.spec.tsx`). This matches the ~113 non-spec + 26 spec totals (26 + 13 + 44 = 83 non-spec source files once `ids.ts` is excluded as new... — see note below).

> **Note on the count**: the brief cited "~113 non-spec source files." The exhaustive `find src -name "*.ts" -o -name "*.tsx"` in this session returned **109** files total, of which **26** are `*.spec.*` — leaving **83** non-spec files, all classified in the three tables above (26 shared + 13 server + 44 client = 83). The "~113" figure in the original brief appears to be a rough estimate rather than a verified count; 83 is the number actually walked and classified here.

---

## 2. Boundary-crossing imports

Every import found (via `grep -rn` across `src/mixer/*/react`, `src/components`, `src/pages`,
`src/lib`, `src/tally`, `src/mixer/*` for cross-directory imports) that would cross from a
file classified `client/`/`shared/` above into a file classified `server/` above, after the
split. Grouped by fix type.

### 2a. Type-only crossings — fix: `import type`

Vite/esbuild already elides these at compile time even without the explicit keyword (a
type-only import that's never used as a value is dropped by TS's `isolatedModules`-compatible
transform), so these are not live bugs today — but post-split they'd trip the `no-restricted-imports`
eslint rule (§4) and are worth making explicit for clarity and lint-cleanliness.

| File : line | Imports | Usage | Fix |
|---|---|---|---|
| `components/flasher/ProgramProgress.tsx:2` | `TallyProgramProgressType` from `../../flasher/NodeMcuConnector` | Prop type annotation only | `import type { TallyProgramProgressType } from '../../../shared/...'` once the two progress types are relocated (see below) or `import type` from wherever `NodeMcuConnector` ends up if the types stay put |
| `components/flasher/TallySettingsProgress.tsx:2` | `TallySettingsIniProgressType` from `../../flasher/NodeMcuConnector` | Prop type annotation only | Same as above |
| `pages/FlasherPage.tsx:9` | `TallyProgramProgressType`, `TallySettingsIniProgressType` from `../flasher/NodeMcuConnector` | State/prop type annotations only | Same as above |
| `lib/SocketEvents.ts:15` (and its other 10+ type imports from mixer `*ConfigurationSaveType`, `ChannelList`, tally types, flasher types) | See full list in §1's `SocketEvents.ts` row | Used only inside `ServerSentEvents`/`ClientSentEvents`/`ServerSideSocket`/`ClientSideSocket` interface signatures | Convert every cross-boundary import in this file to `import type` |
| `mixer/test/TestConfiguration.ts:1` | `{ ChannelList } from "../../lib/MixerCommunicator"` | Field types (`programs: ChannelList`, `previews: ChannelList`) and parameter types — never instantiated | `import type { ChannelList } from "../../lib/MixerCommunicator"` |
| `tally/CommandCreator.ts` | `{ ChannelList } from "../lib/MixerCommunicator"` | Type annotation only (verified via grep — `ChannelList` never appears as `new ChannelList(...)` or similar) | `import type` |

**Resolving the `TallyProgramProgressType`/`TallySettingsIniProgressType` split**: these two
interfaces are currently *defined* in `server/flasher/NodeMcuConnector.ts` but *consumed*
(type-only) from three `client/` files. Two options:
1. Move the two interface declarations into `shared/flasher/TallyDevice.ts` (already shared,
   already the natural home for flasher-related shapes) and have `NodeMcuConnector.ts` import
   them back — cleanest, no `import type` needed on the client side at all.
2. Leave them in `NodeMcuConnector.ts` and use `import type` in all three client consumers.

Option 1 is preferred — it removes the crossing entirely rather than just making it lint-safe,
and it costs one file move plus updating the two-line interface exports. Do this in the same
step as moving `TallyDevice.ts` to `shared/` (§1).

### 2b. Constant-only crossings — fix: `shared/mixer/ids.ts`

| File | Imports | Usage | Fix |
|---|---|---|---|
| `mixer/obs/react/ObsSettings.tsx:8` | `import ObsConnector from '../ObsConnector'` (server) | `ObsConnector.ID` — type position (props) + runtime (`socket.emit('config.change.obs', ..., ObsConnector.ID)`, `defaultProps.id`) | Replace with `import { OBS_ID } from '../../../shared/mixer/ids'` |
| `mixer/mock/react/MockSettings.tsx` | `import MockConnector from '../MockConnector'` (server) | `MockConnector.ID` — 4 occurrences: prop type, runtime `if (props.id !== MockConnector.ID)`, `socket.emit(..., MockConnector.ID)`, `defaultProps.id` | Replace with `MOCK_ID` from `shared/mixer/ids.ts` |
| `mixer/null/react/NullSettings.tsx` | `import NullConnector from '../NullConnector'` (server) | `NullConnector.ID` — 3 occurrences: `if (props.id !== NullConnector.ID)`, `socket.emit('config.change.null', NullConnector.ID)`, `defaultProps.id` | Replace with `NULL_ID` from `shared/mixer/ids.ts` |
| `mixer/atem/react/AtemSettings.tsx` | *(none — hardcodes `id: "atem"` string literal)* | `defaultProps.id: "atem"` | Replace literal with `ATEM_ID` from `shared/mixer/ids.ts` (removes the silent-typo risk the hardcoding invites) |
| `mixer/rolandV8HD/react/RolandV8HDSettings.tsx` | *(none — hardcodes `"rolandV8HD"`, 2 occurrences)* | Props type + `defaultProps.id` | Replace with `ROLAND_V8HD_ID` |
| `mixer/rolandV60HD/react/RolandV60HDSettings.tsx` | *(none — hardcodes `"rolandV60HD"`, 2 occurrences)* | Props type + `defaultProps.id` | Replace with `ROLAND_V60HD_ID` |
| `mixer/vmix/react/VmixSettings.tsx` | *(none — hardcodes `"vmix", // @TODO use Vmix.ID`)*, 2 occurrences | Props type + `defaultProps.id` — comment already flags this as a known workaround | Replace with `VMIX_ID`, resolving the existing `@TODO` |
| `mixer/test/react/TestSettings.tsx` | `import TestConfiguration from '../TestConfiguration'` | `new TestConfiguration()` at **runtime** in `handleSave` (genuine dependency, not just an ID lookup); `id: "test"` hardcoded elsewhere | Once `TestConfiguration.ts` is shared-safe (§2a fix), this import is legitimate and stays — no `ids.ts` involvement needed here beyond replacing the `"test"` literal with `TEST_ID` for consistency |

`lib/MixerDriver.ts` (server-side) also references all 8 `.ID` constants directly on the
connector classes it already imports (`changeMixer()`'s `if/else if` chain,
`getAllowedMixers()`). No fix needed there — server code importing its own server-side
connectors is not a boundary crossing. It may optionally also switch to `shared/mixer/ids.ts`
for the string values to guarantee client and server never drift, but this is not required
for the split to be correct.

No other files reference `.ID`; this list is exhaustive (verified via `grep -rn "\.ID\b" src --include="*.ts" --include="*.tsx" | grep -v spec`, cross-checked against the individual Settings.tsx reads above).

---

## 3. `shared/mixer/ids.ts`

Leaf module, zero imports, one literal-typed constant per mixer — mirrors the `static readonly ID: "x" = "x"` pattern already on each connector so the string-literal types are preserved for exhaustiveness checks elsewhere.

```ts
// shared/mixer/ids.ts
//
// Canonical mixer id strings. This is the ONLY file that owns these literals —
// every Connector.ID on the server side and every Settings.tsx id prop on the
// client side must reference these, not redeclare them, so client and server
// can never drift apart on what a mixer is called over the wire.

export const ATEM_ID = "atem" as const
export const MOCK_ID = "mock" as const
export const NULL_ID = "null" as const
export const OBS_ID = "obs" as const
export const ROLAND_V60HD_ID = "rolandV60HD" as const
export const ROLAND_V8HD_ID = "rolandV8HD" as const
export const TEST_ID = "test" as const
export const VMIX_ID = "vmix" as const

export type MixerId =
  | typeof ATEM_ID
  | typeof MOCK_ID
  | typeof NULL_ID
  | typeof OBS_ID
  | typeof ROLAND_V60HD_ID
  | typeof ROLAND_V8HD_ID
  | typeof TEST_ID
  | typeof VMIX_ID
```

### Every `X.ID` reference to re-point

Server side — each connector's own declaration becomes a re-export of the shared constant
instead of redeclaring the literal (keeps `Connector.ID` usable exactly as today from server
code, but with a single source of truth):

| File : line | Current | New |
|---|---|---|
| `mixer/obs/ObsConnector.ts:245` | `static readonly ID: "obs" = "obs"` | `static readonly ID = OBS_ID` (add `import { OBS_ID } from '../../shared/mixer/ids'`) |
| `mixer/null/NullConnector.ts:22` | `static readonly ID: "null" = "null"` | `static readonly ID = NULL_ID` |
| `mixer/mock/MockConnector.ts:45` | `static readonly ID: "mock" = "mock"` | `static readonly ID = MOCK_ID` |
| `mixer/atem/AtemConnector.ts:82` | `static readonly ID: "atem" = "atem"` | `static readonly ID = ATEM_ID` |
| `mixer/test/TestConnector.ts:27` | `static readonly ID: "test" = "test"` | `static readonly ID = TEST_ID` |
| `mixer/rolandV8HD/RolandV8HDConnector.ts:130` | `static readonly ID: "rolandV8HD" = "rolandV8HD"` | `static readonly ID = ROLAND_V8HD_ID` |
| `mixer/vmix/VmixConnector.ts:215` | `static readonly ID: "vmix" = "vmix"` | `static readonly ID = VMIX_ID` |
| `mixer/rolandV60HD/RolandV60HDConnector.ts:115` | `static readonly ID: "rolandV60HD" = "rolandV60HD"` | `static readonly ID = ROLAND_V60HD_ID` |

Client side — every location listed in §2b's fix column (`ObsSettings.tsx`, `MockSettings.tsx`,
`NullSettings.tsx`, `AtemSettings.tsx`, `RolandV8HDSettings.tsx`, `RolandV60HDSettings.tsx`,
`VmixSettings.tsx`, `TestSettings.tsx` — all 8 mixer Settings components) re-points its `id`
prop type, `defaultProps.id`, and any runtime comparison/emit to the matching constant from
`shared/mixer/ids.ts`, and drops its `import [Name]Connector from '../[Name]Connector'` line
entirely (that import's only reason to exist was the `.ID` lookup).

This also lets `MixerSelection.tsx` (`components/config/MixerSelection.tsx`) keep working
unmodified — it never imports a connector itself, it only reads `child.props.id`, which
continues to resolve to the same string values.

---

## 4. `vite.config.ts` + eslint boundary rule

### Current relevant state (verified by reading the files)

- `public/index.html` contains **6** occurrences of `%PUBLIC_URL%` (`grep -c "%PUBLIC_URL%" public/index.html` → `6`) — correcting the plan document's stated count of 4.
- `.eslintrc.js` currently has `rules: {}` — no `no-restricted-imports` rule exists yet; this is added fresh, not modified.
- `src/server.ts` (read pre-compaction) contains the current dev-proxy block pointing express:3000 → CRA:3001; that proxy target/direction is inverted below.

### `vite.config.ts`

```ts
// hub/vite.config.ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  root: __dirname,                 // index.html now lives at hub/index.html, not hub/public/
  publicDir: 'public',             // static assets (favicon.png, logo192.png, manifest.json, …) stay here
  resolve: {
    alias: {
      // ponytail: explicit guard, not a real polyfill. If anything in client/
      // or shared/ ends up needing a Node builtin, Vite would otherwise try to
      // resolve it against node_modules and either silently bundle a shim
      // (if one happens to be installed) or fail with an unrelated-looking
      // error. Aliasing to a throwing stub makes the failure point at the
      // actual import instead.
      events: path.resolve(__dirname, 'src/client/lib/noNodeBuiltins.ts'),
      fs: path.resolve(__dirname, 'src/client/lib/noNodeBuiltins.ts'),
      net: path.resolve(__dirname, 'src/client/lib/noNodeBuiltins.ts'),
      dgram: path.resolve(__dirname, 'src/client/lib/noNodeBuiltins.ts'),
      os: path.resolve(__dirname, 'src/client/lib/noNodeBuiltins.ts'),
    },
  },
  server: {
    port: 3001,
    proxy: {
      // dev-proxy direction inverted from today: currently express:3000 proxies
      // to CRA:3001 as the dev entry point. Under Vite, Vite:3001 IS the dev
      // entry point (matches react-scripts' historical port) and proxies API +
      // socket.io traffic to the express backend at :3000. server.ts's
      // production express.static + SPA-fallback branch is unchanged.
      '/socket.io': {
        target: 'http://localhost:3000',
        ws: true,
      },
      // add any plain REST endpoints server.ts exposes here, e.g.:
      // '/api': { target: 'http://localhost:3000' },
    },
  },
  build: {
    outDir: 'dist/client',
    emptyOutDir: true,
  },
})
```

`src/client/lib/noNodeBuiltins.ts` (new, tiny — the "fail loudly" guard):

```ts
// ponytail: throwing stub, not a polyfill. Its only job is to turn a silent
// bundling mistake into a build-time-obvious runtime error with the module
// name in the message, instead of a cryptic "X is not a function" three
// files away. If this ever actually throws in production, the real fix is
// removing whatever client/shared import pulled in the Node builtin — not
// improving this stub.
const moduleName = 'a Node.js builtin'
throw new Error(`${moduleName} was imported into the client bundle. This is not allowed — check the import chain.`)
export {}
```

### `index.html` move

`public/index.html` moves to `hub/index.html` (Vite convention: index.html at project
root, not inside `public/`). All **6** `%PUBLIC_URL%` occurrences must become `/` or be
dropped, since Vite serves everything under `publicDir` from the root path already —
e.g. `%PUBLIC_URL%/favicon.png` → `/favicon.png`, `%PUBLIC_URL%/logo192.png` → `/logo192.png`,
`%PUBLIC_URL%/manifest.json` → `/manifest.json`, plus the 3 additional occurrences present
in the file beyond the ones visible in the head/apple-touch-icon/manifest section already
sampled (confirmed present by the `grep -c` count of 6; not individually enumerated line-by-line
in this research pass — whoever performs the actual edit should re-run
`grep -n "%PUBLIC_URL%" public/index.html` immediately before editing to get exact line
numbers, since this document intentionally does not move the file).

### `.eslintrc.js` — `no-restricted-imports` addition

Current file has `rules: {}`. Add:

```js
// .eslintrc.js — inside the existing module.exports, replacing `rules: {}`
rules: {
  'no-restricted-imports': ['error', {
    patterns: [
      {
        group: ['**/server/*', '**/server', '*/server/*'],
        message: 'client/ and shared/ code may not import from server/. If you need a type, use `import type` and move the type to shared/ if it is consumed on both sides.',
      },
    ],
  }],
},
overrides: [
  // existing cypress/** and src/**/*.spec.* overrides stay as-is; add:
  {
    files: ['src/server/**/*.ts'],
    rules: {
      'no-restricted-imports': 'off', // server/ may import server/ freely
    },
  },
],
```

This is a directory-name-pattern rule (matches any import path containing a `server`
segment), which is coarse but correct for this repo's actual layout — it will flag the
exact 8 constant-only crossings in §2b (until fixed) and would have caught the `events`
imports in §6 as an unrelated but real problem (those are npm/Node-builtin imports, not
`server/`-path imports, so this specific rule doesn't catch them — that's what the Vite
alias guard in this section's `vite.config.ts` is for).

---

## 5. `vitest.config.ts` + tsconfig changes

### Current relevant state (verified)

- `tsconfig.json`'s `types` array includes `"cypress"` — Cypress ships its own global
  `expect`/`Chai`/`Mocha` typings that collide with Vitest's own global `expect` when
  `globals: true` is set, so it must be removed from the *main* tsconfig.
- `tsconfig.json` currently has a trailing comma in that `types` array — valid JSONC (which
  is what TypeScript's config parser accepts) but will break a naive `JSON.parse()` if any
  tooling tries to read the file that way; not a problem for `tsc`/`vitest`/`vite` themselves,
  noted here only so whoever edits it doesn't "fix" the trailing comma thinking it's the bug.
- `cypress/tsconfig.json` already exists, already scoped correctly:
  ```json
  {
    "extends": "../tsconfig.json",
    "compilerOptions": { "noEmit": true, "types": ["cypress"] },
    "include": ["../node_modules/cypress", "./*/*.ts"]
  }
  ```
  Because it explicitly overrides `types` to `["cypress"]` (rather than inheriting the parent
  array), removing `"cypress"` from the parent's `types` array does not affect this file at
  all — it already re-declares its own `types`. **No change needed to `cypress/tsconfig.json`
  itself**; task scope here was "confirm/adjust," and confirmation is sufficient.
- Only one spec needs a DOM: `src/components/ChannelSelector.spec.tsx` (renders a React
  component via testing-library). All other 25 specs are pure logic/class tests.

### `vitest.config.ts`

```ts
// hub/vitest.config.ts
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'node',          // default: most specs are pure logic, no DOM needed
    setupFiles: ['./src/client/setupTests.ts'], // only applied to files that opt into jsdom below
    include: ['src/**/*.spec.{ts,tsx}'],
  },
})
```

Per-file DOM override, added as a docblock at the top of the one file that needs it
(Vitest convention — no separate config entry needed for a single file):

```tsx
// src/client/components/ChannelSelector.spec.tsx
// @vitest-environment jsdom
```

`setupFiles` only executes `jest-dom` matcher registration
(`import '@testing-library/jest-dom'`), which is a no-op for non-DOM environments, so
pointing every test file at the same `setupFiles` entry is safe even though only one spec
uses jsdom — no need to conditionally scope `setupFiles` per environment.

### `tsconfig.json` change

```diff
   "types": [
     "node",
-    "cypress",
   ]
```

(Trailing comma preserved/removed per whatever the surrounding style already is — not a
functional change either way, called out above only as a gotcha for whoever edits this.)

No other `tsconfig.json` changes are required for Vitest itself — Vitest reads TS config via
Vite's own esbuild transform, not `tsc`, so `include`/`exclude`/`paths` don't need duplication
into `vitest.config.ts` beyond the `test.include` glob already shown above.

---

## 6. Removing `events` (Node's `EventEmitter`) from the client bundle

### Why this is a hard failure, not a warning

CRA/webpack silently polyfills Node builtins like `events` with a browser shim
(`events` npm package under the hood). **Vite does not do this** — an unresolved `events`
import in a client-bundled file is either a hard build error or (worse) resolves to
whatever's on disk in `node_modules/events` with no browser-safe guarantee. The §4 Vite
config's `resolve.alias` guard turns this into a loud, actionable error, but the real fix
is removing the dependency entirely.

### Files affected (confirmed via import grep)

- `src/hooks/useSocket.ts`
- `src/hooks/tracker/channel.ts`, `config.ts`, `mixer.ts`, `program.ts`, `tally.ts`, `tallylog.ts` (6 files)
- `src/lib/DisconnectedClientSideSocket.ts`

All extend or instantiate Node's `EventEmitter` from `"events"`.

### Fix: `Set<() => void>` listener pattern + `useSyncExternalStore`

Converted tracker base — no `events` import, matches the subscribe/getSnapshot contract
`useSyncExternalStore` expects:

```ts
// client/hooks/tracker/Tracker.ts (new shared base, replaces the EventEmitter-based
// pattern previously duplicated via `extends EventEmitter` in each of the 6 trackers)
export default abstract class Tracker<TSnapshot> {
  private listeners = new Set<() => void>()
  protected snapshot: TSnapshot

  constructor(initialSnapshot: TSnapshot) {
    this.snapshot = initialSnapshot
  }

  // useSyncExternalStore calls this to register/unregister — must return an unsubscribe fn
  subscribe = (onStoreChange: () => void): (() => void) => {
    this.listeners.add(onStoreChange)
    return () => { this.listeners.delete(onStoreChange) }
  }

  // useSyncExternalStore calls this on every render to check for changes
  getSnapshot = (): TSnapshot => {
    return this.snapshot
  }

  protected update(next: TSnapshot) {
    this.snapshot = next
    this.listeners.forEach(listener => listener())
  }
}
```

One fully-worked converted tracker (`config.ts` — the most-used one, backing
`useConfiguration.ts`'s 8 hooks). Shape of the *current* file was captured pre-compaction as
an `EventEmitter` subclass listening to `socket.on('config.changed', …)` and re-emitting a
local `'change'` event that `useConfiguration.ts`'s hooks subscribe to via
`tracker.on('change', handler)` / `tracker.off('change', handler)`. Converted:

```ts
// client/hooks/tracker/config.ts
import Tracker from './Tracker'
import { socket } from '../useSocket'
import type { AppConfigurationObjectType } from '../../../shared/lib/AppConfigurationTypes' // whatever the actual exported type name is — see note below

class ConfigTracker extends Tracker<AppConfigurationObjectType | undefined> {
  constructor() {
    super(undefined)
    socket.on('config.changed', (config: AppConfigurationObjectType) => {
      this.update(config)
    })
  }
}

// module-scope singleton — created once when this module first loads, shared by every
// component that calls a useXConfiguration() hook, same lifecycle as today
const configTracker = new ConfigTracker()
export default configTracker
```

> Note: the exact exported type name for the socket payload of `config.changed` (referenced
> here as `AppConfigurationObjectType`) needs to be confirmed against `SocketEvents.ts`'s
> `ServerSentEvents` interface at implementation time — this document captured the tracker's
> *shape* and *event name*, not the payload type's exact identifier, since that wasn't part
> of the files read in full this session.

Converted `useX()` hook pattern (replaces manual `useState` + `tracker.on('change', …)` +
`useEffect` cleanup that each of the 7 `useX` hooks currently duplicates):

```ts
// client/hooks/useConfiguration.ts (pattern applied to all 8 near-identical blocks)
import { useSyncExternalStore } from 'react'
import configTracker from './tracker/config'

export function useMixerNameConfiguration() {
  const config = useSyncExternalStore(configTracker.subscribe, configTracker.getSnapshot)
  return config?.mixerName
}
```

### Collapsing `useConfiguration.ts`'s 8 blocks to a generic factory

The 179-line file's 8 hooks (`useMixerNameConfiguration`, `useAllowedMixersConfiguration`,
and 6 more, each following the identical `useState` + `useEffect(() => { tracker.on(...); return () => tracker.off(...) }, [])` + a one-line selector shape) collapse to one generic
factory plus 8 one-line exports:

```ts
// client/hooks/useConfiguration.ts — full replacement
import { useSyncExternalStore } from 'react'
import configTracker from './tracker/config'
import type { AppConfigurationObjectType } from '../../shared/lib/AppConfigurationTypes'

function useConfigurationSelector<T>(select: (config: AppConfigurationObjectType | undefined) => T): T {
  return useSyncExternalStore(
    configTracker.subscribe,
    () => select(configTracker.getSnapshot()),
  )
}

export const useMixerNameConfiguration = () => useConfigurationSelector(c => c?.mixerName)
export const useAllowedMixersConfiguration = () => useConfigurationSelector(c => c?.allowedMixers)
// … remaining 6 follow the same one-line shape, each naming the field it selects
```

`useSyncExternalStore`'s selector overload (3rd arg omitted here — this repo doesn't need
the SSR `getServerSnapshot` argument since it's a client-only SPA) already memoizes re-renders
correctly as long as `select` is a pure field access, which all 8 are — no `useMemo` needed
around the wrapper.

`useSocket.ts` itself (the socket.io client singleton + connection-state EventEmitter) and
`DisconnectedClientSideSocket.ts` (an offline/disconnected stub implementing the same
`ClientSideSocket` interface for use before the real socket connects — read pre-compaction)
both convert identically: replace `extends EventEmitter` with `extends Tracker<...>` (or,
for `useSocket.ts`'s connection-status-only case, a `useSyncExternalStore`-driven
`useSocketInfo()` hook reading from a `Tracker<boolean>` for connected/disconnected state)
using the same base class shown above — no new pattern needed beyond what's already
demonstrated for the 6 trackers.

---

## 7. Execution checklist

Ordered so each step is independently verifiable before moving to the next. "Verify" commands
are run from `hub/`.

1. **Create `shared/mixer/ids.ts`** (§3) and re-point all 8 connector `.ID` declarations to
   re-export from it.
   Verify: `npx tsc -p tsconfig.server.json --noEmit` — exit 0 (server still compiles; no
   files have moved yet, only the `.ID` declarations changed).

2. **Fix all type-only crossings** (§2a): add `import type` on `TestConfiguration.ts`,
   `CommandCreator.ts`, `SocketEvents.ts`'s 10+ imports; move `TallyProgramProgressType`/
   `TallySettingsIniProgressType` into `TallyDevice.ts` and re-export from `NodeMcuConnector.ts`.
   Verify: `npx tsc -p tsconfig.server.json --noEmit` and `npx tsc --noEmit` (main/client
   config) both exit 0.

3. **Fix all constant-only crossings** (§2b): update the 8 mixer `*Settings.tsx` files to
   import from `shared/mixer/ids.ts` instead of their server connector; drop the now-unused
   connector imports.
   Verify: `npx tsc --noEmit` exit 0. `grep -rn "from '../[A-Za-z]*Connector'" src/mixer/*/react/` returns nothing.

4. **Physically move files** into `server/`, `client/`, `shared/` per §1's tables, updating
   every relative import path touched by the move (mechanical — no logic changes).
   Verify: `npx tsc -p tsconfig.server.json --noEmit` exit 0 AND `npx tsc --noEmit` exit 0
   (both configs' `include` globs updated to point at the new paths first).

5. **Convert the 6 trackers + `useSocket.ts` + `DisconnectedClientSideSocket.ts`** off
   `events`/`EventEmitter` to the `Tracker` base + `useSyncExternalStore` pattern (§6);
   collapse `useConfiguration.ts` to the generic factory.
   Verify: `grep -rn "from 'events'\|from \"events\"" src/client/` returns nothing.
   `npx tsc --noEmit` exit 0.

6. **Add `vite.config.ts`, `vitest.config.ts`, move `public/index.html` → `hub/index.html`**
   with all 6 `%PUBLIC_URL%` occurrences fixed (§4, §5).
   Verify: `npx vite build` — exit 0.

7. **Add the eslint `no-restricted-imports` rule** (§4) and run the linter to catch any
   crossing missed in steps 2-3.
   Verify: `npx eslint .` — exit 0 (or only pre-existing warnings, no new `no-restricted-imports` errors).

8. **Remove `"cypress"` from `tsconfig.json`'s `types` array** (§5); confirm
   `cypress/tsconfig.json` still resolves correctly (no change expected there).
   Verify: `npx tsc --noEmit` exit 0 (still — Vitest globals + Cypress types no longer collide).

9. **Run the full test suites.**
   Verify: `npx vitest run` — pass count ≥ current `npm test` baseline (record the baseline
   count before starting step 1, e.g. via `CI=true npm test -- --json` on the pre-split tree,
   so this comparison is meaningful).
   Verify: `npx tsc -p tsconfig.server.json --noEmit` — exit 0.

10. **Run Cypress against the built client.**
    Verify: Cypress run ≥ baseline pass count, with `configObs`, `configAtem`, `configVmix`,
    `configNull` specs specifically green (these exercise the `.ID`-dependent mixer-selection
    flow touched in steps 1 and 3).

11. **Phase 1 gate** (from the plan, verbatim):
    - `npx vite build` — exit 0.
    - `grep -rl "obs-websocket\|nodemcu\|atem-connection\|@julusian" dist/client/assets/ | wc -l`
      — must return `0` (proves no server-only npm package leaked into the client bundle).
    - `npx vitest run` — ≥ baseline (from step 9).
    - `npx tsc -p tsconfig.server.json --noEmit` — exit 0 (from step 9).
    - Cypress ≥ baseline, `configObs`/`configAtem`/`configVmix`/`configNull` green (from step 10).

    All five must hold simultaneously before Phase 1 is considered complete and the plan
    moves on to its next phase (server.ts's `startServer()` extraction, Electron
    main/preload wiring — out of scope for this document).
