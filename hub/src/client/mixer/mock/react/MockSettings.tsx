import React, { useState } from 'react'
import MixerSettingsWrapper from '../../../components/config/MixerSettingsWrapper'
import ValidatingInput from '../../../components/config/ValidatingInput'
import { useMockConfiguration } from '../../../hooks/useConfiguration'
import { socket } from '../../../hooks/useSocket'
import { MOCK_ID } from '../../../../shared/mixer/ids'
import { useT } from '../../../i18n'

function MockSettings() {
    const t = useT()
    const configuration = useMockConfiguration()
    const [tickTime, setTickTime] = useState<string|null>(null)
    const [tickTimeValid, setTickTimeValid] = useState(true)
    const [channelCount, setChannelCount] = useState<string|null>(null)
    const [channelCountValid, setChannelCountValid] = useState(true)
    const [channelNames, setChannelNames] = useState<string|null>(null)
    const [channelNamesValid, setChannelNamesValid] = useState(true)
    const isLoading = !configuration
    const isValid = tickTimeValid && channelCountValid && channelNamesValid
    
    const handleSave = () => {
        if (configuration === undefined) {
            console.error("Not saving, because there is an invalid value in the form.")
        } else {
            const config = configuration.clone()
            config.setTickTime(tickTime)
            config.setChannelCount(channelCount)
            config.setChannelNames(channelNames)

            socket.emit('config.change.mock', config.toJson(), MOCK_ID)
        }
    }

    return (
        <MixerSettingsWrapper 
            title={t.mockMixer.title}
            testId="mock"
            description={t.mockMixer.description}
            canBeSaved={isValid}
            isLoading={isLoading}
            onSave={handleSave}
        >{configuration && (<>
            <ValidatingInput label={t.mockMixer.tickTime} testId="mock-tick" object={configuration} propertyName="tickTime" onValid={(tickTime) => { setTickTime(tickTime); setTickTimeValid(true) }} onInvalid={() => setTickTimeValid(false)} />
            <ValidatingInput label={t.mockMixer.channelCount} testId="mock-channelCount" object={configuration} propertyName="channelCount" onValid={(channelCount) => { setChannelCount(channelCount); setChannelCountValid(true) }} onInvalid={() => setChannelCountValid(false)} />
            <ValidatingInput label={t.mockMixer.channelNames} testId="mock-channelNames" object={configuration} propertyName="channelNames" onValid={(channelNames) => { setChannelNames(channelNames); setChannelNamesValid(true) }} onInvalid={() => setChannelNamesValid(false)} />
        </>)}</MixerSettingsWrapper>
    )
}

export default MockSettings
