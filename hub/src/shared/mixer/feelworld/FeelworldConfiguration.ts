import ipAddress, {IpAddress} from '../../domain/IpAddress'
import ipPort, {IpPort} from '../../domain/IpPort'
import {Configuration} from '../interfaces'

export type FeelworldConfigurationSaveType = {
    ip: string
    port: number
    requestInterval: number
}

class FeelworldConfiguration extends Configuration {
    ip: IpAddress
    port: IpPort
    requestInterval: number

    constructor() {
        super()
        this.ip = FeelworldConfiguration.defaultIp
        this.port = FeelworldConfiguration.defaultPort
        this.requestInterval = FeelworldConfiguration.defaultRequestInterval
    }

    fromJson(data: FeelworldConfigurationSaveType): void {
        this.loadIpAddress("ip", this.setIp.bind(this), data)
        this.loadIpPort("port", this.setPort.bind(this), data)
        this.loadNumber("requestInterval", this.setRequestInterval.bind(this), data)
    }
    toJson(): FeelworldConfigurationSaveType {
        return {
            ip: this.ip.toString(),
            port: this.port.toNumber(),
            requestInterval: this.requestInterval,
        }
    }
    clone(): FeelworldConfiguration {
        const clone = new FeelworldConfiguration()
        clone.fromJson(this.toJson())
        return clone
    }

    setIp(ip: IpAddress | string | null) {
        if (typeof ip === "string") {
            ip = ipAddress(ip)
        } else if (ip === null) {
            ip = FeelworldConfiguration.defaultIp
        }
        this.ip = ip

        return this
    }
    getIp() {
        return this.ip
    }

    setPort(port: IpPort | string | number | null) {
        if (typeof port === "number" || typeof port === "string") {
            port = ipPort(port)
        } else if (port === null) {
            port = FeelworldConfiguration.defaultPort
        }
        this.port = port

        return this
    }
    getPort() {
        return this.port
    }

    setRequestInterval(requestInterval: number | string | null){
      if(requestInterval === null){
        requestInterval = FeelworldConfiguration.defaultRequestInterval
      }else if(typeof requestInterval === "string"){
        requestInterval = parseInt(requestInterval, 10)
        if(!Number.isFinite(requestInterval)) {
            throw new Error(`Could not parse "${requestInterval}" into a number.`)
        }
      }
      this.requestInterval = requestInterval
    }

    getRequestInterval(){
      return this.requestInterval
    }

    // ponytail: port 1000 is a starting guess documented in docs/design/feelworld-connector.md
    // §1.8 (unconfirmed by the protocol doc, not by any vendor spec) — revise once tested against
    // a real L1/L2 Plus.
    private static readonly defaultIp = ipAddress("127.0.0.1")
    private static readonly defaultPort = ipPort(1000)
    private static readonly defaultRequestInterval = 1000
}

export default FeelworldConfiguration
