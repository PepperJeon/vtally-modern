import React from 'react'
import MixerSettingsWrapper from '../../../components/config/MixerSettingsWrapper'
import { socket } from '../../../hooks/useSocket'
import TestConfiguration from '../../../../shared/mixer/test/TestConfiguration'
import { TEST_ID } from '../../../../shared/mixer/ids'

function TestSettings() {
    const handleSave = () => {
        socket.emit('config.change.test', new TestConfiguration(), TEST_ID)
    }

    return (<MixerSettingsWrapper 
        title="Test Configuration"
        testId="test"
        description="A mixer used for automatic testing. You should never have to select it manually."
        onSave={handleSave}
    ></MixerSettingsWrapper>)
}

export default TestSettings
