/**
 * Test-only fake obs-websocket v5 server.
 *
 * Speaks the op/d envelope protocol: Hello(0) -> Identify(1) -> Identified(2),
 * Event(5), Request(6), RequestResponse(7), RequestBatch(8), RequestBatchResponse(9).
 *
 * CRITICAL: `handleProtocols` must echo `obswebsocket.json`. obs-websocket-js
 * aborts the connection with OBSWebSocketError(-1, 'Server sent no subprotocol')
 * otherwise, and the failure gives no hint about what is wrong.
 */
import crypto from 'crypto'
import WebSocket, { WebSocketServer } from 'ws'

export type FakeSceneItem = {
    sourceName: string
    sourceType?: string
    isGroup?: boolean | null
    sceneItemEnabled?: boolean
}
export type FakeScene = {
    sceneName: string
    items?: FakeSceneItem[]
}

class RequestError extends Error {
    code: number
    constructor(code: number, message: string) {
        super(message)
        this.code = code
    }
}

export class FakeObs {
    private wss: WebSocketServer | null = null
    private socket: WebSocket | null = null
    /** every request type the client has sent, in order - for "no request issued" assertions */
    requests: string[] = []
    port: number = 0

    // --- world state the tests manipulate ---
    scenes: FakeScene[] = []
    programScene: string | null = null
    previewScene: string | null = null
    studioMode = false
    streaming = false
    recording = false
    recordPaused = false
    password: string | null = null
    /** when false the server does not echo the subprotocol (regression guard) */
    sendSubprotocol = true

    async start() {
        this.wss = new WebSocketServer({
            host: '127.0.0.1',
            port: 0,
            handleProtocols: () => this.sendSubprotocol ? 'obswebsocket.json' : false,
        })
        await new Promise<void>((resolve, reject) => {
            this.wss.once('listening', () => resolve())
            this.wss.once('error', reject)
        })
        this.port = (this.wss.address() as { port: number }).port
        this.wss.on('connection', sck => {
            this.socket = sck
            sck.on('error', () => { /* client aborts are expected in several tests */ })
            sck.send(JSON.stringify({ op: 0, d: this.hello() }))
            sck.on('message', raw => this.onMessage(sck, JSON.parse(raw.toString())))
        })
    }

    async stop() {
        this.socket?.terminate()
        this.socket = null
        const wss = this.wss
        this.wss = null
        if (!wss) { return }
        await new Promise<void>(resolve => wss.close(() => resolve()))
    }

    /** drop the TCP connection without a close handshake - for reconnect tests */
    killSocket() {
        this.socket?.terminate()
        this.socket = null
    }

    private salt = 'lM1GncleQOaCu9lT1yeUZhFYnqhsLLP1G5lAGo3ixaI='
    private challenge = '+IxH4CnCiqpX1rM9scsNynZzbOe4KhDeYcTNS3PDaeY='

    private hello() {
        const d: any = {
            obsStudioVersion: '30.2.2',
            obsWebSocketVersion: '5.5.2',
            rpcVersion: 1,
        }
        if (this.password !== null) {
            d.authentication = { challenge: this.challenge, salt: this.salt }
        }
        return d
    }

    private expectedAuth() {
        const sha256 = (s: string) => crypto.createHash('sha256').update(s).digest('base64')
        return sha256(sha256(this.password + this.salt) + this.challenge)
    }

    private onMessage(sck: WebSocket, msg: any) {
        if (msg.op === 1) { // Identify
            if (this.password !== null && msg.d.authentication !== this.expectedAuth()) {
                sck.close(4009, 'Authentication failed.')
                return
            }
            sck.send(JSON.stringify({ op: 2, d: { negotiatedRpcVersion: 1 } }))
            return
        }
        if (msg.op === 6) { // Request
            const { requestType, requestId, requestData } = msg.d
            sck.send(JSON.stringify({ op: 7, d: this.respond(requestType, requestId, requestData) }))
            return
        }
        if (msg.op === 8) { // RequestBatch
            const results = msg.d.requests.map((r: any) => this.respond(r.requestType, r.requestId, r.requestData))
            sck.send(JSON.stringify({ op: 9, d: { requestId: msg.d.requestId, results } }))
            return
        }
    }

    private respond(requestType: string, requestId: string, requestData: any) {
        this.requests.push(requestType)
        try {
            return {
                requestType,
                requestId,
                requestStatus: { result: true, code: 100 },
                responseData: this.handleRequest(requestType, requestData ?? {}),
            }
        } catch (e) {
            return {
                requestType,
                requestId,
                requestStatus: { result: false, code: e instanceof RequestError ? e.code : 500, comment: e.message },
            }
        }
    }

    private handleRequest(type: string, data: any) {
        switch (type) {
            case 'GetSceneList': return {
                currentProgramSceneName: this.programScene,
                currentProgramSceneUuid: null,
                currentPreviewSceneName: this.studioMode ? this.previewScene : null,
                currentPreviewSceneUuid: null,
                scenes: this.scenes.map((s, i) => ({ sceneName: s.sceneName, sceneUuid: null, sceneIndex: i })),
            }
            case 'GetCurrentPreviewScene':
                if (!this.studioMode) { throw new RequestError(506, 'Studio mode is not active.') }
                return { sceneName: this.previewScene, sceneUuid: null }
            case 'GetStudioModeEnabled':
                return { studioModeEnabled: this.studioMode }
            case 'GetStreamStatus':
                return { outputActive: this.streaming, outputReconnecting: false, outputTimecode: '00:00:00.000', outputDuration: 0, outputCongestion: 0, outputBytes: 0, outputSkippedFrames: 0, outputTotalFrames: 0 }
            case 'GetRecordStatus':
                return { outputActive: this.recording, outputPaused: this.recordPaused, outputTimecode: '00:00:00.000', outputDuration: 0, outputBytes: 0 }
            case 'GetSceneItemList': {
                const scene = this.scenes.find(s => s.sceneName === data.sceneName)
                if (!scene) { throw new RequestError(600, 'No such scene.') }
                return {
                    sceneItems: (scene.items ?? []).map((it, i) => ({
                        sceneItemId: i + 1,
                        sceneItemIndex: i,
                        sceneItemEnabled: it.sceneItemEnabled ?? true,
                        sceneItemLocked: false,
                        sceneItemBlendMode: 'OBS_BLEND_NORMAL',
                        sourceName: it.sourceName,
                        sourceUuid: null,
                        sourceType: it.sourceType ?? 'OBS_SOURCE_TYPE_INPUT',
                        inputKind: null,
                        isGroup: it.isGroup ?? null,
                    })),
                }
            }
            default:
                throw new RequestError(204, `Request "${type}" not implemented in FakeObs.`)
        }
    }

    emit(eventType: string, eventData: object = {}) {
        this.socket?.send(JSON.stringify({ op: 5, d: { eventType, eventIntent: 0, eventData } }))
    }

    // --- operator actions ---
    cut(scene: string) {
        this.programScene = scene
        this.emit('CurrentProgramSceneChanged', { sceneName: scene, sceneUuid: null })
    }
    /** the cut point *inside* a transition - identical wire event, different intent */
    transitionCutPoint(scene: string) { this.cut(scene) }
    transitionStart() { this.emit('SceneTransitionStarted', { transitionName: 'Fade', transitionUuid: null }) }
    transitionEnd() { this.emit('SceneTransitionEnded', { transitionName: 'Fade', transitionUuid: null }) }
    setPreview(scene: string) {
        this.previewScene = scene
        this.emit('CurrentPreviewSceneChanged', { sceneName: scene, sceneUuid: null })
    }
    enterStudioMode(preview: string) {
        this.studioMode = true
        this.previewScene = preview
        this.emit('StudioModeStateChanged', { studioModeEnabled: true })
    }
    exitStudioMode() {
        this.studioMode = false
        this.previewScene = null
        this.emit('StudioModeStateChanged', { studioModeEnabled: false })
    }
    changeScenes(scenes: FakeScene[]) {
        this.scenes = scenes
        this.emit('SceneListChanged', { scenes: scenes.map((s, i) => ({ sceneName: s.sceneName, sceneUuid: null, sceneIndex: i })) })
    }
    changeSceneCollection(scenes: FakeScene[], program: string) {
        // real OBS cuts to the new collection's program scene before announcing
        // the collection change
        this.cut(program)
        this.scenes = scenes
        this.emit('CurrentSceneCollectionChanged', { sceneCollectionName: 'Collection 2' })
    }
    setSceneItemEnabled(sceneName: string, sourceName: string, enabled: boolean) {
        const scene = this.scenes.find(s => s.sceneName === sceneName)
        const index = scene.items.findIndex(i => i.sourceName === sourceName)
        scene.items[index].sceneItemEnabled = enabled
        this.emit('SceneItemEnableStateChanged', { sceneName, sceneUuid: null, sceneItemId: index + 1, sceneItemEnabled: enabled })
    }
    removeScene(sceneName: string) {
        this.scenes = this.scenes.filter(s => s.sceneName !== sceneName)
        this.emit('SceneRemoved', { sceneName, sceneUuid: null, isGroup: false })
    }
    startStream() { this.streaming = true; this.emit('StreamStateChanged', { outputActive: true, outputState: 'OBS_WEBSOCKET_OUTPUT_STARTED' }) }
    stopStream() { this.streaming = false; this.emit('StreamStateChanged', { outputActive: false, outputState: 'OBS_WEBSOCKET_OUTPUT_STOPPED' }) }
    startRecording() { this.recording = true; this.recordPaused = false; this.emit('RecordStateChanged', { outputActive: true, outputState: 'OBS_WEBSOCKET_OUTPUT_STARTED', outputPath: null }) }
    stopRecording() { this.recording = false; this.recordPaused = false; this.emit('RecordStateChanged', { outputActive: false, outputState: 'OBS_WEBSOCKET_OUTPUT_STOPPED', outputPath: '/tmp/x.mkv' }) }
    pauseRecording() { this.recordPaused = true; this.emit('RecordStateChanged', { outputActive: true, outputState: 'OBS_WEBSOCKET_OUTPUT_PAUSED', outputPath: null }) }
    resumeRecording() { this.recordPaused = false; this.emit('RecordStateChanged', { outputActive: true, outputState: 'OBS_WEBSOCKET_OUTPUT_RESUMED', outputPath: null }) }
}

export default FakeObs
