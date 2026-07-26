import React from 'react'
import MixerSettingsWrapper from '../../../components/config/MixerSettingsWrapper'
import { socket } from '../../../hooks/useSocket'
import { SettingsProps } from '../../../../shared/mixer/interfaces'
import { NULL_ID } from '../../../../shared/mixer/ids'

type NullSettingsProps = SettingsProps & {}

function NullSettings(props: NullSettingsProps) {
    const handleSave = () => {
        if (props.id !== NULL_ID) {
            console.warn(`Changing id prop of NullSettings is not supported. But got ${props.id}.`)
        } else {
            socket.emit('config.change.null', NULL_ID)
        }
    }

    return (<MixerSettingsWrapper 
        title="Null Configuration"
        testId="null"
        description="Off"
        onSave={handleSave}
    ></MixerSettingsWrapper>)
}

NullSettings.defaultProps = {
    id: NULL_ID,
    label: "Off"
}

export default NullSettings
