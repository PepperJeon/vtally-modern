// ***********************************************************
// This example support/index.js is processed and
// loaded automatically before your test files.
//
// This is a great place to put global configuration and
// behavior that modifies Cypress.
//
// You can change the location of this file or turn off
// automatically serving support files with the
// 'supportFile' configuration option.
//
// You can read more here:
// https://on.cypress.io/configuration
// ***********************************************************

// Import commands.js using ES2015 syntax:
import './commands'

// Alternatively you can use CommonJS syntax:
// require('./commands')

// The app's default language is Korean. Pinning the suite to English keeps
// every existing text assertion valid without editing a single spec —
// docs/design/i18n-plan.md §1.3, authorised in spec-changes.md §3.2.
//
// `window:before:load`, not a `beforeEach`: it fires on every cy.visit() before
// any app code runs, so it does not depend on the origin already being
// established or on what Cypress clears between tests.
//
// This writes the same localStorage key the in-app language switcher writes.
// There is deliberately no test-only branch in the application — if this key
// ever stops being how the app picks a language, this pin breaks loudly rather
// than silently testing the wrong thing.
//
// What this does NOT cover is the shipping default, since the suite now never
// sees it. cypress/e2e/i18n.spec.ts covers that gap and clears the key itself.
Cypress.on('window:before:load', win => {
  win.localStorage.setItem('vtally.lang', 'en')
})
