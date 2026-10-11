import { useEffect, useRef, useState } from 'react'
import { formatTime } from './media'
import { clipLength, type Clip, type MusicTrack } from './types'

interface Props {
  clips: Clip[]
  starts: number[]
  total: number
  time: number
  music: MusicTrack | null
  selectedId: string | null
  onSelect: (id: string) => void
  onSeek: (t: number) => void
  onMove: (from: number, to: number) => void
}

const LABEL_WIDTH = 72

export function Timeline({ clips, starts, total, time, music, selectedId, onSelect, onSeek, onMove }: Props) {
  const scroller = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(800)
  // null = ajustar todo el proyecto al ancho disponible.
  const [zoom, setZoom] = useState<number | null>(null)
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [dropIndex, setDropIndex] = useState<number | null>(null)

  useEffect(() => {
    const el = scroller.current
    if (!el) return
    const ro = new ResizeObserver(() => setWidth(el.clientWidth))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const fitZoom = total > 0 ? Math.max(2, (width - LABEL_WIDTH - 24) / total) : 40
  const pxPerSec = zoom ?? fitZoom
  const musicLength = music ? Math.min(total, music.duration - music.offset) : 0
  const contentWidth = Math.max(total, 1) * pxPerSec

  // Intervalo de las marcas de la regla según el zoom.
  const tickStep = [0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300].find((s) => s * pxPerSec >= 70) ?? 600
  const ticks: number[] = []
  for (let t = 0; t <= total + tickStep; t += tickStep) ticks.push(t)

  const timeFromEvent = (e: React.PointerEvent | React.MouseEvent) => {
    const rect = e.currentTarget.getBoundingClientRect()
    return Math.max(0, Math.min(total, (e.clientX - rect.left) / pxPerSec))
  }

  // Arrastrar sobre la regla mueve el cursor de reproducción.
  const scrub = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.type === 'pointerdown') e.currentTarget.setPointerCapture(e.pointerId)
    else if (!e.currentTarget.hasPointerCapture(e.pointerId)) return
    onSeek(timeFromEvent(e))
  }

  // Mantiene el cursor visible durante la reproducción.
  useEffect(() => {
    const el = scroller.current
    if (!el) return
    const x = LABEL_WIDTH + time * pxPerSec
    if (x < el.scrollLeft + LABEL_WIDTH || x > el.scrollLeft + el.clientWidth - 40) {
      el.scrollLeft = x - LABEL_WIDTH - 40
    }
  }, [time, pxPerSec])

  return (
    <section className="timeline">
      <div className="timeline-bar">
        <span className="muted">Línea de tiempo · {clips.length} clip(s) · {formatTime(total)}</span>
        <div className="zoom">
          <button className="small" onClick={() => setZoom(Math.max(2, pxPerSec / 1.5))}>−</button>
          <button className="small" onClick={() => setZoom(null)} disabled={zoom === null}>Ajustar</button>
          <button className="small" onClick={() => setZoom(Math.min(400, pxPerSec * 1.5))}>＋</button>
        </div>
      </div>

      <div className="tracks" ref={scroller}>
        <div className="tracks-inner" style={{ width: contentWidth + LABEL_WIDTH + 24 }}>
          <div className="lane ruler-lane">
            <div className="lane-label" />
            <div className="ruler" style={{ width: contentWidth }} onPointerDown={scrub} onPointerMove={scrub}>
              {ticks.map((t) => (
                <span key={t} className="tick" style={{ left: t * pxPerSec }}>
                  {formatTime(t).replace(/\.0$/, '')}
                </span>
              ))}
            </div>
          </div>

          <div className="lane">
            <div className="lane-label">🎞 Video</div>
            <div
              className="track"
              style={{ width: contentWidth }}
              onDragOver={(e) => {
                if (dragIndex !== null) e.preventDefault()
              }}
            >
              {clips.length === 0 && <span className="muted track-hint">Sin clips todavía</span>}
              {clips.map((clip, i) => (
                <div
                  key={clip.id}
                  className={[
                    'clip',
                    clip.id === selectedId && 'selected',
                    dragIndex === i && 'dragging',
                    dropIndex === i && dragIndex !== null && dragIndex !== i && (dragIndex < i ? 'drop-after' : 'drop-before'),
                  ].filter(Boolean).join(' ')}
                  style={{
                    left: starts[i] * pxPerSec,
                    width: Math.max(4, clipLength(clip) * pxPerSec - 2),
                    backgroundImage: clip.thumbnail ? `url(${clip.thumbnail})` : undefined,
                  }}
                  title={`${clip.name} — arrastra para reordenar`}
                  draggable
                  onDragStart={(e) => {
                    setDragIndex(i)
                    e.dataTransfer.effectAllowed = 'move'
                    e.dataTransfer.setData('text/plain', clip.id)
                  }}
                  onDragOver={(e) => {
                    if (dragIndex === null) return
                    e.preventDefault()
                    setDropIndex(i)
                  }}
                  onDrop={(e) => {
                    if (dragIndex === null) return
                    e.preventDefault()
                    e.stopPropagation()
                    onMove(dragIndex, i)
                    setDragIndex(null)
                    setDropIndex(null)
                  }}
                  onDragEnd={() => {
                    setDragIndex(null)
                    setDropIndex(null)
                  }}
                  onClick={(e) => {
                    onSelect(clip.id)
                    const rect = e.currentTarget.getBoundingClientRect()
                    onSeek(starts[i] + (e.clientX - rect.left) / pxPerSec)
                  }}
                >
                  <span className="clip-label">
                    {clip.muted && '🔇 '}
                    {clip.name}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="lane">
            <div className="lane-label">♪ Música</div>
            <div className="track audio-track" style={{ width: contentWidth }} onClick={(e) => onSeek(timeFromEvent(e))}>
              {music ? (
                <div className="music" style={{ width: Math.max(4, musicLength * pxPerSec - 2) }}>
                  <span className="clip-label">
                    {music.name} · {Math.round(music.volume * 100)}%
                  </span>
                </div>
              ) : (
                <span className="muted track-hint">Sin música</span>
              )}
            </div>
          </div>

          {clips.length > 0 && <div className="playhead" style={{ left: LABEL_WIDTH + time * pxPerSec }} />}
        </div>
      </div>
    </section>
  )
}
