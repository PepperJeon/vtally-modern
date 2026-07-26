import React from 'react'
import MixerSettingsWrapper from '../../../components/config/MixerSettingsWrapper'
import { socket } from '../../../hooks/useSocket'
import { NULL_ID } from '../../../../shared/mixer/ids'

function NullSettings() {
    const handleSave = () => {
        socket.emit('config.change.null', NULL_ID)
    }

    return (<MixerSettingsWrapper 
        title="Null Configuration"
        testId="null"
        description="Off"
        onSave={handleSave}
    ></MixerSettingsWrapper>)
}

export default NullSettings
