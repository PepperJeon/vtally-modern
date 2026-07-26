import Emitter from '../../lib/Emitter'
import DisconnectedClientSideSocket from '../../lib/DisconnectedClientSideSocket'

// ponytail: DisconnectedClientSideSocket already implements ClientSideSocket and its own
// header says "used for tests only" — reused instead of hand-rolling a second fake.
// All it lacks is a record of what the client sent, which is the one thing these specs
// need to assert (subscribe / re-subscribe on reconnect).
export class FakeSocket extends DisconnectedClientSideSocket {
    sent: string[] = []

    emit(event: any, ...args: any[]) {
        this.sent.push(event as string)
        return super.emit(event, ...args)
    }

    /** pretend the hub pushed an event down to us */
    fromServer(event: string, payload?: any) {
        this.emitServerEvent(event, payload)
    }

    countSent(event: string) {
        return this.sent.filter(e => e === event).length
    }
}

export function createHarness() {
    const socket = new FakeSocket()
    const socketEventEmitter = new Emitter()
    return {
        socket,
        socketEventEmitter,
        /** what useSocket.ts does when socket.io reports "connect" */
        reconnect: () => socketEventEmitter.emit("connected"),
    }
}

/**
 * Records every emission of `eventName`. `count` is the fail-if-never-called guard —
 * assert it before reading `last`, so a listener that never ran can't pass silently.
 */
export function record(tracker: Emitter, eventName: string) {
    const calls: any[][] = []
    const listener = (...args: any[]) => { calls.push(args) }
    tracker.on(eventName, listener)
    return {
        calls,
        listener,
        get count() { return calls.length },
        get last() { return calls[calls.length - 1] },
        stop: () => { tracker.off(eventName, listener) },
    }
}
