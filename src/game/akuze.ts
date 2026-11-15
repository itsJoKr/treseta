// Akuže detection (§3.7) including Divlje (wild) and Glasno (loud).
import { SUIT_NAME, SUITS } from './cards';
import type { AkuzaCombo, CardInst, Rank, Suit } from './types';
import { akuzaMod } from './ukrasi';

const KIND_RANKS: Rank[] = ['3', '2', 'A'];
const KIND_LABEL: Record<string, [string, string]> = {
  '3': ['TRI TRICE!', 'ČETIRI TRICE!'],
  '2': ['TRI DUJE!', 'ČETIRI DUJE!'],
  A: ['TRI AŠA!', 'ČETIRI AŠA!'],
};

interface Ident { card: CardInst; suit: Suit; rank: Rank; real: boolean }

export interface AkuzaResult {
  combos: AkuzaCombo[];
  total: number;
  declared: Record<string, number>;
}

function findIdent(ids: Ident[], suit: Suit, rank: Rank): Ident | undefined {
  // prefer the real card
  let best: Ident | undefined;
  for (const i of ids) {
    if (i.suit === suit && i.rank === rank) {
      if (i.real) return i;
      if (!best) best = i;
    }
  }
  return best;
}

function evaluate(ids: Ident[], declared: Record<string, number>): AkuzaResult {
  const combos: AkuzaCombo[] = [];
  const next = { ...declared };
  let total = 0;
  for (const s of SUITS) {
    const key = `napolitana:${s}`;
    if (next[key]) continue;
    const a = findIdent(ids, s, 'A');
    const d = findIdent(ids, s, '2');
    const t = findIdent(ids, s, '3');
    if (a && d && t) {
      const cards = [t.card, d.card, a.card];
      const g = akuzaMod(cards);
      const pts = 3 + g;
      combos.push({ key, label: `NAPOLITANA! ${SUIT_NAME[s]}`, points: pts, uids: cards.map((c) => c.uid), glasno: g || undefined });
      next[key] = 3;
      total += pts;
    }
  }
  for (const r of KIND_RANKS) {
    const key = `kind:${r}`;
    const found: Ident[] = [];
    for (const s of SUITS) {
      const i = findIdent(ids, s, r);
      if (i) found.push(i);
    }
    const n = found.length;
    if (n < 3) continue;
    const value = n >= 4 ? 4 : 3;
    const prev = next[key] ?? 0;
    const cards = found.map((f) => f.card);
    if (prev === 0) {
      const g = akuzaMod(cards);
      const pts = value + g;
      combos.push({ key, label: KIND_LABEL[r][value === 4 ? 1 : 0], points: pts, uids: cards.map((c) => c.uid), glasno: g || undefined });
      next[key] = value;
      total += pts;
    } else if (prev === 3 && value === 4) {
      combos.push({ key, label: KIND_LABEL[r][1], points: 1, uids: cards.map((c) => c.uid), upgrade: true });
      next[key] = 4;
      total += 1;
    }
  }
  return { combos, total, declared: next };
}

/**
 * Detect newly awarded akuže in `hand` given what was already declared.
 * Divlje cards take one identity each (real, 3, 2, A of own suit); the
 * assignment maximising new points wins; ties prefer real > 3 > 2 > A card by
 * card in hand order (lexicographic search order + strict improvement).
 */
export function detectNewAkuze(hand: CardInst[], declared: Record<string, number>): AkuzaResult {
  const wild = hand.filter((c) => c.ukras === 'divlje');
  const base: Ident[] = hand.filter((c) => c.ukras !== 'divlje').map((c) => ({ card: c, suit: c.suit, rank: c.rank, real: true }));
  if (wild.length === 0) return evaluate(base, declared);
  const options: (Rank | null)[] = [null, '3', '2', 'A'];
  let best: AkuzaResult | null = null;
  const w = wild.length;
  const totalAssign = Math.pow(4, w);
  for (let n = 0; n < totalAssign; n++) {
    // first wild card (hand order) is most significant digit
    const ids = base.slice();
    let rem = n;
    const digits: number[] = new Array(w);
    for (let k = w - 1; k >= 0; k--) { digits[k] = rem % 4; rem = Math.floor(rem / 4); }
    for (let k = 0; k < w; k++) {
      const c = wild[k];
      const o = options[digits[k]];
      ids.push({ card: c, suit: c.suit, rank: o ?? c.rank, real: o === null || o === c.rank });
    }
    // keep hand order for uid listing stability
    ids.sort((a, b) => hand.indexOf(a.card) - hand.indexOf(b.card));
    const r = evaluate(ids, declared);
    if (!best || r.total > best.total) best = r;
  }
  return best!;
}
