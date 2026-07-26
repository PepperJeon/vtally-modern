import React, { useState } from 'react'
import MixerSettingsWrapper from '../../../components/config/MixerSettingsWrapper'
import ValidatingInput from '../../../components/config/ValidatingInput'
import { socket } from '../../../hooks/useSocket'
import { useFeelworldConfiguration } from '../../../hooks/useConfiguration'
import { FEELWORLD_ID } from '../../../../shared/mixer/ids'

type FeelworldSettingsProps = {
    id: typeof FEELWORLD_ID,
    label: string,
}

function FeelworldSettings(props: FeelworldSettingsProps) {
    const configuration = useFeelworldConfiguration()
    const [ip, setIp] = useState<string|null>(null)
    const [ipValid, setIpValid] = useState(true)
    const [port, setPort] = useState<string|null>(null)
    const [portValid, setPortValid] = useState(true)
    const [requestInterval, setRequestInterval] = useState<number|string|null>(null)
    const [requestIntervalValid, setRequestIntervalValid] = useState(true)
    const isLoading = !configuration
    const isValid = ipValid && portValid && requestIntervalValid

    const handleSave = () => {
        if (configuration === undefined) {
            console.error("Not saving, because there is an invalid value in the form.")
        } else if (props.id !== FEELWORLD_ID) {
            console.warn(`Changing id prop of FeelworldSettings is not supported. But got ${props.id}.`)
        } else {
            const config = configuration.clone()
            config.setIp(ip)
            config.setPort(port)
            config.setRequestInterval(requestInterval)

            socket.emit('config.change.feelworld', config.toJson(), props.id)
        }
    }

    return (
        <MixerSettingsWrapper
            title="Feelworld (experimental, unverified)"
            testId="feelworld"
            description="Feelworld video switcher tally over UDP. This connector has not been verified against real Feelworld hardware yet — only visible in dev builds."
            canBeSaved={isValid}
            isLoading={isLoading}
            onSave={handleSave}
        >
        { configuration && (<>
            <ValidatingInput label="IP" testId="feelworld-ip" object={configuration} propertyName="ip" onValid={(newIp) => { setIp(newIp); setIpValid(true) }} onInvalid={() => setIpValid(false)} />
            <ValidatingInput label="Port" testId="feelworld-port" object={configuration} propertyName="port" onValid={(newPort) => { setPort(newPort); setPortValid(true) }} onInvalid={() => setPortValid(false)} />
            <ValidatingInput label="Request Interval" testId="feelworld-requestInterval" object={configuration} propertyName="requestInterval" onValid={(newRequestInterval) => { setRequestInterval(newRequestInterval); setRequestIntervalValid(true) }} onInvalid={() => setRequestIntervalValid(false)} />
        </>)}
        </MixerSettingsWrapper>
    )
}

FeelworldSettings.defaultProps = {
    id: FEELWORLD_ID,
    label: "Feelworld",
}

export default FeelworldSettings
