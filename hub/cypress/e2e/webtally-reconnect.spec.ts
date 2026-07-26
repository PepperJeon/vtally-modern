/// <reference types="Cypress" />
/// <reference types="../support" />

// Gap closed (coverage-gaps.md #3): webtally.spec.ts has two named, empty
// it.skip stubs — "reconnects when its connection is cut" and "indicates
// when connection to server is broken" — adopted here.
//
// SCOPE NOTE: smoke.spec.ts's third skip stub, "should instantly show the
// correct state when the server crashes and is restarted", is about
// restarting the whole hub *process*, not cutting the browser's network. No
// task in cypress/plugins/tally.ts (or elsewhere) can kill/restart the hub
// server the way tallyKill kills a mock tally — there is no test hook for it.
// Writing that sub-case would mean inventing infrastructure this task wasn't
// asked to build. Dropping it from this file rather than faking coverage;
// it stays an open gap (its it.skip stub is untouched) until a hub-restart
// task exists.
//
// GAP-DOCUMENTING TEST, NOT A GAP-CLOSING ONE: "indicates when connection to
// server is broken" is scoped to *pin the current behaviour*, not assert a
// real indicator, because there isn't one yet. WebTallyPage.tsx's
// useWebTally().onDisconnect clears `tally`/`command` and sets
// `isValid = true` — which lands on the exact same isLoading branch
// (data-color="loading") as the pre-first-payload state. A user staring at a
// tally that's been disconnected for an hour sees the same screen as one
// that's still booting. This test asserts that (today-correct) fact so a
// future redesign has to touch this spec, rather than silently landing a fix
// with no test noticing either the old or the new behaviour.
//
// ATTRIBUTE OWED: a `data-color="disconnected"` value (or a separate
// `data-connected="false"` attribute) on #page-tally-web, set from
// useWebTally().isHubConnected (or equivalent) rather than folded into the
// loading branch. Once that lands, replace the "still says loading"
// assertion below with a "says disconnected" assertion — the redesign
// should touch this spec, that's the point of it existing.

import { socket } from '../../src/client/hooks/useSocket'
import randomTallyName from '../browserlib/randomTallyName'

const goOffline = () => Cypress.automation('remote:debugger:protocol', {
  command: 'Network.emulateNetworkConditions',
  params: { offline: true, latency: 0, downloadThroughput: -1, uploadThroughput: -1 },
})

const goOnline = () => Cypress.automation('remote:debugger:protocol', {
  command: 'Network.emulateNetworkConditions',
  params: { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 },
})

describe('Web Tally reconnect', () => {
  let createdTallies = []
  afterEach(() => {
    createdTallies.forEach(name => socket.emit('tally.remove', name, 'web'))
    createdTallies = []
    goOnline()
  })

  it('reconnects when its connection is cut and picks the live tally state back up', () => {
    const name = randomTallyName()
    createdTallies.push(name)
    socket.emit('tally.create', name)
    socket.emit('tally.patch', name, 'web', '1')

    cy.visit(`/tally/web-${name}`)
    cy.getTestId('page-tally-web').should('have.attr', 'data-color', 'program')

    goOffline()
    // socket.io's own reconnect logic needs a moment to notice the transport died
    cy.wait(500)

    goOnline()
    // it must come back on its own — no reload, no user action
    cy.getTestId('page-tally-web').should('have.attr', 'data-color', 'program')

    // and it must still be *live*, not a stale snapshot from before the cut
    socket.emit('tally.patch', name, 'web', '0')
    cy.getTestId('page-tally-web').should('have.attr', 'data-color', 'preview')
  })

  it('currently shows the same "loading" state whether it never connected or lost connection — documents the gap, does not invent an indicator', () => {
    const name = randomTallyName()
    createdTallies.push(name)
    socket.emit('tally.create', name)
    socket.emit('tally.patch', name, 'web', '1')

    cy.visit(`/tally/web-${name}`)
    cy.getTestId('page-tally-web').should('have.attr', 'data-color', 'program')

    goOffline()
    // as of today there is no dedicated "disconnected" indicator: onDisconnect
    // clears the tally and falls onto the same branch as pre-first-payload.
    // this assertion should FAIL the moment that gets fixed — that's the point.
    cy.getTestId('page-tally-web').should('have.attr', 'data-color', 'loading')

    goOnline()
    cy.getTestId('page-tally-web').should('have.attr', 'data-color', 'program')
  })
})
