import { dbRequest, STORES } from './db'

/**
 * Banco de transiciones: guarda los stingers importados en IndexedDB para que
 * sigan disponibles al volver a abrir el editor en este navegador.
 */

export interface BankRecord {
  id: string
  name: string
  /** Paquete o carpeta de origen (p. ej. «Bubbly Reveal»). */
  category: string
  file: File
  duration: number
  cutPoint: number
  thumbnail: string | null
  addedAt: number
}

const run = <T,>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>) =>
  dbRequest(STORES.stingers, mode, fn)

export async function loadBank(): Promise<BankRecord[]> {
  const records = await run<BankRecord[]>('readonly', (s) => s.getAll())
  return records.sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name))
}

export function saveToBank(record: BankRecord): Promise<IDBValidKey> {
  return run('readwrite', (s) => s.put(record))
}

/** Guarda una transición del editor en el banco. */
export function persistStinger(s: {
  id: string; name: string; category: string; file: File; duration: number; cutPoint: number; thumbnail: string | null
}): Promise<IDBValidKey> {
  return saveToBank({
    id: s.id, name: s.name, category: s.category, file: s.file, duration: s.duration,
    cutPoint: s.cutPoint, thumbnail: s.thumbnail, addedAt: Date.now(),
  })
}

export function removeFromBank(id: string): Promise<undefined> {
  return run('readwrite', (s) => s.delete(id))
}

/** Pide al navegador que no borre el banco cuando necesite espacio. */
export function requestPersistentStorage() {
  navigator.storage?.persist?.().catch(() => {})
}

const GENERIC_FOLDER = /^(webm|mp4|mov|with ?sound|without ?sound|con sonido|sin sonido|transitions?)$/i

/** Deduce el paquete a partir de la ruta dentro de la carpeta importada. */
export function categoryFromPath(relativePath: string): string {
  const folders = relativePath.split('/').slice(0, -1).filter((f) => f && !GENERIC_FOLDER.test(f))
  const folder = folders[folders.length - 1]
  if (!folder) return 'Mis transiciones'
  return folder
    .replace(/[-_]+(?=[a-z]*\d)[a-z0-9]{6}$/i, '') // sufijo aleatorio de descarga, p. ej. «-f3ukta»
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Filtra los archivos de una carpeta: solo WEBM y, si un paquete trae la misma
 * transición «With Sound» y «Without Sound», se queda con la versión con sonido.
 */
export function pickStingerFiles(files: File[]): File[] {
  const webms = files.filter((f) => /\.webm$/i.test(f.name))
  const pathOf = (f: File) => f.webkitRelativePath || f.name
  const withSound = new Set(
    webms.filter((f) => /\/with ?sound\//i.test(pathOf(f))).map((f) => `${categoryFromPath(pathOf(f))}|${f.name}`),
  )
  return webms.filter((f) => {
    const path = pathOf(f)
    if (!/\/without ?sound\//i.test(path)) return true
    return !withSound.has(`${categoryFromPath(path)}|${f.name}`)
  })
}
