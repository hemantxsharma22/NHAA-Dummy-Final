import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
  server: {
    port: 5173,
    proxy: {
      '/api/sessions': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
      '/api/deepgram': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
        ws: true,
      },
      '/api/engine2': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
      '/api/chat': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
      '/health': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
      '/api/auth': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
      '/api': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
    },
  },
})