import { newId } from './media'

export type TitleFont = 'sans' | 'serif' | 'mono' | 'display'
export type TitlePosition = 'top' | 'center' | 'bottom' | 'lower-third' | 'custom'
export type TitleBackground = 'none' | 'box' | 'band'

/** Título o texto de la pista V2. Los tiempos son globales (segundos de la línea de tiempo). */
export interface TitleItem {
  id: string
  text: string
  start: number
  duration: number
  font: TitleFont
  /** Tamaño de letra en % de la altura del video. */
  size: number
  color: string
  bold: boolean
  position: TitlePosition
  align: 'left' | 'center' | 'right'
  /** Centro del texto en fracción del ancho/alto (0–1); solo con `position: 'custom'`. */
  x?: number
  y?: number
  background: TitleBackground
  bgColor: string
  shadow: boolean
  /** Aparece y desaparece con un fundido. */
  fade: boolean
}

export const FONT_LABELS: Record<TitleFont, string> = {
  sans: 'Sans',
  serif: 'Serif',
  mono: 'Monoespaciada',
  display: 'Impacto',
}

const FONT_STACKS: Record<TitleFont, string> = {
  sans: 'system-ui, "Segoe UI", Roboto, Arial, sans-serif',
  serif: 'Georgia, "Times New Roman", serif',
  mono: 'ui-monospace, Menlo, Consolas, monospace',
  display: 'Impact, "Arial Black", "Helvetica Neue", sans-serif',
}

export const POSITION_LABELS: Record<TitlePosition, string> = {
  top: 'Arriba',
  center: 'Centro',
  bottom: 'Abajo',
  'lower-third': 'Rótulo inferior',
  custom: 'Libre (arrastrado)',
}

export const FADE_SECONDS = 0.4
export const MIN_TITLE_DURATION = 0.3

/** Estilos de partida para los títulos nuevos. */
export const TITLE_PRESETS: { label: string; style: Partial<TitleItem> }[] = [
  { label: 'Título', style: { text: 'Título', size: 11, bold: true, position: 'center', align: 'center', background: 'none', shadow: true, font: 'sans' } },
  { label: 'Rótulo', style: { text: 'Nombre Apellido\nCargo o lugar', size: 5.5, bold: true, position: 'lower-third', align: 'left', background: 'box', bgColor: '#000000', shadow: false, font: 'sans' } },
  { label: 'Subtítulo', style: { text: 'Escribe aquí el subtítulo', size: 5, bold: false, position: 'bottom', align: 'center', background: 'box', bgColor: '#000000', shadow: false, font: 'sans' } },
  { label: 'Impacto', style: { text: '¡WOW!', size: 16, bold: true, position: 'center', align: 'center', background: 'none', shadow: true, font: 'display', color: '#ffd23f' } },
]

export function createTitle(start: number, preset = TITLE_PRESETS[0]): TitleItem {
  return {
    id: newId(),
    text: 'Título',
    start,
    duration: 3,
    font: 'sans',
    size: 10,
    color: '#ffffff',
    bold: true,
    position: 'center',
    align: 'center',
    background: 'none',
    bgColor: '#000000',
    shadow: true,
    fade: true,
    ...preset.style,
  }
}

/** Opacidad del título en el segundo `local` desde su inicio (fundidos de entrada y salida). */
export function titleOpacity(title: TitleItem, local: number): number {
  if (local < 0 || local > title.duration) return 0
  if (!title.fade) return 1
  const fade = Math.min(FADE_SECONDS, title.duration / 2)
  return Math.max(0, Math.min(1, local / fade, (title.duration - local) / fade))
}

/** Parte el texto en líneas que quepan en `maxWidth`. */
function wrapLines(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const lines: string[] = []
  for (const paragraph of text.split('\n')) {
    const words = paragraph.split(/\s+/).filter(Boolean)
    if (words.length === 0) {
      lines.push('')
      continue
    }
    let line = words[0]
    for (const word of words.slice(1)) {
      const candidate = `${line} ${word}`
      if (ctx.measureText(candidate).width <= maxWidth) line = candidate
      else {
        lines.push(line)
        line = word
      }
    }
    lines.push(line)
  }
  return lines
}

export interface TitleLayout {
  font: string
  fontPx: number
  lines: string[]
  lineHeight: number
  /** Punto de anclaje horizontal del texto según la alineación. */
  anchorX: number
  centerY: number
  /** Rectángulo que ocupa el título, con su margen interior (para el fondo y para hacer clic). */
  box: { x: number; y: number; w: number; h: number }
}

/** Calcula dónde y cómo se coloca un título en un fotograma de W×H. */
export function layoutTitle(ctx: CanvasRenderingContext2D, title: TitleItem, W: number, H: number): TitleLayout {
  const fontPx = Math.max(4, (title.size / 100) * H)
  const font = `${title.bold ? 700 : 400} ${fontPx}px ${FONT_STACKS[title.font]}`
  ctx.save()
  ctx.font = font
  const margin = W * 0.06
  const custom = title.position === 'custom'
  const maxWidth = custom ? W * 0.9 : title.position === 'lower-third' ? W * 0.6 : W - margin * 2
  const lines = wrapLines(ctx, title.text, maxWidth)
  const blockW = Math.max(...lines.map((l) => ctx.measureText(l).width), 1)
  ctx.restore()
  const lineHeight = fontPx * 1.22
  const blockH = lines.length * lineHeight
  const align = title.align

  let centerY: number
  let blockLeft: number
  if (custom) {
    centerY = (title.y ?? 0.5) * H
    blockLeft = (title.x ?? 0.5) * W - blockW / 2
  } else {
    centerY =
      title.position === 'top' ? H * 0.08 + blockH / 2
        : title.position === 'bottom' ? H * 0.9 - blockH / 2
          : title.position === 'lower-third' ? H * 0.82 - blockH / 2
            : H / 2
    blockLeft = align === 'left' ? margin : align === 'right' ? W - margin - blockW : W / 2 - blockW / 2
  }
  const anchorX = align === 'left' ? blockLeft : align === 'right' ? blockLeft + blockW : blockLeft + blockW / 2
  const pad = fontPx * 0.35
  return {
    font, fontPx, lines, lineHeight, anchorX, centerY,
    box: { x: blockLeft - pad, y: centerY - blockH / 2 - pad, w: blockW + pad * 2, h: blockH + pad * 2 },
  }
}

/**
 * Dibuja un título en un lienzo de W×H. Lo usan la vista previa y la
 * exportación, así que el resultado es idéntico en ambos.
 */
export function drawTitle(ctx: CanvasRenderingContext2D, title: TitleItem, W: number, H: number, opacity = 1) {
  if (opacity <= 0 || !title.text.trim()) return
  const layout = layoutTitle(ctx, title, W, H)
  const { box, fontPx, lines, lineHeight, anchorX, centerY } = layout
  ctx.save()
  ctx.globalAlpha = opacity
  ctx.font = layout.font
  ctx.textBaseline = 'middle'

  if (title.background !== 'none') {
    ctx.fillStyle = title.bgColor
    ctx.globalAlpha = opacity * 0.72
    if (title.background === 'band') ctx.fillRect(0, box.y, W, box.h)
    else ctx.fillRect(box.x, box.y, box.w, box.h)
    ctx.globalAlpha = opacity
  }

  if (title.shadow) {
    ctx.shadowColor = 'rgba(0, 0, 0, 0.75)'
    ctx.shadowBlur = fontPx * 0.18
    ctx.shadowOffsetY = fontPx * 0.05
  }
  ctx.fillStyle = title.color
  ctx.textAlign = title.align
  const blockH = lines.length * lineHeight
  lines.forEach((line, i) => {
    ctx.fillText(line, anchorX, centerY - blockH / 2 + lineHeight * (i + 0.5))
  })
  ctx.restore()
}

/** Imagen PNG transparente del título, para superponerla al exportar. */
export async function renderTitlePng(title: TitleItem, W: number, H: number): Promise<Uint8Array> {
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('No se pudo dibujar el título')
  drawTitle(ctx, title, W, H)
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
  if (!blob) throw new Error('No se pudo generar la imagen del título')
  return new Uint8Array(await blob.arrayBuffer())
}
