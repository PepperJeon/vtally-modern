import React from 'react'
import ChannelSelector from './ChannelSelector'
import { Tally as TallyType } from '../../shared/domain/Tally'
import useChannels from '../hooks/useChannels'
import useProgramPreview from '../hooks/useProgramPreview'
import { socket } from '../hooks/useSocket'
import TallyMenu from './TallyMenu'
import { cn, latinCaps } from '@/lib/utils'
import { useT } from '../i18n'

type TallyProps = {
    tally: TallyType
    className?: string
}

type DataColor = "unpatched" | "program" | "preview" | "idle"
type Health = "connected" | "missing" | "disconnected"

/**
 * The tally card — design-components.md §1.
 *
 * Two axes that never overwrite each other (§1.0): program state (`data-color`)
 * and transport health (`data-health`). A card can be `program` AND
 * `disconnected` — the product's worst case — and it must show both at once:
 * solid red fill from the state axis, dashed grey outline plus a struck-through
 * "ON AIR" from the health axis. Health is drawn with `outline`, not `border`,
 * precisely so the two axes cannot fight over one property (§1.3).
 *
 * DOM contract: `data-testid`, `data-color` and `data-isactive` all sit on the
 * one root node (ui-contract §1.5/§2.1/§2.2), exactly where MUI's `Paper` put
 * them. `data-health` is new and carries no spec obligation; it exists so the
 * health styling is attribute-driven like the rest instead of a fourth
 * className branch.
 *
 * DEVIATION from §1.3's copy: the English health words stay `connected` /
 * `missing` / `disconnected` rather than becoming CONNECTED / NOT REPORTING /
 * NO SIGNAL. `tally.spec.ts:41` asserts `cy.getTestId('tally-x').contains("missing")`
 * and that spec edit is not authorised. The uppercasing is done in CSS, so the
 * card reads the way the design intends while the DOM text is unchanged.
 *
 * `data-color` and `data-health` keep their ENGLISH keys in every language —
 * they drive the styling and are read by specs. Only the rendered words come
 * from the translation table. The uppercase/tracking pair is dropped under
 * Korean by `latinCaps` (i18n-plan.md §6.1): on Hangul it is a silent no-op
 * that would quietly remove the emphasis rather than break anything visible.
 */
function Tally({ tally, className }: TallyProps) {
    const t = useT()
    const channels = useChannels()
    const [programs, previews] = useProgramPreview()

    const patchTally = function (tally, channel) {
        socket.emit('tally.patch', tally.name, tally.type, channel)
    }

    let dataColor: DataColor = "idle"
    if (!tally.isPatched()) {
        dataColor = "unpatched"
    } else if (programs && tally.isIn(programs)) {
        dataColor = "program"
    } else if (previews && tally.isIn(previews)) {
        dataColor = "preview"
    }
    const isActive = tally.isActive()
    const health: Health = !isActive ? "disconnected" : (tally.isMissing() ? "missing" : "connected")

    return (
        <article
            data-testid={`tally-${tally.name}`}
            data-color={dataColor}
            data-isactive={isActive}
            data-health={health}
            role="group"
            aria-label={t.tally.cardLabel(tally.name, t.tally.state[dataColor], t.tally.health[health])}
            className={cn(
                "group box-border w-[250px] overflow-hidden rounded-md border border-border bg-surface-raised text-text transition-none",
                // state axis — fill and border only
                "data-[color=idle]:border-idle",
                "data-[color=preview]:border-[3px] data-[color=preview]:border-preview",
                "data-[color=unpatched]:border-2 data-[color=unpatched]:border-dashed data-[color=unpatched]:border-unpatched",
                "data-[color=program]:border-live data-[color=program]:bg-live data-[color=program]:text-on-fill",
                // health axis — outline only, so it can never erase the fill
                "data-[health=disconnected]:outline-2 data-[health=disconnected]:outline-dashed data-[health=disconnected]:outline-offset-2 data-[health=disconnected]:outline-disconnected",
                className
            )}
        >
            <div className="flex items-center justify-between gap-2 border-b border-border py-2 pl-4 pr-3">
                <div className="truncate text-2xl font-semibold tracking-tight">{tally.name}</div>
                <TallyMenu tally={tally} />
            </div>
            <div className="p-4">
                <ChannelSelector value={tally.channelId} channels={channels} onChange={value => patchTally(tally, value)} />
            </div>
            <div className={cn("border-t border-border px-4 py-2 text-xs font-semibold", latinCaps, "group-data-[health=missing]:bg-missing group-data-[health=missing]:text-on-fill")}>
                {/* §1.4: both words, never one replacing the other. The mixer says
                  * this camera is live; the lamp is not answering. A plain red card
                  * would tell the operator the lamp is lit. */}
                <div className="flex justify-between gap-2">
                    <span className={cn(health === "disconnected" && "line-through")}>{t.tally.state[dataColor]}</span>
                    {/* grey only where it reads as grey — on a red program fill
                      * --color-disconnected has no contrast, so the on-fill colour
                      * is kept there instead */}
                    <span className={cn(health === "disconnected" && dataColor !== "program" && "text-disconnected")}>{t.tally.health[health]}</span>
                </div>
                {tally.isUdpTally() && tally.address && tally.port && (
                    <div className="pt-0.5 text-right font-mono text-2xs font-normal normal-case tabular-nums opacity-80">{tally.address}:{tally.port}</div>
                )}
            </div>
        </article>
    )
}


export default Tally;
