// Partneri match state machine: configurable target (matchConfig.ts), team scores, dealer rotation (§18.5).
import { applyAction4, createHand4 } from './rules4';
import type { CreateHand4Params } from './rules4';
import type { ForaId } from './types';
import type { Action4, GameEvent4, Hand4State, Perks4, Seat, Team } from './types4';
import { nextSeat, TEAMS } from './types4';
import { MATCH_CONFIG, matchTarget } from './matchConfig';

/** Default Partneri target (see matchConfig.ts). */
export const MATCH4_TARGET = MATCH_CONFIG.partneri.target;

export interface Match4State {
  scores: Record<Team, number>;
  handNo: number;
  dealer: Seat;
  akuzaPointsMi: number;
  hand?: Hand4State;
  status: 'playing' | 'handOver' | 'over';
  winner?: Team;
  target: number;
}

export interface Match4Setup {
  runSeed: string;
  ladderIndex: number;
  attempt: number;
  deck: CreateHand4Params['deck'];
  fore: Record<Seat, ForaId[]>;
  rakija: Record<Seat, number>;
  perks: Perks4;
}

/** Match config: target is a parameter so the match length can change (one-hand matches etc.). */
export function startMatch4(resume?: { scores: Record<Team, number>; handNo: number; dealer: Seat; akuzaPointsMi: number }, target = matchTarget('partneri')): Match4State {
  return {
    scores: resume ? { ...resume.scores } : { mi: 0, vi: 0 },
    handNo: resume ? resume.handNo : 1,
    dealer: resume ? resume.dealer : 'E',
    akuzaPointsMi: resume ? resume.akuzaPointsMi : 0,
    status: 'handOver',
    target,
  };
}

export function handSeed4(runSeed: string, ladderIndex: number, attempt: number, handNo: number): string {
  return [runSeed, 'hand4', ladderIndex, attempt, handNo].join('|');
}

function applyEvents(m: Match4State, events: GameEvent4[]): GameEvent4[] {
  const out: GameEvent4[] = [];
  for (const e of events) {
    out.push(e);
    if (e.t === 'akuza') {
      m.scores[e.team] += e.total;
      if (e.team === 'mi') m.akuzaPointsMi += e.total;
      out.push({ t: 'matchScoreChanged', scores: { ...m.scores } });
    } else if (e.t === 'handScored') {
      for (const team of TEAMS) m.scores[team] += e.breakdown[team].total;
      out.push({ t: 'matchScoreChanged', scores: { ...m.scores } });
      m.handNo += 1;
      m.dealer = nextSeat(m.dealer);
      const a = m.scores.mi;
      const b = m.scores.vi;
      if ((a >= m.target || b >= m.target) && a !== b) {
        m.status = 'over';
        m.winner = a > b ? 'mi' : 'vi';
        out.push({ t: 'matchOver', winner: m.winner, finalScores: { ...m.scores } });
      } else {
        m.status = 'handOver';
      }
    }
  }
  return out;
}

export function nextHand4(m: Match4State, setup: Match4Setup): { match: Match4State; events: GameEvent4[] } {
  if (m.status === 'over') throw new Error('match is over');
  const { state, events } = createHand4({
    seed: handSeed4(setup.runSeed, setup.ladderIndex, setup.attempt, m.handNo),
    handNo: m.handNo, dealer: m.dealer, deck: setup.deck, fore: setup.fore, rakija: setup.rakija, perks: setup.perks,
  });
  const match: Match4State = { ...m, scores: { ...m.scores }, hand: state, status: 'playing' };
  return { match, events: applyEvents(match, events) };
}

export function matchAct4(m: Match4State, a: Action4): { match: Match4State; events: GameEvent4[] } {
  if (!m.hand) throw new Error('no hand in progress');
  const { state, events } = applyAction4(m.hand, a);
  const match: Match4State = { ...m, scores: { ...m.scores }, hand: state };
  return { match, events: applyEvents(match, events) };
}
