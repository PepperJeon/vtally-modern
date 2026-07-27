import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

/**
 * shadcn/ui's class-name helper: `clsx` for conditionals, `twMerge` to make
 * the last conflicting Tailwind utility win (so a caller's `className` can
 * override a component's defaults instead of losing to source order).
 *
 * Every generated component in components/ui/ imports this by name from
 * '@/lib/utils'. It is not optional and must not be renamed.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * The Latin small-caps emphasis pair, disabled under Korean.
 *
 * Hangul has no letter case, so `uppercase` is a silent no-op on it — the text
 * does not break, it just stops standing out, and the visual hierarchy the
 * design relies on disappears without any visible symptom. `tracking-wide` is
 * worse than a no-op: letter-spacing pulls Hangul syllable blocks apart and
 * reads as broken typesetting rather than emphasis.
 *
 * `:lang(ko)` matches on the inherited `lang` attribute, which `setLanguage()`
 * keeps on <html>. Emphasis under Korean is carried by weight and size, which
 * every one of these call sites already sets.
 *
 * See docs/design/i18n-plan.md §6.1 and §6.2.
 */
export const latinCaps =
  "uppercase tracking-wide [&:lang(ko)]:normal-case [&:lang(ko)]:tracking-normal"
