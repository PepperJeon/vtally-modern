import React, { useEffect, useState } from 'react'
import { Checkbox } from '@/components/ui/checkbox'
import Tally from '../../shared/domain/Tally';
import { useDefaultTallyConfiguration } from '../hooks/useConfiguration';
import { socket } from '../hooks/useSocket';
import { ColorSchemeId } from '../../shared/tally/ColorScheme';
import { DefaultTallyConfiguration } from '../../shared/tally/TallyConfiguration';
import BrightnessSlider from './config/BrightnessSlider';
import ColorSchemeSelector from './config/ColorSchemeSelector';
import FormDialog from './layout/FormDialog';
import Spinner from './layout/Spinner';
import TallySettingsField from './TallySettingsField';
import { useT } from '../i18n';

const fieldClass = "mb-4"

/* The checkbox keeps `data-testid` AND `data-value` on the interactive element
 * itself: tally-settings.spec.ts both clicks it and reads `data-value` off the
 * same node, and no spec uses a descendant selector here (design-components.md
 * §2.0 Rule A, simple case). Radix's Checkbox root is a real <button>, so both
 * still work. */
type CheckboxFieldProps = {
  testId: string
  value: boolean
  disabled: boolean
  label: string
  onChange: (value: boolean) => void
}

function CheckboxField({testId, value, disabled, label, onChange}: CheckboxFieldProps) {
  return (
    <label className="flex items-center gap-2 text-base text-text">
      <Checkbox
        data-testid={testId}
        data-value={value}
        checked={value}
        disabled={disabled}
        onCheckedChange={(checked) => onChange(checked === true)}
      />
      {label}
    </label>
  )
}

type TallySettingsProps = {
  tally: Tally
  open: boolean
  onClose?: () => void
}

function TallySettings({ tally, open, onClose }: TallySettingsProps) {
  const t = useT()
  const defaultSettings = useDefaultTallyConfiguration()
  const settings = tally.configuration
  // operatorBrightness
  const [ob, setOb] = useState<number>(settings && settings.getOperatorLightBrightness())
  const [isObDefault, setObDefault] = useState(settings && settings.getOperatorLightBrightness() === undefined)
  // stageBrightness
  const [sb, setSb] = useState<number>(settings && settings.getStageLightBrightness())
  const [isSbDefault, setSbDefault] = useState(settings && settings.getOperatorLightBrightness() === undefined)
  // operatorColor
  const [oc, setOc] = useState<ColorSchemeId>(settings ? settings.getOperatorColorScheme() : undefined)
  const [isOcDefault, setOcDefault] = useState(settings && settings.getOperatorColorScheme() === undefined)
  // stageColor
  const [sc, setSc] = useState<ColorSchemeId>(settings ? settings.getStageColorScheme() : undefined)
  const [isScDefault, setScDefault] = useState(settings && settings.getStageColorScheme() === undefined)
  // stageShowPreview
  const [sp, setSp] = useState<boolean>(settings ? settings.getStageShowsPreview() : undefined)
  const [isSpDefault, setSpDefault] = useState(settings && settings.getStageShowsPreview() === undefined)
  // operatorShowIdle
  const [oi, setOi] = useState<boolean>(settings ? settings.getOperatorShowsIdle() : undefined)
  const [isOiDefault, setOiDefault] = useState(settings && settings.getOperatorShowsIdle() === undefined)
  // useEffect, not useMemo. These four blocks across three files were
  // setState-inside-useMemo — a side effect in a hook React is free to re-run,
  // skip or discard the result of. It happened to work on React 17; React 19
  // makes no such promise. Nothing here computes a value, so useEffect is what
  // they always meant.
  useEffect(() => {
    // when default settings change
    if (defaultSettings) {
      if (isObDefault) { setOb(defaultSettings.getOperatorLightBrightness()) }
      if (isSbDefault) { setSb(defaultSettings.getStageLightBrightness()) }
      if (isOcDefault) { setOc(defaultSettings.getOperatorColorScheme()) }
      if (isScDefault) { setSc(defaultSettings.getStageColorScheme()) }
      if (isSpDefault) { setSp(defaultSettings.getStageShowsPreview()) }
      if (isOiDefault) { setOi(defaultSettings.getOperatorShowsIdle()) }
    }
  }, [defaultSettings, isObDefault, isSbDefault, isOcDefault, isScDefault, isSpDefault, isOiDefault])
  useEffect(() => {
    // when settings are changed
    if (settings) {
      const newIsObDefault = settings.getOperatorLightBrightness() === undefined
      const newIsSbDefault = settings.getStageLightBrightness() === undefined
      const newIsOcDefault = settings.getOperatorColorScheme() === undefined
      const newIsScDefault = settings.getStageColorScheme() === undefined
      const newIsSpDefault = settings.getStageShowsPreview() === undefined
      const newIsOiDefault = settings.getOperatorShowsIdle() === undefined
      setObDefault(newIsObDefault)
      setSbDefault(newIsSbDefault)
      setOcDefault(newIsOcDefault)
      setScDefault(newIsScDefault)
      setSpDefault(newIsSpDefault)
      setOiDefault(newIsOiDefault)

      if (!newIsObDefault) { setOb(settings.getOperatorLightBrightness()) }
      if (!newIsSbDefault) { setSb(settings.getStageLightBrightness()) }
      if (!newIsOcDefault) { setOc(settings.getOperatorColorScheme()) }
      if (!newIsScDefault) { setSc(settings.getStageColorScheme()) }
      if (!newIsSpDefault) { setSp(settings.getStageShowsPreview()) }
      if (!newIsOiDefault) { setOi(settings.getOperatorShowsIdle()) }
    }
  }, [settings])

  const isLoading = !defaultSettings || !tally

  const handleSave = () => {
    if (!tally) { return }
    const settings = tally.configuration
    settings.setOperatorLightBrightness(isObDefault ? undefined : ob)
    settings.setOperatorColorScheme((isOcDefault) ? undefined : oc)
    settings.setStageLightBrightness((!tally.hasStageLight || isSbDefault) ? undefined : sb)
    settings.setStageColorScheme((!tally.hasStageLight || isScDefault) ? undefined : sc)
    settings.setStageShowsPreview((!tally.hasStageLight || isSpDefault) ? undefined : sp)
    settings.setOperatorShowsIdle((isOiDefault) ? undefined : oi)
    socket.emit('tally.settings', tally.name, tally.type, settings.toJson())
    onClose && onClose()
  }

  return (
    <FormDialog
      data-testid="tally-settings"
      open={open}
      onClose={onClose}
      onSubmit={handleSave}
      label={t.tallySettings.title(tally.name)}
    >
      { isLoading ? (<Spinner />) : (<>
        <TallySettingsField
          label={t.tallySettings.operatorBrightness}
          isDefault={isObDefault}
          onChange={setObDefault}
          testId="tally-settings-ob"
          className={fieldClass}
        >
          <BrightnessSlider
            testId="tally-settings-ob"
            disabled={isObDefault}
            minValue={DefaultTallyConfiguration.minOperatorLightBrightness}
            minMessage={t.tallySettings.operatorCannotBeOff}
            value={isObDefault ? defaultSettings.getOperatorLightBrightness() : ob}
            onChange={(value) => { setOb(value) }}
          />
        </TallySettingsField>
        <TallySettingsField
          label={t.tallySettings.operatorColors}
          isDefault={isOcDefault}
          onChange={setOcDefault}
          testId="tally-settings-oc"
          className={fieldClass}
        >
          <ColorSchemeSelector
            testId="tally-settings-oc"
            value={oc}
            onChange={(value) => { setOc(value) }}
            disabled={isOcDefault}
          />
        </TallySettingsField>
        <TallySettingsField
          label={t.tallySettings.operatorDisplay}
          isDefault={isOiDefault}
          onChange={setOiDefault}
          testId="tally-settings-oi"
          className={fieldClass}
        >
          <CheckboxField
            testId="tally-settings-oi"
            value={isOiDefault ? defaultSettings.getOperatorShowsIdle() : oi}
            disabled={isOiDefault}
            onChange={setOi}
            label={t.tallySettings.showsIdleState}
          />
        </TallySettingsField>
        { tally.hasStageLight && (<>
        <TallySettingsField
          label={t.tallySettings.stageBrightness}
          isDefault={isSbDefault}
          onChange={setSbDefault}
          testId="tally-settings-sb"
          className={fieldClass}
        >
            <BrightnessSlider
              testId="tally-settings-sb"
              disabled={isSbDefault}
              value={isSbDefault ? defaultSettings.getStageLightBrightness() : sb}
              onChange={(value) => { setSb(value) }}
            />
            </TallySettingsField>
        <TallySettingsField
          label={t.tallySettings.stageColors}
          isDefault={isScDefault}
          onChange={setScDefault}
          testId="tally-settings-sc"
          className={fieldClass}
        >
          <ColorSchemeSelector
              testId="tally-settings-sc"
              value={sc}
              onChange={(value) => { setSc(value) }}
              disabled={isScDefault}
            />
        </TallySettingsField>
        <TallySettingsField
          label={t.tallySettings.stageDisplay}
          isDefault={isSpDefault}
          onChange={setSpDefault}
          testId="tally-settings-sp"
          className={fieldClass}
        >
          <CheckboxField
            testId="tally-settings-sp"
            value={isSpDefault ? defaultSettings.getStageShowsPreview() : sp}
            disabled={isSpDefault}
            onChange={setSp}
            label={t.tallySettings.showsPreviewState}
          />
        </TallySettingsField>
        </>)}
      </>)}
    </FormDialog>
  )
}

export default TallySettings