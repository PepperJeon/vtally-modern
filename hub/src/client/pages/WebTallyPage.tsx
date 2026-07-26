import React, { useEffect, useState } from 'react'
import { withRouter } from "react-router"
import { socket } from '../hooks/useSocket'
import useSocketInfo from '../hooks/useSocketInfo'
import { WebTally, WebTallyObjectType } from '../../shared/domain/Tally'
import { useParams } from "react-router-dom"
import { Maximize, Minimize, SlidersHorizontal } from 'lucide-react'
import { FullScreen, useFullScreenHandle } from "react-full-screen"
import NoSleepJs from 'nosleep.js'
import { StateCommand } from '../../shared/tally/CommandCreator'
import PageNotFound from './PageNotFound'
import TallySettings from '../components/TallySettings'
import { useDefaultTallyConfiguration } from '../hooks/useConfiguration'
import ColorSchemes from '../../shared/tally/ColorScheme'
import { contrastText, dim, fade } from '../../shared/lib/color'

/** `--color-n-800`, the neutral fill for "do not trust this screen". */
const NEUTRAL_FILL = "#1E242B"

function useWebTally(tallyName: string) {
  const [tally, setTally] = useState<WebTally>()
  const [command, setCommand] = useState<StateCommand>()
  const [isValid, setIsValid] = useState<boolean>()

  useEffect(() => {
    const onChange = ({tally: tallyData, command} : {tally: WebTallyObjectType, command: StateCommand}) => {
      const tally = WebTally.fromJson(tallyData)
      setTally(tally)
      setCommand(command)
    }

    const onInvalid = (theTallyName: string) => {
      if (tallyName === theTallyName) {
        setTally(undefined)
        setCommand(undefined)
        setIsValid(false)
      }
    }

    const onDisconnect = () => {
      socket.off('webTally.state', onChange)
      socket.off('webTally.invalid', onInvalid)
      socket.connected && socket.emit('events.webTally.unsubscribe', tallyName)
      setTally(undefined)
      setCommand(undefined)
      setIsValid(true)
    }

    const onConnect = () => {
      socket.emit('events.webTally.subscribe', tallyName)
      socket.on('webTally.state', onChange)
      socket.on('webTally.invalid', onInvalid)
    }

    socket.on('connect', onConnect)
    socket.on('disconnect', onDisconnect)

    socket.connected && onConnect()
    return () => {
      // cleanup
      onDisconnect()
    }
  }, [tallyName])

  return {
    tally,
    command,
    isValid,
  }
}

/**
 * The phone taped next to a camera — design-screens.md §4. Legibility at three
 * metres in a dark studio beats aesthetics and beats consistency with the rest
 * of the product, so this route has no Layout chrome at all.
 *
 * The colour maths is LOGIC, not styling: the fill is an arbitrary rgb() string
 * that only exists at runtime, dimmed by a user-set brightness, and the text
 * colour is derived from whatever that produced. `shared/lib/color.ts` replaces
 * MUI's darken/fade/getContrastText (design-components.md §4).
 *
 * `dim()` is called ONCE and its result drives both the background and — via
 * contrastText — the text colour (§4.3). That coupling is deliberate: a
 * brightness bug that only moved the background could hide, one that also
 * inverts the text cannot. Never derive the text colour from the undimmed
 * colour as a shortcut.
 */
function WebTallyPage() {
  const { tallyId } = useParams<{tallyId: string}>()
  const tallyName = tallyId.replace(/^web-/, "")
  const { tally, command, isValid } = useWebTally(tallyName)
  const isHubConnected = useSocketInfo()
  const defaultTallyConfiguration = useDefaultTallyConfiguration()
  const [settingsOpen, setSettingsOpen] = useState(false)
  const isLoading = !tally || !command
  const handle = useFullScreenHandle()
  // @TODO: nosleep is quite hacky, so use https://caniuse.com/?search=Wake%20Lock%20API sooner or later
  const [noSleep] = useState(new NoSleepJs())
  useEffect(() => {return () => {
    // make sure no-sleep is turned off when unmounted
    noSleep.disable()
  }}, [noSleep])

  if (isValid === false) {
    return <PageNotFound>Tally with name <strong>{tallyName}</strong> not found.</PageNotFound>
  }

  const colorSchemeId = tally?.configuration?.getOperatorColorScheme() || defaultTallyConfiguration?.getOperatorColorScheme() || "default"
  const colorScheme = ColorSchemes.getById(colorSchemeId)
  let isHighlight = false
  let dataColor = ""
  let bgColor = NEUTRAL_FILL
  let text = ""
  let showSpinner = false
  if (isLoading) {
    dataColor = "loading"
    text = "Waiting for data"
    showSpinner = true
  } else if (command === "highlight") {
    isHighlight = true
    dataColor = "highlight"
    text = "Highlight"
  } else if (command === "on-air") {
    bgColor = colorScheme.program.toCss()
    text = "On Program"
    dataColor = "program"
  } else if (command === "preview") {
    bgColor = colorScheme.preview.toCss()
    text = "On Preview"
    dataColor = "preview"
  } else if (command === "release") {
    bgColor = colorScheme.idle.toCss()
    dataColor = "idle"
    text = "Idle"
  } else if (command === "unknown") {
    dataColor = "unknown"
    text = "No connection to Mixer"
    showSpinner = true
  } else {
    // if typescript fails here, we forgot a case
    ((a: never) => {})(command)
  }

  const brightness = (tally?.configuration?.getOperatorLightBrightness() || defaultTallyConfiguration?.getOperatorLightBrightness() || 100) / 100
  bgColor = dim(bgColor, brightness)
  const textColor = contrastText(bgColor)
  // chrome is visible if you look for it, invisible if you are not (§4.1)
  const chromeColor = fade(textColor, 0.7)

  const enterFullScreen = () => {
    noSleep.enable()
    handle.enter()
  }
  const exitFullScreen = () => {
    noSleep.disable()
    handle.exit()
  }

  const iconButtonClass = "absolute flex size-11 items-center justify-center rounded-sm border-0 bg-transparent text-current focus-visible:shadow-focus focus-visible:outline-none"

  return <FullScreen handle={handle}>
    <div
      data-testid="page-tally-web"
      data-color={dataColor}
      data-brightness={brightness}
      className={
        "relative flex h-[100dvh] w-screen flex-col items-center justify-center p-4 text-center" +
        // brightness never applies to the strobe: locate is "which light is
        // this?", and dimming it defeats the request (§4.3 note 4)
        (isHighlight ? " animate-webtally-highlight" : "")
      }
      style={{backgroundColor: bgColor, color: chromeColor}}
    >
      { showSpinner ? (<>
        <div
          role="progressbar"
          aria-label="Loading"
          className="animate-spin rounded-full border-[0.06em] border-current border-t-transparent opacity-70"
          style={{width: "min(30vw, 30vh)", height: "min(30vw, 30vh)", fontSize: "min(30vw, 30vh)"}}
        />
        {/* both "loading" and "unknown" mean do not trust this screen; only the
          * word distinguishes them, so the word has to be large (§4.2 note 2) */}
        <div className="mt-6 text-4xl font-semibold">{text}</div>
        { !isHubConnected && (
          // §4.7: without this line a lost socket is indistinguishable from a
          // slow first load — both render data-color="loading".
          <div className="mt-4 text-lg text-missing"><span aria-hidden>⚠ </span>Disconnected — reconnecting</div>
        )}
      </>) : (<>
        <div
          className="font-bold leading-none tracking-tight [overflow-wrap:anywhere]"
          style={{color: textColor, fontSize: "clamp(2rem, 12vw, 8rem)"}}
        >{(tally && tally.name) || ""}</div>
        { text && (
          <div className="mt-4" style={{fontSize: "clamp(1rem, 5vw, 2.5rem)"}}>{text}</div>
        )}
        <button
          type="button"
          data-testid="tally-settings-link"
          className={iconButtonClass + " right-4 top-4"}
          aria-label="Show settings"
          onClick={() => setSettingsOpen(true)}
        >
          <SlidersHorizontal className="size-6" />
        </button>
        <TallySettings tally={tally} open={settingsOpen} onClose={() => setSettingsOpen(false)} />
        { handle.active ? (
          <button type="button" className={iconButtonClass + " bottom-4 right-4"} aria-label="Exit fullscreen" onClick={exitFullScreen}>
            <Minimize className="size-6" />
          </button>
        ) : (
          <button type="button" className={iconButtonClass + " bottom-4 right-4"} aria-label="Enter fullscreen" onClick={enterFullScreen}>
            <Maximize className="size-6" />
          </button>
        )}
      </>)}
    </div>
  </FullScreen>
}

export default withRouter(WebTallyPage)
