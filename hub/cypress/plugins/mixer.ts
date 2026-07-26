import io from 'socket.io-client'
import { ClientSideSocket } from '../../src/shared/lib/SocketEvents'
import { ChannelList } from '../../src/server/lib/MixerCommunicator'
import TestConfiguration from '../../src/shared/mixer/test/TestConfiguration'

const mixer = function(config: Cypress.PluginConfigOptions) {
  const socket : ClientSideSocket = io(config.baseUrl)

  function mixerProgPrev({programs, previews}: {programs: ChannelList, previews: ChannelList}) {
    const config = new TestConfiguration()
    config.previews = previews
    config.programs = programs
    socket.emit('config.change.test', config.toJson())

    return null
  }

  return {
    mixerProgPrev,
  }
}

export default mixer