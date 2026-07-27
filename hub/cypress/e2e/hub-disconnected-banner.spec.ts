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
// The banner now carries `data-testid="hub-disconnected-banner"` and this spec
// selects on it. The debt this pays off was real: the previous
// `cy.contains('Hub disconnected')` is case-sensitive and the banner renders
// its copy through `uppercase` in CSS, so the DOM text and the rendered text
// are not the same string. That worked only by accident of where the casing
// was applied.

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
    cy.getTestId('hub-disconnected-banner').should('not.exist')

    goOffline()
    cy.getTestId('hub-connected').contains('0')
    cy.getTestId('hub-disconnected-banner').should('exist')

    goOnline()
    cy.getTestId('hub-connected').contains('1')
    cy.getTestId('hub-disconnected-banner').should('not.exist')
  })

  // RESOLVED. This comment used to read "UNRESOLVED: fails reproducibly ...
  // CDP doesn't reliably re-interrupt an already-established socket.io
  // WebSocket the second time". That was one sample of a race being written
  // down as a reproducible property, and it pointed at the wrong subsystem —
  // which is the worse half of the mistake, because the next person would have
  // gone hunting in CDP.
  //
  // Neither test failed reproducibly and neither test's failure was about CDP.
  // Both shared one precondition — the app must be showing "hub connected"
  // before the outage is simulated — and `useSocketInfo()` only met it when it
  // won a startup race against the socket.io handshake. Whichever test
  // happened to lose it that run was the one that "failed reproducibly":
  // measured 2/2, 2/2, 1/2 across Electron runs, and under Chrome it was the
  // FIRST test that failed while this one passed. Cypress won the race by
  // ~12ms (subscribe 341ms, connect 353ms) because it proxies AUT traffic;
  // plain Chromium lost it by 45ms and stuck 8/8.
  //
  // Fixed in useSocketInfo.ts by re-reading socket.connected after
  // subscribing. Both tests are deterministic now — if either starts flaking
  // again, suspect that precondition first, not the CDP calls.
  it('keeps already-loaded tally data visible (stale, not blank) during the outage', () => {
    cy.visit('/')
    cy.getTestId('page-index')

    cy.task('tally', 'stale-during-outage').then(() => {
      cy.getTestId('tally-stale-during-outage').should('exist')

      goOffline()
      cy.getTestId('hub-disconnected-banner').should('exist')
      // the row must still be there — the gap this guards against is the banner
      // implementation accidentally clearing tally state instead of just
      // overlaying a warning
      cy.getTestId('tally-stale-during-outage').should('exist')

      goOnline()
      cy.getTestId('hub-disconnected-banner').should('not.exist')
    })
  })
})
