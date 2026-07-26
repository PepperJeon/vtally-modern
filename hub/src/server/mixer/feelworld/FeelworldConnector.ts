import dgram from 'dgram'
import { FEELWORLD_ID } from '../../../shared/mixer/ids'
import { MixerCommunicator } from '../../lib/MixerCommunicator'
import { Connector } from '../../../shared/mixer/interfaces'
import FeelworldConfiguration from '../../../shared/mixer/feelworld/FeelworldConfiguration'
import { buildFrame, parseFrame, correlationKey } from './feelworldProtocol'

// Protocol reference: docs/design/feelworld-connector.md. ADDR is hardcoded to
// 0x00 (§1.9 — multi-device addressing is out of scope for v1).
const ADDR = 0x00
const CMD_CONNECT = 0x68
const CMD_TALLY = 0xF1

type PendingRequest = {
    key: string
    kind: "connect" | "tally"
    timer: NodeJS.Timeout
    ackFrame?: Buffer
}

// @see docs/design/feelworld-connector.md — net-new, independently implemented
// from the protocol description there (not ported from any GPL source).
class FeelworldConnector implements Connector {
    configuration: FeelworldConfiguration
    communicator: MixerCommunicator
    connected: boolean
    socket?: dgram.Socket
    pollHandle?: NodeJS.Timeout
    seq: number
    pending?: PendingRequest

    constructor(configuration: FeelworldConfiguration, communicator: MixerCommunicator) {
        this.configuration = configuration
        this.communicator = communicator
        this.connected = false
        this.seq = 0
    }

    connect() {
        console.log(`Connecting to Feelworld at ${this.configuration.getIp().toString()}:${this.configuration.getPort().toString()}`)
        this.socket = dgram.createSocket('udp4')
        this.socket.on('error', (err) => {
            console.error(`Feelworld socket error: ${err}`)
            this.markDisconnected()
        })
        this.socket.on('message', (msg) => this.onMessage(msg))

        this.sendConnectRequest()
        // §3.1: single UDP round-trip covers all inputs per poll, unlike Roland's
        // per-input HTTP polling, so one interval is enough.
        this.pollHandle = setInterval(() => this.sendTallyRequest(), this.configuration.getRequestInterval())
    }

    disconnect() {
        if (this.pollHandle) {
            clearInterval(this.pollHandle)
            this.pollHandle = undefined
        }
        if (this.pending) {
            clearTimeout(this.pending.timer)
            this.pending = undefined
        }
        if (this.socket) {
            this.socket.close()
            this.socket = undefined
        }
        console.log(`Feelworld connection closed`)
        this.markDisconnected()
    }

    isConnected() {
        return this.connected
    }

    private nextSeq(): number {
        const seq = this.seq
        this.seq = (this.seq + 1) % 256 // §1.4: 8-bit counter, wraps 0xFF -> 0x00
        return seq
    }

    private timeoutMs(): number {
        // §3.4: 3x the request interval, minimum 1500ms
        return Math.max(1500, this.configuration.getRequestInterval() * 3)
    }

    private send(cmd: number, dat1: number, dat2: number, dat3: number, dat4: number, kind: "connect" | "tally") {
        if (!this.socket || this.pending) {
            // §3.6: never more than one outstanding request — skip this tick,
            // the next scheduled poll will try again.
            return
        }
        const seq = this.nextSeq()
        const frame = buildFrame("T", ADDR, seq, cmd, dat1, dat2, dat3, dat4)
        const key = correlationKey(ADDR, seq, cmd)
        const timer = setTimeout(() => this.onTimeout(key), this.timeoutMs())
        this.pending = { key, kind, timer }
        this.socket.send(frame, this.configuration.getPort().toNumber(), this.configuration.getIp().toString())
    }

    private sendConnectRequest() {
        this.send(CMD_CONNECT, 0x66, 0x01, 0x00, 0x00, "connect")
    }

    private sendTallyRequest() {
        this.send(CMD_TALLY, 0x40, 0x01, 0x00, 0x00, "tally")
    }

    private onTimeout(key: string) {
        if (this.pending?.key !== key) {
            return // already resolved, or superseded
        }
        this.pending = undefined
        // §3.4: no retry/backoff — the next scheduled poll is the retry.
        // ponytail: fixed-interval retry, add backoff only if this connector is
        // ever used against many devices at once or over a lossy link.
        this.markDisconnected()
    }

    private markConnected() {
        if (!this.connected) {
            this.connected = true
            this.communicator.notifyMixerIsConnected()
        }
    }

    private markDisconnected() {
        if (this.connected) {
            this.connected = false
            this.communicator.notifyMixerIsDisconnected()
        }
    }

    private onMessage(msg: Buffer) {
        if (!this.pending) {
            return
        }

        if (this.pending.kind === "tally" && this.pending.ackFrame) {
            // Second datagram of a tally exchange — shape depends on which of
            // §1.7's two assumptions this device turns out to use.
            clearTimeout(this.pending.timer)
            this.pending = undefined
            this.handleTallyPayload(msg)
            return
        }

        const frame = parseFrame(msg)
        if (!frame) {
            console.warn(`Feelworld: dropping malformed or checksum-invalid frame: ${msg.toString()}`)
            return
        }
        if (correlationKey(frame.addr, frame.seq, frame.cmd) !== this.pending.key) {
            return // not the response we're waiting for
        }

        if (this.pending.kind === "connect") {
            clearTimeout(this.pending.timer)
            this.pending = undefined
            // §1.6: DAT2=0x01 means the handshake was accepted; anything else
            // is a rejected handshake even though the frame correlated.
            if (frame.dat2 === 0x01) {
                this.markConnected()
            }
        } else {
            // First (ack) datagram of a tally exchange — keep waiting for the second.
            this.pending.ackFrame = msg
        }
    }

    private handleTallyPayload(secondFrame: Buffer) {
        let program: number
        let preview: number
        if (secondFrame.length === 22) {
            // ASSUMPTION B (RGBlink-shaped): raw payload, values are 0-indexed on the wire, +1'd
            preview = secondFrame[0] + 1
            program = secondFrame[2] + 1
        } else {
            // ASSUMPTION A (multitally-shaped): literal byte values, no offset
            program = secondFrame[0]
            preview = secondFrame[2]
        }
        this.markConnected()
        this.communicator.notifyProgramPreviewChanged([program.toString()], [preview.toString()])
    }

    static readonly ID = FEELWORLD_ID
}

export default FeelworldConnector
