import React from 'react'
import { Link as RouterLink } from 'react-router-dom'

type LayoutProps = {
  testId: string // this makes it easy in cypress to determine on which page we are
  children?: React.ReactNode
}

const navLinkClass =
  "inline-flex h-11 items-center rounded-sm px-3 font-sans text-base font-medium text-text no-underline " +
  "transition-colors duration-[var(--duration-fast)] hover:bg-surface-hover " +
  "focus-visible:shadow-focus focus-visible:outline-none"

// The nav labels are also `data-testid`s. smoke.spec.ts still navigates by text
// (`cy.contains("Configuration")`), and that spec edit is only pre-authorised
// once the copy is final (spec-changes.md §2.1) — so the copy is unchanged and
// the testids are added alongside it, ready for that edit without needing one now.
const Layout = ({testId: cypressId, children}: LayoutProps) => {
  return (<div data-testid={`page-${cypressId}`} className="min-h-screen bg-bg text-text">
    <header className="border-b border-border bg-surface">
      <nav className="flex items-center gap-1 px-4 py-2">
        <img width="106" height="40" className="mr-4" src="/logo-with-text.svg" alt="vTally" />
        <RouterLink data-testid="nav-tallies" className={navLinkClass} to="/">Tallies</RouterLink>
        <RouterLink data-testid="nav-configuration" className={navLinkClass} to="/config">Configuration</RouterLink>
        <RouterLink data-testid="nav-flash" className={navLinkClass} to="/flasher">Flash</RouterLink>
      </nav>
    </header>
    { children && (<main className="px-4 pb-8 pt-4">{children}</main>) }
  </div>)
}

export default Layout;
