/**
 * sRGB colour maths — the replacement for MUI v4's `darken()`, `fade()` and
 * `getContrastText()`, which `WebTallyPage.tsx` uses as *logic*, not styling.
 *
 * Spec: docs/design/design-components.md §4.
 *
 * Why this cannot be a Tailwind class: the input colour is an arbitrary
 * `rgb()` string produced at runtime by `shared/tally/ColorScheme.ts`, dimmed
 * by a user-set brightness. There is no utility class for "40% of a colour
 * nobody knows until the socket delivers it".
 *
 * Pure. No React, no DOM, no node builtins — it lives in src/shared so both
 * halves may use it and neither can drag anything into the client bundle.
 */

type Rgb = { r: number; g: number; b: number }

/** Parse `#rgb` | `#rrggbb` | `rgb(r, g, b)` | `rgba(r, g, b, a)`. Throws otherwise. */
export function parseColor(input: string): Rgb {
  const s = input.trim()
  if (s[0] === '#') {
    const h =
      s.length === 4 ? s[1] + s[1] + s[2] + s[2] + s[3] + s[3] : s.slice(1, 7)
    const n = parseInt(h, 16)
    if (h.length !== 6 || !/^[0-9a-f]{6}$/i.test(h) || Number.isNaN(n)) {
      throw new Error(`bad color: ${input}`)
    }
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 }
  }
  const m = s.match(/^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/i)
  if (!m) throw new Error(`bad color: ${input}`)
  return { r: +m[1], g: +m[2], b: +m[3] }
}

const clamp255 = (n: number) => Math.min(255, Math.max(0, Math.round(n)))
const clamp01 = (n: number) => Math.min(1, Math.max(0, n))

/**
 * Multiply each sRGB channel by `factor` (0 = black, 1 = unchanged).
 *
 * Replaces `darken(color, 1 - brightness)`. The signature is inverted on
 * purpose: every call site passes `1 - brightness`, a double negative around a
 * value that is already a 0–1 brightness fraction. `dim(bg, brightness)` says
 * it once.
 *
 * The multiply is in sRGB space, *not* linear light. That is not an oversight
 * and must not be "corrected": it matches both MUI v4's `darken` (which scales
 * raw channel values) and, more importantly, what the firmware does to the
 * lamp — scale the PWM duty cycle per channel. Converting to linear here would
 * make the on-screen preview disagree with the hardware it is previewing.
 */
export function dim(color: string, factor: number): string {
  const { r, g, b } = parseColor(color)
  const f = clamp01(factor)
  return `rgb(${clamp255(r * f)}, ${clamp255(g * f)}, ${clamp255(b * f)})`
}

/** Same colour at a given alpha. Direct replacement for MUI's `fade`. */
export function fade(color: string, alpha: number): string {
  const { r, g, b } = parseColor(color)
  return `rgba(${r}, ${g}, ${b}, ${clamp01(alpha)})`
}

/** WCAG 2.1 relative luminance, 0 (black) – 1 (white). */
export function luminance(color: string): number {
  const { r, g, b } = parseColor(color)
  const ch = (v: number) => {
    const c = v / 255
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
  }
  return 0.2126 * ch(r) + 0.7152 * ch(g) + 0.0722 * ch(b)
}

/** WCAG contrast ratio between two colours, 1:1 – 21:1. */
export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

/**
 * The crossover luminance where black and white give equal contrast:
 * solve (L + 0.05)/0.05 = 1.05/(L + 0.05)  →  L = √(1.05 × 0.05) − 0.05.
 * Above it black wins, below it white wins. Hardcoded so `contrastText` does
 * not compute two ratios on every render.
 */
const CONTRAST_CROSSOVER = Math.sqrt(1.05 * 0.05) - 0.05 // 0.1791

/**
 * Black or white — whichever genuinely has more contrast against `background`.
 *
 * Uses WCAG relative luminance, *not* a naive `(r+g+b)/3` or the YIQ
 * `(299r+587g+114b)/1000` brightness. Both under-weight green catastrophically
 * for this palette: naive brightness on `rgb(0,255,0)` (the preview LED) reads
 * 85/255 → "dark" → white text at a real 1.37:1, which is invisible. WCAG
 * luminance reads 0.715 → black text at 15.30:1. This decides whether an
 * operator can read a full-screen tally at three metres.
 *
 * Deliberately diverges from MUI's `getContrastText`, which returns white
 * unless white drops below a contrastThreshold of 3 — putting its crossover at
 * L = 0.3 and picking white across the whole 0.1791–0.3 band where black is
 * measurably better. That band contains `rgb(255,0,0)`, the on-air LED: MUI
 * gives white-on-red at 4.00:1, this gives black-on-red at 5.25:1. The change
 * is visible and it is the one design-tokens.md §2.2 already mandates ("text
 * on a coloured fill is always --color-n-950, never white").
 *
 * Returns `#0B0E11` (--color-n-950) rather than `#000`: pure black beside a
 * bright fill blooms in a dark room, and the ratio cost is under 0.1 points.
 */
export function contrastText(background: string): '#0B0E11' | '#FFFFFF' {
  return luminance(background) > CONTRAST_CROSSOVER ? '#0B0E11' : '#FFFFFF'
}
