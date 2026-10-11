import { formatTime } from './media'
import { clipLength, type Clip, type MusicTrack, type Stinger } from './types'

interface Props {
  clip: Clip | null
  index: number
  count: number
  music: MusicTrack | null
  stingers: Stinger[]
  /** `previewAt`: segundo del archivo original que mostrar en la vista previa. */
  onChange: (patch: Partial<Clip>, previewAt?: number) => void
  onRemove: () => void
  onMove: (dir: -1 | 1) => void
  onApplyTransitionToAll: (stingerId: string | null) => void
  onAddStingers: () => void
  onStingerChange: (id: string, patch: Partial<Stinger>) => void
  onStingerRemove: (id: string) => void
  onMusicChange: (patch: Partial<MusicTrack>) => void
  onMusicRemove: () => void
}

const MIN_LENGTH = 0.1

export function Inspector({
  clip, index, count, music, stingers, onChange, onRemove, onMove,
  onApplyTransitionToAll, onAddStingers, onStingerChange, onStingerRemove, onMusicChange, onMusicRemove,
}: Props) {
  const isLast = index === count - 1
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

            <label className="field">
              <span>Transición al siguiente clip</span>
              <select
                value={clip.transitionId ?? ''}
                disabled={isLast || stingers.length === 0}
                onChange={(e) => onChange({ transitionId: e.target.value || null })}
              >
                <option value="">
                  {isLast ? 'Es el último clip' : stingers.length ? 'Ninguna (corte directo)' : 'Importa transiciones primero'}
                </option>
                {stingers.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </label>
            {stingers.length > 0 && count > 1 && (
              <button className="small" onClick={() => onApplyTransitionToAll(clip.transitionId ?? stingers[0].id)}>
                Usar {clip.transitionId ? 'esta transición' : 'la primera transición'} en todos los cortes
              </button>
            )}

            <div className="row">
              <button className="small" disabled={index <= 0} onClick={() => onMove(-1)}>← Mover</button>
              <button className="small" disabled={index >= count - 1} onClick={() => onMove(1)}>Mover →</button>
              <button className="small danger" onClick={onRemove}>Eliminar</button>
            </div>
          </>
        )}
      </div>

      <div className="panel">
        <h2>Transiciones</h2>
        {stingers.length === 0 ? (
          <p className="muted">
            Importa transiciones tipo <i>stinger</i> en formato WEBM con fondo transparente. Si vienen en un .rar o
            .zip, descomprímelo primero.
          </p>
        ) : (
          <ul className="stingers">
            {stingers.map((s) => (
              <li key={s.id}>
                <div className="stinger-head">
                  {s.thumbnail && <img src={s.thumbnail} alt="" />}
                  <span className="filename" title={s.name}>{s.name}</span>
                  <button className="small danger" onClick={() => onStingerRemove(s.id)} title="Quitar transición">✕</button>
                </div>
                <label className="field">
                  <span>Corte en <b>{formatTime(s.cutPoint)} / {formatTime(s.duration)}</b></span>
                  <input
                    type="range" min={0} max={s.duration} step={0.05} value={s.cutPoint}
                    onChange={(e) => onStingerChange(s.id, { cutPoint: Number(e.target.value) })}
                  />
                </label>
              </li>
            ))}
          </ul>
        )}
        <button className="small" onClick={onAddStingers}>＋ Importar transiciones</button>
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
