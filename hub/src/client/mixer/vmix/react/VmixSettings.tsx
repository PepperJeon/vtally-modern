import React, { useState } from 'react'
import MixerSettingsWrapper from '../../../components/config/MixerSettingsWrapper'
import ValidatingInput from '../../../components/config/ValidatingInput'
import ExternalLink from '../../../components/ExternalLink'
import { useVmixConfiguration } from '../../../hooks/useConfiguration'
import { socket } from '../../../hooks/useSocket'
import { VMIX_ID } from '../../../../shared/mixer/ids'
import { useT } from '../../../i18n'

const httpApiPort = "8088"

function VmixSettings() {
    const t = useT()
    const configuration = useVmixConfiguration()
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

            socket.emit('config.change.vmix', config.toJson(), VMIX_ID)
        }
    }

    return (
        <MixerSettingsWrapper 
            title={t.vmix.title}
            testId="vmix"
            description={t.vmix.description(text => <ExternalLink href="https://www.vmix.com/help24/index.htm?TCPAPI.html">{text}</ExternalLink>)}
            canBeSaved={isValid}
            isLoading={isLoading}
            onSave={handleSave}
        >
        { configuration && (<>
            <ValidatingInput label={t.vmix.ip} testId="vmix-ip" object={configuration} propertyName="ip" onValid={(newIp) => { setIp(newIp); setIpValid(true) }} onInvalid={() => setIpValid(false)} />
            <ValidatingInput
                label={t.vmix.port}
                testId="vmix-port"
                object={configuration}
                propertyName="port"
                onValid={(newPort) => { setPort(newPort); setPortValid(true) }}
                onInvalid={() => setPortValid(false)}
                warningMessage={port === httpApiPort ? t.vmix.portWarning : ""}
            />
        </>)}
        </MixerSettingsWrapper>
    )
}

export default VmixSettings
