import React from 'react'
import ColorSchemes, { ColorSchemeId } from '../../../shared/tally/ColorScheme'
import ChipLikeButton from '../ChipLikeButton'

type ColorSchemeSelectorProps = {
  value: ColorSchemeId
  onChange: (value: ColorSchemeId) => void
  disabled?: boolean
  testId: string
}

/* Contract (ui-contract.md §2.3): `data-value` carries the *selector's current
 * value* — on the root div AND, repeated, on every option button. Not the
 * option's own id. configTally.spec.ts reads it off the root; tally-settings
 * reads `data-selected` off the buttons. */
function ColorSchemeSelector({value, onChange, disabled, testId}: ColorSchemeSelectorProps) {
  const schemes = ColorSchemes.getAll()
  const selectedScheme = value !== undefined ? ColorSchemes.getById(value) : undefined

  return (
    <div data-testid={testId} data-value={value}>
      <div className="flex flex-wrap items-center gap-2">
        {schemes.map(scheme => (
          <ChipLikeButton
            data-testid={`${testId}-${scheme.id}`}
            data-value={value}
            selected={scheme.id === value}
            onClick={() => {onChange(scheme.id)}}
            disabled={disabled}
            key={scheme.id}
          >
            {/* The swatches are the exact LED rgb() the lamp will emit
              * (design-tokens.md §2.3) — hardware truth, never restyled. */}
            <span aria-hidden className="mr-2 inline-flex overflow-hidden rounded-xs border border-border">
              <span className="size-3.5" style={{backgroundColor: scheme.program.toCss()}} />
              <span className="size-3.5" style={{backgroundColor: scheme.preview.toCss()}} />
            </span>
            {scheme.name}
          </ChipLikeButton>
        ))}
      </div>
      { selectedScheme && selectedScheme.description && (
        <p className="mt-1 text-2xs text-text-muted">{selectedScheme.description}</p>
      )}
    </div>
  )
}

export default ColorSchemeSelector
