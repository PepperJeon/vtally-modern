import ConfigTracker from './config'
import AtemConfiguration from '../../../shared/mixer/atem/AtemConfiguration'
import ObsConfiguration from '../../../shared/mixer/obs/ObsConfiguration'
import { DefaultTallyConfiguration } from '../../../shared/tally/TallyConfiguration'
import { createHarness, record } from './fakeSocket'

describe('ConfigTracker', () => {
    // NOTE: ConfigTracker takes only a socket — no socketEventEmitter, same as
    // MixerTracker. It listens to EIGHT separate socket events and holds EIGHT
    // independent fields; there is no single "config.changed" event or combined
    // config object anywhere in SocketEvents.ts.

    describe('initial state', () => {
        test('every field is undefined before any socket event', () => {
            const { socket } = createHarness()
            const tracker = new ConfigTracker(socket)

            expect(tracker.mixerName).toBeUndefined()
            expect(tracker.allowedMixers).toBeUndefined()
            expect(tracker.atemConfiguration).toBeUndefined()
            expect(tracker.mockConfiguration).toBeUndefined()
            expect(tracker.obsConfiguration).toBeUndefined()
            expect(tracker.rolandV8HDConfiguration).toBeUndefined()
            expect(tracker.rolandV60HDConfiguration).toBeUndefined()
            expect(tracker.vmixConfiguration).toBeUndefined()
            expect(tracker.defaultTallyConfiguration).toBeUndefined()
        })
        test('it subscribes exactly once on construction', () => {
            const { socket } = createHarness()
            new ConfigTracker(socket)

            expect(socket.countSent('events.config.subscribe')).toEqual(1)
        })
    })

    describe('config.state.mixer', () => {
        test('one socket event populates two fields and fires two notifications', () => {
            const { socket } = createHarness()
            const tracker = new ConfigTracker(socket)
            const mixer = record(tracker, 'mixer')
            const allowed = record(tracker, 'allowedMixers')

            socket.fromServer('config.state.mixer', {
                mixerName: "obs",
                allowedMixers: ["null", "obs", "atem"],
            })

            expect(tracker.mixerName).toEqual("obs")
            expect(tracker.allowedMixers).toEqual(["null", "obs", "atem"])
            expect(mixer.count).toEqual(1)
            expect(mixer.last[0]).toEqual("obs")
            expect(allowed.count).toEqual(1)
            expect(allowed.last[0]).toEqual(["null", "obs", "atem"])
        })
        test('a mixer subscriber is not notified by allowedMixers and vice versa', () => {
            // The 8 local event names are independent channels. A conversion that
            // collapses them into one "changed" notification re-renders every config
            // component on every config event — correctness-neutral but a real
            // regression for /config, which mounts all of them at once.
            const { socket } = createHarness()
            const tracker = new ConfigTracker(socket)
            const mixer = record(tracker, 'mixer')

            socket.fromServer('config.state.obs', { ip: "1.2.3.4", port: 4455 })

            expect(mixer.count).toEqual(0)
            expect(tracker.obsConfiguration).not.toBeUndefined()
        })
    })

    describe('JSON to domain object conversion', () => {
        test('obs payload becomes an ObsConfiguration', () => {
            const { socket } = createHarness()
            const tracker = new ConfigTracker(socket)
            const seen = record(tracker, 'obs')

            socket.fromServer('config.state.obs', {
                ip: "10.1.1.42", port: 4455, liveMode: "stream",
            })

            expect(seen.count).toEqual(1)
            expect(tracker.obsConfiguration).toBeInstanceOf(ObsConfiguration)
            expect(tracker.obsConfiguration.getIp().toString()).toEqual("10.1.1.42")
            expect(tracker.obsConfiguration.getPort().toNumber()).toEqual(4455)
            expect(tracker.obsConfiguration.getLiveMode()).toEqual("stream")
            expect(seen.last[0]).toBe(tracker.obsConfiguration)
        })
        test('atem payload becomes an AtemConfiguration', () => {
            const { socket } = createHarness()
            const tracker = new ConfigTracker(socket)
            const seen = record(tracker, 'atem')

            socket.fromServer('config.state.atem', { ip: "192.168.99.200", port: 9910 })

            expect(seen.count).toEqual(1)
            expect(tracker.atemConfiguration).toBeInstanceOf(AtemConfiguration)
            expect(tracker.atemConfiguration.getIp().toString()).toEqual("192.168.99.200")
            expect(tracker.atemConfiguration.getPort().toNumber()).toEqual(9910)
        })
        test('tallyconfig payload becomes a DefaultTallyConfiguration', () => {
            const { socket } = createHarness()
            const tracker = new ConfigTracker(socket)
            const seen = record(tracker, 'tally')

            // NOTE the wire keys are opBrightness/stBrightness — NOT the getter names.
            // See TallyConfigurationObjectType in tally/TallyConfiguration.ts:3-10.
            socket.fromServer('config.state.tallyconfig', {
                opBrightness: 80, stBrightness: 60,
            })

            expect(seen.count).toEqual(1)
            expect(tracker.defaultTallyConfiguration).toBeInstanceOf(DefaultTallyConfiguration)
            expect(tracker.defaultTallyConfiguration.getOperatorLightBrightness()).toEqual(80)
            expect(tracker.defaultTallyConfiguration.getStageLightBrightness()).toEqual(60)
        })
        test('an empty tallyconfig payload keeps the 100/100 defaults', () => {
            const { socket } = createHarness()
            const tracker = new ConfigTracker(socket)

            socket.fromServer('config.state.tallyconfig', {})

            expect(tracker.defaultTallyConfiguration.getOperatorLightBrightness()).toEqual(100)
            expect(tracker.defaultTallyConfiguration.getStageLightBrightness()).toEqual(100)
        })
        test('a partial payload falls back to the configuration defaults', () => {
            // Configuration.loadIpAddress/loadIpPort skip absent keys, so an omitted
            // field keeps the class default rather than becoming undefined.
            const { socket } = createHarness()
            const tracker = new ConfigTracker(socket)

            socket.fromServer('config.state.atem', { ip: "10.0.0.1" })

            expect(tracker.atemConfiguration.getIp().toString()).toEqual("10.0.0.1")
            expect(tracker.atemConfiguration.getPort().toNumber()).toEqual(9910)
        })
        test('each event builds a fresh instance', () => {
            // The hooks rely on reference inequality to re-render.
            const { socket } = createHarness()
            const tracker = new ConfigTracker(socket)

            socket.fromServer('config.state.obs', { ip: "1.2.3.4", port: 4455 })
            const first = tracker.obsConfiguration
            socket.fromServer('config.state.obs', { ip: "1.2.3.4", port: 4455 })

            expect(tracker.obsConfiguration).not.toBe(first)
        })
        test('the tracker field is already updated when subscribers run', () => {
            const { socket } = createHarness()
            const tracker = new ConfigTracker(socket)

            let observedAtNotify
            tracker.on('obs', () => { observedAtNotify = tracker.obsConfiguration })

            socket.fromServer('config.state.obs', { ip: "9.9.9.9", port: 4455 })

            expect(observedAtNotify).not.toBeUndefined()
            expect(observedAtNotify.getIp().toString()).toEqual("9.9.9.9")
        })
    })

    describe('cached latest value', () => {
        // useConfiguration.ts's 7 config hooks re-read configTracker.xConfiguration
        // inside useEffect (e.g. :96 setObsConfiguration(configTracker.obsConfiguration))
        // precisely because the event may have arrived before the component mounted.
        test('a late subscriber can read the state it missed', () => {
            const { socket } = createHarness()
            const tracker = new ConfigTracker(socket)

            socket.fromServer('config.state.obs', { ip: "5.5.5.5", port: 4455 })

            const seen = record(tracker, 'obs')
            expect(seen.count).toEqual(0)
            expect(tracker.obsConfiguration.getIp().toString()).toEqual("5.5.5.5")
        })
        test('fields populated by different events coexist', () => {
            const { socket } = createHarness()
            const tracker = new ConfigTracker(socket)

            socket.fromServer('config.state.mixer', { mixerName: "obs", allowedMixers: ["obs"] })
            socket.fromServer('config.state.obs', { ip: "1.1.1.1", port: 4455 })
            socket.fromServer('config.state.atem', { ip: "2.2.2.2", port: 9910 })

            // A single-snapshot store would have let the last event clobber the others.
            expect(tracker.mixerName).toEqual("obs")
            expect(tracker.obsConfiguration.getIp().toString()).toEqual("1.1.1.1")
            expect(tracker.atemConfiguration.getIp().toString()).toEqual("2.2.2.2")
        })
    })

    describe('subscribe / unsubscribe', () => {
        test('no delivery after unsubscribe', () => {
            const { socket } = createHarness()
            const tracker = new ConfigTracker(socket)
            const seen = record(tracker, 'obs')

            socket.fromServer('config.state.obs', { ip: "1.1.1.1", port: 4455 })
            expect(seen.count).toEqual(1)

            seen.stop()
            socket.fromServer('config.state.obs', { ip: "2.2.2.2", port: 4455 })
            expect(seen.count).toEqual(1)
            expect(tracker.obsConfiguration.getIp().toString()).toEqual("2.2.2.2")
        })
        test('subscribe / unsubscribe / subscribe delivers once (StrictMode double-mount)', () => {
            const { socket } = createHarness()
            const tracker = new ConfigTracker(socket)

            const calls: any[] = []
            const listener = (c) => { calls.push(c) }
            tracker.on('obs', listener)
            tracker.off('obs', listener)
            tracker.on('obs', listener)

            socket.fromServer('config.state.obs', { ip: "1.1.1.1", port: 4455 })
            expect(calls).toHaveLength(1)

            tracker.off('obs', listener)
        })
    })

    describe('reconnect', () => {
        // ⚠️ CHARACTERIZING A KNOWN BUG — plan unit 2d fixes this.
        // After the hub restarts, /config stops receiving config.state.* and silently
        // shows stale settings. Invert this test when 2d lands.
        test('BUG: it does NOT re-subscribe when the socket reconnects', () => {
            const { socket, socketEventEmitter, reconnect } = createHarness()
            new ConfigTracker(socket)
            expect(socket.countSent('events.config.subscribe')).toEqual(1)

            reconnect()

            expect(socket.countSent('events.config.subscribe')).toEqual(1)
            expect(socketEventEmitter.listenerCount("connected")).toEqual(0)
        })
    })
})
