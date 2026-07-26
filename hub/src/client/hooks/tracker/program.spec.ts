import ProgramTracker from './program'
import { createHarness, record } from './fakeSocket'

describe('ProgramTracker', () => {
    describe('initial state', () => {
        test('programs and previews are null before any socket event', () => {
            const { socket, socketEventEmitter } = createHarness()
            const tracker = new ProgramTracker(socket, socketEventEmitter)

            expect(tracker.programs).toBeNull()
            expect(tracker.previews).toBeNull()
        })
        test('it subscribes exactly once on construction', () => {
            const { socket, socketEventEmitter } = createHarness()
            new ProgramTracker(socket, socketEventEmitter)

            expect(socket.countSent('events.program.subscribe')).toEqual(1)
        })
    })

    describe('program.state', () => {
        test('it stores programs and previews verbatim (no domain conversion)', () => {
            const { socket, socketEventEmitter } = createHarness()
            const tracker = new ProgramTracker(socket, socketEventEmitter)

            socket.fromServer('program.state', { programs: ["1", "2"], previews: ["3"] })

            expect(tracker.programs).toEqual(["1", "2"])
            expect(tracker.previews).toEqual(["3"])
        })
        test('null means "mixer state unknown" and is distinct from an empty list', () => {
            // MixerCommunicator.notifyProgramPreviewChanged(null, null) is what a connector
            // sends on mixer switch; CommandCreator renders UNKNOWN (blue) for null and
            // RELEASE for []. Collapsing the two changes what the physical tally shows.
            const { socket, socketEventEmitter } = createHarness()
            const tracker = new ProgramTracker(socket, socketEventEmitter)

            socket.fromServer('program.state', { programs: [], previews: [] })
            expect(tracker.programs).toEqual([])
            expect(tracker.programs).not.toBeNull()

            socket.fromServer('program.state', { programs: null, previews: null })
            expect(tracker.programs).toBeNull()
            expect(tracker.previews).toBeNull()
        })
        test('it emits BOTH values in a single notification', () => {
            // The local event carries two arguments. useSyncExternalStore returns ONE
            // snapshot, so the conversion has to bundle them — see report.
            const { socket, socketEventEmitter } = createHarness()
            const tracker = new ProgramTracker(socket, socketEventEmitter)
            const seen = record(tracker, 'program')

            socket.fromServer('program.state', { programs: ["1"], previews: ["2"] })

            expect(seen.count).toEqual(1)
            expect(seen.last).toHaveLength(2)
            expect(seen.last[0]).toEqual(["1"])
            expect(seen.last[1]).toEqual(["2"])
        })
        test('a program-only change still notifies with both values', () => {
            const { socket, socketEventEmitter } = createHarness()
            const tracker = new ProgramTracker(socket, socketEventEmitter)

            socket.fromServer('program.state', { programs: ["1"], previews: ["2"] })
            const seen = record(tracker, 'program')
            socket.fromServer('program.state', { programs: ["9"], previews: ["2"] })

            expect(seen.count).toEqual(1)
            expect(seen.last[0]).toEqual(["9"])
            expect(seen.last[1]).toEqual(["2"])
        })
        test('the two values stay consistent with each other', () => {
            // They must never be observable half-updated — a tally lit from a stale
            // program plus a fresh preview is exactly the tear this pins.
            const { socket, socketEventEmitter } = createHarness()
            const tracker = new ProgramTracker(socket, socketEventEmitter)

            let observed = null
            tracker.on('program', () => {
                observed = [tracker.programs, tracker.previews]
            })

            socket.fromServer('program.state', { programs: ["A"], previews: ["B"] })

            expect(observed).not.toBeNull()
            expect(observed[0]).toEqual(["A"])
            expect(observed[1]).toEqual(["B"])
        })
    })

    describe('cached latest value', () => {
        test('a late subscriber can read the state it missed', () => {
            const { socket, socketEventEmitter } = createHarness()
            const tracker = new ProgramTracker(socket, socketEventEmitter)

            socket.fromServer('program.state', { programs: ["5"], previews: ["6"] })

            const seen = record(tracker, 'program')
            expect(seen.count).toEqual(0)
            expect(tracker.programs).toEqual(["5"])
            expect(tracker.previews).toEqual(["6"])
        })
    })

    describe('subscribe / unsubscribe', () => {
        test('no delivery after unsubscribe', () => {
            const { socket, socketEventEmitter } = createHarness()
            const tracker = new ProgramTracker(socket, socketEventEmitter)
            const seen = record(tracker, 'program')

            socket.fromServer('program.state', { programs: ["1"], previews: [] })
            expect(seen.count).toEqual(1)

            seen.stop()
            socket.fromServer('program.state', { programs: ["2"], previews: [] })
            expect(seen.count).toEqual(1)
            expect(tracker.programs).toEqual(["2"])
        })
        test('subscribe / unsubscribe / subscribe delivers once (StrictMode double-mount)', () => {
            const { socket, socketEventEmitter } = createHarness()
            const tracker = new ProgramTracker(socket, socketEventEmitter)

            const calls: any[] = []
            const listener = (p, v) => { calls.push([p, v]) }
            tracker.on('program', listener)
            tracker.off('program', listener)
            tracker.on('program', listener)

            socket.fromServer('program.state', { programs: ["1"], previews: [] })
            expect(calls).toHaveLength(1)

            tracker.off('program', listener)
        })
    })

    describe('reconnect', () => {
        test('it re-subscribes when the socket reconnects', () => {
            const { socket, socketEventEmitter, reconnect } = createHarness()
            new ProgramTracker(socket, socketEventEmitter)
            expect(socket.countSent('events.program.subscribe')).toEqual(1)

            reconnect()
            expect(socket.countSent('events.program.subscribe')).toEqual(2)
        })
        test('the last known program survives a reconnect', () => {
            const { socket, socketEventEmitter, reconnect } = createHarness()
            const tracker = new ProgramTracker(socket, socketEventEmitter)

            socket.fromServer('program.state', { programs: ["1"], previews: ["2"] })
            reconnect()

            // NOT reset to null — the tally keeps showing the last known state while
            // the hub re-sends. Changing this would blank every tally on a reconnect.
            expect(tracker.programs).toEqual(["1"])
            expect(tracker.previews).toEqual(["2"])
        })
    })
})
