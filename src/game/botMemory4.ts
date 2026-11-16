// BotMemory4 + BotView4 (§18.6 fairness). The view is built only from public info,
// cards known to the bot's team and memory-filtered played cards.
import { compareCards, toInst } from './cards';
import { canUseFora4 } from './fore4';
import type { Rng } from './rng';
import { knownCards, legalPlays4, legalSignals4, strengthOf } from './rules4';
import type { DeckCard, ForaId, Suit } from './types';
import type { Card4, GameEvent4, Hand4State, Seat, Signal, Team } from './types4';
import { PARTNER_OF, SEATS_CW, TEAM_OF } from './types4';

export interface BotMemory4 { me: Seat; played: string[]; myPlays: number }

export function newMemory4(me: Seat): BotMemory4 { return { me, played: [], myPlays: 0 }; }

/** Memory applies to played cards only; signals, voids and reveals are public and always kept. */
export function observe4(mem: BotMemory4, events: GameEvent4[], memoryKnob: number, rng: Rng): BotMemory4 {
  const m: BotMemory4 = { ...mem, played: mem.played.slice() };
  for (const e of events) {
    if (e.t === 'handStarted') { m.played = []; m.myPlays = 0; }
    else if (e.t === 'cardPlayed') {
      if (e.seat === m.me) m.myPlays += 1;
      else if (rng() < memoryKnob) m.played.push(e.uid);
    }
  }
  return m;
}

export interface PlayView { seat: Seat; card: Card4; str: number }

export interface BotView4 {
  me: Seat;
  team: Team;
  partner: Seat;
  trickNo: number;
  pos: 1 | 2 | 3 | 4;
  leader: Seat;
  hand: Card4[];
  myTricaTarget?: string;
  legal: string[];
  signalsFor: Record<string, Signal[]>;
  plays: PlayView[];
  signal?: { seat: Seat; kind: Signal; suit: Suit };
  signalsLog: { trickNo: number; seat: Seat; kind: Signal; suit: Suit }[];
  /** open Strišo asks (public: the lišina was thrown face up), newest last */
  asks: { trickNo: number; seat: Seat; to: Seat; suit: Suit }[];
  forcedTeam?: Team;
  multiplier: 1 | 2;
  handSizes: Record<Seat, number>;
  known: Record<Seat, Card4[]>;
  unseen: Card4[];
  voids: Record<Seat, Suit[]>;
  teamThirds: Record<Team, number>;
  rakija: number;
  fore: ForaId[];
  foreUsed: ForaId[];
  canUse: Partial<Record<ForaId, boolean>>;
  selfDrunk: boolean;
  firstTurn: boolean;
}

/** Public deck list (40 cards with ukrasi + teams) as Card4 instances. */
export function deckList4(deck: (DeckCard & { ukrasTeam?: Team })[]): Card4[] {
  return deck.map((c) => {
    const inst = toInst(c, 'player') as Card4;
    if (c.ukras) inst.ukrasTeam = c.ukrasTeam ?? 'mi';
    return inst;
  });
}

export function buildView4(s: Hand4State, mem: BotMemory4, deck: Card4[]): BotView4 {
  const me = mem.me;
  const team = TEAM_OF[me];
  const mine = s.seats[me];
  const known = {} as Record<Seat, Card4[]>;
  const handSizes = {} as Record<Seat, number>;
  for (const seat of SEATS_CW) {
    handSizes[seat] = s.seats[seat].hand.length;
    known[seat] = seat === me ? [] : knownCards(s, seat, team).map((c) => ({ ...c })).sort(compareCards);
  }
  const plays: PlayView[] = s.trick.plays.map((p) => {
    const card = s.table.find((c) => c.uid === p.uid)!;
    return { seat: p.seat, card: { ...card }, str: strengthOf(s, card, p.seat) };
  });
  const excluded = new Set<string>([...mine.hand.map((c) => c.uid), ...mem.played, ...plays.map((p) => p.card.uid)]);
  for (const seat of SEATS_CW) for (const c of known[seat]) excluded.add(c.uid);
  const unseen = deck.filter((c) => !excluded.has(c.uid)).map((c) => ({ ...c })).sort(compareCards);
  const legal = legalPlays4(s, me);
  const signalsFor: Record<string, Signal[]> = {};
  if (s.trick.plays.length === 0 && s.turn === me) for (const u of legal) signalsFor[u] = legalSignals4(s, me, u);
  const canUse: Partial<Record<ForaId, boolean>> = {};
  for (const f of mine.fore) canUse[f] = canUseFora4(s, me, f).ok;
  return {
    me, team, partner: PARTNER_OF[me], trickNo: s.trick.no, pos: (s.trick.plays.length + 1) as 1 | 2 | 3 | 4,
    leader: s.trick.leader, hand: mine.hand.map((c) => ({ ...c })), myTricaTarget: mine.tricaTarget, legal, signalsFor,
    plays, signal: s.trick.signal ? { ...s.trick.signal } : undefined, signalsLog: s.signalsLog.map((x) => ({ ...x })),
    asks: (s.asks ?? []).filter((a) => !a.answered).map(({ trickNo, seat, to, suit }) => ({ trickNo, seat, to, suit })),
    forcedTeam: s.trick.forcedTeam, multiplier: s.trick.multiplier, handSizes, known, unseen,
    voids: { S: s.voidKnown.S.slice(), W: s.voidKnown.W.slice(), N: s.voidKnown.N.slice(), E: s.voidKnown.E.slice() },
    teamThirds: { mi: s.teams.mi.thirds, vi: s.teams.vi.thirds },
    rakija: mine.rakija, fore: mine.fore.slice(), foreUsed: mine.foreUsed.slice(), canUse, selfDrunk: mine.drunk,
    firstTurn: mem.myPlays === 0,
  };
}
