import { useEffect, useRef, useState } from 'react'
import { drawTitle, layoutTitle, titleOpacity, type TitleItem } from './titles'

/** Proporción del fotograma de la vista previa (la exportación por defecto es 16:9). */
const ASPECT = 16 / 9
/** Distancia (fracción del fotograma) a la que el título se pega al centro. */
const SNAP = 0.015
/** Opacidad del título seleccionado cuando el cursor está fuera de su tramo de tiempo. */
const GHOST_OPACITY = 0.45

interface Props {
  titles: TitleItem[]
  time: number
  selectedId: string | null
  onSelect: (id: string) => void
  onChange: (id: string, patch: Partial<TitleItem>) => void
  /** Inicio/fin del arrastre, para que deshacer lo trate como un solo paso. */
  onGesture: (active: boolean) => void
  /** Clic fuera de cualquier título (reproduce o pausa). */
  onBackgroundClick: () => void
  /** Doble clic sobre un título: editar su texto. */
  onEditText: () => void
}

interface Drag {
  id: string
  pointerX: number
  pointerY: number
  /** Centro del título al empezar, en fracción del fotograma. */
  cx: number
  cy: number
  moved: boolean
}

/**
 * Dibuja sobre el visor los títulos visibles en el instante `time` y permite
 * moverlos arrastrándolos a cualquier punto del encuadre.
 */
export function TitleOverlay(props: Props) {
  const { titles, time, selectedId } = props
  const canvas = useRef<HTMLCanvasElement>(null)
  const [box, setBox] = useState({ w: 0, h: 0 })
  const [guides, setGuides] = useState({ x: false, y: false })
  const [hover, setHover] = useState(false)
  const drag = useRef<Drag | null>(null)

  useEffect(() => {
    const parent = canvas.current?.parentElement
    if (!parent) return
    const ro = new ResizeObserver(() => setBox({ w: parent.clientWidth, h: parent.clientHeight }))
    ro.observe(parent)
    return () => ro.disconnect()
  }, [])

  // Rectángulo 16:9 centrado dentro del visor, como el video.
  const frameW = Math.min(box.w, box.h * ASPECT)
  const frameH = frameW / ASPECT

  const opacityOf = (t: TitleItem) => {
    const real = titleOpacity(t, time - t.start)
    return t.id === selectedId ? Math.max(real, GHOST_OPACITY) : real
  }

  useEffect(() => {
    const el = canvas.current
    if (!el || frameW <= 0) return
    const dpr = window.devicePixelRatio || 1
    el.width = Math.round(frameW * dpr)
    el.height = Math.round(frameH * dpr)
    const ctx = el.getContext('2d')
    if (!ctx) return
    const W = el.width
    const H = el.height
    ctx.clearRect(0, 0, W, H)
    for (const title of titles) drawTitle(ctx, title, W, H, opacityOf(title))

    // Marco del título seleccionado y guías de centrado (solo en la vista previa).
    const selected = titles.find((t) => t.id === selectedId)
    if (selected?.text.trim()) {
      const { box: b } = layoutTitle(ctx, selected, W, H)
      ctx.save()
      ctx.strokeStyle = '#e8763a'
      ctx.lineWidth = 1.5 * dpr
      ctx.setLineDash([6 * dpr, 4 * dpr])
      ctx.strokeRect(b.x, b.y, b.w, b.h)
      ctx.setLineDash([])
      ctx.strokeStyle = 'rgba(255, 59, 160, 0.9)'
      ctx.lineWidth = 1 * dpr
      if (guides.x) {
        ctx.beginPath()
        ctx.moveTo(W / 2, 0)
        ctx.lineTo(W / 2, H)
        ctx.stroke()
      }
      if (guides.y) {
        ctx.beginPath()
        ctx.moveTo(0, H / 2)
        ctx.lineTo(W, H / 2)
        ctx.stroke()
      }
      ctx.restore()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [titles, time, selectedId, frameW, frameH, guides])

  /** Título bajo el puntero (el de más arriba si se solapan). */
  const hitTest = (e: React.PointerEvent<HTMLCanvasElement>): TitleItem | null => {
    const el = canvas.current
    const ctx = el?.getContext('2d')
    if (!el || !ctx) return null
    const rect = el.getBoundingClientRect()
    const px = ((e.clientX - rect.left) / rect.width) * el.width
    const py = ((e.clientY - rect.top) / rect.height) * el.height
    for (let i = titles.length - 1; i >= 0; i--) {
      const t = titles[i]
      if (!t.text.trim() || opacityOf(t) <= 0) continue
      const { box: b } = layoutTitle(ctx, t, el.width, el.height)
      if (px >= b.x && px <= b.x + b.w && py >= b.y && py <= b.y + b.h) return t
    }
    return null
  }

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.button !== 0) return
    const hit = hitTest(e)
    if (!hit) {
      props.onBackgroundClick()
      return
    }
    e.preventDefault()
    // preventDefault impide que el foco cambie: se quita del campo de texto para
    // que Ctrl+Z deshaga el movimiento y no lo escrito.
    ;(document.activeElement as HTMLElement | null)?.blur?.()
    e.currentTarget.setPointerCapture(e.pointerId)
    props.onSelect(hit.id)
    // Centro actual del título (también si estaba en una posición predefinida).
    const el = canvas.current!
    const { box: b } = layoutTitle(el.getContext('2d')!, hit, el.width, el.height)
    drag.current = {
      id: hit.id, pointerX: e.clientX, pointerY: e.clientY,
      cx: (b.x + b.w / 2) / el.width, cy: (b.y + b.h / 2) / el.height, moved: false,
    }
  }

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const d = drag.current
    if (!d) {
      setHover(hitTest(e) !== null)
      return
    }
    const rect = e.currentTarget.getBoundingClientRect()
    const dx = (e.clientX - d.pointerX) / rect.width
    const dy = (e.clientY - d.pointerY) / rect.height
    if (!d.moved) {
      // Un clic sin mover no debe cambiar la posición.
      if (Math.hypot(e.clientX - d.pointerX, e.clientY - d.pointerY) < 3) return
      d.moved = true
      props.onGesture(true)
    }
    let x = Math.min(1, Math.max(0, d.cx + dx))
    let y = Math.min(1, Math.max(0, d.cy + dy))
    const snapX = Math.abs(x - 0.5) < SNAP
    const snapY = Math.abs(y - 0.5) < SNAP
    if (snapX) x = 0.5
    if (snapY) y = 0.5
    setGuides({ x: snapX, y: snapY })
    props.onChange(d.id, { position: 'custom', x, y })
  }

  const endDrag = () => {
    if (drag.current?.moved) props.onGesture(false)
    drag.current = null
    setGuides({ x: false, y: false })
  }

  return (
    <canvas
      ref={canvas}
      className={`title-overlay ${hover ? 'over-title' : ''}`}
      style={{ width: frameW, height: frameH, left: (box.w - frameW) / 2, top: (box.h - frameH) / 2 }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onPointerLeave={() => !drag.current && setHover(false)}
      onDoubleClick={(e) => {
        if (titles.some((t) => t.id === selectedId) && hover) {
          e.preventDefault()
          props.onEditText()
        }
      }}
    />
  )
}
