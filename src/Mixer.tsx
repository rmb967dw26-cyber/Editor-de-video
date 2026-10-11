import { useEffect, useRef } from 'react'
import { audioEngine, type Bus } from './audioEngine'

interface Strip {
  id: Bus | 'master'
  label: string
  /** Nombre de la pista, mostrado bajo la etiqueta. */
  name?: string
  value?: number
  muted?: boolean
  disabled?: boolean
  onChange?: (v: number) => void
  onMute?: () => void
}

/** Mezclador con medidores de nivel en vivo y faders por pista. */
export function Mixer({ strips }: { strips: Strip[] }) {
  const meters = useRef(new Map<string, HTMLDivElement>())

  useEffect(() => {
    let raf = 0
    const held = new Map<string, number>()
    const tick = () => {
      for (const [id, el] of meters.current) {
        const peak = audioEngine.level(id as Bus | 'master')
        const db = peak > 0 ? 20 * Math.log10(peak) : -100
        const pct = Math.max(0, Math.min(1, (db + 60) / 60))
        // Caída suave como en un medidor real.
        const shown = Math.max(pct, (held.get(id) ?? 0) - 0.02)
        held.set(id, shown)
        el.style.transform = `scaleY(${shown})`
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [])

  return (
    <section className="panel mixer">
      <header className="panel-head">
        <span className="panel-title">Mezclador</span>
      </header>
      <div className="strips">
        {strips.map((s) => (
          <div key={s.id} className={`strip ${s.disabled ? 'disabled' : ''}`}>
            <div className="strip-label">{s.label}</div>
            <div className="strip-name" title={s.name}>{s.name}</div>
            <div className="strip-body">
              <div className="meter">
                <div
                  className="meter-fill"
                  ref={(el) => {
                    if (el) meters.current.set(s.id, el)
                    else meters.current.delete(s.id)
                  }}
                />
              </div>
              {s.onChange ? (
                <input
                  className="fader"
                  type="range" min={0} max={1.5} step={0.01} value={s.value ?? 1}
                  disabled={s.disabled}
                  aria-label={`Volumen ${s.label}`}
                  onChange={(e) => s.onChange!(Number(e.target.value))}
                />
              ) : (
                <div className="fader-spacer" />
              )}
            </div>
            <div className="strip-value">{s.muted ? 'Mute' : `${Math.round((s.value ?? 1) * 100)}%`}</div>
            {s.onMute && (
              <button className={`mute-btn ${s.muted ? 'on' : ''}`} onClick={s.onMute} disabled={s.disabled} title={s.id === 'master' ? 'Silenciar todo' : 'Silenciar pista'}>
                M
              </button>
            )}
          </div>
        ))}
      </div>
    </section>
  )
}
