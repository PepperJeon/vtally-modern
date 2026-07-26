import ipAddress, {IpAddress} from "../domain/IpAddress"
import ipPort, { IpPort } from "../domain/IpPort"

export interface Connector {
    connect() : void
    disconnect() : void
    isConnected(): boolean
}

export abstract class Configuration {
    abstract fromJson(data: object): void
    abstract toJson(): object
    abstract clone(): Configuration

    // What MixerDriver compares to decide whether a config change is worth restarting
    // the connector over. Defaults to toJson() — for every real mixer that's exactly
    // right, since everything in toJson() is connection/behaviour settings (a changed
    // requestInterval, ip, etc. should restart the connector). Override this, not
    // toJson(), if your config's toJson() also carries state that isn't a restart
    // reason (see TestConfiguration, where toJson() doubles as the wire format for
    // live program/preview values pushed in from the cypress plugin).
    getRestartFingerprint(): object {
        return this.toJson()
    }

    protected loadIpAddress(fieldName: string, setter: (value:IpAddress) => void, data: object) {
        const value = data[fieldName]
        if (value === undefined || value === null) {
            // value is not set
            return
        } else if (typeof value === "string") {
            try {
                const ip = ipAddress(value)
                setter(ip)
            } catch (err) {
                console.error(`error loading property "${fieldName}" of configuration: ${err}`)
                return
            }
        } else {
            console.error(`error loading property "${fieldName}": invalid type ${typeof value}`)
        }
    }

    protected loadIpPort(fieldName: string, setter: (value:IpPort) => void, data: object) {
        const value = data[fieldName]
        if (value === undefined || value === null) {
            // value is not set
            return
        } else if (typeof value === "number") {
            try {
                const port = ipPort(value)
                setter(port)
            } catch (err) {
                console.error(`error loading property "${fieldName}" of configuration: ${err}`)
                return
            }
        } else {
            console.error(`error loading property "${fieldName}": invalid type ${typeof value}`)
        }
    }

    protected loadNumber(fieldName: string, setter: (value:number) => void, data: object) {
        const value = data[fieldName]
        if (value === undefined || value === null) {
            // value is not set
            return
        } else if (typeof value === "number") {
            try {
                setter(value)
            } catch (err) {
                console.error(`error loading property "${fieldName}" of configuration: ${err}`)
                return
            }
        } else {
            console.error(`error loading property "${fieldName}": invalid type ${typeof value}`)
        }
    }

    protected loadString(fieldName: string, setter: (value:string) => void, data: object) {
        const value = data[fieldName]
        if (value === undefined || value === null) {
            // value is not set
            return
        } else if (typeof value === "string") {
            try {
                setter(value)
            } catch (err) {
                console.error(`error loading property "${fieldName}" of configuration: ${err}`)
                return
            }
        } else {
            console.error(`error loading property "${fieldName}": invalid type ${typeof value}`)
        }
    }

}
