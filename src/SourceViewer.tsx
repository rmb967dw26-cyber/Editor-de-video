import { useEffect, useRef, useState } from 'react'
import { formatTimecode } from './media'
import type { MediaItem } from './types'

interface Props {
  item: MediaItem | null
  /** Añade el tramo marcado (entrada/salida) al final de la línea de tiempo. */
  onAppend: (item: MediaItem, start: number, end: number) => void
}

/** Visor de origen: previsualiza un archivo de la biblioteca y marca entrada/salida. */
export function SourceViewer({ item, onAppend }: Props) {
  const video = useRef<HTMLVideoElement>(null)
  const [time, setTime] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [mark, setMark] = useState<{ in: number; out: number }>({ in: 0, out: 0 })

  useEffect(() => {
    setTime(0)
    setPlaying(false)
    setMark({ in: 0, out: item?.duration ?? 0 })
  }, [item])

  const isVideo = item?.kind === 'video'
  const duration = item?.duration ?? 0

  const toggle = () => {
    const v = video.current
    if (!v || !item) return
    if (v.paused) {
      if (v.currentTime >= mark.out - 0.05) v.currentTime = mark.in
      v.play().then(() => setPlaying(true)).catch(() => {})
    } else {
      v.pause()
      setPlaying(false)
    }
  }

  return (
    <section className="viewer source-viewer">
      <header className="viewer-head">
        <span className="viewer-name" title={item?.name}>{item ? item.name : 'Visor de origen'}</span>
        <span className="tc">{formatTimecode(time)}</span>
      </header>
      <div className="viewer-screen">
        {item ? (
          <video
            ref={video}
            src={item.url}
            playsInline
            poster={isVideo ? undefined : item.thumbnail ?? undefined}
            onClick={toggle}
            onTimeUpdate={(e) => {
              const t = e.currentTarget.currentTime
              setTime(t)
              if (!e.currentTarget.paused && t >= mark.out) {
                e.currentTarget.pause()
                setPlaying(false)
              }
            }}
            onPause={() => setPlaying(false)}
          />
        ) : (
          <p className="muted viewer-placeholder">Selecciona un archivo de la biblioteca de medios</p>
        )}
      </div>
      <div className="scrub">
        <div
          className="scrub-range"
          style={{ left: `${(mark.in / (duration || 1)) * 100}%`, right: `${100 - (mark.out / (duration || 1)) * 100}%` }}
        />
        <input
          type="range" min={0} max={duration || 1} step={1 / 30} value={time} disabled={!item}
          aria-label="Posición en el visor de origen"
          onChange={(e) => {
            const t = Number(e.target.value)
            setTime(t)
            if (video.current) video.current.currentTime = t
          }}
        />
      </div>
      <div className="viewer-transport">
        <button className="icon-btn" disabled={!item} onClick={() => setMark((m) => ({ ...m, in: Math.min(time, m.out - 0.1) }))} title="Marcar entrada">
          [ Entrada
        </button>
        <button className="icon-btn play-btn" disabled={!item} onClick={toggle} title="Reproducir / pausar">
          {playing ? '❚❚' : '▶'}
        </button>
        <button className="icon-btn" disabled={!item} onClick={() => setMark((m) => ({ ...m, out: Math.max(time, m.in + 0.1) }))} title="Marcar salida">
          Salida ]
        </button>
        <button
          className="icon-btn accent"
          disabled={!isVideo}
          onClick={() => item && onAppend(item, mark.in, mark.out)}
          title="Añadir el tramo marcado al final de la línea de tiempo"
        >
          ⤓ Añadir
        </button>
      </div>
    </section>
  )
}
