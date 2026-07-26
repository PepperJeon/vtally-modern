import React, { useState } from 'react'
import MixerSettingsWrapper from '../../../components/config/MixerSettingsWrapper'
import ValidatingInput from '../../../components/config/ValidatingInput'
import { useAtemConfiguration } from '../../../hooks/useConfiguration'
import { socket } from '../../../hooks/useSocket'
import { ATEM_ID } from '../../../../shared/mixer/ids'

type AtemSettingsProps = {
    id: typeof ATEM_ID,
    label: string,
}

function AtemSettings(props: AtemSettingsProps) {
    const configuration = useAtemConfiguration()
    const [ip, setIp] = useState<string|null>(null)
    const [ipValid, setIpValid] = useState(true)
    const [port, setPort] = useState<string|null>(null)
    const [portValid, setPortValid] = useState(true)
    const isLoading = !configuration
    const isValid = ipValid && portValid

    const handleSave = () => {
        if (configuration === undefined) {
            console.error("Not saving, because there is an invalid value in the form.")
        } else if (props.id !== ATEM_ID) {
            console.warn(`Changing id prop of AtemSettings is not supported. But got ${props.id}.`)
        } else {
            const config = configuration.clone()
            config.setIp(ip)
            config.setPort(port)

            socket.emit('config.change.atem', config.toJson(), props.id)
        }
    }

    return (
        <MixerSettingsWrapper 
            title="ATEM Configuration"
            testId="atem"
            description="Connects to any ATEM device over network."
            canBeSaved={isValid}
            isLoading={isLoading}
            onSave={handleSave}
        >
            {configuration && (<>
                <ValidatingInput label="ATEM IP" testId="atem-ip" object={configuration} propertyName="ip" onValid={(newIp) => { setIp(newIp); setIpValid(true) }} onInvalid={() => setIpValid(false)} />
                <ValidatingInput label="ATEM Port" testId="atem-port" object={configuration} propertyName="port" onValid={(newPort) => { setPort(newPort); setPortValid(true) }} onInvalid={() => setPortValid(false)} />
            </>)}
            
        </MixerSettingsWrapper>
    )
}

AtemSettings.defaultProps = {
    id: ATEM_ID,
    label: "ATEM by Blackmagic Design",
}

export default AtemSettings
