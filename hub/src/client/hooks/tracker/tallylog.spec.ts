import TallyLogTracker from './tallylog'
import Log, { Severity } from '../../../shared/domain/Log'
import { createHarness, record } from './fakeSocket'

const logJson = (message: string, severity: Severity = Severity.INFO, date = "2022-02-03T10:00:00.000Z") =>
    ({ message, severity, date })

describe('TallyLogTracker', () => {
    // NOTE: this is the only tracker with a PER-KEY subscription — the local event
    // name is `log.${tallyId}`, and useTallyLog(tallyId) is parameterized.

    describe('initial state', () => {
        test('logs is null before any socket event', () => {
            const { socket, socketEventEmitter } = createHarness()
            const tracker = new TallyLogTracker(socket, socketEventEmitter)

            expect(tracker.logs).toBeNull()
        })
        test('it subscribes exactly once on construction', () => {
            const { socket, socketEventEmitter } = createHarness()
            new TallyLogTracker(socket, socketEventEmitter)

            expect(socket.countSent('events.tallyLog.subscribe')).toEqual(1)
        })
    })

    describe('tally.log.state (bulk)', () => {
        test('it builds a Map of tallyId to Log objects', () => {
            const { socket, socketEventEmitter } = createHarness()
            const tracker = new TallyLogTracker(socket, socketEventEmitter)

            socket.fromServer('tally.log.state', [
                { tallyId: "udp-Tally01", logs: [logJson("Hello"), logJson("World", Severity.WARNING)] },
                { tallyId: "udp-Tally02", logs: [logJson("Other")] },
            ])

            expect(tracker.logs).toBeInstanceOf(Map)
            expect(tracker.logs.size).toEqual(2)

            const first = tracker.logs.get("udp-Tally01")
            expect(first).toHaveLength(2)
            expect(first[0]).toBeInstanceOf(Log)
            expect(first[0].message).toEqual("Hello")
            expect(first[0].isInfo()).toEqual(true)
            expect(first[1].isWarning()).toEqual(true)
            expect(first[0].dateTime).toBeInstanceOf(Date)
            expect(first[0].dateTime.toISOString()).toEqual("2022-02-03T10:00:00.000Z")
        })
        test('it notifies once per tally, on that tally\'s own event name', () => {
            const { socket, socketEventEmitter } = createHarness()
            const tracker = new TallyLogTracker(socket, socketEventEmitter)
            const one = record(tracker, 'log.udp-Tally01')
            const two = record(tracker, 'log.udp-Tally02')

            socket.fromServer('tally.log.state', [
                { tallyId: "udp-Tally01", logs: [logJson("A")] },
                { tallyId: "udp-Tally02", logs: [logJson("B")] },
            ])

            expect(one.count).toEqual(1)
            expect(two.count).toEqual(1)
            expect(one.last[0][0].message).toEqual("A")
            expect(two.last[0][0].message).toEqual("B")
        })
        test('a subscriber for one tally is not notified about another', () => {
            const { socket, socketEventEmitter } = createHarness()
            const tracker = new TallyLogTracker(socket, socketEventEmitter)
            const one = record(tracker, 'log.udp-Tally01')

            socket.fromServer('tally.log.state', [
                { tallyId: "udp-Tally02", logs: [logJson("B")] },
            ])

            expect(one.count).toEqual(0)
        })
        test('a second bulk event replaces the whole Map', () => {
            const { socket, socketEventEmitter } = createHarness()
            const tracker = new TallyLogTracker(socket, socketEventEmitter)

            socket.fromServer('tally.log.state', [
                { tallyId: "udp-Old", logs: [logJson("A")] },
            ])
            socket.fromServer('tally.log.state', [
                { tallyId: "udp-New", logs: [logJson("B")] },
            ])

            expect(tracker.logs.has("udp-Old")).toEqual(false)
            expect(tracker.logs.has("udp-New")).toEqual(true)
        })
    })

    describe('tally.log (incremental)', () => {
        test('it appends to an existing tally\'s log list', () => {
            const { socket, socketEventEmitter } = createHarness()
            const tracker = new TallyLogTracker(socket, socketEventEmitter)

            socket.fromServer('tally.log.state', [
                { tallyId: "udp-Tally01", logs: [logJson("First")] },
            ])
            const seen = record(tracker, 'log.udp-Tally01')

            socket.fromServer('tally.log', {
                tallyId: "udp-Tally01",
                log: logJson("Second", Severity.ERROR),
            })

            expect(seen.count).toEqual(1)
            const logs = tracker.logs.get("udp-Tally01")
            expect(logs).toHaveLength(2)
            expect(logs[1].message).toEqual("Second")
            expect(logs[1].isError()).toEqual(true)
            expect(seen.last[0]).toBe(logs)
        })
        test('it creates an entry for a tally it has never seen', () => {
            const { socket, socketEventEmitter } = createHarness()
            const tracker = new TallyLogTracker(socket, socketEventEmitter)

            socket.fromServer('tally.log.state', [
                { tallyId: "udp-Known", logs: [logJson("A")] },
            ])
            const seen = record(tracker, 'log.udp-Fresh')

            const warn = console.warn
            let warned = 0
            console.warn = () => { warned++ }
            try {
                socket.fromServer('tally.log', { tallyId: "udp-Fresh", log: logJson("B") })
            } finally {
                console.warn = warn
            }

            expect(warned).toEqual(1)   // it logs "might be incomplete"
            expect(seen.count).toEqual(1)
            expect(tracker.logs.get("udp-Fresh")).toHaveLength(1)
        })
        test('BUG-ADJACENT: a log arriving before the bulk state is dropped', () => {
            // tallylog.ts:24-27 discards the entry and warns. Documented, not judged —
            // it is a real (small) data-loss window on a slow first paint.
            const { socket, socketEventEmitter } = createHarness()
            const tracker = new TallyLogTracker(socket, socketEventEmitter)
            const seen = record(tracker, 'log.udp-Tally01')

            const warn = console.warn
            let warned = 0
            console.warn = () => { warned++ }
            try {
                socket.fromServer('tally.log', { tallyId: "udp-Tally01", log: logJson("Lost") })
            } finally {
                console.warn = warn
            }

            expect(warned).toEqual(1)
            expect(seen.count).toEqual(0)
            expect(tracker.logs).toBeNull()
        })
        test('the appended array keeps its identity (mutated in place)', () => {
            // tallylog.ts:34 does entry.push(theLog) — the SAME array instance is
            // re-emitted. This is exactly why useTallyLog.ts:12 copies with
            // Array.from(logs), and why a naive getSnapshot() returning this array
            // would never re-render. See report.
            const { socket, socketEventEmitter } = createHarness()
            const tracker = new TallyLogTracker(socket, socketEventEmitter)

            socket.fromServer('tally.log.state', [
                { tallyId: "udp-Tally01", logs: [logJson("First")] },
            ])
            const before = tracker.logs.get("udp-Tally01")

            socket.fromServer('tally.log', { tallyId: "udp-Tally01", log: logJson("Second") })

            expect(tracker.logs.get("udp-Tally01")).toBe(before)
            expect(before).toHaveLength(2)
        })
    })

    describe('cached latest value', () => {
        test('a late subscriber can read the logs it missed', () => {
            const { socket, socketEventEmitter } = createHarness()
            const tracker = new TallyLogTracker(socket, socketEventEmitter)

            socket.fromServer('tally.log.state', [
                { tallyId: "udp-Tally01", logs: [logJson("Missed")] },
            ])

            const seen = record(tracker, 'log.udp-Tally01')
            expect(seen.count).toEqual(0)
            expect(tracker.logs.get("udp-Tally01")).toHaveLength(1)
            expect(tracker.logs.get("udp-Tally01")[0].message).toEqual("Missed")
        })
        test('an unknown tallyId reads as undefined, not a throw', () => {
            // useTallyLog.ts:8 seeds with tallyLogTracker.logs?.get(tallyId)
            const { socket, socketEventEmitter } = createHarness()
            const tracker = new TallyLogTracker(socket, socketEventEmitter)

            socket.fromServer('tally.log.state', [
                { tallyId: "udp-Tally01", logs: [logJson("A")] },
            ])

            expect(tracker.logs.get("udp-Nope")).toBeUndefined()
        })
    })

    describe('subscribe / unsubscribe', () => {
        test('no delivery after unsubscribe', () => {
            const { socket, socketEventEmitter } = createHarness()
            const tracker = new TallyLogTracker(socket, socketEventEmitter)

            socket.fromServer('tally.log.state', [
                { tallyId: "udp-Tally01", logs: [logJson("A")] },
            ])
            const seen = record(tracker, 'log.udp-Tally01')

            socket.fromServer('tally.log', { tallyId: "udp-Tally01", log: logJson("B") })
            expect(seen.count).toEqual(1)

            seen.stop()
            socket.fromServer('tally.log', { tallyId: "udp-Tally01", log: logJson("C") })
            expect(seen.count).toEqual(1)
            expect(tracker.logs.get("udp-Tally01")).toHaveLength(3)
        })
        test('subscribe / unsubscribe / subscribe delivers once (StrictMode double-mount)', () => {
            const { socket, socketEventEmitter } = createHarness()
            const tracker = new TallyLogTracker(socket, socketEventEmitter)

            socket.fromServer('tally.log.state', [
                { tallyId: "udp-Tally01", logs: [] },
            ])

            const calls: any[] = []
            const listener = (l) => { calls.push(l) }
            tracker.on('log.udp-Tally01', listener)
            tracker.off('log.udp-Tally01', listener)
            tracker.on('log.udp-Tally01', listener)

            socket.fromServer('tally.log', { tallyId: "udp-Tally01", log: logJson("A") })
            expect(calls).toHaveLength(1)

            tracker.off('log.udp-Tally01', listener)
        })
    })

    describe('reconnect', () => {
        test('it re-subscribes when the socket reconnects', () => {
            const { socket, socketEventEmitter, reconnect } = createHarness()
            new TallyLogTracker(socket, socketEventEmitter)
            expect(socket.countSent('events.tallyLog.subscribe')).toEqual(1)

            reconnect()
            expect(socket.countSent('events.tallyLog.subscribe')).toEqual(2)
        })
    })
})
