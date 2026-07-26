// FeelworldConnector.spec.js
//
// Mock-server integration tests. A real UDP server is bound to an OS-assigned
// ephemeral port (mirrors VmixConnector.spec.js / RolandV60HDConnector.spec.js);
// the mock's frame encode/decode logic below is written independently of
// ./feelworldProtocol so a shared bug in both couldn't cancel itself out.
//
// What CANNOT be validated by this suite (see docs/design/feelworld-connector.md
// §4.2) — this is a deliverable, not an apology:
//   - Which of §1.7's Assumption A or Assumption B is what real Feelworld
//     firmware actually sends. Both are tested here in isolation; only a
//     packet capture against real hardware (or a manufacturer protocol doc)
//     can say which branch to keep and which to delete.
//   - Whether real hardware uses ADDR=0x00 and responds on the assumed port at
//     all, or requires per-unit configuration.
//   - Real-world UDP round-trip latency and packet loss on Wi-Fi vs. wired,
//     i.e. whether the 1000ms/1500ms defaults in §3.1/§3.4 are well-tuned.
//   - Any interaction with the device's own tally-relay behaviour, if it has one.
//   - Actual input count per model (L1 vs. L2 Plus).
//   - Firmware-version-dependent protocol differences.
//
// This connector is dev-gated in MixerDriver.getAllowedMixers until the above
// is resolved against real hardware — see docs/design/feelworld-connector.md §5.

import FeelworldConnector from './FeelworldConnector'
import FeelworldConfiguration from '../../../shared/mixer/feelworld/FeelworldConfiguration'
import dgram from 'dgram'

const waitUntil = (fn) => {
    return new Promise((resolve) => {
        const interval = setInterval(() => {
            if (fn() === true) {
                clearInterval(interval)
                resolve()
            }
        }, 20)
    })
}

class MockCommunicator {
    constructor() {
        this.isConnected = false
    }
    notifyProgramPreviewChanged(programs, previews) {
        this.programs = programs
        this.previews = previews
    }
    notifyMixerIsConnected() {
        this.isConnected = true
    }
    notifyMixerIsDisconnected() {
        this.isConnected = false
    }
}

function createFeelworldCommunicator(ip, port, requestInterval = 100) {
    const communicator = new MockCommunicator()
    const configuration = new FeelworldConfiguration()
    configuration.setIp(ip)
    configuration.setPort(port)
    configuration.setRequestInterval(requestInterval)
    const feelworld = new FeelworldConnector(configuration, communicator)
    return [feelworld, communicator]
}

// Mock-server-side frame helpers — deliberately NOT imported from
// ./feelworldProtocol, see file header.
const hex = (n) => n.toString(16).toUpperCase().padStart(2, "0")
function mockChecksum(addr, seq, cmd, dat1, dat2, dat3, dat4) {
    return (addr + seq + cmd + dat1 + dat2 + dat3 + dat4) % 256
}
function mockFrame(direction, addr, seq, cmd, dat1, dat2, dat3, dat4, sumOverride) {
    const sum = sumOverride !== undefined ? sumOverride : mockChecksum(addr, seq, cmd, dat1, dat2, dat3, dat4)
    return `<${direction}${hex(addr)}${hex(seq)}${hex(cmd)}${hex(dat1)}${hex(dat2)}${hex(dat3)}${hex(dat4)}${hex(sum)}>`
}
function parseIncoming(str) {
    return {
        addr: parseInt(str.slice(2, 4), 16),
        seq: parseInt(str.slice(4, 6), 16),
        cmd: parseInt(str.slice(6, 8), 16),
        dat1: parseInt(str.slice(8, 10), 16),
        dat2: parseInt(str.slice(10, 12), 16),
        dat3: parseInt(str.slice(12, 14), 16),
        dat4: parseInt(str.slice(14, 16), 16),
    }
}

describe('FeelworldConnector', () => {
    let mockServer
    let config

    beforeEach(() => {
        config = {
            respondToConnect: true,
            connectDat2: 0x01,
            respondToTally: true,
            tallyShape: 'A',
            program: 3,
            preview: 5,
            badChecksum: false,
            receivedFrames: [],
        }
        mockServer = dgram.createSocket('udp4')
        mockServer.on('message', (msg, rinfo) => {
            const str = msg.toString()
            config.receivedFrames.push(str)
            const { addr, seq, cmd, dat1, dat2, dat3, dat4 } = parseIncoming(str)
            if (cmd === 0x68) {
                if (!config.respondToConnect) return
                const sum = config.badChecksum ? 0x00 : undefined
                mockServer.send(mockFrame('F', addr, seq, cmd, dat1, config.connectDat2, dat3, dat4, sum), rinfo.port, rinfo.address)
            } else if (cmd === 0xF1) {
                if (!config.respondToTally) return
                mockServer.send(mockFrame('F', addr, seq, cmd, dat1, dat2, dat3, dat4), rinfo.port, rinfo.address)
                if (config.tallyShape === 'B') {
                    const payload = Buffer.alloc(22)
                    payload[0] = config.preview - 1
                    payload[2] = config.program - 1
                    mockServer.send(payload, rinfo.port, rinfo.address)
                } else {
                    const payload = Buffer.alloc(19)
                    payload[0] = config.program
                    payload[2] = config.preview
                    mockServer.send(payload, rinfo.port, rinfo.address)
                }
            }
        })
        return new Promise((resolve, reject) => {
            mockServer.bind(0, 'localhost', (error) => {
                if (error) reject(error)
                else resolve()
            })
        })
    })

    afterEach(() => {
        return new Promise((resolve) => mockServer.close(resolve))
    })

    test('sends a well-formed, correctly checksummed connect frame', async () => {
        const address = mockServer.address()
        const [feelworld] = createFeelworldCommunicator(address.address, address.port)
        try {
            feelworld.connect()
            await waitUntil(() => config.receivedFrames.length > 0)
            const frame = config.receivedFrames[0]
            expect(frame).toMatch(/^<T[0-9A-F]{16}>$/)
            expect(frame).toEqual("<T00006866010000CF>")
        } finally {
            feelworld.disconnect()
        }
    })

    test('connects when the device accepts the handshake (DAT2=0x01)', async () => {
        const address = mockServer.address()
        const [feelworld, communicator] = createFeelworldCommunicator(address.address, address.port)
        try {
            feelworld.connect()
            await waitUntil(() => feelworld.isConnected())
            expect(communicator.isConnected).toBe(true)
        } finally {
            feelworld.disconnect()
        }
    })

    test('does not connect when the device rejects the handshake (DAT2=0x00)', async () => {
        config.connectDat2 = 0x00
        config.respondToTally = false // isolate: a tally ack could also flip it connected
        const address = mockServer.address()
        const [feelworld, communicator] = createFeelworldCommunicator(address.address, address.port, 50)
        try {
            feelworld.connect()
            await new Promise(resolve => setTimeout(resolve, 300))
            expect(feelworld.isConnected()).toBe(false)
            expect(communicator.isConnected).toBe(false)
        } finally {
            feelworld.disconnect()
        }
    })

    test('parses tally shape A (two 19-byte frames, literal byte values)', async () => {
        config.tallyShape = 'A'
        config.program = 3
        config.preview = 5
        const address = mockServer.address()
        const [feelworld, communicator] = createFeelworldCommunicator(address.address, address.port)
        try {
            feelworld.connect()
            await waitUntil(() => communicator.programs !== undefined)
            expect(communicator.programs).toEqual(["3"])
            expect(communicator.previews).toEqual(["5"])
        } finally {
            feelworld.disconnect()
        }
    })

    test('parses tally shape B (19-byte ack + 22-byte raw payload, +1 offset)', async () => {
        config.tallyShape = 'B'
        config.program = 2
        config.preview = 4
        const address = mockServer.address()
        const [feelworld, communicator] = createFeelworldCommunicator(address.address, address.port)
        try {
            feelworld.connect()
            await waitUntil(() => communicator.programs !== undefined)
            expect(communicator.programs).toEqual(["2"])
            expect(communicator.previews).toEqual(["4"])
        } finally {
            feelworld.disconnect()
        }
    })

    test('sequence numbers increment per request and wrap 0xFF -> 0x00', async () => {
        const address = mockServer.address()
        const [feelworld] = createFeelworldCommunicator(address.address, address.port, 5)
        try {
            feelworld.connect()
            // 1 connect request + 256 tally requests walks SEQ all the way around back to 0x00
            await waitUntil(() => config.receivedFrames.length >= 257)
            const seqs = config.receivedFrames.slice(0, 257).map(f => f.slice(4, 6))
            expect(seqs[0]).toEqual("00") // connect request
            expect(seqs[1]).toEqual("01") // first tally request
            expect(seqs[256]).toEqual("00") // wrapped back to 0x00 after 256 requests
        } finally {
            feelworld.disconnect()
        }
    }, 15000)

    test('marks disconnected after a tally request times out, and reconnects on the next good response', async () => {
        const address = mockServer.address()
        const [feelworld, communicator] = createFeelworldCommunicator(address.address, address.port, 100)
        try {
            feelworld.connect()
            await waitUntil(() => feelworld.isConnected())
            config.respondToTally = false
            await waitUntil(() => communicator.isConnected === false)
            expect(feelworld.isConnected()).toBe(false)
            config.respondToTally = true
            await waitUntil(() => communicator.isConnected === true)
            expect(feelworld.isConnected()).toBe(true)
        } finally {
            feelworld.disconnect()
        }
    }, 10000)

    test('drops a frame with an invalid checksum instead of treating it as a valid response', async () => {
        config.badChecksum = true
        config.respondToTally = false // isolate: only the corrupted connect ack is in play
        const address = mockServer.address()
        const [feelworld, communicator] = createFeelworldCommunicator(address.address, address.port, 50)
        try {
            feelworld.connect()
            await new Promise(resolve => setTimeout(resolve, 300))
            expect(feelworld.isConnected()).toBe(false)
            expect(communicator.isConnected).toBe(false)
        } finally {
            feelworld.disconnect()
        }
    })
})
