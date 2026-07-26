import React, { useEffect, useState } from 'react'
import { Checkbox as CheckboxPrimitive } from 'radix-ui'
import { Check } from 'lucide-react'

import { useDefaultTallyConfiguration } from '../../hooks/useConfiguration'
import { socket } from '../../hooks/useSocket'
import { ColorSchemeId } from '../../../shared/tally/ColorScheme'
import { DefaultTallyConfiguration } from '../../../shared/tally/TallyConfiguration'
import MiniPage from '../layout/MiniPage'
import Spinner from '../layout/Spinner'
import BrightnessSlider from './BrightnessSlider'
import ColorSchemeSelector from './ColorSchemeSelector'
import { saveButtonClass } from './MixerSettingsWrapper'

const groupHeading = "m-0 mb-4 text-xs font-semibold uppercase tracking-wide text-text-muted"
const fieldLabel = "mb-1 block text-sm font-medium text-text-muted"

type SettingsCheckboxProps = {
  testId: string
  checked: boolean
  onCheckedChange: (checked: boolean) => void
  label: string
}

/* Both `data-testid` and `data-value` go on the Radix `Checkbox.Root` <button>
 * — that is what configTally.spec.ts clicks and what it reads `data-value` off
 * (ui-contract.md §2.3). Radix's own `data-state` is separate and both stay. */
function SettingsCheckbox({testId, checked, onCheckedChange, label}: SettingsCheckboxProps) {
  const id = `field-${testId}`
  return (
    <div className="flex items-center gap-3">
      <CheckboxPrimitive.Root
        id={id}
        data-testid={testId}
        data-value={checked}
        checked={checked}
        onCheckedChange={(value) => onCheckedChange(value === true)}
        className={
          "relative flex size-5 shrink-0 items-center justify-center rounded-xs border border-n-500 " +
          "after:absolute after:-inset-3 after:content-[''] " +
          "focus-visible:shadow-focus focus-visible:outline-none " +
          "data-[state=checked]:border-white data-[state=checked]:bg-white data-[state=checked]:text-n-950"
        }
      >
        <CheckboxPrimitive.Indicator className="grid place-content-center text-current">
          <Check className="size-3.5" />
        </CheckboxPrimitive.Indicator>
      </CheckboxPrimitive.Root>
      <label htmlFor={id} className="text-base text-text">{label}</label>
    </div>
  )
}

function TallySettings() {
  const settings = useDefaultTallyConfiguration()
  const [operatorBrightness, setOperatorBrightness] = useState<number>(undefined)
  const [stageBrightness, setStageBrightness] = useState<number>(undefined)
  const [operatorColorScheme, setOperatorColorScheme] = useState<ColorSchemeId>(undefined)
  const [stageColorScheme, setStageColorScheme] = useState<ColorSchemeId>(undefined)
  const [stageShowsPreview, setStageShowsPreview] = useState<boolean>(undefined)
  const [operatorShowsIdle, setOperatorShowsIdle] = useState<boolean>(undefined)
  useEffect(() => {
    // called when setting changed
    setOperatorBrightness(settings?.getOperatorLightBrightness())
    setStageBrightness(settings?.getStageLightBrightness())
    setOperatorColorScheme(settings?.getOperatorColorScheme())
    setStageColorScheme(settings?.getStageColorScheme())
    setStageShowsPreview(settings?.getStageShowsPreview())
    setOperatorShowsIdle(settings?.getOperatorShowsIdle())
  }, [settings])

  const isLoading = !settings

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault()
    operatorBrightness !== undefined && settings.setOperatorLightBrightness(operatorBrightness)
    stageBrightness !== undefined && settings.setStageLightBrightness(stageBrightness)
    operatorColorScheme !== undefined && settings.setOperatorColorScheme(operatorColorScheme)
    stageColorScheme !== undefined && settings.setStageColorScheme(stageColorScheme)
    stageShowsPreview !== undefined && settings.setStageShowsPreview(stageShowsPreview)
    operatorShowsIdle !== undefined && settings.setOperatorShowsIdle(operatorShowsIdle)

    socket.emit('config.change.tallyconfig', settings.toJson())
  }

  // testId, not data-testid: MiniPage destructures its props and drops unknown
  // ones, so the old `data-testid="tally-defaults"` never reached the DOM at all
  // (design-screens.md §2.5). No spec asserts it; fixing it is free.
  return <MiniPage testId="tally-defaults" title="Tally Defaults" className="max-w-[480px]">
    { isLoading ? <Spinner /> : (<form onSubmit={handleSubmit}>
      <section>
        <h3 className={groupHeading}>Operator Light</h3>
        <div className="mb-6">
          <span className={fieldLabel}>Brightness</span>
          <BrightnessSlider
            testId="tally-defaults-ob"
            minValue={DefaultTallyConfiguration.minOperatorLightBrightness}
            minMessage="Operator Light can not be turned off."
            value={operatorBrightness}
            onChange={(value) => {setOperatorBrightness(value)}}
          />
        </div>
        <div className="mb-6">
          <span className={fieldLabel}>Colours</span>
          <ColorSchemeSelector
            testId="tally-defaults-oc"
            value={operatorColorScheme}
            onChange={(value) => {setOperatorColorScheme(value)}}
          />
        </div>
        <SettingsCheckbox
          testId="tally-defaults-oi"
          checked={operatorShowsIdle}
          onCheckedChange={setOperatorShowsIdle}
          label="Shows idle state"
        />
      </section>

      <hr className="my-6 border-0 border-t border-border" />

      <section>
        <h3 className={groupHeading}>Stage Light</h3>
        <div className="mb-6">
          <span className={fieldLabel}>Brightness</span>
          <BrightnessSlider
            testId="tally-defaults-sb"
            value={stageBrightness}
            onChange={(value) => {setStageBrightness(value)}}
          />
        </div>
        <div className="mb-6">
          <span className={fieldLabel}>Colours</span>
          <ColorSchemeSelector
            testId="tally-defaults-sc"
            value={stageColorScheme}
            onChange={(value) => {setStageColorScheme(value)}}
          />
        </div>
        <SettingsCheckbox
          testId="tally-defaults-sp"
          checked={stageShowsPreview}
          onCheckedChange={setStageShowsPreview}
          label="Shows preview state"
        />
      </section>

      <div className="-mx-6 mt-6 border-t border-border px-6 pt-4 text-right">
        <button data-testid="tally-defaults-submit" type="submit" className={saveButtonClass}>Save</button>
      </div>
    </form>)}
  </MiniPage>
}

export default TallySettings
