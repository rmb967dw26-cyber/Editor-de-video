import { useState } from 'react'
import { formatTime } from './media'
import type { MediaItem } from './types'

interface Props {
  items: MediaItem[]
  selectedId: string | null
  importing: number
  onSelect: (item: MediaItem) => void
  /** Doble clic: un video se añade al final de la línea de tiempo; un audio pasa a ser la música. */
  onActivate: (item: MediaItem) => void
  onImport: () => void
}

type Bin = 'all' | 'video' | 'audio'

export const MEDIA_DRAG_TYPE = 'application/x-editor-media'

export function MediaPool({ items, selectedId, importing, onSelect, onActivate, onImport }: Props) {
  const [bin, setBin] = useState<Bin>('all')
  const visible = items.filter((i) => bin === 'all' || i.kind === bin)
  const count = (k: Bin) => items.filter((i) => k === 'all' || i.kind === k).length

  return (
    <section className="panel pool">
      <header className="panel-head">
        <span className="panel-title">Medios</span>
        <span className="muted small-text">{importing > 0 ? `Importando ${importing}…` : `${items.length} archivo(s)`}</span>
        <button className="icon-btn" onClick={onImport} title="Importar videos o audio">＋</button>
      </header>
      <div className="pool-body">
        <nav className="bins" aria-label="Carpetas">
          <div className="bins-title">Proyecto</div>
          {(['all', 'video', 'audio'] as Bin[]).map((k) => (
            <button key={k} className={`bin ${bin === k ? 'active' : ''}`} onClick={() => setBin(k)}>
              <span>{k === 'all' ? '▾ Todo' : k === 'video' ? '　Videos' : '　Audio'}</span>
              <span className="muted">{count(k)}</span>
            </button>
          ))}
        </nav>
        <div className="pool-grid">
          {visible.length === 0 && (
            <button className="pool-empty" onClick={onImport}>
              Importa o arrastra aquí tus videos y canciones
            </button>
          )}
          {visible.map((item) => (
            <div
              key={item.id}
              className={`pool-item ${item.id === selectedId ? 'selected' : ''}`}
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData(MEDIA_DRAG_TYPE, item.id)
                e.dataTransfer.effectAllowed = 'copy'
              }}
              onClick={() => onSelect(item)}
              onDoubleClick={() => onActivate(item)}
              title={item.kind === 'video' ? 'Doble clic o arrastrar a la línea de tiempo' : 'Doble clic para usar como música'}
            >
              <div className="pool-thumb" style={item.thumbnail ? { backgroundImage: `url(${item.thumbnail})` } : undefined}>
                {item.kind === 'audio' && <span className="pool-audio-icon">♪</span>}
                <span className="pool-duration">{formatTime(item.duration).replace(/\.\d$/, '')}</span>
              </div>
              <div className="pool-name" title={item.name}>{item.name}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
