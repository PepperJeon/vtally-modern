/// <reference types="Cypress" />
/// <reference types="../support" />

// Gap closed (coverage-gaps.md #5): tally.spec.ts's it.skip('can remove a
// tally') stub, adopted here. Server-side behaviour is already correct —
// plugins/tally.ts's tallyKill task calls the same
// socket.emit('tally.remove', ...) TallyMenu.tsx's handleRemoveTally does —
// this is a pure test-authoring gap, not a suspected bug.
//
// FLAKINESS NOTE (per team-lead): tally-settings.spec.ts is flaky because it
// reads cy.task('tallyLastCommand', ...) exactly once with no retry, racing
// the browser -> socket.io -> hub -> UDP round trip. Every state read below
// that depends on that same round trip (the menu's disabled state, the row
// disappearing) goes through cy.getTestId(...).should(...), which Cypress
// retries automatically until it passes or times out — no bare synchronous
// task read is used to observe post-action state.

import randomTallyName from '../browserlib/randomTallyName'
import { socket } from '../../src/client/hooks/useSocket'

describe('Tally remove', () => {
  it('removes a disconnected tally, but the menu item stays disabled while still connected', () => {
    const name = randomTallyName()

    cy.task('tally', name).then(() => {
      cy.visit('/')
      cy.getTestId('page-index')
      cy.getTestId(`tally-${name}-menu`).find('button').click()

      // still connected: remove must be disabled (TallyMenu.tsx: allowRemove = !tally.isConnected())
      cy.getTestId(`tally-${name}-remove`).find('.MuiMenuItem-root').should('have.class', 'Mui-disabled')

      // close the menu before disconnecting, then disconnect the mock tally
      cy.get('body').type('{esc}')
      cy.task('tallyDisconnect', name)

      cy.getTestId(`tally-${name}-menu`).find('button').click()
      cy.getTestId(`tally-${name}-remove`).find('.MuiMenuItem-root').should('not.have.class', 'Mui-disabled')

      cy.getTestId(`tally-${name}-remove`).find('.MuiMenuItem-root').click()
      cy.getTestId(`tally-${name}-menu`).should('not.exist')
    }).then(() => {
      cy.task('tallyCleanup')
    })
  })

  it('removes a web tally the same way — no UDP mock, no isConnected gate to wait on', () => {
    const name = randomTallyName()
    socket.emit('tally.create', name)
    socket.emit('tally.remove', 'not-this-one', 'web') // no-op sanity: removing an unrelated name doesn't affect ours

    cy.visit('/')
    cy.getTestId('page-index')
    cy.getTestId(`tally-${name}-menu`).find('button').click()
    cy.getTestId(`tally-${name}-remove`).find('.MuiMenuItem-root').should('not.have.class', 'Mui-disabled')
    cy.getTestId(`tally-${name}-remove`).find('.MuiMenuItem-root').click()

    cy.getTestId(`tally-${name}-menu`).should('not.exist')
  })
})
