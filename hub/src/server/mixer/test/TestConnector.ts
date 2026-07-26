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
    connect() {
        console.log("starting mock server")
        this.connected = true
        this.communicator.notifyChannelNames(4)
        this.communicator.notifyProgramPreviewChanged(this.configuration.getPrograms(), this.configuration.getPreviews())
    }
    disconnect() {
        this.connected = false
    }

    isConnected() {
        return this.connected
    }
    static readonly ID = TEST_ID
}

export default TestConnector
