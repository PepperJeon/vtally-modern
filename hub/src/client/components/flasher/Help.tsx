import React from 'react'
import { AlertTriangle } from 'lucide-react'

import TallyDevice from '../../../shared/flasher/TallyDevice'
import ExternalLink from '../ExternalLink'

type Props = {
  tallyDevice: TallyDevice
  onReload: () => void
}

// Amber, outlined — never filled. The fixes list below it is deliberately NOT a
// second alert (design-screens.md §5.2): it is reference material, and stacking
// two coloured blocks makes both of them noise.
function WarningWithRetry({ children, onReload }: { children: React.ReactNode, onReload: () => void }) {
  return (
    <div
      role="alert"
      className="mb-4 flex items-start gap-3 rounded-md border border-missing/60 px-4 py-3 text-missing"
    >
      <AlertTriangle aria-hidden className="mt-0.5 size-5 shrink-0" />
      <div className="flex-1 text-base">{children}</div>
      <button
        type="button"
        onClick={() => onReload()}
        className="shrink-0 rounded-sm px-2 py-1 text-sm font-medium text-missing underline underline-offset-2 hover:bg-surface-hover focus-visible:shadow-focus focus-visible:outline-none"
      >Try again</button>
    </div>
  )
}

function Fixes({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-md border border-border bg-surface-hover px-4 py-3 text-sm text-text">
      <p className="m-0 mb-2 font-medium">Possible fixes</p>
      <ul className="m-0 flex list-disc flex-col gap-2 pl-5">{children}</ul>
    </div>
  )
}

function Help({ tallyDevice, onReload }: Props) {
  if (tallyDevice.path === undefined) {
    const isLocalhost = (() => {
      const hostName = window.location.hostname
      return hostName === "127.0.0.1" || hostName === "localhost" || hostName === "[::1]"
    })

    return <>
      <WarningWithRetry onReload={onReload}>Did not find any connected device.</WarningWithRetry>
      <Fixes>
        <li>Plug the Tally to the computer that runs the hub via USB.</li>
        { !isLocalhost() && <li>The Tally has to be connected to the computer that <em>runs</em> the hub. It does not work on <em>remote machines</em>.</li> }
        <li>Some USB cables can just be used for charging. Make sure you use an <em>USB data cable</em>.</li>
        <li>If this has never worked from this computer ever, you might be missing the correct <ExternalLink href="https://www.silabs.com/developers/usb-to-uart-bridge-vcp-drivers">USB drivers</ExternalLink>.</li>
      </Fixes>
    </>
  } else if (tallyDevice.nodeMcuVersion === undefined) {
    return <>
      <WarningWithRetry onReload={onReload}>Device was found, but could not determine if LUA is running.</WarningWithRetry>
      <Fixes>
        <li>This happens sporadically. It could be fixed by trying again.</li>
        <li>Make sure a firmware is flashed. For example with esptool.</li>
        <li>Sometimes fault code on the Tally makes the firmware crash. Pushing the reset button might help.</li>
      </Fixes>
    </>
  }

  // Both present — say so, so the operator knows the probe succeeded.
  return (
    <p className="m-0 flex items-center gap-2 text-base text-text">
      <span aria-hidden className="size-2 rounded-full bg-preview" />
      Device on <span className="font-mono">{tallyDevice.path}</span>
      { tallyDevice.nodeMcuVersion && <span className="text-text-muted">· NodeMCU {tallyDevice.nodeMcuVersion}</span> }
    </p>
  )
}

export default Help
