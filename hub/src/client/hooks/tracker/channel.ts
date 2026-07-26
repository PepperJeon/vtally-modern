import Emitter from '../../lib/Emitter'
import Channel from '../../../shared/domain/Channel'
import { ClientSideSocket } from '../../../shared/lib/SocketEvents'

class ChannelTracker extends Emitter{
    channels?: Channel[]
    
    constructor(socket: ClientSideSocket, socketEventEmitter: Emitter) {
        super()
        this.channels = undefined

        socket.on('channel.state', ({channels}) => {
            this.channels = channels.map(channel => Channel.fromJson(channel))
            this.emit('channels', this.channels)
        })
        socket.emit('events.channel.subscribe')
        socketEventEmitter.on("connected", () => {
            socket.emit('events.channel.subscribe')
        })
    }
}

export default ChannelTracker
