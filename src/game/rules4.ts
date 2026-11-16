// Partneri rules engine (§18.1, §18.5). PURE: input state is never mutated.
import { detectNewAkuze } from './akuze';
import { BASE_THIRDS, toInst } from './cards';
import { FORE } from './fore';
import { canUseFora4, SEAT_TARGET, unknownTo } from './fore4';
import { rngFor, shuffle } from './rng';
import type { DeckCard, ForaId, SideBreakdown, Suit } from './types';
import type {
  Action4, Card4, GameEvent4, Hand4State, Perks4, Seat, SeatState, Signal, Team, TeamState,
} from './types4';
import { nextSeat, opponentsOf, otherTeam, PARTNER_OF, SEATS_CW, TEAM_OF, TEAMS } from './types4';
import * as U from './ukrasi4';
import { identFor, slotOf } from './forge';

export { canUseFora4 };
export const MAX_RAKIJA4 = 5;

export interface CreateHand4Params {
  seed: string;
  handNo: number;
  dealer: Seat;
  /** 40 cards, ukrasi carry `ukrasTeam` */
  deck: (DeckCard & { ukrasTeam?: Team })[];
  fore: Record<Seat, ForaId[]>;
  rakija: Record<Seat, number>;
  perks?: Perks4;
}

function clone<T>(x: T): T { return structuredClone(x); }
function rand(s: Hand4State): number { return rngFor(s.seed, 'r4', s.rngCounter++)(); }

export function findCard4(s: Hand4State, uid: string): { card: Card4; seat?: Seat } | undefined {
  for (const seat of SEATS_CW) {
    const c = s.seats[seat].hand.find((x) => x.uid === uid);
    if (c) return { card: c, seat };
  }
  const t = s.table.find((x) => x.uid === uid);
  if (t) return { card: t, seat: s.trick.plays.find((p) => p.uid === uid)?.seat };
  for (const team of TEAMS) {
    const c = s.teams[team].pile.find((x) => x.uid === uid);
    if (c) return { card: c };
  }
  return undefined;
}

/** Effective strength of a card as played/held by `seat`. */
export function strengthOf(s: Hand4State, c: Card4, seat: Seat): number {
  return U.strength4(c, seat, s.seats[seat].tricaTarget);
}

function emptyTeam(): TeamState {
  return { pile: [], thirds: 0, bonusPoints: 0, akuzaPoints: 0, kriviRacun: false, soldi: 0 };
}

function know(s: Hand4State, uid: string, ...teams: Team[]): void {
  const cur = s.knownTo[uid] ?? [];
  for (const t of teams) if (!cur.includes(t)) cur.push(t);
  s.knownTo[uid] = cur;
}

function revealRandom(s: Hand4State, seat: Seat, team: Team, n: number): string[] {
  const pool = unknownTo(s, seat, team);
  const out: string[] = [];
  while (out.length < n && pool.length > 0) {
    const i = Math.floor(rand(s) * pool.length) % pool.length;
    out.push(pool.splice(i, 1)[0]);
  }
  for (const u of out) know(s, u, team);
  return out;
}

export function createHand4(p: CreateHand4Params): { state: Hand4State; events: GameEvent4[] } {
  if (p.deck.length !== 40) throw new Error('Partneri needs exactly 40 cards');
  const perks = p.perks ?? { akuzaBonusMi: 0, ultimaBonusMi: 0, revealEachHand: false };
  const order: Seat[] = [];
  let seat = nextSeat(p.dealer);
  for (let k = 0; k < 4; k++) { order.push(seat); seat = nextSeat(seat); }
  const cards = shuffle(rngFor(p.seed, 'deal'), p.deck).map((c) => {
    const inst = toInst({ ...c, slot: slotOf(c) }, 'player') as Card4;
    if (c.ukras) inst.ukrasTeam = c.ukrasTeam ?? 'mi';
    return inst;
  });
  const seats = {} as Record<Seat, SeatState>;
  for (const st of SEATS_CW) {
    seats[st] = { hand: [], rakija: Math.min(MAX_RAKIJA4, p.rakija[st] ?? 0), fore: (p.fore[st] ?? []).slice(), foreUsed: [], akuzeDeclared: {}, akuzaChecked: false, drunk: false };
  }
  // 8 packets of 5, clockwise from the seat after the dealer
  for (let pk = 0; pk < 8; pk++) {
    const st = order[pk % 4];
    // each card takes its identity for the holder's team (§19.4.1)
    seats[st].hand.push(...cards.slice(pk * 5, pk * 5 + 5).map((c) => identFor(c, TEAM_OF[st])));
  }
  const leader = order[0];
  const s: Hand4State = {
    seed: p.seed, handNo: p.handNo, dealer: p.dealer, turn: leader, phase: 'play',
    trick: { no: 1, leader, plays: [], multiplier: 1 }, tricksDone: 0, seats,
    teams: { mi: emptyTeam(), vi: emptyTeam() }, knownTo: {}, voidKnown: { S: [], W: [], N: [], E: [] },
    signalsLog: [], asks: [], partnerHandShown: false, perks: { ...perks }, rngCounter: 0, table: [], pijanoUsed: [],
  };
  const events: GameEvent4[] = [];
  events.push({ t: 'handStarted', handNo: p.handNo, dealer: p.dealer, leader });
  events.push({ t: 'dealt', hands: { S: seats.S.hand.map((c) => c.uid), W: seats.W.hand.map((c) => c.uid), N: seats.N.hand.map((c) => c.uid), E: seats.E.hand.map((c) => c.uid) } });
  if (perks.revealEachHand) {
    for (const opp of ['W', 'E'] as Seat[]) {
      const u = revealRandom(s, opp, 'mi', 1);
      if (u.length) events.push({ t: 'revealed', seat: opp, uids: u, to: 'mi', via: 'postar' });
    }
  }
  turnStart(s, events);
  return { state: s, events };
}

function akuzaCheck(s: Hand4State, seat: Seat, events: GameEvent4[]): void {
  const st = s.seats[seat];
  st.akuzaChecked = true;
  const team = TEAM_OF[seat];
  const r = detectNewAkuze(U.akuzaView(st.hand, seat), st.akuzeDeclared);
  if (r.combos.length === 0) return;
  st.akuzeDeclared = r.declared;
  const bonus = team === 'mi' ? s.perks.akuzaBonusMi : 0;
  const combos = r.combos.map((c) => ({ ...c, points: c.points + bonus }));
  const total = combos.reduce((a, c) => a + c.points, 0);
  s.teams[team].akuzaPoints += total;
  for (const c of combos) for (const u of c.uids) know(s, u, 'mi', 'vi');
  events.push({ t: 'akuza', seat, team, combos, total });
}

function pos(s: Hand4State): 1 | 2 | 3 | 4 { return (s.trick.plays.length + 1) as 1 | 2 | 3 | 4; }

function turnStart(s: Hand4State, events: GameEvent4[]): void {
  if (s.phase !== 'play') return;
  const seat = s.turn;
  if (s.trick.no === 1 && !s.seats[seat].akuzaChecked) akuzaCheck(s, seat, events);
  pushTurn(s, events);
}

function pushTurn(s: Hand4State, events: GameEvent4[]): void {
  const seat = s.turn;
  const legal = legalPlays4(s, seat);
  const signals: Record<string, Signal[]> = {};
  if (s.trick.plays.length === 0) for (const u of legal) signals[u] = legalSignals4(s, seat, u);
  events.push({ t: 'turn', seat, pos: pos(s), legal, signals });
}

function ledSuit(s: Hand4State): Suit | undefined {
  const lead = s.trick.plays[0];
  return lead ? s.table.find((c) => c.uid === lead.uid)?.suit : undefined;
}

export function legalPlays4(s: Hand4State, seat: Seat): string[] {
  if (s.phase !== 'play' || s.turn !== seat) return [];
  const hand = s.seats[seat].hand;
  if (s.trick.plays.length === 0) {
    const ex = s.trick.excludedLead;
    if (ex && hand.length > 1 && hand.some((c) => c.uid === ex)) return hand.filter((c) => c.uid !== ex).map((c) => c.uid);
    return hand.map((c) => c.uid);
  }
  const suit = ledSuit(s)!;
  const sc = hand.filter((c) => c.suit === suit);
  if (sc.length === 0) return hand.map((c) => c.uid);
  const turn = hand.filter((c) => c.suit !== suit && U.isTurncoat4(c, seat));
  if (s.trick.forcedTeam && s.trick.forcedTeam === TEAM_OF[seat]) {
    const strs = sc.map((c) => strengthOf(s, c, seat));
    const m = Math.max(...strs);
    return [...sc.filter((_, i) => strs[i] === m), ...turn.filter((c) => strengthOf(s, c, seat) >= m)].map((c) => c.uid);
  }
  return [...sc, ...turn].map((c) => c.uid);
}

/**
 * Signals the leader may attach to leading `uid`. Both are claims, not checked facts (§20): any lead
 * may carry Tučem or Strišo, as at a real table. Reading the hand is the caller's job.
 */
export function legalSignals4(s: Hand4State, seat: Seat, uid: string): Signal[] {
  if (s.phase !== 'play' || s.turn !== seat || s.trick.plays.length !== 0) return [];
  if (!s.seats[seat].hand.some((c) => c.uid === uid)) return [];
  return ['tucem', 'striso'];
}

export function scoreHand4(s: Hand4State): Record<Team, SideBreakdown> {
  const out = {} as Record<Team, SideBreakdown>;
  for (const team of TEAMS) {
    const ts = s.teams[team];
    const rounding = ts.kriviRacun ? 'ceil' : 'floor';
    const cardPoints = rounding === 'ceil' ? Math.ceil(ts.thirds / 3) : Math.floor(ts.thirds / 3);
    const ultima = s.ultima && s.ultima.team === team ? s.ultima.points : 0;
    out[team] = { thirds: ts.thirds, cardPoints, rounding, ultima, ukrasPoints: ts.bonusPoints, akuzaPoints: ts.akuzaPoints, total: cardPoints + ultima + ts.bonusPoints };
  }
  return out;
}

function resolve(s: Hand4State, events: GameEvent4[]): void {
  const t = s.trick;
  const plays = t.plays.slice();
  const cards = plays.map((p) => s.table.find((c) => c.uid === p.uid)!);
  // eligible: the led suit, or trump under Briškula! (§19.2.3); equal strength → the earlier play wins (§19.4.2)
  const suit = t.trump && cards.some((c) => c.suit === t.trump) ? t.trump : cards[0].suit;
  let w = cards.findIndex((c) => c.suit === suit);
  let ws = strengthOf(s, cards[w], plays[w].seat);
  for (let i = w + 1; i < 4; i++) {
    if (cards[i].suit !== suit) continue;
    const st = strengthOf(s, cards[i], plays[i].seat);
    if (st > ws) { w = i; ws = st; }
  }
  const winner = plays[w].seat;
  const winTeam = TEAM_OF[winner];
  const thirdsTo: Record<Team, number> = { mi: 0, vi: 0 };
  const bonus: { team: Team; ukras: import('./types').UkrasId; points?: number; soldi?: number }[] = [];
  cards.forEach((c, i) => {
    thirdsTo[U.thirdsRecipient(c, plays[i].seat, winTeam)] += BASE_THIRDS[c.rank] * t.multiplier;
    const b = U.onTrickResolved(c, winTeam);
    if (b) {
      if (b.points) s.teams[b.team].bonusPoints += b.points;
      if (b.soldi) s.teams[b.team].soldi += b.soldi;
      bonus.push(b);
    }
  });
  for (const team of TEAMS) s.teams[team].thirds += thirdsTo[team];
  s.teams[winTeam].pile.push(...cards);
  s.table = [];
  s.tricksDone += 1;
  const ev: GameEvent4 = { t: 'trickResolved', trickNo: t.no, winner, team: winTeam, plays, thirdsTo, bonus };
  const wc = cards[w];
  if (t.trump && wc.suit === t.trump && winner === t.briskula) ev.special = 'briskula';
  else if (wc.forge && wc.forge.team === winTeam && wc.suit === wc.forge.suit && wc.rank === wc.forge.rank) ev.special = 'forge';
  if (t.no === 10) {
    let pts = U.onUltima(cards[w], winner);
    if (winTeam === 'mi') pts += s.perks.ultimaBonusMi;
    s.ultima = { team: winTeam, points: pts };
    ev.ultima = { ...s.ultima };
  }
  events.push(ev);
  // Ribarsko: reveal 1 unknown card from each opponent seat to the winning team
  if (t.no < 10 && U.ribarskoFires(cards[w], winner)) {
    for (const opp of opponentsOf(winner)) {
      const u = revealRandom(s, opp, winTeam, 1);
      if (u.length) events.push({ t: 'revealed', seat: opp, uids: u, to: winTeam, via: 'ribarsko' });
    }
  }
  if (t.no >= 10) {
    s.phase = 'over';
    events.push({ t: 'handScored', breakdown: scoreHand4(s) });
    return;
  }
  s.trick = { no: t.no + 1, leader: winner, plays: [], multiplier: 1 };
  s.turn = winner;
  turnStart(s, events);
}

function doPlay(s: Hand4State, a: Extract<Action4, { type: 'play' }>, events: GameEvent4[]): void {
  const seat = a.seat;
  const st = s.seats[seat];
  const legal = legalPlays4(s, seat);
  let uid = a.uid;
  let drunk = false;
  let signal = a.signal;
  if (st.drunk) {
    uid = legal[Math.floor(rand(s) * legal.length) % legal.length];
    drunk = true;
    st.drunk = false;
    if (signal && !legalSignals4(s, seat, uid).includes(signal)) signal = undefined;
  } else if (!legal.includes(uid)) {
    throw new Error(`illegal play ${uid} by ${seat}`);
  }
  const isLead = s.trick.plays.length === 0;
  if (signal) {
    if (!isLead) throw new Error('only the leader may signal');
    if (!legalSignals4(s, seat, uid).includes(signal)) throw new Error(`illegal signal ${signal} with ${uid}`);
  }
  if (isLead && !signal && s.trick.signalCarry && legalSignals4(s, seat, uid).includes(s.trick.signalCarry)) signal = s.trick.signalCarry;
  s.trick.signalCarry = undefined;
  const p = pos(s);
  const card = st.hand.splice(st.hand.findIndex((c) => c.uid === uid), 1)[0];
  delete s.knownTo[uid];
  // identity is fixed when played; Prevrtljivo as a non-leader takes the led suit
  let turned = false;
  if (!isLead) {
    const led = ledSuit(s)!;
    if (card.suit !== led && U.isTurncoat4(card, seat)) { card.suit = led; turned = true; }
    if (s.trick.briskula === seat) s.trick.trump = card.suit;
  }
  s.table.push(card);
  s.trick.plays.push({ seat, uid });
  events.push({ t: 'cardPlayed', seat, uid, pos: p, drunk });
  if (U.onPlay(card, seat) && !s.pijanoUsed.includes(uid)) {
    s.pijanoUsed.push(uid);
    const pl = s.seats.S;
    pl.rakija = Math.min(MAX_RAKIJA4, pl.rakija + 1);
    events.push({ t: 'rakija', seat: 'S', value: pl.rakija });
  }
  if (isLead) {
    const forced = U.onLead(card, seat);
    s.trick.forcedTeam = s.trick.tucemFora ? otherTeam(TEAM_OF[seat]) : forced;
    if (signal) {
      s.trick.signal = { seat, kind: signal, suit: card.suit };
      s.signalsLog.push({ trickNo: s.trick.no, seat, kind: signal, suit: card.suit });
      events.push({ t: 'signal', seat, kind: signal, suit: card.suit });
    }
    // this lead answers any Strišo ask made to this seat
    for (const a of s.asks ?? []) if (a.to === seat) a.answered = true;
  } else {
    const suit = ledSuit(s)!;
    if (card.suit !== suit && !turned && !s.voidKnown[seat].includes(suit)) s.voidKnown[seat].push(suit);
    const sg = s.trick.signal;
    if (sg?.kind === 'striso' && PARTNER_OF[sg.seat] === seat) {
      // §20: points on the partner's (claimed) winner, or a lišina of another suit = "lead me this suit"
      if (BASE_THIRDS[card.rank] > 0) events.push({ t: 'strisoReply', seat, to: sg.seat, kind: 'points', suit: card.suit });
      else if (card.suit !== suit) {
        (s.asks ??= []).push({ trickNo: s.trick.no, seat, to: sg.seat, suit: card.suit, answered: false });
        events.push({ t: 'strisoReply', seat, to: sg.seat, kind: 'ask', suit: card.suit });
      }
    }
  }
  if (s.trick.plays.length === 4) { resolve(s, events); return; }
  s.turn = nextSeat(seat);
  turnStart(s, events);
}

function doFora(s: Hand4State, a: Extract<Action4, { type: 'fora' }>, events: GameEvent4[]): void {
  const seat = a.seat;
  const r = canUseFora4(s, seat, a.fora, a.targetSeat);
  if (!r.ok) throw new Error(`fora ${a.fora} not usable: ${r.reason}`);
  const def = FORE[a.fora];
  const me = s.seats[seat];
  const team = TEAM_OF[seat];
  if (SEAT_TARGET.includes(a.fora) && (!a.targetSeat || !opponentsOf(seat).includes(a.targetSeat))) throw new Error(`fora ${a.fora} needs an opponent seat`);
  if (def.needsTarget && (!a.targetUid || !me.hand.some((c) => c.uid === a.targetUid))) throw new Error(`fora ${a.fora} needs a hand card`);
  if (a.fora === 'pogled' && unknownTo(s, a.targetSeat!, team).length === 0) throw new Error('nothing to reveal');
  me.rakija -= def.cost;
  me.foreUsed.push(a.fora);
  events.push({ t: 'rakija', seat, value: me.rakija });
  const ev: GameEvent4 = { t: 'foraUsed', seat, fora: a.fora };
  if (a.targetUid) ev.targetUid = a.targetUid;
  if (a.targetSeat) ev.targetSeat = a.targetSeat;
  events.push(ev);
  switch (a.fora) {
    case 'pogled': {
      const u = revealRandom(s, a.targetSeat!, team, 3);
      events.push({ t: 'revealed', seat: a.targetSeat!, uids: u, to: team, via: 'pogled' });
      break;
    }
    case 'zamjena': {
      const partner = PARTNER_OF[seat];
      const ph = s.seats[partner].hand;
      const j = Math.floor(rand(s) * ph.length) % ph.length;
      const mine = me.hand.findIndex((c) => c.uid === a.targetUid);
      const [x] = me.hand.splice(mine, 1);
      const [y] = ph.splice(j, 1);
      me.hand.push(y);
      ph.push(x);
      if (me.tricaTarget === x.uid) me.tricaTarget = undefined;
      know(s, x.uid, team);
      know(s, y.uid, team);
      events.push({ t: 'swapped', a: x.uid, b: y.uid });
      events.push({ t: 'revealed', seat: partner, uids: [x.uid], to: team, via: 'zamjena' });
      break;
    }
    case 'namjesteno': {
      const partner = PARTNER_OF[seat];
      s.partnerHandShown = true;
      const u = s.seats[partner].hand.map((c) => c.uid);
      for (const x of u) know(s, x, team);
      events.push({ t: 'revealed', seat: partner, uids: u, to: team, via: 'namjesteno' });
      break;
    }
    case 'krivi_racun':
      s.teams[team].kriviRacun = true;
      break;
    case 'ti_otvaraj':
      s.trick.leader = nextSeat(seat);
      s.turn = nextSeat(seat);
      turnStart(s, events);
      return;
    case 'tucem':
      s.trick.tucemFora = true;
      s.trick.forcedTeam = otherTeam(team);
      break;
    case 'napij_ga':
      s.seats[a.targetSeat!].drunk = true;
      break;
    case 'vrati': {
      const lead = s.trick.plays[0];
      const idx = s.table.findIndex((c) => c.uid === lead.uid);
      const [card] = s.table.splice(idx, 1);
      s.trick.plays = [];
      s.seats[lead.seat].hand.push(card);
      know(s, card.uid, team);
      s.trick.excludedLead = card.uid;
      s.trick.signalCarry = s.trick.signal?.kind;
      s.trick.signal = undefined;
      s.trick.forcedTeam = s.trick.tucemFora ? otherTeam(TEAM_OF[lead.seat]) : undefined;
      s.turn = lead.seat;
      events.push({ t: 'leadReturned', seat: lead.seat, uid: card.uid });
      events.push({ t: 'revealed', seat: lead.seat, uids: [card.uid], to: team, via: 'vrati' });
      pushTurn(s, events);
      return;
    }
    case 'trica_iz_rukava':
      me.tricaTarget = a.targetUid;
      break;
    case 'duplo_ili_nista':
      s.trick.multiplier = 2;
      break;
    case 'briskula':
      s.trick.briskula = seat;
      break;
  }
  pushTurn(s, events);
}

export function applyAction4(input: Hand4State, a: Action4): { state: Hand4State; events: GameEvent4[] } {
  const s = clone(input);
  const events: GameEvent4[] = [];
  if (s.phase !== 'play' || s.turn !== a.seat) throw new Error(`not ${a.seat}'s turn`);
  if (a.type === 'play') doPlay(s, a, events);
  else doFora(s, a, events);
  return { state: s, events };
}

/** Cards of `seat` known to `team` (excluding the team's own seat). */
export function knownCards(s: Hand4State, seat: Seat, team: Team): Card4[] {
  return s.seats[seat].hand.filter((c) => (s.knownTo[c.uid] ?? []).includes(team));
}

export { SEATS_CW, TEAM_OF, PARTNER_OF, nextSeat };
