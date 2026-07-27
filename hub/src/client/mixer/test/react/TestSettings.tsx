import React from 'react'
import MixerSettingsWrapper from '../../../components/config/MixerSettingsWrapper'
import { socket } from '../../../hooks/useSocket'
import TestConfiguration from '../../../../shared/mixer/test/TestConfiguration'
import { TEST_ID } from '../../../../shared/mixer/ids'
import { useT } from '../../../i18n'

function TestSettings() {
    const t = useT()
    const handleSave = () => {
        socket.emit('config.change.test', new TestConfiguration(), TEST_ID)
    }

    return (<MixerSettingsWrapper 
        title={t.testMixer.title}
        testId="test"
        description={t.testMixer.description}
        onSave={handleSave}
    ></MixerSettingsWrapper>)
}

export default TestSettings
