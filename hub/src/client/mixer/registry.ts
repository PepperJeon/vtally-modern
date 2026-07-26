import React from 'react'
import {
    ATEM_ID,
    FEELWORLD_ID,
    MOCK_ID,
    MixerId,
    NULL_ID,
    OBS_ID,
    ROLAND_V60HD_ID,
    ROLAND_V8HD_ID,
    TEST_ID,
    VMIX_ID,
} from '../../shared/mixer/ids'
import AtemSettings from './atem/react/AtemSettings'
import FeelworldSettings from './feelworld/react/FeelworldSettings'
import MockSettings from './mock/react/MockSettings'
import NullSettings from './null/react/NullSettings'
import ObsSettings from './obs/react/ObsSettings'
import RolandV60HDSettings from './rolandV60HD/react/RolandV60HDSettings'
import RolandV8HDSettings from './rolandV8HD/react/RolandV8HDSettings'
import TestSettings from './test/react/TestSettings'
import VmixSettings from './vmix/react/VmixSettings'

export type MixerRegistryEntry = {
    id: MixerId
    label: string
    Settings: React.ComponentType
}

// The single client-side list of selectable mixers. This replaces reading
// `id`/`label` off the `defaultProps` of <MixerSelection>'s children, which
// React 19 removes for function components. The labels used to live only in
// those defaultProps and now live here.
//
// Order is dropdown order and matches the previous JSX child order in
// ConfigPage. WHICH of these are offered is still decided by the server
// (MixerDriver.getAllowedMixers) and filtered in MixerSelection — dev-only
// connectors (Feelworld, Mock) must never render in a production build.
export const MIXERS = [
    { id: NULL_ID, label: "Off", Settings: NullSettings },
    { id: ATEM_ID, label: "ATEM by Blackmagic Design", Settings: AtemSettings },
    { id: MOCK_ID, label: "Built-In Mock for testing", Settings: MockSettings },
    { id: OBS_ID, label: "OBS Studio", Settings: ObsSettings },
    { id: ROLAND_V8HD_ID, label: "Roland V-8HD", Settings: RolandV8HDSettings },
    { id: ROLAND_V60HD_ID, label: "Roland V-60HD", Settings: RolandV60HDSettings },
    { id: FEELWORLD_ID, label: "Feelworld", Settings: FeelworldSettings },
    { id: TEST_ID, label: "Test Mixer", Settings: TestSettings },
    { id: VMIX_ID, label: "vMix", Settings: VmixSettings },
] satisfies MixerRegistryEntry[]

// ponytail: compile-time completeness instead of a test file — adding an id to
// shared/mixer/ids.ts without a registry entry fails `tsc` rather than silently
// dropping a mixer from the dropdown.
const _everyMixerIsRegistered: Exclude<MixerId, (typeof MIXERS)[number]['id']> extends never ? true : never = true
void _everyMixerIsRegistered
