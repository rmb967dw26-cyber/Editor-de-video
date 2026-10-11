import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// FFmpeg.wasm crea su propio worker; Vite no debe preempaquetarlo.
export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    exclude: ['@ffmpeg/ffmpeg', '@ffmpeg/util'],
  },
})
