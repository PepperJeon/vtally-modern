import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import ObsConnector from './ObsConnector'
import FakeObs from './FakeObs'
import ObsConfiguration, { ObsConfigurationLiveMode } from '../../../shared/mixer/obs/ObsConfiguration'

/**
 * Polls until the predicate holds, or throws. Deliberately not the old helper:
 * that one leaked a setInterval and, worse, most of its call sites compared a
 * live value against a fresh array literal (always true), so the awaits
 * synchronised nothing. Every predicate below has to be falsifiable.
 */
const waitUntil = async (fn: () => boolean, message = "condition", timeoutMs = 3000) => {
    const deadline = Date.now() + timeoutMs
    while (!fn()) {
        if (Date.now() > deadline) { throw new Error(`waitUntil timed out waiting for ${message}`) }
        await new Promise(resolve => setTimeout(resolve, 5))
    }
}
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))
const same = (actual: unknown, expected: unknown) => JSON.stringify(actual) === JSON.stringify(expected)

class MockCommunicator {
    programs: string[] | null = null
    previews: string[] | null = null
    channels: any[] | null = null
    isConnected = false

    notifyProgramPreviewChanged(programs, previews) {
        this.programs = programs
        this.previews = previews
    }
    notifyProgramChanged(programs) { this.programs = programs }
    notifyPreviewChanged(previews) { this.previews = previews }
    notifyChannels(channels) { this.channels = channels }
    notifyMixerIsConnected() { this.isConnected = true }
    notifyMixerIsDisconnected() { this.isConnected = false }
}

describe('ObsConnector', () => {
    let fake: FakeObs
    let connector: ObsConnector
    let communicator: MockCommunicator
    let configuration: ObsConfiguration

    const create = (opts: { liveMode?: ObsConfigurationLiveMode, password?: string } = {}) => {
        communicator = new MockCommunicator()
        configuration = new ObsConfiguration()
        configuration.setIp("127.0.0.1")
        configuration.setPort(fake.port)
        if (opts.liveMode) { configuration.setLiveMode(opts.liveMode) }
        if (opts.password !== undefined) { configuration.setPassword(opts.password) }
        connector = new ObsConnector(configuration, communicator as any)
        return connector
    }
    const waitForPrograms = (expected: string[]) =>
        waitUntil(() => same(communicator.programs, expected), `programs === ${JSON.stringify(expected)}`)
    const waitForPreviews = (expected: string[]) =>
        waitUntil(() => same(communicator.previews, expected), `previews === ${JSON.stringify(expected)}`)
    const channelNames = () => (communicator.channels ?? []).map(channel => channel.name)

    /** connects and waits until the initial resync has been applied */
    const connectAndSettle = async (expectedPrograms: string[]) => {
        connector.connect()
        await waitUntil(() => connector.isConnected(), "connection")
        await waitForPrograms(expectedPrograms)
    }

    beforeEach(async () => {
        fake = new FakeObs()
        await fake.start()
        create()
    })
    afterEach(async () => {
        await connector?.disconnect()
        await fake.stop()
        vi.restoreAllMocks()
    })

    describe('connection', () => {
        test('connects without a password', async () => {
            fake.scenes = [{ sceneName: "Scene 1" }]
            fake.programScene = "Scene 1"

            await connectAndSettle(["Scene 1"])
            expect(connector.isConnected()).toBe(true)
            expect(communicator.isConnected).toBe(true)
        })

        test('connects with a password', async () => {
            fake.password = "hunter2"
            fake.scenes = [{ sceneName: "Scene 1" }]
            fake.programScene = "Scene 1"
            create({ password: "hunter2" })

            await connectAndSettle(["Scene 1"])
            expect(communicator.isConnected).toBe(true)
        })

        test('does not connect with a wrong password and retries', async () => {
            vi.spyOn(console, 'error').mockImplementation(() => {})
            fake.password = "hunter2"
            fake.programScene = "Scene 1"
            create({ password: "wrong" })

            connector.connect()
            await waitUntil(() => connector.reconnectTimeout !== null, "a scheduled retry")
            expect(connector.isConnected()).toBe(false)
            expect(communicator.isConnected).toBe(false)
        })

        // regression guard: obs-websocket-js aborts when the server does not
        // echo the obswebsocket.json subprotocol. Without the `/json` import the
        // client would ask for obswebsocket.msgpack and never handshake.
        test('fails gracefully when the server sends no subprotocol', async () => {
            const errors = vi.spyOn(console, 'error').mockImplementation(() => {})
            fake.sendSubprotocol = false
            fake.programScene = "Scene 1"

            connector.connect()
            await waitUntil(() => connector.reconnectTimeout !== null, "a scheduled retry")
            expect(connector.isConnected()).toBe(false)
            expect(errors.mock.calls.some(call => JSON.stringify(call).includes("subprotocol"))).toBe(true)
        })

        test('reconnects and resyncs after the socket dies', async () => {
            vi.spyOn(console, 'error').mockImplementation(() => {})
            fake.scenes = [{ sceneName: "Scene 1" }, { sceneName: "Scene 2" }]
            fake.programScene = "Scene 1"
            await connectAndSettle(["Scene 1"])

            fake.programScene = "Scene 2"
            fake.killSocket()
            await waitUntil(() => communicator.isConnected === false, "a disconnect notification")
            await waitUntil(() => connector.isConnected(), "a reconnect", 5000)
            await waitForPrograms(["Scene 2"])
        })

        test('does not reconnect after a deliberate disconnect', async () => {
            fake.programScene = "Scene 1"
            fake.scenes = [{ sceneName: "Scene 1" }]
            await connectAndSettle(["Scene 1"])

            await connector.disconnect()
            expect(connector.reconnectTimeout).toBe(null)
            // long enough that a scheduled reconnect (1000ms) would have fired
            await sleep(1300)
            expect(connector.isConnected()).toBe(false)
            expect(connector.reconnectTimeout).toBe(null)
        })
    })

    describe('scene state', () => {
        beforeEach(() => {
            fake.scenes = [{ sceneName: "Scene 1" }, { sceneName: "Scene 2" }]
            fake.programScene = "Scene 1"
        })

        test('determines the initial state without studio mode', async () => {
            await connectAndSettle(["Scene 1"])
            expect(communicator.previews).toEqual([])
            expect(channelNames()).toEqual(["Scene 1", "Scene 2"])
        })

        test('determines the initial state with studio mode', async () => {
            fake.studioMode = true
            fake.previewScene = "Scene 2"

            await connectAndSettle(["Scene 1"])
            await waitForPreviews(["Scene 2"])
        })

        test('follows a cut', async () => {
            await connectAndSettle(["Scene 1"])
            fake.cut("Scene 2")
            await waitForPrograms(["Scene 2"])
        })

        test('follows a preview change', async () => {
            fake.studioMode = true
            fake.previewScene = "Scene 2"
            await connectAndSettle(["Scene 1"])

            fake.setPreview("Scene 1")
            await waitForPreviews(["Scene 1"])
        })

        test('follows a changed scene list', async () => {
            await connectAndSettle(["Scene 1"])
            fake.changeScenes([{ sceneName: "Scene 1" }, { sceneName: "Scene 2" }, { sceneName: "Scene 3" }])
            await waitUntil(() => same(channelNames(), ["Scene 1", "Scene 2", "Scene 3"]), "the new channel list")
        })

        test('follows a changed scene collection', async () => {
            await connectAndSettle(["Scene 1"])
            fake.changeSceneCollection([{ sceneName: "Other A" }, { sceneName: "Other B" }], "Other A")
            await waitUntil(() => same(channelNames(), ["Other A", "Other B"]), "the new channel list")
            expect(communicator.programs).toEqual(["Other A"])
        })

        test('follows entering and leaving studio mode', async () => {
            await connectAndSettle(["Scene 1"])
            expect(communicator.previews).toEqual([])

            fake.enterStudioMode("Scene 2")
            await waitForPreviews(["Scene 2"])

            fake.exitStudioMode()
            await waitForPreviews([])
            expect(communicator.programs).toEqual(["Scene 1"])
        })
    })

    describe('transitions', () => {
        beforeEach(() => {
            fake.scenes = [{ sceneName: "Cam 1" }, { sceneName: "Cam 2" }]
            fake.programScene = "Cam 1"
        })

        test('keeps both scenes live for the whole transition in studio mode', async () => {
            fake.studioMode = true
            fake.previewScene = "Cam 2"
            await connectAndSettle(["Cam 1"])

            // the destination is known immediately, from the preview scene
            fake.transitionStart()
            await waitForPrograms(["Cam 1", "Cam 2"])

            fake.transitionCutPoint("Cam 2")
            await sleep(30)
            expect(communicator.programs).toEqual(["Cam 1", "Cam 2"])

            fake.transitionEnd()
            await waitForPrograms(["Cam 2"])
        })

        test('keeps the outgoing scene live for the whole transition without studio mode', async () => {
            await connectAndSettle(["Cam 1"])

            fake.transitionStart()
            await sleep(30)
            expect(communicator.programs).toEqual(["Cam 1"])

            fake.transitionCutPoint("Cam 2")
            await waitForPrograms(["Cam 1", "Cam 2"])

            fake.transitionEnd()
            await waitForPrograms(["Cam 2"])
        })

        // insurance against OBS emitting CurrentProgramSceneChanged at the start
        // of a transition rather than at the cut point
        test('is correct when the program change arrives before the transition start', async () => {
            await connectAndSettle(["Cam 1"])

            fake.transitionCutPoint("Cam 2")
            await waitForPrograms(["Cam 2"])

            fake.transitionStart()
            await sleep(30)
            expect(communicator.programs).toContain("Cam 2")

            fake.transitionEnd()
            await waitForPrograms(["Cam 2"])
        })

        test('survives an interrupted transition', async () => {
            fake.studioMode = true
            fake.previewScene = "Cam 2"
            await connectAndSettle(["Cam 1"])

            fake.transitionStart()
            await waitForPrograms(["Cam 1", "Cam 2"])

            // the operator interrupts: OBS cuts to Cam 2 and starts a new
            // transition back to Cam 1 - without ever sending SceneTransitionEnded
            fake.transitionCutPoint("Cam 2")
            fake.setPreview("Cam 1")
            fake.transitionStart()
            await waitUntil(() => (communicator.programs ?? []).includes("Cam 2"), "Cam 2 to be live")

            fake.transitionCutPoint("Cam 1")
            fake.transitionEnd()
            await waitForPrograms(["Cam 1"])
        })

        test('releases the outgoing scene when OBS never reports the end', async () => {
            const warnings = vi.spyOn(console, 'warn').mockImplementation(() => {})
            fake.studioMode = true
            fake.previewScene = "Cam 2"
            create()
            connector.transitionWatchdogMs = 100
            await connectAndSettle(["Cam 1"])

            fake.transitionStart()
            await waitForPrograms(["Cam 1", "Cam 2"])

            // no SceneTransitionEnded ever arrives
            await waitForPrograms(["Cam 1"])
            expect(warnings).toHaveBeenCalled()
        })

        test('does not carry transition state across a reconnect', async () => {
            vi.spyOn(console, 'error').mockImplementation(() => {})
            fake.studioMode = true
            fake.previewScene = "Cam 2"
            await connectAndSettle(["Cam 1"])

            fake.transitionStart()
            await waitForPrograms(["Cam 1", "Cam 2"])

            fake.programScene = "Cam 2"
            fake.previewScene = "Cam 1"
            fake.killSocket()
            await waitUntil(() => connector.isConnected(), "a reconnect", 5000)
            await waitForPrograms(["Cam 2"])
        })

        test('does not report a scene twice when transitioning to the live scene', async () => {
            fake.studioMode = true
            fake.previewScene = "Cam 1"
            await connectAndSettle(["Cam 1"])

            fake.transitionStart()
            await sleep(30)
            expect(communicator.programs).toEqual(["Cam 1"])
        })
    })

    describe('embedded scenes', () => {
        // built fresh per test - setSceneItemEnabled mutates it
        const pictureInPicture = () => ({
            sceneName: "Picture In Picture",
            items: [
                { sourceName: "Cam 1", sourceType: 'OBS_SOURCE_TYPE_SCENE', isGroup: false },
                { sourceName: "Cam 2", sourceType: 'OBS_SOURCE_TYPE_SCENE', isGroup: false },
                { sourceName: "Cam 3", sourceType: 'OBS_SOURCE_TYPE_SCENE', isGroup: false, sceneItemEnabled: false },
                { sourceName: "A Webcam", sourceType: 'OBS_SOURCE_TYPE_INPUT' },
                { sourceName: "Lower Thirds", sourceType: 'OBS_SOURCE_TYPE_SCENE', isGroup: true },
            ],
        })
        beforeEach(() => {
            fake.scenes = [pictureInPicture(), { sceneName: "Cam 1" }, { sceneName: "Cam 2" }, { sceneName: "Cam 3" }]
            fake.programScene = "Picture In Picture"
        })

        test('reports enabled nested scenes, and only those', async () => {
            // the disabled item, the input source and the group are all excluded
            await connectAndSettle(["Picture In Picture", "Cam 1", "Cam 2"])
        })

        test('follows a scene item being enabled', async () => {
            await connectAndSettle(["Picture In Picture", "Cam 1", "Cam 2"])
            fake.setSceneItemEnabled("Picture In Picture", "Cam 3", true)
            await waitForPrograms(["Picture In Picture", "Cam 1", "Cam 2", "Cam 3"])
        })

        test('drops a removed scene from the cache', async () => {
            await connectAndSettle(["Picture In Picture", "Cam 1", "Cam 2"])
            fake.removeScene("Cam 3")
            await waitUntil(() => !("Cam 3" in connector.embeddedScenes), "Cam 3 to leave the cache")
        })

        test('does not leak scene names from a previous scene collection', async () => {
            await connectAndSettle(["Picture In Picture", "Cam 1", "Cam 2"])
            fake.changeSceneCollection([{ sceneName: "Other A" }], "Other A")
            await waitUntil(() => same(Object.keys(connector.embeddedScenes), ["Other A"]), "the cache to be replaced")
        })
    })

    describe('liveMode', () => {
        beforeEach(() => {
            fake.scenes = [{ sceneName: "Scene 1" }]
            fake.programScene = "Scene 1"
        })

        test('"stream" reports the program as preview while not streaming', async () => {
            create({ liveMode: "stream" })
            connector.connect()
            await waitUntil(() => connector.isConnected(), "connection")
            await waitForPreviews(["Scene 1"])
            expect(communicator.programs).toEqual([])

            fake.startStream()
            await waitForPrograms(["Scene 1"])
            expect(communicator.previews).toEqual([])

            fake.stopStream()
            await waitForPrograms([])
        })

        // regression test for the deleted StreamStatus event: v5 has to query
        // the initial state, nothing pushes it
        test('"stream" picks up a stream that was already running at connect', async () => {
            fake.streaming = true
            create({ liveMode: "stream" })
            await connectAndSettle(["Scene 1"])
        })

        test('"record" treats a paused recording as off air', async () => {
            create({ liveMode: "record" })
            connector.connect()
            await waitUntil(() => connector.isConnected(), "connection")
            await waitForPrograms([])

            fake.startRecording()
            await waitForPrograms(["Scene 1"])

            fake.pauseRecording()
            await waitForPrograms([])

            fake.resumeRecording()
            await waitForPrograms(["Scene 1"])

            fake.stopRecording()
            await waitForPrograms([])
        })

        test('"record" picks up a recording that was already running at connect', async () => {
            fake.recording = true
            create({ liveMode: "record" })
            await connectAndSettle(["Scene 1"])
        })

        test('"streamOrRecord" is live when either is running', async () => {
            create({ liveMode: "streamOrRecord" })
            connector.connect()
            await waitUntil(() => connector.isConnected(), "connection")
            await waitForPrograms([])

            fake.startRecording()
            await waitForPrograms(["Scene 1"])
            fake.stopRecording()
            await waitForPrograms([])

            fake.startStream()
            await waitForPrograms(["Scene 1"])
            fake.stopStream()
            await waitForPrograms([])
        })
    })
})
