import {
  parseColor,
  dim,
  fade,
  luminance,
  contrastRatio,
  contrastText,
} from './color'

// Every LED colour ColorScheme.ts can actually emit, plus the two UI fills that
// text ever lands on. If a case below is not in this list it is decoration and
// does not need a test.
const LED = {
  program: 'rgb(255, 0, 0)',
  preview: 'rgb(0, 255, 0)',
  highlight: 'rgb(255, 255, 255)',
  unknown: 'rgb(0, 0, 255)',
  idle: 'rgb(0, 1, 0)',
  ypProgram: 'rgb(255, 255, 0)',
  ypPreview: 'rgb(255, 0, 255)',
}

describe('parseColor', () => {
  it('parses the four accepted notations to the same value', () => {
    expect(parseColor('#f00')).toEqual({ r: 255, g: 0, b: 0 })
    expect(parseColor('#FF0000')).toEqual({ r: 255, g: 0, b: 0 })
    expect(parseColor('rgb(255, 0, 0)')).toEqual({ r: 255, g: 0, b: 0 })
    expect(parseColor('rgba(255, 0, 0, 0.5)')).toEqual({ r: 255, g: 0, b: 0 })
  })

  it('tolerates the whitespace and separator variants CSS allows', () => {
    expect(parseColor('  rgb(0 1 0)  ')).toEqual({ r: 0, g: 1, b: 0 })
    expect(parseColor('RGB(1,2,3)')).toEqual({ r: 1, g: 2, b: 3 })
  })

  it('throws rather than guessing', () => {
    // Silent fallback here would paint a tally the wrong colour and nobody
    // would find out until it was on air.
    expect(() => parseColor('red')).toThrow(/bad color/)
    expect(() => parseColor('#12345')).toThrow(/bad color/)
    expect(() => parseColor('#gggggg')).toThrow(/bad color/)
    expect(() => parseColor('')).toThrow(/bad color/)
  })
})

describe('dim', () => {
  it('scales each sRGB channel by the factor', () => {
    expect(dim('rgb(255, 0, 0)', 0.5)).toBe('rgb(128, 0, 0)')
    expect(dim('#ff0000', 1)).toBe('rgb(255, 0, 0)')
    expect(dim('rgb(200, 100, 50)', 0.5)).toBe('rgb(100, 50, 25)')
  })

  it('leaves the idle LED off', () => {
    // rgb(0,1,0) is "effectively off" (design-tokens.md §2.3). Rounding takes
    // it to pure black below factor 0.5, which is the honest render.
    expect(dim(LED.idle, 0.25)).toBe('rgb(0, 0, 0)')
    expect(dim(LED.idle, 0)).toBe('rgb(0, 0, 0)')
  })

  it('clamps the factor to 0–1 instead of over/under-driving', () => {
    expect(dim('rgb(255, 0, 0)', 5)).toBe('rgb(255, 0, 0)')
    expect(dim('rgb(255, 0, 0)', -1)).toBe('rgb(0, 0, 0)')
  })

  it('dims in sRGB space, matching the firmware PWM scaling', () => {
    // A linear-light implementation would return rgb(186, 0, 0) here. If this
    // ever goes green with 186, someone "corrected" the colour science and the
    // screen preview no longer agrees with the lamp. See color.ts.
    expect(dim('rgb(255, 0, 0)', 0.5)).not.toBe('rgb(186, 0, 0)')
  })
})

describe('fade', () => {
  it('reformats to rgba at the given alpha', () => {
    expect(fade('#fff', 0.7)).toBe('rgba(255, 255, 255, 0.7)')
    expect(fade('rgb(0, 1, 0)', 1)).toBe('rgba(0, 1, 0, 1)')
  })

  it('clamps alpha to 0–1', () => {
    expect(fade('#fff', 2)).toBe('rgba(255, 255, 255, 1)')
    expect(fade('#fff', -2)).toBe('rgba(255, 255, 255, 0)')
  })
})

describe('luminance', () => {
  it('anchors at the WCAG endpoints', () => {
    expect(luminance('#000')).toBeCloseTo(0, 5)
    expect(luminance('#fff')).toBeCloseTo(1, 5)
  })

  it('uses the WCAG channel weights, not an average', () => {
    // The whole point: green carries 0.7152 of the weight, blue only 0.0722.
    expect(luminance(LED.preview)).toBeCloseTo(0.7152, 4)
    expect(luminance(LED.program)).toBeCloseTo(0.2126, 4)
    expect(luminance(LED.unknown)).toBeCloseTo(0.0722, 4)
  })

  it('applies the piecewise transfer function on both sides of 0.03928', () => {
    // Below the knee it is a plain /12.92 divide; above it, the 2.4 power
    // curve. Getting the branch backwards is the classic bug here.
    expect(luminance('rgb(8, 8, 8)')).toBeCloseTo((8 / 255) / 12.92, 6)
    expect(luminance('rgb(128, 128, 128)')).toBeCloseTo(0.2159, 3)
  })
})

describe('contrastRatio', () => {
  it('spans 1:1 to 21:1 and is order-independent', () => {
    expect(contrastRatio('#fff', '#000')).toBeCloseTo(21, 2)
    expect(contrastRatio('#000', '#fff')).toBeCloseTo(21, 2)
    expect(contrastRatio('#888', '#888')).toBeCloseTo(1, 5)
  })

  it('reproduces the ratios design-tokens.md §3.2 publishes', () => {
    // If a token value is ever edited, these fail — which is the point.
    // NOTE: §3.2 prints 15.84 for this pair. Measured is 15.70. Every other
    // ratio in the table reproduces exactly (including #FFFFFF/#0B0E11 =
    // 19.35, which pins the luminance model as identical), so this is a single
    // arithmetic slip in that one row, not a disagreement about the formula
    // and not a reason to change either token. Both values are AAA; nothing
    // downstream depends on the difference.
    expect(contrastRatio('#E3E8ED', '#0B0E11')).toBeCloseTo(15.7, 1) // text on bg
    expect(contrastRatio('#FFFFFF', '#0B0E11')).toBeCloseTo(19.35, 1) // highlight on bg
    expect(contrastRatio('#FF3B30', '#0B0E11')).toBeCloseTo(5.46, 1) // live on bg
    expect(contrastRatio('#FF3B30', '#1E242B')).toBeCloseTo(4.41, 1) // live on card — fails AA body
    expect(contrastRatio('#FF6257', '#1E242B')).toBeCloseTo(5.32, 1) // live-text on card — passes
    expect(contrastRatio('#34D07A', '#0B0E11')).toBeCloseTo(9.63, 1) // preview on bg
    expect(contrastRatio('#4C8DFF', '#0B0E11')).toBeCloseTo(6.05, 1) // unpatched on bg
    expect(contrastRatio('#FFB020', '#0B0E11')).toBeCloseTo(10.58, 1) // missing on bg
    expect(contrastRatio('#6B7787', '#0B0E11')).toBeCloseTo(4.25, 1) // idle — UI only
  })
})

describe('contrastText', () => {
  it('picks black on the green LED, where naive brightness picks white', () => {
    // The trap this function exists to avoid: YIQ/mean brightness reads
    // rgb(0,255,0) as 85/255 → "dark" → white text at 1.37:1, invisible.
    expect(contrastText(LED.preview)).toBe('#0B0E11')
    // 14.10:1, not the 15.30:1 quoted in design-components.md §4 — that figure
    // is for pure #000, and this returns #0B0E11 on purpose (§4's own closing
    // paragraph). §4 also claims the gap is "under 0.1 of a ratio point"; on
    // this background it is 1.2. The choice of colour is unaffected, and the
    // deliberate near-black is worth 1.2 points of headroom at 14:1.
    expect(contrastRatio(contrastText(LED.preview), LED.preview)).toBeGreaterThan(14)
  })

  it('diverges from MUI on the on-air red, in the readable direction', () => {
    // MUI's getContrastText returns white here (4.00:1). Black is 5.25:1.
    expect(contrastText(LED.program)).toBe('#0B0E11')
    expect(contrastRatio('#0B0E11', LED.program)).toBeGreaterThan(
      contrastRatio('#FFFFFF', LED.program),
    )
  })

  it('still picks white where white genuinely wins', () => {
    expect(contrastText(LED.unknown)).toBe('#FFFFFF')
    expect(contrastText('#000')).toBe('#FFFFFF')
    expect(contrastText('rgb(0, 0, 0)')).toBe('#FFFFFF')
  })

  it('covers every LED colour the hardware can emit', () => {
    expect(contrastText(LED.highlight)).toBe('#0B0E11')
    expect(contrastText(LED.idle)).toBe('#FFFFFF')
    expect(contrastText(LED.ypProgram)).toBe('#0B0E11')
    expect(contrastText(LED.ypPreview)).toBe('#0B0E11')
  })

  it('always returns the more readable of the two, at every brightness', () => {
    // The real call shape: an arbitrary LED colour dimmed by an operator's
    // brightness slider, then asked for its text colour. Whatever comes back
    // must be the better choice — never merely a plausible one.
    for (const base of Object.values(LED)) {
      for (const brightness of [0, 0.1, 0.25, 0.5, 0.75, 0.9, 1]) {
        const bg = dim(base, brightness)
        const picked = contrastText(bg)
        const other = picked === '#FFFFFF' ? '#0B0E11' : '#FFFFFF'
        expect(contrastRatio(picked, bg)).toBeGreaterThanOrEqual(
          contrastRatio(other, bg),
        )
      }
    }
  })
})
