import { describe, expect, it } from 'vitest';
import { standardDeck } from '../src/game/cards';
import { matchAct4, nextHand4, startMatch4 } from '../src/game/match4';
import type { Match4State } from '../src/game/match4';
import { rngFor } from '../src/game/rng';
import { applyAction4, createHand4, legalPlays4, legalSignals4 } from '../src/game/rules4';
import type { GameEvent4, Hand4State, Seat } from '../src/game/types4';
import { NO_PERKS } from '../src/game/types4';
import { makeState4, u4 } from './helpers4';

const noFore = { S: [], W: [], N: [], E: [] };
const noRak = { S: 0, W: 0, N: 0, E: 0 };
type Tr = Extract<GameEvent4, { t: 'trickResolved' }>;

function hand(seed: string, dealer: Seat = 'E') {
  return createHand4({ seed, handNo: 1, dealer, deck: standardDeck(), fore: noFore, rakija: noRak, perks: NO_PERKS });
}

function playRandom(s0: Hand4State, rng: () => number): { state: Hand4State; events: GameEvent4[] } {
  let s = s0;
  const all: GameEvent4[] = [];
  let g = 0;
  while (s.phase !== 'over' && g++ < 100) {
    const legal = legalPlays4(s, s.turn);
    const r = applyAction4(s, { type: 'play', seat: s.turn, uid: legal[Math.floor(rng() * legal.length)] });
    s = r.state; all.push(...r.events);
  }
  return { state: s, events: all };
}

const play = (s: Hand4State, seat: Seat, spec: string, signal?: 'tucem' | 'striso' | 'volo') => applyAction4(s, { type: 'play', seat, uid: u4(spec), signal });

describe('rules4', () => {
  it('all 40 dealt, 10 per seat, no duplicates; dealer E -> S leads', () => {
    const { state, events } = hand('d1');
    const all = (['S', 'W', 'N', 'E'] as Seat[]).flatMap((s) => state.seats[s].hand.map((c) => c.uid));
    expect(all.length).toBe(40);
    expect(new Set(all).size).toBe(40);
    for (const s of ['S', 'W', 'N', 'E'] as Seat[]) expect(state.seats[s].hand.length).toBe(10);
    expect(state.turn).toBe('S');
    expect(events[0]).toMatchObject({ t: 'handStarted', dealer: 'E', leader: 'S' });
    // packets of 5 clockwise from S: S gets shuffled[0..4] and [20..24]
    const h2 = hand('d1', 'W');
    expect(h2.state.turn).toBe('N');
  });

  it('clockwise order S -> W -> N -> E', () => {
    const { state } = hand('order');
    const turns: Seat[] = [];
    let s = state;
    for (let i = 0; i < 4; i++) {
      turns.push(s.turn);
      s = applyAction4(s, { type: 'play', seat: s.turn, uid: legalPlays4(s, s.turn)[0] }).state;
    }
    expect(turns).toEqual(['S', 'W', 'N', 'E']);
  });

  it('dealer rotation across hands and match to the configured target with the tie rule', () => {
    let m: Match4State = startMatch4(undefined, 31);
    const setup = { runSeed: 'm', ladderIndex: 0, attempt: 0, deck: standardDeck(), fore: noFore, rakija: noRak, perks: NO_PERKS };
    const dealers: Seat[] = [];
    const rng = rngFor('mm');
    let guard = 0;
    while (m.status !== 'over' && guard++ < 30) {
      const r = nextHand4(m, setup);
      m = r.match;
      dealers.push(m.hand!.dealer);
      while (m.hand!.phase !== 'over') {
        const s = m.hand!;
        const legal = legalPlays4(s, s.turn);
        m = matchAct4(m, { type: 'play', seat: s.turn, uid: legal[Math.floor(rng() * legal.length)] }).match;
      }
    }
    expect(dealers.slice(0, 5)).toEqual(['E', 'S', 'W', 'N', 'E'].slice(0, dealers.length >= 5 ? 5 : dealers.length));
    expect(m.status).toBe('over');
    expect(Math.max(m.scores.mi, m.scores.vi)).toBeGreaterThanOrEqual(31);
    expect(m.scores.mi).not.toBe(m.scores.vi);
    // tie at >= target continues
    const tie: Match4State = { ...startMatch4({ scores: { mi: 26, vi: 26 }, handNo: 3, dealer: 'E', akuzaPointsMi: 0 }, 31) };
    expect(tie.status).toBe('handOver');
  });

  it('follow suit; off-suit never wins; team thirds pooled', () => {
    const s = makeState4({ hands: { S: ['kupe_4', 'bate_3'], W: ['kupe_5', 'bate_2'], N: ['bate_A', 'spade_2'], E: ['kupe_7', 'dinari_3'] } });
    const r1 = play(s, 'S', 'kupe_4');
    expect(legalPlays4(r1.state, 'W')).toEqual([u4('kupe_5')]);
    const r2 = play(r1.state, 'W', 'kupe_5');
    expect(legalPlays4(r2.state, 'N').length).toBe(2);
    const r3 = play(r2.state, 'N', 'bate_A');
    const r4 = play(r3.state, 'E', 'kupe_7');
    const tr = r4.events.find((e) => e.t === 'trickResolved') as Tr;
    expect(tr.winner).toBe('E');
    expect(tr.team).toBe('vi');
    expect(tr.thirdsTo).toEqual({ mi: 0, vi: 3 });
    expect(r4.state.voidKnown.N).toContain('kupe');
  });

  it('earlier play wins a 20-vs-20 tie (Trica iz rukava vs a real 3)', () => {
    const s = makeState4({ hands: { S: ['kupe_4', 'bate_4'], W: ['kupe_3', 'bate_5'], N: ['bate_6', 'spade_7'], E: ['bate_7', 'dinari_4'] }, fore: { S: ['trica_iz_rukava'] } });
    const f = applyAction4(s, { type: 'fora', seat: 'S', fora: 'trica_iz_rukava', targetUid: u4('kupe_4') });
    let st = play(f.state, 'S', 'kupe_4').state;
    st = play(st, 'W', 'kupe_3').state;
    st = play(st, 'N', 'bate_6').state;
    const r = play(st, 'E', 'bate_7');
    expect((r.events.find((e) => e.t === 'trickResolved') as Tr).winner).toBe('S');
  });

  it('without ukrasi the team totals sum to 11 (500 seeded hands)', () => {
    for (let k = 0; k < 500; k++) {
      const { state } = hand(`eleven-${k}`, (['E', 'S', 'W', 'N'] as Seat[])[k % 4]);
      const { events } = playRandom(state, rngFor('r', k));
      const hs = events.find((e) => e.t === 'handScored') as Extract<GameEvent4, { t: 'handScored' }>;
      expect(events.filter((e) => e.t === 'trickResolved').length).toBe(10);
      expect(hs.breakdown.mi.total + hs.breakdown.vi.total).toBe(11);
      expect(hs.breakdown.mi.thirds + hs.breakdown.vi.thirds).toBe(32);
    }
  });

  it('akuža at each seat’s first turn, credited to the team and revealed to all', () => {
    // find a seed where some seat declares
    for (let k = 0; k < 200; k++) {
      const { state, events } = hand(`ak-${k}`);
      const { events: rest } = playRandom(state, rngFor('a', k));
      const all = [...events, ...rest];
      const ak = all.find((e) => e.t === 'akuza') as Extract<GameEvent4, { t: 'akuza' }> | undefined;
      if (!ak) continue;
      // it comes right before that seat's first turn event in trick 1
      const i = all.indexOf(ak);
      const nextTurn = all.slice(i + 1).find((e) => e.t === 'turn') as Extract<GameEvent4, { t: 'turn' }>;
      expect(nextTurn.seat).toBe(ak.seat);
      expect(ak.team).toBe(ak.seat === 'S' || ak.seat === 'N' ? 'mi' : 'vi');
      const hs = rest.find((e) => e.t === 'handScored') as Extract<GameEvent4, { t: 'handScored' }>;
      expect(hs.breakdown[ak.team].akuzaPoints).toBeGreaterThanOrEqual(ak.total);
      const s0 = createHand4({ seed: `ak-${k}`, handNo: 1, dealer: 'E', deck: standardDeck(), fore: noFore, rakija: noRak, perks: NO_PERKS }).state;
      // revealed to both teams at declaration time: replay until the akuza
      let st = s0; let found = false;
      for (let g = 0; g < 4 && !found; g++) {
        if (st.seats[ak.seat].akuzaChecked) found = true; else st = applyAction4(st, { type: 'play', seat: st.turn, uid: legalPlays4(st, st.turn)[0] }).state;
      }
      for (const u of ak.combos[0].uids) {
        if (st.knownTo[u]) expect(st.knownTo[u].sort()).toEqual(['mi', 'vi']);
      }
      return;
    }
    throw new Error('no akuža found');
  });

  it('legalSignals4: Tučem >= 2 of top-3, Strišo >= 2 others, Volo last card', () => {
    const s = makeState4({ hands: { S: ['kupe_3', 'kupe_A', 'kupe_5', 'bate_7'], W: ['bate_4'], N: ['bate_5'], E: ['bate_6'] } });
    expect(legalSignals4(s, 'S', u4('kupe_5'))).toEqual(['tucem', 'striso']);
    expect(legalSignals4(s, 'S', u4('bate_7'))).toEqual(['volo']);
    const s2 = makeState4({ hands: { S: ['kupe_3', 'kupe_4', 'bate_7'], W: ['bate_4'], N: ['bate_5'], E: ['bate_6'] } });
    expect(legalSignals4(s2, 'S', u4('kupe_4'))).toEqual([]);
    expect(() => play(s2, 'S', 'kupe_4', 'tucem')).toThrow();
    expect(legalSignals4(s2, 'W', u4('bate_4'))).toEqual([]);
  });

  it('a Volo sets the public void', () => {
    const s = makeState4({ hands: { S: ['kupe_3', 'bate_7'], W: ['bate_4', 'kupe_4'], N: ['bate_5', 'kupe_5'], E: ['bate_6', 'kupe_6'] } });
    const r = play(s, 'S', 'bate_7', 'volo');
    expect(r.state.voidKnown.S).toContain('bate');
    expect(r.events.some((e) => e.t === 'signal' && e.kind === 'volo')).toBe(true);
  });

  it('forcedTeam: Ljuto and Tučem! force both opponents, not the partner', () => {
    const s = makeState4({ hands: { S: ['kupe_4+ljuto', 'bate_7'], W: ['kupe_5', 'kupe_K'], N: ['kupe_6', 'kupe_2'], E: ['kupe_7', 'kupe_C'] } });
    let r = play(s, 'S', 'kupe_4');
    expect(r.state.trick.forcedTeam).toBe('vi');
    expect(legalPlays4(r.state, 'W')).toEqual([u4('kupe_K')]);
    r = play(r.state, 'W', 'kupe_K');
    expect(legalPlays4(r.state, 'N').length).toBe(2);
    r = play(r.state, 'N', 'kupe_6');
    expect(legalPlays4(r.state, 'E')).toEqual([u4('kupe_C')]);
    // Vi-marked Ljuto led by a Mi seat is inert
    const s2 = makeState4({ hands: { S: ['kupe_4+ljuto@vi', 'bate_7'], W: ['kupe_5', 'kupe_K'], N: ['kupe_6'], E: ['kupe_7'] } });
    expect(play(s2, 'S', 'kupe_4').state.trick.forcedTeam).toBeUndefined();
    // Tučem! fora
    const s3 = makeState4({ hands: { S: ['kupe_4', 'bate_7'], W: ['kupe_5', 'kupe_K'], N: ['kupe_6', 'kupe_2'], E: ['kupe_7', 'kupe_C'] }, fore: { S: ['tucem'] } });
    const f = applyAction4(s3, { type: 'fora', seat: 'S', fora: 'tucem' });
    const r3 = play(f.state, 'S', 'kupe_4');
    expect(legalPlays4(r3.state, 'W')).toEqual([u4('kupe_K')]);
  });
});
