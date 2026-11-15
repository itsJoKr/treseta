import type { CardInst, ForaId, HandState, Rank, Side, SideState, Suit, UkrasId } from '../src/game/types';
import { other, teamOfSide } from '../src/game/types';

/**
 * 'kupe_3', 'kupe_A+pozlaceno', 'bate_4=kupe_3' (a forgery of the 4 of bate into the 3 of kupe,
 * held in its copy identity by the beneficiary side). One deck: uid = p:<slot> (§19.3.1).
 * An ukras is tagged for the side holding the card unless '@mi' / '@vi' is given.
 */
export function card(spec: string, owner: Side): CardInst {
  const [main, tag] = spec.split('@');
  const [base0, uk] = main.split('+');
  const [base, forge] = base0.split('=');
  const [suit, rank] = base.split('_') as [Suit, Rank];
  const c: CardInst = { suit, rank, uid: `p:${suit}_${rank}`, owner, slot: `${suit}_${rank}` };
  if (uk) { c.ukras = uk as UkrasId; c.ukrasTeam = (tag as 'mi' | 'vi') ?? teamOfSide(owner); }
  if (forge) {
    const [fs, fr] = forge.split('_') as [Suit, Rank];
    c.forge = { suit: fs, rank: fr, team: teamOfSide(owner) };
    c.suit = fs; c.rank = fr;
  }
  return c;
}

export function uid(spec: string, _owner?: Side): string {
  return `p:${spec.split('@')[0].split('+')[0].split('=')[0]}`;
}

export interface SideSpec {
  hand?: string[];
  /** cards for the shared mac (player's first, then the bot's) */
  mac?: string[];
  fore?: ForaId[];
  rakija?: number;
  thirds?: number;
}

export function sideState(owner: Side, sp: SideSpec): SideState {
  return {
    hand: (sp.hand ?? []).map((s) => card(s, owner)),
    pile: [],
    thirds: sp.thirds ?? 0, bonusPoints: 0, akuzaPoints: 0,
    rakija: sp.rakija ?? 3, fore: sp.fore ?? [], foreUsed: [],
    akuzeDeclared: {}, knownByOpp: [], voidKnown: [],
    pijanoUsed: [], drunk: false, kriviRacun: false, soldi: 0,
  };
}

export function makeState(opts: {
  player: SideSpec; bot: SideSpec; leader?: Side; trickNo?: number; seed?: string; mac?: string[];
}): HandState {
  const leader = opts.leader ?? 'player';
  const no = opts.trickNo ?? 1;
  const mac = [...(opts.mac ?? []), ...(opts.player.mac ?? []), ...(opts.bot.mac ?? [])].map((s) => card(s, other(leader)));
  return {
    seed: opts.seed ?? 'test', handNo: 1, dealer: other(leader),
    turn: leader, phase: 'lead',
    trick: { no, leader, forcedHighest: false, multiplier: 1 },
    tricksDone: no - 1,
    sides: { player: sideState('player', opts.player), bot: sideState('bot', opts.bot) },
    mac, rngCounter: 0, table: [],
  };
}

/** Fill a side's spec with filler lišine for stable hand sizes. */
export const FILL = ['kupe_4', 'kupe_5', 'bate_4', 'bate_5', 'spade_4', 'spade_5', 'dinari_4', 'dinari_5'];
