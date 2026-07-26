import { defineConfig } from 'cypress'
import setupTasks from './cypress/plugins/index'

export default defineConfig({
  projectId: '1qd2ua',
  env: {
    atem_ip: '192.168.178.200',
    atem_port: '9910',
  },
  e2e: {
    // Vite (:3001) is the dev entry point now; express (:3000) no longer
    // proxies the frontend, it receives /socket.io proxied the other way.
    baseUrl: 'http://localhost:3001',
    // cypress/integration/ -> cypress/e2e/ is the Cypress 10 layout. The specs
    // kept their .spec.ts suffix, which the default specPattern
    // (**/*.cy.{js,jsx,ts,tsx}) would not match.
    specPattern: 'cypress/e2e/**/*.spec.ts',
    supportFile: 'cypress/support/e2e.ts',
    setupNodeEvents(on, config) {
      // the old pluginsFile default export is already exactly this signature
      setupTasks(on, config)
      return config
    },
  },
})
