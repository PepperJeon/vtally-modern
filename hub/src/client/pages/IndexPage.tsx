import React, { useEffect, useState } from 'react'
import useSocketInfo from '../hooks/useSocketInfo'
import useMixerInfo from '../hooks/useMixerInfo'
import useProgramPreview from '../hooks/useProgramPreview'
import Layout from '../components/layout/Layout'
import Tally from '../../shared/domain/Tally'
import useTallies from '../hooks/useTallies'
import TallyComponent from '../components/Tally'
import TallyCreate from '../components/TallyCreate'
import { AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

const countConnectedTallies = (tallies: Tally[]|null) => {
  if(!tallies) { return null }
  return tallies.reduce((count, tally) => count + (tally.isConnected() ? 1 : 0), 0)
}

const isProgram = (tally: Tally, programs: string[]|null) => !!programs && tally.isIn(programs)

/* The sort gains one key. `isActive()` is transport health, not program state,
 * so the old two-key sort put an on-air-but-disconnected tally *below* an
 * idle-but-connected one — the single most urgent card on the screen was not at
 * the top (design-screens.md §1.3). Program state now wins, health breaks ties,
 * name breaks the rest. */
const createTallyList = (tallies: Tally[]|null, programs: string[]|null, showDisconnected: boolean, showUnpatched: boolean) => {
  if(!tallies) { return null }
  return tallies.filter(
    tally => (tally.isActive() || showDisconnected) && (tally.isPatched() || showUnpatched)
  ).sort(
    (one, two) =>
      (+isProgram(two, programs) - +isProgram(one, programs)) ||
      (+two.isActive() - +one.isActive()) ||
      one.name.localeCompare(two.name)
  )
}

type StatusPillProps = {
  testId: string
  label: string
  title: string
  connected: boolean
  children: React.ReactNode
}

/* A readout, not a control: `role="status"` on a <div>, not a <button>. Fusing
 * these into the filter ButtonGroup (as today) invites an operator to click a
 * status pill expecting something to happen (§1.1). The numeric content stays
 * in the DOM — several specs read it — and the marker is added beside it,
 * never swapped for it (§1.4). */
function StatusPill({testId, label, title, connected, children}: StatusPillProps) {
  return (
    <div
      data-testid={testId}
      data-connected={connected}
      role="status"
      tabIndex={0}
      title={title}
      className={cn(
        "inline-flex h-11 items-center gap-2 rounded-sm border px-3 text-sm focus-visible:shadow-focus focus-visible:outline-none",
        connected ? "border-border text-text" : "border-dashed border-missing text-missing"
      )}
    >
      <span aria-hidden className={connected ? "text-preview" : "text-missing"}>{connected ? "●" : "⊘"}</span>
      <span className="hidden font-semibold uppercase tracking-wide sm:inline">{label}</span>
      <span className="tabular-nums">{children}</span>
    </div>
  )
}

const IndexPage = () => {
  const rawTallies = useTallies()
  const [showDisconnected, setShowDisconnected] = useState(true)
  const [showUnpatched, setShowUnpatched] = useState(true)
  const isMixerConnected = useMixerInfo()
  const isHubConnected = useSocketInfo()
  const [programs] = useProgramPreview()

  const tallies = createTallyList(rawTallies, programs, showDisconnected, showUnpatched)

  // Carrier 4 of the hub-disconnected design (§1.5): an operator with the hub
  // on a background tab finds out.
  useEffect(() => {
    const title = document.title.replace(/^⚠ /, "")
    document.title = isHubConnected ? title : `⚠ ${title}`
  }, [isHubConnected])

  const showAll = () => {
    setShowDisconnected(true)
    setShowUnpatched(true)
  }

  const nrConnectedTallies = countConnectedTallies(rawTallies)
  const nrHidden = rawTallies && tallies ? rawTallies.length - tallies.length : 0
  const onAirCount = tallies ? tallies.filter(tally => isProgram(tally, programs)).length : 0

  const filterClass = (pressed: boolean) => cn(
    "h-11 rounded-sm border px-4 text-sm normal-case",
    pressed
      ? "border-border-strong bg-surface-hover text-text"
      : "border-n-600 bg-transparent text-text-muted"
  )

  return (
    <Layout testId="index">
      {/* Designed to be the loudest thing on the screen: coverage-gaps.md #2
        * ranks this the highest-value untested component on the route, so it
        * carries four independent signals (banner, dimmed grid, disconnected
        * pills, title prefix) and no single CSS mistake can hide all four.
        * Amber, not red — a red band across the tally screen reads as "on air"
        * in peripheral vision (tokens §2.2). */}
      { !isHubConnected && (
        <div role="alert" className="-mx-4 mb-4 border-t-[3px] border-missing bg-surface px-4 py-3">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <AlertTriangle aria-hidden className="size-5 shrink-0 text-missing" />
            <div className="flex-1">
              <div className="text-base font-semibold uppercase tracking-wide text-missing">Hub disconnected</div>
              <p className="text-sm text-text">The information below might be outdated.</p>
              <p className="text-sm text-text-muted">Reconnecting automatically — you can also reload the page.</p>
            </div>
            <Button type="button" variant="outline" className="h-11 px-4" onClick={() => window.location.reload()}>Reload</Button>
          </div>
        </div>
      )}

      <div className="mb-4 flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap gap-2">
          <button type="button" data-testid="toggle-disconnected" aria-pressed={showDisconnected} className={filterClass(showDisconnected)} onClick={() => setShowDisconnected(!showDisconnected)}>
            {showDisconnected && (<span aria-hidden className="mr-2">✓</span>)}Show Disconnected
          </button>
          <button type="button" data-testid="toggle-unpatched" aria-pressed={showUnpatched} className={filterClass(showUnpatched)} onClick={() => setShowUnpatched(!showUnpatched)}>
            {showUnpatched && (<span aria-hidden className="mr-2">✓</span>)}Show Unpatched
          </button>
        </div>
        <div className="flex flex-wrap gap-2">
          <StatusPill testId="hub-connected" label="Hub" connected={isHubConnected} title={"Hub " + (isHubConnected ? "connected" : "disconnected")}>
            {isHubConnected ? 1 : 0}
          </StatusPill>
          <StatusPill testId="mixer-connected" label="Mixer" connected={isMixerConnected} title={"Video Mixer " + (isMixerConnected ? "connected" : "disconnected")}>
            {isMixerConnected ? 1 : 0}
          </StatusPill>
          {/* `n / total`, counted over the UNFILTERED list: counting over the
            * filtered one made the display agree with itself and hide a dead
            * lamp whenever "show disconnected" was off (§1.4). */}
          <StatusPill testId="tallies-connected" label="Tallies" connected={!!nrConnectedTallies} title={nrConnectedTallies + " connected tallies"}>
            {nrConnectedTallies === null ? "?" : `${nrConnectedTallies} / ${rawTallies.length}`}
          </StatusPill>
        </div>
      </div>

      {/* A filter that silently removes safety information has to announce
        * itself (§1.2). */}
      { nrHidden > 0 && (
        <div role="status" className="mb-4 flex items-center gap-3 text-sm text-missing">
          <span><span aria-hidden>⚠ </span>{nrHidden} {nrHidden === 1 ? "tally" : "tallies"} hidden by filters</span>
          <button type="button" className="border-0 bg-transparent text-missing underline" onClick={showAll}>Show all</button>
        </div>
      )}

      <div className={cn(!isHubConnected && "opacity-55")}>
        { onAirCount > 0 && (
          <div className="mb-4 flex items-center gap-3">
            <span className="text-xs font-semibold uppercase tracking-wide text-text-muted">On Air</span>
            <span aria-hidden className="h-px flex-1 bg-border" />
          </div>
        )}
        <div className="grid justify-start gap-8 [grid-template-columns:repeat(auto-fill,250px)]">
          { tallies === null ? (
            // a skeleton, not a spinner: it shows the layout that is coming.
            [0, 1, 2].map(i => <div key={i} className="h-40 w-[250px] animate-pulse rounded-md border border-border bg-surface-raised" />)
          ) : (
            tallies.map((tally, index) => (
              <TallyComponent
                tally={tally}
                key={`${tally.type}-${tally.name}`}
                // the spatial break IS the CVD-proof carrier (tokens §3.1)
                className={cn(index === onAirCount && onAirCount > 0 && "[grid-column-start:1] mt-8")}
              />
            ))
          )}
          { tallies !== null && <TallyCreate /> }
        </div>
        { tallies !== null && tallies.length === 0 && (
          <p className="mt-4 text-sm text-text-muted">
            { rawTallies.length === 0
              ? "No tallies yet. Tallies appear here once they connect to the hub."
              : `All ${rawTallies.length} tallies are hidden by your filters.` }
          </p>
        )}
      </div>
    </Layout>
  )
}

export default IndexPage;
