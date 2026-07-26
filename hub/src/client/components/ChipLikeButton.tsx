import React from 'react'

import { cn } from '@/lib/utils'

type ChipLikeButtonProps = {
  selected: boolean
} & React.ComponentProps<'button'>

// A pill-shaped toggle button. `data-selected` is a live contract
// (ui-contract.md §2.7) read by tally-settings.spec.ts and webtally.spec.ts.
//
// `type="button"` is load-bearing, not decoration: every instance renders inside
// a <form> (ColorSchemeSelector sits in the Tally Defaults form), and without it
// the browser default of `submit` turns "pick a colour scheme" into "save".
// MUI's Button set it for us.
function ChipLikeButton({selected, className, disabled, ...rest}: ChipLikeButtonProps) {
  return (
    <button
      type="button"
      data-selected={selected}
      disabled={disabled}
      className={cn(
        "inline-flex h-11 items-center whitespace-nowrap rounded-full border border-transparent px-4",
        "font-sans text-sm font-medium transition-colors duration-[var(--duration-fast)]",
        "focus-visible:shadow-focus focus-visible:outline-none",
        selected
          ? "bg-white text-n-950 hover:bg-n-100"
          : "bg-surface-hover text-text hover:bg-n-700",
        disabled && "cursor-not-allowed bg-n-600 text-text-disabled hover:bg-n-600",
        className
      )}
      {...rest}
    />
  )
}

export default ChipLikeButton
