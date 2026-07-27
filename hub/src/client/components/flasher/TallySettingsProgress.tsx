import React from 'react'
import type { TallySettingsIniProgressType } from '../../../shared/flasher/TallyDevice'
import useTallies from '../../hooks/useTallies'
import StepDisplay, { StepType } from './StepDisplay'
import { useT, Translations } from '../../i18n'

function getSteps(progress: TallySettingsIniProgressType, isTallyConnected: boolean, t: Translations): StepType[] {
  const steps: any = [
    {
      id: "initialize",
      label: t.flasher.steps.initializing,
      done: progress?.inititalizeDone,
    },
    {
      id: "connection",
      label: t.flasher.steps.establishingConnection,
      done: progress?.connectionDone,
    },
    {
      id: "upload",
      label: t.flasher.steps.uploadingIni,
      done: progress?.uploadDone,
    },
    {
      id: "reboot",
      label: t.flasher.steps.rebooting,
      done: progress?.rebootDone,
    },
    {
      id: "done",
      label: t.flasher.steps.uploadDone,
      done: progress?.allDone,
    },
    {
      id: "connected",
      label: t.flasher.steps.tallyConnected,
      done: progress?.allDone && isTallyConnected,
    },
  ]

  let lastDone = true
  let hadError = false
  for (const step of steps) {
    step.active = lastDone && step.done === false
    step.error = step.active && progress?.error
    step.skipped = hadError
    if (step.error) {
      // every step after the one that errored is skipped
      hadError = true
    }
    lastDone = step.done
  }
  return steps
}

type Props = {
  progress?: TallySettingsIniProgressType
}
function TallySettingsIniProgress({progress} : Props) {
  const tallies = useTallies()
  const isTallyConnected = !!tallies.find(tally => tally.name === progress?.tallyName && tally.isConnected())

  const t = useT()
  const steps = getSteps(progress, isTallyConnected, t)
  
  return <StepDisplay steps={steps} />
}

export default TallySettingsIniProgress


