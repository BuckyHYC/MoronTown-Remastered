/**
 * WebAudio 合成音频：多层引擎 + 风噪 + 胎噪 + UI / 换挡 / 碰撞。
 * 无外部音频资源，所有声音由振荡器与噪声实时合成。
 */
export class AudioSystem {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private engineGain: GainNode | null = null;
  private engineFilter: BiquadFilterNode | null = null;
  private oscillators: OscillatorNode[] = [];
  private windGain: GainNode | null = null;
  private tireGain: GainNode | null = null;
  private rainGain: GainNode | null = null;
  private rainOn = false;
  private noiseBuffer: AudioBuffer | null = null;
  private muted = false;
  private bgmVolume = 0.5;
  private sfxVolume = 0.7;
  private started = false;

  constructor(muted: boolean, bgm: number, sfx: number) {
    this.muted = muted;
    this.bgmVolume = bgm;
    this.sfxVolume = sfx;
  }

  /** 需要用户手势后才能创建 AudioContext */
  async init(): Promise<void> {
    if (this.started) {
      await this.ctx?.resume();
      return;
    }
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    try {
      const ctx = new Ctor();
      this.ctx = ctx;
      this.started = true;
      this.build();
      await ctx.resume();
    } catch {
      this.ctx = null;
    }
  }

  private build(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const master = ctx.createGain();
    master.gain.value = this.muted ? 0 : this.sfxVolume * 0.9;
    const compressor = ctx.createDynamicsCompressor();
    compressor.threshold.value = -14;
    compressor.ratio.value = 4;
    master.connect(compressor);
    compressor.connect(ctx.destination);
    this.master = master;

    // 引擎：三谐波 + 低通
    const engineGain = ctx.createGain();
    engineGain.gain.value = 0.02;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 800;
    filter.Q.value = 1.2;
    engineGain.connect(filter);
    filter.connect(master);
    this.engineGain = engineGain;
    this.engineFilter = filter;

    for (const [type, detune, gainValue] of [
      ['sawtooth', 0, 0.5],
      ['square', 7, 0.22],
      ['sawtooth', -5, 0.18],
    ] as const) {
      const osc = ctx.createOscillator();
      osc.type = type;
      osc.frequency.value = 60;
      osc.detune.value = detune;
      const g = ctx.createGain();
      g.gain.value = gainValue;
      osc.connect(g);
      g.connect(engineGain);
      osc.start();
      this.oscillators.push(osc);
    }

    // 噪声源（风噪 / 胎噪 / 撞击共用）
    const length = ctx.sampleRate * 2;
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i += 1) data[i] = Math.random() * 2 - 1;
    this.noiseBuffer = buffer;

    const wind = ctx.createBufferSource();
    wind.buffer = buffer;
    wind.loop = true;
    const windFilter = ctx.createBiquadFilter();
    windFilter.type = 'highpass';
    windFilter.frequency.value = 900;
    const windGain = ctx.createGain();
    windGain.gain.value = 0;
    wind.connect(windFilter);
    windFilter.connect(windGain);
    windGain.connect(master);
    wind.start();
    this.windGain = windGain;

    const tire = ctx.createBufferSource();
    tire.buffer = buffer;
    tire.loop = true;
    const tireFilter = ctx.createBiquadFilter();
    tireFilter.type = 'bandpass';
    tireFilter.frequency.value = 1600;
    tireFilter.Q.value = 0.9;
    const tireGain = ctx.createGain();
    tireGain.gain.value = 0;
    tire.connect(tireFilter);
    tireFilter.connect(tireGain);
    tireGain.connect(master);
    tire.start();
    this.tireGain = tireGain;

    // 雨声：宽频噪声 + 低通，随开关淡入淡出
    const rain = ctx.createBufferSource();
    rain.buffer = buffer;
    rain.loop = true;
    const rainFilter = ctx.createBiquadFilter();
    rainFilter.type = 'lowpass';
    rainFilter.frequency.value = 5200;
    const rainGain = ctx.createGain();
    rainGain.gain.value = 0;
    rain.connect(rainFilter);
    rainFilter.connect(rainGain);
    rainGain.connect(master);
    rain.start();
    this.rainGain = rainGain;
    if (this.rainOn) rainGain.gain.setTargetAtTime(0.075, ctx.currentTime, 0.8);
  }

  update(speedMs: number, rpmRatio: number, throttle: number, lateral: number, gear: number): void {
    const ctx = this.ctx;
    if (!ctx || !this.engineGain || !this.engineFilter) return;
    const now = ctx.currentTime;
    const rpm = Math.max(0, Math.min(1, rpmRatio));
    const base = 52 + rpm * 210 + (gear - 1) * 3;
    for (const osc of this.oscillators) {
      osc.frequency.setTargetAtTime(base, now, 0.05);
    }
    this.engineFilter.frequency.setTargetAtTime(500 + rpm * 2400 + throttle * 900, now, 0.08);
    this.engineGain.gain.setTargetAtTime(0.012 + throttle * 0.03 + rpm * 0.012, now, 0.1);
    const speed = Math.abs(speedMs);
    this.windGain?.gain.setTargetAtTime(Math.min(0.12, (speed / 60) ** 2 * 0.09), now, 0.15);
    this.tireGain?.gain.setTargetAtTime(Math.min(0.1, Math.abs(lateral) * 0.02), now, 0.1);
  }

  playShift(): void {
    this.blip(180, 60, 0.06, 'square', 0.08);
  }

  playClick(): void {
    this.blip(880, 320, 0.05, 'triangle', 0.05);
  }

  playCollision(intensity: number): void {
    const ctx = this.ctx;
    if (!ctx || !this.master || !this.noiseBuffer) return;
    const source = ctx.createBufferSource();
    source.buffer = this.noiseBuffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 420;
    const gain = ctx.createGain();
    const level = Math.min(0.5, 0.08 + intensity * 0.01);
    gain.gain.setValueAtTime(level, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.28);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    source.start();
    source.stop(ctx.currentTime + 0.3);
  }

  private blip(from: number, to: number, duration: number, type: OscillatorType, volume: number): void {
    const ctx = this.ctx;
    if (!ctx || !this.master) return;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(from, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(to, ctx.currentTime + duration);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(volume, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration);
    osc.connect(gain);
    gain.connect(this.master);
    osc.start();
    osc.stop(ctx.currentTime + duration + 0.02);
  }

  /** 雨声层开关（未初始化 AudioContext 时只记录意图） */
  setRain(on: boolean): void {
    this.rainOn = on;
    if (this.rainGain && this.ctx) {
      this.rainGain.gain.setTargetAtTime(on ? 0.075 : 0, this.ctx.currentTime, 0.8);
    }
  }

  setMuted(muted: boolean): void {    this.muted = muted;
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(muted ? 0 : this.sfxVolume * 0.9, this.ctx.currentTime, 0.05);
    }
  }

  setVolumes(bgm: number, sfx: number): void {
    this.bgmVolume = bgm;
    this.sfxVolume = sfx;
    if (this.master && this.ctx && !this.muted) {
      this.master.gain.setTargetAtTime(sfx * 0.9, this.ctx.currentTime, 0.05);
    }
    void this.bgmVolume;
  }

  suspend(): void {
    void this.ctx?.suspend();
  }

  resume(): void {
    void this.ctx?.resume();
  }
}
