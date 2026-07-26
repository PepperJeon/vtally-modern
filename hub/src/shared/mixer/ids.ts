// Canonical mixer id strings. This is the ONLY file that owns these literals —
// every Connector.ID on the server side and every Settings.tsx id prop on the
// client side references these rather than redeclaring them, so client and
// server can never drift apart on what a mixer is called over the wire.

export const ATEM_ID = "atem" as const
export const MOCK_ID = "mock" as const
export const NULL_ID = "null" as const
export const OBS_ID = "obs" as const
export const ROLAND_V60HD_ID = "rolandV60HD" as const
export const ROLAND_V8HD_ID = "rolandV8HD" as const
export const TEST_ID = "test" as const
export const VMIX_ID = "vmix" as const

export type MixerId =
  | typeof ATEM_ID
  | typeof MOCK_ID
  | typeof NULL_ID
  | typeof OBS_ID
  | typeof ROLAND_V60HD_ID
  | typeof ROLAND_V8HD_ID
  | typeof TEST_ID
  | typeof VMIX_ID
