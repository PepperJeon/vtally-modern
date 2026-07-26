// The set of channel ids currently live/previewed. Lives here rather than in
// MixerCommunicator (server-only) because both the socket contract and the
// client tracker need it, and a type may not drag a server module across the
// client boundary.
export type ChannelList = string[] | null

export type ChannelSaveObject = {
    id: string
    name?: string
}

class Channel {
    id: string
    name?: string

    constructor(id: string, name?: string) {
        this.id = id.toString()
        this.name = name
    }

    toJson(): ChannelSaveObject {
        return {
            id: this.id,
            name: this.name,
        }
    }
    toString() {
        return this.name || this.id
    }

    static fromJson = function(valueObject: ChannelSaveObject) {
        const channel = new Channel(
            valueObject.id,
            valueObject.name,
        )
        return channel
    }
}

export default Channel
