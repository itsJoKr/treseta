// Run state, rewards, shop generation and purchases (§19.1–§19.2; both modes share the shop). PURE.
import { cardKey, standardDeck } from './cards';
import { canForge, forgeInDeck, forgeCount, LISINE, MAX_FORGES, printedOf, slotOf } from './forge';
import { FORA_IDS, FORE, START_ONLY_FORE } from './fore';
import { DVOBOJ_LADDER, MATCHES_PER_RUN, TIER_WEIGHTS } from './ladders';
import { rngFor } from './rng';
import type { Rng } from './rng';
import type { DeckCard, ForaId, OpponentId, Rank, Rarity, Side, Suit, UkrasId } from './types';
import { UKRAS_IDS, UKRASI } from './ukrasi';
import type { CharacterId } from './characters';

export const FORE_SLOTS = 4;
export const START_SOLDI = 6;
export const START_RAKIJA = 2;
export const MAX_RAKIJA_BASE = 4;
export const CASICA_PRICES = [8, 10];
export const FALSA_PRICE = 12;
export const MOVE_PRICE = 2;
export const MAX_MOVES = 2;
export const REVANS_TOKENS = 2;
export const LAST_MATCH = MATCHES_PER_RUN - 1;
/** kept for older imports */
export const CASICA_PRICE = CASICA_PRICES[0];

export type Mode = 'dvoboj' | 'partneri';

export type Offer =
  | { kind: 'ukras'; id: UkrasId; rarity: Rarity; price: number; sold: boolean }
  | { kind: 'fora'; id: ForaId; rarity: Rarity; price: number; sold: boolean }
  | { kind: 'casica'; rarity: Rarity; price: number; sold: boolean }
  | { kind: 'falsa'; rarity: Rarity; price: number; sold: boolean };

export interface ShopState { visit: number; rerolls: number; moves: number; offers: Offer[] }

export interface RunStats {
  matchesWon: number;
  totalPoints: number;
  akuzeDeclared: number;
  soldiEarned: number;
  startedAt: number;
  endedAt?: number;
  beatenBy?: OpponentId | CharacterId;
}

export interface MatchSave { scores: Record<Side, number>; handNo: number; dealer: Side; akuzaPointsPlayer: number; botMemory: null }

export interface RunState {
  version: 2;
  mode: 'dvoboj';
  seed: string;
  ladderIndex: number; // 0..5
  deck: DeckCard[];
  fore: ForaId[];
  rakijaBase: number; // 2..4
  casicaBought: number; // 0..2
  soldi: number;
  revans: number; // 0..2
  status: 'map' | 'intro' | 'match' | 'shop' | 'won' | 'lost' | 'lostOffer';
  shop?: ShopState;
  match?: MatchSave;
  stats: RunStats;
  attempt: number;
  lastReward?: { base: number; margin: number; akuze: number; total: number };
  lastScores?: Record<Side, number>;
}

/** Minimal run shape the shop needs (Dvoboj RunState and Partneri RunState4 both fit). */
export interface ShopRun {
  mode: Mode; seed: string; fore: ForaId[]; rakijaBase: number; casicaBought: number; soldi: number; deck: DeckCard[];
  shop?: ShopState; discount?: number;
}

function clone<T>(x: T): T { return structuredClone(x); }

export function newRun(seed: string, now: number, opts?: { start?: number }): RunState {
  const start = Math.max(0, Math.min(LAST_MATCH, opts?.start ?? 0));
  return {
    version: 2, mode: 'dvoboj', seed, ladderIndex: start, deck: standardDeck(), fore: ['pogled'],
    rakijaBase: START_RAKIJA, casicaBought: 0, soldi: opts?.start ? 30 : START_SOLDI, revans: REVANS_TOKENS, status: 'map',
    stats: { matchesWon: 0, totalPoints: 0, akuzeDeclared: 0, soldiEarned: 0, startedAt: now }, attempt: 0,
  };
}

export function currentOpponent(run: { ladderIndex: number }): CharacterId { return DVOBOJ_LADDER[run.ladderIndex].opp; }

/** §19.1.2: base(match) + min(6, final margin) + akuža points of the player's side. */
export function matchReward(base: number, finalMargin: number, akuzaPts: number): { base: number; margin: number; akuze: number; total: number } {
  const margin = Math.max(0, Math.min(6, finalMargin));
  return { base, margin, akuze: akuzaPts, total: base + margin + akuzaPts };
}

export function beginMatch(run: RunState): RunState {
  const r = clone(run);
  r.status = 'match';
  r.match = { scores: { player: 0, bot: 0 }, handNo: 1, dealer: r.ladderIndex % 2 === 0 ? 'bot' : 'player', akuzaPointsPlayer: 0, botMemory: null };
  return r;
}

export function saveMatchProgress(run: RunState, m: Omit<MatchSave, 'botMemory'>): RunState {
  const r = clone(run);
  r.match = { ...m, scores: { ...m.scores }, botMemory: null };
  return r;
}

export function addSoldi<R extends { soldi: number; stats: RunStats }>(run: R, n: number): R {
  const r = clone(run);
  r.soldi += n;
  r.stats.soldiEarned += n;
  return r;
}

export function newShop(run: ShopRun, visit: number, discount = 0): ShopState {
  return { visit, rerolls: 0, moves: 0, offers: discountOffers(generateOffers(run, visit, 0), discount) };
}

export function onMatchWon(run: RunState, finalScores: Record<Side, number>, akuzaPts: number, now: number): RunState {
  const r = clone(run);
  const rew = matchReward(DVOBOJ_LADDER[r.ladderIndex].base, finalScores.player - finalScores.bot, akuzaPts);
  r.soldi += rew.total;
  r.stats.soldiEarned += rew.total;
  r.stats.matchesWon += 1;
  r.stats.totalPoints += finalScores.player;
  r.lastReward = rew;
  r.lastScores = { ...finalScores };
  r.match = undefined;
  if (r.ladderIndex >= LAST_MATCH) {
    r.status = 'won';
    r.stats.endedAt = now;
  } else {
    r.status = 'shop';
    r.shop = newShop(r, r.ladderIndex + 1);
  }
  return r;
}

export function onMatchLost(run: RunState, finalScores: Record<Side, number>, now: number): RunState {
  const r = clone(run);
  r.stats.totalPoints += finalScores.player;
  r.match = undefined;
  r.lastReward = undefined;
  r.lastScores = { ...finalScores };
  if (r.revans > 0) r.status = 'lostOffer';
  else { r.status = 'lost'; r.stats.beatenBy = currentOpponent(r); r.stats.endedAt = now; }
  return r;
}

/** Revanš (§19.1.2): spend a token and replay the same match from 0:0 right away. */
export function takeRevans(run: RunState): RunState {
  if (run.revans <= 0) throw new Error('no revanš left');
  const r = clone(run);
  r.revans -= 1;
  r.attempt += 1;
  r.status = 'intro';
  return r;
}

export function giveUp(run: RunState, now: number): RunState {
  const r = clone(run);
  r.status = 'lost';
  r.stats.beatenBy = currentOpponent(r);
  r.stats.endedAt = now;
  return r;
}

export function recordAkuze<R extends { stats: RunStats }>(run: R, n: number): R {
  const r = clone(run);
  r.stats.akuzeDeclared += n;
  return r;
}

// ---------------- shop (§19.2) ----------------

const TIERS: Rarity[] = ['common', 'uncommon', 'rare'];
type OfferKind = Offer['kind'];
const TYPE_WEIGHT: Record<OfferKind, number> = { ukras: 50, fora: 35, casica: 10, falsa: 15 };

function weighted<T>(rng: Rng, weights: [T, number][]): T {
  const total = weights.reduce((a, [, w]) => a + w, 0);
  let x = rng() * total;
  for (const [k, w] of weights) {
    if (x < w) return k;
    x -= w;
  }
  return weights[weights.length - 1][0];
}

function tierOrder(t: number): number[] {
  const out = [t];
  for (let d = t - 1; d >= 0; d--) out.push(d);
  for (let u = t + 1; u < 3; u++) out.push(u);
  return out;
}

export function casicaPrice(run: { casicaBought: number }): number { return CASICA_PRICES[Math.min(run.casicaBought, CASICA_PRICES.length - 1)]; }

/** Offers for visit v (1..5), seeded rngFor(seed,'shop',mode,v,rerolls). */
export function generateOffers(run: Pick<ShopRun, 'mode' | 'seed' | 'fore' | 'casicaBought' | 'deck'>, visit: number, rerolls: number): Offer[] {
  const rng = rngFor(run.seed, 'shop', run.mode, visit, rerolls);
  const weights = TIER_WEIGHTS[Math.max(1, Math.min(5, visit))];
  const offers: Offer[] = [];
  const canFalsa = forgeCount(run.deck) < MAX_FORGES && run.deck.some((c) => LISINE.includes(printedOf(c).rank) && !c.ukras && !c.forge);
  for (let slot = 0; slot < 3; slot++) {
    const rolled = weighted<number>(rng, [[0, weights[0]], [1, weights[1]], [2, weights[2]]]);
    for (const ti of tierOrder(rolled)) {
      const tier = TIERS[ti];
      const ukr = UKRAS_IDS.filter((u) => UKRASI[u].rarity === tier && !offers.some((o) => o.kind === 'ukras' && o.id === u));
      const fore = FORA_IDS.filter((f) => FORE[f].rarity === tier && !START_ONLY_FORE.includes(f) && !run.fore.includes(f) && !offers.some((o) => o.kind === 'fora' && o.id === f));
      const types: [OfferKind, number][] = [];
      if (ukr.length) types.push(['ukras', TYPE_WEIGHT.ukras]);
      if (fore.length) types.push(['fora', TYPE_WEIGHT.fora]);
      if (tier === 'common' && run.casicaBought < CASICA_PRICES.length && !offers.some((o) => o.kind === 'casica')) types.push(['casica', TYPE_WEIGHT.casica]);
      if (tier === 'rare' && canFalsa && !offers.some((o) => o.kind === 'falsa')) types.push(['falsa', TYPE_WEIGHT.falsa]);
      if (!types.length) continue;
      const kind = weighted(rng, types);
      if (kind === 'ukras') { const id = ukr[Math.floor(rng() * ukr.length) % ukr.length]; offers.push({ kind, id, rarity: tier, price: UKRASI[id].price, sold: false }); }
      else if (kind === 'fora') { const id = fore[Math.floor(rng() * fore.length) % fore.length]; offers.push({ kind, id, rarity: tier, price: FORE[id].price, sold: false }); }
      else if (kind === 'casica') offers.push({ kind, rarity: tier, price: casicaPrice(run), sold: false });
      else offers.push({ kind: 'falsa', rarity: tier, price: FALSA_PRICE, sold: false });
      break;
    }
  }
  return offers;
}

/** Promišaj: 1 šoldo, then +1 per reroll in the same visit (−discount, min 1). */
export function rerollPrice(shop: { rerolls: number }, discount = 0): number { return Math.max(1, 1 + shop.rerolls - discount); }

/** Apply a price discount (min 1) to offers (Partneri Na crtu perk). */
export function discountOffers(offers: Offer[], discount: number): Offer[] {
  return discount ? offers.map((o) => ({ ...o, price: Math.max(1, o.price - discount) })) : offers;
}

export function reroll<R extends ShopRun>(run: R, discount = run.discount ?? 0): R {
  if (!run.shop) throw new Error('not in shop');
  const price = rerollPrice(run.shop, discount);
  if (run.soldi < price) throw new Error('cannot afford reroll');
  const r = clone(run);
  const shop = r.shop!;
  r.soldi -= price;
  shop.rerolls += 1;
  shop.offers = discountOffers(generateOffers(r, shop.visit, shop.rerolls), discount);
  return r;
}

// ---- Prebaci ukras (both modes, §19.2.2) ----

export function movePrice(run: { discount?: number }): number { return Math.max(1, MOVE_PRICE - (run.discount ?? 0)); }

export function canMove(run: ShopRun): { ok: boolean; reason?: 'limit' | 'none' | 'soldi' | 'full' } {
  if (!run.shop || run.shop.moves >= MAX_MOVES) return { ok: false, reason: 'limit' };
  if (!run.deck.some((c) => c.ukras)) return { ok: false, reason: 'none' };
  if (!run.deck.some((c) => !c.ukras && !c.forge)) return { ok: false, reason: 'full' };
  if (run.soldi < movePrice(run)) return { ok: false, reason: 'soldi' };
  return { ok: true };
}

/** Move one of your ukrasi onto a card with no ukras and no forgery. */
export function moveUkras<R extends ShopRun>(run: R, fromKey: string, toKey: string): R {
  const c = canMove(run);
  if (!c.ok) throw new Error('cannot move: ' + c.reason);
  const r = clone(run);
  const from = r.deck.find((d) => slotOf(d) === fromKey);
  const to = r.deck.find((d) => slotOf(d) === toKey);
  if (!from || !from.ukras) throw new Error('source has no ukras');
  if (!to || to.ukras || to.forge) throw new Error('target must have no ukras and no forgery');
  to.ukras = from.ukras;
  delete from.ukras;
  r.soldi -= movePrice(run);
  r.shop!.moves += 1;
  return r;
}

function assertOffer(run: ShopRun, i: number): Offer {
  const o = run.shop?.offers[i];
  if (!o) throw new Error('no such offer');
  if (o.sold) throw new Error('already sold');
  if (run.soldi < o.price) throw new Error('cannot afford');
  return o;
}

export function buyUkras<R extends ShopRun>(run: R, offerIndex: number, key: string): R {
  const o = assertOffer(run, offerIndex);
  if (o.kind !== 'ukras') throw new Error('not an ukras offer');
  const r = clone(run);
  const card = r.deck.find((d) => slotOf(d) === key || cardKey(d) === key);
  if (!card) throw new Error('card not in deck');
  if (card.forge) throw new Error('forged cards take no ukras');
  card.ukras = o.id;
  r.soldi -= o.price;
  r.shop!.offers[offerIndex].sold = true;
  return r;
}

export function buyFora<R extends ShopRun>(run: R, offerIndex: number, discard?: ForaId): R {
  const o = assertOffer(run, offerIndex);
  if (o.kind !== 'fora') throw new Error('not a fora offer');
  if (run.fore.includes(o.id)) throw new Error('already owned');
  const r = clone(run);
  if (r.fore.length >= FORE_SLOTS) {
    if (!discard || !r.fore.includes(discard)) throw new Error('slots full: choose a fora to discard');
    r.fore = r.fore.filter((f) => f !== discard);
  }
  r.fore.push(o.id);
  r.soldi -= o.price;
  r.shop!.offers[offerIndex].sold = true;
  return r;
}

/** Veća čašica: +1 rakija base, twice per run (8, then 10). */
export function buyCasica<R extends ShopRun>(run: R, offerIndex: number): R {
  const o = assertOffer(run, offerIndex);
  if (o.kind !== 'casica') throw new Error('not a casica offer');
  if (run.casicaBought >= CASICA_PRICES.length || run.rakijaBase >= MAX_RAKIJA_BASE) throw new Error('already maxed');
  const r = clone(run);
  r.rakijaBase = Math.min(MAX_RAKIJA_BASE, r.rakijaBase + 1);
  r.casicaBought += 1;
  r.soldi -= o.price;
  r.shop!.offers[offerIndex].sold = true;
  return r;
}

/** Falsa karta: forge a lišina (no ukras / forgery) into a copy of any 3, 2 or A (max 4 per deck). */
export function buyFalsa<R extends ShopRun>(run: R, offerIndex: number, key: string, target: { suit: Suit; rank: Rank }): R {
  const o = assertOffer(run, offerIndex);
  if (o.kind !== 'falsa') throw new Error('not a forgery offer');
  if (!canForge(run.deck, key)) throw new Error('that card cannot be forged');
  const r = clone(run);
  r.deck = forgeInDeck(r.deck, key, target, 'mi');
  r.soldi -= o.price;
  r.shop!.offers[offerIndex].sold = true;
  return r;
}

export function leaveShop(run: RunState): RunState {
  const r = clone(run);
  r.shop = undefined;
  r.ladderIndex = Math.min(LAST_MATCH, r.ladderIndex + 1);
  r.attempt = 0;
  r.status = 'map';
  return r;
}

export function setStatus(run: RunState, status: RunState['status']): RunState {
  const r = clone(run);
  r.status = status;
  return r;
}
