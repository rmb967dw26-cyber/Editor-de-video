import { formatTime } from './media'
import type { Stinger } from './types'

interface Props {
  stingers: Stinger[]
  onImport: () => void
  onRemove: (id: string) => void
}

export const STINGER_DRAG_TYPE = 'application/x-editor-stinger'

export function EffectsLibrary({ stingers, onImport, onRemove }: Props) {
  return (
    <section className="panel effects">
      <header className="panel-head">
        <span className="panel-title">Efectos</span>
        <button className="icon-btn" onClick={onImport} title="Importar transiciones WEBM">＋</button>
      </header>
      <div className="effects-body">
        <nav className="bins" aria-label="Categorías">
          <div className="bins-title">Caja de herramientas</div>
          <button className="bin active">
            <span>Transiciones de video</span>
            <span className="muted">{stingers.length}</span>
          </button>
        </nav>
        <div className="effects-list">
          <div className="effects-group">Stinger</div>
          {stingers.length === 0 && (
            <button className="pool-empty" onClick={onImport}>
              Importa transiciones WEBM con fondo transparente
            </button>
          )}
          {stingers.map((s) => (
            <div
              key={s.id}
              className="effect-item"
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData(STINGER_DRAG_TYPE, s.id)
                e.dataTransfer.effectAllowed = 'copy'
              }}
              title="Arrastra a un corte de la línea de tiempo"
            >
              <span className="effect-thumb" style={s.thumbnail ? { backgroundImage: `url(${s.thumbnail})` } : undefined} />
              <span className="effect-name">{s.name.replace(/\.webm$/i, '')}</span>
              <span className="muted small-text">{formatTime(s.duration)}</span>
              <button className="icon-btn ghost" onClick={() => onRemove(s.id)} title="Quitar">✕</button>
            </div>
          ))}
          {stingers.length > 0 && (
            <p className="muted small-text hint">Arrastra una transición sobre un corte entre dos clips.</p>
          )}
        </div>
      </div>
    </section>
  )
}
