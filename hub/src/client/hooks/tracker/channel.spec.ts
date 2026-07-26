import ChannelTracker from './channel'
import { createHarness, record } from './fakeSocket'

// Characterization specs for the CURRENT EventEmitter implementation.
// These must stay green through the useSyncExternalStore conversion (plan unit 1a).

describe('ChannelTracker', () => {
    describe('initial state', () => {
        test('channels is undefined before any socket event', () => {
            const { socket, socketEventEmitter } = createHarness()
            const tracker = new ChannelTracker(socket, socketEventEmitter)

            expect(tracker.channels).toBeUndefined()
        })
        test('it subscribes exactly once on construction', () => {
            const { socket, socketEventEmitter } = createHarness()
            new ChannelTracker(socket, socketEventEmitter)

            expect(socket.countSent('events.channel.subscribe')).toEqual(1)
        })
    })

    describe('channel.state', () => {
        test('it converts the payload to Channel domain objects', () => {
            const { socket, socketEventEmitter } = createHarness()
            const tracker = new ChannelTracker(socket, socketEventEmitter)

            socket.fromServer('channel.state', { channels: [
                { id: "1", name: "Dave's Cam" },
                { id: "2" },
            ]})

            expect(tracker.channels).toHaveLength(2)
            expect(tracker.channels[0].id).toEqual("1")
            expect(tracker.channels[0].name).toEqual("Dave's Cam")
            // Channel.toString() falls back to the id — this is what ChannelSelector renders
            expect(tracker.channels[0].toString()).toEqual("Dave's Cam")
            expect(tracker.channels[1].id).toEqual("2")
            expect(tracker.channels[1].name).toBeUndefined()
            expect(tracker.channels[1].toString()).toEqual("2")
        })
        test('an empty channel list is distinct from "no data yet"', () => {
            const { socket, socketEventEmitter } = createHarness()
            const tracker = new ChannelTracker(socket, socketEventEmitter)

            socket.fromServer('channel.state', { channels: [] })

            expect(tracker.channels).toEqual([])
            expect(tracker.channels).not.toBeUndefined()
        })
        test('it notifies subscribers with the converted list', () => {
            const { socket, socketEventEmitter } = createHarness()
            const tracker = new ChannelTracker(socket, socketEventEmitter)
            const seen = record(tracker, 'channels')

            socket.fromServer('channel.state', { channels: [{ id: "1" }] })

            expect(seen.count).toEqual(1)
            expect(seen.last[0]).toHaveLength(1)
            expect(seen.last[0][0].id).toEqual("1")
        })
        test('it hands subscribers the same value the tracker holds', () => {
            const { socket, socketEventEmitter } = createHarness()
            const tracker = new ChannelTracker(socket, socketEventEmitter)
            const seen = record(tracker, 'channels')

            socket.fromServer('channel.state', { channels: [{ id: "1" }] })

            expect(seen.count).toEqual(1)
            expect(seen.last[0]).toBe(tracker.channels)
        })
    })

    describe('cached latest value', () => {
        // This is the property useSyncExternalStore's getSnapshot must preserve:
        // a subscriber attaching AFTER an event still sees current state.
        // useChannels.ts:8 relies on it via useState(channelTracker.channels).
        test('a late subscriber can read the state it missed', () => {
            const { socket, socketEventEmitter } = createHarness()
            const tracker = new ChannelTracker(socket, socketEventEmitter)

            socket.fromServer('channel.state', { channels: [{ id: "7", name: "Late" }] })

            const seen = record(tracker, 'channels')
            expect(seen.count).toEqual(0)                 // it genuinely missed the event
            expect(tracker.channels).toHaveLength(1)      // but state is still readable
            expect(tracker.channels[0].name).toEqual("Late")
        })
        test('the latest event wins', () => {
            const { socket, socketEventEmitter } = createHarness()
            const tracker = new ChannelTracker(socket, socketEventEmitter)

            socket.fromServer('channel.state', { channels: [{ id: "1" }] })
            socket.fromServer('channel.state', { channels: [{ id: "2" }, { id: "3" }] })

            expect(tracker.channels).toHaveLength(2)
            expect(tracker.channels.map(c => c.id)).toEqual(["2", "3"])
        })
    })

    describe('subscribe / unsubscribe', () => {
        test('no delivery after unsubscribe', () => {
            const { socket, socketEventEmitter } = createHarness()
            const tracker = new ChannelTracker(socket, socketEventEmitter)
            const seen = record(tracker, 'channels')

            socket.fromServer('channel.state', { channels: [{ id: "1" }] })
            expect(seen.count).toEqual(1)

            seen.stop()
            socket.fromServer('channel.state', { channels: [{ id: "2" }] })
            expect(seen.count).toEqual(1)                 // unchanged
            expect(tracker.channels[0].id).toEqual("2")   // tracker still updated
        })
        test('subscribe / unsubscribe / subscribe delivers once (StrictMode double-mount)', () => {
            const { socket, socketEventEmitter } = createHarness()
            const tracker = new ChannelTracker(socket, socketEventEmitter)

            const calls: any[] = []
            const listener = (channels) => { calls.push(channels) }

            // React 18 StrictMode mounts, unmounts, remounts with the same effect
            tracker.on('channels', listener)
            tracker.off('channels', listener)
            tracker.on('channels', listener)

            socket.fromServer('channel.state', { channels: [{ id: "1" }] })
            expect(calls).toHaveLength(1)

            tracker.off('channels', listener)
        })
        test('unsubscribing twice is safe', () => {
            const { socket, socketEventEmitter } = createHarness()
            const tracker = new ChannelTracker(socket, socketEventEmitter)
            const seen = record(tracker, 'channels')

            seen.stop()
            seen.stop()

            socket.fromServer('channel.state', { channels: [{ id: "1" }] })
            expect(seen.count).toEqual(0)
        })
    })

    describe('reconnect', () => {
        test('it re-subscribes when the socket reconnects', () => {
            const { socket, socketEventEmitter, reconnect } = createHarness()
            new ChannelTracker(socket, socketEventEmitter)
            expect(socket.countSent('events.channel.subscribe')).toEqual(1)

            reconnect()
            expect(socket.countSent('events.channel.subscribe')).toEqual(2)

            reconnect()
            expect(socket.countSent('events.channel.subscribe')).toEqual(3)
        })
        test('state survives a reconnect until the hub sends fresh data', () => {
            const { socket, socketEventEmitter, reconnect } = createHarness()
            const tracker = new ChannelTracker(socket, socketEventEmitter)

            socket.fromServer('channel.state', { channels: [{ id: "1" }] })
            reconnect()

            expect(tracker.channels).toHaveLength(1)   // NOT cleared on reconnect
        })
    })
})
