import React, { useEffect, useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'

import TallySettingsIni from '../../shared/flasher/TallySettingsIni'
import { useT } from '../i18n'

type EditTallySettingsProps = {
  settingsIni: TallySettingsIni
  disabled: boolean
  onSave: (t: TallySettingsIni) => void
}

const fieldClass =
  "h-11 w-full rounded-sm border border-n-600 bg-n-900 px-3 font-sans text-base text-text " +
  "placeholder:text-n-500 focus-visible:border-border-strong focus-visible:shadow-focus focus-visible:outline-none " +
  "disabled:cursor-not-allowed disabled:border-n-700 disabled:text-text-disabled"

/* `data-testid` on the OUTER wrapper with one real <input> beneath it — the
 * same rule ValidatingInput follows, for the same reason:
 * `manual_flasher.spec.ts` reaches every one of these through
 * `cy.getTestId("tally-settings-name").find("input")`, which is exactly where
 * MUI's TextField put the testid. Spreading it onto the <input> makes that
 * selector resolve to nothing. */
type FieldProps = {
  label: string
  testId: string
  value: string
  disabled: boolean
  type?: string
  onChange: (value: string) => void
  children?: React.ReactNode
}

function Field({ label, testId, value, disabled, type, onChange, children }: FieldProps) {
  const id = `field-${testId}`
  return (
    <div data-testid={testId} className="mb-4 block w-full max-w-[420px]">
      <label htmlFor={id} className="mb-1 block text-sm font-medium text-text-muted">{label}</label>
      <div className="relative">
        <input
          id={id}
          type={type || "text"}
          value={value}
          disabled={disabled}
          onChange={e => onChange(e.currentTarget.value)}
          className={fieldClass + (children ? " pr-11" : "")}
        />
        {children}
      </div>
    </div>
  )
}

const EditSettingsIni = ({settingsIni, onSave, disabled}: EditTallySettingsProps) => {
  const t = useT()
  const [ini, setIni] = useState<TallySettingsIni>(settingsIni)
  const [stringContent, setStringContent] = useState(settingsIni?.toString())
  const [expertMode, setExpertMode] = useState(false)
  const [revealPassword, setRevealPassword] = useState(false)

  useEffect(() => {
    setIni(settingsIni)
    setStringContent(settingsIni?.toString())
  }, [settingsIni])

  // Every simple-mode field is the same three lines over a different setter.
  const update = (apply: (clone: TallySettingsIni) => void) => {
    const clone = ini?.clone() || new TallySettingsIni()
    apply(clone)
    setIni(clone)
    setStringContent(clone.toString())
  }

  return (<div>
    {/* §5.5: the testid and data-expertmode go on the clickable <label>, not on
        the switch itself — manual_flasher.spec.ts clicks the outer labelled node
        and reads data-expertmode off it.
        A real <input type="checkbox" role="switch">, not the Radix Switch: Radix
        renders a <button>, and a click anywhere on the label's empty area (which
        is where cy.click() lands, the row is justify-end) only forwards to a
        labelable control. A checkbox is one; a button is not. */}
    <label
      data-testid="tally-settings-expert"
      data-expertmode={expertMode ? "true" : "false"}
      className="flex cursor-pointer items-center justify-end gap-2 text-sm text-text"
    >
      <span>{t.settingsIni.expertMode}</span>
      <input
        type="checkbox"
        role="switch"
        className="peer sr-only"
        checked={expertMode}
        disabled={disabled}
        onChange={() => setExpertMode(!expertMode)}
      />
      <span
        aria-hidden
        className="relative block h-5 w-9 shrink-0 rounded-full border border-n-600 bg-n-700 transition-colors duration-[var(--duration-fast)] peer-checked:bg-white peer-focus-visible:shadow-focus peer-disabled:cursor-not-allowed peer-disabled:opacity-60 peer-checked:[&>span]:translate-x-4 peer-checked:[&>span]:bg-n-950"
      >
        <span className="absolute left-0.5 top-1/2 block size-4 -translate-y-1/2 rounded-full bg-n-300 transition-transform duration-[var(--duration-fast)]" />
      </span>
    </label>
    <p className="mb-4 mt-1 text-right text-sm text-text-muted">
      {t.settingsIni.expertModeHelp}
    </p>
    { expertMode ?
      <div data-testid="tally-settings-all" className="mb-4">
        <label htmlFor="field-tally-settings-all" className="mb-1 block text-sm font-medium text-text-muted">{t.settingsIni.fileName}</label>
        <textarea
          id="field-tally-settings-all"
          rows={(ini?.lines.length || 0) + 1}
          value={stringContent || ""}
          disabled={disabled}
          onChange={(e) => {
            const value = e.currentTarget.value
            setIni(new TallySettingsIni(value))
            setStringContent(value)
          }}
          className="w-full resize-y rounded-sm border border-n-600 bg-n-900 p-3 font-mono text-sm text-text focus-visible:border-border-strong focus-visible:shadow-focus focus-visible:outline-none disabled:cursor-not-allowed disabled:text-text-disabled"
        />
      </div>
    : <>
      <Field label={t.settingsIni.name} testId="tally-settings-name" disabled={disabled} value={ini?.getTallyName() || ""}
        onChange={value => update(clone => clone.setTallyName(value))} />
      <Field label={t.settingsIni.ssid} testId="tally-settings-ssid" disabled={disabled} value={ini?.getStationSsid() || ""}
        onChange={value => update(clone => clone.setStationSsid(value))} />
      <Field label={t.settingsIni.password} testId="tally-settings-password" disabled={disabled} value={ini?.getStationPassword() || ""}
        type={revealPassword ? "text" : "password"}
        onChange={value => update(clone => clone.setStationPassword(value))}>
        {/* A wifi password typed blind into a device that ends up taped to a
            truss is worth one eye icon. */}
        <button
          type="button"
          aria-label={revealPassword ? t.settingsIni.hidePassword : t.settingsIni.showPassword}
          onClick={() => setRevealPassword(!revealPassword)}
          className="absolute right-1 top-1/2 -translate-y-1/2 rounded-sm p-2 text-n-400 hover:text-text focus-visible:shadow-focus focus-visible:outline-none"
        >{revealPassword ? <EyeOff aria-hidden className="size-4" /> : <Eye aria-hidden className="size-4" />}</button>
      </Field>
      <Field label={t.settingsIni.hubIp} testId="tally-settings-ip" disabled={disabled} value={ini?.getHubIp() || ""}
        onChange={value => update(clone => clone.setHubIp(value))} />
      <Field label={t.settingsIni.hubPort} testId="tally-settings-port" disabled={disabled} value={ini?.getHubPort()?.toString() || ""}
        onChange={value => {
          const number = parseInt(value, 10)
          update(clone => clone.setHubPort(isNaN(number) ? 0 : number))
        }} />
      </>
    }
    <div className="-mx-6 mt-6 border-t border-border px-6 pt-4 text-right max-sm:-mx-4 max-sm:px-4">
      <button
        type="button"
        data-testid="tally-settings-submit"
        disabled={disabled}
        onClick={() => onSave(ini)}
        className="inline-flex h-11 items-center justify-center rounded-sm px-4 font-sans text-base font-medium transition-colors duration-[var(--duration-fast)] focus-visible:shadow-focus focus-visible:outline-none bg-white text-n-950 hover:bg-n-100 disabled:cursor-not-allowed disabled:bg-n-600 disabled:text-text-disabled disabled:hover:bg-n-600"
      >{t.common.save}</button>
    </div>
  </div>)
}

export default EditSettingsIni
