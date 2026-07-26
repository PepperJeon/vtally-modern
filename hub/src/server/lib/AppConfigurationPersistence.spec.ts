import tmp from 'tmp'
import { file as tmpFile } from 'tmp-promise'
import fs from 'fs'
import { AppConfiguration } from './AppConfiguration'
import { EventEmitter } from 'events'
import AppConfigurationPersistence from './AppConfigurationPersistence'
import Channel from '../../shared/domain/Channel'
import { MixerDriver } from './MixerDriver'

tmp.setGracefulCleanup()

describe('load()', () => {
    test('issues a warning if file does not exist and uses defaults', () => {
        let warningsLogged = 0
        console.warn = () => { warningsLogged++ }
        
        const emitter = new EventEmitter()
        let config = new AppConfiguration(emitter)
        expect(() => {
            new AppConfigurationPersistence(config, emitter, "/tmp/this/file/does/not/exist.json")
        }).not.toThrow(SyntaxError)

        expect(warningsLogged).toEqual(1)
        expect(config.getHttpPort()).toBeGreaterThan(0)
    })
    // @see https://github.com/wifi-tally/wifi-tally/issues/26
    test('issues a warning if file is empty and uses defaults', async () => {
        let warningsLogged = 0
        console.warn = () => { warningsLogged++ }
        const { path } = await tmpFile()

        const emitter = new EventEmitter()
        let config = new AppConfiguration(emitter)
        expect(() => {
            new AppConfigurationPersistence(config, emitter, path)
        }).not.toThrow(SyntaxError)

        expect(warningsLogged).toEqual(1)
        expect(config.getHttpPort()).toBeGreaterThan(0)
    })
    test('fails if file is non-empty with jibberish data', async () => {
        let errorsLogged = 0
        console.error = () => { errorsLogged++ }
        const { path, fd } = await tmpFile()
        // writeSync, not fs.write: the constructor below reads the file
        // synchronously, so an async write races it and intermittently leaves
        // the file empty (which takes the warn-no-throw path and fails here).
        fs.writeSync(fd, "Hello World")

        const emitter = new EventEmitter()
        const config = new AppConfiguration(emitter)
        expect(() => {
            new AppConfigurationPersistence(config, emitter, path)
        }).toThrow(Error)

        expect(errorsLogged).toEqual(1)
    })
    test('fails if file is non-empty with invalid json', async () => {
        let errorsLogged = 0
        console.error = () => { errorsLogged++ }
        const { path, fd } = await tmpFile()
        fs.writeSync(fd, '{"invalid": "JSON"')

        const emitter = new EventEmitter()
        const conf = new AppConfiguration(emitter)
        expect(() => {
            new AppConfigurationPersistence(conf, emitter, path)
        }).toThrow(Error)

        expect(errorsLogged).toEqual(1)
    })  
})

describe('it can load configuration files from previous versions', () => {
    it('can load from v0.2.1', () => {
        const emitter = new EventEmitter()
        const config = new AppConfiguration(emitter)

        expect(() => {
            new AppConfigurationPersistence(config, emitter, `${__dirname}/../../../fixtures/settings-v0.2.1.json`)
        }).not.toThrow(SyntaxError)

        expect(config.getMixerSelection()).toEqual("obs")
        expect(config.getObsConfiguration().getIp().toString()).toEqual("127.0.0.1")
        expect(config.getObsConfiguration().getPort().toString()).toEqual("4444")
        expect(config.getTallies()).toHaveLength(4)
        expect(config.getTallies()[0].name).toEqual("Tally01")
        expect(config.getTallies()[0].channelId).toEqual("1")
        expect(config.getChannels()).toHaveLength(8)
        expect(config.getChannels()[0].id).toEqual("1")
        expect(config.getChannels()[0].name).toEqual("Dave's Cam")
    })
    it('can load from v0.3.0', () => {
        const emitter = new EventEmitter()
        const config = new AppConfiguration(emitter)

        expect(() => {
            new AppConfigurationPersistence(config, emitter, `${__dirname}/../../../fixtures/settings-v0.3.0.json`)
        }).not.toThrow(SyntaxError)

        expect(config.getMixerSelection()).toEqual("atem")
        expect(config.getAtemConfiguration().getIp().toString()).toEqual("192.168.99.200")
        expect(config.getAtemConfiguration().getPort().toString()).toEqual("9910")
        expect(config.getTallies()).toHaveLength(4)
        expect(config.getTallies()[0].name).toEqual("Tally01")
        expect(config.getTallies()[0].channelId).toEqual("1")
        expect(config.getTallies()[0].type).toEqual("udp")
        expect(config.getTallies()[3].name).toEqual("Tally04")
        expect(config.getTallies()[3].type).toEqual("web")
        expect(config.getChannels()).toHaveLength(4)
        expect(config.getChannels()[0].id).toEqual("1")
        expect(config.getChannels()[0].name).toEqual("Dave's Cam")
    })
    it('can load from v0.4.0', () => {
        const emitter = new EventEmitter()
        const config = new AppConfiguration(emitter)

        expect(() => {
            new AppConfigurationPersistence(config, emitter, `${__dirname}/../../../fixtures/settings-v0.4.0.json`)
        }).not.toThrow(SyntaxError)

        expect(config.getMixerSelection()).toEqual("vmix")
        expect(config.getVmixConfiguration().getIp().toString()).toEqual("127.0.0.1")
        expect(config.getVmixConfiguration().getPort().toString()).toEqual("8099")
        expect(config.getTallyConfiguration().getOperatorLightBrightness()).toEqual(80)
        expect(config.getTallyConfiguration().getStageLightBrightness()).toEqual(60)
        expect(config.getTallies()).toHaveLength(4)
        expect(config.getTallies()[0].name).toEqual("Tally01")
        expect(config.getTallies()[0].channelId).toEqual("1")
        expect(config.getTallies()[0].type).toEqual("udp")
        expect(config.getTallies()[0].configuration.getStageLightBrightness()).toEqual(100)
        expect(config.getTallies()[0].configuration.getOperatorLightBrightness()).toEqual(100)
        expect(config.getTallies()[0].configuration.getStageShowsPreview()).toEqual(true)
        expect(config.getTallies()[3].name).toEqual("Tally04")
        expect(config.getTallies()[3].type).toEqual("web")
        expect(config.getChannels()).toHaveLength(4)
        expect(config.getChannels()[0].id).toEqual("1")
        expect(config.getChannels()[0].name).toEqual("Dave's Cam")
    })
})

describe('channelsByMixer migration', () => {
    // all three legacy fixtures carry a flat top-level `channels` array and a `mixer`
    // field; the channels must land under that mixer's key, not in a global bucket.
    const legacy = [
        { version: 'v0.2.1', mixer: 'obs', length: 8 },
        { version: 'v0.3.0', mixer: 'atem', length: 4 },
        { version: 'v0.4.0', mixer: 'vmix', length: 4 },
    ]
    legacy.forEach(({version, mixer, length}) => {
        it(`assigns the flat channel list of ${version} to "${mixer}"`, () => {
            const emitter = new EventEmitter()
            const config = new AppConfiguration(emitter)
            new AppConfigurationPersistence(config, emitter, `${__dirname}/../../../fixtures/settings-${version}.json`)

            expect(config.getMixerSelection()).toEqual(mixer)
            expect(config.channelsByMixer.get(mixer)).toHaveLength(length)
            expect(config.channelsByMixer.get(mixer)[0].name).toEqual("Dave's Cam")
            // no other mixer inherited them
            expect(Array.from(config.channelsByMixer.keys())).toEqual([mixer])

            // switching away shows the defaults, switching back restores them
            config.setMixerSelection("mock")
            expect(config.getChannels().map(c => c.name)).not.toContain("Dave's Cam")
            config.setMixerSelection(mixer)
            expect(config.getChannels()[0].name).toEqual("Dave's Cam")
        })
    })
    it('uses defaults when a legacy file has no channels at all', async () => {
        const { path, fd } = await tmpFile()
        fs.writeSync(fd, JSON.stringify({mixer: "obs"}))

        const emitter = new EventEmitter()
        const config = new AppConfiguration(emitter)
        new AppConfigurationPersistence(config, emitter, path)

        expect(config.getMixerSelection()).toEqual("obs")
        expect(config.channelsByMixer.size).toEqual(0)
        expect(config.getChannels()).toEqual(MixerDriver.defaultChannels)
    })
    it('loads the new channelsByMixer format', () => {
        const emitter = new EventEmitter()
        const config = new AppConfiguration(emitter)
        new AppConfigurationPersistence(config, emitter, `${__dirname}/../../../fixtures/settings-channelsByMixer.json`)

        expect(config.getMixerSelection()).toEqual("obs")
        expect(config.getChannels().map(c => c.name)).toEqual(["Scene 1", "Scene 2", "Scene 3"])

        config.setMixerSelection("mock")
        expect(config.getChannels().map(c => c.name)).toEqual(["Dave's Cam", "Judy's Cam"])
    })
    it('round trips both mixers through a file', async () => {
        const { path } = await tmpFile()

        const emitter = new EventEmitter()
        const config = new AppConfiguration(emitter)
        const persistence = new AppConfigurationPersistence(config, emitter, path)
        config.setMixerSelection("mock")
        config.setChannels([new Channel("1", "Dave's Cam")])
        config.setMixerSelection("obs")
        config.setChannels([new Channel("Scene 1", "Scene 1")])
        config.setMixerSelection("mock")
        await persistence.save()

        const otherEmitter = new EventEmitter()
        const otherConfig = new AppConfiguration(otherEmitter)
        new AppConfigurationPersistence(otherConfig, otherEmitter, path)

        expect(otherConfig.getChannels().map(c => c.name)).toEqual(["Dave's Cam"])
        otherConfig.setMixerSelection("obs")
        expect(otherConfig.getChannels().map(c => c.name)).toEqual(["Scene 1"])
    })
})

test('save/load persists data', async () => {
    const { path } = await tmpFile()

    const emitter = new EventEmitter()
    const config = new AppConfiguration(emitter)
    const persistence = new AppConfigurationPersistence(config, emitter, path)
    // we use mock configuration just as an example
    const mockConfiguration = config.getMockConfiguration()
    mockConfiguration.setChannelCount(42)
    config.setMockConfiguration(mockConfiguration)
    await persistence.save()

    // the file should exist now and have the data
    const data = fs.readFileSync(path).toString()
    expect(data).toBeTruthy()
    expect(data).toContain("This file was automatically generated.")

    const otherEmitter = new EventEmitter()
    const otherConfig = new AppConfiguration(otherEmitter)
    new AppConfigurationPersistence(otherConfig, otherEmitter, path)

    // the data should be loaded
    expect(otherConfig.getMockConfiguration().getChannelCount()).toEqual(42)
})
