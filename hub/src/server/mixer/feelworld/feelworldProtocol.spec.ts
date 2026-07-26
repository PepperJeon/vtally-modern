import { buildFrame, parseFrame, computeChecksum, correlationKey } from './feelworldProtocol'

describe('computeChecksum', () => {
    it("matches the connect-frame worked example from the design doc", () => {
        // ADDR=0x00 SEQ=0x00 CMD=0x68 DAT1=0x66 DAT2=0x01 DAT3=0x00 DAT4=0x00 -> 0xCF
        expect(computeChecksum(0x00, 0x00, 0x68, 0x66, 0x01, 0x00, 0x00)).toEqual(0xCF)
    })
    it("matches the tally-request checksum per §1.3's formula (design doc's own §1.7 worked example has an arithmetic error: it omits SEQ from the sum)", () => {
        // ADDR=0x00 SEQ=0x01 CMD=0xF1 DAT1=0x40 DAT2=0x01 DAT3=0x00 DAT4=0x00
        // Full 7-byte sum per §1.3 = 0x00+0x01+0xF1+0x40+0x01+0x00+0x00 = 0x133 -> 0x33 mod 256.
        // The doc's own worked example (§1.7) computes 0xF1+0x40+0x01=0x132->0x32, dropping SEQ.
        expect(computeChecksum(0x00, 0x01, 0xF1, 0x40, 0x01, 0x00, 0x00)).toEqual(0x33)
    })
    it("wraps at 256", () => {
        expect(computeChecksum(0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF)).toEqual((0xFF * 7) % 256)
    })
})

describe('buildFrame', () => {
    it("builds the connect frame worked example byte-for-byte", () => {
        expect(buildFrame("T", 0x00, 0x00, 0x68, 0x66, 0x01, 0x00, 0x00)).toEqual("<T00006866010000CF>")
    })
    it("builds the tally-request frame with the correct (SEQ-inclusive) checksum, not the doc's mis-summed example", () => {
        expect(buildFrame("T", 0x00, 0x01, 0xF1, 0x40, 0x01, 0x00, 0x00)).toEqual("<T0001F14001000033>")
    })
    it("is exactly 19 characters long", () => {
        expect(buildFrame("T", 0x00, 0x01, 0xF1, 0x40, 0x01, 0x00, 0x00).length).toEqual(19)
    })
})

describe('correlationKey', () => {
    it("is the 6 hex chars ADDR+SEQ+CMD", () => {
        expect(correlationKey(0x00, 0x01, 0xF1)).toEqual("0001F1")
    })
})

describe('parseFrame', () => {
    it("parses the connect-response worked example (as an F-prefixed frame)", () => {
        const frame = parseFrame("<F00006866010000CF>")
        expect(frame).toEqual({
            direction: "F",
            addr: 0x00,
            seq: 0x00,
            cmd: 0x68,
            dat1: 0x66,
            dat2: 0x01,
            dat3: 0x00,
            dat4: 0x00,
            sum: 0xCF,
        })
    })
    it("round-trips through buildFrame", () => {
        const built = buildFrame("T", 0x00, 0x2A, 0xF1, 0x40, 0x01, 0x00, 0x00)
        expect(parseFrame(built)).toEqual({
            direction: "T",
            addr: 0x00,
            seq: 0x2A,
            cmd: 0xF1,
            dat1: 0x40,
            dat2: 0x01,
            dat3: 0x00,
            dat4: 0x00,
            sum: computeChecksum(0x00, 0x2A, 0xF1, 0x40, 0x01, 0x00, 0x00),
        })
    })
    it("rejects a frame with a wrong checksum", () => {
        expect(parseFrame("<F00006866010000FF>")).toBeNull()
    })
    it("rejects the wrong length", () => {
        expect(parseFrame("<F00006866010000CF")).toBeNull()
    })
    it("rejects missing start/end markers", () => {
        expect(parseFrame("X00006866010000CFX")).toBeNull()
    })
    it("rejects a non-hex payload", () => {
        expect(parseFrame("<Fzz006866010000CF>")).toBeNull()
    })
    it("accepts a Buffer as well as a string", () => {
        expect(parseFrame(Buffer.from("<F00006866010000CF>"))).not.toBeNull()
    })
})
