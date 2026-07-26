import React from 'react'

import { cn } from '@/lib/utils'

type MiniPageProps = {
  title?: string,
  addHeaderContent?: React.ReactNode
  contentPadding?: string
  testId?: string
  className?: string
  children: React.ReactNode
}

/** A titled panel. `<h2>`, not `<h1>` — there were three `h1`s on /config
 *  (design-screens.md §2.1). Callers that need a different measure pass
 *  `className`; the default keeps the old centred narrow column so the pages
 *  that have not been redesigned yet look unchanged. */
function MiniPage({ title, addHeaderContent, contentPadding, testId, className, children }: MiniPageProps) {
  return (
    <div
      data-testid={testId}
      className={cn("mx-auto mb-4 w-full max-w-[600px] rounded-md border border-border bg-surface", className)}
    >
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <h2 className="m-0 text-xl font-semibold text-text">{title}</h2>
        {addHeaderContent}
      </div>
      <div
        className="p-6 max-sm:p-4"
        style={contentPadding !== undefined ? { padding: contentPadding } : undefined}
      >
        {children}
      </div>
    </div>
  )
}

export default MiniPage
