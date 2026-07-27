import React, { useState } from 'react'
import { useAllowedMixersConfiguration, useMixerNameConfiguration } from '../../hooks/useConfiguration'
import { MIXERS } from '../../mixer/registry'
import { NativeSelect } from '../ui/native-select'
import Spinner from '../layout/Spinner'
import MiniPage from '../layout/MiniPage'
import { useT } from '../../i18n'

function MixerSelection() {
    const t = useT()
    const mixerName = useMixerNameConfiguration()
    const allowedMixers = useAllowedMixersConfiguration()

    const [oldMixerName, setOldMixerName] = useState(mixerName)
    const [mixerId, setMixerId] = useState(mixerName)

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
        <MiniPage title={t.mixerSelection.title} className="max-w-[560px]">
            <p className="m-0 mb-4 text-sm text-text-muted">{t.mixerSelection.description}</p>
            {isLoading ? <Spinner /> : (<>
                <NativeSelect data-testid="mixer-select" aria-label={t.mixerSelection.title} value={mixerId} onChange={e => setMixerId(e.target.value)}>
                    {availableMixers.map(mixer => (
                        <option key={mixer.id} value={mixer.id}>{t.mixers[mixer.id]}</option>
                    ))}
                </NativeSelect>
                {/* the selector changes what is below it, so make that visible */}
                {currentMixer && <div className="mt-4 border-t border-border pt-4"><currentMixer.Settings /></div>}
            </>)}
        </MiniPage>
    )
}

export default MixerSelection
