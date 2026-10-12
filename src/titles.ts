import { newId } from './media'

export type TitleFont = 'sans' | 'serif' | 'mono' | 'display'
export type TitlePosition = 'top' | 'center' | 'bottom' | 'lower-third'
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

/**
 * Dibuja un título en un lienzo de W×H. Lo usan la vista previa y la
 * exportación, así que el resultado es idéntico en ambos.
 */
export function drawTitle(ctx: CanvasRenderingContext2D, title: TitleItem, W: number, H: number, opacity = 1) {
  if (opacity <= 0 || !title.text.trim()) return
  const fontPx = Math.max(4, (title.size / 100) * H)
  ctx.save()
  ctx.globalAlpha = opacity
  ctx.font = `${title.bold ? 700 : 400} ${fontPx}px ${FONT_STACKS[title.font]}`
  ctx.textBaseline = 'middle'

  const margin = W * 0.06
  const lowerThird = title.position === 'lower-third'
  const maxWidth = (lowerThird ? W * 0.6 : W - margin * 2)
  const lines = wrapLines(ctx, title.text, maxWidth)
  const lineHeight = fontPx * 1.22
  const blockH = lines.length * lineHeight
  const widths = lines.map((l) => ctx.measureText(l).width)
  const blockW = Math.max(...widths, 1)

  const centerY =
    title.position === 'top' ? H * 0.08 + blockH / 2
      : title.position === 'bottom' ? H * 0.9 - blockH / 2
        : lowerThird ? H * 0.82 - blockH / 2
          : H / 2
  const align = title.align
  const anchorX = align === 'left' ? margin : align === 'right' ? W - margin : W / 2
  const pad = fontPx * 0.35

  if (title.background !== 'none') {
    ctx.fillStyle = title.bgColor
    const prev = ctx.globalAlpha
    ctx.globalAlpha = prev * 0.72
    const top = centerY - blockH / 2 - pad
    if (title.background === 'band') {
      ctx.fillRect(0, top, W, blockH + pad * 2)
    } else {
      const left = align === 'left' ? anchorX - pad : align === 'right' ? anchorX - blockW - pad : anchorX - blockW / 2 - pad
      ctx.fillRect(left, top, blockW + pad * 2, blockH + pad * 2)
    }
    ctx.globalAlpha = prev
  }

  if (title.shadow) {
    ctx.shadowColor = 'rgba(0, 0, 0, 0.75)'
    ctx.shadowBlur = fontPx * 0.18
    ctx.shadowOffsetY = fontPx * 0.05
  }
  ctx.fillStyle = title.color
  ctx.textAlign = align
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
