import { defineConfig } from '@playwright/test'

// testDir is not optional here: Playwright's default pattern would also match
// the Vitest specs under src/ and the Cypress specs under cypress/.
export default defineConfig({
  testDir: './e2e',
  timeout: 120_000,
})
