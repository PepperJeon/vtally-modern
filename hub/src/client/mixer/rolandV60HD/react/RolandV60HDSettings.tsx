import React, { useState } from 'react'
import MixerSettingsWrapper from '../../../components/config/MixerSettingsWrapper'
import ValidatingInput from '../../../components/config/ValidatingInput'
import { socket } from '../../../hooks/useSocket'
import { useRolandV60HDConfiguration } from '../../../hooks/useConfiguration'
import { ROLAND_V60HD_ID } from '../../../../shared/mixer/ids'

function RolandV60HDSettings() {
    const configuration = useRolandV60HDConfiguration()
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
        } else {
            const config = configuration.clone()
            config.setIp(ip)
            config.setPort(port)
            config.setRequestInterval(requestInterval)

            socket.emit('config.change.rolandV60HD', config.toJson(), ROLAND_V60HD_ID)
        }
    }

    return (
        <MixerSettingsWrapper
            title="RolandV60HD SmartTally"
            testId="rolandV60HD"
            description="RolandV60HD Mixer with suport for Roland SmartTally"
            canBeSaved={isValid}
            isLoading={isLoading}
            onSave={handleSave}
        >
        { configuration && (<>
            <ValidatingInput label="IP" testId="rolandV60HD-ip" object={configuration} propertyName="ip" onValid={(newIp) => { setIp(newIp); setIpValid(true) }} onInvalid={() => setIpValid(false)} />
            <ValidatingInput label="Port" testId="rolandV60HD-port" object={configuration} propertyName="port" onValid={(newPort) => { setPort(newPort); setPortValid(true) }} onInvalid={() => setPortValid(false)} />
            <ValidatingInput label="Request Interval" testId="rolandV60HD-requestInterval" object={configuration} propertyName="requestInterval" onValid={(newRequestInterval) => { setRequestInterval(newRequestInterval); setRequestIntervalValid(true) }} onInvalid={() => setRequestIntervalValid(false)} />
        </>)}
        </MixerSettingsWrapper>
    )
}

export default RolandV60HDSettings
