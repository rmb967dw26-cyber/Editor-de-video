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
