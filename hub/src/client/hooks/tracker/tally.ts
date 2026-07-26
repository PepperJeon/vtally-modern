import Emitter from '../../lib/Emitter'
import Tally from '../../../shared/domain/Tally'
import { ClientSideSocket } from '../../../shared/lib/SocketEvents'

class TallyTracker extends Emitter{
    tallies: Tally[] | null
    
    constructor(socket: ClientSideSocket, socketEventEmitter: Emitter) {
        super()
        this.tallies = null

        socket.on('tally.state', ({tallies}) => {
            this.tallies = tallies.map(tally => Tally.fromJson(tally))
            this.emit('tallies', this.tallies)
        })
        socket.emit('events.tally.subscribe')
        socketEventEmitter.on("connected", () => {
            socket.emit('events.tally.subscribe')
        })
    }
}

export default TallyTracker
