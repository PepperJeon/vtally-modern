/// <reference types="Cypress" />
/// <reference types="../support" />

// Gap closed (coverage-gaps.md #2): IndexPage.tsx renders an "Hub disconnected"
// <Alert> when useSocketInfo()'s isHubConnected flips false, but nothing in
// cypress/e2e/ ever drives that flag false. There is no source-level test hook
// for it (useSocket.ts always connects the real socket.io-client in a browser
// context, DisconnectedClientSideSocket.ts only exists for Jest), so this cuts
// the network for real via the Chrome DevTools Protocol.
//
// ASSUMPTION: `Cypress.automation('remote:debugger:protocol', ...)` only
// works on Chromium-family browsers (Chrome, Edge, Electron) — see README.md
// in this directory. Run with one of those; it is a no-op / errors under
// Firefox or WebKit.
//
// The banner itself has no data-testid (IndexPage.tsx line ~93, only reachable
// via cy.contains) — a `data-testid="hub-disconnected-banner"` on the <Alert>
// would make this more robust than text matching. Noted as owed, not added
// here (no source changes in this task).

const goOffline = () => cy.window().then(win => {
  return Cypress.automation('remote:debugger:protocol', {
    command: 'Network.emulateNetworkConditions',
    params: { offline: true, latency: 0, downloadThroughput: -1, uploadThroughput: -1 },
  })
})

const goOnline = () => cy.window().then(win => {
  return Cypress.automation('remote:debugger:protocol', {
    command: 'Network.emulateNetworkConditions',
    params: { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 },
  })
})

describe('Hub disconnected banner', () => {
  afterEach(() => {
    // best-effort: make sure a failed assertion mid-test doesn't leave the
    // browser offline for the next spec
    goOnline()
    // afterEach, not a .then() off the second test's assertion chain: if an
    // assertion throws, a chained .then() never runs and the mock tally
    // leaks onto the shared backend for the rest of the run. Harmless to
    // call for the first test too (no tally was ever created).
    cy.task('tallyCleanup')
  })

  it('appears when the hub connection is cut and disappears on reconnect', () => {
    cy.visit('/')
    cy.getTestId('page-index')
    cy.getTestId('hub-connected').contains('1')
    cy.contains('Hub disconnected').should('not.exist')

    goOffline()
    cy.getTestId('hub-connected').contains('0')
    cy.contains('Hub disconnected').should('exist')

    goOnline()
    cy.getTestId('hub-connected').contains('1')
    cy.contains('Hub disconnected').should('not.exist')
  })

  // UNRESOLVED (per team-lead): fails reproducibly. CDP's Network.emulateNetworkConditions
  // ('offline': true/false) doesn't reliably re-interrupt an already-established
  // socket.io WebSocket the second time it's used against the same page — root
  // cause not yet identified. Real finding, not noise; keep documented here for
  // Phase 3 rather than deleting the coverage.
  it.skip('keeps already-loaded tally data visible (stale, not blank) during the outage', () => {
    cy.visit('/')
    cy.getTestId('page-index')

    cy.task('tally', 'stale-during-outage').then(() => {
      cy.getTestId('tally-stale-during-outage').should('exist')

      goOffline()
      cy.contains('Hub disconnected').should('exist')
      // the row must still be there — the gap this guards against is the banner
      // implementation accidentally clearing tally state instead of just
      // overlaying a warning
      cy.getTestId('tally-stale-during-outage').should('exist')

      goOnline()
      cy.contains('Hub disconnected').should('not.exist')
    })
  })
})
