// Deterministic RNG (§16.5). mulberry32 + fnv1a.

export type Rng = () => number;

export function fnv1a(str: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export function mulberry32(seed32: number): Rng {
  let a = seed32 >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function rngFor(runSeed: string, ...parts: (string | number)[]): Rng {
  return mulberry32(fnv1a([runSeed, ...parts].join('|')));
}

export function pick<T>(rng: Rng, arr: readonly T[]): T {
  return arr[Math.floor(rng() * arr.length) % arr.length];
}

export function shuffle<T>(rng: Rng, arr: readonly T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function randomSeed(): string {
  const g = (globalThis as { crypto?: Crypto }).crypto;
  if (g && g.getRandomValues) {
    const b = new Uint32Array(2);
    g.getRandomValues(b);
    return b[0].toString(36) + b[1].toString(36);
  }
  return Math.floor(Math.random() * 1e12).toString(36);
}
