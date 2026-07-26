import MockUdpTally from '../MockUdpTally'
import io from 'socket.io-client'
import { ClientSideSocket } from '../../src/shared/lib/SocketEvents'

const tallies = function(config: Cypress.PluginConfigOptions) {
  const socket : ClientSideSocket = io(config.baseUrl)
  // Must match the hub's own UdpTallyDriver.getTallyPort() for this run —
  // set via CYPRESS_TALLY_PORT by verify.sh so mock tallies reach the right
  // hub when multiple verify.sh runs use different tally ports.
  const tallyPort = Number(config.env.TALLY_PORT) || 7411
  let mockTallies: MockUdpTally[] = []

  // spawns a new hardware tally
  function tally(name: string) {
    const tally = new MockUdpTally(name, tallyPort)
    mockTallies.push(tally)
    return tally.connect()
  }

  function tallyLog({name, message, severity}) {
    const tally = mockTallies.find(tally => tally.name === name)
    if (!tally) {
      console.error(`Could not find tally with name ${name}.`)
    } else {
      tally.log(message, severity || "INFO")
    }
    return null
  }

  function tallyKill(name: string) {
    const tally = mockTallies.find(tally => tally.name === name)
    if (tally) {
      tally.disconnect()
      socket.emit('tally.remove', tally.name, tally.type)
      mockTallies = mockTallies.filter(tally => tally.name !== name)
    }
    socket.emit('tally.remove', name, "web")
    return null
  }

  function tallyDisconnect(name: string) {
    const tally = mockTallies.find(tally => tally.name === name)
    if (!tally) {
      console.warn(`Could not find tally with name ${name} to disconnect.`)
    }
    tally.disconnect()
    return null
  }

  // removes all mocked tallies
  function tallyCleanup() {
    mockTallies.map(tally => tally.name).forEach(tallyName => {
      tallyKill(tallyName)
    })
    mockTallies = []
    return null
  }

  function tallyLastCommand(name: string) {
    const tally = mockTallies.find(tally => tally.name === name)
    if (tally) {
      return tally.messages[tally.messages.length - 1]
    }
    return null
  }

  return {
    tally,
    tallyCleanup,
    tallyDisconnect,
    tallyKill,
    tallyLastCommand,
    tallyLog,
  }
}

export default tallies
