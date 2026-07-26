/// <reference types="Cypress" />
/// <reference types="../support" />

// Gap closed (coverage-gaps.md #4): every dialog's Cancel/close path is
// untested — existing specs only exercise the "fill in the form and submit"
// happy path. A Cancel button that silently persists (or a dialog that
// applies edits live instead of on submit) would pass every existing spec.
//
// Two dialogs, confirmed from source:
// - TallyCreatePopup (TallyCreate.tsx): tally-create-cancel button. Cancel
//   must close the dialog AND must not create a tally.
// - TallySettings (via FormDialog.tsx): FormDialog always renders a
//   `${testId}-close` button, so for tally-settings that's
//   tally-settings-close. Cancel must close the dialog AND must discard any
//   in-progress edits — checked via tally-settings-oi's data-value attribute,
//   which reflects the currently *effective* (saved) setting, not whatever
//   is mid-edit in the form.
//
// WHAT THIS DOES NOT COVER: FormDialog's title-bar "X" IconButton
// (aria-label="Close Dialog") has no data-testid, so it isn't exercised here
// — it shares the same onClose handler as the Cancel button per
// FormDialog.tsx, so covering Cancel covers the same code path. Not adding a
// new data-testid for it since the coverage would be redundant, not new.

import randomTallyName from '../browserlib/randomTallyName'

describe('Dialog cancel / close paths', () => {
  describe('TallyCreatePopup', () => {
    it('closes without creating a tally when Cancel is clicked', () => {
      cy.visit('/')
      cy.getTestId('page-index')
      cy.getTestId('tally-create').click()
      cy.getTestId('tally-create-popup').should('be.visible')

      const name = randomTallyName()
      cy.getTestId('tally-create-name').type(name)
      cy.getTestId('tally-create-cancel').click()

      cy.getTestId('tally-create-popup').should('not.exist')
      cy.getTestId(`tally-${name}-menu`).should('not.exist')
    })
  })

  describe('TallySettings', () => {
    afterEach(() => {
      // afterEach, not a .then() off the assertion chain below: if an
      // assertion throws, a chained .then() never runs and the mock tally
      // leaks onto the shared backend for the rest of the run.
      cy.task('tallyCleanup')
    })

    // UNRESOLVED (per team-lead): fails reproducibly on a second open cycle.
    // MUI's popover doesn't survive the settings dialog being reopened after
    // Cancel — root cause not yet identified. Real finding, not noise; keep
    // documented here for Phase 3 rather than deleting the coverage.
    it('closes without saving edits when Cancel is clicked', () => {
      const name = randomTallyName()
      cy.task('tally', name).then(() => {
        cy.visit('/')
        cy.getTestId('page-index')
        cy.getTestId(`tally-${name}-settings`).click()
        cy.getTestId('tally-settings').should('be.visible')

        cy.getTestId('tally-settings-oi').then($checkbox => {
          const originalValue = $checkbox.attr('data-value')

          cy.getTestId('tally-settings-oi').click()
          cy.getTestId('tally-settings-close').click()
          cy.getTestId('tally-settings').should('not.exist')

          // re-open and confirm the toggle didn't stick
          cy.getTestId(`tally-${name}-settings`).click()
          cy.getTestId('tally-settings-oi').should('have.attr', 'data-value', originalValue)
          cy.getTestId('tally-settings-close').click()
        })
      })
    })
  })
})
