import { describe, expect, it } from 'vitest';
import { standardDeck } from '../src/game/cards';
import { firstDealer, matchAct, nextHand, startMatch } from '../src/game/match';
import type { MatchState } from '../src/game/match';
import { MATCH_CONFIG } from '../src/game/matchConfig';
import { matchAct4, nextHand4, startMatch4 } from '../src/game/match4';
import { rngFor } from '../src/game/rng';
import { legalPlays } from '../src/game/rules';
import { legalPlays4 } from '../src/game/rules4';
import { firstDealer4 } from '../src/game/run4';
import { NO_PERKS } from '../src/game/types4';

describe('matches to 11 (§19.1.1)', () => {
  it('the target is 11 in both modes', () => {
    expect(MATCH_CONFIG.dvoboj.target).toBe(11);
    expect(MATCH_CONFIG.partneri.target).toBe(11);
  });

  it('Dvoboj: checked only at hand end, higher score wins once someone has ≥ 11; the dealer alternates', () => {
    let m: MatchState = startMatch('tonci', undefined, 11, firstDealer(0));
    expect(m.dealer).toBe('bot');
    expect(firstDealer(1)).toBe('player');
    const setup = { runSeed: 'm', ladderIndex: 0, attempt: 0, deck: standardDeck(), fore: { player: [], bot: [] }, rakija: { player: 0, bot: 0 } };
    const rng = rngFor('mt');
    const dealers: string[] = [];
    let hands = 0;
    while (m.status !== 'over' && hands < 20) {
      m = nextHand(m, setup).match;
      dealers.push(m.hand!.dealer);
      hands++;
      while (m.hand!.phase !== 'over') {
        const s = m.hand!;
        if (s.phase === 'pending') break;
        const l = legalPlays(s, s.turn);
        m = matchAct(m, { type: 'play', side: s.turn, uid: l[Math.floor(rng() * l.length)] }).match;
      }
      if (m.status !== 'over') expect(Math.max(m.scores.player, m.scores.bot) < 11 || m.scores.player === m.scores.bot).toBe(true);
    }
    expect(m.status).toBe('over');
    expect(Math.max(m.scores.player, m.scores.bot)).toBeGreaterThanOrEqual(11);
    expect(m.scores.player).not.toBe(m.scores.bot);
    for (let i = 1; i < dealers.length; i++) expect(dealers[i]).not.toBe(dealers[i - 1]);
  });

  it('an exact tie at ≥ 11 plays another hand (both modes)', () => {
    const tie = startMatch('tonci', { scores: { player: 12, bot: 12 }, handNo: 3, dealer: 'bot', akuzaPointsPlayer: 0 }, 11);
    expect(tie.status).toBe('handOver');
    const tie4 = startMatch4({ scores: { mi: 12, vi: 12 }, handNo: 3, dealer: 'E', akuzaPointsMi: 0 }, 11);
    expect(tie4.status).toBe('handOver');
  });

  it('Partneri: match to 11 with the per-match first dealer and clockwise rotation', () => {
    let m = startMatch4({ scores: { mi: 0, vi: 0 }, handNo: 1, dealer: firstDealer4(1), akuzaPointsMi: 0 }, 11);
    expect(m.dealer).toBe('S');
    const setup = { runSeed: 'm4', ladderIndex: 1, attempt: 0, deck: standardDeck(), fore: { S: [], W: [], N: [], E: [] }, rakija: { S: 0, W: 0, N: 0, E: 0 }, perks: NO_PERKS };
    const rng = rngFor('m4');
    const dealers: string[] = [];
    while (m.status !== 'over' && dealers.length < 20) {
      m = nextHand4(m, setup).match;
      dealers.push(m.hand!.dealer);
      while (m.hand!.phase !== 'over') {
        const s = m.hand!;
        const l = legalPlays4(s, s.turn);
        m = matchAct4(m, { type: 'play', seat: s.turn, uid: l[Math.floor(rng() * l.length)] }).match;
      }
    }
    expect(m.status).toBe('over');
    expect(dealers.slice(0, 3)).toEqual(['S', 'W', 'N'].slice(0, Math.min(3, dealers.length)));
    expect(Math.max(m.scores.mi, m.scores.vi)).toBeGreaterThanOrEqual(11);
  });
});
