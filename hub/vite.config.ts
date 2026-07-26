import path from 'path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// The client bundle is built from src/client/ only. src/server/ is compiled
// separately by tsc -p tsconfig.server.json and is unreachable from here:
// nothing under src/client/ or src/shared/ imports it. That is what keeps
// obs-websocket-js, nodemcu-tool, atem-connection and @julusian/midi out of
// dist/client/assets/ — a structural guarantee, not a bundler setting.
// verify.sh runs several worktrees in parallel and allocates a fresh port
// pair per run — these env vars are how it tells this process which ones.
// Defaults keep plain `npm run start:frontend` working for local dev.
const frontendPort = Number(process.env.FRONTEND_PORT) || 3001
const backendPort = Number(process.env.BACKEND_PORT) || 3000

export default defineConfig({
  // Tailwind is wired in through PostCSS (postcss.config.mjs), not through a
  // Vite plugin, and that is not a style preference. @tailwindcss/vite is
  // ESM-only; this file is CJS (hub/package.json has no "type": "module", and
  // adding one would break the ts-node server), so importing it here fails the
  // build outright with "ESM file cannot be loaded by require". The obvious fix
  // — rename to vite.config.mts — is a trap: scripts/verify.sh detects which
  // world it is in with `[ -f hub/vite.config.ts ]`, so the rename would
  // silently flip the whole harness back to its CRA branch and measure the
  // wrong things. PostCSS sidesteps both: postcss-load-config loads .mjs
  // natively, so the ESM plugin is reached without this file changing format.
  plugins: [react()],
  resolve: {
    // '@' → src/client. shadcn/ui generates imports as '@/components/ui/...'
    // and '@/lib/utils'; this is the alias that makes those resolve. It points
    // at the *client* tree specifically, so a shadcn-style import can never
    // reach src/server — the split stays enforced by construction.
    alias: { '@': path.resolve(__dirname, 'src/client') },
  },
  publicDir: 'public',
  server: {
    port: frontendPort,
    proxy: {
      // Dev-proxy direction is inverted from the CRA setup. Previously express
      // on :3000 was the entry point and proxied to CRA on :3001. Now Vite is
      // the entry point and proxies socket.io through to express. Passing
      // Vite's own HMR websocket through http-proxy-middleware is a known
      // failure mode, so the arrow had to turn round.
      '/socket.io': {
        target: `http://localhost:${backendPort}`,
        ws: true,
      },
    },
  },
  build: {
    outDir: 'dist/client',
    emptyOutDir: true,
  },
})
