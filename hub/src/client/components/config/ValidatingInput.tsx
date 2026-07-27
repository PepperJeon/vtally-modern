import React, { useState } from 'react'
import { Configuration } from '../../../shared/mixer/interfaces'
import { useT } from '../../i18n'

type ValidatingInputProps = {
    label: string
    testId: string
    object: Configuration
    propertyName: string
    errorMessage?: string
    warningMessage?: string
    onValid?: (value: string|null) => void
    onInvalid?: () => void
}

const upperCaseFirst = (value: string) => `${value.substr(0, 1).toUpperCase()}${value.substr(1)}`

/* an active component that allows easy editing of values of Configuration objects
 *
 * It validates values by trying to call the setter on the object. If it does not throw an error
 * the value is assumed to be valid.
 *
 * DOM contract (ui-contract.md §1.2, Hazard H1) — read before restructuring:
 * `data-testid` goes on the OUTER wrapper and a real `<input>` lives beneath it,
 * because both selector shapes are live in the suite:
 *   - `cy.getTestId("atem-ip").type(...)`          → the wrapper (5 specs)
 *   - `*[data-testid=atem-ip] input` .should(value) → the descendant (5 specs)
 * This is exactly where MUI's `TextField` put it. design-components.md §2.0
 * Rule A says to put `data-testid` on the `<input>` instead and admits, in the
 * same paragraph, that this makes the second selector resolve to nothing —
 * which would break the reload-persistence test in configAtem, configObs,
 * configVmix, configRolandV60HD and configRolandV8HD. Only ONE spec edit is
 * pre-authorised (spec-changes.md §1.1) and it is not that one, so Rule A is
 * not applicable here. The rule it does obey is the intent behind Rule A: the
 * wrapper contains exactly one focusable element, so `.type()` reaches the
 * input the same way it does today.
 */
function ValidatingInput({label, testId, object, propertyName, errorMessage, warningMessage, onValid, onInvalid}: ValidatingInputProps) {
    const t = useT()
    const getterName = `get${upperCaseFirst(propertyName)}`
    const setterName = `set${upperCaseFirst(propertyName)}`
    if (typeof object[getterName] !== "function") { throw new Error(`${getterName} is not a function`) }
    if (typeof object[setterName] !== "function") { throw new Error(`${setterName} is not a function`) }

    const theObjectValue = object[getterName]().toString()
    const [oldValue, setOldValue] = useState<string|null>(null)
    const [value, setValue] = useState<string|null>(null)
    const [isValid, setIsValid] = useState(true)

    if (theObjectValue !== oldValue) {
        // value in the default object was changed
        setOldValue(theObjectValue)
        setValue(theObjectValue)
        setIsValid(true)
        // we can not render a parent synchrounously
        onValid && setTimeout(() => onValid(theObjectValue), 1)
    }

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const newValue = e.target.value === "" ? null : e.target.value
        setValue(newValue)
        try {
            object.clone()[setterName](newValue)
            setIsValid(true)
            onValid && onValid(newValue)
        } catch (e) {
            setIsValid(false)
            onInvalid && onInvalid()
        }
    }

    const inputId = `field-${testId}`
    const messageId = `${inputId}-message`
    // Suspicion vs. validation (design-screens.md §2.4): an error blocks Save and
    // colours the border; a warning is amber text only and never blocks. The
    // warning node's testid is the one spec-changes.md §1.1 pre-authorises —
    // `vmix-port` + `-warning` is literally `vmix-port-warning`.
    const message = !isValid ? (errorMessage || t.common.invalid) : (warningMessage || "")
    const messageTestId = `${testId}-${isValid ? "warning" : "error"}`

    return (
        <div data-testid={testId} className="w-full max-w-[420px]">
            <label htmlFor={inputId} className="mb-1 block text-sm font-medium text-text-muted">{label}</label>
            <input
                id={inputId}
                type="text"
                value={value ?? ""}
                onChange={handleChange}
                aria-invalid={!isValid}
                aria-describedby={message ? messageId : undefined}
                className={
                    "h-11 w-full rounded-sm border bg-n-900 px-3 font-mono text-base tabular-nums text-text " +
                    "placeholder:text-n-500 focus-visible:border-border-strong focus-visible:shadow-focus focus-visible:outline-none " +
                    (isValid ? "border-n-600" : "border-missing")
                }
            />
            {/* help slot is always reserved so an appearing warning never shoves Save down */}
            <div className="min-h-5 pt-1">
                {message && (
                    <p id={messageId} data-testid={messageTestId} className="text-sm text-missing">
                        <span aria-hidden>⚠ </span>{message}
                    </p>
                )}
            </div>
        </div>
    )
}

export default ValidatingInput
