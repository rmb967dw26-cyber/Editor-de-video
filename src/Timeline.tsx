import { useEffect, useRef, useState } from 'react'
import { formatTime, formatTimecode } from './media'
import { clipLength, type Clip, type MusicTrack, type PlacedTransition } from './types'
import { Waveform } from './waveform'
import { MEDIA_DRAG_TYPE } from './MediaPool'
import { STINGER_DRAG_TYPE } from './EffectsLibrary'

export type Tool = 'select' | 'blade'

interface Props {
  clips: Clip[]
  starts: number[]
  total: number
  time: number
  music: MusicTrack | null
  transitions: PlacedTransition[]
  selectedId: string | null
  tool: Tool
  a1Muted: boolean
  a2Muted: boolean
  onToolChange: (tool: Tool) => void
  onToggleMute: (track: 'a1' | 'a2') => void
  onSelect: (id: string) => void
  onSeek: (t: number) => void
  onMove: (from: number, to: number) => void
  onSplitAt: (t: number) => void
  onDropMedia: (mediaId: string, t: number) => void
  onDropStinger: (stingerId: string, t: number) => void
}

const HEADER_WIDTH = 132

export function Timeline(props: Props) {
  const { clips, starts, total, time, music, transitions, selectedId, tool } = props
  const scroller = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(800)
  // null = ajustar todo el proyecto al ancho disponible.
  const [zoom, setZoom] = useState<number | null>(null)
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [dropIndex, setDropIndex] = useState<number | null>(null)
  const [dropHint, setDropHint] = useState<number | null>(null)

  useEffect(() => {
    const el = scroller.current
    if (!el) return
    const ro = new ResizeObserver(() => setWidth(el.clientWidth))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const fitZoom = total > 0 ? Math.max(2, (width - HEADER_WIDTH - 24) / total) : 40
  const pxPerSec = zoom ?? fitZoom
  const musicLength = music ? Math.min(total, music.duration - music.offset) : 0
  const contentWidth = Math.max(total, 1) * pxPerSec

  const tickStep = [0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300].find((s) => s * pxPerSec >= 90) ?? 600
  const ticks: number[] = []
  for (let t = 0; t <= total + tickStep; t += tickStep) ticks.push(t)

  const timeAt = (e: React.MouseEvent | React.PointerEvent | React.DragEvent, el: Element) => {
    const rect = el.getBoundingClientRect()
    return Math.max(0, Math.min(total, (e.clientX - rect.left) / pxPerSec))
  }

  const scrub = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.type === 'pointerdown') e.currentTarget.setPointerCapture(e.pointerId)
    else if (!e.currentTarget.hasPointerCapture(e.pointerId)) return
    props.onSeek(timeAt(e, e.currentTarget))
  }

  // Mantiene el cursor visible durante la reproducción.
  useEffect(() => {
    const el = scroller.current
    if (!el) return
    const x = HEADER_WIDTH + time * pxPerSec
    if (x < el.scrollLeft + HEADER_WIDTH || x > el.scrollLeft + el.clientWidth - 40) {
      el.scrollLeft = x - HEADER_WIDTH - 40
    }
  }, [time, pxPerSec])

  const isExternalDrag = (e: React.DragEvent) =>
    e.dataTransfer.types.includes(MEDIA_DRAG_TYPE) || e.dataTransfer.types.includes(STINGER_DRAG_TYPE)

  const clickClip = (e: React.MouseEvent<HTMLDivElement>, clip: Clip, i: number) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const t = starts[i] + (e.clientX - rect.left) / pxPerSec
    if (tool === 'blade') {
      props.onSplitAt(t)
      return
    }
    props.onSelect(clip.id)
    props.onSeek(t)
  }

  return (
    <section className="panel timeline">
      <div className="tl-toolbar">
        <span className="tl-timecode">{formatTimecode(time)}</span>
        <div className="tl-tools" role="group" aria-label="Herramientas">
          <button className={`tool ${tool === 'select' ? 'active' : ''}`} onClick={() => props.onToolChange('select')} title="Selección (A)">
            ➤
          </button>
          <button className={`tool ${tool === 'blade' ? 'active' : ''}`} onClick={() => props.onToolChange('blade')} title="Cuchilla: clic en un clip para cortarlo (B)">
            ✂
          </button>
        </div>
        <span className="muted small-text tl-info">
          {clips.length} clip(s) · {formatTime(total)}
        </span>
        <div className="tl-zoom">
          <button className="icon-btn" onClick={() => setZoom(Math.max(2, pxPerSec / 1.5))} title="Alejar">−</button>
          <button className="icon-btn" onClick={() => setZoom(null)} disabled={zoom === null} title="Ajustar al ancho">⇔</button>
          <button className="icon-btn" onClick={() => setZoom(Math.min(400, pxPerSec * 1.5))} title="Acercar">＋</button>
        </div>
      </div>

      <div className={`tracks tool-${tool}`} ref={scroller}>
        <div className="tracks-inner" style={{ width: contentWidth + HEADER_WIDTH + 24 }}>
          <div className="lane ruler-lane">
            <div className="track-head ruler-head" />
            <div className="ruler" style={{ width: contentWidth }} onPointerDown={scrub} onPointerMove={scrub}>
              {ticks.map((t) => (
                <span key={t} className="tick" style={{ left: t * pxPerSec }}>
                  {formatTimecode(t)}
                </span>
              ))}
            </div>
          </div>

          {/* V1: video */}
          <div className="lane v-lane">
            <div className="track-head">
              <span className="track-id v">V1</span>
              <span className="track-name">Video 1</span>
            </div>
            <div
              className="track"
              style={{ width: contentWidth }}
              onDragOver={(e) => {
                if (dragIndex !== null) {
                  e.preventDefault()
                  return
                }
                if (!isExternalDrag(e)) return
                e.preventDefault()
                e.dataTransfer.dropEffect = 'copy'
                setDropHint(timeAt(e, e.currentTarget))
              }}
              onDragLeave={() => setDropHint(null)}
              onDrop={(e) => {
                setDropHint(null)
                const media = e.dataTransfer.getData(MEDIA_DRAG_TYPE)
                const stinger = e.dataTransfer.getData(STINGER_DRAG_TYPE)
                if (!media && !stinger) return
                e.preventDefault()
                const t = timeAt(e, e.currentTarget)
                if (media) props.onDropMedia(media, t)
                else props.onDropStinger(stinger, t)
              }}
            >
              {clips.length === 0 && <span className="track-hint">Arrastra aquí clips desde la biblioteca de medios</span>}
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
                    width: Math.max(4, clipLength(clip) * pxPerSec - 1),
                    backgroundImage: clip.thumbnail ? `url(${clip.thumbnail})` : undefined,
                  }}
                  title={`${clip.name} — arrastra para reordenar`}
                  draggable={tool === 'select'}
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
                    props.onMove(dragIndex, i)
                    setDragIndex(null)
                    setDropIndex(null)
                  }}
                  onDragEnd={() => {
                    setDragIndex(null)
                    setDropIndex(null)
                  }}
                  onClick={(e) => clickClip(e, clip, i)}
                >
                  <span className="clip-label">{clip.name}</span>
                </div>
              ))}
              {transitions.map((tr) => (
                <div
                  key={tr.clipIndex}
                  className="transition"
                  style={{ left: tr.start * pxPerSec, width: tr.stinger.duration * pxPerSec }}
                  title={`Transición: ${tr.stinger.name}`}
                >
                  <span className="transition-label">{tr.stinger.name.replace(/\.webm$/i, '')}</span>
                  <span className="transition-cut" style={{ left: tr.stinger.cutPoint * pxPerSec }} />
                </div>
              ))}
              {dropHint !== null && <div className="drop-line" style={{ left: dropHint * pxPerSec }} />}
            </div>
          </div>

          {/* A1: audio de los clips, vinculado al video */}
          <div className="lane a-lane">
            <div className="track-head">
              <span className="track-id a">A1</span>
              <span className="track-name">Audio 1</span>
              <button className={`mute-btn ${props.a1Muted ? 'on' : ''}`} onClick={() => props.onToggleMute('a1')} title="Silenciar pista">M</button>
            </div>
            <div className={`track ${props.a1Muted ? 'muted-track' : ''}`} style={{ width: contentWidth }}>
              {clips.map((clip, i) => (
                <div
                  key={clip.id}
                  className={`audio-clip ${clip.id === selectedId ? 'selected' : ''} ${clip.muted ? 'muted-clip' : ''}`}
                  style={{ left: starts[i] * pxPerSec, width: Math.max(4, clipLength(clip) * pxPerSec - 1) }}
                  onClick={(e) => clickClip(e, clip, i)}
                >
                  <Waveform file={clip.file} from={clip.start} to={clip.end} color="rgba(220, 255, 230, 0.75)" />
                  <span className="clip-label">{clip.muted ? '🔇 ' : ''}{clip.name}</span>
                </div>
              ))}
            </div>
          </div>

          {/* A2: música */}
          <div className="lane a-lane">
            <div className="track-head">
              <span className="track-id a">A2</span>
              <span className="track-name">Música</span>
              <button className={`mute-btn ${props.a2Muted ? 'on' : ''}`} onClick={() => props.onToggleMute('a2')} title="Silenciar pista">M</button>
            </div>
            <div
              className={`track ${props.a2Muted ? 'muted-track' : ''}`}
              style={{ width: contentWidth }}
              onClick={(e) => props.onSeek(timeAt(e, e.currentTarget))}
            >
              {music ? (
                <div className="music" style={{ width: Math.max(4, musicLength * pxPerSec - 1) }}>
                  <Waveform file={music.file} from={music.offset} to={music.offset + musicLength} color="rgba(255, 240, 210, 0.8)" />
                  <span className="clip-label">{music.name} · {Math.round(music.volume * 100)}%</span>
                </div>
              ) : (
                <span className="track-hint">Sin música</span>
              )}
            </div>
          </div>

          {clips.length > 0 && <div className="playhead" style={{ left: HEADER_WIDTH + time * pxPerSec }} />}
        </div>
      </div>
    </section>
  )
}
