import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// FFmpeg.wasm crea su propio worker; Vite no debe preempaquetarlo.
// BASE_PATH permite publicar en una subruta, como en GitHub Pages (/Editor-de-video/).
export default defineConfig({
  base: process.env.BASE_PATH ?? '/',
  plugins: [react()],
  optimizeDeps: {
    exclude: ['@ffmpeg/ffmpeg', '@ffmpeg/util'],
  },
})
