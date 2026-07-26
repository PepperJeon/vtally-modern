import React, { useEffect, useState } from 'react'
import MixerSettingsWrapper from '../../../components/config/MixerSettingsWrapper'
import ValidatingInput from '../../../components/config/ValidatingInput'
import ExternalLink from '../../../components/ExternalLink'
import { useObsConfiguration } from '../../../hooks/useConfiguration'
import { socket } from '../../../hooks/useSocket'
import { ObsConfigurationLiveMode } from '../../../../shared/mixer/obs/ObsConfiguration'
import { OBS_ID } from '../../../../shared/mixer/ids'
import ObsLiveModeSelect from './ObsLiveModeSelect'

function ObsSettings() {
    const configuration = useObsConfiguration()
    const [ip, setIp] = useState<string|null>(null)
    const [ipValid, setIpValid] = useState(true)
    const [port, setPort] = useState<string|null>(null)
    const [portValid, setPortValid] = useState(true)
    const [password, setPassword] = useState<string|null>(null)
    const [liveMode, setLiveMode] = useState<ObsConfigurationLiveMode|null>(null)
    const liveModeValid = liveMode !== null
    const isLoading = !configuration
    const isValid = ipValid && portValid && liveModeValid

    useEffect(() => {
        // when default settings change
        if (configuration) {
            setLiveMode(configuration.getLiveMode())
        }
    }, [configuration])

    const handleSave = () => {
        if (configuration === undefined) {
            console.error("Not saving, because there is an invalid value in the form.")
        } else {
            const config = configuration.clone()
            config.setIp(ip)
            config.setPort(port)
            config.setPassword(password)
            config.setLiveMode(liveMode)

            socket.emit('config.change.obs', config.toJson(), OBS_ID)
        }
    }

    return (
        <MixerSettingsWrapper 
            title="OBS Studio Configuration"
            testId="obs"
            description={<>Connects to OBS Studio over network. Needs <ExternalLink href="https://github.com/obsproject/obs-websocket">obs-websocket version 5</ExternalLink>, which is built into OBS 28 and newer. Version 4 of the plugin is no longer supported.</>}
            canBeSaved={isValid}
            isLoading={isLoading}
            onSave={handleSave}
        >
            { configuration && (<>
                <ValidatingInput label="Obs IP" testId="obs-ip" object={configuration} propertyName="ip" onValid={(newIp) => { setIp(newIp); setIpValid(true) }} onInvalid={() => setIpValid(false)} />
                <ValidatingInput label="Obs Port" testId="obs-port" object={configuration} propertyName="port" warningMessage="OBS 28 and newer use 4455" onValid={(newPort) => { setPort(newPort); setPortValid(true) }} onInvalid={() => setPortValid(false)} />
                <ValidatingInput label="Obs Password" testId="obs-password" object={configuration} propertyName="password" warningMessage="Leave empty if authentication is disabled" onValid={setPassword} />
                <ObsLiveModeSelect label="On-Air Status" testId="obs-liveMode" value={liveMode} onChange={setLiveMode} />
            </>)}
        </MixerSettingsWrapper>
    )
}

export default ObsSettings
