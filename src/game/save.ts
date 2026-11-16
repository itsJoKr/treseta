// Serialise / deserialise (§16.6). Storage is injected so tests can use a map.
import type { RunState } from './run';
import type { RunState4 } from './run4';
import { sameSuitForges } from './forge';

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** §19.8: version-2 run saves per mode; the v1 keys are deleted on startup. */
export const SAVE_KEY = 'treseta.save.v2';
export const OLD_SAVE_KEYS = ['treseta.save.v1', 'treseta.save.partneri.v1'];
export const SETTINGS_KEY = 'treseta.settings.v1';
export const STATS_KEY = 'treseta.stats.v1';

export interface SaveFile { version: 2; run: RunState }

export interface Settings {
  language: 'hr' | 'en';
  subtitles: boolean;
  fast: boolean;
  volumes: { master: number; voice: number; sfx: number; ambient: number };
  tipsSeen: string[];
  /** §19.5.1 Odigrano tracker panel state */
  trackerOpen?: boolean;
}

export interface Stats { runsStarted: number; runsWon: number; bestLadder: number; bestRunSoldi: number }

export function memoryStorage(): StorageLike & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k) => (data.has(k) ? data.get(k)! : null),
    setItem: (k, v) => { data.set(k, v); },
    removeItem: (k) => { data.delete(k); },
  };
}

export function saveRun(storage: StorageLike, run: RunState): void {
  const file: SaveFile = { version: 2, run };
  storage.setItem(SAVE_KEY, JSON.stringify(file));
}

export type LoadResult = { ok: true; run: RunState } | { ok: false; reason: 'none' | 'version' | 'corrupt' };

export function loadRun(storage: StorageLike): LoadResult {
  const raw = storage.getItem(SAVE_KEY);
  if (!raw) return { ok: false, reason: 'none' };
  try {
    const f = JSON.parse(raw) as Partial<SaveFile>;
    if (f.version !== 2 || !f.run || f.run.version !== 2) {
      storage.removeItem(SAVE_KEY);
      return { ok: false, reason: 'version' };
    }
    return { ok: true, run: { ...f.run, deck: sameSuitForges(f.run.deck) } };
  } catch {
    storage.removeItem(SAVE_KEY);
    return { ok: false, reason: 'corrupt' };
  }
}

export function clearRun(storage: StorageLike): void { storage.removeItem(SAVE_KEY); }

export function defaultSettings(navLang: string): Settings {
  const hr = navLang.toLowerCase().startsWith('hr');
  return {
    // Croatian is the game's language for everyone; other browsers still get the English glosses
    language: 'hr',
    subtitles: !hr,
    fast: false,
    volumes: { master: 0.8, voice: 1.0, sfx: 0.8, ambient: 0.5 },
    tipsSeen: [],
  };
}

export function loadSettings(storage: StorageLike, navLang: string): Settings {
  const d = defaultSettings(navLang);
  const raw = storage.getItem(SETTINGS_KEY);
  if (!raw) return d;
  try {
    const s = JSON.parse(raw) as Partial<Settings>;
    return {
      language: s.language === 'hr' || s.language === 'en' ? s.language : d.language,
      subtitles: typeof s.subtitles === 'boolean' ? s.subtitles : d.subtitles,
      fast: typeof s.fast === 'boolean' ? s.fast : d.fast,
      volumes: { ...d.volumes, ...(s.volumes ?? {}) },
      tipsSeen: Array.isArray(s.tipsSeen) ? s.tipsSeen : [],
    };
  } catch {
    return d;
  }
}

export function saveSettings(storage: StorageLike, s: Settings): void {
  storage.setItem(SETTINGS_KEY, JSON.stringify(s));
}

export function loadStats(storage: StorageLike): Stats {
  const d: Stats = { runsStarted: 0, runsWon: 0, bestLadder: 0, bestRunSoldi: 0 };
  const raw = storage.getItem(STATS_KEY);
  if (!raw) return d;
  try { return { ...d, ...(JSON.parse(raw) as Partial<Stats>) }; } catch { return d; }
}

export function saveStats(storage: StorageLike, s: Stats): void {
  storage.setItem(STATS_KEY, JSON.stringify(s));
}

// ---------------- Partneri (separate keys, §18.9) ----------------

export const SAVE4_KEY = 'treseta.save.partneri.v2';
export const STATS4_KEY = 'treseta.stats.partneri.v1';

export function saveRun4(storage: StorageLike, run: RunState4): void {
  storage.setItem(SAVE4_KEY, JSON.stringify({ version: 2, run }));
}

export type LoadResult4 = { ok: true; run: RunState4 } | { ok: false; reason: 'none' | 'version' | 'corrupt' };

export function loadRun4(storage: StorageLike): LoadResult4 {
  const raw = storage.getItem(SAVE4_KEY);
  if (!raw) return { ok: false, reason: 'none' };
  try {
    const f = JSON.parse(raw) as { version?: number; run?: RunState4 };
    if (f.version !== 2 || !f.run || f.run.version !== 2 || f.run.mode !== 'partneri') {
      storage.removeItem(SAVE4_KEY);
      return { ok: false, reason: 'version' };
    }
    return { ok: true, run: { ...f.run, deck: sameSuitForges(f.run.deck) } };
  } catch {
    storage.removeItem(SAVE4_KEY);
    return { ok: false, reason: 'corrupt' };
  }
}

export function clearRun4(storage: StorageLike): void { storage.removeItem(SAVE4_KEY); }

export function loadStats4(storage: StorageLike): Stats {
  const d: Stats = { runsStarted: 0, runsWon: 0, bestLadder: 0, bestRunSoldi: 0 };
  const raw = storage.getItem(STATS4_KEY);
  if (!raw) return d;
  try { return { ...d, ...(JSON.parse(raw) as Partial<Stats>) }; } catch { return d; }
}

export function saveStats4(storage: StorageLike, s: Stats): void { storage.setItem(STATS4_KEY, JSON.stringify(s)); }

/** §19.8: delete old v1 saves; returns true if any was removed (toast once). */
export function removeOldSaves(storage: StorageLike): boolean {
  let removed = false;
  for (const k of OLD_SAVE_KEYS) if (storage.getItem(k) !== null) { storage.removeItem(k); removed = true; }
  return removed;
}

/** bestLadder is now 1–6 (clamp older values). */
export function clampStats(s: Stats): Stats { return { ...s, bestLadder: Math.max(0, Math.min(6, s.bestLadder)) }; }
