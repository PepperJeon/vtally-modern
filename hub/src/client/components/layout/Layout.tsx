import React from 'react'
import { Link as RouterLink } from 'react-router-dom'

import { setLanguage, useLang, useT } from '../../i18n'
import en from '../../i18n/en'
import ko from '../../i18n/ko'

type LayoutProps = {
  testId: string // this makes it easy in cypress to determine on which page we are
  children?: React.ReactNode
}

const navLinkClass =
  "inline-flex h-11 items-center rounded-sm px-3 font-sans text-base font-medium text-text no-underline " +
  "transition-colors duration-[var(--duration-fast)] hover:bg-surface-hover " +
  "focus-visible:shadow-focus focus-visible:outline-none"

/**
 * The nav labels carry `data-testid`s alongside the copy. smoke.spec.ts still
 * navigates by text (`cy.contains("Configuration")`), and that spec edit is only
 * pre-authorised once the copy is final (spec-changes.md §2.1) — so the English
 * copy is unchanged and the testids sit beside it, ready for that edit without
 * needing one now. The locale pin (i18n-plan.md §1.3) keeps the suite on English,
 * so translating these does not touch that spec either.
 *
 * The language toggle lives here, not on /config: there is no settings page, and
 * /config is mixer configuration that a phone acting as a web tally never opens.
 * Layout is on every route. It shows the language you would switch TO, so the
 * button says what pressing it does.
 */
const Layout = ({testId: cypressId, children}: LayoutProps) => {
  const t = useT()
  const lang = useLang()
  const other = lang === 'ko' ? 'en' : 'ko'

  return (<div data-testid={`page-${cypressId}`} className="min-h-screen bg-bg text-text">
    <header className="border-b border-border bg-surface">
      <nav className="flex items-center gap-1 px-4 py-2">
        <img width="106" height="40" className="mr-4" src="/logo-with-text.svg" alt={t.nav.logoAlt} />
        <RouterLink data-testid="nav-tallies" className={navLinkClass} to="/">{t.nav.tallies}</RouterLink>
        <RouterLink data-testid="nav-configuration" className={navLinkClass} to="/config">{t.nav.configuration}</RouterLink>
        <RouterLink data-testid="nav-flash" className={navLinkClass} to="/flasher">{t.nav.flash}</RouterLink>
        <button
          type="button"
          data-testid="nav-language"
          data-lang={lang}
          lang={other}
          aria-label={t.nav.language}
          onClick={() => setLanguage(other)}
          className="ml-auto inline-flex h-11 items-center rounded-sm border border-border px-3 font-sans text-sm font-medium text-text-muted transition-colors duration-[var(--duration-fast)] hover:bg-surface-hover hover:text-text focus-visible:shadow-focus focus-visible:outline-none"
        >{(other === 'ko' ? ko : en).nav.languageName}</button>
      </nav>
    </header>
    { children && (<main className="px-4 pb-8 pt-4">{children}</main>) }
  </div>)
}

export default Layout;
