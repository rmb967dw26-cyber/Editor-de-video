import { useEffect, useRef, useState } from 'react'
import { formatTime } from './media'
import {
  deleteSavedProject, findStoredMedia, listSavedProjects, matchFiles, readProjectFile,
  type ProjectData, type SavedProjectSummary,
} from './projectStore'

interface Props {
  name: string
  dirty: boolean
  /** Id del proyecto abierto si ya se guardó en este navegador. */
  currentId: string | null
  hasContent: boolean
  onRename: (name: string) => void
  onSave: () => Promise<void>
  onDownload: () => void
  onOpenSaved: (id: string) => Promise<void>
  onOpenData: (data: ProjectData, files: Map<string, File>) => void
  onNew: () => void
  onClose: () => void
}

interface Relink {
  data: ProjectData
  files: Map<string, File>
}

const dateFormat = new Intl.DateTimeFormat('es', { dateStyle: 'medium', timeStyle: 'short' })

export function ProjectDialog(props: Props) {
  const [saved, setSaved] = useState<SavedProjectSummary[] | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [relink, setRelink] = useState<Relink | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const relinkInput = useRef<HTMLInputElement>(null)

  const refresh = () =>
    listSavedProjects()
      .then(setSaved)
      .catch(() => {
        setSaved([])
        setError('Este navegador no permite guardar proyectos (¿modo privado?). Usa «Descargar archivo».')
      })

  useEffect(() => {
    refresh()
  }, [])

  const confirmDiscard = () =>
    !props.dirty || window.confirm('Hay cambios sin guardar en el proyecto actual. ¿Descartarlos?')

  const task = async (label: string, fn: () => Promise<void>) => {
    setBusy(label)
    setError(null)
    try {
      await fn()
    } catch (e) {
      setError((e as Error).message || String(e))
    } finally {
      setBusy(null)
    }
  }

  const openFile = (file: File) =>
    task('Leyendo el proyecto…', async () => {
      const data = await readProjectFile(file)
      // Los archivos que ya se guardaron en este navegador no hace falta buscarlos.
      const files = await findStoredMedia(data.media.map((m) => m.key)).catch(() => new Map<string, File>())
      if (data.media.every((m) => files.has(m.key))) {
        props.onOpenData(data, files)
        props.onClose()
      } else {
        setRelink({ data, files })
      }
    })

  const missing = relink ? relink.data.media.filter((m) => !relink.files.has(m.key)) : []

  return (
    <div className="modal-backdrop" onClick={() => !busy && props.onClose()}>
      <div className="modal project-modal" role="dialog" aria-modal="true" aria-label="Proyecto" onClick={(e) => e.stopPropagation()}>
        <h2>Proyecto</h2>

        {relink ? (
          <div className="relink">
            <p>
              «{relink.data.name}» usa {relink.data.media.length} archivo(s). Faltan <b>{missing.length}</b>: indícame
              dónde están en tu dispositivo.
            </p>
            <ul className="missing-list">
              {relink.data.media.map((m) => (
                <li key={m.key} className={relink.files.has(m.key) ? 'ok' : ''}>
                  <span>{relink.files.has(m.key) ? '✓' : '•'}</span> {m.name}
                  <span className="muted small-text"> · {(m.size / 1024 / 1024).toFixed(1)} MB</span>
                </li>
              ))}
            </ul>
            <div className="row">
              <button className="primary" onClick={() => relinkInput.current?.click()}>Buscar archivos…</button>
              <button
                onClick={() => {
                  props.onOpenData(relink.data, relink.files)
                  props.onClose()
                }}
              >
                {missing.length ? `Abrir sin los ${missing.length} que faltan` : 'Abrir proyecto'}
              </button>
              <button onClick={() => setRelink(null)}>Cancelar</button>
            </div>
            <input
              ref={relinkInput} type="file" multiple hidden accept="video/*,audio/*"
              onChange={(e) => {
                const chosen = [...(e.target.files ?? [])]
                e.target.value = ''
                setRelink((r) => (r ? { ...r, files: matchFiles(r.data.media, chosen, r.files) } : r))
              }}
            />
          </div>
        ) : (
          <>
            <label className="field">
              <span>Nombre</span>
              <input
                className="text-input"
                value={props.name}
                maxLength={80}
                onChange={(e) => props.onRename(e.target.value)}
                aria-label="Nombre del proyecto"
              />
            </label>
            <div className="row">
              <button
                className="primary"
                disabled={!props.hasContent || !!busy}
                onClick={() => task('Guardando…', async () => {
                  await props.onSave()
                  await refresh()
                })}
                title="Ctrl+S"
              >
                💾 Guardar en este navegador
              </button>
              <button disabled={!props.hasContent || !!busy} onClick={props.onDownload}>⬇ Descargar archivo</button>
            </div>
            <p className="muted small-text">
              Al guardar en el navegador se guardan también tus videos y audios, así que el proyecto se abre completo.
              El archivo descargable es ligero: solo guarda la edición y, al abrirlo, te pedirá los archivos de video.
            </p>

            <h3>Proyectos guardados en este navegador</h3>
            {saved === null && <p className="muted">Cargando…</p>}
            {saved?.length === 0 && <p className="muted small-text">Todavía no has guardado ningún proyecto.</p>}
            {saved && saved.length > 0 && (
              <ul className="project-list">
                {saved.map((p) => (
                  <li key={p.id} className={p.id === props.currentId ? 'current' : ''}>
                    <span className="project-thumb" style={p.thumbnail ? { backgroundImage: `url(${p.thumbnail})` } : undefined} />
                    <span className="project-info">
                      <b>{p.name}</b>
                      <span className="muted small-text">
                        {dateFormat.format(p.savedAt)} · {p.clipCount} clip(s) · {formatTime(p.duration)}
                        {p.id === props.currentId ? ' · abierto' : ''}
                      </span>
                    </span>
                    <button
                      className="small"
                      disabled={!!busy}
                      onClick={() => {
                        if (!confirmDiscard()) return
                        task('Abriendo…', async () => {
                          await props.onOpenSaved(p.id)
                          props.onClose()
                        })
                      }}
                    >
                      Abrir
                    </button>
                    <button
                      className="icon-btn ghost"
                      disabled={!!busy}
                      title="Eliminar del navegador"
                      onClick={() => {
                        if (!window.confirm(`¿Eliminar «${p.name}» de este navegador? Tus archivos originales no se borran.`)) return
                        task('Eliminando…', async () => {
                          await deleteSavedProject(p.id)
                          await refresh()
                        })
                      }}
                    >
                      🗑
                    </button>
                  </li>
                ))}
              </ul>
            )}

            <div className="row">
              <button disabled={!!busy} onClick={() => confirmDiscard() && fileInput.current?.click()}>📂 Abrir archivo de proyecto…</button>
              <button
                disabled={!!busy}
                onClick={() => {
                  if (!confirmDiscard()) return
                  props.onNew()
                  props.onClose()
                }}
              >
                ＋ Nuevo proyecto
              </button>
            </div>
            <input
              ref={fileInput} type="file" accept=".json,application/json" hidden
              onChange={(e) => {
                const file = e.target.files?.[0]
                e.target.value = ''
                if (file) openFile(file)
              }}
            />
          </>
        )}

        {busy && <p className="muted">{busy}</p>}
        {error && <pre className="error-log">{error}</pre>}
        <div className="row end">
          <button onClick={props.onClose} disabled={!!busy}>Cerrar</button>
        </div>
      </div>
    </div>
  )
}
