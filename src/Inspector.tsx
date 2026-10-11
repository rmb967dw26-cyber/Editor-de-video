import { formatTime } from './media'
import { clipLength, type Clip, type MusicTrack } from './types'

interface Props {
  clip: Clip | null
  index: number
  count: number
  music: MusicTrack | null
  /** `previewAt`: segundo del archivo original que mostrar en la vista previa. */
  onChange: (patch: Partial<Clip>, previewAt?: number) => void
  onRemove: () => void
  onMove: (dir: -1 | 1) => void
  onMusicChange: (patch: Partial<MusicTrack>) => void
  onMusicRemove: () => void
}

const MIN_LENGTH = 0.1

export function Inspector({ clip, index, count, music, onChange, onRemove, onMove, onMusicChange, onMusicRemove }: Props) {
  return (
    <aside className="inspector">
      <div className="panel">
        <h2>Clip</h2>
        {!clip ? (
          <p className="muted">Selecciona un clip en la línea de tiempo para recortarlo o ajustar su audio.</p>
        ) : (
          <>
            <p className="filename" title={clip.name}>{clip.name}</p>
            <p className="muted">
              Duración: {formatTime(clipLength(clip))} (original {formatTime(clip.duration)})
            </p>

            <label className="field">
              <span>Inicio <b>{formatTime(clip.start)}</b></span>
              <input
                type="range" min={0} max={clip.duration} step={0.05} value={clip.start}
                onChange={(e) => {
                  const start = Math.min(Number(e.target.value), clip.end - MIN_LENGTH)
                  onChange({ start }, start)
                }}
              />
            </label>
            <label className="field">
              <span>Fin <b>{formatTime(clip.end)}</b></span>
              <input
                type="range" min={0} max={clip.duration} step={0.05} value={clip.end}
                onChange={(e) => {
                  const end = Math.max(Number(e.target.value), clip.start + MIN_LENGTH)
                  onChange({ end }, end)
                }}
              />
            </label>
            <button className="small" onClick={() => onChange({ start: 0, end: clip.duration }, 0)}>
              Restablecer recorte
            </button>

            <label className="field">
              <span>Volumen <b>{clip.muted ? 'silenciado' : `${Math.round(clip.volume * 100)}%`}</b></span>
              <input
                type="range" min={0} max={1} step={0.01} value={clip.volume} disabled={clip.muted}
                onChange={(e) => onChange({ volume: Number(e.target.value) })}
              />
            </label>
            <label className="check">
              <input type="checkbox" checked={clip.muted} onChange={(e) => onChange({ muted: e.target.checked })} />
              Silenciar audio original
            </label>

            <div className="row">
              <button className="small" disabled={index <= 0} onClick={() => onMove(-1)}>← Mover</button>
              <button className="small" disabled={index >= count - 1} onClick={() => onMove(1)}>Mover →</button>
              <button className="small danger" onClick={onRemove}>Eliminar</button>
            </div>
          </>
        )}
      </div>

      <div className="panel">
        <h2>Música</h2>
        {!music ? (
          <p className="muted">Añade una canción (MP3, WAV, M4A…) para ponerla de fondo.</p>
        ) : (
          <>
            <p className="filename" title={music.name}>♪ {music.name}</p>
            <label className="field">
              <span>Empezar la canción en <b>{formatTime(music.offset)}</b></span>
              <input
                type="range" min={0} max={Math.max(0, music.duration - 1)} step={0.1} value={music.offset}
                onChange={(e) => onMusicChange({ offset: Number(e.target.value) })}
              />
            </label>
            <label className="field">
              <span>Volumen <b>{Math.round(music.volume * 100)}%</b></span>
              <input
                type="range" min={0} max={1} step={0.01} value={music.volume}
                onChange={(e) => onMusicChange({ volume: Number(e.target.value) })}
              />
            </label>
            <label className="check">
              <input type="checkbox" checked={music.fadeOut} onChange={(e) => onMusicChange({ fadeOut: e.target.checked })} />
              Fundido de salida al final (2 s)
            </label>
            <button className="small danger" onClick={onMusicRemove}>Quitar música</button>
          </>
        )}
      </div>

      <div className="panel shortcuts muted">
        <b>Atajos:</b> Espacio reproducir · S dividir · ←/→ fotograma (Mayús: 1 s) · Supr eliminar
      </div>
    </aside>
  )
}
