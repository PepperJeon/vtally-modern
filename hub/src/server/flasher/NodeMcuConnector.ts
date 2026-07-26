import TallyDevice from '../../shared/flasher/TallyDevice'
import TallySettingsIni from '../../shared/flasher/TallySettingsIni'
import tmp from 'tmp-promise'
import { promises as fs } from 'fs'
// these two are defined in TallyDevice so client components can reference them
// without importing this node-only module; re-exported for existing callers.
import type { TallySettingsIniProgressType, TallyProgramProgressType } from "../../shared/flasher/TallyDevice"
export type { TallySettingsIniProgressType, TallyProgramProgressType }

// ponytail: nodemcu-tool pulls in a NAN-based serialport binding from 2021 that
// cannot compile against modern V8 (fails on node >=17 / darwin-arm64). Load it
// lazily and degrade to a stub so a missing binding disables the flasher instead
// of preventing the whole hub from starting. Remove the stub once serialport is
// upgraded; until then `flasher.device.get` reports the reason to the UI.
const FLASHER_UNAVAILABLE = 'Flasher unavailable: nodemcu-tool could not be loaded'

function loadNodemcuLib(): any {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require('nodemcu-tool')
  } catch (e) {
    console.error(`${FLASHER_UNAVAILABLE} - ${String((e as Error).message).split("\n")[0]}`)
    return new Proxy({}, {
      get: (_target, prop) => {
        if (prop === 'onError') { return () => {/* nothing can fail if nothing runs */} }
        if (prop === 'isConnected') { return () => false } // callers branch on this synchronously
        return () => Promise.reject(new Error(FLASHER_UNAVAILABLE))
      },
    })
  }
}

const baudRate = 115200
const fileName = "tally-settings.ini"

let mutex = false

const tryToAquireMutex = () => {
  if (!mutex) {
    mutex = true
    return true
  } else {
    return false
  }
}

class NodeMcuConnector {
  nodemcu: any

  withMutex<T> (fn: () => T): Promise<T> {
    return new Promise((resolve, reject) => {
      const interval = setInterval(() => {
        const mutexAquired = tryToAquireMutex()
        if (mutexAquired) {
          clearInterval(interval)
          if (this.nodemcu.isConnected()) {
            console.warn("Serial terminal was not closed by previous process.")
            this.nodemcu.disconnect()
          }
          resolve(true)
        }
      }, 100)
    })
    .then(() => {
      return fn()
    })
    .finally(() => {
      mutex = false
    })
  }

  // injectable for easier testing
  constructor(nodemcu: any = loadNodemcuLib()) {
    this.nodemcu = nodemcu
    this.nodemcu.onError((error:any) => {
      console.error(error)
    })
  }

  private static async getLocalFiles() {
    // NOTE: one ../ deeper than before because this file moved from
    // src/flasher/ to src/server/flasher/ in the server/client/shared split.
    // Both non-Electron targets are unchanged: <hub>/esp8266 and <repo>/tally/out.
    const candidates = [
      // Electron: extraResources places esp8266/ next to the app, outside the
      // asar archive. __dirname would resolve inside app.asar, where readdir
      // cannot reach — so this has to come first when it is defined at all.
      // `as any`: resourcesPath is Electron's addition to process, absent from
      // @types/node. It is undefined everywhere else, which is what makes this
      // one list work for all four run modes.
      (process as any).resourcesPath ? (process as any).resourcesPath + "/esp8266" : undefined,
      __dirname + "/../../../esp8266", // path in release package
      __dirname + "/../../../../tally/out", // path during development
    ].filter((p): p is string => p !== undefined)

    let dirName: string | undefined
    let files: string[] | undefined
    for (const candidate of candidates) {
      try {
        files = await fs.readdir(candidate)
        dirName = candidate
        break
      } catch (e) { /* try the next candidate */ }
    }
    if (files === undefined || dirName === undefined) {
      // ponytail: no firmware directory exists (normal for a hub-only checkout,
      // no release esp8266/ and no sibling tally/out/ from `make build`). This used to
      // escape unhandled and crash the whole backend process when /flasher was opened;
      // "update not available" is a state getDevice()/program() already implement, it
      // just never got reached. Report [] so it does.
      console.debug(`No firmware directory found (checked ${candidates.join(", ")}); flasher update disabled.`)
      return []
    }

    console.debug(`Files from ${dirName} will be flashed.`)

    const filteredFiles = files.filter(file => file.endsWith(".lc") || file.endsWith(".lua"))
    return Promise.all(filteredFiles.map(async file => {
      const stats = await fs.stat(dirName + "/" + file)
      return {
        fileName: file,
        filePath: `${dirName}/${file}`,
        fileSize: stats.size,
      }
    }))
  }

  private static async doFilesNeedUpdate(filesOnNodemcu: {name: string, size: number}[]) : Promise<boolean> {
    const localFiles = await NodeMcuConnector.getLocalFiles()
    return localFiles.some(localFile => {  
      return filesOnNodemcu.every(nodeMcuFile => nodeMcuFile.name !== localFile.fileName || nodeMcuFile.size !== localFile.fileSize)
    })
  }

  private sleep(ms: number) {
    return new Promise(resolve => {
      setTimeout(resolve, ms)
    })
  }

  // gracefull connection that retries a few times
  private async connect(path: string) {
    await this.nodemcu.connect(path, baudRate, false)

    // check connection does not always work the first time, so we try it multiple times if necessary
    let retries = 3
    while (true) {
      try {
        return await this.nodemcu.checkConnection()
      } catch (e){
        if (retries === 0) {
          throw e
        }
        await this.sleep(100)
      }
      retries--
    }
  }

  // ponytail: nodemcu-tool's isConnected() can lie after a failed connect() — it sets
  // its internal device handle before open() resolves and never clears it on the error
  // path, so isConnected() reports true and disconnect() then rejects with "Port is not
  // open". Fixed here rather than in the fork: guarding all 3 call sites in code we own
  // avoids another round trip through re-pinning a forked dependency for one line, and
  // an unguarded disconnect() in a `finally` was clobbering clean results/rejections
  // (getDevice's catch-built TallyDevice, and unhandled rejections in program()/
  // writeTallySettingsIni() where disconnect() wasn't even awaited).
  private async safeDisconnect() {
    if (this.nodemcu && this.nodemcu.isConnected()) {
      try {
        await this.nodemcu.disconnect()
      } catch (e) {
        console.warn("disconnect() failed during cleanup (ignored):", e)
      }
    }
  }

  private async execute(idempotentCommand: string) {
    let retries = 3
    while (true) {
      try {
        const foo = await this.nodemcu.execute(`${idempotentCommand}; print("ok")`)
        if (foo === null || !foo.response) {
          throw new Error("Did not get a response for executing the command.")
        }
        if (foo.response.toString().includes("error")) {
          throw new Error(foo.response.toString())
        }
        if (!foo.response.toString().includes("ok")) {
          throw new Error(`response did not include an "ok": ${foo.response.toString()}`)
        }
        return foo
      } catch (e){
        if (retries === 0) {
          throw e
        }
        await this.sleep(100)
      }
      retries--
    }
    
  }

  async getDevice(): Promise<TallyDevice> {
    const tallyDevice = new TallyDevice()
    const localFiles = await NodeMcuConnector.getLocalFiles()
    const updatePossible = localFiles.length > 0
    if (!updatePossible) {
      tallyDevice.update = "not-available"
    }

    try {
      return await this.withMutex(async () => {
        const list = await this.nodemcu.listDevices()
        const device = list[0]
        if (device) {
          
          tallyDevice.path = device.path
          tallyDevice.vendorId = device.vendorId
          tallyDevice.productId = device.productId

          await this.connect(device.path)
          const deviceInfo = await this.nodemcu.deviceInfo()

          tallyDevice.chipId = deviceInfo.chipID
          tallyDevice.flashId = deviceInfo.flashID
          tallyDevice.nodeMcuVersion = deviceInfo.version
          tallyDevice.nodeMcuModules = deviceInfo.modules

          const fsinfo = await this.nodemcu.fsinfo()
          if (updatePossible) {
            tallyDevice.update = await NodeMcuConnector.doFilesNeedUpdate(fsinfo.files) ? "updateable" : "up-to-date"
          }

          const settingsFileExists = fsinfo.files.some(file => file.name === fileName)

          if (settingsFileExists) {
            const res = await this.nodemcu.download(fileName)
            tallyDevice.tallySettings = new TallySettingsIni(res.toString())
          }
        }
        return tallyDevice
      })
    }
    catch (e) {
      tallyDevice.errorMessage = e
      return tallyDevice
    }
    finally {
      await this.safeDisconnect()
    }
  }

  async program(path: string, onProgress: (state: TallyProgramProgressType) => void) {
    const files = await NodeMcuConnector.getLocalFiles()
    const progress: TallyProgramProgressType = {
      inititalizeDone: false,
      connectionDone: false,
      filesUploaded: 0,
      filesTotal: files.length,
      rebootDone: false,
      allDone: false,
      error: false,
    }
    onProgress(progress)

    try {
      await this.withMutex(async () => {
        progress.inititalizeDone = true
        onProgress(progress)

        await this.connect(path)

        progress.connectionDone = true
        onProgress(progress)

        for(const file of files) {
          await this.saveFileUpload(file.fileName, file.filePath)
          progress.filesUploaded = progress.filesUploaded + 1
          onProgress(progress)
        }

        await this.hardReset(path)

        progress.rebootDone = true
        onProgress(progress)

        progress.allDone = true
        onProgress(progress)
      })
    }
    catch (e) {
      console.error(`programming failed because of: ${e}`)

      progress.error = true
      onProgress(progress)
      return false
    }
    finally {
      await this.safeDisconnect()
    }
  }

  async writeTallySettingsIni(path: string, settingsIniString: string, onProgress: (state: TallySettingsIniProgressType) => void) {
    const settingsIni = new TallySettingsIni(settingsIniString)
    const progress: TallySettingsIniProgressType = {
      tallyName: settingsIni.getTallyName(),
      inititalizeDone: false,
      connectionDone: false,
      uploadDone: false,
      rebootDone: false,
      allDone: false,
      error: false,
    }
    onProgress(progress)

    try {
      if (!settingsIni.getTallyName()) {
        throw new Error(`Exeptected ${fileName} to contain a tally.name, but it was empty.`)
      }
      if (!settingsIni.getStationSsid()) {
        throw new Error(`Exeptected ${fileName} to contain a station ssid, but it was empty.`)
      }
      if (!settingsIni.getHubIp()) {
        throw new Error(`Exeptected ${fileName} to contain a hub.ip name, but it was empty.`)
      }

      await this.withMutex(async () => {
        progress.inititalizeDone = true
        onProgress(progress)

        await this.connect(path)

        progress.connectionDone = true
        onProgress(progress)

        await this.saveContentUpload(fileName, settingsIniString)

        progress.uploadDone = true
        onProgress(progress)
        
        await this.hardReset(path)

        progress.rebootDone = true
        onProgress(progress)

        progress.allDone = true
        onProgress(progress)
      })
      return true
    }
    catch (e) {
      console.error(`${fileName} upload failed because of:`, e)

      progress.error = true
      onProgress(progress)
      return false
    }
    finally {
      await this.safeDisconnect()
    }
  }

  private async hardReset(path: string) {
    await this.nodemcu.hardreset()
    await this.nodemcu.disconnect()
    await new Promise(resolve => { setTimeout(resolve, 1000) }) // sleep
    await this.connect(path)

    await new Promise(resolve => { setTimeout(resolve, 3000) }) // sleep

    const failTimeout = setTimeout(() => {
      throw new Error("Could not connect to NodeMCU after hardreset.")
    }, 10000)

    let rebootSuccess = false
    while(!rebootSuccess) {
      try {
        await this.nodemcu.checkConnection()
        rebootSuccess = true
      } catch (e) {
        rebootSuccess = false
      }
    }
    clearTimeout(failTimeout)
  }

  /**
   * uploads content via nodemcu-tool
   * 
   * @param filePath the file path on nodemcu
   * @param content the file content
   */
  private async saveContentUpload(filePath: string, content: string) {
    const { path: tmpPath, cleanup: tmpCleanup } = await tmp.file({})
    try {
      await fs.writeFile(tmpPath, content)
      await this.saveFileUpload(filePath, tmpPath)
    }
    finally {
      tmpCleanup()
    }
  }

  /**
   * uploads a file via nodemcu-tool and does some verification
   * 
   * @param remoteFilePath the file path on nodemcu
   * @param localFilePath the local file path
   */
  private async saveFileUpload(remoteFilePath: string, localFilePath: string) {
    if (!this.nodemcu.isConnected())  {
      throw new Error("Expected to have an already established connection to NodeMCU, but did not.")
    }

    const copyFileName = remoteFilePath + ".swp"

    try {
      await this.nodemcu.upload(localFilePath, copyFileName, {}, () => {})
      await this.sleep(1000)
      const gotContent = await this.nodemcu.download(copyFileName)
      const localContent = await fs.readFile(localFilePath).then(buffer => buffer.toString())

      if (gotContent.toString() !== localContent) {
        throw new Error(`Uploaded file does not match downloaded file. Expected file size of ${localContent.length}, but got ${gotContent.length}`)
      }

      // rename file
      await this.removeFileIfExists(remoteFilePath)
      await this.execute(`file.rename("${copyFileName}", "${remoteFilePath}")`)
    }
    finally {
      await this.removeFileIfExists(copyFileName)
    }
  }
  private async removeFileIfExists(filePath: string) {
    return this.execute(`if file.exists("${filePath}") then file.remove("${filePath}") end`)
  }
}

export default NodeMcuConnector