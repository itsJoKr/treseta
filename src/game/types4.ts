// Partneri (2v2) core types (§18.5). PURE.
import type { AkuzaCombo, CardInst, ForaId, SideBreakdown, Suit, UkrasId } from './types';

export type Seat = 'S' | 'W' | 'N' | 'E';
export type Team = 'mi' | 'vi';
/** Clockwise play order as seen from above with the player at the bottom. */
export const SEATS_CW: Seat[] = ['S', 'W', 'N', 'E'];
export const TEAM_OF: Record<Seat, Team> = { S: 'mi', N: 'mi', W: 'vi', E: 'vi' };
export const PARTNER_OF: Record<Seat, Seat> = { S: 'N', N: 'S', W: 'E', E: 'W' };
export const TEAMS: Team[] = ['mi', 'vi'];
export function nextSeat(s: Seat): Seat { return SEATS_CW[(SEATS_CW.indexOf(s) + 1) % 4]; }
export function otherTeam(t: Team): Team { return t === 'mi' ? 'vi' : 'mi'; }
export function seatsOf(t: Team): Seat[] { return t === 'mi' ? ['S', 'N'] : ['W', 'E']; }
export function opponentsOf(s: Seat): Seat[] { return seatsOf(otherTeam(TEAM_OF[s])); }

// Croatian trešeta uses two signs (hr.wikipedia): Tučem and Strišo. Strišo (§20) = "my last card of
// this suit, and it wins by count": the partner answers by loading points or by throwing a lišina
// of the suit they want led next (an ask).
export type Signal = 'tucem' | 'striso';
export const SIGNALS: Signal[] = ['tucem', 'striso'];

/** owner is always 'player' (uid 'p:'); the holder is whichever hand holds it. */
export interface Card4 extends CardInst { ukrasTeam?: Team }

export interface SeatState {
  hand: Card4[];
  rakija: number;
  fore: ForaId[];
  foreUsed: ForaId[];
  akuzeDeclared: Record<string, number>;
  akuzaChecked: boolean;
  tricaTarget?: string;
  drunk: boolean;
}

export interface TeamState {
  pile: Card4[];
  thirds: number;
  bonusPoints: number;
  akuzaPoints: number;
  kriviRacun: boolean;
  soldi: number;
}

export interface Play4 { seat: Seat; uid: string }

export interface Trick4 {
  no: number; // 1..10
  leader: Seat;
  plays: Play4[];
  signal?: { seat: Seat; kind: Signal; suit: Suit };
  forcedTeam?: Team;
  multiplier: 1 | 2;
  excludedLead?: string;
  tucemFora?: boolean;
  /** Signal carried over a Vrati! return; kept on the re-lead only if still legal. */
  signalCarry?: Signal;
  /** Briškula! (§19.2.3): the seat that used it; its card's suit becomes trump. */
  briskula?: Seat;
  trump?: Suit;
}

export interface Perks4 { akuzaBonusMi: number; ultimaBonusMi: number; revealEachHand: boolean }
export const NO_PERKS: Perks4 = { akuzaBonusMi: 0, ultimaBonusMi: 0, revealEachHand: false };

export interface Hand4State {
  seed: string;
  handNo: number;
  dealer: Seat;
  turn: Seat;
  phase: 'play' | 'over';
  trick: Trick4;
  tricksDone: number;
  seats: Record<Seat, SeatState>;
  teams: Record<Team, TeamState>;
  /** uid (in some hand) -> teams that know it. */
  knownTo: Record<string, Team[]>;
  /** public void knowledge */
  voidKnown: Record<Seat, Suit[]>;
  signalsLog: { trickNo: number; seat: Seat; kind: Signal; suit: Suit }[];
  /** Strišo asks (§20): `seat` threw a lišina of `suit` on `to`'s Strišo; open until `to` next leads. Optional for old saves. */
  asks?: StrisoAsk[];
  partnerHandShown: boolean;
  perks: Perks4;
  ultima?: { team: Team; points: number };
  rngCounter: number;
  table: Card4[];
  pijanoUsed: string[];
}

export interface StrisoAsk { trickNo: number; seat: Seat; to: Seat; suit: Suit; answered: boolean }

export type Action4 =
  | { type: 'play'; seat: Seat; uid: string; signal?: Signal }
  | { type: 'fora'; seat: Seat; fora: ForaId; targetUid?: string; targetSeat?: Seat };

export type RevealVia = 'pogled' | 'ribarsko' | 'postar' | 'namjesteno' | 'zamjena' | 'vrati' | 'akuza';

export type GameEvent4 =
  | { t: 'handStarted'; handNo: number; dealer: Seat; leader: Seat }
  | { t: 'dealt'; hands: Record<Seat, string[]> }
  | { t: 'akuza'; seat: Seat; team: Team; combos: AkuzaCombo[]; total: number }
  | { t: 'turn'; seat: Seat; pos: 1 | 2 | 3 | 4; legal: string[]; signals: Record<string, Signal[]> }
  | { t: 'signal'; seat: Seat; kind: Signal; suit: Suit }
  | { t: 'cardPlayed'; seat: Seat; uid: string; pos: 1 | 2 | 3 | 4; drunk: boolean }
  /** the partner's answer to a Strišo: points loaded, or a lišina of `suit` = "lead this suit" */
  | { t: 'strisoReply'; seat: Seat; to: Seat; kind: 'points' | 'ask'; suit: Suit }
  | { t: 'leadReturned'; seat: Seat; uid: string }
  | { t: 'revealed'; seat: Seat; uids: string[]; to: Team; via: RevealVia }
  | { t: 'swapped'; a: string; b: string }
  | { t: 'rakija'; seat: Seat; value: number }
  | { t: 'foraUsed'; seat: Seat; fora: ForaId; targetUid?: string; targetSeat?: Seat }
  | {
      t: 'trickResolved'; trickNo: number; winner: Seat; team: Team; plays: Play4[];
      thirdsTo: Record<Team, number>; bonus: { team: Team; ukras: UkrasId; points?: number; soldi?: number }[];
      ultima?: { team: Team; points: number };
      /** the winning card was a forged copy / a Briškula trump (§19.6 voice) */
      special?: 'forge' | 'briskula';
    }
  | { t: 'handScored'; breakdown: Record<Team, SideBreakdown> }
  | { t: 'matchScoreChanged'; scores: Record<Team, number> }
  | { t: 'matchOver'; winner: Team; finalScores: Record<Team, number> };

export type { Suit };
