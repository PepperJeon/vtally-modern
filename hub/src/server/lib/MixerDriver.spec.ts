import { MixerDriver } from "./MixerDriver"
import { AppConfiguration } from "./AppConfiguration"
import { EventEmitter } from "events"

describe('changing the mixer', () => {
    test('does not wipe the channels of the mixer it left', async () => {
        const emitter = new EventEmitter()
        const config = new AppConfiguration(emitter)
        const mock = config.getMockConfiguration()
        mock.setChannelNames(["Dave's Cam"])
        config.setMockConfiguration(mock)
        config.setMixerSelection("mock")

        const driver = new MixerDriver(config, emitter)
        await driver.changeMixer("mock")
        expect(config.getChannels()[0].name).toEqual("Dave's Cam")

        // the teardown of the outgoing mixer used to call
        // communicator.notifyChannels(MixerDriver.defaultChannels), which wrote the
        // reset into the *old* mixer's storage. It must not do that any more.
        config.setMixerSelection("null")
        await driver.changeMixer("null")
        expect(config.channelsByMixer.get("mock")[0].name).toEqual("Dave's Cam")
        expect(config.getChannels()).toEqual(MixerDriver.defaultChannels)

        config.setMixerSelection("mock")
        await driver.changeMixer("mock")
        expect(config.getChannels()[0].name).toEqual("Dave's Cam")
        driver.currentMixerInstance?.disconnect()
    })
})

describe('getAllowedMixers', () => {
    test('does return the mock mixer on development, but not production', () => {
        const mixersDev = MixerDriver.getAllowedMixers(true, false)
        expect(mixersDev.length).toBeGreaterThan(2)
        expect(mixersDev).toContain("null")
        expect(mixersDev).toContain("mock")

        const mixersProd = MixerDriver.getAllowedMixers(false, false)
        expect(mixersProd.length).toBeGreaterThan(2)
        expect(mixersProd).toContain("null")
        expect(mixersProd).not.toContain("mock")
    })
    test('does return the test mixer on testing, but not production', () => {
        const mixersDev = MixerDriver.getAllowedMixers(false, true)
        expect(mixersDev.length).toBeGreaterThan(2)
        expect(mixersDev).toContain("null")
        expect(mixersDev).toContain("test")

        const mixersProd = MixerDriver.getAllowedMixers(false, false)
        expect(mixersProd.length).toBeGreaterThan(2)
        expect(mixersProd).toContain("null")
        expect(mixersProd).not.toContain("test")
    })
})
