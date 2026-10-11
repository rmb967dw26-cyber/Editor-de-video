/**
 * Enruta el audio de la vista previa por Web Audio para poder medir niveles
 * (medidores del mezclador) y controlar el volumen de cada pista.
 *
 * El AudioContext solo puede arrancar tras un gesto del usuario; hasta entonces
 * los elementos suenan directamente y el volumen se aplica con `element.volume`.
 */
export type Bus = 'a1' | 'a2' | 'fx'

interface BusNodes {
  gain: GainNode
  analyser: AnalyserNode
}

class AudioEngine {
  private ctx: AudioContext | null = null
  private buses = new Map<Bus, BusNodes>()
  private master: AnalyserNode | null = null
  private masterGain: GainNode | null = null
  private masterVolume = 1
  private elements: [HTMLMediaElement, Bus][] = []
  private connected = new WeakSet<HTMLMediaElement>()
  private gains: Record<Bus, number> = { a1: 1, a2: 1, fx: 1 }
  private buffer = new Float32Array(1024)

  get running() {
    return this.ctx !== null
  }

  register(el: HTMLMediaElement, bus: Bus) {
    if (this.elements.some(([e]) => e === el)) return
    this.elements.push([el, bus])
    if (this.ctx) this.connect(el, bus)
  }

  /** Llamar desde un gesto del usuario (p. ej. al pulsar reproducir). */
  start() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {})
      return
    }
    try {
      const ctx = new AudioContext()
      // Pistas → fader del máster → medidor del máster → altavoces.
      const masterGain = ctx.createGain()
      masterGain.gain.value = this.masterVolume
      const master = ctx.createAnalyser()
      master.fftSize = 1024
      masterGain.connect(master)
      master.connect(ctx.destination)
      for (const bus of ['a1', 'a2', 'fx'] as Bus[]) {
        const gain = ctx.createGain()
        gain.gain.value = this.gains[bus]
        const analyser = ctx.createAnalyser()
        analyser.fftSize = 1024
        gain.connect(analyser)
        analyser.connect(masterGain)
        this.buses.set(bus, { gain, analyser })
      }
      this.ctx = ctx
      this.master = master
      this.masterGain = masterGain
      for (const [el, bus] of this.elements) this.connect(el, bus)
    } catch {
      this.ctx = null
    }
  }

  private connect(el: HTMLMediaElement, bus: Bus) {
    if (!this.ctx || this.connected.has(el)) return
    const source = this.ctx.createMediaElementSource(el)
    source.connect(this.buses.get(bus)!.gain)
    this.connected.add(el)
    el.volume = 1
  }

  /** Volumen de una pista (puede superar 1 cuando Web Audio está activo). */
  setVolume(bus: Bus, el: HTMLMediaElement | null, value: number) {
    this.gains[bus] = value
    const nodes = this.buses.get(bus)
    if (nodes && this.ctx) nodes.gain.gain.setTargetAtTime(value, this.ctx.currentTime, 0.01)
    else if (el) el.volume = clamp01(value * this.masterVolume)
  }

  /** Fader del máster: afecta a todas las pistas. */
  setMasterVolume(value: number) {
    this.masterVolume = value
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(value, this.ctx.currentTime, 0.01)
    } else {
      for (const [el, bus] of this.elements) el.volume = clamp01(this.gains[bus] * value)
    }
  }

  /** Pico actual (0–1) de una pista o del máster. */
  level(bus: Bus | 'master'): number {
    const analyser = bus === 'master' ? this.master : this.buses.get(bus)?.analyser
    if (!analyser) return 0
    analyser.getFloatTimeDomainData(this.buffer)
    let peak = 0
    for (let i = 0; i < this.buffer.length; i++) {
      const v = Math.abs(this.buffer[i])
      if (v > peak) peak = v
    }
    return peak
  }
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v))

export const audioEngine = new AudioEngine()
