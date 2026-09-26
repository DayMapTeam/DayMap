import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // The browser calls /api on its own origin; Express runs on 3001 in development.
    proxy: { '/api': 'http://localhost:3001' },
    fs: {
      // Shared fixtures live beside client; do not expose future server files.
      allow: [fileURLToPath(new URL('.', import.meta.url)), fileURLToPath(new URL('../shared', import.meta.url))],
    },
  },
})
