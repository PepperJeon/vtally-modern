import React from "react";
import Channel from '../../shared/domain/Channel'
import { NativeSelect } from '@/components/ui/native-select'

type ChannelSelectorProps = {
    channels?: Channel[]
    value?: string
    onChange?: (value: string|null) => void
}

/* `data-testid="channel-selector"` lands on the NativeSelect WRAPPER, which is
 * where MUI's `Select` put it too. Every spec reaches this through a descendant
 * selector — `*[data-testid=tally-x] *[data-testid=channel-selector] select` and
 * `… :selected` (tally.spec.ts, webtally.spec.ts) — so moving it onto the
 * <select> would make all of them resolve to nothing (design-components.md
 * §2.0 Rule A, the "both selector shapes are live" case). */
const ChannelSelector = ({channels, value = null, onChange} : ChannelSelectorProps) => {
    channels = channels || []

    const handleValueChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        let val: string|null = e.target.value.toString()
        if (val === "") { val = null }

        if (onChange) {
            onChange(val)
        }
    }

    let optionFound = value === null

    return (<NativeSelect data-testid="channel-selector" value={value || ""} onChange={handleValueChange}>
        <option value="" key={null}>(unpatched)</option>
        {channels.map(c => {
            if (c.id === value) {
                optionFound = true
            }
            return <option key={c.id} value={c.id}>{c.name || `Channel ${c.id}`}</option>
        })}
        { !optionFound && value !== undefined ? (<option key={value} value={value}>Channel {value}</option>) : "" }
    </NativeSelect>)
}

export default ChannelSelector;
