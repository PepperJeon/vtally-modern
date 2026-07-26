import React from 'react'
import { Check, CircleDashed, X } from 'lucide-react'

export type StepType = {
  id: string
  label: string
  done: boolean
  active: boolean
  current?: number
  max?: number
  error: boolean
  skipped: boolean
}

type StepState = "error" | "complete" | "active" | "skipped" | "pending"

// Mirrors the old icon precedence (error before done), with `skipped` checked
// before `active` — a skipped step is never active. `data-done` stays a
// straight boolean and is NOT derived from this: `manual_flasher.spec.ts` reads
// `data-done`, and the two must not drift.
const stateOf = (s: StepType): StepState =>
  s.error ? "error" : s.done ? "complete" : s.skipped ? "skipped" : s.active ? "active" : "pending"

function StepIcon({ state }: { state: StepState }) {
  if (state === "error") {
    return <X aria-hidden className="size-5 text-live-text" />
  }
  if (state === "complete") {
    return <Check aria-hidden className="size-5 text-preview" />
  }
  if (state === "active") {
    // The one animation outside highlight: this is progress feedback, not
    // state, and no tally is rendered on this page. Reduced motion collapses
    // every duration token, so the ring simply stops.
    return (
      <span
        aria-hidden
        className="size-5 animate-spin rounded-full border-2 border-n-700 border-t-n-100 motion-reduce:animate-none"
      />
    )
  }
  return <CircleDashed aria-hidden className={state === "skipped" ? "size-5 text-n-500" : "size-5 text-n-600"} />
}

const labelClass: Record<StepState, string> = {
  error: "text-live-text",
  complete: "text-text",
  active: "text-text font-medium",
  skipped: "text-text-muted line-through",
  pending: "text-text-muted",
}

type Props = {
  steps: StepType[]
}

// Replaces MUI Stepper/Step/StepLabel — shadcn has no stepper and Radix has no
// stepper primitive, so this is from scratch (design-components.md §3.1). The
// old version styled MUI's `.MuiStepConnector-*` internals; no spec ever
// queried those (ui-contract H3b), so the connector is re-derived here as a
// pseudo-element on the icon column: unfocusable, unreadable by a screen
// reader, and incapable of shifting layout.
function StepDisplay({ steps }: Props) {
  return (
    <ol className="relative m-0 flex list-none flex-col p-0" aria-label="Flash progress">
      {steps.map(step => {
        const state = stateOf(step)
        const hasCount = step.max !== undefined && step.max !== null && (step.active || step.done)
        return (
          <li
            key={step.id}
            data-testid={`progress-step-${step.id}`}
            data-done={step.done ? "true" : "false"}
            data-state={state}
            aria-current={step.active ? "step" : undefined}
            className="group relative flex gap-3 pb-4 last:pb-0"
          >
            <span
              className={
                "relative flex w-6 shrink-0 justify-center " +
                "before:absolute before:top-7 before:bottom-[-1rem] before:w-1 before:-translate-x-1/2 before:left-1/2 " +
                "before:bg-n-600 group-last:before:hidden group-data-[state=complete]:before:bg-n-300"
              }
            >
              <StepIcon state={state} />
            </span>
            <span className="min-w-0 flex-1 pt-px">
              <span className={"text-base " + labelClass[state]}>{step.label}</span>
              {hasCount && (
                <span className="ml-2 text-sm tabular-nums text-text-muted">({step.current}/{step.max})</span>
              )}
              {hasCount && step.active && (
                // The only step with a bar. Achromatic, per tokens principle 1.
                <span
                  role="progressbar"
                  aria-valuemin={0}
                  aria-valuemax={step.max}
                  aria-valuenow={step.current}
                  className="mt-1.5 block h-1.5 w-full overflow-hidden rounded-full bg-n-700"
                >
                  <span
                    className="block h-full bg-n-100"
                    style={{ width: `${step.max ? Math.round((step.current || 0) / step.max * 100) : 0}%` }}
                  />
                </span>
              )}
            </span>
          </li>
        )
      })}
    </ol>
  )
}

export default StepDisplay
