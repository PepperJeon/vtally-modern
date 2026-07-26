import {MixerDriver} from './MixerDriver'
import Channel from '../../shared/domain/Channel'
import ServerEventEmitter from './ServerEventEmitter'
import AtemConfiguration from '../../shared/mixer/atem/AtemConfiguration'
import MockConfiguration from '../../shared/mixer/mock/MockConfiguration'
import ObsConfiguration from '../../shared/mixer/obs/ObsConfiguration'
import RolandV8HDConfiguration from '../../shared/mixer/rolandV8HD/RolandV8HDConfiguration'
import RolandV60HDConfiguration from '../../shared/mixer/rolandV60HD/RolandV60HDConfiguration'
import FeelworldConfiguration from '../../shared/mixer/feelworld/FeelworldConfiguration'
import VmixConfiguration from '../../shared/mixer/vmix/VmixConfiguration'
import NullConfiguration from '../../shared/mixer/null/NullConfiguration'
import { Configuration } from '../../shared/mixer/interfaces'
import Tally from '../../shared/domain/Tally'
import TestConfiguration from '../../shared/mixer/test/TestConfiguration'
import { DefaultTallyConfiguration } from '../../shared/tally/TallyConfiguration'

export class AppConfiguration extends Configuration {
    emitter: ServerEventEmitter
    atemConfiguration: AtemConfiguration
    mockConfiguration: MockConfiguration
    nullConfiguration: NullConfiguration
    obsConfiguration: ObsConfiguration
    rolandV8HDConfiguration: RolandV8HDConfiguration
    rolandV60HDConfiguration: RolandV60HDConfiguration
    feelworldConfiguration: FeelworldConfiguration
    testConfiguration: TestConfiguration
    vmixConfiguration: VmixConfiguration
    tallyConfiguration: DefaultTallyConfiguration
    tallies: Tally[]
    // one independent channel list per mixer id, so switching mixers does not
    // destroy the channel names the previous one reported.
    // "" is the bucket used while no mixer is selected yet.
    channelsByMixer: Map<string, Channel[]>
    mixerSelection?: string
    tallyPort: number
    tallyHighlightTime: number
    tallyKeepAlivesPerSecond: number
    tallyTimeoutDisconnected: number
    tallyTimeoutMissing: number

    constructor(emitter: ServerEventEmitter) {
        super()
        this.emitter = emitter
        this.atemConfiguration = new AtemConfiguration()
        this.mockConfiguration = new MockConfiguration()
        this.nullConfiguration = new NullConfiguration()
        this.obsConfiguration = new ObsConfiguration()
        this.rolandV8HDConfiguration = new RolandV8HDConfiguration()
        this.rolandV60HDConfiguration = new RolandV60HDConfiguration()
        this.feelworldConfiguration = new FeelworldConfiguration()
        this.testConfiguration = new TestConfiguration()
        this.vmixConfiguration = new VmixConfiguration()
        this.tallyConfiguration = new DefaultTallyConfiguration()
        this.tallies = []
        this.channelsByMixer = new Map()

        this.tallyPort = 7411
        this.tallyHighlightTime = 1000 // ms
        this.tallyKeepAlivesPerSecond = 10
        this.tallyTimeoutDisconnected = 30000 // ms
        this.tallyTimeoutMissing = 3000 //ms
    }

    protected loadChannelArray(fieldName: string, setter: (value:Channel[]) => void, data: object) {
        const value = data[fieldName]
        if (value === undefined || value === null) {
            // value is not set
            return
        } else if (Array.isArray(value)) {
            try {
                setter(value.map(c => Channel.fromJson(c)))
            } catch (err) {
                console.error(`error loading property "${fieldName}" of configuration: ${err}`)
                return
            }
        } else {
            console.error(`error loading property "${fieldName}": invalid type ${typeof value}`)
        }
    }

    protected loadTallyArray(fieldName: string, setter: (value:Tally[]) => void, data: object) {
        const value = data[fieldName]
        if (value === undefined || value === null) {
            // value is not set
            return
        } else if (Array.isArray(value)) {
            try {
                setter(value.map(t => Tally.fromJsonForSave(t)))
            } catch (err) {
                console.error(`error loading property "${fieldName}" of configuration: ${err}`)
                return
            }
        } else {
            console.error(`error loading property "${fieldName}": invalid type ${typeof value}`)
        }
    }

    fromJson(data: any): void {
        if (data.atem) {
            this.atemConfiguration.fromJson(data.atem)
        }
        if (data.mock) {
            this.mockConfiguration.fromJson(data.mock)
        }
        if (data.null) {
            this.nullConfiguration.fromJson(data.null)
        }
        if (data.obs) {
            this.obsConfiguration.fromJson(data.obs)
        }
        if (data.rolandV8HD) {
            this.rolandV8HDConfiguration.fromJson(data.rolandV8HD)
        }
        if (data.rolandV60HD) {
            this.rolandV60HDConfiguration.fromJson(data.rolandV60HD)
        }
        if (data.feelworld) {
            this.feelworldConfiguration.fromJson(data.feelworld)
        }
        if (data.test) {
            this.testConfiguration.fromJson(data.test)
        }
        if (data.vmix) {
            this.vmixConfiguration.fromJson(data.vmix)
        }
        if (data.tallyDefaults) {
            this.tallyConfiguration.fromJson(data.tallyDefaults)
        }
        // must stay after "mixer" is loaded: the legacy migration below keys the
        // flat channel list on whatever mixer is currently selected.
        this.loadString("mixer", this.setMixerSelection.bind(this), data)
        const byMixer = data.channelsByMixer
        if (byMixer && typeof byMixer === "object" && !Array.isArray(byMixer)) {
            Object.keys(byMixer).forEach(mixerId => {
                this.loadChannelArray(mixerId, channels => this.channelsByMixer.set(mixerId, channels), byMixer)
            })
            this.emitter.emit('config.changed', this)
            this.emitter.emit('config.changed.channels', this.getChannels())
        } else {
            // migration from the pre-channelsByMixer format: a flat top-level
            // `channels` array belongs to the mixer that was selected when it was written.
            this.loadChannelArray("channels", this.setChannels.bind(this), data)
        }
        this.loadTallyArray("tallies", this.setTallies.bind(this), data)
    }
    toJson(): object {
        return {
            mixer: this.mixerSelection,
            atem: this.atemConfiguration.toJson(),
            mock: this.mockConfiguration.toJson(),
            "null": this.nullConfiguration.toJson(),
            obs: this.obsConfiguration.toJson(),
            rolandV8HD: this.rolandV8HDConfiguration.toJson(),
            rolandV60HD: this.rolandV60HDConfiguration.toJson(),
            feelworld: this.feelworldConfiguration.toJson(),
            test: this.testConfiguration.toJson(),
            vmix: this.vmixConfiguration.toJson(),
            tallyDefaults: this.tallyConfiguration.toJson(),
            tallies: this.tallies.map(tally => tally.toJsonForSave()),
            channelsByMixer: Object.fromEntries(
                Array.from(this.channelsByMixer, ([mixerId, channels]) => [mixerId, channels.map(c => c.toJson())])
            ),
        }
    }
    clone(): AppConfiguration {
        const clone = new AppConfiguration(this.emitter)
        clone.fromJson(this.toJson())
        return clone
    }

    getAtemConfiguration() {
        return this.atemConfiguration.clone()
    }

    setAtemConfiguration(atemConfiguration: AtemConfiguration) {
        this.atemConfiguration = atemConfiguration.clone()
        this.emitter.emit("config.changed", this)
        this.emitter.emit("config.changed.atem", this.atemConfiguration)
    }

    getMockConfiguration() {
        return this.mockConfiguration.clone()
    }

    setMockConfiguration(mockConfiguration: MockConfiguration) {
        this.mockConfiguration = mockConfiguration.clone()
        this.emitter.emit("config.changed", this)
        this.emitter.emit("config.changed.mock", this.mockConfiguration)
    }

    getNullConfiguration() {
        return this.nullConfiguration.clone()
    }

    setNullConfiguration(nullConfiguration: NullConfiguration) {
        this.nullConfiguration = nullConfiguration.clone()
        this.emitter.emit("config.changed", this)
        this.emitter.emit("config.changed.null", this.nullConfiguration)
    }

    getObsConfiguration() {
        return this.obsConfiguration.clone()
    }

    setObsConfiguration(obsConfiguration: ObsConfiguration) {
        this.obsConfiguration = obsConfiguration.clone()
        this.emitter.emit("config.changed", this)
        this.emitter.emit("config.changed.obs", this.obsConfiguration)
    }

    getRolandV8HDConfiguration() {
        return this.rolandV8HDConfiguration.clone()
    }

    setRolandV8HDConfiguration(rolandV8HDConfiguration: RolandV8HDConfiguration) {
        this.rolandV8HDConfiguration = rolandV8HDConfiguration.clone()
        this.emitter.emit("config.changed", this)
        this.emitter.emit("config.changed.rolandV8HD", this.rolandV8HDConfiguration)
    }

    getRolandV60HDConfiguration() {
        return this.rolandV60HDConfiguration.clone()
    }

    setRolandV60HDConfiguration(rolandV60HDConfiguration: RolandV60HDConfiguration) {
        this.rolandV60HDConfiguration = rolandV60HDConfiguration.clone()
        this.emitter.emit("config.changed", this)
        this.emitter.emit("config.changed.rolandV60HD", this.rolandV60HDConfiguration)
    }

    getFeelworldConfiguration() {
        return this.feelworldConfiguration.clone()
    }

    setFeelworldConfiguration(feelworldConfiguration: FeelworldConfiguration) {
        this.feelworldConfiguration = feelworldConfiguration.clone()
        this.emitter.emit("config.changed", this)
        this.emitter.emit("config.changed.feelworld", this.feelworldConfiguration)
    }

    getTestConfiguration() {
        return this.testConfiguration.clone()
    }

    setTestConfiguration(testConfiguration: TestConfiguration) {
        this.testConfiguration = testConfiguration.clone()
        this.emitter.emit("config.changed", this)
        this.emitter.emit("config.changed.test", this.testConfiguration)
    }

    getVmixConfiguration() {
        return this.vmixConfiguration.clone()
    }

    setVmixConfiguration(vmixConfiguration: VmixConfiguration) {
        this.vmixConfiguration = vmixConfiguration.clone()
        this.emitter.emit("config.changed", this)
        this.emitter.emit("config.changed.vmix", this.vmixConfiguration)
    }

    getTallyConfiguration() {
        return this.tallyConfiguration.clone()
    }

    setTallyConfiguration(configuration: DefaultTallyConfiguration) {
        this.tallyConfiguration = configuration.clone()
        this.emitter.emit("config.changed", this)
        this.emitter.emit("config.changed.tallyconfig", this.tallyConfiguration)
    }

    /** channels are stored per mixer; "" is the bucket for "no mixer selected yet" */
    private channelKey() {
        return this.mixerSelection || ""
    }

    setChannels(channels: Channel[]) {
        this.channelsByMixer.set(this.channelKey(), channels)
        this.emitter.emit('config.changed', this)
        this.emitter.emit('config.changed.channels', channels)
    }

    getChannels() {
        // a mixer that never reported channels (null, test, a freshly selected one)
        // falls through to the numbered defaults rather than getting its own bucket.
        return this.channelsByMixer.get(this.channelKey()) || MixerDriver.defaultChannels
    }
    getChannelsAsJson() {
        return this.getChannels().map(channel => channel.toJson())
    }

    setTallies(tallies: Tally[]) {
        this.tallies = tallies
        this.emitter.emit('config.changed', this)
        this.emitter.emit('config.changed.tallies', this.tallies)
    }
    getTallies() {
        return this.tallies
    }

    setMixerSelection(mixerSelection: string) {
        this.mixerSelection = mixerSelection
        this.emitter.emit("config.changed", this)
        this.emitter.emit("config.changed.mixer", mixerSelection)
        // getChannels() now resolves to a different bucket, so clients need the new list.
        // This replaces the notifyChannels(defaultChannels) reset MixerDriver used to do.
        this.emitter.emit('config.changed.channels', this.getChannels())
    }
    getMixerSelection() {
        return this.mixerSelection
    }

    isDev() {
        return process.env.NODE_ENV !== 'production'
    }

    isTest() {
        return process.env.HUB_WITH_TEST === 'true'
    }

    getHttpPort() {
        return (typeof process.env.PORT === "string" && parseInt(process.env.PORT, 10)) || 3000
    }

    getTallyPort() {
        return (typeof process.env.TALLY_PORT === "string" && parseInt(process.env.TALLY_PORT, 10)) || this.tallyPort
    }

    getTallyHighlightTime() {
        return this.tallyHighlightTime
    }

    // the more keep alives you send the less likely it is that
    // the tally shows a wrong state, but you send more packages
    // over the network.
    getTallyKeepAlivesPerSecond() {
        return this.tallyKeepAlivesPerSecond
    }

    setTallyTimeoutDisconnected(timeout: number) {
        if (timeout < 1000) { throw new Error(`timeout too small: ${timeout}ms`) }
        this.tallyTimeoutDisconnected = timeout
    }

    getTallyTimeoutDisconnected() {
        return this.tallyTimeoutDisconnected
    }

    setTallyTimeoutMissing(timeout: number) {
        if (timeout < 1000) { throw new Error(`timeout too small: ${timeout}ms`) }
        this.tallyTimeoutMissing = timeout
    }

    getTallyTimeoutMissing() {
        return this.tallyTimeoutMissing
    }
}
