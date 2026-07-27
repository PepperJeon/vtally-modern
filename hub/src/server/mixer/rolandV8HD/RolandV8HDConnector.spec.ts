import { afterEach, describe, expect, test, vi } from 'vitest'
import { EventEmitter } from 'events'
import RolandV8HDConnector from './RolandV8HDConnector'
import RolandV8HDConfiguration from '../../../shared/mixer/rolandV8HD/RolandV8HDConfiguration'
import { MixerCommunicator } from '../../lib/MixerCommunicator'
import { AppConfiguration } from '../../lib/AppConfiguration'
import CommandCreator from '../../../shared/tally/CommandCreator'
import { UdpTally } from '../../../shared/domain/Tally'

// The connector already exposes `midi` as an instance field for exactly this,
// so no module mocking is needed: swap it before connect().
class FakePort extends EventEmitter {
    open = false
    getPortCount() { return 1 }
    getPortName(_i: number) { return "V-8HD MIDI 1" }
    openPort(_i: number) { this.open = true }
    closePort() { this.open = false }
    isPortOpen() { return this.open }
    ignoreTypes(_a: boolean, _b: boolean, _c: boolean) { /* noop */ }
    sendMessage(_msg: number[]) { /* noop */ }
}

const waitUntil = async (fn: () => boolean, message: string, timeoutMs = 3000) => {
    const deadline = Date.now() + timeoutMs
    while (!fn()) {
        if (Date.now() > deadline) { throw new Error(`waitUntil timed out waiting for ${message}`) }
        await new Promise(resolve => setTimeout(resolve, 5))
    }
}

describe('RolandV8HDConnector', () => {
    let connector: RolandV8HDConnector

    afterEach(() => {
        connector?.disconnect()
        vi.restoreAllMocks()
    })

    const create = (requestInterval = 100) => {
        vi.spyOn(console, 'error').mockImplementation(() => {})
        const emitter = new EventEmitter()
        const appConfiguration = new AppConfiguration(emitter as any)
        appConfiguration.save = async () => {}
        const communicator = new MixerCommunicator(appConfiguration, emitter as any)
        const configuration = new RolandV8HDConfiguration()
        configuration.setRequestInterval(requestInterval)
        connector = new RolandV8HDConnector(configuration, communicator)
        const input = new FakePort()
        // constructed with `new`, so these have to be callable as constructors
        connector.midi = {
            Input: function () { return input },
            Output: function () { return new FakePort() },
        }
        return { communicator, input }
    }

    // one full poll answer: 8 channels, channel 0 on program, the rest off.
    // The publish is gated on channel index 7 arriving.
    const answerPoll = (input: FakePort) => {
        for (let i = 0; i < 8; i++) {
            const message: number[] = []
            message[8] = 12
            message[10] = i
            message[11] = i === 0 ? 1 : 0
            input.emit('message', 0, message)
        }
    }

    test('reports the mixer as lost when the device stops answering, and tallies go to "unknown"', async () => {
        const { communicator, input } = create(100)
        connector.connect()
        answerPoll(input)

        expect(connector.isConnected()).toBe(true)
        expect(communicator.getCurrentPrograms()).toEqual(["1"])
        const tally = new UdpTally("cam1", "1")
        expect(CommandCreator.getState(tally, communicator.getCurrentPrograms(), communicator.getCurrentPreviews())).toEqual("on-air")

        // the cable is unplugged: no more 'message' events, and rtmidi reports nothing
        await waitUntil(() => connector.isConnected() === false, "the watchdog to fire")

        expect(communicator.isConnected).toBe(false)
        expect(communicator.getCurrentPrograms()).toEqual(null)
        expect(CommandCreator.getState(tally, communicator.getCurrentPrograms(), communicator.getCurrentPreviews())).toEqual("unknown")
    })

    test('recovers when the device starts answering again', async () => {
        const { communicator, input } = create(100)
        connector.connect()
        answerPoll(input)
        await waitUntil(() => connector.isConnected() === false, "the watchdog to fire")

        answerPoll(input)
        expect(connector.isConnected()).toBe(true)
        expect(communicator.isConnected).toBe(true)
        expect(communicator.getCurrentPrograms()).toEqual(["1"])
    })

    test('keeps the connection alive while the device keeps answering', async () => {
        const { communicator, input } = create(100)
        connector.connect()

        // past the 1500ms timeout floor, so a watchdog that did not re-arm would fire
        const deadline = Date.now() + 2000
        while (Date.now() < deadline) {
            answerPoll(input)
            await new Promise(resolve => setTimeout(resolve, 50))
        }
        expect(connector.isConnected()).toBe(true)
        expect(communicator.isConnected).toBe(true)
    }, 10000)
})
