import React, { useState } from 'react'
import { Slider as SliderPrimitive } from 'radix-ui'

import { cn } from '@/lib/utils'
import { useT } from '../../i18n'

type BrightnessSliderProps = {
  value: number|null
  testId: string
  onChange: (value: number) => void
  minValue?: number
  minMessage?: string
  disabled?: boolean
}

const marks = [0, 20, 40, 60, 80, 100]

/* design-components.md §3.2.
 *
 * `data-testid` on `Slider.Root`, matching MUI's placement — the specs reach the
 * thumb through it as `*[data-testid=x] *[role=slider]` and read `aria-valuenow`
 * (cypress/browserlib/sliderTestTool.ts). Radix's Thumb is that `role="slider"`
 * node and Radix's key handling (`event.key`: End / PageDown / ArrowLeft) is the
 * same shape MUI's was, so the helper needs no change — ui-contract Hazard H2 and
 * design-components §3.2 both describe that helper as driving *mouse* events,
 * which it has not done for some time.
 *
 * `minValue` clamps in `onValueChange`, not via `min`, so the track still spans
 * 0–100 and the operator can see there is a floor rather than a broken slider.
 */
function BrightnessSlider({value, testId, onChange, minValue = 0, minMessage, disabled = false}: BrightnessSliderProps) {
  const t = useT()
  const [dragging, setDragging] = useState(false)
  const [focused, setFocused] = useState(false)
  const v = value ?? 0
  const showBubble = dragging || focused

  return (
    <div className="pt-6">
      <SliderPrimitive.Root
        data-testid={testId}
        value={[v]}
        min={0}
        max={100}
        step={1}
        disabled={disabled}
        onValueChange={([next]) => onChange(Math.max(next, minValue))}
        onPointerDown={() => setDragging(true)}
        onPointerUp={() => setDragging(false)}
        className="relative flex h-5 w-full touch-none select-none items-center data-[disabled]:opacity-100"
      >
        <SliderPrimitive.Track className="relative h-1 w-full rounded-full bg-n-700 data-[disabled]:bg-n-800">
          <SliderPrimitive.Range className="absolute h-full rounded-full bg-n-100 data-[disabled]:bg-n-600" />
        </SliderPrimitive.Track>

        {marks.map(m => (
          <span
            key={m}
            aria-hidden
            style={{left: `${m}%`}}
            className="pointer-events-none absolute size-1 -translate-x-1/2 rounded-full bg-n-600"
          />
        ))}

        <SliderPrimitive.Thumb
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          aria-label={t.brightness.label}
          aria-valuetext={t.brightness.valueText(v)}
          className={cn(
            "relative block size-5 rounded-full bg-white",
            "focus-visible:shadow-focus focus-visible:outline-none",
            "data-[disabled]:bg-n-500",
            "after:absolute after:-inset-3 after:content-['']"
          )}
        >
          <span
            aria-hidden
            className={cn(
              "pointer-events-none absolute bottom-7 left-1/2 -translate-x-1/2 whitespace-nowrap",
              "rounded-sm bg-n-700 px-2 py-0.5 text-xs font-semibold tabular-nums text-text",
              "transition-opacity duration-[var(--duration-fast)]",
              showBubble ? "opacity-100" : "opacity-0"
            )}
          >
            {t.brightness.bubble(v)}
          </span>
        </SliderPrimitive.Thumb>
      </SliderPrimitive.Root>

      {minMessage && focused && v === minValue && (
        <p className="mt-1 text-sm text-text-muted">{minMessage}</p>
      )}
    </div>
  )
}

export default BrightnessSlider
