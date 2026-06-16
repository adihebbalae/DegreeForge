/// <reference types="vitest" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import { readFileSync } from 'fs'

// Build-time app version, surfaced to the client as `__APP_VERSION__`.
// Read from package.json so feedback submissions can be correlated to a build
// without standing up a release pipeline.
const pkgVersion = JSON.parse(
  readFileSync(path.resolve(__dirname, 'package.json'), 'utf-8'),
).version as string

export default defineConfig({
  plugins: [react()],
  define: {
    __APP_VERSION__: JSON.stringify(pkgVersion),
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3005',
        changeOrigin: true,
      },
    },
  },
  test: {
    globals: false,          // explicit imports from 'vitest' in test files
    environment: 'node',     // pure TS unit tests; switch to 'jsdom' for React component tests
    exclude: ['**/node_modules/**', '**/e2e/**'], // Playwright lives in e2e/
  },
})
