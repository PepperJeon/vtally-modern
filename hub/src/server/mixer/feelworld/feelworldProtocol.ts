// Pure helpers for the Feelworld UDP tally protocol: 19-byte ASCII frames of
// the form `<T/F ADDR SEQ CMD DAT1 DAT2 DAT3 DAT4 SUM>`, hex-encoded, checksum
// is the mod-256 sum of the 7 payload bytes. See docs/design/feelworld-connector.md
// §1 for the protocol reference this was derived from.
//
// This is an independent implementation written from that prose/hex description,
// not a port of any GPL-licensed source — see the design doc §0 for why that
// distinction matters here.

const toHex = (n: number): string => n.toString(16).toUpperCase().padStart(2, "0")

export type FeelworldFrame = {
    direction: "T" | "F"
    addr: number
    seq: number
    cmd: number
    dat1: number
    dat2: number
    dat3: number
    dat4: number
    sum: number
}

export function computeChecksum(addr: number, seq: number, cmd: number, dat1: number, dat2: number, dat3: number, dat4: number): number {
    return (addr + seq + cmd + dat1 + dat2 + dat3 + dat4) % 256
}

export function buildFrame(direction: "T" | "F", addr: number, seq: number, cmd: number, dat1: number, dat2: number, dat3: number, dat4: number): string {
    const sum = computeChecksum(addr, seq, cmd, dat1, dat2, dat3, dat4)
    return `<${direction}${toHex(addr)}${toHex(seq)}${toHex(cmd)}${toHex(dat1)}${toHex(dat2)}${toHex(dat3)}${toHex(dat4)}${toHex(sum)}>`
}

export function correlationKey(addr: number, seq: number, cmd: number): string {
    return `${toHex(addr)}${toHex(seq)}${toHex(cmd)}`
}

// Returns null if the input isn't a well-formed 19-byte frame or its checksum
// doesn't match — callers should treat null as "drop this frame, log a warning".
export function parseFrame(data: Buffer | string): FeelworldFrame | null {
    const str = data.toString()
    if (str.length !== 19 || str[0] !== "<" || str[18] !== ">") {
        return null
    }
    const direction = str[1]
    if (direction !== "T" && direction !== "F") {
        return null
    }
    const hexPayload = str.slice(2, 18)
    if (!/^[0-9A-Fa-f]{16}$/.test(hexPayload)) {
        return null
    }
    const bytes = [0, 1, 2, 3, 4, 5, 6, 7].map(i => parseInt(hexPayload.slice(i * 2, i * 2 + 2), 16))
    const [addr, seq, cmd, dat1, dat2, dat3, dat4, sum] = bytes
    if (computeChecksum(addr, seq, cmd, dat1, dat2, dat3, dat4) !== sum) {
        return null
    }
    return { direction, addr, seq, cmd, dat1, dat2, dat3, dat4, sum }
}
