import React, { useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import useChannels from '../hooks/useChannels'
import { socket } from '../hooks/useSocket'
import useTallies from '../hooks/useTallies'
import ChannelSelector from './ChannelSelector'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { useT } from '../i18n'

const createTally = function (tallyName, channelId) {
  socket.emit('tally.create', tallyName, channelId || undefined)
}

type TallyCreatePopupProps = {
  open: boolean
  onClose: () => void
}

const maxLength = 26 // same as "tally.name" in tally

/**
 * design-screens.md §4.5. The validation message is rendered under the field in
 * amber as well as being the disabled-button explanation: tokens §3.3 says
 * nothing load-bearing may live only in a tooltip, and a 26-character limit
 * that only announces itself at character 27 is a trap — hence the counter.
 *
 * `tally-create-name` sits on the <input> itself and `tally-create-ok` on the
 * <button>: no spec uses a descendant selector for either (they `.type()` and
 * `.should('be.disabled')` directly), so this is Rule A's simple case.
 */
function TallyCreatePopup({open, onClose}: TallyCreatePopupProps) {
  const t = useT()
  const channels = useChannels()
  const tallies = useTallies()
  const [channelId, setChannelId] = useState<string>(undefined)
  const [name, setName] = useState<string>("");
  const hasUdpTally = !!tallies?.find(tally => tally.isUdpTally())

  let errorMessage = ""
  if (name === "") {
    errorMessage = t.tallyCreate.errorEmpty
  } else if (name.length > maxLength) {
    errorMessage = t.tallyCreate.errorTooLong(maxLength)
  } else if (tallies?.find(tally => tally.name === name)) {
    errorMessage = t.tallyCreate.errorExists(name)
  }

  function handleCreate() {
    createTally(name, channelId)
    onClose()
  }

  return (
    <Dialog open={open} onOpenChange={(isOpen) => { if (!isOpen) { onClose() } }}>
      <DialogContent
        data-testid="tally-create-popup"
        showCloseButton={false}
        aria-describedby={undefined}
        className="w-full max-w-md border border-border-strong bg-surface-raised p-4 text-text sm:max-w-md"
      >
        <DialogTitle className="text-xl font-semibold text-text">{t.tallyCreate.createWebTally}</DialogTitle>
        { !hasUdpTally ? (
          <div role="status" data-testid="tally-create-warning" className="flex gap-2 rounded-md border border-missing px-3 py-2 text-sm text-missing">
            <AlertTriangle aria-hidden className="mt-0.5 size-4 shrink-0" />
            <span>{t.tallyCreate.hardwareWarning}</span>
          </div>
        ) : "" }
        <p className="text-sm text-text-muted">{t.tallyCreate.description}</p>

        <div>
          <label htmlFor="tally-create-name-field" className="mb-1 block text-sm font-medium text-text-muted">{t.tallyCreate.name}</label>
          <input
            id="tally-create-name-field"
            data-testid="tally-create-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus={true}
            aria-invalid={!!errorMessage}
            className={
              "h-11 w-full rounded-sm border bg-n-900 px-3 font-sans text-base text-text " +
              "focus-visible:border-border-strong focus-visible:shadow-focus focus-visible:outline-none " +
              (errorMessage ? "border-missing" : "border-n-600")
            }
          />
          <div className="flex min-h-5 justify-between gap-2 pt-1 text-sm">
            <span className="text-missing">{errorMessage && (<><span aria-hidden>⚠ </span>{errorMessage}</>)}</span>
            <span className="shrink-0 tabular-nums text-text-muted">{name.length} / {maxLength}</span>
          </div>
        </div>

        <ChannelSelector value={channelId} channels={channels} onChange={setChannelId} />

        <div className="mt-2 flex justify-end gap-2">
          <Button type="button" variant="outline" className="h-11 px-4" onClick={onClose} data-testid="tally-create-cancel">{t.common.cancel}</Button>
          <span title={errorMessage}>
            <Button type="button" className="h-11 px-4" disabled={!!errorMessage} data-testid="tally-create-ok" onClick={handleCreate}>{t.common.create}</Button>
          </span>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function TallyCreate() {
  const t = useT()
  const [modalOpen, setModalOpen] = useState(false)

  return (
    <>
      {/* Dashed and unfilled so it never competes with a real card, and it sits
        * where the next tally will appear rather than in the toolbar
        * (design-screens.md §1.6). */}
      <button
        type="button"
        onClick={() => setModalOpen(true)}
        data-testid="tally-create"
        className="flex w-[250px] flex-col items-center justify-center gap-1 rounded-md border border-dashed border-n-600 bg-transparent p-6 text-text-muted transition-colors duration-[var(--duration-fast)] hover:border-n-500 hover:text-text focus-visible:shadow-focus focus-visible:outline-none"
      >
        <span aria-hidden className="text-2xl leading-none">+</span>
        <span className="text-base">{t.tallyCreate.createWebTally}</span>
      </button>
      <TallyCreatePopup open={modalOpen} onClose={() => setModalOpen(false)} />
    </>
  )
}

export default TallyCreate
