import React from 'react'

import { useT } from '../../i18n'

/** Indeterminate progress. CSS only — `animate-spin` plus a half-transparent
 *  border is the whole component, so there is no MUI `CircularProgress` and no
 *  SVG to keep on-palette. */
function Spinner() {
  const t = useT()
  return (
    <div
      role="progressbar"
      aria-label={t.common.loading}
      className="mx-auto block size-10 animate-spin rounded-full border-4 border-n-700 border-t-n-100"
    />
  )
}

export default Spinner
