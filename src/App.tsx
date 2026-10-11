import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { captureThumbnail, formatTime, newId, readDuration } from './media'
import { clipLength, placeTransitions, type Clip, type MusicTrack, type Stinger } from './types'
import { Timeline } from './Timeline'
import { Inspector } from './Inspector'
import { ExportDialog } from './ExportDialog'

const isAudioFile = (f: File) => f.type.startsWith('audio/') || /\.(mp3|wav|m4a|aac|ogg|flac)$/i.test(f.name)
const isVideoFile = (f: File) => f.type.startsWith('video/') || /\.(mp4|mov|webm|mkv|m4v)$/i.test(f.name)

export default function App() {
  const [clips, setClips] = useState<Clip[]>([])
  const [music, setMusic] = useState<MusicTrack | null>(null)
  const [stingers, setStingers] = useState<Stinger[]>([])
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
  const videoInput = useRef<HTMLInputElement>(null)
  const musicInput = useRef<HTMLInputElement>(null)

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
  const state = useRef({ clips, starts, total, music, transitions, playing, index: -1, token: 0 })
  // Fotograma que mostrar tras el próximo cambio de clips (al recortar).
  const pendingPreview = useRef<{ id: string; local: number } | null>(null)
  state.current.clips = clips
  state.current.starts = starts
  state.current.total = total
  state.current.music = music
  state.current.transitions = transitions
  state.current.playing = playing

  const indexAt = useCallback((t: number) => {
    const { clips, starts } = state.current
    for (let i = clips.length - 1; i >= 0; i--) if (t >= starts[i]) return i
    return 0
  }, [])

  const applyVolume = useCallback((clip: Clip | undefined) => {
    const v = videoRef.current
    if (v && clip) v.volume = clip.muted ? 0 : Math.min(1, clip.volume)
  }, [])

  const syncMusic = useCallback((t: number, force = false) => {
    const a = audioRef.current
    const m = state.current.music
    if (!a || !m) return
    a.volume = Math.min(1, m.volume)
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
  }, [clips, applyVolume])

  useEffect(() => {
    syncMusic(time, true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [music])

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

    setImporting((n) => n + videos.length + (audios.length ? 1 : 0))
    for (const file of videos) {
      const url = URL.createObjectURL(file)
      try {
        const duration = await readDuration(url, 'video')
        const thumbnail = await captureThumbnail(url, Math.min(0.5, duration / 2))
        const clip: Clip = {
          id: newId(), file, url, name: file.name, duration,
          start: 0, end: duration, volume: 1, muted: false, thumbnail, transitionId: null,
        }
        setClips((cs) => [...cs, clip])
        setSelectedId((s) => s ?? clip.id)
      } catch (e) {
        URL.revokeObjectURL(url)
        setError(`No se pudo abrir «${file.name}»: ${(e as Error).message}`)
      } finally {
        setImporting((n) => n - 1)
      }
    }
    if (audios.length) {
      const file = audios[0]
      const url = URL.createObjectURL(file)
      try {
        const duration = await readDuration(url, 'audio')
        setMusic((old) => {
          if (old) URL.revokeObjectURL(old.url)
          return { file, url, name: file.name, duration, offset: 0, volume: 0.6, fadeOut: true }
        })
      } catch (e) {
        URL.revokeObjectURL(url)
        setError(`No se pudo abrir «${file.name}»: ${(e as Error).message}`)
      } finally {
        setImporting((n) => n - 1)
      }
    }
  }, [])

  /** Importa transiciones stinger (WEBM con transparencia). */
  const addStingers = useCallback(async (files: File[]) => {
    setError(null)
    setImporting((n) => n + files.length)
    for (const file of files) {
      const url = URL.createObjectURL(file)
      try {
        const duration = await readDuration(url, 'video')
        const cutPoint = duration / 2
        const thumbnail = await captureThumbnail(url, cutPoint * 0.6, 'image/png')
        const stinger: Stinger = { id: newId(), file, url, name: file.name, duration, cutPoint, thumbnail }
        setStingers((ss) => [...ss, stinger])
      } catch (e) {
        URL.revokeObjectURL(url)
        setError(`No se pudo abrir la transición «${file.name}»: ${(e as Error).message}`)
      } finally {
        setImporting((n) => n - 1)
      }
    }
  }, [])

  const removeStinger = useCallback((id: string) => {
    setStingers((ss) => {
      const s = ss.find((x) => x.id === id)
      if (s) URL.revokeObjectURL(s.url)
      return ss.filter((x) => x.id !== id)
    })
    setClips((cs) => cs.map((c) => (c.transitionId === id ? { ...c, transitionId: null } : c)))
  }, [])

  // ---- Edición ----
  const updateClip = useCallback((id: string, patch: Partial<Clip>) => {
    setClips((cs) => cs.map((c) => (c.id === id ? { ...c, ...patch } : c)))
  }, [])

  const removeClip = useCallback((id: string) => {
    setClips((cs) => {
      const clip = cs.find((c) => c.id === id)
      const rest = cs.filter((c) => c.id !== id)
      // Solo libera la URL si ningún otro clip (p. ej. tras dividir) usa el mismo archivo.
      if (clip && !rest.some((c) => c.url === clip.url)) URL.revokeObjectURL(clip.url)
      return rest
    })
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

  /** Divide el clip bajo el cursor en dos. */
  const splitAtPlayhead = useCallback(() => {
    if (clips.length === 0) return
    const i = indexAt(time)
    const clip = clips[i]
    const cut = clip.start + (time - starts[i])
    if (cut - clip.start < 0.1 || clip.end - cut < 0.1) {
      setError('Mueve el cursor más lejos de los bordes del clip para dividirlo.')
      return
    }
    const second: Clip = { ...clip, id: newId(), start: cut }
    setClips((cs) => {
      const next = [...cs]
      next.splice(i, 1, { ...clip, end: cut, transitionId: null }, second)
      return next
    })
    setSelectedId(second.id)
  }, [clips, starts, time, indexAt])

  // Atajos de teclado.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA' || showExport) return
      if (e.code === 'Space') {
        e.preventDefault()
        togglePlay()
      } else if (e.key === 's' || e.key === 'S') {
        splitAtPlayhead()
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && selectedId) {
        removeClip(selectedId)
      } else if (e.key === 'ArrowLeft') {
        seek(time - (e.shiftKey ? 1 : 1 / 30))
      } else if (e.key === 'ArrowRight') {
        seek(time + (e.shiftKey ? 1 : 1 / 30))
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [togglePlay, splitAtPlayhead, removeClip, selectedId, seek, time, showExport])

  const selectedIndex = clips.findIndex((c) => c.id === selectedId)
  const selected = selectedIndex >= 0 ? clips[selectedIndex] : null

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
        <h1>🎬 Editor de Video</h1>
        <div className="actions">
          <button onClick={() => videoInput.current?.click()}>＋ Añadir videos</button>
          <button onClick={() => musicInput.current?.click()}>♪ {music ? 'Cambiar música' : 'Añadir música'}</button>
          <button onClick={() => stingerInput.current?.click()}>✨ Transiciones</button>
          <button className="primary" disabled={clips.length === 0} onClick={() => setShowExport(true)}>
            Exportar MP4
          </button>
        </div>
        <input
          ref={videoInput} type="file" accept="video/*" multiple hidden
          onChange={(e) => {
            addFiles([...(e.target.files ?? [])])
            e.target.value = ''
          }}
        />
        <input
          ref={musicInput} type="file" accept="audio/*" hidden
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
      </header>

      {error && (
        <div className="error" role="alert">
          {error}
          <button className="link" onClick={() => setError(null)}>Cerrar</button>
        </div>
      )}

      <main className="workspace">
        <section className="preview">
          <div className="screen">
            <video ref={videoRef} playsInline onClick={togglePlay} />
            <video ref={stingerRef} className="stinger" playsInline preload="auto" style={{ visibility: 'hidden' }} />
            {clips.length === 0 && (
              <div className="empty">
                <p>Arrastra aquí tus videos y una canción</p>
                <p className="muted">o usa los botones de arriba</p>
                {importing > 0 && <p>Importando…</p>}
              </div>
            )}
          </div>
          <div className="transport">
            <button onClick={() => seek(0)} disabled={!clips.length} title="Ir al inicio">⏮</button>
            <button className="play" onClick={togglePlay} disabled={!clips.length} title="Reproducir / pausar (espacio)">
              {playing ? '⏸' : '▶'}
            </button>
            <button onClick={splitAtPlayhead} disabled={!clips.length} title="Dividir clip en el cursor (S)">
              ✂ Dividir
            </button>
            <span className="timecode">
              {formatTime(time)} / {formatTime(total)}
            </span>
            {importing > 0 && <span className="muted">Importando {importing}…</span>}
          </div>
          <audio ref={audioRef} src={music?.url} preload="auto" />
        </section>

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
          onStingerChange={(id, patch) =>
            setStingers((ss) => ss.map((s) => (s.id === id ? { ...s, ...patch } : s)))
          }
          onStingerRemove={removeStinger}
          onMusicChange={(patch) => setMusic((m) => (m ? { ...m, ...patch } : m))}
          onMusicRemove={() => {
            if (music) URL.revokeObjectURL(music.url)
            setMusic(null)
          }}
        />
      </main>

      <Timeline
        clips={clips}
        starts={starts}
        total={total}
        time={time}
        music={music}
        transitions={transitions}
        selectedId={selectedId}
        onSelect={setSelectedId}
        onSeek={(t) => seek(t)}
        onMove={moveClip}
      />

      {showExport && <ExportDialog clips={clips} music={music} transitions={transitions} total={total} onClose={() => setShowExport(false)} />}
    </div>
  )
}
