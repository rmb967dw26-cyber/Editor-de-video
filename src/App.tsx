import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { captureThumbnail, formatTimecode, newId, readDuration } from './media'
import {
  clipLength, DEFAULT_TRACK_NAMES, placeTransitions,
  type Clip, type MediaItem, type MusicTrack, type Stinger, type TrackId, type TrackNames,
} from './types'
import { Timeline, type Tool } from './Timeline'
import { Inspector } from './Inspector'
import { ExportDialog } from './ExportDialog'
import { MediaPool } from './MediaPool'
import { SourceViewer } from './SourceViewer'
import { EffectsLibrary } from './EffectsLibrary'
import { Mixer } from './Mixer'
import { audioEngine } from './audioEngine'
import { useUndoHistory } from './useUndoHistory'
import {
  categoryFromPath, loadBank, persistStinger, pickStingerFiles, removeFromBank, requestPersistentStorage,
} from './stingerBank'
import { createTitle, type TitleItem } from './titles'
import { TitleOverlay } from './TitleOverlay'
import { TitleInspector } from './TitleInspector'
import { ProjectDialog } from './ProjectDialog'
import { Logo } from './Logo'
import {
  downloadProjectFile, loadProjectFromBrowser, mediaKey, PROJECT_FORMAT, PROJECT_VERSION, saveProjectToBrowser,
  type MediaRef, type ProjectData,
} from './projectStore'

const isAudioFile = (f: File) => f.type.startsWith('audio/') || /\.(mp3|wav|m4a|aac|ogg|flac)$/i.test(f.name)
const isVideoFile = (f: File) => f.type.startsWith('video/') || /\.(mp4|mov|webm|mkv|m4v)$/i.test(f.name)
const isWide = () => typeof window === 'undefined' || window.matchMedia('(min-width: 1100px)').matches

const TRACK_NAMES_KEY = 'editor-video:track-names'

/** Nombres de pista guardados en este navegador (si el almacenamiento está disponible). */
function loadTrackNames(): TrackNames {
  try {
    const saved = JSON.parse(localStorage.getItem(TRACK_NAMES_KEY) ?? 'null')
    if (saved && typeof saved === 'object') return { ...DEFAULT_TRACK_NAMES, ...saved }
  } catch {
    // Sin acceso al almacenamiento: se usan los nombres por defecto.
  }
  return DEFAULT_TRACK_NAMES
}

const clipFromMedia = (item: MediaItem, start = 0, end = item.duration): Clip => ({
  id: newId(), file: item.file, url: item.url, name: item.name, duration: item.duration,
  start, end, volume: 1, muted: false, thumbnail: item.thumbnail, transitionId: null,
})

export default function App() {
  const [clips, setClips] = useState<Clip[]>([])
  const [music, setMusic] = useState<MusicTrack | null>(null)
  const [stingers, setStingers] = useState<Stinger[]>([])
  const [media, setMedia] = useState<MediaItem[]>([])
  const [sourceId, setSourceId] = useState<string | null>(null)
  const [tool, setTool] = useState<Tool>('select')
  const [a1, setA1] = useState({ gain: 1, muted: false })
  const [a2Muted, setA2Muted] = useState(false)
  const [master, setMaster] = useState({ gain: 1, muted: false })
  const [trackNames, setTrackNames] = useState<TrackNames>(loadTrackNames)
  const [titles, setTitles] = useState<TitleItem[]>([])
  const [selectedTitleId, setSelectedTitleId] = useState<string | null>(null)
  const [projectName, setProjectName] = useState('Proyecto sin título')
  const [projectId, setProjectId] = useState<string | null>(null)
  const [showProject, setShowProject] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const masterVolume = master.muted ? 0 : master.gain
  const [panels, setPanels] = useState(() => ({ pool: true, effects: true, inspector: true, mixer: isWide(), source: isWide() }))
  const togglePanel = (k: keyof typeof panels) => setPanels((p) => ({ ...p, [k]: !p[k] }))
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [time, setTime] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [importing, setImporting] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [showExport, setShowExport] = useState(false)
  const [dragOver, setDragOver] = useState(false)

  const videoRef = useRef<HTMLVideoElement>(null)
  const audioRef = useRef<HTMLAudioElement>(null)
  const stingerRef = useRef<HTMLVideoElement>(null)
  const stingerInput = useRef<HTMLInputElement>(null)
  const stingerFolderInput = useRef<HTMLInputElement>(null)
  const videoInput = useRef<HTMLInputElement>(null)

  // Posición de cada clip en la línea de tiempo global.
  const starts = useMemo(() => {
    let acc = 0
    return clips.map((c) => {
      const s = acc
      acc += clipLength(c)
      return s
    })
  }, [clips])
  const total = clips.reduce((t, c) => t + clipLength(c), 0)
  const transitions = useMemo(() => placeTransitions(clips, starts, stingers), [clips, starts, stingers])

  // Referencias que el bucle de reproducción lee sin re-suscribirse.
  const state = useRef({ clips, starts, total, music, transitions, playing, a1, a2Muted, index: -1, token: 0 })
  // Fotograma que mostrar tras el próximo cambio de clips (al recortar).
  const pendingPreview = useRef<{ id: string; local: number } | null>(null)
  state.current.clips = clips
  state.current.starts = starts
  state.current.total = total
  state.current.music = music
  state.current.transitions = transitions
  state.current.playing = playing
  state.current.a1 = a1
  state.current.a2Muted = a2Muted

  const indexAt = useCallback((t: number) => {
    const { clips, starts } = state.current
    for (let i = clips.length - 1; i >= 0; i--) if (t >= starts[i]) return i
    return 0
  }, [])

  const applyVolume = useCallback((clip: Clip | undefined) => {
    if (!clip) return
    const { a1 } = state.current
    audioEngine.setVolume('a1', videoRef.current, clip.muted || a1.muted ? 0 : clip.volume * a1.gain)
  }, [])

  const syncMusic = useCallback((t: number, force = false) => {
    const a = audioRef.current
    const m = state.current.music
    if (!a || !m) return
    audioEngine.setVolume('a2', a, state.current.a2Muted ? 0 : m.volume)
    const target = m.offset + t
    if (target >= m.duration) {
      a.pause()
      return
    }
    if (force || Math.abs(a.currentTime - target) > 0.3) a.currentTime = target
    if (state.current.playing && a.paused) a.play().catch(() => {})
    if (!state.current.playing && !a.paused) a.pause()
  }, [])

  /** Muestra el stinger que corresponda al instante `t`, encima del video. */
  const syncStinger = useCallback((t: number, force = false) => {
    const s = stingerRef.current
    if (!s) return
    const active = state.current.transitions.find(
      (tr) => t >= tr.start && t < tr.start + tr.stinger.duration,
    )
    if (!active) {
      if (!s.paused) s.pause()
      s.style.visibility = 'hidden'
      return
    }
    const local = t - active.start
    if (s.getAttribute('src') !== active.stinger.url) {
      s.src = active.stinger.url
      force = true
    }
    if (force || Math.abs(s.currentTime - local) > 0.15) s.currentTime = local
    s.style.visibility = 'visible'
    if (state.current.playing && s.paused) s.play().catch(() => {})
    if (!state.current.playing && !s.paused) s.pause()
  }, [])

  /** Coloca la vista previa en el instante global `t`. */
  const seek = useCallback(
    async (t: number, autoplay = state.current.playing) => {
      const { clips, starts, total } = state.current
      const v = videoRef.current
      if (!v || clips.length === 0) return
      t = Math.max(0, Math.min(t, Math.max(0, total - 0.01)))
      const i = indexAt(t)
      const clip = clips[i]
      const local = clip.start + (t - starts[i])
      const token = ++state.current.token
      state.current.index = i
      setTime(t)

      if (v.getAttribute('src') !== clip.url) {
        v.src = clip.url
        await new Promise<void>((resolve) => {
          v.onloadedmetadata = () => resolve()
          v.onerror = () => resolve()
        })
        if (token !== state.current.token) return
      }
      v.currentTime = local
      applyVolume(clip)
      syncMusic(t, true)
      syncStinger(t, true)
      if (autoplay) await v.play().catch(() => setPlaying(false))
      else v.pause()
    },
    [indexAt, applyVolume, syncMusic, syncStinger],
  )

  // Bucle de reproducción: avanza el cursor y salta al siguiente clip al llegar al punto de salida.
  useEffect(() => {
    if (!playing) {
      videoRef.current?.pause()
      audioRef.current?.pause()
      stingerRef.current?.pause()
      return
    }
    let raf = 0
    const tick = () => {
      const v = videoRef.current
      const { clips, starts, index } = state.current
      const clip = clips[index]
      if (v && clip && !v.seeking) {
        const t = starts[index] + (v.currentTime - clip.start)
        if (v.currentTime >= clip.end - 0.04 || v.ended) {
          if (index + 1 < clips.length) {
            seek(starts[index + 1], true)
          } else {
            setPlaying(false)
            setTime(state.current.total)
            raf = 0
            return
          }
        } else {
          setTime(t)
          syncMusic(t)
          syncStinger(t)
        }
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [playing, seek, syncMusic, syncStinger])

  const togglePlay = useCallback(() => {
    if (state.current.clips.length === 0) return
    if (playing) {
      setPlaying(false)
      return
    }
    audioEngine.start()
    state.current.playing = true
    setPlaying(true)
    const t = time >= total - 0.05 ? 0 : time
    seek(t, true)
  }, [playing, time, total, seek])

  // Al editar clips (recortes, orden), recoloca la vista previa en el mismo instante.
  useEffect(() => {
    if (clips.length === 0) {
      const v = videoRef.current
      if (v) {
        v.removeAttribute('src')
        v.load()
      }
      setTime(0)
      setPlaying(false)
      return
    }
    const pending = pendingPreview.current
    pendingPreview.current = null
    if (pending) {
      const i = clips.findIndex((c) => c.id === pending.id)
      if (i >= 0) {
        const c = clips[i]
        const local = Math.min(Math.max(pending.local, c.start), c.end - 0.04)
        seek(starts[i] + (local - c.start), false)
        return
      }
    }
    if (!state.current.playing) seek(Math.min(time, total))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clips])

  useEffect(() => {
    applyVolume(clips[state.current.index])
  }, [clips, a1, applyVolume])

  useEffect(() => {
    syncMusic(time, true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [music, a2Muted])

  useEffect(() => {
    audioEngine.setMasterVolume(masterVolume)
  }, [masterVolume])

  const renameTrack = (track: TrackId, name: string) => {
    setTrackNames((names) => ({ ...names, [track]: name.trim() || DEFAULT_TRACK_NAMES[track] }))
  }

  useEffect(() => {
    try {
      localStorage.setItem(TRACK_NAMES_KEY, JSON.stringify(trackNames))
    } catch {
      // No se pudo guardar; el cambio vale para esta sesión.
    }
  }, [trackNames])

  // ---- Deshacer / rehacer ----
  // Todo lo que forma parte del montaje. Las bibliotecas (medios y banco de
  // transiciones) no entran: importar no se deshace, pero sí usarlas en el montaje.
  const project = useMemo(
    () => ({ clips, music, titles, a1, a2Muted, master, trackNames }),
    [clips, music, titles, a1, a2Muted, master, trackNames],
  )
  const restoreProject = useCallback((p: typeof project) => {
    setPlaying(false)
    setClips(p.clips)
    setMusic(p.music)
    setTitles(p.titles)
    setA1(p.a1)
    setA2Muted(p.a2Muted)
    setMaster(p.master)
    setTrackNames(p.trackNames)
  }, [])
  const history = useUndoHistory(project, restoreProject)

  // ---- Cambios sin guardar ----
  // `savedProject` es el estado del montaje la última vez que se guardó o abrió.
  const [savedProject, setSavedProject] = useState(project)
  const markClean = useRef(false)
  useEffect(() => {
    if (markClean.current) {
      markClean.current = false
      setSavedProject(project)
    }
  }, [project])
  const hasContent = clips.length > 0 || titles.length > 0 || music !== null
  const dirty = hasContent && project !== savedProject

  useEffect(() => {
    if (!dirty) return
    const warn = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])

  useEffect(() => {
    if (!notice) return
    const id = window.setTimeout(() => setNotice(null), 2600)
    return () => window.clearTimeout(id)
  }, [notice])

  // Conecta los elementos de la vista previa al motor de audio (medidores y volumen por pista).
  useEffect(() => {
    if (videoRef.current) audioEngine.register(videoRef.current, 'a1')
    if (audioRef.current) audioEngine.register(audioRef.current, 'a2')
    if (stingerRef.current) audioEngine.register(stingerRef.current, 'fx')
  }, [])

  useEffect(() => {
    syncStinger(time, true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transitions])

  // ---- Importación ----
  const addFiles = useCallback(async (files: File[]) => {
    setError(null)
    const videos = files.filter(isVideoFile)
    const audios = files.filter((f) => !isVideoFile(f) && isAudioFile(f))
    const ignored = files.length - videos.length - audios.length
    if (ignored > 0) setError(`Se ignoraron ${ignored} archivo(s) que no son de video ni de audio.`)

    setImporting((n) => n + videos.length + audios.length)
    for (const file of [...videos, ...audios]) {
      const kind = videos.includes(file) ? 'video' : 'audio'
      const url = URL.createObjectURL(file)
      try {
        const duration = await readDuration(url, kind)
        const thumbnail = kind === 'video' ? await captureThumbnail(url, Math.min(0.5, duration / 2)) : null
        const item: MediaItem = { id: newId(), kind, file, url, name: file.name, duration, thumbnail }
        setMedia((m) => [...m, item])
        setSourceId((s) => s ?? item.id)
        if (kind === 'video') {
          const clip = clipFromMedia(item)
          setClips((cs) => [...cs, clip])
          setSelectedId((s) => s ?? clip.id)
        } else {
          setMusic((old) => old ?? musicFromMedia(item))
        }
      } catch (e) {
        URL.revokeObjectURL(url)
        setError(`No se pudo abrir «${file.name}»: ${(e as Error).message}`)
      } finally {
        setImporting((n) => n - 1)
      }
    }
  }, [])

  /** Añade un clip desde la biblioteca, en la posición `index` (al final si se omite). */
  const insertClip = useCallback((item: MediaItem, index?: number, start?: number, end?: number) => {
    const clip = clipFromMedia(item, start, end)
    setClips((cs) => {
      const next = [...cs]
      next.splice(index ?? cs.length, 0, clip)
      return next
    })
    setSelectedId(clip.id)
  }, [])

  // ---- Banco de transiciones (guardado en este navegador) ----
  const stingersRef = useRef(stingers)
  stingersRef.current = stingers

  useEffect(() => {
    let alive = true
    loadBank()
      .then((records) => {
        if (!alive || records.length === 0) return
        const loaded: Stinger[] = records.map((r) => ({
          id: r.id, file: r.file, url: URL.createObjectURL(r.file), name: r.name, duration: r.duration,
          cutPoint: r.cutPoint, thumbnail: r.thumbnail, category: r.category,
        }))
        setStingers((ss) => [...loaded, ...ss.filter((s) => !loaded.some((l) => l.id === s.id))])
      })
      .catch(() => setError('No se pudo abrir el banco de transiciones de este navegador; las que importes no se guardarán.'))
    return () => {
      alive = false
    }
  }, [])

  /** Importa transiciones stinger (WEBM con transparencia) y las guarda en el banco. */
  const addStingers = useCallback(async (input: File[]) => {
    setError(null)
    const files = pickStingerFiles(input)
    if (files.length === 0) {
      setError('No se encontró ningún archivo .webm para usar como transición.')
      return
    }
    requestPersistentStorage()
    const known = new Set(stingersRef.current.map((s) => `${s.name}|${s.file.size}`))
    const fresh = files.filter((f) => !known.has(`${f.name}|${f.size}`))
    let failed = 0
    let unsaved = 0
    setImporting((n) => n + fresh.length)
    for (const file of fresh) {
      const url = URL.createObjectURL(file)
      try {
        const duration = await readDuration(url, 'video')
        const cutPoint = duration / 2
        const thumbnail = await captureThumbnail(url, cutPoint * 0.6, 'image/png')
        const stinger: Stinger = {
          id: newId(), file, url, name: file.name, duration, cutPoint, thumbnail,
          category: categoryFromPath(file.webkitRelativePath || file.name),
        }
        setStingers((ss) => [...ss, stinger])
        await persistStinger(stinger).catch(() => unsaved++)
      } catch {
        URL.revokeObjectURL(url)
        failed++
      } finally {
        setImporting((n) => n - 1)
      }
    }
    const notes = [
      files.length > fresh.length && `${files.length - fresh.length} ya estaban en el banco`,
      failed > 0 && `${failed} no se pudieron abrir`,
      unsaved > 0 && `${unsaved} no se pudieron guardar en el navegador (¿falta espacio?)`,
    ].filter(Boolean)
    if (notes.length) setError(`Transiciones: ${notes.join(' · ')}.`)
  }, [])

  const removeStinger = useCallback((id: string) => {
    const s = stingersRef.current.find((x) => x.id === id)
    if (!s || !window.confirm(`¿Quitar «${s.name}» del banco de transiciones?`)) return
    setStingers((ss) => ss.filter((x) => x.id !== id))
    setClips((cs) => cs.map((c) => (c.transitionId === id ? { ...c, transitionId: null } : c)))
    removeFromBank(id).catch(() => {})
  }, [])

  // Al arrastrar el punto de corte se guarda solo el valor final, no cada movimiento.
  const saveTimers = useRef(new Map<string, number>())
  const changeStinger = (id: string, patch: Partial<Stinger>) => {
    const current = stingersRef.current.find((s) => s.id === id)
    if (!current) return
    const next = { ...current, ...patch }
    setStingers((ss) => ss.map((s) => (s.id === id ? next : s)))
    window.clearTimeout(saveTimers.current.get(id))
    saveTimers.current.set(id, window.setTimeout(() => persistStinger(next).catch(() => {}), 400))
  }

  // ---- Edición ----
  const updateClip = useCallback((id: string, patch: Partial<Clip>) => {
    setClips((cs) => cs.map((c) => (c.id === id ? { ...c, ...patch } : c)))
  }, [])

  // ---- Títulos (pista V2) ----
  const selectClip = useCallback((id: string) => {
    setSelectedId(id)
    setSelectedTitleId(null)
  }, [])

  const selectTitle = useCallback((id: string | null) => {
    setSelectedTitleId(id)
    if (id) setPanels((p) => ({ ...p, inspector: true }))
  }, [])

  const addTitle = useCallback((at: number) => {
    const title = createTitle(Math.max(0, at))
    setTitles((ts) => [...ts, title])
    selectTitle(title.id)
  }, [selectTitle])

  const changeTitle = useCallback((id: string, patch: Partial<TitleItem>) => {
    setTitles((ts) => ts.map((t) => (t.id === id ? { ...t, ...patch } : t)))
  }, [])

  const removeTitle = useCallback((id: string) => {
    setTitles((ts) => ts.filter((t) => t.id !== id))
    setSelectedTitleId((s) => (s === id ? null : s))
  }, [])

  const duplicateTitle = useCallback((id: string) => {
    const original = titles.find((t) => t.id === id)
    if (!original) return
    const copy = { ...original, id: newId(), start: original.start + original.duration }
    setTitles((ts) => [...ts, copy])
    selectTitle(copy.id)
  }, [titles, selectTitle])

  // ---- Proyecto: guardar y abrir ----
  const buildProjectData = (): { data: ProjectData; files: Map<string, File> } => {
    const files = new Map<string, File>()
    const refs: MediaRef[] = []
    const addRef = (file: File, kind: 'video' | 'audio', duration: number, thumbnail: string | null) => {
      const key = mediaKey(file)
      if (!files.has(key)) {
        files.set(key, file)
        refs.push({ key, kind, name: file.name, size: file.size, lastModified: file.lastModified, duration, thumbnail })
      }
      return key
    }
    for (const m of media) addRef(m.file, m.kind, m.duration, m.thumbnail)
    const clipRefs = clips.map((c) => {
      const stinger = c.transitionId ? stingers.find((st) => st.id === c.transitionId) : undefined
      return {
        mediaKey: addRef(c.file, 'video', c.duration, c.thumbnail),
        start: c.start, end: c.end, volume: c.volume, muted: c.muted,
        transition: stinger ? { id: stinger.id, name: stinger.name, size: stinger.file.size } : null,
      }
    })
    const data: ProjectData = {
      format: PROJECT_FORMAT,
      version: PROJECT_VERSION,
      name: projectName.trim() || 'Proyecto sin título',
      savedAt: Date.now(),
      media: refs,
      clips: clipRefs,
      music: music
        ? { mediaKey: addRef(music.file, 'audio', music.duration, null), offset: music.offset, volume: music.volume, fadeOut: music.fadeOut }
        : null,
      titles, a1, a2Muted, master, trackNames,
    }
    return { data, files }
  }

  const saveToBrowser = async () => {
    const { data, files } = buildProjectData()
    const id = projectId ?? newId()
    requestPersistentStorage()
    try {
      await saveProjectToBrowser(id, data, files, {
        clipCount: clips.length, duration: total, thumbnail: clips[0]?.thumbnail ?? null,
      })
    } catch (e) {
      throw new Error(`No se pudo guardar en el navegador (${(e as Error).message || 'sin espacio'}). Prueba con «Descargar archivo».`)
    }
    setProjectId(id)
    setSavedProject(project)
    setNotice(`«${data.name}» guardado`)
  }

  /** Sustituye el proyecto actual por `data`, usando los archivos encontrados. */
  const applyProjectData = (data: ProjectData, files: Map<string, File>, id: string | null) => {
    const items: MediaItem[] = []
    const byKey = new Map<string, MediaItem>()
    for (const ref of data.media) {
      const file = files.get(ref.key)
      if (!file) continue
      const item: MediaItem = {
        id: newId(), kind: ref.kind, file, url: URL.createObjectURL(file), name: ref.name,
        duration: ref.duration, thumbnail: ref.thumbnail,
      }
      items.push(item)
      byKey.set(ref.key, item)
    }
    let missingTransitions = 0
    const nextClips: Clip[] = []
    for (const c of data.clips) {
      const item = byKey.get(c.mediaKey)
      if (!item) continue
      let transitionId: string | null = null
      if (c.transition) {
        const t = c.transition
        const found = stingersRef.current.find((s) => s.id === t.id) ??
          stingersRef.current.find((s) => s.name === t.name && s.file.size === t.size)
        if (found) transitionId = found.id
        else missingTransitions++
      }
      nextClips.push({ ...clipFromMedia(item, c.start, Math.min(c.end, item.duration)), volume: c.volume, muted: c.muted, transitionId })
    }
    const musicItem = data.music ? byKey.get(data.music.mediaKey) : undefined

    for (const m of media) URL.revokeObjectURL(m.url)
    setPlaying(false)
    setMedia(items)
    setSourceId(items[0]?.id ?? null)
    setClips(nextClips)
    setMusic(musicItem && data.music
      ? { ...musicFromMedia(musicItem), offset: data.music.offset, volume: data.music.volume, fadeOut: data.music.fadeOut }
      : null)
    setTitles(data.titles ?? [])
    setA1(data.a1 ?? { gain: 1, muted: false })
    setA2Muted(data.a2Muted ?? false)
    setMaster(data.master ?? { gain: 1, muted: false })
    setTrackNames({ ...DEFAULT_TRACK_NAMES, ...data.trackNames })
    setSelectedId(nextClips[0]?.id ?? null)
    setSelectedTitleId(null)
    setTime(0)
    setProjectName(data.name)
    setProjectId(id)
    history.reset()
    markClean.current = true

    const lostClips = data.clips.length - nextClips.length
    const warnings = [
      lostClips > 0 && `${lostClips} clip(s) sin su archivo`,
      data.music && !musicItem && 'la música no se encontró',
      missingTransitions > 0 && `${missingTransitions} transición(es) que no están en tu banco`,
    ].filter(Boolean)
    if (warnings.length) setError(`Proyecto abierto con avisos: ${warnings.join(' · ')}.`)
    else setNotice(`«${data.name}» abierto`)
  }

  const newProject = () => {
    for (const m of media) URL.revokeObjectURL(m.url)
    setPlaying(false)
    setMedia([])
    setSourceId(null)
    setClips([])
    setMusic(null)
    setTitles([])
    setA1({ gain: 1, muted: false })
    setA2Muted(false)
    setMaster({ gain: 1, muted: false })
    setSelectedId(null)
    setSelectedTitleId(null)
    setProjectName('Proyecto sin título')
    setProjectId(null)
    history.reset()
    markClean.current = true
  }

  const removeClip = useCallback((id: string) => {
    // El archivo sigue en la biblioteca de medios, así que su URL no se libera.
    setClips((cs) => cs.filter((c) => c.id !== id))
    setSelectedId((s) => (s === id ? null : s))
  }, [])

  const moveClip = useCallback((from: number, to: number) => {
    setClips((cs) => {
      if (to < 0 || to >= cs.length || from === to) return cs
      const next = [...cs]
      const [item] = next.splice(from, 1)
      next.splice(to, 0, item)
      return next
    })
  }, [])

  /** Divide en dos el clip que hay en el instante `at` (por defecto, bajo el cursor). */
  const splitAt = useCallback((at?: number) => {
    if (clips.length === 0) return
    const time_ = at ?? time
    const i = indexAt(time_)
    const clip = clips[i]
    const cut = clip.start + (time_ - starts[i])
    if (cut - clip.start < 0.1 || clip.end - cut < 0.1) {
      setError('Corta un poco más lejos de los bordes del clip.')
      return
    }
    const second: Clip = { ...clip, id: newId(), start: cut }
    setClips((cs) => {
      const next = [...cs]
      next.splice(i, 1, { ...clip, end: cut, transitionId: null }, second)
      return next
    })
    setSelectedId(second.id)
    if (at !== undefined) seek(at)
  }, [clips, starts, time, indexAt, seek])

  // Atajos de teclado.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      const tag = target.tagName
      if (showExport || showProject) return
      if (e.ctrlKey || e.metaKey) {
        // Al escribir un nombre, Ctrl+Z deshace el texto del campo, no el montaje.
        const typing = tag === 'TEXTAREA' || (target instanceof HTMLInputElement && !['range', 'checkbox'].includes(target.type))
        const key = e.key.toLowerCase()
        if (typing) return
        if (key === 's') {
          e.preventDefault()
          if (hasContent) saveToBrowser().catch((err) => setError((err as Error).message))
          return
        }
        if (key === 'o') {
          e.preventDefault()
          setShowProject(true)
          return
        }
        if (key === 'z') {
          e.preventDefault()
          if (e.shiftKey) history.redo()
          else history.undo()
        } else if (key === 'y') {
          e.preventDefault()
          history.redo()
        }
        return
      }
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return
      if (e.code === 'Space') {
        e.preventDefault()
        togglePlay()
      } else if (e.key === 's' || e.key === 'S') {
        splitAt()
      } else if (e.key === 'b' || e.key === 'B') {
        setTool('blade')
      } else if (e.key === 'a' || e.key === 'A' || e.key === 'Escape') {
        setTool('select')
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && selectedTitleId) {
        removeTitle(selectedTitleId)
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && selectedId) {
        removeClip(selectedId)
      } else if (e.key === 't' || e.key === 'T') {
        addTitle(time)
      } else if (e.key === 'ArrowLeft') {
        seek(time - (e.shiftKey ? 1 : 1 / 30))
      } else if (e.key === 'ArrowRight') {
        seek(time + (e.shiftKey ? 1 : 1 / 30))
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [togglePlay, splitAt, removeClip, selectedId, selectedTitleId, seek, time, showExport, showProject, history, hasContent])

  const selectedIndex = clips.findIndex((c) => c.id === selectedId)
  const selected = selectedIndex >= 0 ? clips[selectedIndex] : null
  const selectedTitle = titles.find((t) => t.id === selectedTitleId) ?? null

  const sourceItem = media.find((m) => m.id === sourceId) ?? null

  const activateMedia = (item: MediaItem) => {
    if (item.kind === 'video') insertClip(item)
    else setMusic(musicFromMedia(item))
  }

  return (
    <div
      className={`app ${dragOver ? 'drag-over' : ''}`}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes('Files')) {
          e.preventDefault()
          setDragOver(true)
        }
      }}
      onDragLeave={(e) => {
        if (e.currentTarget === e.target) setDragOver(false)
      }}
      onDrop={(e) => {
        if (!e.dataTransfer.files.length) return
        e.preventDefault()
        setDragOver(false)
        addFiles([...e.dataTransfer.files])
      }}
    >
      <header className="topbar">
        <div className="topbar-group">
          <Logo />
          <span className="top-sep" />
          <button className="top-btn undo-btn" onClick={history.undo} disabled={!history.canUndo} title="Deshacer (Ctrl+Z)" aria-label="Deshacer">
            ↶
          </button>
          <button className="top-btn undo-btn" onClick={history.redo} disabled={!history.canRedo} title="Rehacer (Ctrl+Mayús+Z)" aria-label="Rehacer">
            ↷
          </button>
          <span className="top-sep" />
          <button className="top-btn project-btn" onClick={() => setShowProject(true)} title="Guardar y abrir proyectos (Ctrl+S / Ctrl+O)">
            ☰ Proyecto
          </button>
          <span className="top-sep" />
          <button className={`top-btn ${panels.pool ? 'on' : ''}`} onClick={() => togglePanel('pool')}>▤ Medios</button>
          <button className={`top-btn ${panels.effects ? 'on' : ''}`} onClick={() => togglePanel('effects')}>✦ Efectos</button>
          <button className={`top-btn hide-narrow ${panels.source ? 'on' : ''}`} onClick={() => togglePanel('source')}>◫ Visor doble</button>
        </div>
        <h1 className="project-title">
          <button className="title-btn" onClick={() => setShowProject(true)} title="Proyecto">
            {projectName || 'Proyecto sin título'}
          </button>
          <span className="muted">{dirty ? ' · Sin guardar' : projectId ? ' · Guardado' : ''}</span>
        </h1>
        <div className="topbar-group">
          <button className={`top-btn hide-narrow ${panels.mixer ? 'on' : ''}`} onClick={() => togglePanel('mixer')}>☷ Mezclador</button>
          <button className={`top-btn ${panels.inspector ? 'on' : ''}`} onClick={() => togglePanel('inspector')}>⚙ Inspector</button>
          <button className="top-btn export-btn" disabled={clips.length === 0} onClick={() => setShowExport(true)}>
            ⇪ Exportar
          </button>
        </div>
        <input
          ref={videoInput} type="file" accept="video/*,audio/*" multiple hidden
          onChange={(e) => {
            addFiles([...(e.target.files ?? [])])
            e.target.value = ''
          }}
        />
        <input
          ref={stingerInput} type="file" accept="video/webm,.webm" multiple hidden
          onChange={(e) => {
            addStingers([...(e.target.files ?? [])])
            e.target.value = ''
          }}
        />
        <input
          ref={stingerFolderInput} type="file" multiple hidden
          {...{ webkitdirectory: '' }}
          onChange={(e) => {
            addStingers([...(e.target.files ?? [])])
            e.target.value = ''
          }}
        />
      </header>

      {notice && !error && <div className="notice" role="status">{notice}</div>}
      {error && (
        <div className="error" role="alert">
          {error}
          <button className="link" onClick={() => setError(null)}>Cerrar</button>
        </div>
      )}

      <div className={`upper ${panels.pool ? '' : 'no-left'} ${panels.inspector ? '' : 'no-right'}`}>
        {panels.pool && (
          <MediaPool
            items={media}
            selectedId={sourceId}
            importing={importing}
            onSelect={(item) => setSourceId(item.id)}
            onActivate={activateMedia}
            onImport={() => videoInput.current?.click()}
          />
        )}

        <div className={`viewers ${panels.source ? 'dual' : ''}`}>
          {panels.source && (
            <SourceViewer item={sourceItem} onAppend={(item, start, end) => insertClip(item, undefined, start, end)} />
          )}
          <section className="viewer program-viewer">
            <header className="viewer-head">
              <span className="viewer-name">Línea de tiempo 1</span>
              <span className="tc tc-program">{formatTimecode(time)}</span>
            </header>
            <div className="viewer-screen">
              <video ref={videoRef} playsInline onClick={togglePlay} />
              <video ref={stingerRef} className="stinger" playsInline preload="auto" style={{ visibility: 'hidden' }} />
              <TitleOverlay
                titles={titles}
                time={time}
                selectedId={selectedTitleId}
                onSelect={selectTitle}
                onChange={changeTitle}
                onGesture={history.setGesture}
                onBackgroundClick={togglePlay}
                onEditText={() => {
                  setPanels((p) => ({ ...p, inspector: true }))
                  requestAnimationFrame(() => document.querySelector<HTMLTextAreaElement>('.title-text')?.focus())
                }}
              />
              {clips.length === 0 && (
                <div className="empty">
                  <p>Arrastra aquí tus videos y una canción</p>
                  <button className="small" onClick={() => videoInput.current?.click()}>Importar archivos</button>
                </div>
              )}
            </div>
            <div className="viewer-transport">
              <button className="icon-btn" onClick={() => seek(0)} disabled={!clips.length} title="Ir al inicio">⏮</button>
              <button className="icon-btn" onClick={() => seek(time - 1 / 30)} disabled={!clips.length} title="Fotograma anterior (←)">◀︎|</button>
              <button className="icon-btn play-btn" onClick={togglePlay} disabled={!clips.length} title="Reproducir / pausar (espacio)">
                {playing ? '❚❚' : '▶'}
              </button>
              <button className="icon-btn" onClick={() => seek(time + 1 / 30)} disabled={!clips.length} title="Fotograma siguiente (→)">|▶︎</button>
              <button className="icon-btn" onClick={() => seek(total)} disabled={!clips.length} title="Ir al final">⏭</button>
              <button className="icon-btn" onClick={() => splitAt()} disabled={!clips.length} title="Dividir clip en el cursor (S)">✂ Dividir</button>
            </div>
          </section>
          <audio ref={audioRef} src={music?.url} preload="auto" />
        </div>

        {panels.inspector && selectedTitle && (
          <section className="panel inspector">
            <header className="panel-head">
              <span className="panel-title">Inspector</span>
              <span className="muted small-text insp-clip-name">Título · V2</span>
            </header>
            <TitleInspector
              title={selectedTitle}
              onChange={(patch) => changeTitle(selectedTitle.id, patch)}
              onRemove={() => removeTitle(selectedTitle.id)}
              onDuplicate={() => duplicateTitle(selectedTitle.id)}
            />
          </section>
        )}
        {panels.inspector && !selectedTitle && (
          <Inspector
            clip={selected}
            index={selectedIndex}
            count={clips.length}
            music={music}
            stingers={stingers}
            onChange={(patch, previewAt) => {
              if (!selected) return
              if (previewAt !== undefined) {
                pendingPreview.current = { id: selected.id, local: previewAt }
                setPlaying(false)
              }
              updateClip(selected.id, patch)
            }}
            onRemove={() => selected && removeClip(selected.id)}
            onMove={(dir) => moveClip(selectedIndex, selectedIndex + dir)}
            onApplyTransitionToAll={(transitionId) =>
              setClips((cs) => cs.map((c, i) => (i < cs.length - 1 ? { ...c, transitionId } : c)))
            }
            onAddStingers={() => stingerInput.current?.click()}
            onStingerChange={changeStinger}
            onMusicChange={(patch) => setMusic((m) => (m ? { ...m, ...patch } : m))}
            onMusicRemove={() => setMusic(null)}
          />
        )}
      </div>

      <div className={`lower ${panels.effects ? '' : 'no-left'} ${panels.mixer ? '' : 'no-right'}`}>
        {panels.effects && (
          <EffectsLibrary
            stingers={stingers}
            onImport={() => stingerInput.current?.click()}
            onImportFolder={() => stingerFolderInput.current?.click()}
            onRemove={removeStinger}
          />
        )}
        <Timeline
          clips={clips}
          starts={starts}
          total={total}
          time={time}
          music={music}
          transitions={transitions}
          selectedId={selectedId}
          tool={tool}
          trackNames={trackNames}
          onRenameTrack={renameTrack}
          a1Muted={a1.muted}
          a2Muted={a2Muted}
          onToolChange={setTool}
          onToggleMute={(track) => (track === 'a1' ? setA1((a) => ({ ...a, muted: !a.muted })) : setA2Muted((m) => !m))}
          onSelect={selectClip}
          onSeek={(t) => seek(t)}
          onMove={moveClip}
          onSplitAt={(t) => splitAt(t)}
          onDropMedia={(id, t) => {
            const item = media.find((m) => m.id === id)
            if (!item) return
            if (item.kind === 'audio') {
              setMusic(musicFromMedia(item))
              return
            }
            // Inserta antes del primer clip cuya mitad quede a la derecha del punto soltado.
            const index = clips.findIndex((c, i) => starts[i] + clipLength(c) / 2 > t)
            insertClip(item, index === -1 ? undefined : index)
          }}
          onTrim={(id, patch, previewAt) => {
            pendingPreview.current = { id, local: previewAt }
            setPlaying(false)
            updateClip(id, patch)
          }}
          onGesture={history.setGesture}
          titles={titles}
          selectedTitleId={selectedTitleId}
          onSelectTitle={selectTitle}
          onAddTitle={addTitle}
          onChangeTitle={changeTitle}
          onDropStinger={(id, t) => {
            if (clips.length < 2) {
              setError('Añade al menos dos clips para poner una transición entre ellos.')
              return
            }
            // Corte más cercano al punto donde se soltó la transición.
            let best = 0
            for (let k = 1; k < clips.length - 1; k++) {
              if (Math.abs(starts[k + 1] - t) < Math.abs(starts[best + 1] - t)) best = k
            }
            updateClip(clips[best].id, { transitionId: id })
            setSelectedId(clips[best].id)
          }}
        />
        {panels.mixer && (
          <Mixer
            strips={[
              {
                id: 'a1', label: 'A1', name: trackNames.a1, value: a1.gain, muted: a1.muted,
                onChange: (gain) => setA1((a) => ({ ...a, gain })),
                onMute: () => setA1((a) => ({ ...a, muted: !a.muted })),
              },
              {
                id: 'a2', label: 'A2', name: trackNames.a2, value: music?.volume ?? 0, muted: a2Muted, disabled: !music,
                onChange: (volume) => setMusic((m) => (m ? { ...m, volume } : m)),
                onMute: () => setA2Muted((m) => !m),
              },
              {
                id: 'master', label: 'Máster', name: 'Salida', value: master.gain, muted: master.muted,
                onChange: (gain) => setMaster((m) => ({ ...m, gain })),
                onMute: () => setMaster((m) => ({ ...m, muted: !m.muted })),
              },
            ]}
          />
        )}
      </div>

      <nav className="pagebar" aria-label="Páginas">
        <button className={`page ${panels.pool ? '' : ''}`} onClick={() => videoInput.current?.click()}>
          <span className="page-icon">▤</span>Medios
        </button>
        <button className="page active">
          <span className="page-icon">✂</span>Editar
        </button>
        <button className={`page ${panels.mixer ? 'on' : ''}`} onClick={() => togglePanel('mixer')}>
          <span className="page-icon">♫</span>Audio
        </button>
        <button className="page" disabled={clips.length === 0} onClick={() => setShowExport(true)}>
          <span className="page-icon">⇪</span>Exportar
        </button>
      </nav>

      {showProject && (
        <ProjectDialog
          name={projectName}
          dirty={dirty}
          currentId={projectId}
          hasContent={hasContent}
          onRename={setProjectName}
          onSave={saveToBrowser}
          onDownload={() => {
            const { data } = buildProjectData()
            downloadProjectFile(data)
            setSavedProject(project)
            setNotice('Archivo de proyecto descargado')
          }}
          onOpenSaved={async (id) => {
            const { data, files } = await loadProjectFromBrowser(id)
            applyProjectData(data, files, id)
          }}
          onOpenData={(data, files) => applyProjectData(data, files, null)}
          onNew={newProject}
          onClose={() => setShowProject(false)}
        />
      )}

      {showExport && (
        <ExportDialog
          clips={clips.map((c) => ({ ...c, volume: c.volume * a1.gain, muted: c.muted || a1.muted }))}
          music={a2Muted ? null : music}
          transitions={transitions}
          titles={titles}
          total={total}
          masterVolume={masterVolume}
          onClose={() => setShowExport(false)}
        />
      )}
    </div>
  )
}

function musicFromMedia(item: MediaItem): MusicTrack {
  return { file: item.file, url: item.url, name: item.name, duration: item.duration, offset: 0, volume: 0.6, fadeOut: true }
}
