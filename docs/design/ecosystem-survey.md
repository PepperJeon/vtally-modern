# wifi-tally Ecosystem Survey

Purpose: check whether upstream, its forks, or adjacent open-source projects already cover work we're planning, before we build it ourselves. Findings are concrete (repo, commit, date, license) per point below.

## 1. Is upstream alive?

No. `wifi-tally/wifi-tally` is functionally abandoned.

- Last human commit: **2022-01-21**. Everything since is dependabot version-bump PRs — over a dozen sit open, unmerged, since 2022–2023.
- A human contributor's PR (`benaja`, #121, vMix reconnect + Apple Silicon build fix) was never merged.
- Issue **#131 "OBS Websocket 5 support"**, opened 2023-06-05, has zero maintainer response. This directly confirms our obs-websocket v5 port is genuinely unaddressed upstream — nobody fixed it, nobody's actively asking beyond that one issue.
- 95 stars, no maintainer statement of abandonment, but the commit/PR/issue pattern is unambiguous: nobody is driving this repo.

Conclusion: we are not going to get upstream fixes. Anything we need, we build or find elsewhere.

## 2. Fork survey

32 forks total (`gh api repos/wifi-tally/wifi-tally/forks --paginate`). Raw "ahead_by" counts from the GitHub compare API are **misleading** — most forks default to `main` while upstream is on `master`, and that branch rename alone produces spurious ahead-counts of 50-60+ with zero real commits. Filtering by commit date after upstream's last commit (2022-01-21) isolates genuine new work. Only 4 forks have any:

| Fork | New commits | What it is | Usefulness |
|---|---|---|---|
| [`jcalado/wifi-tally`](https://github.com/jcalado/wifi-tally) | 4 | A TriCaster mixer connector, following the exact `{Mixer}Configuration.ts` + `.spec.ts` + `{Mixer}Connector.ts` + `react/` pattern our codebase already uses under `src/mixer/{mixername}/`. | **Highest** — architectural reference for how a new connector should be structured, even though we don't need TriCaster support ourselves. |
| [`benaja/wifi-tally`](https://github.com/benaja/wifi-tally) | 9 | vMix reconnect-on-drop fix + Apple Silicon/M1 build support. Both submitted upstream as PR #121, never merged. | Moderate — known historical precedent for the exact M1/arm64 native-module problem we're independently solving in `native-deps.md`. Confirms it's not a new problem. |
| [`trigx300/wifi-tally-esp32`](https://github.com/trigx300/wifi-tally-esp32) | 2 | Alternative ESP32 firmware flashed via Arduino IDE, not our NodeMCU/Lua + nodemcu-tool approach. | Low-moderate — only relevant if/when we consider ESP32 support; not applicable to the current serialport/nodemcu-tool fix. |
| [`pramuan/wifi-tally`](https://github.com/pramuan/wifi-tally) | 1 | Personal Lua config tweak. | Negligible. |

None of the other 28 forks contain anything beyond the branch-rename noise (leotiag0, ancientxfire, almeidasinop, etc. — zero real commits).

**Feelworld, Vite, webpack 5, React 18/19, MUI v5, Electron packaging: not found in any fork.** Checked via commit history across all forks, plus `gh search code` and `gh search issues/prs` across the `wifi-tally` org — zero hits for "feelworld" anywhere in the org.

## 3. Adjacent open-source projects

- **`RedyAu/multitally`** — see §4, this is the significant find, a real Feelworld protocol implementation. Not a fork or Companion module; a standalone Flutter mobile app.
- **Bitfocus Companion**: no Feelworld module exists. One open feature request, [`bitfocus/companion-module-requests#1678`](https://github.com/bitfocus/companion-module-requests/issues/1678), has community-reverse-engineered hex commands but for the Feelworld **L4 switcher**, a different device from the L1/L2 Plus tally units vTally targets. Limited direct applicability.
- No Roland V-8HD Companion module exists either (open request #1051). That issue explains the V-8HD is MIDI/serial-only with no IP control — this validates vTally's existing MIDI-based `RolandV8HDConnector.ts` approach; there's nothing to adopt here, but also nothing wrong with what we already have.
- **`bitfocus/companion-module-obs-studio`** — MIT licensed, actively maintained (pushed 2026-07-25, i.e. yesterday). This is a strong reference for the obs-websocket v5 port: it's a live, working implementation of the exact protocol version we need to migrate to, maintained by a team that tracks obs-websocket releases closely. Worth reading for message-shape/event-name validation while porting, not for wholesale copying (different language/framework — Companion modules are standalone Node.js, ours is embedded in the vTally hub).
- No dedicated ATEM or vMix Companion modules were checked in depth — out of scope for the current 5 units, noted for completeness only.

## 4. License check

**vTally is MIT, not GPL-3.0.** Verified three ways: `gh api repos/wifi-tally/wifi-tally --jq '.license.spdx_id'` → `MIT`; the actual `LICENSE` file content ("MIT License / Copyright (c) 2020 dev at xopn.de"); and the lost v1.0.0 `hub/package.json` (`docs/lost-v1.0.0-package.json`) declares `"license": "MIT"`. An earlier draft of this survey wrongly called it GPL-3.0 — corrected below. (`hub/package.json` today has no `license` field at all — see §6.)

Every license below was checked by reading the repo's actual `LICENSE` file content directly, not the GitHub API's `license.spdx_id` field — the API field is what produced the wrong GPL-3.0 reading on `redyau/multitally` initially reported and had to be double-checked, so it can't be trusted alone.

| Repo | License (verified via LICENSE file) | Can we copy code? |
|---|---|---|
| `wifi-tally/wifi-tally` (upstream) | **MIT** | Same license as vTally — freely reusable. |
| `jcalado/wifi-tally` | MIT (inherited, unmodified) | Freely reusable — architectural pattern in particular is fine to follow. |
| `benaja/wifi-tally` | MIT (inherited, unmodified) | Freely reusable, including the M1 build fix if it turns out relevant. |
| `trigx300/wifi-tally-esp32` | MIT (inherited, unmodified) | Freely reusable. |
| `pramuan/wifi-tally` | MIT (inherited, unmodified) | Freely reusable (though the content itself is negligible). |
| `bitfocus/companion-module-obs-studio` | MIT | Freely reusable — reference or lift snippets with attribution. |
| **`RedyAu/multitally`** | **GPL-3.0** (confirmed via `gh api repos/redyau/multitally` *and* the actual `LICENSE` file text) | **Look-but-don't-copy.** The only repo in this survey in that category. |

**`redyau/multitally` is the one real constraint here, and it's sharper than the original task framing suggested.** vTally is MIT. Pulling GPL-3.0 source into an MIT codebase doesn't just create "a licensing mismatch" in the abstract — it forces the derived work to become GPL-3.0, and tallylite-web is a live, actively-selling storefront for this product. So this isn't a preference or a nice-to-have: **do not copy, port, or transcribe source from `redyau/multitally` into vTally.** Read it only to learn the Feelworld Open API's protocol shape (endpoints, message formats), then write vTally's own implementation from that understanding, the same way you'd read a public API's documentation. If a future contributor is ever unsure whether something they wrote is "close enough" to `multitally`'s code to count as a derivative work, treat that as a stop-and-ask, not a judgment call to make alone.

No other repo touched in this survey falls into the "look but don't copy" category — every fork and every Companion module checked here is MIT, same as vTally, and safe to reference or adapt freely.

## 5. Recommendations per planned unit

| Unit | Recommendation | Reasoning |
|---|---|---|
| **obs-websocket v5 port** | **Reference** `bitfocus/companion-module-obs-studio` (MIT) for protocol/message-shape validation while porting. **Ignore** upstream issue #131 — no code, no response. | Nobody upstream did this work; Companion's module is the closest live, correct implementation of the target protocol version, safe to consult under MIT. |
| **Feelworld connector** | **Reference** `RedyAu/multitally` for protocol facts only (endpoints, message formats it discovered by reverse-engineering the Feelworld Open API) — **do not copy its source**, its GPL-3.0 license would force our MIT codebase's derived work to GPL-3.0. **Ignore** the Companion feature request (#1678, wrong device model, no real code). | This is genuine, real-world prior art for the exact device family we're building from scratch — worth reading before implementing, but must be treated as "read and reimplement," not "port." |
| **Vite/React migration** | **Ignore.** Nobody has done this anywhere in the ecosystem — no fork, no adjacent project. | Confirmed via fork commit survey, `gh search code`, and web search; clean negative result. We're on our own for this one. |
| **Electron packaging** | **Ignore** wifi-tally-specific prior art (none exists). **Reference** general `electron-vite`/`@electron-forge/plugin-vite` community docs (already covered in `native-deps.md`) for the packaging mechanics themselves — that's generic Electron/Vite knowledge, not wifi-tally-specific. | No fork or related project has attempted Electron packaging of wifi-tally. This confirms the packaging plan in `native-deps.md` isn't duplicating anyone's existing, testable work — we have to get it right ourselves. |
| **serialport/nodemcu-tool fix** | **Reference** `benaja/wifi-tally`'s M1/Apple-Silicon build fix (PR #121, never merged upstream) as historical confirmation the arm64 native-module problem is real and others hit it too. **Adopt** our own patch from `native-deps.md` — benaja's fix predates the serialport 8→13 API break we're solving and doesn't address it. | Confirms the problem class, doesn't solve our specific instance of it; the scoped patch already designed is still the right path. |

## 6. License rules for this project

Instructions for whoever implements the Feelworld connector (or reads this doc under time pressure — read this section, skip the rest if you must):

- **vTally is MIT-licensed.** Confirmed via upstream's `LICENSE` file and the lost v1.0.0 `hub/package.json`.
- **`hub/package.json` currently has no `"license"` field at all.** npm treats an absent field as UNLICENSED (all rights reserved) by default, which is misleading for an MIT project and worth fixing independent of this survey. Add:
  ```json
  "license": "MIT",
  ```
  (placed anywhere in the top-level object, e.g. right after `"private": true`).
- **May copy/adapt freely (MIT, verified via LICENSE file, not the GitHub API field):** upstream `wifi-tally/wifi-tally`, all 4 forks with real commits (`jcalado`, `benaja`, `trigx300`, `pramuan`), `bitfocus/companion-module-obs-studio`.
- **May only read, never copy:** `RedyAu/multitally` (GPL-3.0). Learn the Feelworld protocol from it, then write vTally's own implementation. Do not paste, closely paraphrase, or structurally mirror its source files. If in doubt whether something counts as "close enough" to be a derivative work, stop and ask rather than deciding alone — the product is being sold commercially via tallylite-web, so this is the one mistake in this survey that's expensive to undo.
- **Always verify a license by reading the actual `LICENSE` file content**, not the GitHub API's `license.spdx_id` field or a repo description — the API field is what produced a wrong reading in this survey's first draft, and it's not something you can shortcut past.

## Bottom line

Upstream is dead and nobody meaningfully forked it forward. Of five planned units, four have zero prior art anywhere in this ecosystem (Vite/React migration, Electron packaging, obs-websocket v5 port has no *wifi-tally* prior art though Companion's module is a useful MIT reference, and the serialport fix is ours to make). The one real find is `RedyAu/multitally` — genuine Feelworld protocol prior art, but GPL-3.0 against our MIT codebase, so it's a "learn the protocol, write our own code" source, not a "port this" source. Everything else in this ecosystem is MIT and freely reusable. Everything else we still need: we're building from scratch, as planned.
