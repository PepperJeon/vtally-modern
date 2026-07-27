import React from 'react'
import Spinner from '../layout/Spinner'
import { useT } from '../../i18n'

type MixerSettingsWrapperProps = {
    title: string,
    testId: string,
    description?: React.ReactNode,
    canBeSaved?: boolean,
    isLoading?: boolean
    children?: React.ReactNode,
    onSave?: () => void
}

const buttonBase =
    "inline-flex h-11 items-center justify-center rounded-sm border border-transparent px-4 " +
    "font-sans text-base font-medium transition-colors duration-[var(--duration-fast)] " +
    "focus-visible:shadow-focus focus-visible:outline-none"

export const saveButtonClass = `${buttonBase} bg-white text-n-950 hover:bg-n-100`
// Disabled is a colour change, not opacity: an opacity-dimmed control on a
// near-black background falls below any usable contrast (design-screens.md §2.4).
export const saveButtonDisabledClass = `${buttonBase} cursor-not-allowed bg-n-600 text-text-disabled`

function MixerSettingsWrapper({title, testId, description, canBeSaved, isLoading, children, onSave}: MixerSettingsWrapperProps ) {
    const t = useT()
    const buttonLabel = t.common.save
    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault()
        if (onSave) {
            onSave()
        }
    }

    if (isLoading) {
        return (<Spinner />)
    }

    // Title first, then description, then fields (design-screens.md §2.3 — the
    // old order read "what it does" before "what it is").
    const descriptionNode = description
        ? <p className="mb-4 text-sm text-text-muted">{description}</p>
        : null

    return (<div data-testid={testId}>
        <form onSubmit={handleSubmit}>
            { children ? (<>
                <h3 className="m-0 mb-1 text-lg font-semibold text-text">{title}</h3>
                {descriptionNode}
                <div className="flex flex-col gap-4">{children}</div>
            </>) : descriptionNode }
            { onSave && (
                <div className="-mx-6 mt-6 border-t border-border px-6 pt-4 text-right">
                    { canBeSaved === false ? (
                        // A disabled <button> emits no events, so the explanation has to
                        // hang off a wrapper that is still hoverable.
                        <span title={t.common.formHasErrors} className="inline-block">
                            <button type="button" data-testid={`${testId}-submit`} disabled className={saveButtonDisabledClass}>{buttonLabel}</button>
                        </span>
                    ) : (
                        <button type="submit" data-testid={`${testId}-submit`} className={saveButtonClass}>{buttonLabel}</button>
                    )}
                </div>
            )}
        </form>
    </div>)
}

export default MixerSettingsWrapper
