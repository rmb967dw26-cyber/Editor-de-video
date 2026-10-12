/**
 * Guardar y abrir proyectos.
 *
 * - En el navegador (IndexedDB): se guardan también los archivos de video y audio,
 *   así que el proyecto se abre completo sin volver a buscarlos.
 * - Como archivo .json descargable: solo guarda referencias (nombre y tamaño) a los
 *   archivos; al abrirlo en otro sitio hay que indicar dónde están.
 */
import { dbRequest, STORES } from './db'
import type { TitleItem } from './titles'
import type { TrackNames } from './types'

export const PROJECT_FORMAT = 'editor-video-proyecto'
export const PROJECT_VERSION = 1

export interface MediaRef {
  key: string
  kind: 'video' | 'audio'
  name: string
  size: number
  lastModified: number
  duration: number
  thumbnail: string | null
}

export interface ClipRef {
  mediaKey: string
  start: number
  end: number
  volume: number
  muted: boolean
  /** Transición al clip siguiente, buscada en el banco por id o por nombre y tamaño. */
  transition: { id: string; name: string; size: number } | null
}

export interface ProjectData {
  format: typeof PROJECT_FORMAT
  version: number
  name: string
  savedAt: number
  media: MediaRef[]
  clips: ClipRef[]
  music: { mediaKey: string; offset: number; volume: number; fadeOut: boolean } | null
  titles: TitleItem[]
  a1: { gain: number; muted: boolean }
  a2Muted: boolean
  master: { gain: number; muted: boolean }
  trackNames: TrackNames
}

export interface SavedProjectSummary {
  id: string
  name: string
  savedAt: number
  clipCount: number
  duration: number
  thumbnail: string | null
}

interface ProjectRecord {
  id: string
  data: ProjectData
  summary: SavedProjectSummary
}

interface MediaRecord {
  key: string
  file: File
}

/** Identificador estable de un archivo: nombre, tamaño y fecha de modificación. */
export const mediaKey = (f: File) => `${f.name}|${f.size}|${f.lastModified}`

// ---------- En el navegador ----------

export async function saveProjectToBrowser(
  id: string,
  data: ProjectData,
  files: Map<string, File>,
  summary: Omit<SavedProjectSummary, 'id' | 'name' | 'savedAt'>,
): Promise<void> {
  // Solo se copian los archivos que aún no están guardados (pueden pesar mucho).
  for (const ref of data.media) {
    const file = files.get(ref.key)
    if (!file) continue
    const exists = await dbRequest(STORES.media, 'readonly', (s) => s.getKey(ref.key))
    if (exists === undefined) {
      const record: MediaRecord = { key: ref.key, file }
      await dbRequest(STORES.media, 'readwrite', (s) => s.put(record))
    }
  }
  const record: ProjectRecord = {
    id,
    data,
    summary: { id, name: data.name, savedAt: data.savedAt, ...summary },
  }
  await dbRequest(STORES.projects, 'readwrite', (s) => s.put(record))
}

export async function listSavedProjects(): Promise<SavedProjectSummary[]> {
  const records = await dbRequest<ProjectRecord[]>(STORES.projects, 'readonly', (s) => s.getAll())
  return records.map((r) => r.summary).sort((a, b) => b.savedAt - a.savedAt)
}

export async function loadProjectFromBrowser(id: string): Promise<{ data: ProjectData; files: Map<string, File> }> {
  const record = await dbRequest<ProjectRecord | undefined>(STORES.projects, 'readonly', (s) => s.get(id))
  if (!record) throw new Error('El proyecto ya no existe en este navegador')
  const files = await findStoredMedia(record.data.media.map((m) => m.key))
  return { data: record.data, files }
}

/** Busca en el navegador los archivos ya guardados por otros proyectos. */
export async function findStoredMedia(keys: string[]): Promise<Map<string, File>> {
  const files = new Map<string, File>()
  for (const key of keys) {
    const media = await dbRequest<MediaRecord | undefined>(STORES.media, 'readonly', (s) => s.get(key))
    if (media) files.set(key, media.file)
  }
  return files
}

/** Elimina el proyecto y los archivos que ya no use ningún otro proyecto guardado. */
export async function deleteSavedProject(id: string): Promise<void> {
  const all = await dbRequest<ProjectRecord[]>(STORES.projects, 'readonly', (s) => s.getAll())
  const target = all.find((r) => r.id === id)
  await dbRequest(STORES.projects, 'readwrite', (s) => s.delete(id))
  if (!target) return
  const stillUsed = new Set(all.filter((r) => r.id !== id).flatMap((r) => r.data.media.map((m) => m.key)))
  for (const ref of target.data.media) {
    if (!stillUsed.has(ref.key)) await dbRequest(STORES.media, 'readwrite', (s) => s.delete(ref.key))
  }
}

// ---------- Como archivo ----------

export function downloadProjectFile(data: ProjectData) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  // Sin tildes ni espacios: algunos navegadores ignoran el nombre si los lleva.
  const safe = data.name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
  a.download = `${safe || 'proyecto'}.editorvideo.json`
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export async function readProjectFile(file: File): Promise<ProjectData> {
  let data: ProjectData
  try {
    data = JSON.parse(await file.text())
  } catch {
    throw new Error('El archivo no es un proyecto válido')
  }
  if (data?.format !== PROJECT_FORMAT || !Array.isArray(data.clips) || !Array.isArray(data.media)) {
    throw new Error('El archivo no es un proyecto de este editor')
  }
  if (data.version > PROJECT_VERSION) {
    throw new Error('El proyecto se creó con una versión más nueva del editor; recarga la página')
  }
  return data
}

/**
 * Empareja los archivos que elige el usuario con los que necesita el proyecto:
 * primero por nombre y tamaño, y si no, solo por nombre.
 */
export function matchFiles(refs: MediaRef[], chosen: File[], found: Map<string, File>): Map<string, File> {
  const result = new Map(found)
  for (const ref of refs) {
    if (result.has(ref.key)) continue
    const exact = chosen.find((f) => f.name === ref.name && f.size === ref.size)
    const byName = chosen.find((f) => f.name === ref.name)
    const file = exact ?? byName
    if (file) result.set(ref.key, file)
  }
  return result
}
