// Web Audio manager: buses (master/voice/sfx/ambient), load, play, loop, duck.
import type { Assets } from '../assets/loader';
import type { SfxId } from '../assets/defaultManifest';
import type { PersonaId } from '../game/types';

export interface Volumes { master: number; voice: number; sfx: number; ambient: number }

export class AudioManager {
  ctx: AudioContext | null = null;
  private master!: GainNode;
  private buses!: Record<'voice' | 'sfx' | 'ambient', GainNode>;
  private duckGain!: GainNode;
  private raw = new Map<string, ArrayBuffer>();
  private buffers = new Map<string, AudioBuffer | null>();
  private decoding = new Map<string, Promise<AudioBuffer | null>>();
  private missingLogged = new Set<string>();
  private lastPlayed = new Map<string, number>();
  private ambientNodes: { src: AudioBufferSourceNode; gain: GainNode; id: string }[] = [];
  private ambientWanted: 'off' | 'normal' | 'shop' = 'off';
  private unlocked = false;
  volumes: Volumes = { master: 0.8, voice: 1, sfx: 0.8, ambient: 0.5 };
  enabled = true;
  private unlockListeners: (() => void)[] = [];

  constructor(private assets: Assets, nosound: boolean) {
    this.enabled = !nosound;
    if (!this.enabled) return;
    const unlock = () => {
      this.unlock();
      window.removeEventListener('pointerdown', unlock, true);
      window.removeEventListener('keydown', unlock, true);
    };
    window.addEventListener('pointerdown', unlock, true);
    window.addEventListener('keydown', unlock, true);
  }

  get isUnlocked(): boolean { return this.unlocked; }
  onUnlock(fn: () => void): void { if (this.unlocked) fn(); else this.unlockListeners.push(fn); }

  unlock(): void {
    if (!this.enabled || this.unlocked) return;
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    const ctx = this.ctx;
    this.master = ctx.createGain();
    this.master.connect(ctx.destination);
    this.duckGain = ctx.createGain();
    this.duckGain.connect(this.master);
    this.buses = { voice: ctx.createGain(), sfx: ctx.createGain(), ambient: ctx.createGain() };
    this.buses.voice.connect(this.master);
    this.buses.sfx.connect(this.master);
    this.buses.ambient.connect(this.duckGain);
    this.applyVolumes();
    void ctx.resume();
    this.unlocked = true;
    for (const f of this.unlockListeners) f();
    this.unlockListeners = [];
    if (this.ambientWanted !== 'off') this.setAmbient(this.ambientWanted);
  }

  setVolumes(v: Volumes): void {
    this.volumes = { ...v };
    this.applyVolumes();
  }

  private applyVolumes(): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(this.volumes.master, t, 0.02);
    this.buses.voice.gain.setTargetAtTime(this.volumes.voice, t, 0.02);
    this.buses.sfx.gain.setTargetAtTime(this.volumes.sfx, t, 0.02);
    this.buses.ambient.gain.setTargetAtTime(this.volumes.ambient, t, 0.02);
  }

  /** Fetch raw bytes for all sfx + ambience in the background. */
  async preloadSfx(): Promise<void> {
    if (!this.enabled) return;
    const m = this.assets.manifest.audio;
    const list = [...Object.values(m.sfx).map((s) => s.src), ...Object.values(m.ambient).map((a) => a.src)];
    await Promise.all(list.map((rel) => this.fetchRaw(rel)));
  }

  async preloadVoice(persona: PersonaId): Promise<void> {
    if (!this.enabled) return;
    const v = this.assets.manifest.audio.voice[persona] ?? {};
    await Promise.all(Object.values(v).map((rel) => this.fetchRaw(rel)));
    if (this.ctx) await Promise.all(Object.values(v).map((rel) => this.buffer(rel)));
  }

  private async fetchRaw(rel: string): Promise<void> {
    if (this.raw.has(rel) || this.buffers.has(rel)) return;
    const b = await this.assets.fetchAudio(rel);
    if (b) this.raw.set(rel, b);
    else this.buffers.set(rel, null);
  }

  private buffer(rel: string): Promise<AudioBuffer | null> {
    if (this.buffers.has(rel)) return Promise.resolve(this.buffers.get(rel)!);
    const p0 = this.decoding.get(rel);
    if (p0) return p0;
    const raw = this.raw.get(rel);
    if (!raw || !this.ctx) return Promise.resolve(null);
    const p = this.ctx.decodeAudioData(raw.slice(0)).then(
      (buf) => { this.buffers.set(rel, buf); this.raw.delete(rel); return buf; },
      () => { this.buffers.set(rel, null); return null; },
    );
    this.decoding.set(rel, p);
    return p;
  }

  private bufferSync(rel: string): AudioBuffer | null {
    const b = this.buffers.get(rel);
    if (b !== undefined) return b;
    if (this.raw.has(rel)) void this.buffer(rel);
    return null;
  }

  private logMissing(id: string): void {
    if (this.missingLogged.has(id)) return;
    this.missingLogged.add(id);
    console.info('[audio] missing', id);
  }

  /** Play a one-shot sfx. Returns immediately if missing. */
  play(id: SfxId, opts: { rate?: number; volume?: number; minGapMs?: number; delayMs?: number } = {}): void {
    if (!this.enabled || !this.ctx) return;
    const entry = this.assets.manifest.audio.sfx[id];
    if (!entry) { this.logMissing(id); return; }
    const now = performance.now();
    if (opts.minGapMs) {
      const last = this.lastPlayed.get(id) ?? -Infinity;
      if (now - last < opts.minGapMs) return;
    }
    const buf = this.bufferSync(entry.src);
    if (!buf) {
      if (!this.raw.has(entry.src)) this.logMissing(id);
      return;
    }
    this.lastPlayed.set(id, now);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = opts.rate ?? 1;
    const g = this.ctx.createGain();
    g.gain.value = entry.volume * (opts.volume ?? 1);
    src.connect(g).connect(this.buses.sfx);
    src.start(this.ctx.currentTime + (opts.delayMs ?? 0) / 1000);
  }

  /** Play a voice line; returns its duration in ms (0 if missing) and a stop handle. */
  playVoice(persona: PersonaId, lineId: string, rate: number): { durationMs: number; stop(fadeMs: number): void } {
    const none = { durationMs: 0, stop: () => {} };
    if (!this.enabled || !this.ctx) return none;
    const rel = this.assets.manifest.audio.voice[persona]?.[lineId];
    if (!rel) { this.logMissing(`voice/${persona}/${lineId}`); return none; }
    const buf = this.bufferSync(rel);
    if (!buf) {
      if (!this.raw.has(rel)) this.logMissing(`voice/${persona}/${lineId}`);
      return none;
    }
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = rate;
    const g = ctx.createGain();
    g.gain.value = 1;
    src.connect(g).connect(this.buses.voice);
    src.start();
    const durationMs = (buf.duration / rate) * 1000;
    this.duck(durationMs);
    return {
      durationMs,
      stop: (fadeMs: number) => {
        const t = ctx.currentTime;
        g.gain.cancelScheduledValues(t);
        g.gain.setValueAtTime(g.gain.value, t);
        g.gain.linearRampToValueAtTime(0, t + fadeMs / 1000);
        try { src.stop(t + fadeMs / 1000 + 0.01); } catch { /* already stopped */ }
      },
    };
  }

  /** Duck the ambience to 60% for the duration (200 ms ramps). */
  duck(durationMs: number): void {
    if (!this.ctx) return;
    const g = this.duckGain.gain;
    const t = this.ctx.currentTime;
    g.cancelScheduledValues(t);
    g.setValueAtTime(g.value, t);
    g.linearRampToValueAtTime(0.6, t + 0.2);
    g.setValueAtTime(0.6, t + 0.2 + durationMs / 1000);
    g.linearRampToValueAtTime(1, t + 0.4 + durationMs / 1000);
  }

  /** Ambient loops: 'normal' = both loops, 'shop' = konoba at 50% + cicadas. */
  setAmbient(mode: 'off' | 'normal' | 'shop'): void {
    this.ambientWanted = mode;
    if (!this.enabled || !this.ctx) return;
    const ctx = this.ctx;
    const amb = this.assets.manifest.audio.ambient;
    const want: { id: string; vol: number }[] = mode === 'off' ? [] : [
      { id: 'konoba', vol: amb.konoba.volume * (mode === 'shop' ? 0.5 : 1) },
      { id: 'cicadas', vol: amb.cicadas.volume },
    ];
    // fade out nodes not wanted
    for (const n of this.ambientNodes.slice()) {
      const w = want.find((x) => x.id === n.id);
      if (!w) {
        const t = ctx.currentTime;
        n.gain.gain.setTargetAtTime(0, t, 0.3);
        try { n.src.stop(t + 1.5); } catch { /* noop */ }
        this.ambientNodes = this.ambientNodes.filter((x) => x !== n);
      } else {
        n.gain.gain.setTargetAtTime(w.vol, ctx.currentTime, 0.4);
      }
    }
    for (const w of want) {
      if (this.ambientNodes.some((n) => n.id === w.id)) continue;
      const rel = amb[w.id as 'konoba'].src;
      void this.buffer(rel).then((buf) => {
        if (!buf) { this.logMissing(`ambient_${w.id}`); return; }
        if (this.ambientWanted === 'off' || this.ambientNodes.some((n) => n.id === w.id)) return;
        const src = ctx.createBufferSource();
        src.buffer = buf;
        src.loop = true;
        const g = ctx.createGain();
        g.gain.value = 0;
        src.connect(g).connect(this.buses.ambient);
        src.start();
        g.gain.setTargetAtTime(w.vol, ctx.currentTime, 0.6);
        this.ambientNodes.push({ src, gain: g, id: w.id });
      });
    }
  }

  /** Make sure decoded buffers exist (after unlock). */
  async decodeAll(): Promise<void> {
    if (!this.ctx) return;
    await Promise.all([...this.raw.keys()].map((rel) => this.buffer(rel)));
  }
}
