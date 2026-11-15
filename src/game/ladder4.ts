// Ladder of opponent pairs, opponent fore/rakija, marked cards, partner validity (§18.4.2–§18.4.3).
import { CHARACTERS } from './characters';
import type { CharacterId } from './characters';
import { PARTNERI_LADDER } from './ladders';
import type { PairDef } from './ladders';

export type { PairDef } from './ladders';
/** The 6-match Partneri ladder (§19.1.3). */
export const PAIRS: PairDef[] = PARTNERI_LADDER;

export const START_UNLOCKED: CharacterId[] = ['luka', 'ive', 'dino'];

/** Characters unlocked before match `ladderIndex` on the winning path. */
export function unlockedAt(ladderIndex: number): CharacterId[] {
  const out = START_UNLOCKED.slice();
  for (let i = 0; i < ladderIndex && i < PAIRS.length; i++) {
    for (const c of [PAIRS[i].W, PAIRS[i].E]) if (!out.includes(c)) out.push(c);
  }
  return out;
}

/** Valid partners for a match: unlocked, the match's free persona, not an opponent there. */
export function validPartners(unlocked: CharacterId[], ladderIndex: number): CharacterId[] {
  const pair = PAIRS[ladderIndex];
  return unlocked.filter((c) => CHARACTERS[c].persona === pair.partnerPersona && c !== pair.W && c !== pair.E && CHARACTERS[c].perk !== null);
}
