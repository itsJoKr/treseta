// Core types (§16.3). PURE: no DOM, no three.

export type Suit = 'kupe' | 'bate' | 'spade' | 'dinari';
export type Rank = '3' | '2' | 'A' | 'K' | 'C' | 'F' | '7' | '6' | '5' | '4';
export type Side = 'player' | 'bot';
export type UkrasId =
  | 'pozlaceno' | 'srebreno' | 'nabruseno' | 'ljuto' | 'usoljeno'
  | 'pijano' | 'divlje' | 'glasno' | 'ponocno' | 'ribarsko' | 'prevrtljivo';
export type ForaId =
  | 'pogled' | 'zamjena' | 'namjesteno' | 'krivi_racun' | 'ti_otvaraj'
  | 'tucem' | 'napij_ga' | 'vrati' | 'trica_iz_rukava' | 'duplo_ili_nista' | 'briskula';
export type OpponentId = 'tonci' | 'jure' | 'luka' | 'bepo';
export type PersonaId = 'barba' | 'gazda' | 'mali';
export type Rarity = 'common' | 'uncommon' | 'rare';

/** Beneficiary team (§18.3, §19.3.3): Dvoboj player side = mi, bot side = vi. */
export type TeamId = 'mi' | 'vi';
export interface Forge { suit: Suit; rank: Rank; team: TeamId }
/**
 * A card of the (one) deck. `suit`/`rank` are the identity for its current holder (§19.4.1);
 * `slot` is the printed key (suit_rank), `forge` the copy identity of a forgery.
 */
export interface DeckCard { suit: Suit; rank: Rank; ukras?: UkrasId; ukrasTeam?: TeamId; slot?: string; forge?: Forge }
export interface CardInst extends DeckCard { uid: string; owner: Side }

export interface Played { uid: string; side: Side }
export interface TrickState {
  no: number; // 1..20
  leader: Side;
  lead?: Played;
  follow?: Played;
  forcedHighest: boolean; // Ljuto lead or Tučem!
  multiplier: 1 | 2; // Duplo ili ništa
  excludedLead?: string; // Vrati!
  /** Tučem! was used this trick (stays in effect after a Vrati! re-lead). */
  tucem?: boolean;
  /** Briškula! (§19.2.3): the side that used it; its next card's suit becomes trump. */
  briskulaBy?: Side;
  trump?: Suit;
}

export interface SideState {
  hand: CardInst[];
  pile: CardInst[];
  thirds: number;
  bonusPoints: number;
  akuzaPoints: number;
  rakija: number;
  fore: ForaId[];
  foreUsed: ForaId[];
  akuzeDeclared: Record<string, number>;
  knownByOpp: string[];
  voidKnown: Suit[];
  tricaTarget?: string;
  pijanoUsed: string[];
  drunk: boolean;
  kriviRacun: boolean;
  /** šoldi earned this hand through Srebreno (player only). */
  soldi: number;
}

export type Pending =
  | { kind: 'pickDraw'; side: Side; uids: [string, string] }
  | { kind: 'reorderMac'; side: Side; uids: string[] };

export interface HandState {
  seed: string;
  handNo: number;
  dealer: Side;
  turn: Side;
  phase: 'lead' | 'follow' | 'pending' | 'over';
  trick: TrickState;
  tricksDone: number;
  sides: Record<Side, SideState>;
  /** The shared mac (§19.3.1), index 0 = top. Draws are hidden. */
  mac: CardInst[];
  pending?: Pending;
  pendingResume?: 'drawLoser' | 'nextTrick';
  /** Phase to return to after a reorderMac pending. */
  pendingReturn?: 'lead' | 'follow';
  /** Winner of the trick whose draws are in progress. */
  drawWinner?: Side;
  ultima?: { side: Side; points: number };
  rngCounter: number;
  /** Cards currently on the table (the open trick). */
  table: CardInst[];
}

export type Action =
  | { type: 'play'; side: Side; uid: string }
  | { type: 'fora'; side: Side; fora: ForaId; targetUid?: string }
  | { type: 'resolvePending'; side: Side; pick?: string; order?: string[] };

export interface AkuzaCombo {
  key: string;
  label: string;
  points: number;
  uids: string[];
  /** Extra points from Glasno included in `points`. */
  glasno?: number;
  /** True when this is a 3 -> 4 upgrade (+1). */
  upgrade?: boolean;
}

export interface SideBreakdown {
  thirds: number;
  cardPoints: number;
  rounding: 'floor' | 'ceil';
  ultima: number;
  ukrasPoints: number;
  akuzaPoints: number;
  /** handTotal = cardPoints + ultima + ukrasPoints (akuže excluded, §3.6). */
  total: number;
}

export type GameEvent =
  | { t: 'handStarted'; handNo: number; dealer: Side; leader: Side }
  | { t: 'dealt'; hands: Record<Side, string[]>; mac: string[] }
  | { t: 'akuza'; side: Side; combos: AkuzaCombo[]; total: number }
  | { t: 'turn'; side: Side; role: 'lead' | 'follow'; legal: string[] }
  | { t: 'foraUsed'; side: Side; fora: ForaId; targetUid?: string; revealed?: string[]; drawn?: string }
  | { t: 'pending'; pending: Pending }
  | { t: 'cardPlayed'; side: Side; uid: string; role: 'lead' | 'follow'; drunk: boolean; suit: Suit }
  | { t: 'leadReturned'; side: Side; uid: string }
  | { t: 'rakija'; side: Side; value: number }
  | {
      t: 'trickResolved'; trickNo: number; winner: Side; leadUid: string; followUid: string;
      thirdsTo: Record<Side, number>;
      bonus: { side: Side; ukras: UkrasId; points?: number; soldi?: number }[];
      ultima?: { side: Side; points: number };
      /** the winning card was a forged copy / a Briškula trump (§19.6 voice) */
      special?: 'forge' | 'briskula';
    }
  | { t: 'cardDrawn'; side: Side; uid: string; via: 'mac' | 'ribarsko' | 'zamjena' }
  | { t: 'macReordered'; side: Side; order: string[] }
  | { t: 'handScored'; breakdown: Record<Side, SideBreakdown> }
  | { t: 'matchScoreChanged'; scores: Record<Side, number> }
  | { t: 'matchOver'; winner: Side; finalScores: Record<Side, number> };

export const SIDES: Side[] = ['player', 'bot'];
export function other(s: Side): Side { return s === 'player' ? 'bot' : 'player'; }
export function teamOfSide(s: Side): TeamId { return s === 'player' ? 'mi' : 'vi'; }
export function sideOfTeam(t: TeamId): Side { return t === 'mi' ? 'player' : 'bot'; }
