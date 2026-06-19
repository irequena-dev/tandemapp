/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // Escucha en todas las interfaces: además de localhost, queda accesible
    // en la red local (p. ej. http://192.168.0.59:5173) para probar desde el móvil.
    host: true,
    port: 5173,
    // Si 5173 está ocupado, falla en vez de saltar a otro puerto
    // (evita romper el CORS del backend, que confía en este origen).
    strictPort: true,
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
  },
})
