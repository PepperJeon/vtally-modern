import React from 'react'
import MixerSettingsWrapper from '../../../components/config/MixerSettingsWrapper'
import { socket } from '../../../hooks/useSocket'
import { NULL_ID } from '../../../../shared/mixer/ids'
import { useT } from '../../../i18n'

function NullSettings() {
    const t = useT()
    const handleSave = () => {
        socket.emit('config.change.null', NULL_ID)
    }

    return (<MixerSettingsWrapper 
        title={t.nullMixer.title}
        testId="null"
        description={t.nullMixer.description}
        onSave={handleSave}
    ></MixerSettingsWrapper>)
}

export default NullSettings
