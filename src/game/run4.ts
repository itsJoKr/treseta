// Partneri run state (§18.4 with §19.1 numbers): partner pick, unlocks, rewards, marks and
// forgeries, discount. Shop functions are shared with Dvoboj (run.ts).
import { standardDeck } from './cards';
import { CHARACTERS } from './characters';
import type { CharacterId } from './characters';
import { applyMatchMods } from './forge';
import { PAIRS, START_UNLOCKED, unlockedAt, validPartners } from './ladder4';
import { canMove as canMoveShared, LAST_MATCH, matchReward, movePrice as movePriceShared, moveUkras as moveShared, newShop, REVANS_TOKENS, START_RAKIJA, START_SOLDI } from './run';
import type { RunStats, ShopState } from './run';
import type { DeckCard, ForaId } from './types';
import type { Perks4, Seat, Team } from './types4';
import { SEATS_CW } from './types4';

export { MAX_MOVES, MOVE_PRICE } from './run';

export type ShopState4 = ShopState;
export interface Match4Save { scores: Record<Team, number>; handNo: number; dealer: Seat; akuzaPointsMi: number }

export interface RunState4 {
  version: 2;
  mode: 'partneri';
  seed: string;
  ladderIndex: number; // 0..5
  deck: DeckCard[];
  fore: ForaId[];
  rakijaBase: number; // 2..4
  casicaBought: number;
  soldi: number;
  revans: number; // 0..2
  status: 'map' | 'pick' | 'intro' | 'match' | 'shop' | 'won' | 'lost' | 'lostOffer';
  shop?: ShopState4;
  match?: Match4Save;
  stats: RunStats;
  attempt: number;
  partner?: CharacterId;
  unlocked: CharacterId[];
  discount: 0 | 1;
  lastReward?: { base: number; margin: number; akuze: number; total: number };
  lastScores?: Record<Team, number>;
}

function clone<T>(x: T): T { return structuredClone(x); }

export function newRun4(seed: string, now: number, opts?: { start?: number }): RunState4 {
  const start = Math.max(0, Math.min(LAST_MATCH, opts?.start ?? 0));
  return {
    version: 2, mode: 'partneri', seed, ladderIndex: start, deck: standardDeck(), fore: ['pogled'],
    rakijaBase: START_RAKIJA, casicaBought: 0, soldi: opts?.start ? 30 : START_SOLDI, revans: REVANS_TOKENS, status: 'map',
    stats: { matchesWon: 0, totalPoints: 0, akuzeDeclared: 0, soldiEarned: 0, startedAt: now },
    attempt: 0, unlocked: start ? unlockedAt(start) : START_UNLOCKED.slice(), discount: 0,
  };
}

export function partnerChoices(run: RunState4): CharacterId[] { return validPartners(run.unlocked, run.ladderIndex); }

export function pickPartner(run: RunState4, id: CharacterId): RunState4 {
  if (!partnerChoices(run).includes(id)) throw new Error(`${id} is not a valid partner here`);
  const r = clone(run);
  r.partner = id;
  r.status = 'intro';
  return r;
}

export function setStatus4(run: RunState4, status: RunState4['status']): RunState4 {
  const r = clone(run);
  r.status = status;
  return r;
}

/** §19.1.1: hand 1 of match i is dealt by SEATS_CW[(3 + i) % 4] (match 1: E, so S leads). */
export function firstDealer4(ladderIndex: number): Seat { return SEATS_CW[(3 + ladderIndex) % 4]; }

export function beginMatch4(run: RunState4): RunState4 {
  if (!run.partner) throw new Error('no partner picked');
  const r = clone(run);
  r.status = 'match';
  r.match = { scores: { mi: 0, vi: 0 }, handNo: 1, dealer: firstDealer4(r.ladderIndex), akuzaPointsMi: 0 };
  return r;
}

export function saveMatch4(run: RunState4, m: Match4Save): RunState4 {
  const r = clone(run);
  r.match = { ...m, scores: { ...m.scores } };
  return r;
}

/** The 40-card table deck for this match: Mi ukrasi/forgeries + this match's Vi marks/forgeries (§19.1.3). */
export function matchDeck(run: RunState4): DeckCard[] {
  const pair = PAIRS[run.ladderIndex];
  return applyMatchMods(run.deck, pair, run.seed, 'partneri', run.ladderIndex, run.attempt);
}

/** Šarane karte of the current match (cards with a Vi ukras). */
export function matchMarks(run: RunState4): DeckCard[] { return matchDeck(run).filter((c) => c.ukrasTeam === 'vi' && c.ukras); }
export function matchForgeries(run: RunState4): DeckCard[] { return matchDeck(run).filter((c) => c.forge && c.forge.team === 'vi'); }

export function perksFor(run: RunState4): Perks4 {
  const perk = run.partner ? CHARACTERS[run.partner].perk : null;
  return { akuzaBonusMi: perk === 'brzi_jezik' ? 1 : 0, ultimaBonusMi: perk === 'zidar' ? 1 : 0, revealEachHand: perk === 'postar' };
}

export function matchSetup4(run: RunState4): { fore: Record<Seat, ForaId[]>; rakija: Record<Seat, number>; perks: Perks4 } {
  const pair = PAIRS[run.ladderIndex];
  const sarmer = run.partner && CHARACTERS[run.partner].perk === 'sarmer' ? 1 : 0;
  return {
    fore: { S: run.fore.slice(), N: [], W: pair.fore.W.slice(), E: pair.fore.E.slice() },
    rakija: { S: Math.min(5, run.rakijaBase + sarmer), N: 0, W: pair.rakija.W, E: pair.rakija.E },
    perks: perksFor(run),
  };
}

export function reward4(ladderIndex: number, margin: number, akuzaMi: number): { base: number; margin: number; akuze: number; total: number } {
  return matchReward(PAIRS[ladderIndex].base, margin, akuzaMi);
}

export function onMatchWon4(run: RunState4, scores: Record<Team, number>, akuzaMi: number, now: number): RunState4 {
  const r = clone(run);
  const rew = reward4(r.ladderIndex, scores.mi - scores.vi, akuzaMi);
  r.soldi += rew.total;
  r.stats.soldiEarned += rew.total;
  r.stats.matchesWon += 1;
  r.stats.totalPoints += scores.mi;
  r.lastReward = rew;
  r.lastScores = { ...scores };
  r.match = undefined;
  const pair = PAIRS[r.ladderIndex];
  for (const c of [pair.W, pair.E]) if (!r.unlocked.includes(c)) r.unlocked.push(c);
  if (r.ladderIndex >= LAST_MATCH) {
    r.status = 'won';
    r.stats.endedAt = now;
  } else {
    r.discount = r.partner && CHARACTERS[r.partner].perk === 'na_crtu' ? 1 : 0;
    r.status = 'shop';
    r.shop = newShop(r, r.ladderIndex + 1, r.discount);
  }
  return r;
}

export function onMatchLost4(run: RunState4, scores: Record<Team, number>, now: number): RunState4 {
  const r = clone(run);
  r.stats.totalPoints += scores.mi;
  r.match = undefined;
  r.lastReward = undefined;
  r.lastScores = { ...scores };
  if (r.revans > 0) r.status = 'lostOffer';
  else { r.status = 'lost'; r.stats.endedAt = now; }
  return r;
}

/** Revanš: spend a token, replay the same match (same pair, same partner, same first dealer). */
export function takeRevans4(run: RunState4): RunState4 {
  if (run.revans <= 0) throw new Error('no revanš left');
  const r = clone(run);
  r.revans -= 1;
  r.attempt += 1;
  r.status = 'intro';
  return r;
}

export function giveUp4(run: RunState4, now: number): RunState4 {
  const r = clone(run);
  r.status = 'lost';
  r.stats.endedAt = now;
  return r;
}

export function movePrice(run: RunState4): number { return movePriceShared(run); }
export function canMove(run: RunState4): ReturnType<typeof canMoveShared> { return canMoveShared(run); }
export function moveUkras(run: RunState4, fromKey: string, toKey: string): RunState4 { return moveShared(run, fromKey, toKey); }

export function leaveShop4(run: RunState4): RunState4 {
  const r = clone(run);
  r.shop = undefined;
  r.ladderIndex = Math.min(LAST_MATCH, r.ladderIndex + 1);
  r.attempt = 0;
  r.partner = undefined;
  r.discount = 0;
  r.status = 'map';
  return r;
}

export function recordAkuze4(run: RunState4, n: number): RunState4 {
  const r = clone(run);
  r.stats.akuzeDeclared += n;
  return r;
}

export function addSoldi4(run: RunState4, n: number): RunState4 {
  const r = clone(run);
  r.soldi += n;
  r.stats.soldiEarned += n;
  return r;
}
