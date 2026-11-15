// Memory filter and BotView builder (§8.3). The bot never reads hidden state.
import { compareCards, parseUid, SUITS, toInst } from './cards';
import { canUseFora } from './fore';
import { cardStrength, legalPlays, toHeld } from './rules';
import type { Rng } from './rng';
import type { CardInst, DeckCard, ForaId, GameEvent, HandState, Pending, Side, Suit } from './types';
import { other } from './types';

export interface BotMemory {
  me: Side;
  /** Opponent cards seen entering/being in their hand, remembered. */
  knownSeen: string[];
  /** Opponent cards remembered as played. */
  played: string[];
  /** Remembered void observations. */
  voids: Suit[];
  /** Suit of the current trick's lead (public). */
  leadSuit?: Suit;
  /** Number of cards I have played this hand. */
  myPlays: number;
  /** My own played cards (always known). */
  mine?: string[];
}

export function newMemory(me: Side): BotMemory {
  return { me, knownSeen: [], played: [], voids: [], myPlays: 0, mine: [] };
}

/** Observe public events. Never reads the opponent's 'dealt', 'pending' or fora targets. */
export function observe(mem: BotMemory, events: GameEvent[], memoryKnob: number, rng: Rng): BotMemory {
  const m: BotMemory = { ...mem, knownSeen: mem.knownSeen.slice(), played: mem.played.slice(), voids: mem.voids.slice(), mine: (mem.mine ?? []).slice() };
  const opp = other(m.me);
  const roll = () => rng() < memoryKnob;
  const addKnown = (u: string) => { if (!m.knownSeen.includes(u)) m.knownSeen.push(u); };
  for (const e of events) {
    switch (e.t) {
      case 'handStarted':
        m.knownSeen = []; m.played = []; m.voids = []; m.leadSuit = undefined; m.myPlays = 0; m.mine = [];
        break;
      case 'cardPlayed': {
        const suit = e.suit ?? parseUid(e.uid).suit;
        if (e.side === m.me) {
          m.myPlays += 1;
          m.mine!.push(e.uid);
        } else {
          m.knownSeen = m.knownSeen.filter((u) => u !== e.uid);
          if (roll()) m.played.push(e.uid);
          if (e.role === 'follow' && m.leadSuit && suit !== m.leadSuit) {
            if (roll() && !m.voids.includes(m.leadSuit)) m.voids.push(m.leadSuit);
          }
        }
        if (e.role === 'lead') m.leadSuit = suit;
        break;
      }
      case 'trickResolved':
        m.leadSuit = undefined;
        break;
      case 'cardDrawn':
        // hidden draws (§19.3.2): the uid of the opponent's draw is never read; their voids are stale now
        if (e.side === opp) m.voids = [];
        break;
      case 'akuza':
        if (e.side === opp) for (const c of e.combos) for (const u of c.uids) if (roll()) addKnown(u);
        break;
      case 'leadReturned':
        if (e.side === opp && roll()) addKnown(e.uid);
        break;
      case 'foraUsed':
        if (e.side === m.me && e.fora === 'pogled' && e.revealed) for (const u of e.revealed) addKnown(u);
        break;
      default:
        break;
    }
  }
  return m;
}

export interface BotView {
  me: Side;
  trickNo: number;
  phase: HandState['phase'];
  isLeader: boolean;
  hand: CardInst[];
  myTricaTarget?: string;
  legal: string[];
  leadCard?: CardInst;
  leadStr?: number;
  forcedHighest: boolean;
  multiplier: 1 | 2;
  /** shared mac size (§19.3.1) */
  mac: number;
  myMac: number;
  oppMac: number;
  oppHandSize: number;
  oppKnown: CardInst[];
  unseen: CardInst[];
  oppVoid: Suit[];
  myThirds: number;
  oppThirds: number;
  rakija: number;
  fore: ForaId[];
  foreUsed: ForaId[];
  canUse: Partial<Record<ForaId, boolean>>;
  selfDrunk: boolean;
  firstTurn: boolean;
  pending?: Pending;
  pendingCards?: CardInst[];
}

/**
 * Build the view for `mem.me`. `deck` is the public 40-card table deck list. Only public
 * info + remembered observations are used: unseen = deck − own hand − own plays −
 * remembered opponent plays − known opponent cards (§19.3.2).
 */
export function buildView(s: HandState, mem: BotMemory, deck: DeckCard[]): BotView {
  const me = mem.me;
  const oppSide = other(me);
  const mine = s.sides[me];
  const opp = s.sides[oppSide];
  const known = opp.knownByOpp.filter((u) => mem.knownSeen.includes(u));
  const oppKnown: CardInst[] = [];
  for (const u of known) {
    const c = opp.hand.find((x) => x.uid === u);
    if (c) oppKnown.push({ ...c });
  }
  const leadCard = s.trick.lead && s.trick.lead.side === oppSide ? s.table.find((c) => c.uid === s.trick.lead!.uid) : undefined;
  const excluded = new Set<string>([...mem.played, ...(mem.mine ?? []), ...oppKnown.map((c) => c.uid), ...mine.hand.map((c) => c.uid)]);
  if (leadCard) excluded.add(leadCard.uid);
  for (const c of s.table) if (c.owner === me) excluded.add(c.uid);
  const unseen = deck.map((c) => toHeld(c, oppSide)).filter((c) => !excluded.has(c.uid)).sort(compareCards);
  const oppVoid = SUITS.filter((x) => opp.voidKnown.includes(x) && mem.voids.includes(x));
  const canUse: Partial<Record<ForaId, boolean>> = {};
  for (const f of mine.fore) canUse[f] = canUseFora(s, me, f).ok;
  let pendingCards: CardInst[] | undefined;
  if (s.pending && s.pending.side === me) {
    pendingCards = s.pending.uids.map((u) => s.mac.find((c) => c.uid === u)!).filter(Boolean).map((c) => toHeld(c, me));
  }
  return {
    me,
    trickNo: s.trick.no,
    phase: s.phase,
    isLeader: s.phase === 'lead' && s.turn === me,
    hand: mine.hand.map((c) => ({ ...c })),
    myTricaTarget: mine.tricaTarget,
    legal: legalPlays(s, me),
    leadCard: leadCard ? { ...leadCard } : undefined,
    leadStr: leadCard ? cardStrength(leadCard, opp.tricaTarget) : undefined,
    forcedHighest: s.trick.forcedHighest,
    multiplier: s.trick.multiplier,
    mac: s.mac.length,
    myMac: s.mac.length,
    oppMac: s.mac.length,
    oppHandSize: opp.hand.length,
    oppKnown: oppKnown.sort(compareCards),
    unseen,
    oppVoid,
    myThirds: mine.thirds,
    oppThirds: opp.thirds,
    rakija: mine.rakija,
    fore: mine.fore.slice(),
    foreUsed: mine.foreUsed.slice(),
    canUse,
    selfDrunk: mine.drunk,
    firstTurn: mem.myPlays === 0,
    pending: s.pending && s.pending.side === me ? s.pending : undefined,
    pendingCards,
  };
}

