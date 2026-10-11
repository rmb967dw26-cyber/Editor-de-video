export interface Clip {
  id: string
  file: File
  url: string
  name: string
  /** Duración total del archivo original, en segundos. */
  duration: number
  /** Punto de entrada (recorte inicial), en segundos. */
  start: number
  /** Punto de salida (recorte final), en segundos. */
  end: number
  /** Volumen del audio original, de 0 a 1. */
  volume: number
  muted: boolean
  thumbnail: string | null
  /** Id de la transición stinger que se muestra al pasar al clip siguiente. */
  transitionId: string | null
}

/**
 * Transición tipo «stinger»: un video WEBM con transparencia que se superpone
 * al corte entre dos clips. El cambio de clip ocurre en `cutPoint`, cuando la
 * animación tapa toda la pantalla.
 */
export interface Stinger {
  id: string
  file: File
  url: string
  name: string
  duration: number
  /** Segundo del stinger en el que se produce el corte. */
  cutPoint: number
  thumbnail: string | null
}

/** Una transición colocada en la línea de tiempo, en segundos globales. */
export interface PlacedTransition {
  stinger: Stinger
  /** Índice del clip tras el que va la transición. */
  clipIndex: number
  /** Instante del corte. */
  cut: number
  /** Inicio del stinger (puede ser negativo si el primer clip es muy corto). */
  start: number
}

export interface MusicTrack {
  file: File
  url: string
  name: string
  duration: number
  /** Segundo de la canción desde el que empieza a sonar. */
  offset: number
  /** Volumen de la música, de 0 a 1. */
  volume: number
  fadeOut: boolean
}

export interface ExportSettings {
  width: number
  height: number
}

export const clipLength = (c: Clip) => Math.max(0, c.end - c.start)

/** Calcula dónde empieza cada transición asignada a los clips. */
export function placeTransitions(clips: Clip[], starts: number[], stingers: Stinger[]): PlacedTransition[] {
  const byId = new Map(stingers.map((s) => [s.id, s]))
  const placed: PlacedTransition[] = []
  for (let i = 0; i < clips.length - 1; i++) {
    const stinger = clips[i].transitionId ? byId.get(clips[i].transitionId!) : undefined
    if (!stinger) continue
    const cut = starts[i + 1]
    placed.push({ stinger, clipIndex: i, cut, start: cut - stinger.cutPoint })
  }
  return placed
}
