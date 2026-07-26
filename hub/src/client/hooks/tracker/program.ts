import Emitter from '../../lib/Emitter'
import type { ChannelList } from '../../../shared/domain/Channel'
import { ClientSideSocket } from '../../../shared/lib/SocketEvents'

class ProgramTracker extends Emitter{
    programs: ChannelList
    previews: ChannelList
    
    constructor(socket: ClientSideSocket, socketEventEmitter: Emitter) {
        super()
        this.programs = null
        this.previews = null

        socket.on('program.state', ({programs, previews}) => {
            this.programs = programs
            this.previews = previews
            this.emit('program', this.programs, this.previews)
        })
        socket.emit('events.program.subscribe')
        socketEventEmitter.on("connected", () => {
            socket.emit('events.program.subscribe')
        })
    }
}

export default ProgramTracker
