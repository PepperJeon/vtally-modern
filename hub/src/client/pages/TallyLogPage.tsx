import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useParams } from "react-router-dom"

import Layout from '../components/layout/Layout'
import MiniPage from '../components/layout/MiniPage'
import { NativeSelect } from '@/components/ui/native-select'
import useTallyLog from '../hooks/useTallyLog'
import useTallies from '../hooks/useTallies'
import LogType from '../../shared/domain/Log'
import { useT } from '../i18n'

type SeverityName = "info" | "status" | "warning" | "error"

const severityOf = (log: LogType): SeverityName =>
  log.isWarning() ? "warning" : log.isError() ? "error" : log.isStatus() ? "status" : "info"

// design-screens.md §3.2 — a 4px rail plus an 8% tint, not the full-width
// background fill this page used to have. Twenty stacked warnings were a solid
// amber block; the rail keeps the severity legible without lighting the room.
// The rail is a grid column, not a border, so it can never be collapsed and it
// lines up across rows.
const railClass: Record<SeverityName, string> = {
  info: "bg-n-600",
  status: "bg-n-100",
  warning: "bg-missing",
  error: "bg-live",
}
const rowClass: Record<SeverityName, string> = {
  info: "odd:bg-n-850/50",
  status: "bg-n-850",
  warning: "bg-[color-mix(in_srgb,var(--color-missing)_8%,transparent)]",
  error: "bg-[color-mix(in_srgb,var(--color-live)_8%,transparent)]",
}
// --color-live-text, not --color-live: plain live red is 4.41:1 on the surface
// and fails AA body (design-tokens.md §3.2). The rail may use the full red, it
// is non-text UI at 3:1.
const messageClass: Record<SeverityName, string> = {
  info: "text-text",
  status: "text-text",
  warning: "text-missing",
  error: "text-live-text",
}

const pad = (n: number, len = 2) => n.toString().padStart(len, "0")
// Local HH:mm:ss.SSS. The full ISO value stays in `datetime` and `title`, so
// nothing that reads the DOM loses information — but 20 of the 24 characters of
// an ISO string are identical down the whole page, and the operator is not
// standing in UTC.
const clockOf = (d: Date) =>
  `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)}`

/** The matched substring gets a highlight; everything else renders as-is. */
function Highlighted({ text, needle }: { text: string, needle: string }) {
  if (!needle) { return <>{text}</> }
  const parts: React.ReactNode[] = []
  const lower = text.toLowerCase()
  const lowerNeedle = needle.toLowerCase()
  let at = 0
  for (;;) {
    const found = lower.indexOf(lowerNeedle, at)
    if (found === -1) { break }
    if (found > at) { parts.push(text.slice(at, found)) }
    parts.push(<mark key={found} className="bg-n-700 text-inherit">{text.slice(found, found + needle.length)}</mark>)
    at = found + needle.length
  }
  parts.push(text.slice(at))
  return <>{parts}</>
}

type LogProps = {
  log: LogType
  idx: number
}

const Log = ({ log, idx, needle }: LogProps & { needle: string }) => {
  const severity = severityOf(log)
  const iso = log.dateTime.toISOString()

  return (
    <div
      data-testid={`log-line-${idx}`}
      data-severity={severity}
      className={
        "grid grid-cols-[4px_12ch_1fr] items-baseline gap-x-3 py-1 pr-3 font-mono text-sm " +
        rowClass[severity]
      }
    >
      <span aria-hidden className={"h-full min-h-5 " + railClass[severity]} />
      <time
        dateTime={iso}
        title={iso}
        className="tabular-nums text-n-500"
      >{clockOf(log.dateTime)}</time>
      <div className={"min-w-0 break-words " + messageClass[severity]}>
        <Highlighted text={log.message} needle={needle} />
      </div>
    </div>
  )
}

const filters = {
  all: () => true,
  problems: (log: LogType) => log.isWarning() || log.isError(),
  errors: (log: LogType) => log.isError(),
}
type FilterName = keyof typeof filters

const TallyLogPage = () => {
  const t = useT()
  const { tallyId } = useParams<{ tallyId: string }>()
  const logs = useTallyLog(tallyId)
  const tallies = useTallies()
  const tally = tallies?.find(tally => tally.getId() === tallyId)

  const [filter, setFilter] = useState<FilterName>("all")
  const [search, setSearch] = useState("")
  const scrollerRef = useRef<HTMLDivElement>(null)
  const seenRef = useRef(0)
  const [pinned, setPinned] = useState(true)
  const [unread, setUnread] = useState(0)

  const visible = useMemo(() => {
    const needle = search.trim().toLowerCase()
    const matches = filters[filter]
    return (logs || [])
      .map((log, idx) => ({ log, idx }))
      .filter(({ log }) => matches(log) && (!needle || log.message.toLowerCase().includes(needle)))
  }, [logs, filter, search])

  // Newest at the bottom. Follow it only while the reader is already there —
  // being yanked back down mid-read is the classic log viewer failure.
  useEffect(() => {
    const el = scrollerRef.current
    if (!el) { return }
    const added = Math.max(visible.length - seenRef.current, 0)
    seenRef.current = visible.length
    if (pinned) {
      el.scrollTop = el.scrollHeight
      setUnread(0)
    } else if (added > 0) {
      setUnread(n => n + added)
    }
    // `visible.length` only: re-running on `pinned` would scroll on a mere
    // scroll-position change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible.length])

  const handleScroll = () => {
    const el = scrollerRef.current
    if (!el) { return }
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 100
    setPinned(atBottom)
    if (atBottom) { setUnread(0) }
  }

  const jumpToLatest = () => {
    const el = scrollerRef.current
    if (el) { el.scrollTop = el.scrollHeight }
    setPinned(true)
    setUnread(0)
  }

  const isFiltering = filter !== "all" || search.trim() !== ""
  const total = logs?.length || 0

  const controls = (
    <div className="flex flex-wrap items-center gap-2">
      <NativeSelect
        aria-label={t.log.severityFilter}
        data-testid="log-filter"
        className="h-9 w-auto text-sm"
        value={filter}
        onChange={e => setFilter(e.target.value as FilterName)}
      >
        <option value="all">{t.log.filterAll}</option>
        <option value="problems">{t.log.filterProblems}</option>
        <option value="errors">{t.log.filterErrors}</option>
      </NativeSelect>
      <input
        type="search"
        aria-label={t.log.searchLabel}
        data-testid="log-search"
        placeholder={t.log.searchPlaceholder}
        value={search}
        onChange={e => setSearch(e.target.value)}
        className="h-9 w-44 rounded-sm border border-n-600 bg-n-900 px-3 font-sans text-sm text-text placeholder:text-n-500 focus-visible:border-border-strong focus-visible:shadow-focus focus-visible:outline-none"
      />
    </div>
  )

  const title = tallies === undefined
    ? undefined
    : tally
      ? t.log.title(tally.name)
      : t.log.titleNoTally

  return (
    <Layout testId="tally-log">
      <MiniPage
        title={title}
        addHeaderContent={controls}
        contentPadding="0"
        className="max-w-[1100px]"
      >
        <div className="relative">
          <div
            ref={scrollerRef}
            onScroll={handleScroll}
            className="max-h-[calc(100vh-16rem)] min-h-40 overflow-y-auto"
          >
            {logs === undefined ? (
              <div className="p-4">
                {[0, 1, 2, 3, 4, 5].map(i => (
                  <div key={i} className="my-1 h-5 animate-pulse rounded-xs bg-n-800" />
                ))}
              </div>
            ) : tallies !== undefined && !tally ? (
              <p className="p-6 text-center text-text-muted">
                {t.log.tallyNotFound(tallyId, text => (
                  <a href="/" className="text-text underline underline-offset-2">{text}</a>
                ))}
              </p>
            ) : total === 0 ? (
              <p className="p-6 text-center text-text-muted">
                {t.log.noEntries}<br />
                {t.log.noEntriesHint}
              </p>
            ) : visible.length === 0 ? (
              <p className="p-6 text-center text-text-muted">
                {t.log.noMatch(text => (
                  <button
                    type="button"
                    className="text-text underline underline-offset-2 focus-visible:shadow-focus focus-visible:outline-none"
                    onClick={() => { setFilter("all"); setSearch("") }}
                  >{text}</button>
                ))}
              </p>
            ) : (
              visible.map(({ log, idx }) => <Log key={idx} log={log} idx={idx} needle={search.trim()} />)
            )}
          </div>
          {unread > 0 && (
            <button
              type="button"
              onClick={jumpToLatest}
              className="absolute bottom-3 right-4 rounded-full bg-white px-3 py-1 text-sm font-medium text-n-950 shadow-overlay focus-visible:shadow-focus focus-visible:outline-none"
            >{t.log.newCount(unread)}</button>
          )}
        </div>
        {/* A filter that hides information has to say how much. */}
        <div className="border-t border-border px-4 py-2 text-sm tabular-nums text-text-muted">
          {t.log.lineCount(total)}{isFiltering && t.log.showingCount(visible.length)}
        </div>
      </MiniPage>
    </Layout>
  )
}

export default TallyLogPage;
