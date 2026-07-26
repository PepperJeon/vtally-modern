import React, { useState } from 'react'
import MixerSettingsWrapper from '../../../components/config/MixerSettingsWrapper'
import ValidatingInput from '../../../components/config/ValidatingInput'
import ExternalLink from '../../../components/ExternalLink'
import { useVmixConfiguration } from '../../../hooks/useConfiguration'
import { socket } from '../../../hooks/useSocket'
import { VMIX_ID } from '../../../../shared/mixer/ids'

const httpApiPort = "8088"

function VmixSettings() {
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
            title="vMix"
            testId="vmix"
            description={<>Connects to any vMix over network using the <ExternalLink href="https://www.vmix.com/help24/index.htm?TCPAPI.html">TCP API</ExternalLink>.</>}
            canBeSaved={isValid}
            isLoading={isLoading}
            onSave={handleSave}
        >
        { configuration && (<>
            <ValidatingInput label="vMix IP" testId="vmix-ip" object={configuration} propertyName="ip" onValid={(newIp) => { setIp(newIp); setIpValid(true) }} onInvalid={() => setIpValid(false)} />
            <ValidatingInput
                label="vMix Port"
                testId="vmix-port"
                object={configuration}
                propertyName="port"
                onValid={(newPort) => { setPort(newPort); setPortValid(true) }}
                onInvalid={() => setPortValid(false)}
                warningMessage={port === httpApiPort ? "This will probably not work. You entered the port of the Web UI, but the port for the TCPAPI is required. If you are unsure what this message means, leave the field blank to use the default." : ""}
            />
        </>)}
        </MixerSettingsWrapper>
    )
}

export default VmixSettings
