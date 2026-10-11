/** Utilidades para leer metadatos de archivos multimedia en el navegador. */

export function readDuration(url: string, kind: 'video' | 'audio'): Promise<number> {
  return new Promise((resolve, reject) => {
    const el = document.createElement(kind)
    el.preload = 'metadata'
    el.onloadedmetadata = () => {
      const d = el.duration
      if (Number.isFinite(d) && d > 0) resolve(d)
      else reject(new Error('No se pudo leer la duración'))
    }
    el.onerror = () => reject(new Error('Formato no compatible con el navegador'))
    el.src = url
  })
}

/** Captura un fotograma del video para usarlo como miniatura. */
export function captureThumbnail(url: string, at: number, type = 'image/jpeg'): Promise<string | null> {
  return new Promise((resolve) => {
    const video = document.createElement('video')
    video.muted = true
    video.preload = 'auto'
    video.playsInline = true
    const done = (result: string | null) => {
      video.removeAttribute('src')
      video.load()
      resolve(result)
    }
    video.onloadeddata = () => {
      video.currentTime = Math.min(at, Math.max(0, video.duration - 0.05))
    }
    video.onseeked = () => {
      const canvas = document.createElement('canvas')
      const h = 90
      canvas.height = h
      canvas.width = Math.round((video.videoWidth / video.videoHeight) * h) || 160
      const ctx = canvas.getContext('2d')
      if (!ctx) return done(null)
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
      done(canvas.toDataURL(type, 0.7))
    }
    video.onerror = () => done(null)
    video.src = url
  })
}

export function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) seconds = 0
  const m = Math.floor(seconds / 60)
  const s = seconds - m * 60
  return `${m}:${s.toFixed(1).padStart(4, '0')}`
}

export const FPS = 30

/** Código de tiempo HH:MM:SS:FF a 30 fotogramas por segundo. */
export function formatTimecode(seconds: number): string {
  const frames = Math.floor(Math.max(0, seconds) * FPS + 1e-6)
  const ff = frames % FPS
  const total = Math.floor(frames / FPS)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(Math.floor(total / 3600))}:${pad(Math.floor(total / 60) % 60)}:${pad(total % 60)}:${pad(ff)}`
}

export const newId = () => Math.random().toString(36).slice(2, 10)
