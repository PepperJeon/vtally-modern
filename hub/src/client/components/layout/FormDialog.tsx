import React from 'react'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'

type FormDialogProps = {
  "data-testid": string
  label: string
  open: boolean
  onSubmit?: () => void
  onClose: () => void
  isLoading?: boolean
  children?: React.ReactNode
}

/**
 * One `data-testid` in, three nodes out: `${testId}` on the dialog surface,
 * `${testId}-close` on Cancel and `${testId}-submit` on Save (ui-contract H11).
 * That is intended and has a live caller (`TallySettings`), so it is preserved
 * verbatim; `dialog-cancel.spec.ts` reads `tally-settings-close`.
 *
 * The title-bar X is the same `onClose` handler as Cancel, as before, and still
 * carries no testid of its own.
 */
function FormDialog({label, onSubmit, onClose, isLoading, open, children, ...rest}: FormDialogProps) {
  const testId = rest["data-testid"]

  return (
    <Dialog open={open} onOpenChange={(isOpen) => { if (!isOpen) { onClose() } }}>
      <DialogContent
        data-testid={testId}
        showCloseButton={false}
        aria-describedby={undefined}
        className="max-h-[90vh] w-full max-w-lg gap-0 overflow-y-auto border border-border-strong bg-surface-raised p-0 text-text sm:max-w-lg"
      >
        <form onSubmit={(e) => {
          e.preventDefault()
          onSubmit && onSubmit()
        }}>
          <div className="flex items-baseline justify-between gap-2 border-b border-border px-4 py-3">
            <DialogTitle className="text-xl font-semibold text-text">{label}</DialogTitle>
            <button
              type="button"
              aria-label="Close Dialog"
              onClick={onClose}
              className="-mr-2 flex size-11 items-center justify-center rounded-sm border-0 bg-transparent text-text-muted hover:bg-surface-hover focus-visible:shadow-focus focus-visible:outline-none"
            >
              <span aria-hidden className="text-lg leading-none">✕</span>
            </button>
          </div>
          {/* overflow-hidden: the brightness slider's value bubble glitches out
            * of the box otherwise — same reason MUI's DialogContent had it */}
          <div className="overflow-hidden px-4 py-4">
            {children}
          </div>
          <div className="flex justify-between gap-2 border-t border-border px-4 py-3">
            <Button type="button" variant="outline" className="h-11 px-4" onClick={onClose} data-testid={`${testId}-close`}>Cancel</Button>
            <Button type="submit" className="h-11 px-4" disabled={isLoading} data-testid={`${testId}-submit`}>Save</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export default FormDialog
