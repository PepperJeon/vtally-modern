import { test, expect, _electron as electron } from '@playwright/test'
import os from 'os'
import path from 'path'
import fs from 'fs'
import dgram from 'dgram'

// Cypress cannot cover Electron, so this is the whole Electron gate: does the
// PACKAGED app start, serve the hub, and render the config page. Packaged, not
// `electron .` — the asar boundary and the native-module prebuilds are exactly
// what an unpackaged run fails to exercise.
// electron-builder --dir output layout per platform. Only darwin-arm64 has been
// run for real; the other two are unverified paths, not verified builds.
const relative: Record<string, string> = {
  darwin: `release/mac${process.arch === 'arm64' ? '-arm64' : ''}/vTally.app/Contents/MacOS/vTally`,
  win32: 'release/win-unpacked/vTally.exe',
  linux: 'release/linux-unpacked/vtally',
}
const appPath = path.join(__dirname, '..', relative[process.platform] || 'release/missing')

const freeUdpPort = () => new Promise<number>(resolve => {
  const s = dgram.createSocket('udp4')
  s.bind(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => resolve(p)) })
})

test('packaged app opens the hub', async () => {
  test.skip(!fs.existsSync(appPath), `not packaged yet — run "npm run pack:electron" first (${appPath})`)

  // Never let the smoke test write the developer's real ~/.wifi-tally.json, and
  // never let it fight a running hub for UDP 7411.
  const configFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'vtally-smoke-')), 'config.json')
  const app = await electron.launch({
    executablePath: appPath,
    env: { ...process.env, CONFIG_FILE: configFile, TALLY_PORT: String(await freeUdpPort()) },
  })
  try {
    const win = await app.firstWindow()
    await win.goto(new URL('/config', win.url()).toString())
    await expect(win.locator('[data-testid=page-config]')).toBeVisible({ timeout: 30_000 })

    // The two native-backed modules must load from *inside* the packaged app —
    // asar plus a wrong-ABI prebuild is the failure this whole gate exists for,
    // and it is invisible to `electron .`. Both are lazy/guarded so a failure
    // here degrades a feature rather than blocking startup, which is precisely
    // why it needs asserting: nothing else would notice.
    const natives = await app.evaluate(() => {
      const load = (m: string) => {
        try { (process.mainModule as any).require(m); return 'ok' } catch (e: any) { return String(e.message).split('\n')[0] }
      }
      return { midi: load('@julusian/midi'), nodemcu: load('nodemcu-tool') }
    })
    expect(natives).toEqual({ midi: 'ok', nodemcu: 'ok' })
  } finally {
    await app.close()
  }
})
