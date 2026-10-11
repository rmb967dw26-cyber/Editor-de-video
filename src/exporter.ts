import { FFmpeg } from '@ffmpeg/ffmpeg'
import { fetchFile, toBlobURL } from '@ffmpeg/util'
import coreURL from '@ffmpeg/core?url'
import wasmURL from '@ffmpeg/core/wasm?url'
import { clipLength, type Clip, type ExportSettings, type MusicTrack, type PlacedTransition } from './types'

let instance: FFmpeg | null = null
let loading: Promise<FFmpeg> | null = null

/** Carga FFmpeg.wasm una sola vez (unos 30 MB). */
export function getFFmpeg(): Promise<FFmpeg> {
  if (instance) return Promise.resolve(instance)
  if (!loading) {
    loading = (async () => {
      const ffmpeg = new FFmpeg()
      await ffmpeg.load({
        coreURL: await toBlobURL(coreURL, 'text/javascript'),
        wasmURL: await toBlobURL(wasmURL, 'application/wasm'),
      })
      instance = ffmpeg
      return ffmpeg
    })().finally(() => {
      loading = null
    })
  }
  return loading
}

/** Cancela una exportación en curso destruyendo el worker de FFmpeg. */
export function cancelExport() {
  instance?.terminate()
  instance = null
}

export interface ExportCallbacks {
  onStage: (stage: string) => void
  onProgress: (ratio: number) => void
  onLog?: (line: string) => void
}

const n = (x: number) => x.toFixed(3)

export async function exportProject(
  clips: Clip[],
  music: MusicTrack | null,
  transitions: PlacedTransition[],
  settings: ExportSettings,
  cb: ExportCallbacks,
): Promise<Blob> {
  if (clips.length === 0) throw new Error('No hay clips para exportar')

  cb.onStage('Cargando FFmpeg…')
  const ffmpeg = await getFFmpeg()

  let logs: string[] = []
  const onLog = ({ message }: { message: string }) => {
    logs.push(message)
    cb.onLog?.(message)
  }
  let stepBase = 0
  let stepWeight = 0
  const onProgress = ({ progress }: { progress: number }) => {
    const p = Math.min(1, Math.max(0, progress))
    cb.onProgress(stepBase + p * stepWeight)
  }
  ffmpeg.on('log', onLog)
  ffmpeg.on('progress', onProgress)

  const run = async (args: string[], what: string) => {
    logs = []
    const code = await ffmpeg.exec(args)
    if (code !== 0) {
      const tail = logs.slice(-8).join('\n')
      throw new Error(`FFmpeg falló al ${what}.\n${tail}`)
    }
  }

  const totalDuration = clips.reduce((t, c) => t + clipLength(c), 0)
  // Reparto aproximado de la barra de progreso entre las fases.
  const segmentShare = transitions.length ? 0.6 : music ? 0.9 : 0.97
  const { width: W, height: H } = settings
  const segments: string[] = []

  try {
    // 1. Recorta y normaliza cada clip a la misma resolución, fps y formato de audio.
    for (let i = 0; i < clips.length; i++) {
      const clip = clips[i]
      const dur = clipLength(clip)
      cb.onStage(`Procesando clip ${i + 1} de ${clips.length}: ${clip.name}`)
      const input = `in${i}`
      await ffmpeg.writeFile(input, await fetchFile(clip.file))

      // Detecta si el archivo tiene pista de audio.
      logs = []
      await ffmpeg.exec(['-hide_banner', '-i', input])
      const hasAudio = logs.some((l) => /Stream #.*Audio:/.test(l))

      const video =
        `[0:v]scale=${W}:${H}:force_original_aspect_ratio=decrease,` +
        `pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1,fps=30,format=yuv420p[v]`
      const audio =
        hasAudio && !clip.muted
          ? `[0:a]aresample=44100,aformat=sample_fmts=fltp:channel_layouts=stereo,volume=${n(clip.volume)},apad[a]`
          : `anullsrc=r=44100:cl=stereo,atrim=0:${n(dur)}[a]`

      const out = `seg${i}.mp4`
      stepBase = (i / clips.length) * segmentShare
      stepWeight = segmentShare / clips.length
      await run(
        [
          '-ss', n(clip.start), '-i', input, '-t', n(dur),
          '-filter_complex', `${video};${audio}`,
          '-map', '[v]', '-map', '[a]',
          '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '23',
          '-c:a', 'aac', '-b:a', '128k',
          '-video_track_timescale', '90000',
          out,
        ],
        `procesar «${clip.name}»`,
      )
      await ffmpeg.deleteFile(input)
      segments.push(out)
    }

    // 2. Une los segmentos sin recodificar.
    cb.onStage('Uniendo clips…')
    const master = Math.max(0, settings.masterVolume)
    const needsFinalPass = !!music || transitions.length > 0 || Math.abs(master - 1) > 0.001
    stepBase = segmentShare
    stepWeight = needsFinalPass ? 0.02 : 1 - segmentShare
    await ffmpeg.writeFile('list.txt', segments.map((s) => `file '${s}'`).join('\n'))
    const joined = needsFinalPass ? 'joined.mp4' : 'output.mp4'
    await run(
      ['-f', 'concat', '-safe', '0', '-i', 'list.txt', '-c', 'copy', '-movflags', '+faststart', joined],
      'unir los clips',
    )
    for (const s of segments) await ffmpeg.deleteFile(s)

    // 3. Superpone las transiciones y mezcla su sonido y la música con el audio de los clips.
    if (needsFinalPass) {
      cb.onStage(
        transitions.length
          ? `Aplicando ${transitions.length} transición(es)${music ? ' y la música' : ''}…`
          : music
            ? 'Mezclando la música…'
            : 'Ajustando el volumen general…',
      )
      stepBase = segmentShare + 0.02
      stepWeight = 1 - stepBase
      const args: string[] = ['-i', joined]
      const videoFilters: string[] = []
      const audioLabels: string[] = ['[0:a]']
      const audioFilters: string[] = []
      const audioFmt = 'aresample=44100,aformat=sample_fmts=fltp:channel_layouts=stereo'
      const written = new Set<string>()
      let lastVideo = '[0:v]'

      for (let k = 0; k < transitions.length; k++) {
        const { stinger, start } = transitions[k]
        const input = `st_${stinger.id}`
        if (!written.has(input)) {
          await ffmpeg.writeFile(input, await fetchFile(stinger.file))
          written.add(input)
        }
        // El decodificador nativo de VP8/VP9 ignora la transparencia; libvpx la conserva.
        logs = []
        await ffmpeg.exec(['-hide_banner', '-i', input])
        const codec = logs.join('\n').match(/Video: (vp8|vp9)/)?.[1]
        const hasAudio = logs.some((l) => /Stream #.*Audio:/.test(l))
        if (codec) args.push('-c:v', codec === 'vp9' ? 'libvpx-vp9' : 'libvpx')
        args.push('-i', input)
        const idx = k + 1

        // Si el stinger empieza antes del inicio del video, se descarta la parte sobrante.
        const skip = Math.max(0, -start)
        const delay = Math.max(0, start)
        videoFilters.push(
          `[${idx}:v]scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},` +
            `fps=30,format=yuva420p,trim=start=${n(skip)},setpts=PTS-STARTPTS,` +
            `tpad=start_duration=${n(delay)}:color=black@0[s${k}]`,
          `${lastVideo}[s${k}]overlay=eof_action=pass:format=auto[v${k}]`,
        )
        lastVideo = `[v${k}]`
        if (hasAudio) {
          audioFilters.push(
            `[${idx}:a]${audioFmt},atrim=start=${n(skip)},asetpts=PTS-STARTPTS,` +
              `adelay=${Math.round(delay * 1000)}:all=1[sa${k}]`,
          )
          audioLabels.push(`[sa${k}]`)
        }
      }

      if (music) {
        await ffmpeg.writeFile('music', await fetchFile(music.file))
        args.push('-ss', n(music.offset), '-i', 'music')
        const fade =
          music.fadeOut && totalDuration > 4
            ? `,afade=t=out:st=${n(totalDuration - 2)}:d=2`
            : ''
        audioFilters.push(
          `[${transitions.length + 1}:a]${audioFmt},` +
            `volume=${n(music.volume)},atrim=0:${n(totalDuration)}${fade}[m]`,
        )
        audioLabels.push('[m]')
      }

      const filters = [...videoFilters]
      if (videoFilters.length) filters.push(`${lastVideo}format=yuv420p[vout]`)
      // Mezcla de todas las fuentes y, al final, el fader del máster.
      const masterFilter = Math.abs(master - 1) > 0.001 ? `volume=${n(master)}` : ''
      const mixAudio = audioLabels.length > 1 || masterFilter !== ''
      if (audioLabels.length > 1) {
        filters.push(
          ...audioFilters,
          `${audioLabels.join('')}amix=inputs=${audioLabels.length}:duration=first:dropout_transition=0:normalize=0` +
            `${masterFilter ? ',' + masterFilter : ''}[aout]`,
        )
      } else if (masterFilter) {
        filters.push(`[0:a]${masterFilter}[aout]`)
      }
      if (filters.length) args.push('-filter_complex', filters.join(';'))
      args.push('-map', videoFilters.length ? '[vout]' : '0:v')
      args.push('-map', mixAudio ? '[aout]' : '0:a')
      args.push(
        ...(videoFilters.length ? ['-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '23'] : ['-c:v', 'copy']),
        ...(mixAudio ? ['-c:a', 'aac', '-b:a', '160k'] : ['-c:a', 'copy']),
        '-t', n(totalDuration),
        '-movflags', '+faststart',
        'output.mp4',
      )
      await run(args, transitions.length ? 'aplicar las transiciones' : 'mezclar el audio')

      for (const f of written) await ffmpeg.deleteFile(f)
      if (music) await ffmpeg.deleteFile('music')
      await ffmpeg.deleteFile(joined)
    }

    const data = await ffmpeg.readFile('output.mp4')
    await ffmpeg.deleteFile('output.mp4')
    await ffmpeg.deleteFile('list.txt')
    cb.onProgress(1)
    return new Blob([data as Uint8Array<ArrayBuffer>], { type: 'video/mp4' })
  } finally {
    ffmpeg.off('log', onLog)
    ffmpeg.off('progress', onProgress)
  }
}
