import { useEffect, useRef, useState } from 'react'
import { drawTitle, titleOpacity, type TitleItem } from './titles'

/** Proporción del fotograma de la vista previa (la exportación por defecto es 16:9). */
const ASPECT = 16 / 9

/** Dibuja sobre el visor los títulos activos en el instante `time`. */
export function TitleOverlay({ titles, time }: { titles: TitleItem[]; time: number }) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const [box, setBox] = useState({ w: 0, h: 0 })

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

  useEffect(() => {
    const el = canvas.current
    if (!el || frameW <= 0) return
    const dpr = window.devicePixelRatio || 1
    el.width = Math.round(frameW * dpr)
    el.height = Math.round(frameH * dpr)
    const ctx = el.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, el.width, el.height)
    for (const title of titles) {
      const opacity = titleOpacity(title, time - title.start)
      if (opacity > 0) drawTitle(ctx, title, el.width, el.height, opacity)
    }
  }, [titles, time, frameW, frameH])

  return (
    <canvas
      ref={canvas}
      className="title-overlay"
      style={{ width: frameW, height: frameH, left: (box.w - frameW) / 2, top: (box.h - frameH) / 2 }}
    />
  )
}
