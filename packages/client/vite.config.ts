/// <reference types="vitest" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
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
