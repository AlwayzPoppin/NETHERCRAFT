export class SoundManager {
  private ctx: AudioContext | null = null;
  public masterVolume: number = 1.0;
  public musicVolume: number = 1.0;
  public sfxVolume: number = 1.0;
  public ambianceVolume: number = 1.0;

  public get volume(): number {
    return this.masterVolume;
  }
  public set volume(val: number) {
    this.masterVolume = val;
  }

  public getEffectiveMusicVolume(base: number = 0.9): number {
    return this.masterVolume * this.musicVolume * base;
  }

  public getEffectiveSfxVolume(base: number = 0.85): number {
    return this.masterVolume * this.sfxVolume * base;
  }

  public getEffectiveAmbianceVolume(base: number = 0.95): number {
    return this.masterVolume * this.ambianceVolume * base;
  }

  private titleMusicAudio: HTMLAudioElement | null = null;
  private isTitleMusicPlaying: boolean = false;
  private titleMusicPauseTimer: number | null = null;

  constructor() {
    // Audio elements are created lazily on first activation (after user interaction)
  }

  public initCtx(): void {
    if (!this.ctx) {
      const AudioCtxFunc = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AudioCtxFunc();
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
  }

  public startTitleMusic(): void {
    this.initCtx();
    if (this.isTitleMusicPlaying) return;
    this.isTitleMusicPlaying = true;

    if (!this.titleMusicAudio) {
      this.titleMusicAudio = new Audio('/AUDIO/TITLE SCREEN MUSIC.wav');
      this.titleMusicAudio.volume = this.getEffectiveMusicVolume(0.9);

      this.titleMusicAudio.addEventListener('ended', () => {
        if (!this.isTitleMusicPlaying) return;

        const pauseMs = 5000 + Math.random() * 5000;
        this.titleMusicPauseTimer = window.setTimeout(() => {
          if (this.isTitleMusicPlaying && this.titleMusicAudio) {
            this.titleMusicAudio.currentTime = 0;
            this.titleMusicAudio.volume = this.getEffectiveMusicVolume(0.9);
            this.titleMusicAudio.play().catch(() => {});
          }
        }, pauseMs);
      });
    }

    this.titleMusicAudio.currentTime = 0;
    this.titleMusicAudio.volume = this.getEffectiveMusicVolume(0.9);
    const playPromise = this.titleMusicAudio.play();
    if (playPromise !== undefined) {
      playPromise.catch(() => {});
    }
  }

  public stopTitleMusic(): void {
    this.isTitleMusicPlaying = false;
    if (this.titleMusicPauseTimer !== null) {
      clearTimeout(this.titleMusicPauseTimer);
      this.titleMusicPauseTimer = null;
    }
    if (this.titleMusicAudio) {
      try {
        this.titleMusicAudio.pause();
        this.titleMusicAudio.currentTime = 0;
      } catch {}
    }
  }

  private ambianceTracks: Array<{
    name: string;
    audio: HTMLAudioElement | null;
    vol: number;
    baseVol: number;
    src: string;
    altSrc: string;
    active: boolean;
  }> = [
    { name: 'groveDay', audio: null, vol: 0, baseVol: 0.95, src: '/AUDIO/BIOMES AUDIO/GROVE WIND-BIRDS DAYTIME.wav', altSrc: '/AUDIO/GROVE WIND-BIRDS DAYTIME.wav', active: false },
    { name: 'groveNight', audio: null, vol: 0, baseVol: 0.95, src: '/AUDIO/BIOMES AUDIO/GROVE WIND AND CRICKETS (NIGHT TIME).wav', altSrc: '/AUDIO/GROVE WIND AND CRICKETS (NIGHT TIME).wav', active: false },
    { name: 'frostWind', audio: null, vol: 0, baseVol: 1.0, src: '/AUDIO/BIOMES AUDIO/FROST BIOME WIND.wav', altSrc: '/AUDIO/FROST BIOME WIND.wav', active: false },
    { name: 'desertWind', audio: null, vol: 0, baseVol: 1.0, src: '/AUDIO/BIOMES AUDIO/DESERT BIOME WIND.wav', altSrc: '/AUDIO/DESERT BIOME WIND.wav', active: false },
    { name: 'ruinsAmbience', audio: null, vol: 0, baseVol: 1.0, src: '/AUDIO/BIOMES AUDIO/nether ruins volcanic-planet-ambience.wav', altSrc: '/AUDIO/nether ruins volcanic-planet-ambience.wav', active: false },
    { name: 'jungleAmbience', audio: null, vol: 0, baseVol: 1.0, src: '/AUDIO/BIOMES AUDIO/MOSSVEIL JUNGLE BIOME AUDIO_AMBIENCE.wav', altSrc: '/AUDIO/MOSSVEIL JUNGLE BIOME AUDIO_AMBIENCE.wav', active: false },
    { name: 'riverStream', audio: null, vol: 0, baseVol: 1.0, src: '/AUDIO/BIOMES AUDIO/RIVER STREAM.wav', altSrc: '/AUDIO/RIVER STREAM.wav', active: false },
  ];

  public updateVolumes(master: number, music: number, sfx: number, ambiance: number = 0.8): void {
    this.masterVolume = master;
    this.musicVolume = music;
    this.sfxVolume = sfx;
    this.ambianceVolume = ambiance;

    if (this.titleMusicAudio) {
      this.titleMusicAudio.volume = this.getEffectiveMusicVolume(0.7);
    }
    for (const track of this.ambianceTracks) {
      if (track.audio && track.vol > 0) {
        track.audio.volume = Math.max(0, Math.min(1.0, this.getEffectiveAmbianceVolume(track.baseVol) * track.vol));
      }
    }
  }

  public updateVolume(newVolume: number): void {
    this.updateVolumes(newVolume, this.musicVolume, this.sfxVolume, this.ambianceVolume);
  }

  private lastRiverState: boolean = false;
  private riverDebugCounter: number = 0;
  private smoothedRiverGain: number = 0; // Smooth interpolation target to prevent popping

  /** Preload all HTMLAudioElements synchronously or fallback */
  public preloadAllAmbianceTracks(): void {
    for (const track of this.ambianceTracks) {
      this.ensureTrackAudio(track);
    }
  }

  /** Complete async preloading and decoding of all audio assets before gameplay */
  public async preloadAllAudioAsync(
    onProgress?: (loaded: number, total: number, assetName: string) => void
  ): Promise<void> {
    this.initCtx();
    this.initNoiseBuffers();

    const totalTasks = this.ambianceTracks.length + 2;
    let loadedCount = 0;

    const report = (name: string) => {
      loadedCount++;
      onProgress?.(loadedCount, totalTasks, name);
    };

    // 1. Preload atmospheric ambient tracks
    for (const track of this.ambianceTracks) {
      this.ensureTrackAudio(track);
      report(`Ambiance: ${track.name}`);
    }

    // 2. Preload and decode custom audio buffers
    await this.loadVolcanicGravelBufferAsync();
    report('Volcanic Gravel Audio Buffer');

    // 3. Preload title screen track
    if (!this.titleMusicAudio) {
      this.titleMusicAudio = new Audio('/AUDIO/TITLE SCREEN MUSIC.wav');
      this.titleMusicAudio.preload = 'auto';
    }
    report('Title Screen Music');
  }

  /** Ensure HTMLAudioElement for a track */
  private ensureTrackAudio(track: typeof this.ambianceTracks[0]): HTMLAudioElement {
    if (!track.audio) {
      const audio = new Audio(track.src);
      audio.preload = 'auto';
      audio.loop = true;
      const alt = track.altSrc;
      audio.onerror = () => {
        audio.src = alt;
      };
      track.audio = audio;
    }
    return track.audio;
  }

  public updateAmbiance(biome: string, isDaytime: boolean, isNearRiver: boolean = false, riverGain: number = 1.0, dt: number = 0.016): void {
    this.initCtx();

    // Smooth interpolation of riverGain to prevent volume popping
    // Lerp speed: ~6 units/sec means full 0→1 transition takes ~0.25s
    const lerpSpeed = 6.0 * dt;
    this.smoothedRiverGain += (riverGain - this.smoothedRiverGain) * Math.min(1.0, lerpSpeed);
    // Snap to zero when very close to avoid lingering micro-volume
    if (this.smoothedRiverGain < 0.005) this.smoothedRiverGain = 0;

    const smoothGain = this.smoothedRiverGain;
    const smoothIsNear = smoothGain > 0.005;

    // Determine target state for each track
    const isGrove = (biome === 'grove');
    const isRainforest = (biome === 'rainforest' || biome === 'jungle');

    const groveDay = this.ambianceTracks.find(t => t.name === 'groveDay');
    if (groveDay) groveDay.active = (isGrove && isDaytime);

    const groveNight = this.ambianceTracks.find(t => t.name === 'groveNight');
    if (groveNight) groveNight.active = (isGrove && !isDaytime);

    const frostWind = this.ambianceTracks.find(t => t.name === 'frostWind');
    if (frostWind) frostWind.active = (biome === 'frost' && !smoothIsNear);

    const desertWind = this.ambianceTracks.find(t => t.name === 'desertWind');
    if (desertWind) desertWind.active = (biome === 'sunscorched' && !smoothIsNear);

    const ruinsAmbience = this.ambianceTracks.find(t => t.name === 'ruinsAmbience');
    if (ruinsAmbience) ruinsAmbience.active = (biome === 'ruins' && !smoothIsNear);

    // Jungle / Rainforest plays MOSSVEIL JUNGLE BIOME AUDIO_AMBIENCE all day and night!
    const jungleAmbience = this.ambianceTracks.find(t => t.name === 'jungleAmbience');
    if (jungleAmbience) jungleAmbience.active = isRainforest;

    const riverStream = this.ambianceTracks.find(t => t.name === 'riverStream');
    if (riverStream) riverStream.active = smoothIsNear;

    const fadeSpeed = 0.75;

    for (let i = 0; i < this.ambianceTracks.length; i++) {
      const track = this.ambianceTracks[i];
      const isRiverTrack = (track.name === 'riverStream');

      // River track volume is directly driven by the smoothed gain curve
      const baseVol = isRiverTrack
        ? (track.baseVol * smoothGain)
        : track.baseVol;

      if (track.active) {
        // Fade In
        track.vol = Math.min(1.0, track.vol + dt * fadeSpeed);
        const audio = this.ensureTrackAudio(track);
        const effectiveVol = this.getEffectiveAmbianceVolume(baseVol) * track.vol;
        audio.volume = Math.max(0, Math.min(1.0, effectiveVol));
        if (audio.paused && effectiveVol > 0) {
          const p = audio.play();
          if (p !== undefined) {
            p.then(() => {
              if (isRiverTrack) {
                console.log(`[Audio] ✅ River stream NOW PLAYING! vol=${effectiveVol.toFixed(2)}, src=${track.src}`);
              } else if (track.name === 'jungleAmbience') {
                console.log(`[Audio] 🌴 Mossveil Jungle Ambience NOW PLAYING! vol=${effectiveVol.toFixed(2)}, src=${track.src}`);
              }
            }).catch((e) => {
              if (e.name !== 'AbortError') {
                console.warn(`[Audio] ❌ Play REJECTED for ${track.name}: ${e.name} - ${e.message}`);
              }
            });
          }
        }
      } else {
        // Fade Out
        if (track.vol > 0) {
          track.vol = Math.max(0, track.vol - dt * fadeSpeed);
          if (track.audio) {
            const effectiveVol = this.getEffectiveAmbianceVolume(baseVol) * track.vol;
            track.audio.volume = Math.max(0, Math.min(1.0, effectiveVol));
            if (track.vol <= 0.001) {
              track.vol = 0;
              track.audio.pause();
            }
          }
        }
      }
    }
  }

  /** Pauses all active ambient loops when application loses visibility */
  public pauseAllAmbiance(): void {
    for (const track of this.ambianceTracks) {
      if (track.audio && !track.audio.paused) {
        try {
          track.audio.pause();
        } catch {}
      }
    }
  }

  /** Resumes active ambient loops when application regains visibility */
  public resumeAllAmbiance(): void {
    this.initCtx();
    for (const track of this.ambianceTracks) {
      if (track.audio && track.active && track.vol > 0) {
        try {
          track.audio.play().catch(() => {});
        } catch {}
      }
    }
  }

  // Synthesizes a monster hurt/growl sound
  public playMonsterHurt(): void {
    this.initCtx();
    const effSfxVol = this.getEffectiveSfxVolume(0.5);
    if (!this.ctx || effSfxVol <= 0) return;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(140, this.ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(50, this.ctx.currentTime + 0.15);

    gain.gain.setValueAtTime(effSfxVol, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.15);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start();
    osc.stop(this.ctx.currentTime + 0.15);
  }

  // Synthesizes a subtle crisp UI button click sound
  public playClick(): void {
    this.initCtx();
    const effSfxVol = this.getEffectiveSfxVolume(0.35);
    if (!this.ctx || effSfxVol <= 0) return;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(1200, this.ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(600, this.ctx.currentTime + 0.03);

    gain.gain.setValueAtTime(effSfxVol, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.03);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start();
    osc.stop(this.ctx.currentTime + 0.03);
  }

  public stopAllAmbiance(): void {
    for (const track of this.ambianceTracks) {
      track.active = false;
      track.vol = 0;
      if (track.audio) {
        try {
          track.audio.pause();
          track.audio.currentTime = 0;
        } catch {}
      }
    }
  }

  private breakNoiseBuffers: AudioBuffer[] = [];
  private hitNoiseBuffers: AudioBuffer[] = [];

  /** Pre-generates and pools noise audio buffers to avoid main-thread GC and allocation spikes */
  public initNoiseBuffers(): void {
    if (!this.ctx || this.breakNoiseBuffers.length > 0) return;
    const sampleRate = this.ctx.sampleRate;

    // 4 variations of block break noise
    const breakLen = Math.floor(sampleRate * 0.12);
    for (let v = 0; v < 4; v++) {
      const buf = this.ctx.createBuffer(1, breakLen, sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < breakLen; i++) {
        d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / breakLen, 2);
      }
      this.breakNoiseBuffers.push(buf);
    }

    // 4 variations of block hit noise
    const hitLen = Math.floor(sampleRate * 0.04);
    for (let v = 0; v < 4; v++) {
      const buf = this.ctx.createBuffer(1, hitLen, sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < hitLen; i++) {
        d[i] = (Math.random() * 2 - 1) * (1 - i / hitLen);
      }
      this.hitNoiseBuffers.push(buf);
    }
  }

  // Synthesizes a crunchy noise burst for block breaking using pooled pre-allocated buffers
  public playBlockBreak(): void {
    this.initCtx();
    const effSfxVol = this.getEffectiveSfxVolume(0.6);
    if (!this.ctx || effSfxVol <= 0) return;

    if (this.breakNoiseBuffers.length === 0) {
      this.initNoiseBuffers();
    }

    const buffer = this.breakNoiseBuffers.length > 0
      ? this.breakNoiseBuffers[Math.floor(Math.random() * this.breakNoiseBuffers.length)]
      : null;
    if (!buffer) return;

    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(800, this.ctx.currentTime);
    filter.frequency.exponentialRampToValueAtTime(200, this.ctx.currentTime + 0.12);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(effSfxVol, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.12);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.ctx.destination);

    noise.start();
  }

  // Synthesizes a soft click/thud for block hit ticks using pooled pre-allocated buffers
  public playBlockHit(): void {
    this.initCtx();
    const effSfxVol = this.getEffectiveSfxVolume(0.35);
    if (!this.ctx || effSfxVol <= 0) return;

    if (this.hitNoiseBuffers.length === 0) {
      this.initNoiseBuffers();
    }

    const buffer = this.hitNoiseBuffers.length > 0
      ? this.hitNoiseBuffers[Math.floor(Math.random() * this.hitNoiseBuffers.length)]
      : null;
    if (!buffer) return;

    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(600, this.ctx.currentTime);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(effSfxVol, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.04);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.ctx.destination);

    noise.start();
  }

  // Synthesizes a solid thud/pop for block placing
  public playBlockPlace(): void {
    this.initCtx();
    const effSfxVol = this.getEffectiveSfxVolume(0.7);
    if (!this.ctx || effSfxVol <= 0) return;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(220, this.ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(80, this.ctx.currentTime + 0.08);

    gain.gain.setValueAtTime(effSfxVol, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.08);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start();
    osc.stop(this.ctx.currentTime + 0.08);
  }

  private volcanicGravelBuffer: AudioBuffer | null = null;
  private isLoadingVolcanicGravel: boolean = false;

  public async loadVolcanicGravelBufferAsync(): Promise<void> {
    if (this.volcanicGravelBuffer) return;
    if (this.isLoadingVolcanicGravel) {
      while (this.isLoadingVolcanicGravel && !this.volcanicGravelBuffer) {
        await new Promise(r => setTimeout(r, 20));
      }
      return;
    }
    this.isLoadingVolcanicGravel = true;
    try {
      this.initCtx();
      const res = await fetch('/AUDIO/PLAYER AUDIO/footsteps-on-volcanic-gravel.mp3');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const ab = await res.arrayBuffer();
      if (!this.ctx) return;
      const fullBuffer = await this.ctx.decodeAudioData(ab);
      if (!fullBuffer || !this.ctx) return;

      // Chop audio buffer down to exactly 2.0 seconds
      const targetDuration = 2.0;
      const sampleRate = fullBuffer.sampleRate;
      const targetLength = Math.min(fullBuffer.length, Math.floor(sampleRate * targetDuration));
      const numChannels = fullBuffer.numberOfChannels;

      const choppedBuffer = this.ctx.createBuffer(numChannels, targetLength, sampleRate);
      for (let ch = 0; ch < numChannels; ch++) {
        const srcData = fullBuffer.getChannelData(ch);
        const destData = choppedBuffer.getChannelData(ch);
        destData.set(srcData.subarray(0, targetLength));
      }
      this.volcanicGravelBuffer = choppedBuffer;
    } catch (err) {
      console.warn('Failed to load volcanic gravel footsteps audio:', err);
    } finally {
      this.isLoadingVolcanicGravel = false;
    }
  }

  private loadVolcanicGravelBuffer(): void {
    this.loadVolcanicGravelBufferAsync().catch(() => {});
  }

  // Synthesizes or plays authentic footstep sound based on current biome
  public playFootstep(biome?: string): void {
    this.initCtx();
    const effSfxVol = this.getEffectiveSfxVolume(0.5);
    if (!this.ctx || effSfxVol <= 0) return;

    if (biome === 'ruins') {
      if (!this.volcanicGravelBuffer) {
        this.loadVolcanicGravelBuffer();
        this.playSyntheticFootstep(effSfxVol);
        return;
      }

      // Slice a crisp single footstep from the 2.0-second chopped volcanic gravel audio buffer
      const buffer = this.volcanicGravelBuffer;
      const stepDuration = 0.18;
      const maxOffset = Math.max(0, buffer.duration - stepDuration - 0.05);
      const offset = Math.random() * maxOffset;

      const source = this.ctx.createBufferSource();
      source.buffer = buffer;

      // Natural pitch variation per step
      source.playbackRate.value = 0.95 + Math.random() * 0.15;

      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(effSfxVol, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + stepDuration);

      source.connect(gain);
      gain.connect(this.ctx.destination);

      source.start(this.ctx.currentTime, offset, stepDuration);
      return;
    }

    this.playSyntheticFootstep(this.getEffectiveSfxVolume(0.25));
  }

  private playSyntheticFootstep(effSfxVol: number): void {
    if (!this.ctx || effSfxVol <= 0) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(100 + Math.random() * 40, this.ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(40, this.ctx.currentTime + 0.05);

    gain.gain.setValueAtTime(effSfxVol, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.05);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start();
    osc.stop(this.ctx.currentTime + 0.05);
  }

  // Jump / Flight woosh
  public playJump(): void {
    this.initCtx();
    const effSfxVol = this.getEffectiveSfxVolume(0.35);
    if (!this.ctx || effSfxVol <= 0) return;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(150, this.ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(350, this.ctx.currentTime + 0.15);

    gain.gain.setValueAtTime(effSfxVol, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.15);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start();
    osc.stop(this.ctx.currentTime + 0.15);
  }

  // Synthesizes a crisp pop sound for item pickup collection
  public playPop(): void {
    this.initCtx();
    const effSfxVol = this.getEffectiveSfxVolume(0.5);
    if (!this.ctx || effSfxVol <= 0) return;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(440, this.ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(880, this.ctx.currentTime + 0.08);

    gain.gain.setValueAtTime(effSfxVol, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.08);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start();
    osc.stop(this.ctx.currentTime + 0.08);
  }

  // Synthesizes a magical celestial chime chord + airy whoosh for Nimbus Cloud summon
  public playMountSummon(): void {
    this.initCtx();
    const effSfxVol = this.getEffectiveSfxVolume(0.65);
    if (!this.ctx || effSfxVol <= 0) return;

    const notes = [523.25, 659.25, 783.99, 1046.5]; // C5, E5, G5, C6 major chord arpeggio
    notes.forEach((freq, idx) => {
      const osc = this.ctx!.createOscillator();
      const gain = this.ctx!.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, this.ctx!.currentTime + idx * 0.04);

      const noteGain = effSfxVol * (0.28 / notes.length);
      gain.gain.setValueAtTime(0.001, this.ctx!.currentTime + idx * 0.04);
      gain.gain.exponentialRampToValueAtTime(noteGain, this.ctx!.currentTime + idx * 0.04 + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.001, this.ctx!.currentTime + idx * 0.04 + 0.65);

      osc.connect(gain);
      gain.connect(this.ctx!.destination);

      osc.start(this.ctx!.currentTime + idx * 0.04);
      osc.stop(this.ctx!.currentTime + idx * 0.04 + 0.70);
    });

    // Soft airy whoosh underneath
    this.playJump();
  }

  // Synthesizes a soft dissipating cloud chime on dismount
  public playMountDismount(): void {
    this.initCtx();
    const effSfxVol = this.getEffectiveSfxVolume(0.5);
    if (!this.ctx || effSfxVol <= 0) return;

    const notes = [880.0, 659.25, 523.25]; // Descending A5 -> E5 -> C5
    notes.forEach((freq, idx) => {
      const osc = this.ctx!.createOscillator();
      const gain = this.ctx!.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, this.ctx!.currentTime + idx * 0.05);

      const noteGain = effSfxVol * 0.15;
      gain.gain.setValueAtTime(0.001, this.ctx!.currentTime + idx * 0.05);
      gain.gain.exponentialRampToValueAtTime(noteGain, this.ctx!.currentTime + idx * 0.05 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, this.ctx!.currentTime + idx * 0.05 + 0.35);

      osc.connect(gain);
      gain.connect(this.ctx!.destination);

      osc.start(this.ctx!.currentTime + idx * 0.05);
      osc.stop(this.ctx!.currentTime + idx * 0.05 + 0.40);
    });
  }

  // Synthesizes a rush of celestial air for turbo boost
  public playMountBoost(): void {
    this.initCtx();
    const effSfxVol = this.getEffectiveSfxVolume(0.45);
    if (!this.ctx || effSfxVol <= 0) return;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(320, this.ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(680, this.ctx.currentTime + 0.22);

    gain.gain.setValueAtTime(effSfxVol * 0.4, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.30);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start();
    osc.stop(this.ctx.currentTime + 0.30);
  }
}
