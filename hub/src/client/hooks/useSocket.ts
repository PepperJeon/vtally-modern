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
  // This is socket.io v4's *complete* client lifecycle — three events, no more.
  // "connect" fires on the first connection and again after every successful
  // reconnect, so it is the whole re-subscribe story four trackers depend on.
  // "disconnect" is what v4 emits when the transport dies; v2 announced that
  // via "reconnecting"/"connect_timeout", which v4 does not emit at all.
  // Registering the old names here left nothing listening for a real outage —
  // that is what drives useSocketInfo() and the "Hub disconnected" banner.
  // ("disconnected", "reconnect" and "reconnect_error" were also registered
  // before; none of the three is an event the client Socket emits in v4.)
  socket.on("connect", onConnection)
  socket.on("disconnect", onDisconnection)
  socket.on("connect_error", onDisconnection)
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
  