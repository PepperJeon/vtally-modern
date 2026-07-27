import React from 'react'

/**
 * The English table IS the type (`Translations = typeof en`), so a key missing
 * from `ko.tsx` is a compile error rather than a runtime fallback. That is the
 * whole reason this is a typed object and not i18next — see
 * docs/design/i18n-plan.md §2.2.
 *
 * Values are plain strings, or functions when a string interpolates or carries
 * inline markup. Functions rather than a `{{placeholder}}` mini-language:
 * TypeScript then checks the arity of both tables, and Korean is free to put
 * the pieces in a different order (`ko.tsx` does exactly that in several
 * places). No plural engine — English has exactly two plural sites and they
 * keep the ternary they already had; Korean drops it.
 *
 * NOT in here, deliberately (§4 of the plan): tally names, mixer channel names,
 * mixer product names, IP/port values, tally-settings.ini keys, and server/
 * firmware log lines.
 */

type Wrap = (text: string) => React.ReactNode

export const en = {
  meta: {
    title: "vTally Hub",
    // Cannot be swapped at runtime — JavaScript is off when it shows. Both
    // languages ship in index.html; this entry exists so the copy has one home.
    noscript: "You need to enable JavaScript to run this app.",
  },

  nav: {
    logoAlt: "vTally",
    tallies: "Tallies",
    configuration: "Configuration",
    flash: "Flash",
    language: "Language",
    languageName: "English",
  },

  common: {
    save: "Save",
    cancel: "Cancel",
    close: "Close",
    create: "Create",
    loading: "Loading",
    tryAgain: "Try again",
    reload: "Reload",
    closeDialog: "Close Dialog",
    default: "default",
    custom: "custom",
    off: "off",
    formHasErrors: "The form contains errors",
    invalid: "invalid",
  },

  index: {
    hubDisconnectedTitle: "Hub disconnected",
    hubDisconnectedBody: "The information below might be outdated.",
    hubDisconnectedHint: "Reconnecting automatically — you can also reload the page.",
    showDisconnected: "Show Disconnected",
    showUnpatched: "Show Unpatched",
    hub: "Hub",
    mixer: "Mixer",
    tallies: "Tallies",
    hubTitle: (connected: boolean) => `Hub ${connected ? "connected" : "disconnected"}`,
    mixerTitle: (connected: boolean) => `Video Mixer ${connected ? "connected" : "disconnected"}`,
    talliesTitle: (n: number | null) => `${n} connected tallies`,
    hiddenByFilters: (n: number) => `${n} ${n === 1 ? "tally" : "tallies"} hidden by filters`,
    showAll: "Show all",
    onAir: "On Air",
    noTallies: "No tallies yet. Tallies appear here once they connect to the hub.",
    allHidden: (n: number) => `All ${n} tallies are hidden by your filters.`,
  },

  tally: {
    // `tally.spec.ts:40` asserts the word "missing" case-insensitively. Under
    // the locale pin (i18n-plan.md §1.3) the suite always reads this table.
    state: {
      program: "on air",
      preview: "preview",
      idle: "idle",
      unpatched: "unpatched",
    },
    health: {
      connected: "connected",
      missing: "missing",
      disconnected: "disconnected",
    },
    // One template, not three concatenated fragments — Korean does not join a
    // list of attributes in English word order (i18n-plan.md §5).
    cardLabel: (name: string, state: string, health: string) => `${name}, ${state}, ${health}`,
  },

  channel: {
    unpatched: "(unpatched)",
    // App copy, not mixer data: the fallback label for a channel the mixer
    // gave no name for.
    numbered: (id: string) => `Channel ${id}`,
  },

  tallyMenu: {
    menu: (name: string) => `${name} Menu`,
    connect: "Connect",
    settings: "Settings",
    logs: "Logs",
    highlight: "Highlight",
    remove: "Remove",
    notConnected: "Tally is not connected",
    cannotRemoveConnected: "Connected Tallies can not be removed",
  },

  tallyCreate: {
    createWebTally: "Create Web Tally",
    hardwareWarning:
      "Hardware-Tallies, based on ESP8266, will automatically register and should not be created via this form.",
    description: "A Web Tally, that can be viewed in any browser.",
    name: "Name",
    errorEmpty: "Please enter a name",
    errorTooLong: (max: number) => `name must not be longer than ${max} characters`,
    errorExists: (name: string) => `a tally with the name ${name} already exists`,
  },

  tallySettings: {
    title: (name: string) => `${name} Settings`,
    operatorBrightness: "Operator Light Brightness",
    operatorColors: "Operator Light Colors",
    operatorDisplay: "Operator Display",
    stageBrightness: "Stage Light Brightness",
    stageColors: "Stage Light Colors",
    stageDisplay: "Stage Display",
    showsIdleState: "Shows Idle State",
    showsPreviewState: "Shows Preview State",
    operatorCannotBeOff: "Operator Light can not be turned off.",
  },

  tallyDefaults: {
    title: "Tally Defaults",
    operatorLight: "Operator Light",
    stageLight: "Stage Light",
    brightness: "Brightness",
    colours: "Colours",
    showsIdle: "Shows idle state",
    showsPreview: "Shows preview state",
  },

  colorScheme: {
    default: {
      name: "Default",
      description: "The traditional color scheme for Tally Lights.",
    },
    "yellow-pink": {
      name: "Yellow-Pink",
      description: "Intended to give better contrast for the red-green color blind (Protanopia, Deuteranopia).",
    },
  },

  mixerSelection: {
    title: "Video Mixer",
    description: "Select a Video Mixer to use.",
  },

  // Product names stay Latin in every language (i18n-plan.md §4); only the
  // surrounding words are translated. `configAtem`/`configObs`/… select these
  // options by VALUE (`select('obs')`), never by label, so the labels are safe
  // to translate.
  mixers: {
    null: "Off",
    atem: "ATEM by Blackmagic Design",
    mock: "Built-In Mock for testing",
    obs: "OBS Studio",
    rolandV8HD: "Roland V-8HD",
    rolandV60HD: "Roland V-60HD",
    feelworld: "Feelworld",
    test: "Test Mixer",
    vmix: "vMix",
  },

  atem: {
    title: "ATEM Configuration",
    description: "Connects to any ATEM device over network.",
    ip: "ATEM IP",
    port: "ATEM Port",
  },

  obs: {
    title: "OBS Studio Configuration",
    description: (link: Wrap) => <>Connects to OBS Studio over network. Needs {link("obs-websocket version 5")}, which is built into OBS 28 and newer. Version 4 of the plugin is no longer supported.</>,
    ip: "Obs IP",
    port: "Obs Port",
    portWarning: "OBS 28 and newer use 4455",
    password: "Obs Password",
    passwordWarning: "Leave empty if authentication is disabled",
    onAirStatus: "On-Air Status",
    // Selected by value (`select('record')`), so these labels are safe.
    liveMode: {
      always: "Always",
      alwaysHelp: "",
      stream: "Only when streaming",
      streamHelp: "Tally Lights will not show on-air status unless OBS is streaming.",
      record: "Only when recording",
      recordHelp: "Tally Lights will not show on-air status unless OBS is recording.",
      streamOrRecord: "When recording or streaming",
      streamOrRecordHelp: "Tally Lights will not show on-air status unless OBS is recording or streaming.",
    },
  },

  vmix: {
    title: "vMix",
    description: (link: Wrap) => <>Connects to any vMix over network using the {link("TCP API")}.</>,
    ip: "vMix IP",
    port: "vMix Port",
    // configVmix.spec.ts:50 asserts this exact copy through the
    // `vmix-port-warning` testid.
    portWarning: "This will probably not work. You entered the port of the Web UI, but the port for the TCPAPI is required. If you are unsure what this message means, leave the field blank to use the default.",
  },

  rolandV60HD: {
    title: "RolandV60HD SmartTally",
    description: "RolandV60HD Mixer with suport for Roland SmartTally",
    ip: "IP",
    port: "Port",
    requestInterval: "Request Interval",
  },

  rolandV8HD: {
    title: "Roland V-8HD",
    description: "Roland V-8HD Mixer connected via USB-Midi",
    requestInterval: "Request Interval",
  },

  feelworld: {
    title: "Feelworld (experimental, unverified)",
    description: "Feelworld video switcher tally over UDP. This connector has not been verified against real Feelworld hardware yet — only visible in dev builds.",
    ip: "IP",
    port: "Port",
    requestInterval: "Request Interval",
  },

  nullMixer: {
    title: "Null Configuration",
    description: "Off",
  },

  testMixer: {
    title: "Test Configuration",
    description: "A mixer used for automatic testing. You should never have to select it manually.",
  },

  mockMixer: {
    title: "Mock Configuration",
    description: "This simulates a Video Mixer by changing the channels randomly at a fixed time interval. It is intended for development, when you do not have a video mixer at hand, but serves no purpose in productive environments.",
    tickTime: "Tick Time",
    channelCount: "Channel Count",
    channelNames: "Channel Names",
  },

  flasher: {
    title: "Tally Flasher",
    intro: "This tool allows to update the configuration or software of a Hardware Tally Light.",
    reload: "reload",
    uploadDialogTitle: "Upload",
    uploadFailed: "The upload failed. Unplug the tally, plug it back in and try again.",
    softwareUpdate: "Software Update",
    firmwareNotAvailable: "Firmware not available on this hub",
    firmwareNotAvailableBody:
      "This copy of the hub does not ship the tally firmware, so it cannot check for or install software updates. Editing tally-settings.ini below still works normally.",
    lookedIn: "Looked in:",
    releasePackage: "(release package)",
    developmentCheckout: (code: Wrap) => <>(development checkout — run {code("make build")})</>,
    installRelease: "Install a release build of vTally to enable firmware updates.",
    docs: "Docs ↗",
    // manual_flasher.spec.ts:30,35 assert this exact copy (hardware-only, out
    // of the automated gate, but the string is still load-bearing there).
    upToDate: "The software on this Tally is up to date.",
    updateable: "The Software on this Tally can be updated.",
    updateNow: "Update now",
    editSettingsIni: "Edit tally-settings.ini",
    iniWillBeCreated: "tally-settings.ini does not exist yet and will be created.",
    progressLabel: "Flash progress",
    steps: {
      initializing: "Initializing",
      establishingConnection: "Establishing connection",
      uploadingFiles: "Uploading files",
      uploadingIni: "Uploading tally-settings.ini",
      rebooting: "Rebooting Tally to apply settings",
      uploadDone: "Upload Done",
      tallyConnected: "Tally is connected to Hub",
    },
  },

  flasherHelp: {
    // flasher.spec.ts:9 asserts this copy against `cy.get("body")`.
    noDevice: "Did not find any connected device.",
    possibleFixes: "Possible fixes",
    fixPlugUsb: "Plug the Tally to the computer that runs the hub via USB.",
    fixRemote: (em: Wrap) => <>The Tally has to be connected to the computer that {em("runs")} the hub. It does not work on {em("remote machines")}.</>,
    fixDataCable: (em: Wrap) => <>Some USB cables can just be used for charging. Make sure you use an {em("USB data cable")}.</>,
    fixDrivers: (link: Wrap) => <>If this has never worked from this computer ever, you might be missing the correct {link("USB drivers")}.</>,
    noLua: "Device was found, but could not determine if LUA is running.",
    fixSporadic: "This happens sporadically. It could be fixed by trying again.",
    fixFlashFirmware: "Make sure a firmware is flashed. For example with esptool.",
    fixResetButton: "Sometimes fault code on the Tally makes the firmware crash. Pushing the reset button might help.",
    deviceOn: "Device on",
  },

  settingsIni: {
    expertMode: "Expert Mode",
    expertModeHelp: "Expert mode shows every key in the file. Changes made there and in simple mode are the same settings.",
    fileName: "tally-settings.ini",
    name: "Name",
    ssid: "Ssid",
    password: "Password",
    hubIp: "Hub IP",
    hubPort: "Hub Port",
    showPassword: "Show password",
    hidePassword: "Hide password",
  },

  webTally: {
    waitingForData: "Waiting for data",
    highlight: "Highlight",
    onProgram: "On Program",
    onPreview: "On Preview",
    idle: "Idle",
    noMixerConnection: "No connection to Mixer",
    disconnected: "Disconnected — reconnecting",
    showSettings: "Show settings",
    enterFullscreen: "Enter fullscreen",
    exitFullscreen: "Exit fullscreen",
    notFound: (name: string, strong: Wrap) => <>Tally with name {strong(name)} not found.</>,
  },

  log: {
    title: (name: string) => `${name} · Logs`,
    titleNoTally: "Logs",
    severityFilter: "Severity filter",
    filterAll: "All",
    filterProblems: "Warnings & errors",
    filterErrors: "Errors",
    searchLabel: "Search log messages",
    searchPlaceholder: "Search…",
    tallyNotFound: (id: string, link: Wrap) => <>Tally “{id}” was not found. It may have been removed. {link("Back to the tally list")}</>,
    noEntries: "No log entries yet.",
    noEntriesHint: "Entries appear as the tally connects, reports state, or fails.",
    noMatch: (button: Wrap) => <>No lines match the current filter. {button("Clear filters")}</>,
    newCount: (n: number) => `↓ ${n} new`,
    lineCount: (total: number) => `${total} ${total === 1 ? "line" : "lines"}`,
    showingCount: (n: number) => ` · showing ${n}`,
  },

  brightness: {
    label: "Brightness",
    valueText: (v: number) => (v === 0 ? "off" : `${v} percent`),
    bubble: (v: number) => (v === 0 ? "off" : `${v}%`),
  },

  notFound: {
    title: "Page Not Found",
  },
}

export type Translations = typeof en

export default en
