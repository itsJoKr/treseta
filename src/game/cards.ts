// Rank tables, strengths, thirds, deck builders, uid helpers (§3.1).
import type { CardInst, DeckCard, Rank, Side, Suit } from './types';

export const SUITS: Suit[] = ['kupe', 'bate', 'spade', 'dinari'];
/** Ranks in strength order, strongest first. */
export const RANKS: Rank[] = ['3', '2', 'A', 'K', 'C', 'F', '7', '6', '5', '4'];

export const BASE_STRENGTH: Record<Rank, number> = {
  '3': 10, '2': 9, A: 8, K: 7, C: 6, F: 5, '7': 4, '6': 3, '5': 2, '4': 1,
};
export const BASE_THIRDS: Record<Rank, number> = {
  '3': 1, '2': 1, A: 3, K: 1, C: 1, F: 1, '7': 0, '6': 0, '5': 0, '4': 0,
};
/** Triestine corner numeral. */
export const RANK_INDEX: Record<Rank, string> = {
  '3': '3', '2': '2', A: '', K: '13', C: '12', F: '11', '7': '7', '6': '6', '5': '5', '4': '4',
};
export const RANK_NAME_HR: Record<Rank, string> = {
  '3': 'trica', '2': 'duja', A: 'as', K: 'kralj', C: 'konj', F: 'fanat',
  '7': 'sedmica', '6': 'šestica', '5': 'petica', '4': 'četvorka',
};
export const RANK_NAME_EN: Record<Rank, string> = {
  '3': 'Three', '2': 'Two', A: 'Ace', K: 'King', C: 'Knight', F: 'Knave',
  '7': 'Seven', '6': 'Six', '5': 'Five', '4': 'Four',
};
export const SUIT_NAME: Record<Suit, string> = { kupe: 'Kupe', bate: 'Bate', spade: 'Špade', dinari: 'Dinari' };
export const SUIT_COLOR: Record<Suit, string> = {
  kupe: '#B5452B', bate: '#6B7A3A', spade: '#2F5D7C', dinari: '#D9A441',
};

export function rankFile(r: Rank): string { return r.toLowerCase(); }
export function cardKey(c: { suit: Suit; rank: Rank }): string { return `${c.suit}_${c.rank}`; }
export function cardFileKey(c: { suit: Suit; rank: Rank }): string { return `${c.suit}_${rankFile(c.rank)}`; }

export function makeUid(owner: Side, suit: Suit, rank: Rank): string {
  return `${owner === 'player' ? 'p' : 'b'}:${suit}_${rank}`;
}
export function parseUid(uid: string): { owner: Side; suit: Suit; rank: Rank } {
  const [o, rest] = uid.split(':');
  const [suit, rank] = rest.split('_') as [Suit, Rank];
  return { owner: o === 'p' ? 'player' : 'bot', suit, rank };
}
export function ownerOf(uid: string): Side { return uid.startsWith('p:') ? 'player' : 'bot'; }

export function standardDeck(): DeckCard[] {
  const d: DeckCard[] = [];
  for (const s of SUITS) for (const r of RANKS) d.push({ suit: s, rank: r });
  return d;
}

export function toInst(c: DeckCard, owner: Side): CardInst {
  const inst: CardInst = { suit: c.suit, rank: c.rank, uid: c.slot ? `${owner === 'player' ? 'p' : 'b'}:${c.slot}` : makeUid(owner, c.suit, c.rank), owner };
  if (c.ukras) inst.ukras = c.ukras;
  if (c.ukrasTeam) inst.ukrasTeam = c.ukrasTeam;
  if (c.slot) inst.slot = c.slot;
  if (c.forge) inst.forge = { ...c.forge };
  return inst;
}

/** Sort comparator for display: suit order, then strength descending. */
export function compareCards(a: { suit: Suit; rank: Rank }, b: { suit: Suit; rank: Rank }): number {
  const sd = SUITS.indexOf(a.suit) - SUITS.indexOf(b.suit);
  if (sd !== 0) return sd;
  return BASE_STRENGTH[b.rank] - BASE_STRENGTH[a.rank];
}

/** Format thirds as a mixed fraction: 4 -> "1⅓", 2 -> "⅔", 6 -> "2". */
export function fmtThirds(thirds: number): string {
  const neg = thirds < 0;
  const t = Math.abs(thirds);
  const whole = Math.floor(t / 3);
  const rem = t % 3;
  const frac = rem === 1 ? '⅓' : rem === 2 ? '⅔' : '';
  let s = whole > 0 || !frac ? `${whole}${frac}` : frac;
  if (whole === 0 && frac) s = frac;
  return (neg ? '−' : '') + s;
}
