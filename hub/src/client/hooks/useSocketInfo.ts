import { useState, useEffect } from 'react';
import {socketEventEmitter, socket} from './useSocket'

function useSocketInfo() {
  const [isHubConnected, setIsHubConnected] = useState(socket.connected)

  const onConnection = () => {
    setIsHubConnected(true)
  }
  const onDisconnection = () => {
    setIsHubConnected(false)
  }

  useEffect(() => {
    socketEventEmitter.on("connected", onConnection)
    socketEventEmitter.on("disconnected", onDisconnection)
    // Re-read the socket AFTER subscribing, because useState's initialiser ran
    // during render and React defers this effect until after paint (~57ms).
    // The socket.io handshake takes ~12ms on a LAN or localhost, so "connect"
    // routinely fires inside that gap, lands on an empty listener set, and is
    // lost — and since the socket then stays up, no later "connect" ever
    // corrects it. That stuck the "Hub disconnected" banner on permanently for
    // an operator whose hub was fine (8/8 cold loads of a production build).
    // Every other socket consumer escapes this by constructing its tracker at
    // module scope; useWebTally solves it with the same re-read
    // (`socket.connected && onConnect()`). This is that, one hook later.
    setIsHubConnected(socket.connected)
    return () => {
      // cleanup
      socketEventEmitter.off("connected", onConnection)
      socketEventEmitter.off("disconnected", onDisconnection)
    }
  }, [])

  return isHubConnected
}

export default useSocketInfo
