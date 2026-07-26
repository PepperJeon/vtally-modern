import MixerTracker from './mixer'
import { createHarness, record } from './fakeSocket'

describe('MixerTracker', () => {
    // NOTE: MixerTracker takes only a socket — no socketEventEmitter. That is the
    // structural reason it cannot re-subscribe on reconnect. See the bug spec below.

    describe('initial state', () => {
        test('connectionState is null before any socket event', () => {
            const { socket } = createHarness()
            const tracker = new MixerTracker(socket)

            // null is the third state: "we do not know yet", rendered differently from
            // a known-false. useMixerInfo.ts:9 seeds React state from it directly.
            expect(tracker.connectionState).toBeNull()
        })
        test('it subscribes exactly once on construction', () => {
            const { socket } = createHarness()
            new MixerTracker(socket)

            expect(socket.countSent('events.mixer.subscribe')).toEqual(1)
        })
    })

    describe('mixer.state', () => {
        test('it tracks connected and disconnected', () => {
            const { socket } = createHarness()
            const tracker = new MixerTracker(socket)

            socket.fromServer('mixer.state', { isConnected: true })
            expect(tracker.connectionState).toEqual(true)

            socket.fromServer('mixer.state', { isConnected: false })
            expect(tracker.connectionState).toEqual(false)
        })
        test('false is distinct from the initial null', () => {
            const { socket } = createHarness()
            const tracker = new MixerTracker(socket)

            socket.fromServer('mixer.state', { isConnected: false })

            expect(tracker.connectionState).toEqual(false)
            expect(tracker.connectionState).not.toBeNull()
        })
        test('it notifies subscribers on every event, including repeats', () => {
            // The tracker does NOT dedupe — MixerCommunicator already deduped upstream.
            // A conversion that adds Object.is bail-out at the tracker would change
            // notification counts; it would not change rendered output, but pin it so
            // the change is deliberate.
            const { socket } = createHarness()
            const tracker = new MixerTracker(socket)
            const seen = record(tracker, 'connection')

            socket.fromServer('mixer.state', { isConnected: true })
            socket.fromServer('mixer.state', { isConnected: true })

            expect(seen.count).toEqual(2)
            expect(seen.last[0]).toEqual(true)
        })
    })

    describe('cached latest value', () => {
        test('a late subscriber can read the state it missed', () => {
            const { socket } = createHarness()
            const tracker = new MixerTracker(socket)

            socket.fromServer('mixer.state', { isConnected: true })

            const seen = record(tracker, 'connection')
            expect(seen.count).toEqual(0)
            expect(tracker.connectionState).toEqual(true)
        })
    })

    describe('subscribe / unsubscribe', () => {
        test('no delivery after unsubscribe', () => {
            const { socket } = createHarness()
            const tracker = new MixerTracker(socket)
            const seen = record(tracker, 'connection')

            socket.fromServer('mixer.state', { isConnected: true })
            expect(seen.count).toEqual(1)

            seen.stop()
            socket.fromServer('mixer.state', { isConnected: false })
            expect(seen.count).toEqual(1)
            expect(tracker.connectionState).toEqual(false)
        })
        test('subscribe / unsubscribe / subscribe delivers once (StrictMode double-mount)', () => {
            const { socket } = createHarness()
            const tracker = new MixerTracker(socket)

            const calls: any[] = []
            const listener = (c) => { calls.push(c) }
            tracker.on('connection', listener)
            tracker.off('connection', listener)
            tracker.on('connection', listener)

            socket.fromServer('mixer.state', { isConnected: true })
            expect(calls).toHaveLength(1)

            tracker.off('connection', listener)
        })
    })

    describe('reconnect', () => {
        // ⚠️ CHARACTERIZING A KNOWN BUG — plan unit 2d fixes this.
        // MixerTracker never re-subscribes after a socket reconnect, so after the hub
        // restarts the client stops receiving mixer.state and the connection indicator
        // freezes on its last value. ChannelTracker/ProgramTracker/TallyTracker/
        // TallyLogTracker all DO re-subscribe; this one and ConfigTracker do not.
        //
        // When 2d lands, this test MUST be inverted (expect 2, not 1) and moved out of
        // the "known bug" block. Flipping it is the deliberate signal that 2d worked.
        test('BUG: it does NOT re-subscribe when the socket reconnects', () => {
            const { socket, socketEventEmitter, reconnect } = createHarness()
            new MixerTracker(socket)
            expect(socket.countSent('events.mixer.subscribe')).toEqual(1)

            reconnect()

            expect(socket.countSent('events.mixer.subscribe')).toEqual(1)
            // and it never even listened for the reconnect signal
            expect(socketEventEmitter.listenerCount("connected")).toEqual(0)
        })
    })
})
