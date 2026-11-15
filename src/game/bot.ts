// Bot decision procedure (§8.4–§8.6). Uses only the BotView.
import { BASE_THIRDS, SUITS } from './cards';
import { FORE } from './fore';
import type { BotKnobs } from './opponents';
import type { BotView } from './botMemory';
import { cardStrength } from './rules';
import type { Rng } from './rng';
import type { CardInst, ForaId, Suit } from './types';

// ---------- helpers (§8.2) ----------

export function val(c: CardInst): number {
  return BASE_THIRDS[c.rank] + (c.ukras === 'pozlaceno' ? 3 : 0);
}

export class Eval {
  constructor(public v: BotView) {}
  strMine(c: CardInst): number { return cardStrength(c, this.v.myTricaTarget); }
  strOpp(c: CardInst): number { return cardStrength(c); }
  isVoid(s: Suit): boolean { return this.v.oppVoid.includes(s); }
  possible(s: Suit): CardInst[] {
    const known = this.v.oppKnown.filter((c) => c.suit === s);
    const unseen = this.isVoid(s) ? [] : this.v.unseen.filter((c) => c.suit === s);
    return [...known, ...unseen];
  }
  pHas(uid: string): number {
    if (this.v.oppKnown.some((c) => c.uid === uid)) return 1;
    const u = this.v.unseen.find((c) => c.uid === uid);
    if (!u || this.isVoid(u.suit)) return 0;
    // §19.3.2: each unseen card is in the opponent's hand or in the shared mac
    const handUnknown = this.v.oppHandSize - this.v.oppKnown.length;
    if (handUnknown <= 0) return 0;
    return Math.min(1, handUnknown / (handUnknown + (this.v.mac ?? 0)));
  }
  oppAceUid(s: Suit): string { return this.v.unseen.find((c) => c.suit === s && c.rank === 'A')?.uid ?? `p:${s}_A`; }
  isMaster(c: CardInst): boolean {
    const my = this.strMine(c);
    return !this.possible(c.suit).some((x) => this.strOpp(x) > my);
  }
  oppPts(s: Suit): number {
    let sum = 0;
    for (const x of this.possible(s)) sum += val(x) * this.pHas(x.uid);
    return sum;
  }
  get macsEmpty(): boolean { return this.v.myMac === 0 && this.v.oppMac === 0; }
  get isLast(): boolean { return this.v.trickNo === 20; }
  legalCards(): CardInst[] { return this.v.hand.filter((c) => this.v.legal.includes(c.uid)); }
}

function minBy<T>(arr: T[], key: (x: T) => number[]): T {
  let best = arr[0];
  let bk = key(best);
  for (let i = 1; i < arr.length; i++) {
    const k = key(arr[i]);
    for (let j = 0; j < k.length; j++) {
      if (k[j] < bk[j]) { best = arr[i]; bk = k; break; }
      if (k[j] > bk[j]) break;
    }
  }
  return best;
}

function rngPick<T>(rng: Rng, arr: T[]): T { return arr[Math.floor(rng() * arr.length) % arr.length]; }

// ---------- follow ----------

function dump(e: Eval, cards: CardInst[]): CardInst {
  return minBy(cards, (c) => [val(c), e.strMine(c)]);
}

function discard(e: Eval, cards: CardInst[]): CardInst {
  let pool = cards;
  const nonA = cards.filter((c) => c.rank !== 'A');
  if (nonA.length > 0) pool = nonA;
  const suitCount = (s: Suit) => e.v.hand.filter((c) => c.suit === s).length;
  return minBy(pool, (c) => [val(c), suitCount(c.suit), e.strMine(c)]);
}

function wantLead(e: Eval): boolean {
  return e.v.hand.some((m) => val(m) >= 1 && !e.isVoid(m.suit) && e.isMaster(m));
}

export function chooseFollow(e: Eval, knobs: BotKnobs): CardInst {
  const v = e.v;
  const L = v.leadCard!;
  const S = L.suit;
  const legal = e.legalCards();
  const strL = v.leadStr ?? e.strOpp(L);
  const suitCards = legal.filter((c) => c.suit === S);
  const V = val(L) * v.multiplier;
  if (suitCards.length > 0) {
    const winners = suitCards.filter((c) => e.strMine(c) > strL);
    if (winners.length > 0) {
      const w = minBy(winners, (c) => [e.strMine(c)]);
      if (e.isLast) return w;
      if (V >= 3) return w;
      if (V >= 1) {
        if (knobs.saveMasters && w.rank === '3' && e.pHas(e.oppAceUid(S)) > 0 && val(L) <= 1) {
          const low = suitCards.filter((c) => e.strMine(c) < strL && val(c) === 0);
          if (low.length > 0) return minBy(low, (c) => [e.strMine(c)]);
        }
        return w;
      }
      if (val(w) === 0) return w;
      if (knobs.huntAce && wantLead(e)) return w;
      const rest = suitCards.filter((c) => !winners.includes(c));
      return dump(e, rest.length > 0 ? rest : suitCards);
    }
    return dump(e, suitCards);
  }
  return discard(e, legal);
}

// ---------- lead ----------

export function chooseLead(e: Eval, knobs: BotKnobs): CardInst {
  const v = e.v;
  const legal = e.legalCards();
  if (v.hand.length === 2) {
    const ms = v.hand.filter((c) => e.isMaster(c));
    if (ms.length === 1) {
      const o = v.hand.find((c) => c !== ms[0])!;
      if (legal.includes(o)) return o;
    }
  }
  const masters = legal.filter((c) => e.isMaster(c));
  if (knobs.huntAce) {
    let bestA = -1;
    let bestSuit: Suit | null = null;
    for (const S of SUITS) {
      if (e.isVoid(S)) continue;
      if (!masters.some((m) => m.suit === S)) continue;
      const a = e.pHas(e.oppAceUid(S));
      if (a > bestA) { bestA = a; bestSuit = S; }
    }
    if (bestSuit && bestA >= 0.5) {
      const ms = masters.filter((m) => m.suit === bestSuit);
      return minBy(ms, (c) => [e.strMine(c)]);
    }
  }
  if (e.macsEmpty) {
    const M = masters.filter((m) => val(m) >= 1 && !e.isVoid(m.suit));
    if (M.length > 0) {
      let best = M[0];
      let bv = -Infinity;
      for (const m of M) {
        const p = e.oppPts(m.suit);
        if (p > bv) { bv = p; best = m; }
      }
      return best;
    }
  }
  const lows = legal.filter((c) => val(c) === 0);
  if (lows.length > 0) {
    const has32 = (S: Suit) => v.hand.some((c) => c.suit === S && (c.rank === '3' || c.rank === '2'));
    let pool = lows.filter((c) => !has32(c.suit));
    if (pool.length === 0) pool = lows;
    const len = (S: Suit) => v.hand.filter((c) => c.suit === S).length;
    let maxLen = -1;
    for (const c of pool) maxLen = Math.max(maxLen, len(c.suit));
    const longest = pool.filter((c) => len(c.suit) === maxLen);
    // among the longest suits pick the overall lowest card
    return minBy(longest, (c) => [e.strMine(c), SUITS.indexOf(c.suit)]);
  }
  if (masters.length > 0) return minBy(masters, (c) => [val(c), e.strMine(c)]);
  return minBy(legal, (c) => [val(c), e.strMine(c)]);
}

// ---------- PIMC (§8.5) ----------

interface SimCard { uid: string; suit: Suit; str: number; thirds: number; ukras?: string; mine: boolean }
const NODE_LIMIT = 200_000;
class NodeLimit extends Error {}

function toSim(c: CardInst, str: number, mine: boolean): SimCard {
  return { uid: c.uid, suit: c.suit, str, thirds: BASE_THIRDS[c.rank], ukras: c.ukras, mine };
}

function simLegal(hand: SimCard[], lead: SimCard | undefined, forced: boolean): SimCard[] {
  if (!lead) return hand;
  const suit = hand.filter((c) => c.suit === lead.suit);
  if (suit.length === 0) return hand;
  if (forced) {
    const m = Math.max(...suit.map((c) => c.str));
    return suit.filter((c) => c.str === m);
  }
  return suit;
}

function trickValue(lead: SimCard, follow: SimCard, mult: number, last: boolean): { winnerMine: boolean; delta: number } {
  let winner = lead;
  if (follow.suit === lead.suit && follow.str > lead.str) winner = follow;
  const winnerMine = winner.mine;
  let delta = 0;
  for (const c of [lead, follow]) {
    const t = c.thirds * mult;
    const toOwner = c.ukras === 'usoljeno' && c.mine !== winnerMine;
    const toMine = toOwner ? c.mine : winnerMine;
    delta += toMine ? t : -t;
    if (c.ukras === 'pozlaceno' && c.mine === winnerMine) delta += winnerMine ? 3 : -3;
  }
  if (last) {
    const u = winner.ukras === 'ponocno' ? 9 : 3;
    delta += winnerMine ? u : -u;
  }
  return { winnerMine, delta };
}

interface SimState { my: SimCard[]; opp: SimCard[]; myLeads: boolean; lead?: SimCard; mult: number; forced: boolean }

function search(st: SimState, alpha: number, beta: number, counter: { n: number }): number {
  if (++counter.n > NODE_LIMIT) throw new NodeLimit();
  const myTurn = st.lead ? !st.lead.mine : st.myLeads;
  const hand = myTurn ? st.my : st.opp;
  if (hand.length === 0) return 0;
  const moves = simLegal(hand, st.lead, st.forced).slice().sort((a, b) => b.str - a.str);
  let best = myTurn ? -Infinity : Infinity;
  for (const mv of moves) {
    const rest = hand.filter((c) => c !== mv);
    const my = myTurn ? rest : st.my;
    const opp = myTurn ? st.opp : rest;
    let value: number;
    if (!st.lead) {
      value = search({ my, opp, myLeads: st.myLeads, lead: mv, mult: st.mult, forced: st.forced || mv.ukras === 'ljuto' }, alpha, beta, counter);
    } else {
      const last = my.length === 0 && opp.length === 0;
      const r = trickValue(st.lead, mv, st.mult, last);
      value = r.delta + (last ? 0 : search({ my, opp, myLeads: r.winnerMine, mult: 1, forced: false }, alpha, beta, counter));
    }
    if (myTurn) {
      if (value > best) best = value;
      if (best > alpha) alpha = best;
    } else {
      if (value < best) best = value;
      if (best < beta) beta = best;
    }
    if (alpha >= beta) break;
  }
  return best;
}

export function pimc(e: Eval, samples: number, rng: Rng): CardInst | null {
  const v = e.v;
  const legal = e.legalCards();
  const need = v.oppHandSize - v.oppKnown.length;
  const totals = new Map<string, number>();
  let completed = 0;
  for (let k = 0; k < samples; k++) {
    let pool = v.unseen.filter((c) => !e.isVoid(c.suit));
    if (pool.length < need) pool = v.unseen.slice();
    if (pool.length < need) continue;
    const pc = pool.slice();
    const sample: CardInst[] = [...v.oppKnown];
    for (let i = 0; i < need; i++) {
      const j = Math.floor(rng() * pc.length) % pc.length;
      sample.push(pc.splice(j, 1)[0]);
    }
    const opp = sample.map((c) => toSim(c, e.strOpp(c), false));
    const lead = v.leadCard ? toSim(v.leadCard, v.leadStr ?? e.strOpp(v.leadCard), false) : undefined;
    const results = new Map<string, number>();
    try {
      const counter = { n: 0 };
      for (const m of legal) {
        const my = v.hand.filter((c) => c.uid !== m.uid).map((c) => toSim(c, e.strMine(c), true));
        const mv = toSim(m, e.strMine(m), true);
        let value: number;
        if (lead) {
          const last = my.length === 0 && opp.length === 0;
          const r = trickValue(lead, mv, v.multiplier, last);
          value = r.delta + (last ? 0 : search({ my, opp, myLeads: r.winnerMine, mult: 1, forced: false }, -Infinity, Infinity, counter));
        } else {
          value = search({ my, opp, myLeads: true, lead: mv, mult: v.multiplier, forced: v.forcedHighest || mv.ukras === 'ljuto' }, -Infinity, Infinity, counter);
        }
        results.set(m.uid, value);
      }
    } catch (err) {
      if (err instanceof NodeLimit) continue;
      throw err;
    }
    completed++;
    for (const [u, val2] of results) totals.set(u, (totals.get(u) ?? 0) + val2);
  }
  if (completed === 0) return null;
  let best: CardInst | null = null;
  let bv = -Infinity;
  for (const m of legal) {
    const t = totals.get(m.uid) ?? -Infinity;
    if (t > bv) { bv = t; best = m; }
  }
  return best;
}

// ---------- top level ----------

export function chooseCard(view: BotView, knobs: BotKnobs, rng: Rng): string {
  const e = new Eval(view);
  const legal = e.legalCards();
  if (legal.length === 0) throw new Error('bot has no legal play');
  if (legal.length === 1) return legal[0].uid;
  if (view.selfDrunk) return rngPick(rng, legal).uid;
  if (rng() < knobs.mistakeRate) {
    const nonA = legal.filter((c) => c.rank !== 'A');
    return rngPick(rng, nonA.length > 0 ? nonA : legal).uid;
  }
  if (knobs.pimcMaxCards > 0 && e.macsEmpty && view.hand.length <= knobs.pimcMaxCards) {
    const r = pimc(e, knobs.pimcSamples, rng);
    if (r) return r.uid;
  }
  const c = view.leadCard ? chooseFollow(e, knobs) : chooseLead(e, knobs);
  return c.uid;
}

export interface ForaDecision { fora: ForaId; targetUid?: string }

/** Bot fore policy (§8.6), evaluated after a tentative card was chosen. */
export function chooseFora(view: BotView, tentativeUid: string): { fore: ForaDecision[]; card: string } {
  const e = new Eval(view);
  const out: ForaDecision[] = [];
  let card = tentativeUid;
  let rakija = view.rakija;
  const usable = (f: ForaId) => view.fore.includes(f) && !view.foreUsed.includes(f) && !!view.canUse[f] && rakija >= FORE[f].cost;
  const use = (f: ForaId, targetUid?: string) => { out.push(targetUid ? { fora: f, targetUid } : { fora: f }); rakija -= FORE[f].cost; };
  const tentative = view.hand.find((c) => c.uid === tentativeUid);
  if (!tentative) return { fore: out, card };
  if (usable('pogled') && view.firstTurn) use('pogled');
  if (usable('tucem') && view.isLeader && e.isMaster(tentative) && e.strMine(tentative) >= 18) {
    let s = 0;
    for (const x of e.possible(tentative.suit)) s += val(x) * e.pHas(x.uid);
    if (s >= 2) use('tucem');
  }
  if (usable('duplo_ili_nista')) {
    if (view.isLeader && tentative.rank === '3' && !e.isVoid(tentative.suit) && e.oppPts(tentative.suit) >= 2) use('duplo_ili_nista');
    else if (!view.isLeader && view.leadCard) {
      const L = view.leadCard;
      const V = val(L) * view.multiplier;
      const wins = tentative.suit === L.suit && e.strMine(tentative) > (view.leadStr ?? e.strOpp(L));
      if (wins && V >= 3) use('duplo_ili_nista');
    }
  }
  if (usable('trica_iz_rukava') && !view.isLeader && view.leadCard) {
    const L = view.leadCard;
    if (L.rank === 'A' || L.rank === '2') {
      const suitCards = e.legalCards().filter((c) => c.suit === L.suit);
      const strL = view.leadStr ?? e.strOpp(L);
      if (suitCards.length > 0 && !suitCards.some((c) => e.strMine(c) > strL)) {
        const target = minBy(suitCards, (c) => [val(c), e.strMine(c)]);
        use('trica_iz_rukava', target.uid);
        card = target.uid;
      }
    }
  }
  if (usable('krivi_racun') && view.trickNo >= 19 && view.myThirds % 3 !== 0) use('krivi_racun');
  // Briškula! (§19.2.3): when void with V >= 2 thirds or on the last trick; Dvoboj plays the lowest-val card
  if (usable('briskula') && !view.isLeader && view.leadCard) {
    const V = val(view.leadCard) * view.multiplier;
    if (V >= 2 || view.trickNo === 20) {
      use('briskula');
      card = minBy(e.legalCards(), (c) => [val(c), e.strMine(c)]).uid;
    }
  }
  return { fore: out, card };
}

/** Pending choices: pickDraw -> max(val + str/20). reorderMac -> keep order. */
export function choosePending(view: BotView): { pick?: string; order?: string[] } {
  const p = view.pending;
  if (!p) return {};
  if (p.kind === 'pickDraw') {
    const cards = view.pendingCards ?? [];
    let best = cards[0];
    let bv = -Infinity;
    for (const c of cards) {
      const x = val(c) + cardStrength(c, view.myTricaTarget) / 20;
      if (x > bv) { bv = x; best = c; }
    }
    return { pick: best ? best.uid : p.uids[0] };
  }
  return { order: p.uids.slice() };
}

export function thinkTime(knobs: BotKnobs, legalCount: number, rng: Rng): number {
  if (legalCount <= 1) return 450;
  const [a, b] = knobs.thinkMs;
  return a + (b - a) * rng();
}
