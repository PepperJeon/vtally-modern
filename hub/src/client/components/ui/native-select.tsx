import * as React from 'react'
import { ChevronDown } from 'lucide-react'

import { cn } from '@/lib/utils'

/**
 * A real native `<select>`, deliberately — design-components.md §2.4.
 *
 * Radix `Select` renders `<div role="option">`, so `:selected`, `<option>` and
 * `cy.select()` all stop working. Seven specs depend on the native DOM
 * (`mixer-select` in six config specs, `obs-liveMode`, `channel-selector`), and
 * `MyTheme.tsx` chose `native: true` for mobile on purpose.
 *
 * `data-testid` lands on the WRAPPER, not on the `<select>`. Every spec that
 * reaches one of these does so through a descendant selector —
 * `*[data-testid=mixer-select] select`, `.find("select")`,
 * `*[data-testid=obs-liveMode] select :selected` — which is exactly where MUI's
 * `NativeSelect` put it. §2.4's sample code spreads `...rest` (and therefore
 * `data-testid`) onto the `<select>` itself; doing that makes every one of
 * those selectors resolve to nothing.
 */
function NativeSelect({
  className,
  'data-testid': testId,
  ...rest
}: React.ComponentProps<'select'> & { 'data-testid'?: string }) {
  return (
    <div className="relative" data-testid={testId}>
      <select
        className={cn(
          'h-11 w-full appearance-none rounded-sm border border-n-600 bg-n-900 pl-3 pr-9',
          'font-sans text-base text-text',
          'focus-visible:border-border-strong focus-visible:shadow-focus focus-visible:outline-none',
          'disabled:text-text-disabled',
          className
        )}
        {...rest}
      />
      <ChevronDown
        aria-hidden
        className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-n-400"
      />
    </div>
  )
}

export { NativeSelect }
