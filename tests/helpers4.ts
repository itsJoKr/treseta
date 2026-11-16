import { makeUid } from '../src/game/cards';
import type { ForaId, Rank, Suit, UkrasId } from '../src/game/types';
import type { Card4, Hand4State, Perks4, Seat, SeatState, Team } from '../src/game/types4';
import { NO_PERKS, SEATS_CW } from '../src/game/types4';

/** 'kupe_3', 'kupe_A+pozlaceno' (mi), 'kupe_A+pozlaceno@vi', 'bate_4=kupe_3' (a forgery held as its copy) */
export function c4(spec: string, holder: Team = 'mi'): Card4 {
  const [base0, ukPart] = spec.split('+');
  const [base, forge] = base0.split('=');
  const [suit, rank] = base.split('_') as [Suit, Rank];
  const c: Card4 = { suit, rank, uid: makeUid('player', suit, rank), owner: 'player', slot: `${suit}_${rank}` };
  if (forge) {
    const [fs, fr] = forge.split('_') as [Suit, Rank];
    c.forge = { suit: fs, rank: fr, team: holder };
    c.suit = fs; c.rank = fr;
  }
  if (ukPart) {
    const [uk, team] = ukPart.split('@');
    c.ukras = uk as UkrasId;
    c.ukrasTeam = (team as Team) ?? 'mi';
  }
  return c;
}
export const u4 = (spec: string) => c4(spec.split('=')[0]).uid;

export interface Spec4 {
  hands: Partial<Record<Seat, string[]>>;
  leader?: Seat;
  trickNo?: number;
  fore?: Partial<Record<Seat, ForaId[]>>;
  rakija?: Partial<Record<Seat, number>>;
  perks?: Perks4;
}

export function makeState4(sp: Spec4): Hand4State {
  const leader = sp.leader ?? 'S';
  const seats = {} as Record<Seat, SeatState>;
  for (const s of SEATS_CW) {
    seats[s] = { hand: (sp.hands[s] ?? []).map((x) => c4(x, s === 'S' || s === 'N' ? 'mi' : 'vi')), rakija: sp.rakija?.[s] ?? 3, fore: sp.fore?.[s] ?? [], foreUsed: [], akuzeDeclared: {}, akuzaChecked: true, drunk: false };
  }
  const team = () => ({ pile: [], thirds: 0, bonusPoints: 0, akuzaPoints: 0, kriviRacun: false, soldi: 0 });
  return {
    seed: 'test4', handNo: 1, dealer: 'E', turn: leader, phase: 'play',
    trick: { no: sp.trickNo ?? 1, leader, plays: [], multiplier: 1 }, tricksDone: (sp.trickNo ?? 1) - 1,
    seats, teams: { mi: team(), vi: team() }, knownTo: {}, voidKnown: { S: [], W: [], N: [], E: [] },
    signalsLog: [], asks: [], partnerHandShown: false, perks: sp.perks ?? { ...NO_PERKS }, rngCounter: 0, table: [], pijanoUsed: [],
  };
}
