import { useState, type ReactNode } from 'react'
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
  onMusicChange: (patch: Partial<MusicTrack>) => void
  onMusicRemove: () => void
}

type Tab = 'video' | 'audio' | 'transition'

const MIN_LENGTH = 0.1

/** Fila del inspector: etiqueta, control deslizante y valor. */
function Param(props: {
  label: string
  value: number
  min: number
  max: number
  step: number
  display: string
  disabled?: boolean
  onChange: (v: number) => void
}) {
  return (
    <label className="param">
      <span className="param-label">{props.label}</span>
      <input
        type="range" min={props.min} max={props.max} step={props.step} value={props.value}
        disabled={props.disabled}
        onChange={(e) => props.onChange(Number(e.target.value))}
      />
      <span className="param-value">{props.display}</span>
    </label>
  )
}

function Section({ title, children, enabled }: { title: string; children: ReactNode; enabled?: boolean }) {
  return (
    <div className="insp-section">
      <div className="insp-section-head">
        <span className={`dot ${enabled === false ? 'off' : ''}`} />
        {title}
      </div>
      {children}
    </div>
  )
}

export function Inspector(props: Props) {
  const { clip, index, count, music, stingers } = props
  const [tab, setTab] = useState<Tab>('video')
  const isLast = index === count - 1
  const current = clip?.transitionId ? stingers.find((s) => s.id === clip.transitionId) : undefined
  const categories = [...new Set(stingers.map((s) => s.category))].sort((a, b) => a.localeCompare(b))

  return (
    <section className="panel inspector">
      <header className="panel-head">
        <span className="panel-title">Inspector</span>
        <span className="muted small-text insp-clip-name" title={clip?.name}>{clip?.name ?? ''}</span>
      </header>
      <div className="insp-tabs" role="tablist">
        {([
          ['video', '▣', 'Video'],
          ['audio', '♪', 'Audio'],
          ['transition', '⧉', 'Transición'],
        ] as [Tab, string, string][]).map(([id, icon, label]) => (
          <button key={id} role="tab" aria-selected={tab === id} className={`insp-tab ${tab === id ? 'active' : ''}`} onClick={() => setTab(id)}>
            <span className="insp-tab-icon">{icon}</span>
            {label}
          </button>
        ))}
      </div>

      <div className="insp-body">
        {tab === 'video' &&
          (!clip ? (
            <p className="muted insp-empty">Selecciona un clip en la línea de tiempo.</p>
          ) : (
            <>
              <Section title="Recorte">
                <Param
                  label="Entrada" min={0} max={clip.duration} step={0.05} value={clip.start} display={formatTime(clip.start)}
                  onChange={(v) => {
                    const start = Math.min(v, clip.end - MIN_LENGTH)
                    props.onChange({ start }, start)
                  }}
                />
                <Param
                  label="Salida" min={0} max={clip.duration} step={0.05} value={clip.end} display={formatTime(clip.end)}
                  onChange={(v) => {
                    const end = Math.max(v, clip.start + MIN_LENGTH)
                    props.onChange({ end }, end)
                  }}
                />
                <div className="param static">
                  <span className="param-label">Duración</span>
                  <span className="param-text">{formatTime(clipLength(clip))} de {formatTime(clip.duration)}</span>
                </div>
                <div className="insp-actions">
                  <button className="small" onClick={() => props.onChange({ start: 0, end: clip.duration }, 0)}>Restablecer</button>
                </div>
              </Section>
              <Section title="Posición">
                <div className="insp-actions">
                  <button className="small" disabled={index <= 0} onClick={() => props.onMove(-1)}>← Mover</button>
                  <button className="small" disabled={isLast} onClick={() => props.onMove(1)}>Mover →</button>
                  <button className="small danger" onClick={props.onRemove}>Eliminar clip</button>
                </div>
              </Section>
            </>
          ))}

        {tab === 'audio' && (
          <>
            {clip ? (
              <Section title="Audio del clip" enabled={!clip.muted}>
                <Param
                  label="Volumen" min={0} max={1} step={0.01} value={clip.volume} disabled={clip.muted}
                  display={clip.muted ? '—' : `${Math.round(clip.volume * 100)}%`}
                  onChange={(v) => props.onChange({ volume: v })}
                />
                <label className="check">
                  <input type="checkbox" checked={clip.muted} onChange={(e) => props.onChange({ muted: e.target.checked })} />
                  Silenciar audio original
                </label>
              </Section>
            ) : (
              <p className="muted insp-empty">Selecciona un clip para ajustar su audio.</p>
            )}
            <Section title="Música de fondo" enabled={!!music}>
              {!music ? (
                <p className="muted small-text">Haz doble clic en un audio de la biblioteca para usarlo como música.</p>
              ) : (
                <>
                  <div className="param static">
                    <span className="param-label">Archivo</span>
                    <span className="param-text" title={music.name}>{music.name}</span>
                  </div>
                  <Param
                    label="Empezar en" min={0} max={Math.max(0, music.duration - 1)} step={0.1} value={music.offset}
                    display={formatTime(music.offset)} onChange={(v) => props.onMusicChange({ offset: v })}
                  />
                  <Param
                    label="Volumen" min={0} max={1} step={0.01} value={music.volume}
                    display={`${Math.round(music.volume * 100)}%`} onChange={(v) => props.onMusicChange({ volume: v })}
                  />
                  <label className="check">
                    <input type="checkbox" checked={music.fadeOut} onChange={(e) => props.onMusicChange({ fadeOut: e.target.checked })} />
                    Fundido de salida al final (2 s)
                  </label>
                  <div className="insp-actions">
                    <button className="small danger" onClick={props.onMusicRemove}>Quitar música</button>
                  </div>
                </>
              )}
            </Section>
          </>
        )}

        {tab === 'transition' && (
          <>
            <Section title="Transición al siguiente clip" enabled={!!clip?.transitionId}>
              {!clip ? (
                <p className="muted small-text">Selecciona un clip en la línea de tiempo.</p>
              ) : (
                <>
                  <label className="param">
                    <span className="param-label">Tipo</span>
                    <select
                      value={clip.transitionId ?? ''}
                      disabled={isLast || stingers.length === 0}
                      onChange={(e) => props.onChange({ transitionId: e.target.value || null })}
                      aria-label="Transición al siguiente clip"
                    >
                      <option value="">
                        {isLast ? 'Es el último clip' : stingers.length ? 'Corte directo' : 'Importa transiciones primero'}
                      </option>
                      {categories.map((c) => (
                        <optgroup key={c} label={c}>
                          {stingers.filter((s) => s.category === c).map((s) => (
                            <option key={s.id} value={s.id}>{s.name.replace(/\.webm$/i, '')}</option>
                          ))}
                        </optgroup>
                      ))}
                    </select>
                  </label>
                  {stingers.length > 0 && count > 1 && (
                    <div className="insp-actions">
                      <button className="small" onClick={() => props.onApplyTransitionToAll(clip.transitionId ?? stingers[0].id)}>
                        Usar {clip.transitionId ? 'esta' : 'la primera'} en todos los cortes
                      </button>
                    </div>
                  )}
                </>
              )}
            </Section>
            <Section title="Ajustes de la transición" enabled={!!current}>
              {current ? (
                <div className="stinger-row">
                  <div className="stinger-head">
                    {current.thumbnail && <img src={current.thumbnail} alt="" />}
                    <span className="param-text" title={current.name}>
                      {current.name.replace(/\.webm$/i, '')} <span className="muted">· {current.category}</span>
                    </span>
                  </div>
                  <Param
                    label="Corte en" min={0} max={current.duration} step={0.05} value={current.cutPoint}
                    display={formatTime(current.cutPoint)} onChange={(v) => props.onStingerChange(current.id, { cutPoint: v })}
                  />
                  <p className="muted small-text insp-note">
                    Momento en que la animación tapa la pantalla y se pasa al clip siguiente. Se guarda en el banco y se aplica
                    en todos los cortes que usen esta transición.
                  </p>
                </div>
              ) : (
                <p className="muted small-text">
                  {stingers.length
                    ? 'Elige una transición arriba o arrástrala desde el panel Efectos a un corte.'
                    : 'Tu banco está vacío: importa transiciones WEBM desde el panel Efectos.'}
                </p>
              )}
              <div className="insp-actions">
                <button className="small" onClick={props.onAddStingers}>＋ Importar transiciones</button>
              </div>
            </Section>
          </>
        )}
      </div>
    </section>
  )
}
