import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// The client bundle is built from src/client/ only. src/server/ is compiled
// separately by tsc -p tsconfig.server.json and is unreachable from here:
// nothing under src/client/ or src/shared/ imports it. That is what keeps
// obs-websocket-js, nodemcu-tool, atem-connection and @julusian/midi out of
// dist/client/assets/ — a structural guarantee, not a bundler setting.
export default defineConfig({
  plugins: [react()],
  publicDir: 'public',
  server: {
    port: 3001,
    proxy: {
      // Dev-proxy direction is inverted from the CRA setup. Previously express
      // on :3000 was the entry point and proxied to CRA on :3001. Now Vite is
      // the entry point and proxies socket.io through to express. Passing
      // Vite's own HMR websocket through http-proxy-middleware is a known
      // failure mode, so the arrow had to turn round.
      '/socket.io': {
        target: 'http://localhost:3000',
        ws: true,
      },
    },
  },
  build: {
    outDir: 'dist/client',
    emptyOutDir: true,
  },
})
