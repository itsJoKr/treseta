// Match state machine (§3.8, §16.4). PURE.
import { applyAction, createHand } from './rules';
import type { Action, DeckCard, ForaId, GameEvent, HandState, OpponentId, Side } from './types';
import { other } from './types';
import { MATCH_CONFIG, matchTarget } from './matchConfig';

/** Default Dvoboj target (see matchConfig.ts). */
export const MATCH_TARGET = MATCH_CONFIG.dvoboj.target;

export interface MatchState {
  opponentId: OpponentId;
  target: number;
  scores: Record<Side, number>;
  handNo: number; // number of the current/next hand (1-based)
  dealer: Side; // dealer of the current/next hand
  akuzaPointsPlayer: number;
  hand?: HandState;
  status: 'playing' | 'handOver' | 'over';
  winner?: Side;
  /** Points scored by each side in the last completed hand incl. akuže (display). */
  lastHandTotals?: Record<Side, number>;
}

export interface MatchSetup {
  runSeed: string;
  ladderIndex: number;
  attempt: number;
  /** the one table deck for this match (§19.3.1) */
  deck: DeckCard[];
  fore: Record<Side, ForaId[]>;
  rakija: Record<Side, number>;
}

/** §19.1.1: hand 1 of match i (0-based) is dealt by the bot if i is even, by the player if odd. */
export function firstDealer(ladderIndex: number): Side { return ladderIndex % 2 === 0 ? 'bot' : 'player'; }

export function startMatch(opponentId: OpponentId, resume?: { scores: Record<Side, number>; handNo: number; dealer: Side; akuzaPointsPlayer: number }, target = matchTarget('dvoboj'), dealer: Side = 'bot'): MatchState {
  return {
    opponentId,
    target,
    scores: resume ? { ...resume.scores } : { player: 0, bot: 0 },
    handNo: resume ? resume.handNo : 1,
    dealer: resume ? resume.dealer : dealer,
    akuzaPointsPlayer: resume ? resume.akuzaPointsPlayer : 0,
    status: 'handOver',
  };
}

export function handSeed(runSeed: string, ladderIndex: number, attempt: number, handNo: number): string {
  return [runSeed, 'hand', 'dvoboj', ladderIndex, attempt, handNo].join('|');
}

export function nextHand(m: MatchState, setup: MatchSetup): { match: MatchState; events: GameEvent[] } {
  if (m.status === 'over') throw new Error('match is over');
  const { state, events } = createHand({
    seed: handSeed(setup.runSeed, setup.ladderIndex, setup.attempt, m.handNo),
    handNo: m.handNo,
    dealer: m.dealer,
    deck: setup.deck,
    fore: setup.fore,
    rakija: setup.rakija,
  });
  const match: MatchState = { ...m, scores: { ...m.scores }, hand: state, status: 'playing' };
  return { match, events: applyEventsToMatch(match, events) };
}

function applyEventsToMatch(m: MatchState, events: GameEvent[]): GameEvent[] {
  const extra: GameEvent[] = [];
  for (const e of events) {
    extra.push(e);
    if (e.t === 'akuza') {
      m.scores[e.side] += e.total;
      if (e.side === 'player') m.akuzaPointsPlayer += e.total;
      extra.push({ t: 'matchScoreChanged', scores: { ...m.scores } });
    } else if (e.t === 'handScored') {
      for (const side of ['player', 'bot'] as Side[]) m.scores[side] += e.breakdown[side].total;
      m.lastHandTotals = {
        player: e.breakdown.player.total + e.breakdown.player.akuzaPoints,
        bot: e.breakdown.bot.total + e.breakdown.bot.akuzaPoints,
      };
      extra.push({ t: 'matchScoreChanged', scores: { ...m.scores } });
      const p = m.scores.player;
      const b = m.scores.bot;
      m.handNo += 1;
      m.dealer = other(m.dealer);
      if ((p >= m.target || b >= m.target) && p !== b) {
        m.status = 'over';
        m.winner = p > b ? 'player' : 'bot';
        extra.push({ t: 'matchOver', winner: m.winner, finalScores: { ...m.scores } });
      } else {
        m.status = 'handOver';
      }
    }
  }
  return extra;
}

export function matchAct(m: MatchState, a: Action): { match: MatchState; events: GameEvent[] } {
  if (!m.hand) throw new Error('no hand in progress');
  const { state, events } = applyAction(m.hand, a);
  const match: MatchState = { ...m, scores: { ...m.scores }, hand: state };
  return { match, events: applyEventsToMatch(match, events) };
}
