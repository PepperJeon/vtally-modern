import React, { useState } from 'react'
import MixerSettingsWrapper from '../../../components/config/MixerSettingsWrapper'
import ValidatingInput from '../../../components/config/ValidatingInput'
import { useAtemConfiguration } from '../../../hooks/useConfiguration'
import { socket } from '../../../hooks/useSocket'
import { ATEM_ID } from '../../../../shared/mixer/ids'
import { useT } from '../../../i18n'

function AtemSettings() {
    const t = useT()
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
        } else {
            const config = configuration.clone()
            config.setIp(ip)
            config.setPort(port)

            socket.emit('config.change.atem', config.toJson(), ATEM_ID)
        }
    }

    return (
        <MixerSettingsWrapper 
            title={t.atem.title}
            testId="atem"
            description={t.atem.description}
            canBeSaved={isValid}
            isLoading={isLoading}
            onSave={handleSave}
        >
            {configuration && (<>
                <ValidatingInput label={t.atem.ip} testId="atem-ip" object={configuration} propertyName="ip" onValid={(newIp) => { setIp(newIp); setIpValid(true) }} onInvalid={() => setIpValid(false)} />
                <ValidatingInput label={t.atem.port} testId="atem-port" object={configuration} propertyName="port" onValid={(newPort) => { setPort(newPort); setPortValid(true) }} onInvalid={() => setPortValid(false)} />
            </>)}
            
        </MixerSettingsWrapper>
    )
}

export default AtemSettings
