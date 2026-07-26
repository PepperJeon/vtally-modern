import { AppConfiguration } from './AppConfiguration'
import { EventEmitter } from 'events'
import Channel from '../../shared/domain/Channel'
import { MixerDriver } from './MixerDriver'
import AtemConfiguration from '../../shared/mixer/atem/AtemConfiguration'
import MockConfiguration from '../../shared/mixer/mock/MockConfiguration'
import ObsConfiguration from '../../shared/mixer/obs/ObsConfiguration'
import RolandV8HDConfiguration from '../../shared/mixer/rolandV8HD/RolandV8HDConfiguration'
import RolandV60HDConfiguration from '../../shared/mixer/rolandV60HD/RolandV60HDConfiguration'
import VmixConfiguration from '../../shared/mixer/vmix/VmixConfiguration'
import {UdpTally, WebTally} from '../../shared/domain/Tally'
import { DefaultTallyConfiguration } from '../../shared/tally/TallyConfiguration'

describe("toJson/fromJson", () => {
    test('it can persist atem configuration', () => {
        const emitter = new EventEmitter()
        const config = new AppConfiguration(emitter)
        const atemConfig = new AtemConfiguration()
        atemConfig.setIp("10.1.1.42")
        config.setAtemConfiguration(atemConfig)

        const otherConfig = new AppConfiguration(emitter)
        otherConfig.fromJson(config.toJson())

        expect(otherConfig.getAtemConfiguration().getIp().toString()).toEqual("10.1.1.42")
    })
    test('it can persist mock configuration', () => {
        const emitter = new EventEmitter()
        const config = new AppConfiguration(emitter)
        const mockConfig = new MockConfiguration()
        mockConfig.setChannelCount(42)
        config.setMockConfiguration(mockConfig)

        const otherConfig = new AppConfiguration(emitter)
        otherConfig.fromJson(config.toJson())

        expect(otherConfig.getMockConfiguration().getChannelCount()).toEqual(42)
    })
    test.skip('it can persist null configuration', done => {
        // it is empty -> so it does not really matter
    })
    test('it can persist obs configuration', () => {
        const emitter = new EventEmitter()
        const config = new AppConfiguration(emitter)
        const obsConfig = new ObsConfiguration()
        obsConfig.setIp("10.1.1.43")
        config.setObsConfiguration(obsConfig)

        const otherConfig = new AppConfiguration(emitter)
        otherConfig.fromJson(config.toJson())

        expect(otherConfig.getObsConfiguration().getIp().toString()).toEqual("10.1.1.43")
    })
    test('it can persist vmix configuration', () => {
        const emitter = new EventEmitter()
        const config = new AppConfiguration(emitter)
        const vmixConfig = new VmixConfiguration()
        vmixConfig.setIp("10.1.1.44")
        config.setVmixConfiguration(vmixConfig)

        const otherConfig = new AppConfiguration(emitter)
        otherConfig.fromJson(config.toJson())

        expect(otherConfig.getVmixConfiguration().getIp().toString()).toEqual("10.1.1.44")

    })
    test('it can persist rolandV8HD configuration', () => {
        const emitter = new EventEmitter()
        const config = new AppConfiguration(emitter)
        const rolandV8HDConfig = new RolandV8HDConfiguration()
        rolandV8HDConfig.setRequestInterval(500)
        config.setRolandV8HDConfiguration(rolandV8HDConfig)

        const otherConfig = new AppConfiguration(emitter)
        otherConfig.fromJson(config.toJson())

        expect(otherConfig.getRolandV8HDConfiguration().getRequestInterval()).toEqual(500)

    })
    test('it can persist rolandV60HD configuration', () => {
        const emitter = new EventEmitter()
        const config = new AppConfiguration(emitter)
        const rolandV60HDConfig = new RolandV60HDConfiguration()
        rolandV60HDConfig.setIp("10.1.1.44")
        config.setRolandV60HDConfiguration(rolandV60HDConfig)

        const otherConfig = new AppConfiguration(emitter)
        otherConfig.fromJson(config.toJson())

        expect(otherConfig.getRolandV60HDConfiguration().getIp().toString()).toEqual("10.1.1.44")

    })
    test('it can persist mixer selection', () => {
        const emitter = new EventEmitter()
        const config = new AppConfiguration(emitter)
        config.setMixerSelection('atem')

        const otherConfig = new AppConfiguration(emitter)
        otherConfig.fromJson(config.toJson())

        expect(otherConfig.getMixerSelection()).toEqual('atem')
    })
    test('it can persist tallies', () => {
        const emitter = new EventEmitter()
        const config = new AppConfiguration(emitter)
        const tally1 = new UdpTally("Tally 01", "Channel One")
        tally1.configuration.setOperatorLightBrightness(92)
        tally1.configuration.setStageLightBrightness(91)
        const tally2 = new WebTally("Tally 02")
        tally2.configuration.setOperatorLightBrightness(90)
        config.setTallies([tally1, tally2])

        const otherConfig = new AppConfiguration(emitter)
        otherConfig.fromJson(config.toJson())

        const tallies = otherConfig.getTallies()
        expect(tallies[0]?.name).toEqual("Tally 01")
        expect(tallies[0]?.channelId).toEqual("Channel One")
        expect(tallies[0]?.configuration.getOperatorLightBrightness()).toEqual(92)
        expect(tallies[0]?.configuration.getStageLightBrightness()).toEqual(91)
        expect(tallies[1]?.name).toEqual("Tally 02")
        expect(tallies[1]?.channelId).toBeFalsy()
        expect(tallies[1]?.configuration.getOperatorLightBrightness()).toEqual(90)
    })
    test('it can persist channels', () => {
        const emitter = new EventEmitter()
        const config = new AppConfiguration(emitter)
        config.setChannels([
            new Channel("one", "Channel One"),
            new Channel("2"),
        ])

        const otherConfig = new AppConfiguration(emitter)
        otherConfig.fromJson(config.toJson())

        const channels = otherConfig.getChannels()
        expect(channels[0]?.id).toEqual("one")
        expect(channels[0]?.name).toEqual("Channel One")
        expect(channels[1]?.id).toEqual("2")
    })
    test('it keeps channels of each mixer apart', () => {
        const emitter = new EventEmitter()
        const config = new AppConfiguration(emitter)

        config.setMixerSelection('mock')
        config.setChannels([new Channel("1", "Dave's Cam"), new Channel("2", "Judy's Cam")])

        config.setMixerSelection('obs')
        config.setChannels([new Channel("Scene 1", "Scene 1")])
        expect(config.getChannels().map(c => c.name)).toEqual(["Scene 1"])

        // the actual user facing bug: switching back must not have lost anything
        config.setMixerSelection('mock')
        expect(config.getChannels().map(c => c.name)).toEqual(["Dave's Cam", "Judy's Cam"])

        // ... and it survives a save/load round trip
        const otherConfig = new AppConfiguration(emitter)
        otherConfig.fromJson(config.toJson())
        expect(otherConfig.getMixerSelection()).toEqual('mock')
        expect(otherConfig.getChannels().map(c => c.name)).toEqual(["Dave's Cam", "Judy's Cam"])
        otherConfig.setMixerSelection('obs')
        expect(otherConfig.getChannels().map(c => c.name)).toEqual(["Scene 1"])
    })
    test('a mixer that never reported channels gets the defaults', () => {
        const emitter = new EventEmitter()
        const config = new AppConfiguration(emitter)

        config.setMixerSelection('mock')
        config.setChannels([new Channel("1", "Dave's Cam")])

        // null and test never call notifyChannels, so they fall through to defaults
        config.setMixerSelection('null')
        expect(config.getChannels()).toEqual(MixerDriver.defaultChannels)
        config.setMixerSelection('test')
        expect(config.getChannels()).toEqual(MixerDriver.defaultChannels)
    })
    test('it announces the new channel list when the mixer changes', () => {
        const emitter = new EventEmitter()
        const config = new AppConfiguration(emitter)
        config.setMixerSelection('mock')
        config.setChannels([new Channel("1", "Dave's Cam")])

        const seen: string[][] = []
        emitter.on('config.changed.channels', (channels: Channel[]) => seen.push(channels.map(c => c.id)))

        config.setMixerSelection('obs')
        expect(seen).toHaveLength(1)
        expect(seen[0]).toEqual(MixerDriver.defaultChannels.map(c => c.id))

        config.setMixerSelection('mock')
        expect(seen).toHaveLength(2)
        expect(seen[1]).toEqual(["1"])
    })
    test('it can persist default tally configuration', () => {
        const emitter = new EventEmitter()
        const config = new AppConfiguration(emitter)
        const tallyConfig = new DefaultTallyConfiguration()
        tallyConfig.setOperatorLightBrightness(42)
        tallyConfig.setStageLightBrightness(21)
        config.setTallyConfiguration(tallyConfig)

        const otherConfig = new AppConfiguration(emitter)
        otherConfig.fromJson(config.toJson())

        const otherTallyConfig = otherConfig.getTallyConfiguration()
        expect(otherTallyConfig.getOperatorLightBrightness()).toEqual(42)
        expect(otherTallyConfig.getStageLightBrightness()).toEqual(21)
    })
})
