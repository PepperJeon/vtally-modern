import { app, BrowserWindow } from 'electron'
import path from 'path'
import { startServer, ServerHandle } from '../src/server/server'

// There is no IPC layer and no preload API here on purpose. The app already
// has a client/server seam — socket.io — and a desktop shell does not need a
// second one. The renderer loads the same HTTP origin the browser does, so
// io() (no URL) works unchanged in all four run modes.

// Native modules: package.json sets "npmRebuild": false. That is prebuilds-first
// per docs/design/native-deps.md §4 — @julusian/midi and @serialport/bindings-cpp
// are N-API and their prebuilds load in Electron unmodified. Leaving
// electron-builder's automatic @electron/rebuild on breaks packaging outright on
// an unrelated module: forever-monitor (the npm/Pi supervisor, never loaded here)
// pulls a NAN-era fsevents that cannot compile against Electron's V8. If a native
// addon ever does fail to load in a packaged build, run `npx @electron/rebuild`
// by hand rather than turning the automatic step back on.

// Two hubs fighting over UDP 7411 is a support ticket nobody diagnoses.
if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  let handle: ServerHandle | undefined

  app.on('second-instance', () => {
    const [win] = BrowserWindow.getAllWindows()
    if (win) {
      if (win.isMinimized()) { win.restore() }
      win.focus()
    }
  })

  app.whenReady().then(async () => {
    // VITE_DEV_SERVER_URL set => dev Electron: the window points at the Vite
    // dev server, which proxies /socket.io back to this in-process server.
    const devUrl = process.env.VITE_DEV_SERVER_URL
    handle = await startServer({ port: 0, env: devUrl ? 'development' : 'production' })

    const win = new BrowserWindow({
      width: 1280,
      height: 800,
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        webSecurity: true,
        preload: path.join(__dirname, 'preload.js'),
      },
    })
    await win.loadURL(devUrl || `http://127.0.0.1:${handle.port}`)
  }).catch(e => {
    // Without this, a hub that fails to start leaves an app with no window and
    // no error — indistinguishable from a hang.
    console.error(e)
    app.quit()
  })

  app.on('before-quit', async (event) => {
    if (!handle) { return }
    // AppConfigurationPersistence debounces writes by 500ms — without this
    // flush, quitting right after a settings change loses that change.
    const closing = handle
    handle = undefined
    event.preventDefault()
    await closing.close().catch(e => console.error(e))
    app.quit()
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') { app.quit() }
  })
}
