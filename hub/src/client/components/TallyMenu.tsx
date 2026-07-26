import React, { useState } from 'react'
import Tally from '../../shared/domain/Tally';
import { FileText, Lightbulb, Link as LinkIcon, MoreVertical, SlidersHorizontal, Trash2 } from 'lucide-react'
import { socket } from '../hooks/useSocket'
import { Link as RouterLink } from 'react-router-dom'
import TallySettings from './TallySettings';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

type TallyMenuProps = {
  tally: Tally
  className?: string
}

const itemClass = "min-h-11 gap-3 px-3 text-base text-text data-[disabled]:text-n-400"

/**
 * The per-tally menu — design-components.md §1.7.
 *
 * `data-testid="tally-${name}-menu"` stays on the WRAPPER <div> around the
 * trigger, where `TallyMenu.tsx` has always had it: `webtally.spec.ts` clicks
 * the wrapper itself and `tally-remove.spec.ts` does `.find('button').click()`,
 * so both the wrapper and a button beneath it have to exist. The wrapper hugs
 * the 44px trigger so a click on its centre still lands on the button.
 *
 * The item testids move ONTO the items (they were on MUI `<Tooltip>`s, which
 * clone their child rather than render a node, so it was never certain the
 * attribute reached the DOM at all — ui-contract H10). That is what the
 * authorised `tally-remove.spec.ts` edit asserts against.
 *
 * Highlight and Remove are near-mutually-exclusive by design — you can only
 * locate a lamp that answers, and only remove one that does not. The early
 * returns in the handlers are the real enforcement; `disabled` is the hint.
 */
function TallyMenu({ tally, className }: TallyMenuProps) {
  const [settingsOpen, setSettingsOpen] = useState(false)
  const allowHighlight = tally.isActive()
  const allowRemove = !tally.isConnected()

  const handleHighlightTally = () => {
    if (!allowHighlight) { return }
    socket.emit('tally.highlight', tally.name, tally.type)
  }

  const handleRemoveTally = () => {
    if (!allowRemove) { return }
    socket.emit('tally.remove', tally.name, tally.type)
  }

  return (<div data-testid={`tally-${tally.name}-menu`} className={className}>
    <DropdownMenu>
      <DropdownMenuTrigger
        title={`${tally.name} Menu`}
        aria-label={`${tally.name} Menu`}
        className="flex size-11 items-center justify-center rounded-sm border-0 bg-transparent text-current hover:bg-surface-hover focus-visible:shadow-focus focus-visible:outline-none"
      >
        <MoreVertical className="size-5" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-auto min-w-56 border border-border-strong bg-surface-raised shadow-[var(--shadow-overlay)]">
        {tally.isWebTally() && (
          <DropdownMenuItem asChild data-testid={`tally-${tally.name}-web`} className={itemClass}>
            <RouterLink to={`/tally/${tally.getId()}`} className="no-underline">
              <LinkIcon className="size-4" />Connect
            </RouterLink>
          </DropdownMenuItem>
        )}
        <DropdownMenuItem
          data-testid={`tally-${tally.name}-settings`}
          className={itemClass}
          onSelect={() => {
            // ponytail: one tick of deferral, not a controlled-menu rewrite.
            // Radix returns focus to the trigger as the menu unmounts; opening
            // the dialog in the same tick makes the two fight over focus.
            setTimeout(() => setSettingsOpen(true), 0)
          }}
        >
          <SlidersHorizontal className="size-4" />Settings
        </DropdownMenuItem>
        <DropdownMenuItem asChild data-testid={`tally-${tally.name}-logs`} className={itemClass}>
          <RouterLink to={`/tally/${tally.getId()}/log`} className="no-underline">
            <FileText className="size-4" />Logs
          </RouterLink>
        </DropdownMenuItem>
        {/* Radix kills pointer events on a disabled item, which would kill the
          * tooltip explaining *why* it is disabled. The span owns the title so
          * the explanation stays reachable (§1.7). */}
        <span title={!allowHighlight ? "Tally is not connected" : undefined} className="block">
          <DropdownMenuItem
            data-testid={`tally-${tally.name}-highlight`}
            className={itemClass}
            disabled={!allowHighlight}
            onSelect={handleHighlightTally}
          >
            <Lightbulb className="size-4" />Highlight
          </DropdownMenuItem>
        </span>
        <span title={!allowRemove ? "Connected Tallies can not be removed" : undefined} className="block">
          <DropdownMenuItem
            data-testid={`tally-${tally.name}-remove`}
            className={itemClass}
            disabled={!allowRemove}
            onSelect={handleRemoveTally}
          >
            <Trash2 className="size-4" />Remove
          </DropdownMenuItem>
        </span>
      </DropdownMenuContent>
    </DropdownMenu>
    {/* Outside the menu content on purpose: Radix unmounts the content on
      * close, and a dialog rendered inside it would be torn down with it. */}
    <TallySettings tally={tally} open={settingsOpen} onClose={() => setSettingsOpen(false)} />
  </div>)
}

export default TallyMenu
