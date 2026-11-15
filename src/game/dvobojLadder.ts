// Dvoboj match opponents for the 6-match ladder (§19.1.3).
// ---------------- §19.1.3: Dvoboj ladder of 6, knobs from the match tier ----------------
import { CHARACTERS, cussMultFor } from './characters';
import { OPPONENTS } from './opponents';
import type { OpponentDef } from './opponents';
import type { OpponentId } from './types';
import type { CharacterId } from './characters';
import { DVOBOJ_LADDER } from './ladders';

const TIER_CHAR: Record<1 | 2 | 3 | 4, OpponentId> = { 1: 'tonci', 2: 'jure', 3: 'luka', 4: 'bepo' };

/** A Dvoboj match opponent: name/persona/voice from the character, knobs from the match tier. */
export interface DvobojOpponent extends Omit<OpponentDef, 'id' | 'deck'> { id: CharacterId; tier: 1 | 2 | 3 | 4 }

export function dvobojOpponent(ladderIndex: number): DvobojOpponent {
  const m = DVOBOJ_LADDER[Math.max(0, Math.min(DVOBOJ_LADDER.length - 1, ladderIndex))];
  const c = CHARACTERS[m.opp];
  const tierDef = OPPONENTS[TIER_CHAR[m.tier]];
  const own = (OPPONENTS as Partial<Record<CharacterId, OpponentDef>>)[m.opp];
  return {
    id: m.opp, tier: m.tier, name: c.name, konoba: m.konoba, bioEn: c.bioEn, bioHr: c.bioHr, persona: c.persona,
    playbackRate: own?.playbackRate ?? c.rate, difficulty: m.tier, baseReward: m.base, rakija: m.rakija, fore: m.fore.slice(),
    knobs: { ...tierDef.knobs }, cussMult: own?.cussMult ?? cussMultFor(m.opp),
  };
}
