import { vi } from "vitest"
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

describe('test mixer settings changes', () => {
    test('never restarts the connector between two real program/preview states', async () => {
        // TestConfiguration.toJson() carries {programs, previews} because it also
        // doubles as the wire format for the cypress mixerProgPrev helper. A settings
        // change here must not look like a settings change to MixerDriver's restart
        // logic, or every update briefly tears the connector down (-> notifyProgramPreviewChanged(null, null))
        // before the real values land again.
        const originalHubWithTest = process.env.HUB_WITH_TEST
        process.env.HUB_WITH_TEST = "true"
        try {
            const emitter = new EventEmitter()
            const config = new AppConfiguration(emitter)

            const initial = config.getTestConfiguration()
            initial.setPrograms(["1"])
            initial.setPreviews(["2"])
            config.setTestConfiguration(initial)
            config.setMixerSelection("test")

            const driver = new MixerDriver(config, emitter)
            await driver.changeMixer("test")

            const calls: Array<[unknown, unknown]> = []
            vi.spyOn(driver.communicator, "notifyProgramPreviewChanged").mockImplementation((programs, previews) => {
                calls.push([programs, previews])
            })

            const updated = config.getTestConfiguration()
            updated.setPrograms(["3"])
            updated.setPreviews(["4"])
            config.setTestConfiguration(updated)

            const hasNullBetweenRealStates = calls.some(([programs], index) => {
                const before = calls.slice(0, index)
                const after = calls.slice(index + 1)
                return programs === null
                    && before.some(([p]) => p !== null)
                    && after.some(([p]) => p !== null)
            })
            expect(hasNullBetweenRealStates).toBe(false)
            expect(calls.some(([programs]) => JSON.stringify(programs) === JSON.stringify(["3"]))).toBe(true)

            driver.currentMixerInstance?.disconnect()
            vi.restoreAllMocks()
        } finally {
            process.env.HUB_WITH_TEST = originalHubWithTest
        }
    })
})
