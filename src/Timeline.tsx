import { useEffect, useRef, useState } from 'react'
import { formatTime, formatTimecode } from './media'
import { clipLength, type Clip, type MusicTrack, type PlacedTransition, type TrackId, type TrackNames } from './types'
import { Waveform } from './waveform'
import { MIN_TITLE_DURATION, type TitleItem } from './titles'
import { MEDIA_DRAG_TYPE } from './MediaPool'
import { STINGER_DRAG_TYPE } from './EffectsLibrary'

export type Tool = 'select' | 'blade'

/** Nombre de pista editable: doble clic para cambiarlo, Intro para guardar, Esc para cancelar. */
function TrackName({ name, onRename }: { name: string; onRename: (name: string) => void }) {
  const [editing, setEditing] = useState(false)
  if (editing) {
    return (
      <input
        className="track-name-input"
        defaultValue={name}
        autoFocus
        maxLength={40}
        aria-label="Nombre de la pista"
        onFocus={(e) => e.currentTarget.select()}
        onBlur={(e) => {
          onRename(e.currentTarget.value)
          setEditing(false)
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur()
          if (e.key === 'Escape') setEditing(false)
        }}
      />
    )
  }
  return (
    <span
      className="track-name"
      title="Doble clic para cambiar el nombre"
      tabIndex={0}
      onDoubleClick={() => setEditing(true)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === 'F2') setEditing(true)
      }}
    >
      {name}
    </span>
  )
}

interface Props {
  clips: Clip[]
  starts: number[]
  total: number
  time: number
  music: MusicTrack | null
  transitions: PlacedTransition[]
  selectedId: string | null
  tool: Tool
  trackNames: TrackNames
  onRenameTrack: (track: TrackId, name: string) => void
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
  /** Recorte arrastrando un borde; `previewAt` es el segundo del archivo que mostrar. */
  onTrim: (clipId: string, patch: Partial<Clip>, previewAt: number) => void
  /** Inicio/fin de un arrastre, para que deshacer lo trate como un solo paso. */
  onGesture: (active: boolean) => void
  titles: TitleItem[]
  selectedTitleId: string | null
  onSelectTitle: (id: string) => void
  onAddTitle: (t: number) => void
  onChangeTitle: (id: string, patch: Partial<TitleItem>) => void
}

const MIN_CLIP_LENGTH = 0.1
/** Distancia (px) a la que un título se pega a cortes y al cursor. */
const SNAP_PX = 8

const HEADER_WIDTH = 132

export function Timeline(props: Props) {
  const { clips, starts, total, time, music, transitions, selectedId, tool, titles } = props
  const scroller = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(800)
  // null = ajustar todo el proyecto al ancho disponible.
  const [zoom, setZoom] = useState<number | null>(null)
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [dropIndex, setDropIndex] = useState<number | null>(null)
  const [dropHint, setDropHint] = useState<number | null>(null)
  const [dragInfo, setDragInfo] = useState<{ id: string; text: string } | null>(null)
  // Mientras se arrastra un borde no debe empezar el arrastre para reordenar.
  const trimming = useRef(false)

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
  const titlesEnd = titles.reduce((m, t) => Math.max(m, t.start + t.duration), 0)
  const contentWidth = Math.max(total, titlesEnd, 1) * pxPerSec

  const tickStep = [0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300].find((s) => s * pxPerSec >= 90) ?? 600
  const ticks: number[] = []
  for (let t = 0; t <= Math.max(total, titlesEnd) + tickStep; t += tickStep) ticks.push(t)

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

  /** Arrastre con el puntero; `onMove` recibe el desplazamiento en segundos. */
  const startDrag = (e: React.PointerEvent, onMove: (dSeconds: number) => void) => {
    if (e.button !== 0) return
    e.stopPropagation()
    e.preventDefault()
    const x0 = e.clientX
    const scale = pxPerSec
    // En modo «Ajustar», recortar cambia la duración total y con ella la escala:
    // se fija el zoom para que el borde siga al puntero.
    if (zoom === null) setZoom(pxPerSec)
    trimming.current = true
    props.onGesture(true)
    const move = (ev: PointerEvent) => onMove((ev.clientX - x0) / scale)
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', up)
      trimming.current = false
      props.onGesture(false)
      setDragInfo(null)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
  }

  const trimClip = (e: React.PointerEvent, clip: Clip, edge: 'start' | 'end') => {
    if (tool !== 'select') return
    props.onSelect(clip.id)
    const orig = { start: clip.start, end: clip.end }
    startDrag(e, (d) => {
      if (edge === 'start') {
        const start = Math.min(Math.max(0, orig.start + d), orig.end - MIN_CLIP_LENGTH)
        props.onTrim(clip.id, { start }, start)
        setDragInfo({ id: clip.id, text: `Entrada ${formatTime(start)} · ${formatTime(orig.end - start)}` })
      } else {
        const end = Math.max(Math.min(clip.duration, orig.end + d), orig.start + MIN_CLIP_LENGTH)
        props.onTrim(clip.id, { end }, end - 0.04)
        setDragInfo({ id: clip.id, text: `Salida ${formatTime(end)} · ${formatTime(end - orig.start)}` })
      }
    })
  }

  // Puntos a los que se pegan los títulos: cortes entre clips, final y cursor.
  const snap = (t: number) => {
    const points = [0, ...starts, total, time]
    const near = points.find((p) => Math.abs(p - t) * pxPerSec <= SNAP_PX)
    return near ?? t
  }

  const dragTitle = (e: React.PointerEvent, title: TitleItem, mode: 'move' | 'start' | 'end') => {
    props.onSelectTitle(title.id)
    const orig = { start: title.start, end: title.start + title.duration }
    startDrag(e, (d) => {
      let patch: Partial<TitleItem>
      if (mode === 'move') {
        const start = Math.max(0, snap(orig.start + d))
        patch = { start }
      } else if (mode === 'start') {
        const start = Math.min(Math.max(0, snap(orig.start + d)), orig.end - MIN_TITLE_DURATION)
        patch = { start, duration: orig.end - start }
      } else {
        const end = Math.max(snap(orig.end + d), orig.start + MIN_TITLE_DURATION)
        patch = { duration: end - orig.start }
      }
      props.onChangeTitle(title.id, patch)
      const start = patch.start ?? orig.start
      const dur = patch.duration ?? orig.end - orig.start
      setDragInfo({ id: title.id, text: `${formatTimecode(start)} · ${formatTime(dur)}` })
    })
  }

  const isExternalDrag = (e: React.DragEvent) =>
    e.dataTransfer.types.includes(MEDIA_DRAG_TYPE) || e.dataTransfer.types.includes(STINGER_DRAG_TYPE)

  const clickClip = (e: React.MouseEvent<HTMLDivElement>, clip: Clip, i: number) => {
    // Soltar un tirador de recorte también genera un clic: no debe mover el cursor.
    if ((e.target as HTMLElement).classList.contains('trim-handle')) return
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

          {/* V2: títulos */}
          <div className="lane t-lane">
            <div className="track-head">
              <span className="track-id t">V2</span>
              <TrackName name={props.trackNames.v2} onRename={(n) => props.onRenameTrack('v2', n)} />
              <button className="mute-btn add-title-btn" onClick={() => props.onAddTitle(time)} title="Añadir título en el cursor">
                ＋T
              </button>
            </div>
            <div
              className="track"
              style={{ width: contentWidth }}
              onDoubleClick={(e) => {
                if (e.target === e.currentTarget) props.onAddTitle(timeAt(e, e.currentTarget))
              }}
            >
              {titles.length === 0 && <span className="track-hint">Doble clic o ＋T para añadir un título</span>}
              {titles.map((title) => (
                <div
                  key={title.id}
                  className={`title-clip ${title.id === props.selectedTitleId ? 'selected' : ''} ${title.start >= total && total > 0 ? 'outside' : ''}`}
                  style={{ left: title.start * pxPerSec, width: Math.max(6, title.duration * pxPerSec - 1) }}
                  title={`${title.text} — arrastra para mover, tira de los bordes para cambiar la duración`}
                  onPointerDown={(e) => dragTitle(e, title, 'move')}
                >
                  <span className="trim-handle left" onPointerDown={(e) => dragTitle(e, title, 'start')} />
                  <span className="title-clip-label">T · {title.text.split('\n')[0] || 'Título'}</span>
                  <span className="trim-handle right" onPointerDown={(e) => dragTitle(e, title, 'end')} />
                  {dragInfo?.id === title.id && <span className="drag-badge">{dragInfo.text}</span>}
                </div>
              ))}
            </div>
          </div>

          {/* V1: video */}
          <div className="lane v-lane">
            <div className="track-head">
              <span className="track-id v">V1</span>
              <TrackName name={props.trackNames.v1} onRename={(n) => props.onRenameTrack('v1', n)} />
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
                    if (trimming.current) {
                      e.preventDefault()
                      return
                    }
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
                  {tool === 'select' && (
                    <>
                      <span className="trim-handle left" title="Arrastra para recortar el inicio" onPointerDown={(e) => trimClip(e, clip, 'start')} />
                      <span className="trim-handle right" title="Arrastra para recortar el final" onPointerDown={(e) => trimClip(e, clip, 'end')} />
                    </>
                  )}
                  {dragInfo?.id === clip.id && <span className="drag-badge">{dragInfo.text}</span>}
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
              <TrackName name={props.trackNames.a1} onRename={(n) => props.onRenameTrack('a1', n)} />
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
              <TrackName name={props.trackNames.a2} onRename={(n) => props.onRenameTrack('a2', n)} />
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

 {(clips.length > 0 || titles.length > 0) && <div className="playhead" style={{ left: HEADER_WIDTH + time * pxPerSec }} />}
        </div>
      </div>
    </section>
  )
}
