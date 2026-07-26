// Deliberately empty. The renderer talks to the hub over socket.io on the same
// origin, exactly as it does in a browser — exposing anything through
// contextBridge here would be a second, redundant client/server seam.
export {}
