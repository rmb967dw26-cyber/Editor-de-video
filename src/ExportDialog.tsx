import { useEffect, useRef, useState } from 'react'
import { cancelExport, exportProject } from './exporter'
import { formatTime } from './media'
import type { Clip, MusicTrack, PlacedTransition } from './types'

const PRESETS = [
  { label: '720p horizontal (1280×720) — recomendado', width: 1280, height: 720 },
  { label: '1080p horizontal (1920×1080) — más lento', width: 1920, height: 1080 },
  { label: '480p horizontal (854×480) — rápido', width: 854, height: 480 },
  { label: 'Vertical 720×1280 (Reels, TikTok, Shorts)', width: 720, height: 1280 },
  { label: 'Cuadrado 1080×1080', width: 1080, height: 1080 },
]

interface Props {
  clips: Clip[]
  music: MusicTrack | null
  transitions: PlacedTransition[]
  total: number
  onClose: () => void
}

type Status = 'idle' | 'running' | 'done' | 'error'

export function ExportDialog({ clips, music, transitions, total, onClose }: Props) {
  const [preset, setPreset] = useState(0)
  const [status, setStatus] = useState<Status>('idle')
  const [stage, setStage] = useState('')
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState('')
  const [result, setResult] = useState<{ url: string; size: number } | null>(null)
  const [elapsed, setElapsed] = useState(0)
  const cancelled = useRef(false)

  useEffect(() => () => {
    if (result) URL.revokeObjectURL(result.url)
  }, [result])

  useEffect(() => {
    if (status !== 'running') return
    const t0 = performance.now()
    const id = setInterval(() => setElapsed((performance.now() - t0) / 1000), 500)
    return () => clearInterval(id)
  }, [status])

  const start = async () => {
    cancelled.current = false
    setStatus('running')
    setProgress(0)
    setElapsed(0)
    setError('')
    try {
      const { width, height } = PRESETS[preset]
      const blob = await exportProject(clips, music, transitions, { width, height }, {
        onStage: setStage,
        onProgress: setProgress,
      })
      setResult({ url: URL.createObjectURL(blob), size: blob.size })
      setStatus('done')
    } catch (e) {
      if (cancelled.current) {
        setStatus('idle')
        return
      }
      console.error(e)
      setError((e as Error).message || String(e))
      setStatus('error')
    }
  }

  const cancel = () => {
    cancelled.current = true
    cancelExport()
  }

  return (
    <div className="modal-backdrop" onClick={() => status !== 'running' && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <h2>Exportar video</h2>

        {(status === 'idle' || status === 'error') && (
          <>
            <p className="muted">
              {clips.length} clip(s) · {formatTime(total)}
              {transitions.length ? ` · ${transitions.length} transición(es)` : ''}
              {music ? ' · con música' : ''}. El video se procesa en tu
              navegador: tus archivos no se suben a ningún servidor.
            </p>
            <label className="field">
              <span>Formato</span>
              <select value={preset} onChange={(e) => setPreset(Number(e.target.value))}>
                {PRESETS.map((p, i) => (
                  <option key={i} value={i}>{p.label}</option>
                ))}
              </select>
            </label>
            {status === 'error' && <pre className="error-log">{error}</pre>}
            <div className="row end">
              <button onClick={onClose}>Cancelar</button>
              <button className="primary" onClick={start}>
                {status === 'error' ? 'Reintentar' : 'Exportar'}
              </button>
            </div>
          </>
        )}

        {status === 'running' && (
          <>
            <p>{stage}</p>
            <div className="progress">
              <div style={{ width: `${Math.round(progress * 100)}%` }} />
            </div>
            <p className="muted">
              {Math.round(progress * 100)}% · {formatTime(elapsed).replace(/\.\d$/, '')} transcurrido. La codificación en el
              navegador es más lenta que en una app nativa; mantén esta pestaña abierta.
            </p>
            <div className="row end">
              <button className="danger" onClick={cancel}>Detener</button>
            </div>
          </>
        )}

        {status === 'done' && result && (
          <>
            <video className="result" src={result.url} controls playsInline />
            <p className="muted">
              Listo en {formatTime(elapsed).replace(/\.\d$/, '')} · {(result.size / 1024 / 1024).toFixed(1)} MB
            </p>
            <div className="row end">
              <button onClick={onClose}>Cerrar</button>
              <a className="button primary" href={result.url} download="mi-video.mp4">Descargar MP4</a>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
