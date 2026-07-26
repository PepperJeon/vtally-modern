import { useEffect } from 'react'
import io from 'socket.io-client'
import Emitter from '../lib/Emitter'
import { ClientSentEvents, ClientSideSocket } from '../../shared/lib/SocketEvents'
import DisconnectedClientSideSocket from '../lib/DisconnectedClientSideSocket'

// @TODO: remove socket event emitter. It does not have any purpose apart from announcing connection and disconnection
const socketEventEmitter = new Emitter()

// Vitest sets MODE to 'test'; vite dev/build set 'development'/'production'.
// (was process.env.JEST_WORKER_ID under CRA — process is not defined in a
// Vite browser bundle.)
//
// The `?.` is load-bearing, not defensive noise: Cypress bundles specs that
// import this module with webpack, which leaves import.meta.env undefined.
// Without it this throws at import time and every spec that touches the socket
// fails before its first assertion. undefined !== 'test' is also the correct
// answer there — Cypress drives the app over a real socket.io connection.
const isTestEnvironment = import.meta.env?.MODE === 'test'

const socket: ClientSideSocket = isTestEnvironment ? new DisconnectedClientSideSocket() : io()

const onConnection = function() {
  socketEventEmitter.emit("connected")
}
const onDisconnection = function() {
  socketEventEmitter.emit("disconnected")
}
if (typeof window !== 'undefined') {
  // on client only
  socket.on("connect", onConnection)
  socket.on("connect_error", onDisconnection)
  socket.on("connect_timeout", onDisconnection)
  socket.on("disconnected", onDisconnection)
  socket.on("reconnect", onDisconnection)
  socket.on("reconnecting", onDisconnection)
  socket.on("reconnect_error", onDisconnection)
  socket.on("reconnect_failed", onDisconnection)
}

/** @deprecated */
const useSocket = function<EventName extends keyof ClientSentEvents>(eventName: EventName, cb: (...args: any[]) => void) {
  useEffect(() => {
    //@ts-ignore
    socket.on(eventName, cb)

    return function useSocketCleanup() {
      // @ts-ignore
      socket.off(eventName, cb)
    }
  }, [eventName, cb])

  return socket
}

export {useSocket, socketEventEmitter, socket}
  