// Rules engine (§3). PURE: input state is never mutated.
import { detectNewAkuze } from './akuze';
import { BASE_STRENGTH, BASE_THIRDS } from './cards';
import { identFor, slotOf } from './forge';
import { applyFora, canUseFora, FORE } from './fore';
import { rngFor, shuffle } from './rng';
import type {
  Action, CardInst, DeckCard, ForaId, GameEvent, HandState, Side, SideBreakdown, SideState, Suit,
} from './types';
import { other, SIDES, teamOfSide } from './types';
import * as U from './ukrasi';

export { canUseFora };

export const MAX_RAKIJA = 5;

export interface CreateHandParams {
  seed: string;
  handNo: number;
  dealer: Side;
  /** the one 40-card table deck (§19.3.1): Mi ukrasi/forgeries + this match's Vi marks/forgeries */
  deck: DeckCard[];
  fore: Record<Side, ForaId[]>;
  rakija: Record<Side, number>;
}

/** A deck card as an instance in `side`'s hands: uid p:<slot>, identity for that side (§19.4.1). */
export function toHeld(c: DeckCard | CardInst, side: Side): CardInst {
  const id = identFor({ ...c, slot: slotOf(c) }, teamOfSide(side));
  return { ...id, uid: 'p:' + slotOf(c), owner: side } as CardInst;
}

function clone<T>(x: T): T {
  return structuredClone(x);
}

function handRand(s: HandState): number {
  return rngFor(s.seed, 'r', s.rngCounter++)();
}

/** Effective strength of a card instance (doubled units, §3.1). */
export function cardStrength(c: CardInst, tricaTarget?: string): number {
  let base = BASE_STRENGTH[c.rank] * 2;
  if (tricaTarget && tricaTarget === c.uid) base = 20;
  return base + U.strengthMod(c);
}

export function findCard(s: HandState, uid: string): CardInst | undefined {
  for (const side of SIDES) {
    const st = s.sides[side];
    for (const list of [st.hand, st.pile]) {
      const c = list.find((x) => x.uid === uid);
      if (c) return c;
    }
  }
  return s.table.find((x) => x.uid === uid) ?? s.mac.find((x) => x.uid === uid);
}

export function effectiveStrength(s: HandState, uid: string): number {
  const c = findCard(s, uid);
  if (!c) throw new Error(`unknown card ${uid}`);
  return cardStrength(c, s.sides[c.owner].tricaTarget);
}

function emptySide(rakija: number, fore: ForaId[]): SideState {
  return {
    hand: [], pile: [],
    thirds: 0, bonusPoints: 0, akuzaPoints: 0,
    rakija, fore: fore.slice(), foreUsed: [],
    akuzeDeclared: {}, knownByOpp: [], voidKnown: [],
    pijanoUsed: [], drunk: false, kriviRacun: false, soldi: 0,
  };
}

function akuzaCheck(s: HandState, side: Side, events: GameEvent[]): void {
  const st = s.sides[side];
  const r = detectNewAkuze(U.akuzaView(st.hand, side), st.akuzeDeclared);
  if (r.combos.length === 0) return;
  st.akuzeDeclared = r.declared;
  st.akuzaPoints += r.total;
  for (const c of r.combos) {
    for (const u of c.uids) if (!st.knownByOpp.includes(u)) st.knownByOpp.push(u);
  }
  events.push({ t: 'akuza', side, combos: r.combos, total: r.total });
}

function pushTurn(s: HandState, events: GameEvent[]): void {
  if (s.phase !== 'lead' && s.phase !== 'follow') return;
  events.push({ t: 'turn', side: s.turn, role: s.phase, legal: legalPlays(s, s.turn) });
}

export function createHand(p: CreateHandParams): { state: HandState; events: GameEvent[] } {
  const leader = other(p.dealer);
  const events: GameEvent[] = [];
  const sides = {} as Record<Side, SideState>;
  for (const side of SIDES) sides[side] = emptySide(p.rakija[side], p.fore[side]);
  // one deck, shuffled; packets of 5: non-dealer, dealer, non-dealer, dealer; 20 to the shared mac
  const deck = shuffle(rngFor(p.seed, 'deal'), p.deck);
  const order: Side[] = [leader, p.dealer, leader, p.dealer];
  let k = 0;
  for (const side of order) for (let i = 0; i < 5; i++) sides[side].hand.push(toHeld(deck[k++], side));
  const mac = deck.slice(k).map((c) => ({ ...c, slot: slotOf(c), uid: 'p:' + slotOf(c), owner: p.dealer }) as CardInst);
  const s: HandState = {
    seed: p.seed, handNo: p.handNo, dealer: p.dealer,
    turn: leader, phase: 'lead',
    trick: { no: 1, leader, forcedHighest: false, multiplier: 1 },
    tricksDone: 0, sides, mac, rngCounter: 0, table: [],
  };
  events.push({ t: 'handStarted', handNo: p.handNo, dealer: p.dealer, leader });
  events.push({ t: 'dealt', hands: { player: sides.player.hand.map((c) => c.uid), bot: sides.bot.hand.map((c) => c.uid) }, mac: mac.map((c) => c.uid) });
  akuzaCheck(s, leader, events);
  akuzaCheck(s, other(leader), events);
  pushTurn(s, events);
  return { state: s, events };
}

export function legalPlays(s: HandState, side: Side): string[] {
  if (s.turn !== side) return [];
  const st = s.sides[side];
  if (s.phase === 'lead') {
    const ex = s.trick.excludedLead;
    if (ex && st.hand.length > 1 && st.hand.some((c) => c.uid === ex)) {
      return st.hand.filter((c) => c.uid !== ex).map((c) => c.uid);
    }
    return st.hand.map((c) => c.uid);
  }
  if (s.phase === 'follow') {
    const lead = s.table.find((c) => c.uid === s.trick.lead?.uid);
    if (!lead) return st.hand.map((c) => c.uid);
    const real = st.hand.filter((c) => c.suit === lead.suit);
    if (real.length === 0) return st.hand.map((c) => c.uid);
    // Prevrtljivo counts as the led suit for its team (§19.2.3)
    const turn = st.hand.filter((c) => c.suit !== lead.suit && U.isTurncoat(c, side));
    if (s.trick.forcedHighest) {
      const strs = real.map((c) => cardStrength(c, st.tricaTarget));
      const max = Math.max(...strs);
      return [...real.filter((_, i) => strs[i] === max), ...turn.filter((c) => cardStrength(c, st.tricaTarget) >= max)].map((c) => c.uid);
    }
    return [...real, ...turn].map((c) => c.uid);
  }
  return [];
}

/** Draw for `side`; returns false if a pending choice (Ribarsko) was created. */
function drawFor(s: HandState, side: Side, events: GameEvent[], winningCard: CardInst | undefined, isWinner: boolean): boolean {
  if (s.mac.length === 0) return true;
  if (isWinner && U.onDrawChoice(winningCard, s.mac.length)) {
    s.pending = { kind: 'pickDraw', side, uids: [s.mac[0].uid, s.mac[1].uid] };
    s.pendingResume = 'drawLoser';
    s.phase = 'pending';
    events.push({ t: 'pending', pending: s.pending });
    return false;
  }
  drawTop(s, side, events, 'mac');
  return true;
}

/**
 * A hidden draw (§19.3.2): never adds to knownByOpp; clears this side's known voids.
 * No akuža check here (play-test round 4): akuže are declared only at the deal, before the
 * first trick, as in Partneri. A combination completed by a later draw does not count.
 */
function drawIntoHand(s: HandState, side: Side, c: CardInst, events: GameEvent[], via: 'mac' | 'ribarsko' | 'zamjena'): void {
  const st = s.sides[side];
  st.hand.push(toHeld(c, side));
  st.voidKnown = [];
  events.push({ t: 'cardDrawn', side, uid: c.uid, via });
}

function drawTop(s: HandState, side: Side, events: GameEvent[], via: 'mac' | 'zamjena'): void {
  const c = s.mac.shift();
  if (!c) return;
  drawIntoHand(s, side, c, events, via);
}

function startNextTrick(s: HandState, leader: Side, events: GameEvent[]): void {
  s.trick = { no: s.tricksDone + 1, leader, forcedHighest: false, multiplier: 1 };
  s.turn = leader;
  s.phase = 'lead';
  s.drawWinner = undefined;
  s.pendingResume = undefined;
  pushTurn(s, events);
}

export function scoreHand(s: HandState): Record<Side, SideBreakdown> {
  const out = {} as Record<Side, SideBreakdown>;
  for (const side of SIDES) {
    const st = s.sides[side];
    const rounding = st.kriviRacun ? 'ceil' : 'floor';
    const cardPoints = rounding === 'ceil' ? Math.ceil(st.thirds / 3) : Math.floor(st.thirds / 3);
    const ultima = s.ultima && s.ultima.side === side ? s.ultima.points : 0;
    out[side] = {
      thirds: st.thirds, cardPoints, rounding, ultima,
      ukrasPoints: st.bonusPoints, akuzaPoints: st.akuzaPoints,
      total: cardPoints + ultima + st.bonusPoints,
    };
  }
  return out;
}

function resolveTrick(s: HandState, events: GameEvent[]): void {
  const t = s.trick;
  const lead = s.table.find((c) => c.uid === t.lead!.uid)!;
  const follow = s.table.find((c) => c.uid === t.follow!.uid)!;
  const leader = t.lead!.side;
  const follower = t.follow!.side;
  let winner: Side = leader;
  const ls = cardStrength(lead, s.sides[lead.owner].tricaTarget);
  const fs = cardStrength(follow, s.sides[follow.owner].tricaTarget);
  if (t.trump) {
    // Briškula!: trump beats non-trump; among trumps the higher strength, equal → earlier play
    if (follow.suit === t.trump && (lead.suit !== t.trump || fs > ls)) winner = follower;
  } else if (follow.suit === lead.suit && fs > ls) winner = follower; // equal strength → the earlier play wins
  const winningCard = winner === leader ? lead : follow;
  const thirdsTo: Record<Side, number> = { player: 0, bot: 0 };
  const bonus: { side: Side; ukras: import('./types').UkrasId; points?: number; soldi?: number }[] = [];
  for (const c of [lead, follow]) {
    const ct = BASE_THIRDS[c.rank] * t.multiplier;
    thirdsTo[U.thirdsRecipient(c, winner)] += ct;
    const b = U.onTrickResolved(c, winner);
    if (b) {
      if (b.points) s.sides[b.side].bonusPoints += b.points;
      if (b.soldi) s.sides[b.side].soldi += b.soldi;
      bonus.push({ side: b.side, ukras: c.ukras!, points: b.points, soldi: b.soldi });
    }
  }
  for (const side of SIDES) s.sides[side].thirds += thirdsTo[side];
  s.sides[winner].pile.push(lead, follow);
  s.table = [];
  s.tricksDone += 1;
  const ev: GameEvent = {
    t: 'trickResolved', trickNo: t.no, winner, leadUid: lead.uid, followUid: follow.uid, thirdsTo, bonus,
  };
  if (t.trump && winningCard.suit === t.trump && winner === t.briskulaBy) ev.special = 'briskula';
  else if (winningCard.forge && winningCard.forge.team === teamOfSide(winner) && winningCard.suit === winningCard.forge.suit && winningCard.rank === winningCard.forge.rank) ev.special = 'forge';
  if (t.no === 20) {
    s.ultima = { side: winner, points: U.onUltima(winningCard) };
    ev.ultima = { ...s.ultima };
  }
  events.push(ev);
  if (t.no >= 20) {
    s.phase = 'over';
    events.push({ t: 'handScored', breakdown: scoreHand(s) });
    return;
  }
  if (t.no <= 10) {
    s.drawWinner = winner;
    if (!drawFor(s, winner, events, winningCard, true)) return;
    drawFor(s, other(winner), events, undefined, false);
  }
  startNextTrick(s, winner, events);
}

function doPlay(s: HandState, side: Side, requested: string, events: GameEvent[]): void {
  const st = s.sides[side];
  const legal = legalPlays(s, side);
  let uid = requested;
  let drunk = false;
  if (st.drunk) {
    uid = legal[Math.floor(handRand(s) * legal.length) % legal.length];
    drunk = true;
    st.drunk = false;
  } else if (!legal.includes(uid)) {
    throw new Error(`illegal play ${uid} by ${side}`);
  }
  const idx = st.hand.findIndex((c) => c.uid === uid);
  const [card] = st.hand.splice(idx, 1);
  st.knownByOpp = st.knownByOpp.filter((u) => u !== uid);
  const role = s.phase as 'lead' | 'follow';
  const leadCard0 = role === 'follow' ? s.table.find((c) => c.uid === s.trick.lead!.uid) : undefined;
  // identity fixed when played; Prevrtljivo as a follow takes the led suit
  let led: Suit | undefined;
  if (leadCard0 && card.suit !== leadCard0.suit && U.isTurncoat(card, side)) { led = leadCard0.suit; card.suit = led; }
  if (role === 'follow' && s.trick.briskulaBy === side) s.trick.trump = card.suit;
  s.table.push(card);
  events.push({ t: 'cardPlayed', side, uid, role, drunk, suit: card.suit });
  const gain = U.onPlay(card, st.pijanoUsed);
  if (gain) {
    st.pijanoUsed.push(card.uid);
    st.rakija = Math.min(MAX_RAKIJA, st.rakija + gain);
    events.push({ t: 'rakija', side, value: st.rakija });
  }
  if (role === 'lead') {
    s.trick.lead = { uid, side };
    s.trick.forcedHighest = !!s.trick.tucem || U.onLead(card);
    s.phase = 'follow';
    s.turn = other(side);
    pushTurn(s, events);
  } else {
    s.trick.follow = { uid, side };
    const leadCard = s.table.find((c) => c.uid === s.trick.lead!.uid)!;
    if (card.suit !== leadCard.suit && !led && !st.voidKnown.includes(leadCard.suit)) st.voidKnown.push(leadCard.suit);
    resolveTrick(s, events);
  }
}

export function applyAction(input: HandState, a: Action): { state: HandState; events: GameEvent[] } {
  const s = clone(input);
  const events: GameEvent[] = [];
  if (a.type === 'play') {
    if ((s.phase !== 'lead' && s.phase !== 'follow') || s.turn !== a.side) throw new Error(`not ${a.side}'s turn`);
    doPlay(s, a.side, a.uid, events);
    return { state: s, events };
  }
  if (a.type === 'fora') {
    const r = canUseFora(s, a.side, a.fora);
    if (!r.ok) throw new Error(`fora ${a.fora} not usable: ${r.reason}`);
    const def = FORE[a.fora];
    const me = s.sides[a.side];
    if (def.needsTarget && (!a.targetUid || !me.hand.some((c) => c.uid === a.targetUid))) {
      throw new Error(`fora ${a.fora} needs a target in hand`);
    }
    me.rakija -= def.cost;
    me.foreUsed.push(a.fora);
    events.push({ t: 'rakija', side: a.side, value: me.rakija });
    applyFora(s, a.side, a.fora, def.needsTarget ? a.targetUid : undefined, {
      events,
      rand: () => handRand(s),
      draw: (side, via) => drawTop(s, side, events, via),
    });
    pushTurn(s, events);
    return { state: s, events };
  }
  // resolvePending
  const p = s.pending;
  if (s.phase !== 'pending' || !p || p.side !== a.side) throw new Error('no pending choice for ' + a.side);
  if (p.kind === 'pickDraw') {
    if (!a.pick || !p.uids.includes(a.pick)) throw new Error('invalid pick');
    const other1 = p.uids[0] === a.pick ? p.uids[1] : p.uids[0];
    const picked = s.mac.splice(s.mac.findIndex((c) => c.uid === a.pick), 1)[0];
    const rest = s.mac.splice(s.mac.findIndex((c) => c.uid === other1), 1)[0];
    s.mac.push(rest);
    s.pending = undefined;
    s.phase = 'lead';
    drawIntoHand(s, a.side, picked, events, 'ribarsko');
    const resume = s.pendingResume;
    const winner = s.drawWinner ?? a.side;
    if (resume === 'drawLoser') drawFor(s, other(winner), events, undefined, false);
    startNextTrick(s, winner, events);
    return { state: s, events };
  }
  // reorderMac
  const order = a.order ?? [];
  const sorted1 = order.slice().sort().join(',');
  const sorted2 = p.uids.slice().sort().join(',');
  if (sorted1 !== sorted2) throw new Error('invalid order');
  const top = order.map((u) => s.mac.find((c) => c.uid === u)!);
  s.mac = [...top, ...s.mac.slice(p.uids.length)];
  s.pending = undefined;
  s.phase = s.pendingReturn ?? 'lead';
  s.pendingReturn = undefined;
  events.push({ t: 'macReordered', side: a.side, order: order.slice() });
  pushTurn(s, events);
  return { state: s, events };
}

/** Thirds currently captured by each side this hand. */
export function liveThirds(s: HandState): Record<Side, number> {
  return { player: s.sides.player.thirds, bot: s.sides.bot.thirds };
}
