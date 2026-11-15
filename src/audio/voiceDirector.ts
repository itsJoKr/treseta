// Voice director (§9.5). No DOM: the speak sink and clock are injected.
import { VOICE_EVENTS } from '../data/voiceEvents';
import type { VoiceEventCfg, VoiceEventType } from '../data/voiceEvents';
import { VOICE_BY_ID } from '../data/voiceLines';
import type { VoiceLine, VoiceLineId } from '../data/voiceLines';
import type { Rng } from '../game/rng';
import type { PersonaId } from '../game/types';
import type { VoiceArbiter } from './voiceArbiter';

export interface SpeakHandle {
  /** Audio duration in ms, or 0 when no audio is available. */
  durationMs: number;
  stop(fadeMs: number): void;
}

export interface DirectorDeps<T extends string = VoiceEventType> {
  now(): number;
  rng: Rng;
  persona: PersonaId;
  cussMult: number;
  /** Plays audio + bubble + portrait reaction. */
  say(line: VoiceLine, priority: number): SpeakHandle;
  /** Partneri (§18.7.1): shared gap/cap/mouth. Without it, the §9.5 Dvoboj rules apply unchanged. */
  arbiter?: VoiceArbiter;
  /** speaker id used by the arbiter's per-speaker cap (e.g. the seat) */
  speaker?: string;
  /** custom event table (defaults to the §9.4 VOICE_EVENTS) */
  events?: Record<T, VoiceEventCfg<T>>;
}

export interface EventCtx { lines?: VoiceLineId[]; p?: number; /** skip the global gap (the argument reply, §18.7.4) */ ignoreGap?: boolean }

export const GLOBAL_GAP_MS = 3500;
export const PER_HAND_CAP = 8;
export const NO_AUDIO_HOLD_MS = 2200;

export class VoiceDirector<T extends string = VoiceEventType> {
  private lastLineEndAt = -Infinity;
  private playingUntil = -Infinity;
  private current: SpeakHandle | null = null;
  private lastFiredAt: Partial<Record<T, number>> = {};
  private recent: VoiceLineId[] = [];
  linesThisHand = 0;
  enabled = true;
  log: { type: T; line: VoiceLineId; at: number }[] = [];

  constructor(private deps: DirectorDeps<T>) {}

  get persona(): PersonaId { return this.deps.persona; }

  newHand(): void { this.linesThisHand = 0; }

  isPlaying(): boolean { return this.deps.arbiter ? this.deps.arbiter.isPlaying() : this.deps.now() < this.playingUntil; }

  onEvent(type: T, ctx?: EventCtx): VoiceLineId | null {
    if (!this.enabled) return null;
    const table = (this.deps.events ?? VOICE_EVENTS) as Record<string, VoiceEventCfg<string>>;
    const cfg = table[type];
    if (!cfg) return null;
    const now = this.deps.now();
    const arb = this.deps.arbiter;
    if (arb) {
      if (!arb.allows(this.deps.speaker ?? '', cfg.priority, ctx?.ignoreGap)) return null;
    } else if (cfg.priority < 3) {
      if (!ctx?.ignoreGap && now - this.lastLineEndAt < GLOBAL_GAP_MS) return null;
      if (this.isPlaying()) return null;
      if (this.linesThisHand >= PER_HAND_CAP) return null;
    }
    const last = this.lastFiredAt[type];
    if (cfg.cooldown > 0 && last !== undefined && now - last < cfg.cooldown) return null;
    const p = Math.min(1, (ctx?.p ?? cfg.p) * this.deps.cussMult);
    if (this.deps.rng() > p) return null;
    const persona = this.deps.persona;
    let pool = (ctx?.lines ?? cfg.lines).filter((id) => VOICE_BY_ID[id].personas.includes(persona));
    if (pool.length === 0) return null;
    const recent = arb ? arb.recent : this.recent;
    const fresh = pool.filter((id) => !recent.includes(id));
    if (fresh.length > 0) pool = fresh;
    const exclusive = pool.filter((id) => VOICE_BY_ID[id].exclusive);
    let id: VoiceLineId;
    if (exclusive.length > 0 && this.deps.rng() < 0.5) id = exclusive[Math.floor(this.deps.rng() * exclusive.length) % exclusive.length];
    else id = pool[Math.floor(this.deps.rng() * pool.length) % pool.length];
    if (!this.speak(VOICE_BY_ID[id], cfg.priority)) return null;
    this.lastFiredAt[type] = now;
    this.log.push({ type, line: id, at: now });
    return id;
  }

  private speak(line: VoiceLine, priority: number): boolean {
    const now = this.deps.now();
    const arb = this.deps.arbiter;
    if (arb) {
      const h = arb.speak(this.deps.speaker ?? '', line, priority, () => this.deps.say(line, priority));
      if (!h) return false;
      this.current = h;
      this.linesThisHand += 1;
      return true;
    }
    if (this.isPlaying()) {
      if (priority === 3 && this.current) this.current.stop(80);
      else return false;
    }
    const h = this.deps.say(line, priority);
    this.current = h;
    const dur = h.durationMs > 0 ? h.durationMs : NO_AUDIO_HOLD_MS;
    this.playingUntil = now + dur;
    this.lastLineEndAt = now + dur;
    this.linesThisHand += 1;
    this.recent.push(line.id);
    if (this.recent.length > 3) this.recent.shift();
    return true;
  }
}
