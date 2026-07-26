import TallyTracker from './tally'
import { ConnectionState, UdpTally, WebTally } from '../../domain/Tally'
import { createHarness, record } from './fakeSocket'

const udp = (name: string, extra = {}) => Object.assign({
    name,
    type: "udp",
    channelId: "1",
    address: "10.0.0.5",
    port: 7411,
    state: ConnectionState.CONNECTED,
}, extra)

const web = (name: string, extra = {}) => Object.assign({
    name,
    type: "web",
    channelId: "2",
    connectedClients: [],
}, extra)

describe('TallyTracker', () => {
    describe('initial state', () => {
        test('tallies is null before any socket event', () => {
            const { socket, socketEventEmitter } = createHarness()
            const tracker = new TallyTracker(socket, socketEventEmitter)

            // note: null, NOT undefined — differs from ChannelTracker on purpose
            expect(tracker.tallies).toBeNull()
        })
        test('it subscribes exactly once on construction', () => {
            const { socket, socketEventEmitter } = createHarness()
            new TallyTracker(socket, socketEventEmitter)

            expect(socket.countSent('events.tally.subscribe')).toEqual(1)
        })
    })

    describe('tally.state', () => {
        test('it converts udp payloads to UdpTally instances', () => {
            const { socket, socketEventEmitter } = createHarness()
            const tracker = new TallyTracker(socket, socketEventEmitter)

            socket.fromServer('tally.state', { tallies: [udp("Tally01")] })

            expect(tracker.tallies).toHaveLength(1)
            const tally = tracker.tallies[0]
            expect(tally).toBeInstanceOf(UdpTally)
            expect(tally.name).toEqual("Tally01")
            expect(tally.type).toEqual("udp")
            expect(tally.channelId).toEqual("1")
            expect(tally.isPatched()).toEqual(true)
            expect(tally.isConnected()).toEqual(true)
        })
        test('it converts web payloads to WebTally instances', () => {
            const { socket, socketEventEmitter } = createHarness()
            const tracker = new TallyTracker(socket, socketEventEmitter)

            socket.fromServer('tally.state', { tallies: [web("WebTally01")] })

            expect(tracker.tallies).toHaveLength(1)
            const tally = tracker.tallies[0]
            expect(tally).toBeInstanceOf(WebTally)
            expect(tally.type).toEqual("web")
            expect(tally.hasStageLight).toEqual(false)
        })
        test('it carries the per-tally configuration across', () => {
            // NOTE the wire keys are stBrightness/opBrightness — NOT the getter names.
            // See TallyConfigurationObjectType in tally/TallyConfiguration.ts:3-10.
            const { socket, socketEventEmitter } = createHarness()
            const tracker = new TallyTracker(socket, socketEventEmitter)

            socket.fromServer('tally.state', { tallies: [
                udp("Tally01", { stBrightness: 60, opBrightness: 80 }),
            ]})

            expect(tracker.tallies).toHaveLength(1)
            expect(tracker.tallies[0].configuration.getStageLightBrightness()).toEqual(60)
            expect(tracker.tallies[0].configuration.getOperatorLightBrightness()).toEqual(80)
        })
        test('an omitted brightness stays undefined (per-tally means "inherit default")', () => {
            // TallyConfiguration (per-tally) leaves it undefined so CommandCreator falls
            // back to DefaultTallyConfiguration. Distinct from the default class, which
            // seeds 100. Collapsing the two would override every tally's inheritance.
            const { socket, socketEventEmitter } = createHarness()
            const tracker = new TallyTracker(socket, socketEventEmitter)

            socket.fromServer('tally.state', { tallies: [udp("Tally01")] })

            expect(tracker.tallies).toHaveLength(1)
            expect(tracker.tallies[0].configuration.getStageLightBrightness()).toBeUndefined()
            expect(tracker.tallies[0].configuration.getOperatorLightBrightness()).toBeUndefined()
        })
        test('an unpatched tally survives the round trip', () => {
            const { socket, socketEventEmitter } = createHarness()
            const tracker = new TallyTracker(socket, socketEventEmitter)

            socket.fromServer('tally.state', { tallies: [udp("Loose", { channelId: undefined })] })

            expect(tracker.tallies).toHaveLength(1)
            expect(tracker.tallies[0].isPatched()).toEqual(false)
        })
        test('it notifies subscribers', () => {
            const { socket, socketEventEmitter } = createHarness()
            const tracker = new TallyTracker(socket, socketEventEmitter)
            const seen = record(tracker, 'tallies')

            socket.fromServer('tally.state', { tallies: [udp("Tally01")] })

            expect(seen.count).toEqual(1)
            expect(seen.last[0]).toBe(tracker.tallies)
        })
        test('each event produces a fresh array identity', () => {
            // useTallies.ts:12 does setTallies(Array.from(tallies)) precisely because
            // React bails out on an unchanged reference. The tracker already builds a
            // new array per event (`tallies.map(...)`), so the conversion can drop the
            // copy at the hook — but only if this stays true.
            const { socket, socketEventEmitter } = createHarness()
            const tracker = new TallyTracker(socket, socketEventEmitter)

            socket.fromServer('tally.state', { tallies: [udp("Tally01")] })
            const first = tracker.tallies
            socket.fromServer('tally.state', { tallies: [udp("Tally01")] })
            const second = tracker.tallies

            expect(second).not.toBe(first)
        })
    })

    describe('cached latest value', () => {
        test('a late subscriber can read the state it missed', () => {
            const { socket, socketEventEmitter } = createHarness()
            const tracker = new TallyTracker(socket, socketEventEmitter)

            socket.fromServer('tally.state', { tallies: [udp("Missed")] })

            const seen = record(tracker, 'tallies')
            expect(seen.count).toEqual(0)
            expect(tracker.tallies).toHaveLength(1)
            expect(tracker.tallies[0].name).toEqual("Missed")
        })
        test('the latest event wins', () => {
            const { socket, socketEventEmitter } = createHarness()
            const tracker = new TallyTracker(socket, socketEventEmitter)

            socket.fromServer('tally.state', { tallies: [udp("A")] })
            socket.fromServer('tally.state', { tallies: [udp("B"), udp("C")] })

            expect(tracker.tallies.map(t => t.name)).toEqual(["B", "C"])
        })
    })

    describe('subscribe / unsubscribe', () => {
        test('no delivery after unsubscribe', () => {
            const { socket, socketEventEmitter } = createHarness()
            const tracker = new TallyTracker(socket, socketEventEmitter)
            const seen = record(tracker, 'tallies')

            socket.fromServer('tally.state', { tallies: [udp("A")] })
            expect(seen.count).toEqual(1)

            seen.stop()
            socket.fromServer('tally.state', { tallies: [udp("B")] })
            expect(seen.count).toEqual(1)
            expect(tracker.tallies[0].name).toEqual("B")
        })
        test('subscribe / unsubscribe / subscribe delivers once (StrictMode double-mount)', () => {
            const { socket, socketEventEmitter } = createHarness()
            const tracker = new TallyTracker(socket, socketEventEmitter)

            const calls: any[] = []
            const listener = (t) => { calls.push(t) }
            tracker.on('tallies', listener)
            tracker.off('tallies', listener)
            tracker.on('tallies', listener)

            socket.fromServer('tally.state', { tallies: [udp("A")] })
            expect(calls).toHaveLength(1)

            tracker.off('tallies', listener)
        })
        test('two independent subscribers both receive the event', () => {
            const { socket, socketEventEmitter } = createHarness()
            const tracker = new TallyTracker(socket, socketEventEmitter)
            const a = record(tracker, 'tallies')
            const b = record(tracker, 'tallies')

            socket.fromServer('tally.state', { tallies: [udp("A")] })

            expect(a.count).toEqual(1)
            expect(b.count).toEqual(1)

            a.stop()
            socket.fromServer('tally.state', { tallies: [udp("B")] })
            expect(a.count).toEqual(1)   // one unsubscribe must not detach the other
            expect(b.count).toEqual(2)

            b.stop()
        })
    })

    describe('reconnect', () => {
        test('it re-subscribes when the socket reconnects', () => {
            const { socket, socketEventEmitter, reconnect } = createHarness()
            new TallyTracker(socket, socketEventEmitter)
            expect(socket.countSent('events.tally.subscribe')).toEqual(1)

            reconnect()
            expect(socket.countSent('events.tally.subscribe')).toEqual(2)
        })
    })
})
