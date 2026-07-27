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
    Settings: React.ComponentType
}

// The single client-side list of selectable mixers. This replaces reading
// `id`/`label` off the `defaultProps` of <MixerSelection>'s children, which
// React 19 removes for function components.
//
// Labels are NOT here: they are translatable copy and live in i18n/en.tsx under
// `mixers`, keyed by these same ids. MixerSelection resolves them. The `mixers`
// table is typed to MixerId, so a mixer added here without a label fails `tsc`.
//
// Order is dropdown order and matches the previous JSX child order in
// ConfigPage. WHICH of these are offered is still decided by the server
// (MixerDriver.getAllowedMixers) and filtered in MixerSelection — dev-only
// connectors (Feelworld, Mock) must never render in a production build.
export const MIXERS = [
    { id: NULL_ID, Settings: NullSettings },
    { id: ATEM_ID, Settings: AtemSettings },
    { id: MOCK_ID, Settings: MockSettings },
    { id: OBS_ID, Settings: ObsSettings },
    { id: ROLAND_V8HD_ID, Settings: RolandV8HDSettings },
    { id: ROLAND_V60HD_ID, Settings: RolandV60HDSettings },
    { id: FEELWORLD_ID, Settings: FeelworldSettings },
    { id: TEST_ID, Settings: TestSettings },
    { id: VMIX_ID, Settings: VmixSettings },
] satisfies MixerRegistryEntry[]

// ponytail: compile-time completeness instead of a test file — adding an id to
// shared/mixer/ids.ts without a registry entry fails `tsc` rather than silently
// dropping a mixer from the dropdown.
const _everyMixerIsRegistered: Exclude<MixerId, (typeof MIXERS)[number]['id']> extends never ? true : never = true
void _everyMixerIsRegistered
