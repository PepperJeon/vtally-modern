import React from 'react'
import type { TallyProgramProgressType } from '../../../shared/flasher/TallyDevice'
import StepDisplay, { StepType } from './StepDisplay'
import { useT, Translations } from '../../i18n'

function getSteps(progress: TallyProgramProgressType, t: Translations): StepType[] {
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
      label: t.flasher.steps.uploadingFiles,
      current: progress?.filesUploaded,
      max: progress.filesTotal,
      done: progress.filesTotal === progress.filesUploaded,
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
  progress?: TallyProgramProgressType
}
function ProgramProgress({progress} : Props) {
  const t = useT()
  const steps = getSteps(progress, t)

  return <StepDisplay steps={steps} />
}

export default ProgramProgress


