// Forgeries and card identity (§19.4). A card's identity is computed for whoever holds or
// plays it: the forge copy if the holder's team is the forgery's beneficiary, else the
// printed (slot) identity. Hands store cards in their holder's identity; `slot` keeps the
// printed key and `forge` the copy, so the renderer can show stamps and tags.
import { cardKey, RANKS, SUITS } from './cards';
import { rngFor } from './rng';
import type { DeckCard, Rank, Suit, TeamId, UkrasId } from './types';

export const MAX_FORGES = 4;
export const LISINE: Rank[] = ['7', '6', '5', '4'];
export const FORGE_TARGET_RANKS: Rank[] = ['3', '2', 'A'];

export function slotOf(c: DeckCard): string { return c.slot ?? cardKey(c); }

export function printedOf(c: DeckCard): { suit: Suit; rank: Rank } {
  const [suit, rank] = slotOf(c).split('_') as [Suit, Rank];
  return { suit, rank };
}

/** The card as seen by a holder of `team` (identity fixed while held / when played). */
export function identFor<T extends DeckCard>(c: T, team: TeamId): T {
  const p = printedOf(c);
  if (c.forge && c.forge.team === team) return { ...c, slot: slotOf(c), suit: c.forge.suit, rank: c.forge.rank };
  return { ...c, slot: slotOf(c), suit: p.suit, rank: p.rank };
}

/** Rendering state of a forged card in its current identity. */
export function forgeView(c: DeckCard): null | { team: TeamId; copy: boolean } {
  if (!c.forge) return null;
  const copy = c.suit === c.forge.suit && c.rank === c.forge.rank && slotOf(c) !== cardKey(c);
  return { team: c.forge.team, copy };
}

export function forgeCount(deck: DeckCard[], team: TeamId = 'mi'): number { return deck.filter((c) => c.forge && c.forge.team === team).length; }

export function canForge(deck: DeckCard[], key: string): boolean {
  const c = deck.find((d) => slotOf(d) === key);
  if (!c) return false;
  return LISINE.includes(printedOf(c).rank) && !c.ukras && !c.forge && forgeCount(deck) < MAX_FORGES;
}

export function forgeTargets(): { suit: Suit; rank: Rank }[] {
  const out: { suit: Suit; rank: Rank }[] = [];
  for (const rank of FORGE_TARGET_RANKS) for (const suit of SUITS) out.push({ suit, rank });
  return out;
}

/** Falsa karta: permanently forge a lišina of the deck into a copy of a strong identity. */
export function forgeInDeck(deck: DeckCard[], key: string, target: { suit: Suit; rank: Rank }, team: TeamId = 'mi'): DeckCard[] {
  if (!canForge(deck, key)) throw new Error('cannot forge ' + key);
  if (!FORGE_TARGET_RANKS.includes(target.rank)) throw new Error('target must be a 3, 2 or A');
  return deck.map((c) => (slotOf(c) === key ? { ...c, slot: key, forge: { suit: target.suit, rank: target.rank, team } } : c));
}

export interface MatchMods { marks: { ukras: UkrasId; rank: Rank }[]; forgeries: Rank[] }

/**
 * Per-match Vi marks and forgeries (§19.1.3), seeded by rngFor(seed,'marks',mode,ladderIndex,attempt).
 * They go only on cards with no ukras and no forgery; forgeries on lišine. Temporary: the
 * returned deck is for this match only.
 */
export function applyMatchMods(deck: DeckCard[], mods: MatchMods, seed: string, mode: string, ladderIndex: number, attempt: number): DeckCard[] {
  const rng = rngFor(seed, 'marks', mode, ladderIndex, attempt);
  const out = deck.map((c) => ({ ...c, slot: slotOf(c), ukrasTeam: c.ukras ? ('mi' as TeamId) : undefined }));
  const free = (c: DeckCard) => !c.ukras && !c.forge;
  const pick = <T,>(a: T[]): T => a[Math.floor(rng() * a.length) % a.length];
  for (const m of mods.marks) {
    let pool = out.filter((c) => free(c) && printedOf(c).rank === m.rank);
    if (!pool.length) pool = out.filter(free);
    if (!pool.length) continue;
    const c = pick(pool);
    c.ukras = m.ukras;
    c.ukrasTeam = 'vi';
  }
  for (const r of mods.forgeries) {
    const pool = out.filter((c) => free(c) && LISINE.includes(printedOf(c).rank));
    if (!pool.length) continue;
    const c = pick(pool);
    c.forge = { suit: pick(SUITS), rank: r, team: 'vi' };
  }
  void RANKS;
  return out;
}
