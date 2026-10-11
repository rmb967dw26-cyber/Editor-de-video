import { useEffect, useRef, useState } from 'react'

/** Resolución de la forma de onda: picos por segundo de audio. */
const PEAKS_PER_SECOND = 100
/** Por encima de este tamaño no se decodifica el audio (evita agotar la memoria). */
const MAX_FILE_SIZE = 300 * 1024 * 1024

const cache = new WeakMap<File, Promise<Float32Array | null>>()

/** Devuelve los picos de audio del archivo (calculados una sola vez por archivo). */
function getPeaks(file: File): Promise<Float32Array | null> {
  let peaks = cache.get(file)
  if (!peaks) {
    peaks = computePeaks(file)
    cache.set(file, peaks)
  }
  return peaks
}

async function computePeaks(file: File): Promise<Float32Array | null> {
  if (file.size > MAX_FILE_SIZE) return null
  try {
    const ctx = new OfflineAudioContext(1, 1, 44100)
    const audio = await ctx.decodeAudioData(await file.arrayBuffer())
    const step = audio.sampleRate / PEAKS_PER_SECOND
    const out = new Float32Array(Math.ceil(audio.duration * PEAKS_PER_SECOND))
    for (let ch = 0; ch < Math.min(2, audio.numberOfChannels); ch++) {
      const data = audio.getChannelData(ch)
      for (let i = 0; i < out.length; i++) {
        const end = Math.min(data.length, Math.floor((i + 1) * step))
        let max = out[i]
        for (let j = Math.floor(i * step); j < end; j += 4) {
          const v = Math.abs(data[j])
          if (v > max) max = v
        }
        out[i] = max
      }
    }
    return out
  } catch {
    // Sin pista de audio o formato no decodificable.
    return null
  }
}

interface Props {
  file: File
  /** Tramo del archivo a dibujar, en segundos. */
  from: number
  to: number
  color: string
}

export function Waveform({ file, from, to, color }: Props) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const [peaks, setPeaks] = useState<Float32Array | null>(null)
  const [size, setSize] = useState({ w: 0, h: 0 })

  useEffect(() => {
    let alive = true
    getPeaks(file).then((p) => alive && setPeaks(p))
    return () => {
      alive = false
    }
  }, [file])

  useEffect(() => {
    const el = canvas.current
    if (!el) return
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    const el = canvas.current
    if (!el || size.w === 0) return
    const dpr = window.devicePixelRatio || 1
    const w = Math.min(4096, Math.round(size.w * dpr))
    const h = Math.round(size.h * dpr)
    el.width = w
    el.height = h
    const ctx = el.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, w, h)
    ctx.fillStyle = color
    const mid = h / 2
    if (!peaks) {
      ctx.fillRect(0, mid - 0.5 * dpr, w, dpr)
      return
    }
    const span = Math.max(0.001, to - from)
    for (let x = 0; x < w; x++) {
      const i0 = Math.floor((from + (x / w) * span) * PEAKS_PER_SECOND)
      const i1 = Math.max(i0 + 1, Math.floor((from + ((x + 1) / w) * span) * PEAKS_PER_SECOND))
      let max = 0
      for (let i = i0; i < i1 && i < peaks.length; i++) if (peaks[i] > max) max = peaks[i]
      const amp = Math.max(dpr * 0.5, Math.min(1, max * 1.4) * (h / 2 - dpr))
      ctx.fillRect(x, mid - amp, 1, amp * 2)
    }
  }, [peaks, from, to, color, size])

  return <canvas ref={canvas} className="waveform" />
}
