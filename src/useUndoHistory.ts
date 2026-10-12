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
  // Gesto en curso (p. ej. arrastrar el borde de un clip): todo cuenta como un paso.
  const gesture = useRef({ active: false, recorded: false })
  const resetPending = useRef(false)
  const [counts, setCounts] = useState({ undo: 0, redo: 0 })

  const sync = () => setCounts({ undo: past.current.length, redo: future.current.length })

  useEffect(() => {
    if (snapshot === current.current) return
    if (resetPending.current) {
      // Se ha abierto otro proyecto: el historial empieza de cero.
      resetPending.current = false
      restoring.current = false
      past.current = []
      future.current = []
      current.current = snapshot
      sync()
      return
    }
    if (restoring.current) {
      // Este cambio lo produjo deshacer/rehacer: no es un paso nuevo.
      restoring.current = false
      current.current = snapshot
      return
    }
    const active = document.activeElement
    const slider = active instanceof HTMLInputElement && active.type === 'range' ? active : null
    const now = performance.now()
    const merge = gesture.current.active
      ? gesture.current.recorded
      : slider !== null && lastSlider.current.el === slider && now - lastSlider.current.at < MERGE_MS
    if (gesture.current.active) gesture.current.recorded = true
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

  /** Marca el inicio o el final de un gesto de arrastre. */
  const setGesture = useCallback((active: boolean) => {
    gesture.current = { active, recorded: false }
  }, [])

  /** Vacía el historial con el próximo cambio de estado (al abrir o crear un proyecto). */
  const reset = useCallback(() => {
    resetPending.current = true
    past.current = []
    future.current = []
    setCounts({ undo: 0, redo: 0 })
  }, [])

  return { undo, redo, setGesture, reset, canUndo: counts.undo > 0, canRedo: counts.redo > 0 }
}
