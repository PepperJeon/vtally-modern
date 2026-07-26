/// <reference types="Cypress" />
/// <reference types="../support" />

// Gap closed (coverage-gaps.md #1): the existing brightness/highlight assertions
// in webtally.spec.ts only read `data-brightness`/`data-color` off the root
// element. Those attributes are set from the exact same `brightness` variable
// the component uses to compute its own background colour — if the darken()
// call were deleted entirely while the attribute assignment survived, every
// existing assertion would still pass while the screen never actually dims.
//
// DESIGN CALL: relational assertion, not literal computed-style, not
// attribute-only. Comparing `getComputedStyle(...).backgroundColor` against a
// re-implementation of `darken(bgColor, 1 - brightness)` was rejected: it
// would just re-run the component's own math in the test, so a shared bug in
// the darken calculation (or its inputs) would compute the same wrong answer
// twice and still pass. Instead this pins the *relationship*: a tally dimmed
// to 25% brightness must render measurably darker (lower WCAG relative
// luminance) than the same tally at full brightness, and the highlight
// animation must actually alternate between rendered colours over time, not
// just report a static `data-color="highlight"`. Both survive a redesign
// that legitimately changes the exact colours used.
//
// WHAT THIS STILL CANNOT CATCH: it cannot verify which specific colours are
// used (that's still coverage-gaps.md's #1 attribute check, kept as-is
// upstream), and it cannot catch a brightness curve that is monotonic but
// miscalibrated (e.g. 25% rendering as 40% darker instead of 75% darker) —
// only that dimmer settings are darker than brighter ones, not by how much.

import { socket } from '../../src/client/hooks/useSocket'
import { TallyConfiguration } from '../../src/shared/tally/TallyConfiguration'
import randomTallyName from '../browserlib/randomTallyName'

function relativeLuminance(rgb: string): number {
  // WCAG relative luminance from an `rgb(r, g, b)` / `rgba(r, g, b, a)` computed-style string
  const [r, g, b] = rgb.match(/\d+/g).map(Number)
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

describe('Web Tally visible effect', () => {
  let createdTallies = []
  afterEach(() => {
    createdTallies.forEach(name => socket.emit('tally.remove', name, 'web'))
    createdTallies = []
  })

  it('renders measurably darker when dimmed than at full brightness', () => {
    const name = randomTallyName()
    createdTallies.push(name)
    socket.emit('tally.create', name)
    socket.emit('tally.patch', name, 'web', '1') // program, so it has a non-black background to dim

    cy.visit(`/tally/web-${name}`)
    cy.getTestId('page-tally-web').should('have.attr', 'data-brightness', '1')

    cy.getTestId('page-tally-web').then($el => {
      const fullBrightnessLuminance = relativeLuminance($el.css('background-color'))

      socket.emit('tally.settings', name, 'web', (() => {
        const config = new TallyConfiguration()
        config.setOperatorLightBrightness(25)
        return config.toJson()
      })())

      cy.getTestId('page-tally-web').should('have.attr', 'data-brightness', '0.25').then($dimmed => {
        const dimmedLuminance = relativeLuminance($dimmed.css('background-color'))
        expect(dimmedLuminance).to.be.lessThan(fullBrightnessLuminance)
      })
    })
  })

  it('highlight actually alternates rendered colours, not just its data-color attribute', () => {
    const name = randomTallyName()
    createdTallies.push(name)
    socket.emit('tally.create', name)
    socket.emit('tally.patch', name, 'web', '1')

    cy.visit(`/tally/web-${name}`)
    cy.getTestId('page-tally-web').then(() => {
      socket.emit('tally.highlight', name, 'web')
    })
    cy.getTestId('page-tally-web').should('have.attr', 'data-color', 'highlight')

    // the keyframe animation steps every 0.25s (see WebTallyPage.tsx); sample
    // across ~600ms so we straddle at least one full step regardless of when
    // the animation happened to start relative to this test.
    const samples: string[] = []
    const sample = () => cy.getTestId('page-tally-web').then($el => {
      samples.push($el.css('background-color'))
    })
    sample()
    cy.wait(150)
    sample()
    cy.wait(150)
    sample()
    cy.wait(150)
    sample().then(() => {
      expect(new Set(samples).size, `sampled colours: ${JSON.stringify(samples)}`).to.be.greaterThan(1)
    })
  })
})
