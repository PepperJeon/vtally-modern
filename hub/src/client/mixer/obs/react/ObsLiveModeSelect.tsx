import React from 'react'
import ObsConfiguration, { ObsConfigurationLiveMode } from '../../../../shared/mixer/obs/ObsConfiguration'
import { NativeSelect } from '../../../components/ui/native-select'

type ObsLiveModeSelectProps = {
  label: string
  testId: string
  value: ObsConfigurationLiveMode
  onChange: (value: ObsConfigurationLiveMode) => void
}

const options = {
  always: {
    label: "Always",
    help: "",
  },
  stream: {
    label: "Only when streaming",
    help: "Tally Lights will not show on-air status unless OBS is streaming.",
  },
  record: {
    label: "Only when recording",
    help: "Tally Lights will not show on-air status unless OBS is recording.",
  },
  streamOrRecord: {
    label: "When recording or streaming",
    help: "Tally Lights will not show on-air status unless OBS is recording or streaming.",
  },
}

/* `configObs.spec.ts` reads this as `*[data-testid=obs-liveMode] select :selected`
 * and drives it with `.find("select").select(...)`, so it must stay a real
 * native <select> with the testid above it — see components/ui/native-select. */
function ObsLiveModeSelect({label, testId, value, onChange}: ObsLiveModeSelectProps) {
  const currentOption = options[value]
  const selectId = `field-${testId}`

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value.toString()
    if (ObsConfiguration.isValidLiveMode(value)) {
      onChange(value)
    }
  }

  return <div className="w-full max-w-[420px]">
    <label htmlFor={selectId} className="mb-1 block text-sm font-medium text-text-muted">{label}</label>
    <NativeSelect id={selectId} data-testid={testId} value={value ?? ""} onChange={handleChange}>
      {Object.keys(options).map(key => (
        <option key={key} value={key}>{options[key].label}</option>
      ))}
    </NativeSelect>
    <div className="min-h-5 pt-1">
      {currentOption && currentOption.help && (
        <p className="text-sm text-text-muted">{currentOption.help}</p>
      )}
    </div>
  </div>
}

export default ObsLiveModeSelect
