import { formatTime, formatTimecode } from './media'
import {
  FONT_LABELS, MIN_TITLE_DURATION, POSITION_LABELS,
  type TitleBackground, type TitleFont, type TitleItem, type TitlePosition,
} from './titles'

interface Props {
  title: TitleItem
  onChange: (patch: Partial<TitleItem>) => void
  onRemove: () => void
  onDuplicate: () => void
}

/** Panel del inspector para editar un título de la pista V2. */
export function TitleInspector({ title, onChange, onRemove, onDuplicate }: Props) {
  return (
    <div className="insp-body">
      <div className="insp-section">
        <div className="insp-section-head"><span className="dot" />Texto</div>
        <textarea
          className="title-text"
          value={title.text}
          rows={3}
          onChange={(e) => onChange({ text: e.target.value })}
          aria-label="Texto del título"
          placeholder="Escribe el texto…"
        />
      </div>

      <div className="insp-section">
        <div className="insp-section-head"><span className="dot" />Estilo</div>
        <label className="param">
          <span className="param-label">Fuente</span>
          <select value={title.font} onChange={(e) => onChange({ font: e.target.value as TitleFont })}>
            {(Object.keys(FONT_LABELS) as TitleFont[]).map((f) => (
              <option key={f} value={f}>{FONT_LABELS[f]}</option>
            ))}
          </select>
        </label>
        <label className="param">
          <span className="param-label">Tamaño</span>
          <input type="range" min={2} max={25} step={0.5} value={title.size} onChange={(e) => onChange({ size: Number(e.target.value) })} />
          <span className="param-value">{title.size}</span>
        </label>
        <div className="param">
          <span className="param-label">Color</span>
          <div className="color-row">
            <input type="color" value={title.color} onChange={(e) => onChange({ color: e.target.value })} aria-label="Color del texto" />
            <label className="check inline">
              <input type="checkbox" checked={title.bold} onChange={(e) => onChange({ bold: e.target.checked })} />
              Negrita
            </label>
            <label className="check inline">
              <input type="checkbox" checked={title.shadow} onChange={(e) => onChange({ shadow: e.target.checked })} />
              Sombra
            </label>
          </div>
        </div>
        <div className="param">
          <span className="param-label">Fondo</span>
          <div className="color-row">
            <select value={title.background} onChange={(e) => onChange({ background: e.target.value as TitleBackground })}>
              <option value="none">Sin fondo</option>
              <option value="box">Caja</option>
              <option value="band">Franja</option>
            </select>
            {title.background !== 'none' && (
              <input type="color" value={title.bgColor} onChange={(e) => onChange({ bgColor: e.target.value })} aria-label="Color del fondo" />
            )}
          </div>
        </div>
      </div>

      <div className="insp-section">
        <div className="insp-section-head"><span className="dot" />Posición</div>
        <label className="param">
          <span className="param-label">Lugar</span>
          <select
            value={title.position}
            onChange={(e) => {
              const position = e.target.value as TitlePosition
              // Al elegir una posición predefinida se olvida la posición libre.
              onChange(position === 'custom' ? { position, x: title.x ?? 0.5, y: title.y ?? 0.5 } : { position, x: undefined, y: undefined })
            }}
          >
            {(Object.keys(POSITION_LABELS) as TitlePosition[]).map((p) => (
              <option key={p} value={p}>{POSITION_LABELS[p]}</option>
            ))}
          </select>
        </label>
        {title.position === 'custom' && (
          <>
            <label className="param">
              <span className="param-label">Horizontal</span>
              <input
                type="range" min={0} max={1} step={0.005} value={title.x ?? 0.5}
                onChange={(e) => onChange({ x: Number(e.target.value) })}
              />
              <span className="param-value">{Math.round((title.x ?? 0.5) * 100)}%</span>
            </label>
            <label className="param">
              <span className="param-label">Vertical</span>
              <input
                type="range" min={0} max={1} step={0.005} value={title.y ?? 0.5}
                onChange={(e) => onChange({ y: Number(e.target.value) })}
              />
              <span className="param-value">{Math.round((title.y ?? 0.5) * 100)}%</span>
            </label>
            <div className="insp-actions">
              <button className="small" onClick={() => onChange({ x: 0.5, y: 0.5 })}>Centrar</button>
            </div>
          </>
        )}
        <p className="muted small-text insp-note">Arrastra el título en el visor para colocarlo donde quieras.</p>
        <div className="param">
          <span className="param-label">Alineación</span>
          <div className="seg" role="group" aria-label="Alineación">
            {(['left', 'center', 'right'] as const).map((a) => (
              <button key={a} className={title.align === a ? 'active' : ''} onClick={() => onChange({ align: a })}>
                {a === 'left' ? 'Izq.' : a === 'center' ? 'Centro' : 'Der.'}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="insp-section">
        <div className="insp-section-head"><span className="dot" />Tiempo</div>
        <div className="param static">
          <span className="param-label">Inicio</span>
          <span className="param-text">{formatTimecode(title.start)}</span>
        </div>
        <label className="param">
          <span className="param-label">Duración</span>
          <input
            type="range" min={MIN_TITLE_DURATION} max={30} step={0.1} value={title.duration}
            onChange={(e) => onChange({ duration: Number(e.target.value) })}
          />
          <span className="param-value">{formatTime(title.duration)}</span>
        </label>
        <label className="check">
          <input type="checkbox" checked={title.fade} onChange={(e) => onChange({ fade: e.target.checked })} />
          Fundido de entrada y salida
        </label>
        <div className="insp-actions">
          <button className="small" onClick={onDuplicate}>Duplicar</button>
          <button className="small danger" onClick={onRemove}>Eliminar título</button>
        </div>
      </div>
    </div>
  )
}
