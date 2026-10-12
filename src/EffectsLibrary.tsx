import { useState } from 'react'
import { formatTime } from './media'
import type { Stinger } from './types'

interface Props {
  stingers: Stinger[]
  onImport: () => void
  onImportFolder: () => void
  onRemove: (id: string) => void
}

export const STINGER_DRAG_TYPE = 'application/x-editor-stinger'

const ALL = '__todas__'

/** Banco de transiciones: agrupadas por paquete, se arrastran a un corte de la línea de tiempo. */
export function EffectsLibrary({ stingers, onImport, onImportFolder, onRemove }: Props) {
  const [category, setCategory] = useState(ALL)
  const [query, setQuery] = useState('')

  const categories = [...new Set(stingers.map((s) => s.category))].sort((a, b) => a.localeCompare(b))
  const active = category === ALL || categories.includes(category) ? category : ALL
  const q = query.trim().toLowerCase()
  const visible = stingers.filter(
    (s) => (active === ALL || s.category === active) && (!q || s.name.toLowerCase().includes(q)),
  )
  // Agrupa por paquete cuando se ven todas.
  const groups = (active === ALL ? categories : [active])
    .map((c) => ({ name: c, items: visible.filter((s) => s.category === c) }))
    .filter((g) => g.items.length > 0)

  return (
    <section className="panel effects">
      <header className="panel-head">
        <span className="panel-title">Efectos</span>
        <span className="muted small-text">{stingers.length} transición(es)</span>
        <span className="head-actions">
          <button className="icon-btn" onClick={onImportFolder} title="Importar una carpeta con transiciones (busca todos los .webm)">
            📁
          </button>
          <button className="icon-btn" onClick={onImport} title="Importar archivos .webm">＋</button>
        </span>
      </header>
      <div className="effects-body">
        <nav className="bins" aria-label="Paquetes de transiciones">
          <div className="bins-title">Banco de transiciones</div>
          <button className={`bin ${active === ALL ? 'active' : ''}`} onClick={() => setCategory(ALL)}>
            <span>Todas</span>
            <span className="muted">{stingers.length}</span>
          </button>
          {categories.map((c) => (
            <button key={c} className={`bin ${active === c ? 'active' : ''}`} onClick={() => setCategory(c)} title={c}>
              <span className="bin-name">{c}</span>
              <span className="muted">{stingers.filter((s) => s.category === c).length}</span>
            </button>
          ))}
        </nav>
        <div className="effects-list">
          {stingers.length > 0 && (
            <input
              className="effects-search"
              type="search"
              placeholder="Buscar transición…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="Buscar transición"
            />
          )}
          {stingers.length === 0 && (
            <div className="bank-empty">
              <p>Tu banco de transiciones está vacío.</p>
              <button className="small" onClick={onImportFolder}>📁 Importar carpeta</button>
              <button className="small" onClick={onImport}>＋ Importar archivos .webm</button>
              <p className="muted small-text">
                Elige la carpeta donde descomprimiste tus transiciones: se añadirán todos los WEBM, ordenados por paquete,
                y quedarán guardados en este navegador.
              </p>
            </div>
          )}
          {stingers.length > 0 && groups.length === 0 && <p className="muted small-text hint">Ninguna coincide con «{query}».</p>}
          {groups.map((g) => (
            <div key={g.name} className="effects-group-block">
              <div className="effects-group">{g.name}</div>
              {g.items.map((s) => (
                <div
                  key={s.id}
                  className="effect-item"
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData(STINGER_DRAG_TYPE, s.id)
                    e.dataTransfer.effectAllowed = 'copy'
                  }}
                  title={`${s.name} — arrastra a un corte de la línea de tiempo`}
                >
                  <span className="effect-thumb" style={s.thumbnail ? { backgroundImage: `url(${s.thumbnail})` } : undefined} />
                  <span className="effect-name">{s.name.replace(/\.webm$/i, '')}</span>
                  <span className="muted small-text">{formatTime(s.duration)}</span>
                  <button className="icon-btn ghost" onClick={() => onRemove(s.id)} title="Quitar del banco">✕</button>
                </div>
              ))}
            </div>
          ))}
          {stingers.length > 0 && (
            <p className="muted small-text hint">
              Arrastra una transición sobre un corte entre dos clips. Se guardan en este navegador.
            </p>
          )}
        </div>
      </div>
    </section>
  )
}
