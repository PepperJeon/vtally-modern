import Emitter from '../../lib/Emitter'
import { ClientSideSocket } from '../../../shared/lib/SocketEvents'

class MixerTracker extends Emitter{
    connectionState: boolean | null

    constructor(socket: ClientSideSocket) {
        super()
        this.connectionState = null
        
        socket.on('mixer.state', ({isConnected}) => {
            this.connectionState = isConnected
            this.emit('connection', this.connectionState)
        })
        socket.emit('events.mixer.subscribe')
    }
}

export default MixerTracker
