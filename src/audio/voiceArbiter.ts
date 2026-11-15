// Shared voice arbitration for Partneri (§18.7.1): one "mouth" for all three speakers,
// a global gap, per-hand caps (total and per speaker) and a table-wide no-repeat window.
// No DOM; the clock is injected.
import type { VoiceLine, VoiceLineId } from '../data/voiceLines';
import type { SpeakHandle } from './voiceDirector';

export interface ArbiterCfg {
  gapMs: number;
  capTotal: number;
  capPerSpeaker: number;
  /** how many of the last table-wide lines a speaker avoids repeating */
  recentWindow: number;
  /** hold time when a line has no audio */
  noAudioHoldMs: number;
}

export const ARBITER4: ArbiterCfg = { gapMs: 2500, capTotal: 9, capPerSpeaker: 4, recentWindow: 3, noAudioHoldMs: 2200 };

export interface ArbiterLogEntry { speaker: string; line: VoiceLineId; at: number; priority: number; endsAt: number }

export class VoiceArbiter {
  lastLineEndAt = -Infinity;
  playingUntil = -Infinity;
  private current: { speaker: string; handle: SpeakHandle; line: VoiceLine } | null = null;
  linesThisHand = 0;
  perSpeaker: Record<string, number> = {};
  recent: VoiceLineId[] = [];
  log: ArbiterLogEntry[] = [];

  constructor(private now: () => number, readonly cfg: ArbiterCfg = ARBITER4) {}

  newHand(): void { this.linesThisHand = 0; this.perSpeaker = {}; }

  isPlaying(): boolean { return this.now() < this.playingUntil; }

  /** The line currently in the mouth (undefined when silent). */
  speaking(): { speaker: string; line: VoiceLine } | undefined {
    return this.current && this.isPlaying() ? { speaker: this.current.speaker, line: this.current.line } : undefined;
  }

  /** Gap / mouth / caps check. Priority 3 bypasses all of them. */
  allows(speaker: string, priority: number, ignoreGap = false): boolean {
    if (priority >= 3) return true;
    const now = this.now();
    if (!ignoreGap && now - this.lastLineEndAt < this.cfg.gapMs) return false;
    if (this.isPlaying()) return false;
    if (this.linesThisHand >= this.cfg.capTotal) return false;
    if ((this.perSpeaker[speaker] ?? 0) >= this.cfg.capPerSpeaker) return false;
    return true;
  }

  /** Starts a line through `start` (audio + bubble). Returns null when the mouth is busy. */
  speak(speaker: string, line: VoiceLine, priority: number, start: () => SpeakHandle): SpeakHandle | null {
    const now = this.now();
    if (this.isPlaying()) {
      if (priority === 3 && this.current) this.current.handle.stop(80);
      else return null;
    }
    const h = start();
    const dur = h.durationMs > 0 ? h.durationMs : this.cfg.noAudioHoldMs;
    this.current = { speaker, handle: h, line };
    this.playingUntil = now + dur;
    this.lastLineEndAt = now + dur;
    this.linesThisHand += 1;
    this.perSpeaker[speaker] = (this.perSpeaker[speaker] ?? 0) + 1;
    this.recent.push(line.id);
    while (this.recent.length > this.cfg.recentWindow) this.recent.shift();
    this.log.push({ speaker, line: line.id, at: now, priority, endsAt: now + dur });
    return h;
  }
}
