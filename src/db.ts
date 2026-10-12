/** Base de datos IndexedDB del editor (banco de transiciones y proyectos guardados). */

export const STORES = {
  stingers: 'stingers',
  projects: 'projects',
  media: 'media',
} as const

type StoreName = (typeof STORES)[keyof typeof STORES]

const DB_NAME = 'editor-video'
const VERSION = 2

let dbPromise: Promise<IDBDatabase> | null = null

function openDb(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, VERSION)
      req.onupgradeneeded = () => {
        const db = req.result
        if (!db.objectStoreNames.contains(STORES.stingers)) db.createObjectStore(STORES.stingers, { keyPath: 'id' })
        if (!db.objectStoreNames.contains(STORES.projects)) db.createObjectStore(STORES.projects, { keyPath: 'id' })
        if (!db.objectStoreNames.contains(STORES.media)) db.createObjectStore(STORES.media, { keyPath: 'key' })
      }
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })
    dbPromise.catch(() => {
      dbPromise = null
    })
  }
  return dbPromise
}

/** Ejecuta una petición sobre un almacén y espera a que la transacción termine. */
export function dbRequest<T>(
  store: StoreName,
  mode: IDBTransactionMode,
  fn: (s: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(store, mode)
        const req = fn(tx.objectStore(store))
        tx.oncomplete = () => resolve(req.result)
        tx.onerror = () => reject(tx.error)
        tx.onabort = () => reject(tx.error ?? new Error('Operación cancelada'))
      }),
  )
}
