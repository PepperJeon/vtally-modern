# Firmware / tally-device survey

Everything analysed elsewhere in `docs/design/` is about `hub/`. This doc looks at the other
half of the product: the ESP8266 tally light itself — `tally/`, `firmware/`, `documentation/`.
Read-only investigation; no source edits, no builds, no git commands. Where the repo alone
can't answer a question, that's stated explicitly rather than guessed.

## 1. What actually ships to the device

Two independent artifacts get flashed onto the ESP8266, built by two independent pipelines,
and only merged together at release-packaging time.

**A. The base NodeMCU firmware (C, not part of this project's source)**
- Not in this repo. Built from `nodemcu/nodemcu-firmware` pinned at ref
  `3.0-master_20200610` (see `.github/workflows/build.yml`, job `tally-firmware`), with a
  fixed module list: `encoder,file,gpio,net,node,pwm2,struct,tmr,uart,wifi,ws2812`.
- Historically this *was* in-repo; `Changelog.md` v0.1.0 records `[BREAKING] The firmware is
  no longer part of the repository and will be built on Travis.`
- `firmware/script.sh` (in-repo) is a modified clone of
  [`marcelstoer/nodemcu-custom-build`](https://github.com/marcelstoer/nodemcu-custom-build)'s
  build script: runs `make all` inside the checked-out `nodemcu-firmware` tree using the
  `esp-open-sdk` toolchain, then uses `srec_cat` to merge the two flashed segments
  (`0x00000.bin` and `0x10000.bin`, gap filled with `0xff`) into one flashable image. Only
  the "float" build variant is produced (the "integer" variant is commented out).
- `firmware/README.md` confirms this is CI-only: *"The firmware is build on travis... If you
  need a firmware for development, get it from the latest release."* It links to GitHub
  Releases, not to a local build path.
- `firmware/*.bin` is gitignored at the repo root (`.gitignore`: `firmware/*.bin`) — binaries
  are never committed, consistent with what `NodeMcuConnector.getLocalFiles()` implicitly
  assumes (nothing under `firmware/` at runtime).
- License of the borrowed build script: `firmware/LICENSE` is MIT (Marcel Stör, 2015) —
  compatible, no action needed.

**B. The tally application (Lua, this project's actual product code)**
- Source: `tally/src/*.lua`, 8 files, 25.2 KB total source:

  | file | bytes | role |
  |---|---|---|
  | `init.lua` | 19 | boot entrypoint — kept as **source**, not compiled (see below) |
  | `my-app.lua` | 1,403 | wiring: requires all modules, boot-reason logging, settings validation gate |
  | `my-tally.lua` | 3,961 | UDP wire protocol — device half (see §2) |
  | `my-wifi.lua` | 2,114 | STA connect/reconnect state machine |
  | `my-settings.lua` | 6,324 | parses `tally-settings.ini`, exposes typed getters |
  | `my-led.lua` | 8,252 | PWM/WS2812 LED driver, flash-pattern engine |
  | `my-log.lua` | 1,355 | logging facade (terminal + remote-to-hub) |
  | `my-log-buffer.lua` | 1,773 | small ring buffer for logs queued before hub connects |

- Build process: `tally/Makefile`. Discovers `src/*.lua` via wildcard, excludes `init.lua`
  from the compile set, compiles everything else to `out/*.lc` via `luac.cross` (external
  tool, not vendored in-repo — expected on `PATH`). `init.lua` itself is copied into `out/`
  **as source**, not compiled.
- **Why `init.lua` stays as `.lua` while everything else becomes `.lc`**: NodeMCU auto-boots
  from a literal file named `init.lua` on the device filesystem — it must be interpretable
  source, it can't be a bytecode file the interpreter loads by convention. `init.lua`'s
  entire body is one line: `dofile("my-app.lc")` — so it does nothing but hand off to the
  *compiled* app immediately. The Makefile's `flash`/`flash-dev`/`flash-prod` targets do an
  `init.lua` → `_init.lua` rename dance during upload specifically so a bad flash can't leave
  the device in an endless-reboot loop (a partially-written `init.lua` would otherwise crash
  on every boot with no recovery path).
- `.lua` vs `.lc` in `getLocalFiles()`: the filter `file.endsWith(".lc") || file.endsWith(".lua")`
  is exactly right for this build — it picks up every compiled module (`.lc`) plus the one
  file that's deliberately never compiled (`init.lua`).
- CI does check this build in: `.github/workflows/build.yml` has a dedicated `tally-build`
  job that installs `busted` (via `luarocks`) and the CI-built `luac.cross` artifact, runs
  `make test` then `make build` inside `tally/`, and archives `./tally/out` as the
  `tally-dist` artifact. Local dev tooling for this is **not** vendored — none of
  `luac.cross`, `nodemcu-tool`, `busted` are on this machine's `PATH` (checked non-invasively
  with `which`; did not run `make build`, which would write into the repo).
- Release assembly: job `tally-upload` downloads both the `nodemcu-firmware` artifact (the
  `.bin`) and the `tally-dist` artifact (the `.lc`/`.lua`/`.ini.example` files) into one
  directory literally named `esp8266`, then zips it as `vtally-<version>-esp8266.zip` — this
  is the file linked from `documentation/docs/getting-started/setup-wifi-tally.md` for manual
  flashing. Separately, job `bundle-and-upload` does the same download into
  `hub/dist/esp8266` before `npm pack`, which is the definitive confirmation that in the
  published npm package, `esp8266/` is a sibling directory to the packaged hub code — this
  directly matches `getLocalFiles()`'s release-path assumption (§4).

## 2. Wire protocol — hub and tally agree, verified line-by-line

Directly compared `hub/src/tally/CommandCreator.ts` + `CommandParser.ts` (hub side, read-only)
against `tally/src/my-tally.lua` (device side). Both directions match exactly, in every
literal detail — marker characters, field widths, zero-padding, terminator.

**Hub → tally (state/color), built by `CommandCreator.createStateCommand()`:**
```
O###/###/### S###/###/###                    (25 chars, static color)
O###/###/### S###/###/### 0xXX YYY           (34 chars, + flash pattern)
```
`O` = operator-light RGB, `S` = stage-light RGB, each channel zero-padded to 3 digits.
`0xXX` is an 8-step flash-pattern bitmask (uppercase hex, zero-padded to 2 digits); `YYY` is
the per-step duration in ms (zero-padded to 3 digits). `highlight` state uses
`0xAA`/`125ms`; `unknown` state uses `0x80`/`250ms`.

`tally/src/my-tally.lua`'s `parseMessage()` requires exactly 25 or 34 chars, checks the
literal marker bytes at fixed offsets (`data:sub(1,1) == "O"`, `data:sub(13,14) == " S"`,
`" 0x"` at 26-28, etc.), and decomposes the pattern byte via an 8-entry `{128,64,32,16,8,4,2,1}`
bit-test table — because the ESP8266's Lua 5.1 has no native bitwise operators. This confirms
why the hub encodes the pattern as hex text rather than sending a raw byte: it's not a
protocol quirk, it's working around a language limitation on the receiving end.

**Tally → hub (control messages), sent from `MyTally:send()` (adds a trailing `\n`):**
```
tally-ho "<name>"                             -- announce/heartbeat
log "<name>" <SEVERITY> "<message>"           -- remote logging
```
`hub/src/tally/CommandParser.ts` parses these with `^([^ ]+) "(.+)"` and
`^([^ ]+) "(.+)" ([^ ]+) "(.*)"` respectively — matches the Lua format strings
(`'tally-ho "%s"'`, `'log "%s" %s "%s"'`) exactly, including unrecognized-severity handling
(hub defaults to `"ERROR"`, matching that the Lua side always sends one of `INFO`/`WARN`/`ERROR`).

Both sides listen/send on UDP port `7411`.

**This is the one thing Cypress can't test** — confirmed, and worth restating: none of the
`cypress/**/*.spec.ts` suite (per `.github/workflows/build.yml`'s `cypress-run` job) can
exercise real Lua-side parsing, because there is no tally hardware or firmware in that CI
job. The only thing keeping the two sides in sync is a human reading both files at once —
which is what this section just did, once.

**`documentation/docs/protocol.md` exists but is completely empty.** There is a dedicated
file for exactly this documentation and it has zero content. This is the actual reason the
comparison above had to be done by hand from source; see §6.

## 3. Version coupling — manual, changelog-driven, no handshake

No automated version check exists anywhere in the protocol. Confirmed by reading both
protocol halves (§2) — neither side sends a version number — and by
`tally/spec/version_spec.lua`, whose only assertion is:
```lua
assert.is_same("Lua 5.1", _VERSION)
```
That's a build-environment sanity check ("are we compiling against the right Lua"), not an
application-level version marker. There is no version string anywhere in `tally/src/*.lua`.

Coupling is entirely manual, tracked in prose in `Changelog.md`. The convention is explicit
and has been used consistently across releases:
- v0.4.0: `"**IMPORTANT**: Code on the Tally **HAS** changed. Tallies and the Hub will not be
  able to communicate unless you also update the .lc files on the Tallies."` — paired with
  `"[BREAKING] The protocol between Tally and Hub has been modified... necessary because we
  reached the memory limit on NodeMCU with the newly added features."` So the protocol has
  broken compatibility before, and the trigger was ESP8266 memory pressure, not a feature
  request — worth knowing if `/flasher` or the wire format changes again.
- v0.4.1 → v0.4.2: `"Code on the Tally did not change from v0.4.1"` — the changelog explicitly
  tells users a re-flash is *not* required.
- v0.1.0: firmware moved out of the repo (see §1) and `"[BREAKING] The firmware needs to be
  updated as the ws2812 module was added"` — so the *base* firmware and the *Lua app* are
  versioned and communicated about separately in this project's own language, even though
  they ship together in one zip/flash step.

**In practice, this means**: if a v0.5.2 hub talks to a tally running older firmware, nothing
in the software detects or reports the mismatch. Best case, the old firmware simply doesn't
understand a newer field (e.g. an older tally with no flash-pattern support ignores the
`0xXX YYY` suffix, since `parseMessage()` only accepts exact 25/34-char lengths — anything
else silently returns without setting a color). Worst case (memory-limit-driven full protocol
break like v0.4.0), the tally never responds to hub commands at all and there's no error
surfaced anywhere except a tally that looks "stuck" or dark. Nothing in this repo detects
that condition; the only mitigation is the Changelog telling a human operator to re-flash.

## 4. What `getLocalFiles()` actually expects — and why this is a packaging gap, not a design flaw

```ts
// hub/src/flasher/NodeMcuConnector.ts, read-only reference
private static async getLocalFiles() {
  let dirName = __dirname + "/../../esp8266"        // path in release package
  const files = await fs.readdir(dirName).catch(e => {
    dirName = __dirname + "/../../../tally/out"       // path during development
    return fs.readdir(dirName)
  })
  ...
}
```

Both paths were checked against how the project actually ships, not just read as strings:

- **Release path** (`../../esp8266`): confirmed correct. `.github/workflows/build.yml`'s
  `bundle-and-upload` job downloads both the `nodemcu-firmware` artifact and the `tally-dist`
  artifact into `hub/dist/esp8266`, then does `npm pack` from `hub/dist`. So in the published
  npm package, `esp8266/` is a sibling of the packaged hub app root — two `..` from wherever
  `NodeMcuConnector.js` ends up in the compiled output lands exactly there. This path is not
  a guess; the CI job is the ground truth for it.
- **Dev path** (`../../../tally/out`): from `hub/src/flasher/`, three levels up lands at the
  repo root, then `/tally/out` — the exact output directory the `tally-build` CI job also
  produces via `make build` in `tally/`. This is also correct for the intended monorepo dev
  layout (hub/ and tally/ as sibling directories).

**So neither fallback path is wrong, and this is not "absent by design."** Per the task
framing: this repo *does* have a `tally/` directory, and `tally/out` is checked — it does not
exist in this checkout:
```
$ ls tally/out
ls: tally/out: No such file or directory
```
`tally/.gitignore` confirms `out/` is intentionally gitignored (build output, never
committed) — so its absence here isn't a broken checkout, it's a checkout where `make build`
has simply never been run. The release path (`esp8266/`) also doesn't exist at the repo root
in this checkout, for the same reason (it's assembled by CI, never committed — root
`.gitignore` covers `firmware/*.bin`, and `esp8266/` as a whole isn't checked in either).

**The actual bug is one level up from both paths.** `getLocalFiles()`'s `.catch()` only
covers the *first* `readdir` failing; if the second `readdir` (the dev fallback) *also*
fails — exactly the situation in a hub-only or not-yet-built checkout — the returned promise
rejects, uncaught, out of `getLocalFiles()` entirely. Both call sites make it worse:
- `getDevice()` calls `await NodeMcuConnector.getLocalFiles()` **before** entering its own
  `try { ... } catch (e) { tallyDevice.errorMessage = e; ... }` block (line 175 vs. the `try`
  starting at line 181) — so the one piece of error handling that exists in this method
  can't reach this failure at all.
- `program()` has the same shape: `getLocalFiles()` is called at the top, outside its `try`.

That rejected promise becomes an unhandled promise rejection wherever an Express route calls
into these methods without its own `try`/`catch` — which, by default Node.js behavior for
unhandled rejections, terminates the whole process. That matches the reported symptom
exactly ("`/flasher` crash that takes down the whole backend").

**Recommended fix, precisely scoped**: this needs a fix *inside* `getLocalFiles()` — catch
the case where both `readdir` calls fail and return `[]` (empty file list) instead of letting
the rejection propagate. The code already has a designed-for "no files available" state:
`getDevice()` sets `tallyDevice.update = "not-available"` when `localFiles.length === 0`
(line 176-178). Making `getLocalFiles()` return `[]` on total failure means that existing
"not available" UI state fires correctly instead of crashing — no new state needs to be
invented, the fallback machinery already exists and just isn't reached. This is not a call
that belongs to this task (no source edits here per constraints, and Phase 1 is mid-flight in
a separate worktree — see the pre-existing `ponytail:` comment at the top of
`NodeMcuConnector.ts` handling an *adjacent but distinct* problem: `nodemcu-tool`'s native
serialport binding failing to `require()` on modern Node/darwin-arm64. That fix stubs out the
whole `nodemcu` object with a Proxy; it does not touch `getLocalFiles()`'s directory-fallback
logic, so this crash is still live even with that stub in place).

Separately, and only if the flasher's file-upload feature needs to actually work in this dev
checkout: `make build` in `tally/` would produce `tally/out/`, but that requires
`luac.cross`, `nodemcu-tool`, and `busted` on `PATH` — none of which are installed here
(confirmed via `which`, did not attempt the build itself since that would write into the
repo). That's a separate, lower-priority gap (dev-environment setup, not a crash) — nothing
in `documentation/` currently tells a hub-only or fresh-clone developer that this build step
is a prerequisite for the flasher to have anything to flash.

## 5. Electron packaging — checking `native-deps.md`'s `extraResources` assumption

`native-deps.md` recommends shipping the `esp8266/` directory via Electron's `extraResources`.
Checked what that directory actually contains, by size:

- Lua source total: 25.2 KB across 8 files (see §1 table) — after compilation, `.lc`
  bytecode files are typically similar order of magnitude to source (sometimes smaller,
  sometimes slightly larger depending on debug info stripping); no `.lc` files exist in this
  checkout to measure directly since `tally/out/` hasn't been built (§4), so this is an
  estimate, not a measurement.
- `init.lua`: 19 bytes, shipped as source (not compiled, see §1).
- `tally-settings.ini.example`: 149 bytes, shipped as a text template — the actual
  `tally-settings.ini` is per-device and gitignored (`tally/.gitignore`:
  `tally-settings.ini*` / `!tally-settings.ini.example`), never bundled.
- The base NodeMCU firmware `.bin`: this repo does not produce or store this file, and its
  size can't be determined from repo contents alone — the closest available figure is the CI
  build naming pattern `nodemcu-<ref>-<hash>-float.bin`, but the actual byte size depends on
  the enabled module set and isn't recorded anywhere in this repo. **This needs to be
  measured from an actual release download** (`vtally-<version>-esp8266.zip` from GitHub
  Releases, linked in `firmware/README.md` and `documentation/docs/getting-started/setup-wifi-tally.md`)
  rather than estimated here.

**Bottom line for packaging**: the Lua-application half of `esp8266/` is trivially small
(tens of KB, all text/bytecode, no native binaries) and `extraResources` is more than
sufficient for it. The one binary in the mix — the NodeMCU firmware `.bin` — is external to
this repo's build and its exact size is unverified from repo contents; it should be checked
against a real release artifact before finalizing packaging size budgets, but ESP8266 flash
constraints (a few hundred KB to low single-digit MB depending on board) put a hard ceiling
on how large it could plausibly be regardless.

## 6. Alarming findings

1. **`documentation/docs/protocol.md` is completely empty.** A file exists specifically for
   this documentation and has zero content. The only reason §2 above could be written
   confidently is that both source files were read and compared directly — there is no
   fallback documentation anywhere (not `tally.md`, not `troubleshooting.md`) that describes
   the wire format. Anyone changing either side of the protocol without also reading the
   other side's source has no guardrail at all.
2. **No automated version handshake, despite a documented history of breaking protocol
   changes** (§3). The only defense against a hub/tally version mismatch is a human reading
   `Changelog.md` prose before flashing. A tally on old firmware talking to a newer hub (or
   vice versa) fails silently — no error, no log line, just a device that doesn't respond as
   expected.
3. **`tally/out/` doesn't exist in this checkout, and neither does `esp8266/`** — meaning the
   `/flasher` crash reproduces from a completely fresh clone with zero special local
   misconfiguration, not just in unusual hub-only setups. This is the default state of the
   repo as checked out.
4. **The base firmware build has an external, unverified prerequisite.** `firmware/script.sh`
   assumes an `esp-open-sdk` toolchain archive is already unpacked before it runs; the CI job
   (`tally-firmware` in `build.yml`) gets this by checking out
   `marcelstoer/nodemcu-custom-build` and running its `ESP8266/install.sh` /
   `before-script.sh` first — those scripts live in a repo this project doesn't vendor or
   pin beyond `ref: master` (a moving target, unlike the pinned `NODEMCU_FIRMWARE` ref). A
   breaking change in that upstream repo's `master` branch would break firmware builds with
   no version pin to roll back to.
5. **No second/legacy protocol was found** — `my-tally.lua` is the only network-facing
   protocol implementation in `tally/src/`, and it matches the hub's `CommandCreator`/
   `CommandParser` exactly (§2). No dead code, no commented-out alternate message formats.
6. **No hardcoded credentials or hardware assumptions beyond documented pin numbers.**
   `my-led.lua` hardcodes GPIO pin numbers (`pinOpG, pinOpR, pinOpB = 1, 2, 3`;
   `pinMainG, pinMainR, pinMainB = 5, 6, 7`; `pinOnBoard = 0`; WS2812 fixed to pin D4 via
   `ws2812.init(ws2812.MODE_SINGLE)`) — these match `documentation/docs/getting-started/setup-wifi-tally.md`'s
   wiring table, so this is documented hardware coupling, not a surprise, but it does mean
   any hardware revision with different pinout requires a source change, not a config change.
   `my-wifi.lua` reads Wi-Fi credentials from parsed settings only (`MySettings:staSsid()` /
   `staPw()`), nothing hardcoded.
7. **`my-app.lua` decodes ESP8266 crash/reboot reasons** (`node.bootreason()` — watchdog
   reset, exception reset, etc. — and on exception, logs `epc1/2/3`, `excvaddr`, `depc`) and
   reports them through the same logging path as everything else (`MyLog.error`, which
   forwards to the hub once connected, per `my-log.lua`). This is a genuinely useful existing
   diagnostic surface — if tallies are crashing in the field, this data is already being
   captured and sent to the hub, but nothing on the hub side (as far as this survey looked)
   appears to surface these reboot-reason logs distinctly from ordinary log lines. Worth a
   follow-up look at how the hub displays/stores incoming `log` messages if field crash
   diagnosis becomes a priority — that's hub-side and out of scope for this doc.

## What isn't answered here, and where to look

- Exact firmware `.bin` size and content: not in this repo; check a real
  `vtally-<version>-esp8266.zip` release download.
- Hardware schematics beyond the getting-started wiring table (Fritzing `.fzz` files exist
  under `documentation/src/` but weren't opened — binary CAD format, out of scope for a
  read-only text survey).
- Any protocol/version-negotiation plans the maintainers may have discussed outside this
  repo: not found in-repo; would live at `wifi-tally.github.io` or the upstream issue
  tracker (see `docs/design/ecosystem-survey.md` for upstream-abandonment status — the
  upstream project is not actively maintained, so this may simply never have been revisited).
