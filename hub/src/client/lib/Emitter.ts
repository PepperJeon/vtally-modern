// Node's `events` module, minus Node. CRA/webpack silently polyfilled `events`
// for the browser bundle; Vite does not, so the six trackers, useSocket and
// DisconnectedClientSideSocket needed a replacement.
//
// ponytail: this is deliberately the whole of it. The client only ever uses
// on/off/emit/listenerCount/removeAllListeners, and emit is synchronous in
// Node too, so the tracker characterization specs pass against this unchanged.
// No `once`, no max-listener warnings, no error-event special case — add them
// when something actually needs one.
type Listener = (...args: any[]) => void

class Emitter {
    private listeners = new Map<string | symbol, Set<Listener>>()

    on(event: string | symbol, listener: Listener): this {
        let set = this.listeners.get(event)
        if (!set) {
            set = new Set()
            this.listeners.set(event, set)
        }
        set.add(listener)
        return this
    }

    off(event: string | symbol, listener: Listener): this {
        this.listeners.get(event)?.delete(listener)
        return this
    }

    emit(event: string | symbol, ...args: any[]): boolean {
        const set = this.listeners.get(event)
        if (!set || set.size === 0) { return false }
        // copy first: a listener may unsubscribe itself (or a sibling) mid-emit
        Array.from(set).forEach(listener => listener(...args))
        return true
    }

    listenerCount(event: string | symbol): number {
        return this.listeners.get(event)?.size ?? 0
    }

    removeAllListeners(): this {
        this.listeners.clear()
        return this
    }
}

export default Emitter
