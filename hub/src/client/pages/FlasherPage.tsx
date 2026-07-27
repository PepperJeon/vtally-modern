import React, { useEffect, useState } from 'react'
import { Dialog as DialogPrimitive } from 'radix-ui'
import { AlertTriangle, Check, Info, RefreshCw } from 'lucide-react'

import EditSettingsIni from '../components/EditSettingsIni'
import Layout from '../components/layout/Layout'
import MiniPage from '../components/layout/MiniPage'
import Spinner from '../components/layout/Spinner'
import TallySettingsIniProgress from '../components/flasher/TallySettingsProgress'
import type { TallyProgramProgressType, TallySettingsIniProgressType } from '../../shared/flasher/TallyDevice'
import TallyDevice, { TallyDeviceObjectType } from '../../shared/flasher/TallyDevice'
import TallySettingsIni from '../../shared/flasher/TallySettingsIni'
import { socket } from '../hooks/useSocket'
import Help from '../components/flasher/Help'
import ProgramProgress from '../components/flasher/ProgramProgress'
import ExternalLink from '../components/ExternalLink'
import { useT } from '../i18n'

function useTallyDevice(i: number) {
  const [tallyDevice, setTallyDevice] = useState<TallyDevice>(undefined)

  useEffect(() => {
    const onFlasherDevice = (device: TallyDeviceObjectType) => {
      setTallyDevice(TallyDevice.fromJson(device))
    }
    socket.on('flasher.device', onFlasherDevice)

    setTallyDevice(undefined)
    socket.emit('flasher.device.get')
    return () => {
      socket.off('flasher.device', onFlasherDevice)
    }
  }, [i])

  return tallyDevice
}

const panelFooterClass = "-mx-6 mt-6 border-t border-border px-6 pt-4 text-right max-sm:-mx-4 max-sm:px-4"
const primaryButtonClass =
  "inline-flex h-11 items-center justify-center rounded-sm px-4 font-sans text-base font-medium " +
  "bg-white text-n-950 transition-colors duration-[var(--duration-fast)] hover:bg-n-100 " +
  "focus-visible:shadow-focus focus-visible:outline-none " +
  "disabled:cursor-not-allowed disabled:bg-n-600 disabled:text-text-disabled disabled:hover:bg-n-600"

/** Amber, outlined. The only alert colour left in the app. */
function WarningAlert({ children }: { children: React.ReactNode }) {
  return (
    <div role="alert" className="mb-4 flex items-start gap-3 rounded-md border border-missing/60 px-4 py-3 text-base text-missing">
      <AlertTriangle aria-hidden className="mt-0.5 size-5 shrink-0" />
      <div>{children}</div>
    </div>
  )
}

/** Neutral, not green and not amber — "a capability this build does not have"
 *  and "already up to date" are both non-events (design-screens.md §5.3, §5.6).
 *  Green would be hue spent on something that is not a tally state. */
function NeutralBlock({ icon, children }: { icon: React.ReactNode, children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3 rounded-md border border-border bg-surface-hover px-4 py-3 text-base text-text">
      <span className="mt-0.5 shrink-0 text-n-300">{icon}</span>
      <div className="min-w-0">{children}</div>
    </div>
  )
}

const FlasherPage = () => {
  const t = useT()
  // every increment will refresh tallyDevice
  const [increment, setIncrement] = useState<number>(1)
  const [isUploading, setIsUploading] = useState(false)
  const [uploadingOpen, setUploadingOpen] = useState(false)
  const [uploadProgress, setUploadProgress] = useState<TallySettingsIniProgressType>(undefined)
  const [programProgress, setProgramProgress] = useState<TallyProgramProgressType>(undefined)
  const tallyDevice = useTallyDevice(increment)
  const isLoading = tallyDevice === undefined

  const handleReload = () => {
    setIncrement(increment + 1)
  }

  const handleSettingsIniSave = (tallySettings: TallySettingsIni) => {
    setUploadProgress(undefined)
    setProgramProgress(undefined)
    setIsUploading(true)
    setUploadingOpen(true)
    const fnc = (progress: TallySettingsIniProgressType) => {
      if (progress.allDone || progress.error) {
        socket.off('flasher.settingsIni.progress', fnc)
        setIsUploading(false)
        if(!progress.error) { handleReload() }
      }
      setUploadProgress(progress)
    }
    socket.on('flasher.settingsIni.progress', fnc)
    socket.emit('flasher.settingsIni', tallyDevice.path, tallySettings.toString())
  }

  const handleProgram = () => {
    setUploadProgress(undefined)
    setProgramProgress(undefined)
    setIsUploading(true)
    setUploadingOpen(true)
    const fnc = (progress: TallyProgramProgressType) => {
      if (progress.allDone || progress.error) {
        socket.off('flasher.program.progress', fnc)
        setIsUploading(false)
        if(!progress.error) { handleReload() }
      }
      setProgramProgress(progress)
    }
    socket.on('flasher.program.progress', fnc)
    socket.emit('flasher.program', tallyDevice.path)
  }

  const hasFailed = uploadProgress?.error || programProgress?.error
  const update = tallyDevice?.update

  return (
    <Layout testId="flasher">
      <DialogPrimitive.Root open={uploadingOpen} onOpenChange={open => { if (!open && !isUploading) { setUploadingOpen(false) } }}>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/60" />
          <DialogPrimitive.Content
            data-testid="progress"
            /* Closing mid-flash leaves a half-written device — both escapes stay
               shut while uploading, exactly as MUI's disableBackdropClick /
               disableEscapeKeyDown did. */
            onEscapeKeyDown={e => { if (isUploading) { e.preventDefault() } }}
            onPointerDownOutside={e => { if (isUploading) { e.preventDefault() } }}
            onInteractOutside={e => { if (isUploading) { e.preventDefault() } }}
            className="fixed left-1/2 top-1/2 z-50 w-full max-w-[440px] -translate-x-1/2 -translate-y-1/2 rounded-md border border-border-strong bg-surface-raised p-6 text-text shadow-overlay outline-none max-sm:inset-0 max-sm:size-full max-sm:max-w-none max-sm:translate-x-0 max-sm:translate-y-0 max-sm:rounded-none"
          >
            <DialogPrimitive.Title className="m-0 mb-4 text-xl font-semibold">{t.flasher.uploadDialogTitle}</DialogPrimitive.Title>
            { uploadProgress && <TallySettingsIniProgress progress={uploadProgress} /> }
            { programProgress && <ProgramProgress progress={programProgress} /> }
            { hasFailed && <WarningAlert>{t.flasher.uploadFailed}</WarningAlert> }
            <div className="-mx-6 mt-6 border-t border-border px-6 pt-4 text-right">
              <button
                type="button"
                data-testid="progress-close"
                disabled={isUploading}
                onClick={() => setUploadingOpen(false)}
                className={primaryButtonClass}
              >{t.common.close}</button>
            </div>
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>

      <div className="flex flex-col gap-6">
        <MiniPage
          title={t.flasher.title}
          className="mb-0 max-w-[720px]"
          addHeaderContent={
            <button
              type="button"
              aria-label={t.flasher.reload}
              disabled={isLoading || isUploading}
              onClick={handleReload}
              className="inline-flex size-9 items-center justify-center rounded-sm text-n-300 transition-colors duration-[var(--duration-fast)] hover:bg-surface-hover hover:text-text focus-visible:shadow-focus focus-visible:outline-none disabled:cursor-not-allowed disabled:text-n-600 disabled:hover:bg-transparent"
            ><RefreshCw aria-hidden className="size-5" /></button>
          }
        >
          <p className="m-0 mb-4 text-base text-text-muted">
            {t.flasher.intro}
          </p>
          { tallyDevice === undefined ? (
            <Spinner />
          ) : (
            <Help tallyDevice={tallyDevice} onReload={handleReload} />
          )}
        </MiniPage>

        {/* "not-available" is included deliberately: it used to render nothing
            at all, which reads as a broken page, and before that the same state
            reported "up to date" — a false all-clear on a hub that ships no
            firmware (design-screens.md §5.3). */}
        { (update === "updateable" || update === "up-to-date" || update === "not-available") && (
          <MiniPage testId="update-software" title={t.flasher.softwareUpdate} className="mb-0 max-w-[720px]">
            { update === "not-available" && (
              <NeutralBlock icon={<Info aria-hidden className="size-5" />}>
                <p className="m-0 font-medium">{t.flasher.firmwareNotAvailable}</p>
                <p className="m-0 mt-2 text-sm text-text-muted">
                  {t.flasher.firmwareNotAvailableBody}
                </p>
                <p className="m-0 mt-2 text-sm text-text-muted">{t.flasher.lookedIn}</p>
                <ul className="m-0 mt-1 list-none p-0 font-mono text-sm text-text-muted">
                  <li>esp8266/ <span className="font-sans">{t.flasher.releasePackage}</span></li>
                  <li>../tally/out/ <span className="font-sans">{t.flasher.developmentCheckout(text => <code>{text}</code>)}</span></li>
                </ul>
                <p className="m-0 mt-2 text-sm text-text-muted">
                  {t.flasher.installRelease}{" "}
                  <ExternalLink href="https://github.com/peperjeon/vtally-modern">{t.flasher.docs}</ExternalLink>
                </p>
              </NeutralBlock>
            )}
            { update === "up-to-date" && (
              <NeutralBlock icon={<Check aria-hidden className="size-5" />}>
                {t.flasher.upToDate}
              </NeutralBlock>
            )}
            { update === "updateable" && <>
              <WarningAlert>{t.flasher.updateable}</WarningAlert>
              <div className={panelFooterClass}>
                <button type="button" onClick={handleProgram} data-testid="update-software-now" className={primaryButtonClass}>{t.flasher.updateNow}</button>
              </div>
            </>}
          </MiniPage>
        )}

        { tallyDevice?.nodeMcuVersion !== undefined && (
          <MiniPage title={t.flasher.editSettingsIni} testId="tally-settings" className="mb-0 max-w-[720px]">
            { !tallyDevice.tallySettings && (
              <WarningAlert>{t.flasher.iniWillBeCreated}</WarningAlert>
            )}
            <EditSettingsIni settingsIni={tallyDevice.tallySettings} onSave={handleSettingsIniSave} disabled={isLoading || isUploading} />
          </MiniPage>
        )}
      </div>
    </Layout>
  )
}
export default FlasherPage;
