/// <reference types="Cypress" />
/// <reference types="../support" />

// The gap the locale pin opens (docs/design/i18n-plan.md §1.3/§1.4).
//
// cypress/support/e2e.ts forces `vtally.lang=en` before every visit, so that
// the app's default could become Korean without touching any of the 22 existing
// text assertions. The cost is that the rest of the suite now never exercises
// the SHIPPING default — it tests a language the operator will not see first.
// This spec is that coverage, and it is the only reason the pin is an
// acceptable trade rather than a hole.
//
// It opts out of the pin via `Cypress.env('i18nUnpinned')` rather than trying
// to register a later `window:before:load` handler: handler order is an
// implementation detail and this is not.
//
// Everything here asserts through `data-testid` or `<html lang>`, EXCEPT the
// deliberate Korean-copy assertion in the last test — the whole point of which
// is that real Korean reaches the DOM.

const KO_TALLIES = '탈리'
const EN_TALLIES = 'Tallies'

/** Visit with a stubbed browser language and no stored preference, i.e. exactly
 *  what a first-time visitor gets. */
const visitFresh = (browserLang: string) => {
  cy.visit('/', {
    onBeforeLoad(win) {
      win.localStorage.removeItem('vtally.lang')
      Object.defineProperty(win.navigator, 'language', {
        value: browserLang,
        configurable: true,
      })
    },
  })
}

describe('Localisation', () => {
  before(() => {
    Cypress.env('i18nUnpinned', true)
  })

  after(() => {
    // Belt and braces: Cypress.env writes are scoped to this spec file, but
    // leaving the suite's locale pin disabled would be a spectacular way to
    // break every other spec if that ever stopped being true.
    Cypress.env('i18nUnpinned', false)
  })

  it('defaults to Korean for a Korean browser with no stored preference', () => {
    visitFresh('ko-KR')
    cy.getTestId('page-index')

    cy.get('html').should('have.attr', 'lang', 'ko')
    cy.getTestId('nav-language').should('have.attr', 'data-lang', 'ko')
  })

  it('defaults to Korean for a browser that asks for neither language', () => {
    // Korean is the default, not merely the Korean-browser choice: anything
    // that is not explicitly English lands on Korean.
    visitFresh('de-DE')
    cy.getTestId('page-index')

    cy.get('html').should('have.attr', 'lang', 'ko')
    cy.getTestId('nav-language').should('have.attr', 'data-lang', 'ko')
  })

  it('detects English from the browser', () => {
    visitFresh('en-GB')
    cy.getTestId('page-index')

    cy.get('html').should('have.attr', 'lang', 'en')
    cy.getTestId('nav-language').should('have.attr', 'data-lang', 'en')
    cy.getTestId('nav-tallies').should('have.text', EN_TALLIES)
  })

  it('switches language and remembers the choice across a reload', () => {
    visitFresh('ko-KR')
    cy.getTestId('page-index')
    cy.getTestId('nav-language').should('have.attr', 'data-lang', 'ko')

    cy.getTestId('nav-language').click()
    cy.getTestId('nav-language').should('have.attr', 'data-lang', 'en')
    cy.get('html').should('have.attr', 'lang', 'en')
    cy.getTestId('nav-tallies').should('have.text', EN_TALLIES)

    // The choice has to survive a reload, otherwise the switcher is a toy —
    // and a reload is exactly what the hub-disconnected banner asks for.
    cy.reload()
    cy.getTestId('page-index')
    cy.getTestId('nav-language').should('have.attr', 'data-lang', 'en')
    cy.get('html').should('have.attr', 'lang', 'en')
  })

  it('renders real Korean copy, not keys and not English', () => {
    // The assertion the rest of the suite structurally cannot make. A missing
    // key is a compile error rather than a runtime fallback (i18n-plan.md §2.2),
    // so this is guarding the wiring — that the Korean table is the one actually
    // reaching the DOM — not the table's completeness.
    visitFresh('ko-KR')
    cy.getTestId('page-index')

    cy.getTestId('nav-tallies').should('have.text', KO_TALLIES)
    cy.getTestId('nav-tallies').should('not.have.text', EN_TALLIES)
  })
})
