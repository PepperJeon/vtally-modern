// Every import here is type-only: this file declares the socket.io wire
// contract and is imported by both server and client, so it must never pull a
// runtime module across the boundary.
import type { AtemConfigurationSaveType } from "../mixer/atem/AtemConfiguration";
import type { MockConfigurationSaveType } from "../mixer/mock/MockConfiguration";
import type { ObsConfigurationSaveType } from "../mixer/obs/ObsConfiguration";
import type { RolandV8HDConfigurationSaveType } from "../mixer/rolandV8HD/RolandV8HDConfiguration";
import type { RolandV60HDConfigurationSaveType } from "../mixer/rolandV60HD/RolandV60HDConfiguration";
import type { FeelworldConfigurationSaveType } from "../mixer/feelworld/FeelworldConfiguration";
import type { VmixConfigurationSaveType } from "../mixer/vmix/VmixConfiguration";
import type { TallyObjectType, TallyType, WebTallyObjectType } from "../domain/Tally";
import type { ChannelList, ChannelSaveObject } from "../domain/Channel";
import type { LogObjectType } from "../domain/Log";
import type { TestConfigurationSaveType } from "../mixer/test/TestConfiguration";
import type { StateCommand } from "../tally/CommandCreator";
import type { TallyConfigurationObjectType } from "../tally/TallyConfiguration";
import type { TallyDeviceObjectType, TallyProgramProgressType, TallySettingsIniProgressType } from "../flasher/TallyDevice";

// events the server sends to the client
export interface ServerSentEvents {
    'tally.state': (data: {tallies: TallyObjectType[]}) => void
    'tally.log': (data: {tallyId: string, log: LogObjectType}) => void
    'tally.log.state': (data: {tallyId: string, logs: LogObjectType[]}[]) => void
    'webTally.state': (data: {tally: WebTallyObjectType, command: StateCommand}) => void
    'webTally.invalid': (tallyName: string) => void

    'mixer.state': (data: {isConnected: boolean}) => void
    'program.state': (data: {programs: ChannelList, previews: ChannelList}) => void
    'channel.state': (data: {channels: ChannelSaveObject[]}) => void

    'config.state.atem': (atemConfiguration: AtemConfigurationSaveType) => void
    'config.state.mock': (mockConfiguration: MockConfigurationSaveType) => void
    'config.state.obs': (obsConfiguration: ObsConfigurationSaveType) => void
    'config.state.rolandV8HD': (rolandV8HDConfiguration: RolandV8HDConfigurationSaveType) => void
    'config.state.rolandV60HD': (rolandV60HDConfiguration: RolandV60HDConfigurationSaveType) => void
    'config.state.feelworld': (feelworldConfiguration: FeelworldConfigurationSaveType) => void
    'config.state.vmix': (vmixConfiguration: VmixConfigurationSaveType) => void
    'config.state.tallyconfig': (defaultTallyConfiguration: TallyConfigurationObjectType) => void
    'config.state.mixer': (data: {mixerName: string, allowedMixers: string[]}) => void

    'flasher.device': (tallyDevice: TallyDeviceObjectType) => void
    'flasher.settingsIni.progress': (state: TallySettingsIniProgressType) => void
    'flasher.program.progress': (state: TallyProgramProgressType) => void
}

// events the client sends to the server
export interface ClientSentEvents {
    // NOTE: there is deliberately no `events.{mixer,program,config,tally,
    // channel,tallyLog}.unsubscribe` counterpart. Those six existed since the
    // fork and were never emitted by any client (verified by grep across
    // src/client/** and cypress/**); their handlers were marked "@TODO: not
    // used yet" server-side. SocketAwareEvent.register() already attaches its
    // own "disconnect" listener, so the pipes tear themselves down when the
    // socket goes away — the explicit unsubscribe was never load-bearing.
    // `events.webTally.unsubscribe` below IS live (WebTallyPage.tsx).
    'events.mixer.subscribe': () => void
    'events.program.subscribe': () => void
    'events.config.subscribe': () => void
    'events.tally.subscribe': () => void
    'events.channel.subscribe': () => void
    'events.tallyLog.subscribe': () => void
    'events.webTally.subscribe': (tallyName: string) =>  void
    'events.webTally.unsubscribe': (tallyName: string) =>  void

    'tally.patch': (tallyName: string, tallyType: TallyType, channelId: string|null) => void
    'tally.highlight': (tallyName: string, tallyType: TallyType) => void
    'tally.remove': (tallyName: string, tallyType: TallyType) => void
    'tally.create': (tallyName: string, channelId?: string) => void
    'tally.settings': (tallyName: string, tallyType: TallyType, settings: TallyConfigurationObjectType) => void

    'config.change.atem': (atemConfiguration: AtemConfigurationSaveType, newMixer?: "atem") => void
    'config.change.mock': (mockConfiguration: MockConfigurationSaveType, newMixer?: "mock") => void
    'config.change.null': (newMixer?: "null") => void
    'config.change.test': (testConfiguration: TestConfigurationSaveType, newMixer?: "test") => void
    'config.change.obs': (obsConfiguration: ObsConfigurationSaveType, newMixer?: "obs") => void
    'config.change.rolandV8HD': (rolandV8HDConfiguration: RolandV8HDConfigurationSaveType, newMixer?: "rolandV8HD") => void
    'config.change.rolandV60HD': (rolandV60HDConfiguration: RolandV60HDConfigurationSaveType, newMixer?: "rolandV60HD") => void
    'config.change.feelworld': (feelworldConfiguration: FeelworldConfigurationSaveType, newMixer?: "feelworld") => void
    'config.change.vmix': (vmixConfiguration: VmixConfigurationSaveType, newMixer?: "vmix") => void
    'config.change.tallyconfig': (configuration: TallyConfigurationObjectType) => void

    'flasher.device.get': () => void
    'flasher.settingsIni': (path: string, settingsIniString: string) => void
    'flasher.program': (path: string) => void
}

export interface ServerSideSocket {
    id: string
    
    emit<EventName extends keyof ServerSentEvents>(
        event: EventName,
        ...args: Parameters<ServerSentEvents[EventName]>
    ): boolean

    on<EventName extends keyof ClientSentEvents>(
        event: EventName,
        listener: ClientSentEvents[EventName]
    ): this
    on(event: "disconnect", listener: () => void) // @TODO: shouldn't this be defined in the parent?

    off<EventName extends keyof ClientSentEvents>(
        event: EventName,
        listener: ClientSentEvents[EventName]
    ): this
}

export interface ClientSideSocket {
    connected: boolean

    emit<EventName extends keyof ClientSentEvents>(
        event: EventName,
        ...args: Parameters<ClientSentEvents[EventName]>
    ): any

    on<EventName extends keyof ServerSentEvents>(
        event: EventName,
        listener: ServerSentEvents[EventName]
    ): any
    on(event: "disconnect", listener: () => void) : any // @TODO: shouldn't this be defined in the parent?
    on(event: "connect", listener: () => void) : any // @TODO: shouldn't this be defined in the parent?
    on(event: "connect_error", listener: () => void) : any // @TODO: shouldn't this be defined in the parent?
    // connect / disconnect / connect_error above are the complete v4 client
    // lifecycle. socket.io v4 does not emit connect_timeout, reconnecting,
    // reconnect_failed, reconnect or reconnect_error on the Socket (some moved
    // to the Manager, socket.io), and "disconnected" was never an event at all
    // — a typo for "disconnect". All six were declared here and registered in
    // useSocket.ts; declaring them lets a caller attach a listener that can
    // never fire, which is exactly how the outage signal got lost.

    off<EventName extends keyof ServerSentEvents>(
        event: EventName,
        listener: ServerSentEvents[EventName]
    ): any
    // These three mirror the `on` overloads above, and their absence was not
    // cosmetic: `on` accepted the lifecycle events while `off` did not, so
    // removing such a listener was a type error. WebTallyPage registered
    // connect/disconnect and could not detach them, leaking one closure per
    // visit — every reconnect then re-subscribed every tally the session had
    // ever opened. A type that permits attaching and forbids detaching will
    // produce a leak whatever the author intends.
    off(event: "disconnect", listener: () => void) : any
    off(event: "connect", listener: () => void) : any
    off(event: "connect_error", listener: () => void) : any
}