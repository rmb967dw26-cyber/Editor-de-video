import { useCallback, useEffect, useRef, useState } from 'react'

/** Número máximo de pasos que se pueden deshacer. */
const LIMIT = 200
/** Cambios seguidos en el mismo deslizador dentro de este margen cuentan como un solo paso. */
const MERGE_MS = 1500

/**
 * Historial de deshacer/rehacer basado en instantáneas del estado del proyecto.
 *
 * Cada vez que cambia `snapshot` se guarda la versión anterior. Arrastrar un
 * deslizador (recorte, volumen, fader…) genera muchos cambios seguidos; esos
 * se agrupan en un único paso para que Ctrl+Z deshaga el gesto completo.
 */
export function useUndoHistory<T>(snapshot: T, restore: (state: T) => void) {
  const past = useRef<T[]>([])
  const future = useRef<T[]>([])
  const current = useRef(snapshot)
  const restoring = useRef(false)
  const lastSlider = useRef<{ el: Element | null; at: number }>({ el: null, at: 0 })
  const [counts, setCounts] = useState({ undo: 0, redo: 0 })

  const sync = () => setCounts({ undo: past.current.length, redo: future.current.length })

  useEffect(() => {
    if (snapshot === current.current) return
    if (restoring.current) {
      // Este cambio lo produjo deshacer/rehacer: no es un paso nuevo.
      restoring.current = false
      current.current = snapshot
      return
    }
    const active = document.activeElement
    const slider = active instanceof HTMLInputElement && active.type === 'range' ? active : null
    const now = performance.now()
    const merge = slider !== null && lastSlider.current.el === slider && now - lastSlider.current.at < MERGE_MS
    if (!merge) {
      past.current.push(current.current)
      if (past.current.length > LIMIT) past.current.shift()
    }
    future.current = []
    lastSlider.current = { el: slider, at: now }
    current.current = snapshot
    sync()
  }, [snapshot])

  const step = useCallback(
    (from: React.RefObject<T[]>, to: React.RefObject<T[]>) => {
      const target = from.current.pop()
      if (target === undefined) return
      to.current.push(current.current)
      restoring.current = true
      lastSlider.current = { el: null, at: 0 }
      restore(target)
      sync()
    },
    [restore],
  )

  const undo = useCallback(() => step(past, future), [step])
  const redo = useCallback(() => step(future, past), [step])

  return { undo, redo, canUndo: counts.undo > 0, canRedo: counts.redo > 0 }
}
