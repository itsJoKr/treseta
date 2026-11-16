// Partnership bot (§18.6): follow / lead / signals / fore / PIMC. Uses only BotView4.
import { BASE_THIRDS, SUITS } from './cards';
import type { Knobs4 } from './characters';
import { FORE } from './fore';
import type { BotView4, PlayView } from './botMemory4';
import type { Rng } from './rng';
import type { ForaId, Suit } from './types';
import type { Card4, Seat, Signal, Team } from './types4';
import { nextSeat, otherTeam, TEAM_OF } from './types4';
import { strength4 } from './ukrasi4';

export function val4(c: Card4): number { return BASE_THIRDS[c.rank] + (c.ukras === 'pozlaceno' ? 3 : 0); }

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
function pickR<T>(rng: Rng, a: T[]): T { return a[Math.floor(rng() * a.length) % a.length]; }

export class Eval4 {
  /** a lead step that picked its card for a signal (3b Strišo, 3c Tučem) names it here */
  leadSignal?: { uid: string; kind: Signal };
  constructor(public v: BotView4, public knobs: Knobs4) {}
  get me(): Seat { return this.v.me; }
  str(c: Card4, seat: Seat): number { return strength4(c, seat, seat === this.v.me ? this.v.myTricaTarget : undefined); }
  isOpp(seat: Seat): boolean { return TEAM_OF[seat] !== this.v.team; }
  possible(seat: Seat, suit: Suit): Card4[] {
    const k = this.v.known[seat].filter((c) => c.suit === suit);
    if (this.v.voids[seat].includes(suit)) return k;
    return [...k, ...this.v.unseen.filter((c) => c.suit === suit)];
  }
  unknownCount(seat: Seat): number { return Math.max(0, this.v.handSizes[seat] - this.v.known[seat].length); }
  pHas(seat: Seat, uid: string): number {
    if (this.v.known[seat].some((c) => c.uid === uid)) return 1;
    const u = this.v.unseen.find((c) => c.uid === uid);
    if (!u || this.v.voids[seat].includes(u.suit)) return 0;
    let tot = 0;
    for (const s2 of ['S', 'W', 'N', 'E'] as Seat[]) if (s2 !== this.me && !this.v.voids[s2].includes(u.suit)) tot += this.unknownCount(s2);
    return tot > 0 ? this.unknownCount(seat) / tot : 0;
  }
  /** seats still to play after me in this trick */
  after(): Seat[] {
    const out: Seat[] = [];
    let s = nextSeat(this.me);
    for (let k = 0; k < 4 - this.v.pos; k++) { out.push(s); s = nextSeat(s); }
    return out;
  }
  ledSuit(): Suit | undefined { return this.v.plays[0]?.card.suit; }
  winning(): PlayView | undefined {
    const ps = this.v.plays;
    if (!ps.length) return undefined;
    const suit = ps[0].card.suit;
    let w = ps[0];
    for (const p of ps.slice(1)) if (p.card.suit === suit && p.str > w.str) w = p;
    return w;
  }
  V(): number { return this.v.plays.reduce((a, p) => a + BASE_THIRDS[p.card.rank], 0) * this.v.multiplier; }
  /** no opponent still to play can beat `strength` in `suit` */
  safeAt(strength: number, suit: Suit): boolean {
    for (const s of this.after()) {
      if (!this.isOpp(s)) continue;
      if (this.possible(s, suit).some((x) => this.str(x, s) > strength)) return false;
    }
    return true;
  }
  safe(c: Card4): boolean { return this.safeAt(this.str(c, this.me), this.ledSuit() ?? c.suit); }
  noOppAfter(): boolean { return !this.after().some((s) => this.isOpp(s)); }
  isMaster(c: Card4): boolean {
    const my = this.str(c, this.me);
    for (const s of ['S', 'W', 'N', 'E'] as Seat[]) {
      if (s === this.me) continue;
      if (this.possible(s, c.suit).some((x) => this.str(x, s) > my)) return false;
    }
    return true;
  }
  /**
   * Strišo by my own count (§20): my last card of the suit, and no card I can't account for outranks it.
   * Uses only what I remember, so a forgetful bot holds back when a stronger card might still be out.
   */
  /** my top cards (3, 2, A) of a suit */
  tops(suit: Suit): Card4[] { return this.v.hand.filter((x) => x.suit === suit && (x.rank === '3' || x.rank === '2' || x.rank === 'A')); }
  /**
   * Seeking the partner's 3 (§20): I hold the 2 and A of the suit but not the 3, and the 3 may be with my
   * partner (not known with an opponent, not known played), who is not void there.
   */
  seeks3(suit: Suit): boolean {
    const tops = this.tops(suit);
    if (!tops.some((c) => c.rank === '2') || !tops.some((c) => c.rank === 'A') || tops.some((c) => c.rank === '3')) return false;
    const partner = this.v.partner;
    if (this.v.voids[partner].includes(suit)) return false;
    const is3 = (c: Card4) => c.suit === suit && c.rank === '3';
    if ((['S', 'W', 'N', 'E'] as Seat[]).some((o) => this.isOpp(o) && this.v.known[o].some(is3))) return false;
    return this.v.known[partner].some(is3) || this.v.unseen.some(is3);
  }
  /**
   * Tučem by my own hand (§20): two of the 3, 2 and A of the suit (the led card counts), and either the led
   * card wins by itself (the partner's strongest card is points for us) or it is a low card seeking the 3.
   */
  tucemWorthy(c: Card4): boolean {
    if (this.v.trickNo >= 10 || this.tops(c.suit).length < 2) return false;
    return this.isMaster(c) || (c.rank !== '2' && c.rank !== 'A' && this.seeks3(c.suit));
  }
  strisoWorthy(c: Card4): boolean {
    return this.v.trickNo < 10 && this.v.hand.filter((x) => x.suit === c.suit).length === 1 && this.isMaster(c);
  }
  legalCards(): Card4[] { return this.v.hand.filter((c) => this.v.legal.includes(c.uid)); }
  oppPts(suit: Suit): number {
    let sum = 0;
    for (const s of ['S', 'W', 'N', 'E'] as Seat[]) {
      if (!this.isOpp(s)) continue;
      for (const x of this.possible(s, suit)) sum += val4(x) * this.pHas(s, x.uid);
    }
    return sum;
  }
}

// ---------------- following ----------------

function dump(e: Eval4, cards: Card4[]): Card4 { return minBy(cards, (c) => [val4(c), e.str(c, e.me)]); }

function caricoDiscard(e: Eval4, cards: Card4[]): Card4 {
  const nonMaster = cards.filter((c) => !e.isMaster(c));
  const aces = nonMaster.filter((c) => c.rank === 'A');
  if (aces.length) return minBy(aces, (c) => [e.str(c, e.me)]);
  const points = nonMaster.filter((c) => val4(c) >= 1);
  if (points.length) return minBy(points, (c) => [-val4(c), e.str(c, e.me)]);
  const lis = cards.filter((c) => val4(c) === 0);
  return lis.length ? minBy(lis, (c) => [e.str(c, e.me)]) : dump(e, cards);
}

/**
 * Answer to the partner's Strišo (§20): they claim the trick is ours by count (taken on trust). Follow with my most valuable card;
 * if void, load points; with nothing to give, throw a lišina of the suit I want led next (the ask).
 */
function strisoReply(e: Eval4, legal: Card4[], SC: Card4[]): Card4 {
  if (SC.length) return minBy(SC, (c) => [-val4(c), e.str(c, e.me)]);
  if (legal.some((c) => val4(c) >= 1 && !e.isMaster(c))) return caricoDiscard(e, legal);
  return askCard(e, legal) ?? plainDiscard(e, legal);
}

/** The lišina that asks for my best suit: one where I hold a master (else the highest top card) and keep a card after the throw. */
function askCard(e: Eval4, legal: Card4[]): Card4 | undefined {
  let best: Card4 | undefined;
  let bestKey = -Infinity;
  for (const s of SUITS) {
    const mine = e.v.hand.filter((c) => c.suit === s);
    const lis = legal.filter((c) => c.suit === s && val4(c) === 0);
    if (!lis.length || mine.length < 2) continue;
    const key = (mine.some((c) => e.isMaster(c)) ? 100 : 0) + Math.max(...mine.map((c) => e.str(c, e.me))) + mine.length;
    if (key > bestKey) { bestKey = key; best = minBy(lis, (c) => [e.str(c, e.me)]); }
  }
  return best;
}

function plainDiscard(e: Eval4, cards: Card4[]): Card4 {
  let pool = cards;
  const nonA = cards.filter((c) => c.rank !== 'A');
  if (nonA.length) pool = nonA;
  const count = (s: Suit) => e.v.hand.filter((c) => c.suit === s).length;
  return minBy(pool, (c) => [val4(c), count(c.suit), e.str(c, e.me)]);
}

export function chooseFollow4(e: Eval4, rng: Rng): Card4 {
  const v = e.v;
  const legal = e.legalCards();
  const S = e.ledSuit()!;
  const SC = legal.filter((c) => c.suit === S);
  const W = e.winning()!;
  const partner = v.partner;
  const partnerWinsSafe = W.seat === partner && (e.safeAt(W.str, S) || e.noOppAfter());
  // partner's signal (overrides)
  if (v.signal && v.signal.seat === partner && rng() < e.knobs.readSignals) {
    if (v.signal.kind === 'tucem') {
      // §20: throw my strongest card of the suit (it may be the 3 they are looking for)
      if (SC.length) return minBy(SC, (c) => [-e.str(c, e.me)]);
      // void: load points only if their card already holds the trick
      return partnerWinsSafe ? caricoDiscard(e, legal) : plainDiscard(e, legal);
    }
    if (v.signal.kind === 'striso') return strisoReply(e, legal, SC);
  }
  const trick10 = v.trickNo === 10;
  if (SC.length) {
    if (W.seat === partner) {
      if (partnerWinsSafe) {
        if (rng() < e.knobs.carico) {
          // carico: never overtake; the beat-able test uses strength vs the partner's card
          const notOver = SC.filter((c) => e.str(c, e.me) <= W.str || true);
          const nm = notOver.filter((c) => !e.isMaster(c));
          if (nm.length) return minBy(nm, (c) => [-val4(c), e.str(c, e.me)]);
          return minBy(SC, (c) => [val4(c), e.str(c, e.me)]);
        }
        return dump(e, SC);
      }
      const safeWinners = SC.filter((c) => e.str(c, e.me) > W.str && e.safe(c));
      if (safeWinners.length) return minBy(safeWinners, (c) => [e.str(c, e.me)]);
      return dump(e, SC);
    }
    const winners = SC.filter((c) => e.str(c, e.me) > W.str);
    const safeWinners = winners.filter((c) => e.safe(c));
    const V = e.V();
    if (v.pos === 4) {
      if (winners.length && (V >= 1 || trick10)) return minBy(winners, (c) => [e.str(c, e.me)]);
      const cheap = winners.filter((c) => val4(c) === 0);
      if (cheap.length) return minBy(cheap, (c) => [e.str(c, e.me)]);
      return dump(e, SC);
    }
    if (safeWinners.length && (V >= 1 || trick10 || rng() < e.knobs.aggression)) return minBy(safeWinners, (c) => [e.str(c, e.me)]);
    if (winners.length && V >= 3) return minBy(winners, (c) => [-e.str(c, e.me)]);
    return dump(e, SC);
  }
  if (partnerWinsSafe && rng() < e.knobs.carico) return caricoDiscard(e, legal);
  return plainDiscard(e, legal);
}

// ---------------- leading ----------------

export function chooseLead4(e: Eval4, rng: Rng): Card4 {
  const v = e.v;
  const legal = e.legalCards();
  const partner = v.partner;
  const bySuit = (s: Suit) => legal.filter((c) => c.suit === s);
  // 0. the partner asked for a suit on my Strišo: lead it low, they hold the strength there
  for (let i = v.asks.length - 1; i >= 0; i--) {
    const a = v.asks[i];
    if (a.seat !== partner || a.to !== v.me || v.voids[partner].includes(a.suit)) continue;
    const cs = bySuit(a.suit);
    if (cs.length && rng() < e.knobs.readSignals) return minBy(cs, (c) => [val4(c), e.str(c, e.me)]);
  }
  // 1. return the partner's Tučem suit
  for (let i = v.signalsLog.length - 1; i >= 0; i--) {
    const sg = v.signalsLog[i];
    if (sg.seat !== partner || sg.kind !== 'tucem') continue;
    if (v.voids[partner].includes(sg.suit)) continue;
    const cs = bySuit(sg.suit);
    if (cs.length) {
      const ms = cs.filter((c) => e.isMaster(c));
      return ms.length ? minBy(ms, (c) => [-e.str(c, e.me)]) : minBy(cs, (c) => [e.str(c, e.me)]);
    }
  }
  // 2. lead a master into the partner's void (he can load points)
  for (const s of v.voids[partner]) {
    const ms = bySuit(s).filter((c) => e.isMaster(c));
    if (ms.length) return minBy(ms, (c) => [e.str(c, e.me)]);
  }
  // 3. keep the master for the ultima
  if (v.hand.length === 2) {
    const ms = v.hand.filter((c) => e.isMaster(c));
    if (ms.length === 1) {
      const o = v.hand.find((c) => c !== ms[0])!;
      if (legal.includes(o)) return o;
    }
  }
  // 3b. Strišo: my last card of a suit that wins by my count, so the partner can load points or ask
  const st = legal.filter((c) => (v.signalsFor[c.uid] ?? []).includes('striso') && e.strisoWorthy(c));
  if (st.length && rng() < e.knobs.signalUse) {
    const c = minBy(st, (x) => [-val4(x), e.str(x, e.me)]);
    e.leadSignal = { uid: c.uid, kind: 'striso' };
    return c;
  }
  const opps = (['S', 'W', 'N', 'E'] as Seat[]).filter((s) => e.isOpp(s));
  // 3c. Tučem to find the partner's 3: I hold the A and 2, the 3 may be with my partner, so I lead a
  //     low card of the suit with Tučem; the partner throws their strongest, takes it with the 3 and
  //     leads the suit back to my 2 and A
  if (v.trickNo < 9 && rng() < e.knobs.signalUse) {
    let best: Card4 | undefined;
    for (const s of SUITS) {
      if (!e.seeks3(s)) continue;
      const lows = bySuit(s).filter((c) => c.rank !== '2' && c.rank !== 'A');
      if (!lows.length) continue;
      const low = minBy(lows, (c) => [val4(c), e.str(c, e.me)]);
      if (!best || val4(low) < val4(best)) best = low;
    }
    if (best) { e.leadSignal = { uid: best.uid, kind: 'tucem' }; return best; }
  }
  const masters = legal.filter((c) => e.isMaster(c));
  // 4. ace hunt
  if (e.knobs.huntAce) {
    for (const m of masters) {
      if (m.rank !== '3' && m.rank !== '2') continue;
      if (opps.every((o) => v.voids[o].includes(m.suit))) continue;
      const aceUid = `p:${m.suit}_A`;
      let p = 0;
      for (const o of opps) p += e.pHas(o, aceUid);
      if (p >= 0.5) return m;
    }
  }
  // 5. cash masters
  const cash = masters.filter((m) => val4(m) >= 1 && opps.some((o) => !v.voids[o].includes(m.suit)));
  if (cash.length && (v.trickNo >= 6 || rng() < e.knobs.aggression)) return minBy(cash, (c) => [-val4(c), e.str(c, e.me)]);
  // 6. lowest lišina of my longest suit
  const lows = legal.filter((c) => val4(c) === 0);
  if (lows.length) {
    let pool = lows.filter((c) => !v.voids[partner].includes(c.suit) && !opps.some((o) => v.voids[o].includes(c.suit)));
    if (!pool.length) pool = lows;
    const len = (s: Suit) => v.hand.filter((c) => c.suit === s).length;
    const maxLen = Math.max(...pool.map((c) => len(c.suit)));
    return minBy(pool.filter((c) => len(c.suit) === maxLen), (c) => [e.str(c, e.me), SUITS.indexOf(c.suit)]);
  }
  // 7. min (val, str), preferring masters
  if (masters.length) return minBy(masters, (c) => [val4(c), e.str(c, e.me)]);
  return minBy(legal, (c) => [val4(c), e.str(c, e.me)]);
}

export function chooseSignal4(v: BotView4, uid: string, knobs: Knobs4, rng: Rng): Signal | undefined {
  const legal = v.signalsFor[uid] ?? [];
  const card = v.hand.find((c) => c.uid === uid);
  for (const k of ['tucem', 'striso'] as Signal[]) {
    if (!legal.includes(k)) continue;
    // any lead may carry either signal; a bot gives one only when its own hand and count back it
    if (!card) continue;
    const e = new Eval4(v, knobs);
    if (k === 'tucem' && !e.tucemWorthy(card)) continue;
    if (k === 'striso' && !e.strisoWorthy(card)) continue;
    if (rng() < knobs.signalUse) return k;
  }
  return undefined;
}

// ---------------- PIMC (tiers 3–4) ----------------

interface SimCard { uid: string; suit: Suit; rank: Card4['rank']; thirds: number; ukras?: string; ukrasTeam?: Team }
const NODE_CAP = 100_000;
class Cap extends Error {}

function simStr(c: SimCard, seat: Seat, trica?: string): number {
  return strength4(c as unknown as Card4, seat, trica);
}

interface Sim {
  hands: Record<Seat, SimCard[]>;
  leader: Seat;
  plays: { seat: Seat; c: SimCard }[];
  mult: number;
  forced?: Team;
  myTeam: Team;
  trica?: string;
  me: Seat;
}

function simLegal(st: Sim, seat: Seat): SimCard[] {
  const h = st.hands[seat];
  if (!st.plays.length) return h;
  const suit = st.plays[0].c.suit;
  const sc = h.filter((c) => c.suit === suit);
  if (!sc.length) return h;
  if (st.forced && st.forced === TEAM_OF[seat]) {
    const m = Math.max(...sc.map((c) => simStr(c, seat, seat === st.me ? st.trica : undefined)));
    return sc.filter((c) => simStr(c, seat, seat === st.me ? st.trica : undefined) === m);
  }
  return sc;
}

function simResolve(st: Sim): { winner: Seat; delta: number } {
  const ps = st.plays;
  const suit = ps[0].c.suit;
  let w = ps[0];
  let ws = simStr(w.c, w.seat, w.seat === st.me ? st.trica : undefined);
  for (const p of ps.slice(1)) {
    if (p.c.suit !== suit) continue;
    const s2 = simStr(p.c, p.seat, p.seat === st.me ? st.trica : undefined);
    if (s2 > ws) { w = p; ws = s2; }
  }
  const winTeam = TEAM_OF[w.seat];
  let delta = 0;
  const sign = (t: Team) => (t === st.myTeam ? 1 : -1);
  for (const p of ps) {
    const pt = TEAM_OF[p.seat];
    const to = p.c.ukras === 'usoljeno' && p.c.ukrasTeam === pt && pt !== winTeam ? pt : winTeam;
    delta += sign(to) * p.c.thirds * st.mult;
    if (p.c.ukras === 'pozlaceno' && (p.c.ukrasTeam ?? 'mi') === winTeam) delta += sign(winTeam) * 3;
  }
  const last = (['S', 'W', 'N', 'E'] as Seat[]).every((s) => st.hands[s].length === 0);
  if (last) delta += sign(winTeam) * (w.c.ukras === 'ponocno' && w.c.ukrasTeam === winTeam ? 9 : 3);
  return { winner: w.seat, delta };
}

function search(st: Sim, alpha: number, beta: number, cnt: { n: number }): number {
  if (++cnt.n > NODE_CAP) throw new Cap();
  const seat = st.plays.length ? nextSeat(st.plays[st.plays.length - 1].seat) : st.leader;
  const hand = st.hands[seat];
  if (!hand.length) return 0;
  const maxing = TEAM_OF[seat] === st.myTeam;
  const moves = simLegal(st, seat).slice().sort((a, b) => simStr(b, seat) - simStr(a, seat));
  let best = maxing ? -Infinity : Infinity;
  for (const mv of moves) {
    const hands = { ...st.hands, [seat]: hand.filter((c) => c !== mv) } as Record<Seat, SimCard[]>;
    const plays = [...st.plays, { seat, c: mv }];
    let value: number;
    if (plays.length < 4) {
      const forced = plays.length === 1 ? (mv.ukras === 'ljuto' && mv.ukrasTeam === TEAM_OF[seat] ? otherTeam(TEAM_OF[seat]) : st.forced) : st.forced;
      value = search({ ...st, hands, plays, forced }, alpha, beta, cnt);
    } else {
      const r = simResolve({ ...st, hands, plays });
      const done = (['S', 'W', 'N', 'E'] as Seat[]).every((s) => hands[s].length === 0);
      value = r.delta + (done ? 0 : search({ ...st, hands, plays: [], leader: r.winner, mult: 1, forced: undefined }, alpha, beta, cnt));
    }
    if (maxing) { if (value > best) best = value; if (best > alpha) alpha = best; }
    else { if (value < best) best = value; if (best < beta) beta = best; }
    if (alpha >= beta) break;
  }
  return best;
}

function toSim(c: Card4): SimCard { return { uid: c.uid, suit: c.suit, rank: c.rank, thirds: BASE_THIRDS[c.rank], ukras: c.ukras, ukrasTeam: c.ukrasTeam }; }

function sampleHands(e: Eval4, rng: Rng, relax: boolean): Record<Seat, SimCard[]> | null {
  const v = e.v;
  const others = (['S', 'W', 'N', 'E'] as Seat[]).filter((s) => s !== v.me);
  const hands = { S: [], W: [], N: [], E: [] } as Record<Seat, SimCard[]>;
  hands[v.me] = v.hand.map(toSim);
  const pool = v.unseen.slice();
  for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
  const need: Record<string, number> = {};
  for (const s of others) { hands[s] = v.known[s].map(toSim); need[s] = v.handSizes[s] - v.known[s].length; }
  // most constrained seats first
  const order = others.slice().sort((a, b) => v.voids[b].length - v.voids[a].length);
  for (const s of order) {
    for (let k = 0; k < need[s]; k++) {
      const idx = pool.findIndex((c) => relax || !v.voids[s].includes(c.suit));
      if (idx < 0) return null;
      hands[s].push(toSim(pool.splice(idx, 1)[0]));
    }
  }
  return hands;
}

export function pimc4(e: Eval4, samples: number, rng: Rng): Card4 | null {
  const v = e.v;
  const legal = e.legalCards();
  const totals = new Map<string, number>();
  let done = 0;
  for (let k = 0; k < samples; k++) {
    const hands = sampleHands(e, rng, false) ?? sampleHands(e, rng, true);
    if (!hands) continue;
    const res = new Map<string, number>();
    try {
      const cnt = { n: 0 };
      for (const m of legal) {
        const mh = { ...hands, [v.me]: hands[v.me].filter((c) => c.uid !== m.uid) } as Record<Seat, SimCard[]>;
        const plays = [...v.plays.map((p) => ({ seat: p.seat, c: toSim(p.card) })), { seat: v.me, c: toSim(m) }];
        const base: Sim = { hands: mh, leader: v.leader, plays, mult: v.multiplier, forced: v.forcedTeam, myTeam: v.team, trica: v.myTricaTarget, me: v.me };
        if (plays.length === 1 && m.ukras === 'ljuto' && m.ukrasTeam === v.team) base.forced = otherTeam(v.team);
        let value: number;
        if (plays.length < 4) value = search(base, -Infinity, Infinity, cnt);
        else {
          const r = simResolve(base);
          const fin = (['S', 'W', 'N', 'E'] as Seat[]).every((s) => mh[s].length === 0);
          value = r.delta + (fin ? 0 : search({ ...base, plays: [], leader: r.winner, mult: 1, forced: undefined }, -Infinity, Infinity, cnt));
        }
        res.set(m.uid, value);
      }
    } catch (err) {
      if (err instanceof Cap) continue;
      throw err;
    }
    done++;
    for (const [u, x] of res) totals.set(u, (totals.get(u) ?? 0) + x);
  }
  if (!done) return null;
  let best: Card4 | null = null;
  let bv = -Infinity;
  for (const m of legal) { const t = totals.get(m.uid) ?? -Infinity; if (t > bv) { bv = t; best = m; } }
  return best;
}

// ---------------- top level ----------------

export interface Choice4 { uid: string; signal?: Signal }

export function chooseCard4(v: BotView4, knobs: Knobs4, rng: Rng): Choice4 {
  const e = new Eval4(v, knobs);
  const legal = e.legalCards();
  if (!legal.length) throw new Error('bot4 has no legal play');
  const lead = v.pos === 1;
  const withSignal = (c: Card4): Choice4 => {
    if (lead && e.leadSignal?.uid === c.uid) return { uid: c.uid, signal: e.leadSignal.kind };
    const sig = lead ? chooseSignal4(v, c.uid, knobs, rng) : undefined;
    return sig ? { uid: c.uid, signal: sig } : { uid: c.uid };
  };
  if (legal.length === 1) return withSignal(legal[0]);
  if (v.selfDrunk) return { uid: pickR(rng, legal).uid };
  if (rng() < knobs.mistakeRate) {
    const nonA = legal.filter((c) => c.rank !== 'A');
    return withSignal(pickR(rng, nonA.length ? nonA : legal));
  }
  if (knobs.pimcMaxCards > 0 && v.hand.length <= knobs.pimcMaxCards) {
    const r = pimc4(e, knobs.pimcSamples, rng);
    if (r) return withSignal(r);
  }
  return withSignal(lead ? chooseLead4(e, rng) : chooseFollow4(e, rng));
}

export interface ForaDecision4 { fora: ForaId; targetSeat?: Seat; targetUid?: string }

/** Vi bot fore policy (§18.6), after a tentative card was chosen. */
export function chooseFora4(v: BotView4, tentative: string, knobs: Knobs4): { fore: ForaDecision4[]; card: string } {
  const e = new Eval4(v, knobs);
  const out: ForaDecision4[] = [];
  let card = tentative;
  let rakija = v.rakija;
  const usable = (f: ForaId) => v.fore.includes(f) && !v.foreUsed.includes(f) && !!v.canUse[f] && rakija >= FORE[f].cost;
  const use = (d: ForaDecision4) => { out.push(d); rakija -= FORE[d.fora].cost; };
  const t = v.hand.find((c) => c.uid === tentative);
  if (!t) return { fore: out, card };
  const opps = (['S', 'W', 'N', 'E'] as Seat[]).filter((s) => e.isOpp(s));
  if (usable('pogled') && v.firstTurn) {
    const unk = (s: Seat) => e.unknownCount(s);
    const target = opps.slice().sort((a, b) => unk(b) - unk(a) || (a === 'S' ? -1 : b === 'S' ? 1 : 0))[0];
    if (unk(target) > 0) use({ fora: 'pogled', targetSeat: target });
  }
  const oppSum = (suit: Suit) => {
    let sum = 0;
    for (const o of opps) for (const x of e.possible(o, suit)) sum += val4(x) * e.pHas(o, x.uid);
    return sum;
  };
  if (v.pos === 1) {
    if (usable('tucem') && (t.rank === '2' || t.rank === '3') && e.isMaster(t) && oppSum(t.suit) >= 2) use({ fora: 'tucem' });
    if (usable('duplo_ili_nista') && t.rank === '3' && oppSum(t.suit) >= 2) use({ fora: 'duplo_ili_nista' });
  } else {
    const W = e.winning()!;
    const S = e.ledSuit()!;
    if (usable('duplo_ili_nista') && v.pos === 4) {
      const myStr = t.suit === S ? e.str(t, v.me) : -1;
      const teamWins = TEAM_OF[W.seat] === v.team ? myStr <= W.str || t.suit === S : myStr > W.str;
      if (teamWins && e.V() + BASE_THIRDS[t.rank] >= 3) use({ fora: 'duplo_ili_nista' });
    }
    if (usable('trica_iz_rukava') && v.pos >= 3 && e.isOpp(W.seat) && (W.card.rank === 'A' || W.card.rank === '2')) {
      const sc = e.legalCards().filter((c) => c.suit === S);
      if (sc.length && !sc.some((c) => e.str(c, v.me) > W.str)) {
        const target = minBy(sc, (c) => [val4(c), e.str(c, v.me)]);
        const boosted = 20 + (target.ukras === 'nabruseno' && target.ukrasTeam === v.team ? 3 : 0);
        if (boosted > W.str && e.safeAt(boosted, S)) { use({ fora: 'trica_iz_rukava', targetUid: target.uid }); card = target.uid; }
      }
    }
  }
  if (usable('krivi_racun') && v.trickNo >= 9 && v.teamThirds[v.team] % 3 !== 0) use({ fora: 'krivi_racun' });
  // Briškula! (§19.2.3): void, with V >= 2 thirds or on the last trick. The lowest-val card if no
  // opponent plays after me, else my strongest card.
  if (usable('briskula') && v.pos > 1 && (e.V() >= 2 || v.trickNo === 10)) {
    const W = e.winning();
    if (!W || e.isOpp(W.seat)) {
      use({ fora: 'briskula' });
      const legal = e.legalCards();
      card = e.noOppAfter() ? minBy(legal, (c) => [val4(c), e.str(c, v.me)]).uid : minBy(legal, (c) => [-e.str(c, v.me), val4(c)]).uid;
    }
  }
  return { fore: out, card };
}

export function thinkTime4(knobs: Knobs4, legalCount: number, rng: Rng): number {
  if (legalCount <= 1) return 450;
  const [a, b] = knobs.thinkMs;
  return a + (b - a) * rng();
}
