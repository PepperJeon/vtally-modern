import React from 'react'
import MixerSettingsWrapper from '../../../components/config/MixerSettingsWrapper'
import { socket } from '../../../hooks/useSocket'
import { SettingsProps } from '../../../../shared/mixer/interfaces'
import TestConfiguration from '../../../../shared/mixer/test/TestConfiguration'
import { TEST_ID } from '../../../../shared/mixer/ids'

type TestSettingsProps = SettingsProps & {}

function TestSettings(props: TestSettingsProps) {
    const handleSave = () => {
        if (props.id !== TEST_ID) {
            console.warn(`Changing id prop of TestSettings is not supported. But got ${props.id}.`)
        } else {
            socket.emit('config.change.test', new TestConfiguration(), TEST_ID)
        }
    }

    return (<MixerSettingsWrapper 
        title="Test Configuration"
        testId="test"
        description="A mixer used for automatic testing. You should never have to select it manually."
        onSave={handleSave}
    ></MixerSettingsWrapper>)
}

TestSettings.defaultProps = {
    id: TEST_ID,
    label: "Test Mixer"
}

export default TestSettings
