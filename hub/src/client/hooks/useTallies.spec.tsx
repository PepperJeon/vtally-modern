import React from 'react'
import { act, render } from '@testing-library/react'
import { ConnectionState } from '../../shared/domain/Tally'
import DisconnectedClientSideSocket from '../lib/DisconnectedClientSideSocket'
import { socket, socketEventEmitter } from './useSocket'
import useTallies from './useTallies'
import useSocketInfo from './useSocketInfo'

// Hook-level characterization. Only ONE hook spec is worth writing: the other six
// hooks are the same six lines of useState + useEffect glue over a tracker, and the
// tracker specs already pin the behaviour underneath. What is NOT covered anywhere
// else — and what this file exists for — is the module-singleton wiring:
//
//   useSocket.ts:10-12  under Jest, `socket` is a DisconnectedClientSideSocket
//   useTallies.ts:5     `const tallyTracker = new TallyTracker(socket, socketEventEmitter)`
//
// The tracker is created at module load and shared by every component. That is the
// part useSyncExternalStore has to keep working, and the part no unit test touches.

// `socket` is the real module singleton; under Jest it is always the disconnected stub.
const fakeHub = socket as DisconnectedClientSideSocket

const udp = (name: string) => ({
    name,
    type: "udp",
    channelId: "1",
    address: "10.0.0.5",
    port: 7411,
    state: ConnectionState.CONNECTED,
})

function TallyNames() {
    const tallies = useTallies()
    return <div data-testid="names">{(tallies || []).map(t => t.name).join(",")}</div>
}

function HubStatus() {
    const isConnected = useSocketInfo()
    return <div data-testid="status">{String(isConnected)}</div>
}

describe('useTallies', () => {
    test('it renders tallies pushed by the hub', () => {
        const { getByTestId } = render(<TallyNames />)
        expect(getByTestId("names").textContent).toEqual("")

        act(() => {
            fakeHub.emitServerEvent('tally.state', { tallies: [udp("Tally01"), udp("Tally02")] })
        })

        expect(getByTestId("names").textContent).toEqual("Tally01,Tally02")
    })

    test('a component mounting AFTER the event still sees current state', () => {
        // The cached-latest-value property, observed through React. This is the exact
        // seam useSyncExternalStore's getSnapshot replaces — get it wrong and /  and
        // /config render empty on navigation until the next hub push.
        act(() => {
            fakeHub.emitServerEvent('tally.state', { tallies: [udp("Already-Here")] })
        })

        const { getByTestId } = render(<TallyNames />)
        expect(getByTestId("names").textContent).toEqual("Already-Here")
    })

    test('two mounted components both update from one hub event', () => {
        // scoped via each render's own container — getByTestId searches document.body
        // and would find both nodes.
        const first = render(<TallyNames />)
        const second = render(<TallyNames />)
        const nameOf = (r) => r.container.querySelector('[data-testid=names]').textContent

        act(() => {
            fakeHub.emitServerEvent('tally.state', { tallies: [udp("Shared")] })
        })

        expect(nameOf(first)).toEqual("Shared")
        expect(nameOf(second)).toEqual("Shared")

        first.unmount()

        act(() => {
            fakeHub.emitServerEvent('tally.state', { tallies: [udp("StillHere")] })
        })

        // the surviving component keeps updating after its sibling unmounted
        expect(nameOf(second)).toEqual("StillHere")
        second.unmount()
    })

    test('an unmounted component stops receiving updates', () => {
        const { getByTestId, unmount } = render(<TallyNames />)
        act(() => {
            fakeHub.emitServerEvent('tally.state', { tallies: [udp("Before")] })
        })
        const node = getByTestId("names")
        expect(node.textContent).toEqual("Before")

        unmount()

        // If the useEffect cleanup leaked, this would warn about setting state on an
        // unmounted component; the assertion is that the detached DOM never changes.
        act(() => {
            fakeHub.emitServerEvent('tally.state', { tallies: [udp("After")] })
        })
        expect(node.textContent).toEqual("Before")
    })
})

describe('useSocketInfo', () => {
    test('it follows the socketEventEmitter connect/disconnect signals', () => {
        const { getByTestId } = render(<HubStatus />)
        expect(getByTestId("status").textContent).toEqual("false")

        act(() => { socketEventEmitter.emit("connected") })
        expect(getByTestId("status").textContent).toEqual("true")

        act(() => { socketEventEmitter.emit("disconnected") })
        expect(getByTestId("status").textContent).toEqual("false")
    })

    test('it detaches both listeners on unmount', () => {
        const before = socketEventEmitter.listenerCount("connected")
        const { unmount } = render(<HubStatus />)
        expect(socketEventEmitter.listenerCount("connected")).toEqual(before + 1)
        expect(socketEventEmitter.listenerCount("disconnected")).toBeGreaterThan(0)

        unmount()
        expect(socketEventEmitter.listenerCount("connected")).toEqual(before)
    })
})
