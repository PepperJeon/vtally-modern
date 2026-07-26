import path from 'path'
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // Same '@' → src/client alias as vite.config.ts. Any component spec whose
  // subject imports a shadcn component ('@/components/ui/...') fails to resolve
  // without it — ChannelSelector.spec.tsx was the first to hit this.
  resolve: {
    alias: { '@': path.resolve(__dirname, 'src/client') },
  },
  test: {
    globals: true,
    // Most specs are pure logic. The two that render React opt into jsdom with
    // a `// @vitest-environment jsdom` docblock of their own.
    environment: 'node',
    setupFiles: ['./src/client/setupTests.ts'],
    // .js matters: RolandV60HDConnector.spec.js and VmixConnector.spec.js are
    // two of the 26 suites and would be silently dropped by a .ts-only glob.
    include: ['src/**/*.spec.{ts,tsx,js,jsx}'],
  },
})
