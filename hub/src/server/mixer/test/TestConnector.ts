import { MixerCommunicator } from "../../lib/MixerCommunicator"
import { TEST_ID } from '../../../shared/mixer/ids'
import { Connector } from "../../../shared/mixer/interfaces"
import TestConfiguration from "../../../shared/mixer/test/TestConfiguration"

class TestConnector implements Connector {
    communicator: MixerCommunicator
    configuration: TestConfiguration
    connected: boolean = false

    constructor(configuration: TestConfiguration, communicator: MixerCommunicator) {
        this.communicator = communicator
        this.configuration = configuration
    }
    // every real connector pushes program/preview updates as they happen (poll loop or
    // device callback), so a settings change never needs a reconnect to be seen. TestConnector
    // has no such channel of its own, so it listens for the config event that carries them
    // instead of relying on being torn down and rebuilt.
    private onConfigChanged = (configuration: TestConfiguration) => {
        this.communicator.notifyProgramPreviewChanged(configuration.getPrograms(), configuration.getPreviews())
    }
    connect() {
        console.log("starting mock server")
        this.connected = true
        this.communicator.notifyChannelNames(4)
        this.communicator.notifyProgramPreviewChanged(this.configuration.getPrograms(), this.configuration.getPreviews())
        this.communicator.emitter.on('config.changed.test', this.onConfigChanged)
    }
    disconnect() {
        this.connected = false
        this.communicator.emitter.off('config.changed.test', this.onConfigChanged)
    }

    isConnected() {
        return this.connected
    }
    static readonly ID = TEST_ID
}

export default TestConnector
