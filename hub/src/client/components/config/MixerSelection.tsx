import { makeStyles, NativeSelect, Typography } from '@material-ui/core'
import React, { useState } from 'react'
import { useAllowedMixersConfiguration, useMixerNameConfiguration } from '../../hooks/useConfiguration'
import { MIXERS } from '../../mixer/registry'
import Spinner from '../layout/Spinner'
import MiniPage from '../layout/MiniPage'

const useStyles = makeStyles(theme => ({
    text: {
        color: theme.palette.grey[600]
    },
    select: {
        marginBottom: theme.spacing(2),
    },
}))

function MixerSelection() {
    const mixerName = useMixerNameConfiguration()
    const allowedMixers = useAllowedMixersConfiguration()

    const [oldMixerName, setOldMixerName] = useState(mixerName)
    const [mixerId, setMixerId] = useState(mixerName)
    const classes = useStyles()

    const isLoading = mixerName === undefined || allowedMixers === undefined
    // Adjusting state during render is the documented React way to reset local
    // state when an external value changes, and it is unchanged in React 19.
    // The registry rewrite does not remove the need for it: `mixerId` is the
    // user's in-progress dropdown selection, which has to snap back whenever
    // the server pushes a different saved mixer.
    if (mixerName !== oldMixerName) {
        setMixerId(mixerName)
        setOldMixerName(mixerName)
    }

    // The server decides what may be offered; dev-only connectors (Feelworld,
    // Mock) are absent from allowedMixers outside dev and must stay hidden.
    const availableMixers = MIXERS.filter(mixer => allowedMixers?.includes(mixer.id))
    const currentMixer = availableMixers.find(mixer => mixer.id === mixerId)

    return (
        <MiniPage title="Video Mixer">
            <Typography paragraph className={classes.text}>Select a Video Mixer to use.</Typography>
            {isLoading ? <Spinner /> : (<>
                <div className={classes.select}>
                    <NativeSelect data-testid="mixer-select" value={mixerId} onChange={e => setMixerId(e.target.value)}>
                        {availableMixers.map(mixer => (
                            <option key={mixer.id} value={mixer.id}>{mixer.label}</option>
                        ))}
                    </NativeSelect>
                </div>
                {currentMixer && <currentMixer.Settings />}
            </>)}
        </MiniPage>
    )
}

export default MixerSelection
