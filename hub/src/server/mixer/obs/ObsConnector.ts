// The reference is load-bearing: ts-node does not read tsconfig's `include`, so
// the ambient declaration below would not be loaded without it and the server
// would fail to boot with TS2307.
/// <reference path="./obs-websocket-js-json.d.ts" />
// The bare specifier resolves to the msgpack build under Node - which speaks a
// binary subprotocol. We want JSON, hence the explicit `/json` subpath.
import OBSWebSocket from 'obs-websocket-js/json'
import { OBS_ID } from '../../../shared/mixer/ids'
import Channel from '../../../shared/domain/Channel'
import { MixerCommunicator } from '../../lib/MixerCommunicator'
import { Connector } from '../../../shared/mixer/interfaces'
import ObsConfiguration from '../../../shared/mixer/obs/ObsConfiguration'

const reconnectTimeoutMs = 1000

// uses obs-websocket 5
// @see https://github.com/obsproject/obs-websocket
class ObsConnector implements Connector {
    configuration: ObsConfiguration
    communicator: MixerCommunicator
    // tracks which scenes are embedded into other scenes
    embeddedScenes: { [sceneName: string]: string[] } = {}
    reconnectTimeout: NodeJS.Timeout | null = null
    obs: OBSWebSocket | null = null

    // ponytail: fixed ceiling instead of reading the real transition duration.
    // SceneTransitionEnded does not fire when the operator interrupts a
    // transition, so without this the outgoing scene stays lit forever - a
    // camera with a red tally that never goes out. Upgrade path if 10s is ever
    // too coarse: GetCurrentSceneTransition -> transitionDuration, refreshed on
    // CurrentSceneTransitionChanged. Overridable so tests do not have to wait.
    transitionWatchdogMs = 10_000

    private studioMode = false
    private programScene: string | null = null
    private previewScene: string | null = null
    // non-null <=> a transition is in flight
    private transitionFrom: string | null = null
    // best-effort destination; only knowable in studio mode
    private transitionTo: string | null = null
    private transitionWatchdog: NodeJS.Timeout | null = null
    private isStreaming: boolean = false
    private isRecording: boolean = false
    private intentionalDisconnect: boolean = false

    constructor(configuration: ObsConfiguration, communicator: MixerCommunicator) {
        this.configuration = configuration
        this.communicator = communicator
    }

    /** every scene that is on air at this instant, in v4's [from, to] order */
    private get programScenes(): string[] {
        return [this.transitionFrom, this.transitionTo, this.programScene]
            .filter((s): s is string => s !== null)
            .filter((s, i, a) => a.indexOf(s) === i)
    }
    private get previewScenes(): string[] {
        return this.previewScene === null ? [] : [this.previewScene]
    }

    connect() {
        this.intentionalDisconnect = false
        const obs = this.obs = new OBSWebSocket()

        obs.on('ConnectionError', err => {
            console.error("obs socket error:", err.message)
        })
        obs.on('ConnectionClosed', err => {
            if (this.intentionalDisconnect) { return }
            this.clearTransition()
            this.communicator.notifyMixerIsDisconnected()
            console.error("Connection to OBS lost:", err.message)
            this.scheduleReconnect()
        })

        obs.on('CurrentProgramSceneChanged', data => {
            this.programScene = data.sceneName
            this.notifyChanged()
        })
        obs.on('CurrentPreviewSceneChanged', data => {
            this.previewScene = data.sceneName
            this.notifyChanged()
        })
        obs.on('SceneTransitionStarted', () => {
            // Both the normal and the interrupted case take `from` from the
            // current program scene: OBS cuts to the pending scene when a
            // transition is interrupted, so `programScene` is exactly the scene
            // that is going off air.
            this.transitionFrom = this.programScene
            this.transitionTo = this.studioMode ? this.previewScene : null
            this.armTransitionWatchdog()
            this.notifyChanged()
        })
        obs.on('SceneTransitionEnded', () => {
            this.clearTransition()
            this.notifyChanged()
        })
        obs.on('StudioModeStateChanged', data => {
            this.studioMode = data.studioModeEnabled
            if (data.studioModeEnabled) {
                this.updatePreviewScene()
            } else {
                this.previewScene = null
                this.transitionTo = null
                this.notifyChanged()
            }
        })

        // scene graph changes - all of them lead to the same full resync
        const onScenesChanged = () => { this.updateScenes() }
        obs.on('SceneListChanged', onScenesChanged)
        obs.on('SceneCreated', onScenesChanged)
        obs.on('SceneRemoved', onScenesChanged)
        obs.on('SceneNameChanged', onScenesChanged)
        obs.on('CurrentSceneCollectionChanged', onScenesChanged)
        obs.on('SceneCollectionListChanged', onScenesChanged)

        // scene *item* changes only affect one scene's embedded scenes
        obs.on('SceneItemCreated', data => { this.rebuildEmbeddedScenes([data.sceneName]) })
        obs.on('SceneItemRemoved', data => { this.rebuildEmbeddedScenes([data.sceneName]) })
        obs.on('SceneItemEnableStateChanged', data => { this.rebuildEmbeddedScenes([data.sceneName]) })

        obs.on('StreamStateChanged', data => {
            this.isStreaming = data.outputActive
            this.notifyChanged()
        })
        obs.on('RecordStateChanged', data => {
            // outputActive stays true while paused, but v4 treated a paused
            // recording as off air. OBS_WEBSOCKET_OUTPUT_PAUSED/_RESUMED need
            // obs-websocket >= 5.1.0 (OBS 28.0.2).
            this.isRecording = data.outputActive && data.outputState !== 'OBS_WEBSOCKET_OUTPUT_PAUSED'
            this.notifyChanged()
        })

        this.doConnect()

        this.communicator.notifyProgramPreviewChanged(null, null)
    }

    private doConnect() {
        if (!this.obs) { return }
        if (this.reconnectTimeout) {
            clearTimeout(this.reconnectTimeout)
            this.reconnectTimeout = null
        }
        const ip = this.configuration.getIp().toString()
        const port = this.configuration.getPort().toNumber()
        // connect(url, "") still attempts authentication - "" must become undefined
        const password = this.configuration.getPassword() || undefined
        console.log(`Connecting to OBS at ${ip}:${port}`)
        this.obs.connect(`ws://${ip}:${port}`, password, { rpcVersion: 1 }).then(() => {
            console.log("Connected to OBS")
            this.communicator.notifyMixerIsConnected()
            return this.resync()
        }).catch(err => {
            this.communicator.notifyMixerIsDisconnected()
            console.error("error when connecting to OBS:", err.code, err.message)
            this.scheduleReconnect()
        })
    }

    private scheduleReconnect() {
        if (this.reconnectTimeout) { clearTimeout(this.reconnectTimeout) }
        this.reconnectTimeout = setTimeout(() => this.doConnect(), reconnectTimeoutMs)
    }

    // v4 got initial streaming/recording state from the StreamStatus event,
    // which was pushed every ~2s. v5 deleted it with no replacement, so every
    // piece of state has to be queried explicitly at connect time.
    private async resync() {
        const [sceneList, studio, stream, record] = await Promise.all([
            this.obs.call('GetSceneList'),
            this.obs.call('GetStudioModeEnabled'),
            this.obs.call('GetStreamStatus'),
            this.obs.call('GetRecordStatus'),
        ])
        this.studioMode = studio.studioModeEnabled
        this.programScene = sceneList.currentProgramSceneName ?? null
        this.previewScene = this.studioMode ? (sceneList.currentPreviewSceneName ?? null) : null
        // never carry transition state across a socket
        this.clearTransition()
        this.isStreaming = stream.outputActive
        this.isRecording = record.outputActive && !record.outputPaused

        const sceneNames = (sceneList.scenes as any[]).map(scene => scene.sceneName as string)
        this.communicator.notifyChannels(sceneNames.map(name => new Channel(name, name)))
        this.notifyChanged()

        this.embeddedScenes = {}
        await this.rebuildEmbeddedScenes(sceneNames)
    }

    private updateScenes() {
        this.obs?.call('GetSceneList').then(data => {
            const sceneNames = (data.scenes as any[]).map(scene => scene.sceneName as string)
            this.communicator.notifyChannels(sceneNames.map(name => new Channel(name, name)))
            // rebuild from scratch: names of removed scenes, or of scenes from a
            // previous scene collection, must not survive
            this.embeddedScenes = {}
            return this.rebuildEmbeddedScenes(sceneNames)
        }).catch(err => {
            console.error("could not update the scene list:", err.message)
        })
    }

    // v5's GetSceneList no longer nests the sources of each scene, so the
    // embedded scenes have to be fetched per scene. callBatch collapses that
    // into a single round trip.
    private async rebuildEmbeddedScenes(sceneNames: string[]) {
        if (!this.obs || sceneNames.length === 0) { return }
        try {
            const results = await this.obs.callBatch(sceneNames.map(sceneName => ({
                requestType: 'GetSceneItemList' as const,
                requestData: { sceneName },
            })))
            sceneNames.forEach((sceneName, i) => {
                const result = results[i]
                if (!result || !result.requestStatus.result) {
                    this.embeddedScenes[sceneName] = []
                    return
                }
                this.embeddedScenes[sceneName] = ((result as any).responseData.sceneItems as any[])
                    // groups are OBS_SOURCE_TYPE_SCENE too, but a group is not a
                    // tally-visible scene
                    .filter(item => item.sourceType === 'OBS_SOURCE_TYPE_SCENE'
                        && item.isGroup === false
                        && item.sceneItemEnabled === true)
                    .map(item => item.sourceName as string)
            })
            this.notifyChanged()
        } catch (err) {
            console.error("could not update embedded scenes:", err.message)
        }
    }

    private updatePreviewScene() {
        this.obs?.call('GetCurrentPreviewScene').then(data => {
            this.previewScene = data.sceneName
            this.notifyChanged()
        }).catch(() => {
            // studio mode was switched off again in the meantime
        })
    }

    private armTransitionWatchdog() {
        if (this.transitionWatchdog) { clearTimeout(this.transitionWatchdog) }
        this.transitionWatchdog = setTimeout(() => {
            this.transitionWatchdog = null
            if (this.transitionFrom === null) { return }
            console.warn("OBS did not report the end of a transition - releasing the outgoing scene.")
            this.transitionFrom = null
            this.transitionTo = null
            this.notifyChanged()
        }, this.transitionWatchdogMs)
    }

    private clearTransition() {
        this.transitionFrom = null
        this.transitionTo = null
        if (this.transitionWatchdog) {
            clearTimeout(this.transitionWatchdog)
            this.transitionWatchdog = null
        }
    }

    private shouldProgramBeShownAsPreview(): boolean {
        const mode = this.configuration.getLiveMode()
        if (mode === "always") {
            return false
        } else if (mode === "record") {
            return !this.isRecording
        } else if(mode === "stream") {
            return !this.isStreaming
        } else if(mode === "streamOrRecord") {
            return !this.isStreaming && !this.isRecording
        } else {
            ((_: never) => {})(mode) // if typescript complains about this, we forgot a case
        }
    }

    private notifyChanged() {
        let programs: string[] = []

        this.programScenes.forEach(scene => {
            programs.push(scene)
            programs.push(...(this.embeddedScenes[scene] || []))
        })

        let previews: string[] = []
        if (this.shouldProgramBeShownAsPreview()) {
            previews = programs
            programs = []
        } else {
            this.previewScenes.forEach(scene => {
                previews.push(scene)
                previews.push(...(this.embeddedScenes[scene] || []))
            })
        }

        this.communicator.notifyProgramPreviewChanged(programs, previews)
    }

    disconnect() {
        this.intentionalDisconnect = true
        if (this.reconnectTimeout) {
            clearTimeout(this.reconnectTimeout)
            this.reconnectTimeout = null
        }
        this.clearTransition()
        return this.obs?.disconnect()
    }

    isConnected() {
        // `identified` is open socket *and* completed handshake - exactly when
        // call() is legal
        return this.obs?.identified === true
    }
    static readonly ID = OBS_ID
}

export default ObsConnector
