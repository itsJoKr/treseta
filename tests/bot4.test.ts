import { describe, expect, it } from 'vitest';
import { chooseCard4, chooseFora4 } from '../src/game/bot4';
import { buildView4, deckList4, newMemory4, observe4 } from '../src/game/botMemory4';
import type { BotMemory4 } from '../src/game/botMemory4';
import { standardDeck } from '../src/game/cards';
import { knobsFor } from '../src/game/characters';
import type { CharacterId, Knobs4 } from '../src/game/characters';
import { canUseFora4 } from '../src/game/fore4';
import { PAIRS } from '../src/game/ladder4';
import { rngFor } from '../src/game/rng';
import { applyAction4, createHand4, legalPlays4, legalSignals4 } from '../src/game/rules4';
import type { GameEvent4, Hand4State, Seat } from '../src/game/types4';
import { NO_PERKS, TEAM_OF } from '../src/game/types4';
import { makeState4, u4 } from './helpers4';

const deck = standardDeck();
const list = deckList4(deck);
const TIER_CHAR: Record<number, CharacterId> = { 1: 'tonci', 2: 'jure', 3: 'luka', 4: 'bepo' };

function simulate(tier: number, k: number): Hand4State {
  const knobs = knobsFor(TIER_CHAR[tier]);
  const pair = PAIRS[Math.min(3, tier - 1)];
  let { state, events } = createHand4({
    seed: `b4-${tier}-${k}`, handNo: 1, dealer: (['E', 'S', 'W', 'N'] as Seat[])[k % 4], deck,
    fore: { S: k % 2 ? ['pogled', 'napij_ga', 'tucem', 'vrati'] : [], W: pair.fore.W, N: [], E: pair.fore.E },
    rakija: { S: 5, W: pair.rakija.W, N: 0, E: pair.rakija.E }, perks: NO_PERKS,
  });
  const rng = rngFor('bt4', tier, k);
  const mems: Record<string, BotMemory4> = {};
  for (const s of ['W', 'N', 'E'] as Seat[]) mems[s] = observe4(newMemory4(s), events, knobs.memory, rng);
  const act = (a: Parameters<typeof applyAction4>[1]) => {
    const r = applyAction4(state, a);
    state = r.state;
    for (const s of ['W', 'N', 'E'] as Seat[]) mems[s] = observe4(mems[s], r.events, knobs.memory, rng);
    return r.events;
  };
  let g = 0;
  while (state.phase !== 'over') {
    if (++g > 200) throw new Error('hand stuck');
    const seat = state.turn;
    if (seat === 'S') {
      if (state.seats.S.fore.length && rng() < 0.25) {
        const f = state.seats.S.fore[Math.floor(rng() * state.seats.S.fore.length)];
        const tgt: Seat = rng() < 0.5 ? 'W' : 'E';
        if (canUseFora4(state, 'S', f, tgt).ok && (f !== 'pogled' || state.seats[tgt].hand.some((c) => !(state.knownTo[c.uid] ?? []).includes('mi')))) {
          act({ type: 'fora', seat: 'S', fora: f, targetSeat: tgt });
          continue;
        }
      }
      const legal = legalPlays4(state, 'S');
      const uid = legal[Math.floor(rng() * legal.length)];
      const sigs = legalSignals4(state, 'S', uid);
      act({ type: 'play', seat: 'S', uid, signal: sigs.length && rng() < 0.5 ? sigs[0] : undefined });
      continue;
    }
    const view = buildView4(state, mems[seat], list);
    const ch = chooseCard4(view, knobs, rng);
    expect(view.legal).toContain(ch.uid);
    if (ch.signal) expect(legalSignals4(state, seat, ch.uid)).toContain(ch.signal);
    if (TEAM_OF[seat] === 'vi') {
      const dec = chooseFora4(view, ch.uid, knobs);
      for (const f of dec.fore) {
        expect(canUseFora4(state, seat, f.fora, f.targetSeat).ok).toBe(true);
        act({ type: 'fora', seat, fora: f.fora, targetSeat: f.targetSeat, targetUid: f.targetUid });
      }
      if (state.turn !== seat) continue;
      const legal = legalPlays4(state, seat);
      expect(legal).toContain(dec.card);
      act({ type: 'play', seat, uid: dec.card, signal: dec.card === ch.uid ? ch.signal : undefined });
    } else {
      act({ type: 'play', seat, uid: ch.uid, signal: ch.signal });
    }
  }
  return state;
}

function view(st: Hand4State, seat: Seat, k: Partial<Knobs4> = {}) {
  return { v: buildView4(st, observe4(newMemory4(seat), [], 1, rngFor('m')), list), knobs: { ...knobsFor('bepo'), mistakeRate: 0, pimcMaxCards: 0, ...k } };
}
const play = (s: Hand4State, seat: Seat, spec: string, signal?: 'tucem' | 'striso' | 'volo') => applyAction4(s, { type: 'play', seat, uid: u4(spec), signal }).state;

describe('bot4', () => {
  for (const tier of [1, 2, 3, 4]) {
    it(`only legal plays and signals across 300 seeded hands (tier ${tier})`, () => {
      for (let k = 0; k < 300; k++) expect(simulate(tier, k).phase).toBe('over');
    }, 180_000);
  }

  it('BotView4 leaks no card of another hand unless known to the bot’s team (300 hands)', () => {
    for (let k = 0; k < 300; k++) {
      let { state } = createHand4({ seed: `leak-${k}`, handNo: 1, dealer: 'E', deck, fore: { S: ['pogled'], W: [], N: [], E: [] }, rakija: { S: 3, W: 0, N: 0, E: 0 }, perks: { ...NO_PERKS, revealEachHand: k % 2 === 0 } });
      const rng = rngFor('lk', k);
      const steps = Math.floor(rng() * 12);
      for (let i = 0; i < steps && state.phase === 'play'; i++) {
        const legal = legalPlays4(state, state.turn);
        state = applyAction4(state, { type: 'play', seat: state.turn, uid: legal[Math.floor(rng() * legal.length)] }).state;
      }
      for (const seat of ['W', 'N', 'E'] as Seat[]) {
        const v = buildView4(state, newMemory4(seat), list);
        const { unseen, ...rest } = v;
        const json = JSON.stringify(rest);
        for (const other of ['S', 'W', 'N', 'E'] as Seat[]) {
          if (other === seat) continue;
          for (const c of state.seats[other].hand) {
            const knownToTeam = (state.knownTo[c.uid] ?? []).includes(TEAM_OF[seat]);
            if (!knownToTeam) expect(json.includes(c.uid)).toBe(false);
          }
        }
        void unseen;
      }
    }
  });

  it('never overtakes a safe partner card; carico of a non-master A', () => {
    // S leads the master kupe 3, W follows; E is known void in kupe, so S's card is safe for N.
    // kupe 2 is still out (W), so N's kupe A is not a master: carico loads it.
    let s = makeState4({ hands: { S: ['kupe_3', 'bate_4'], W: ['kupe_4', 'kupe_2', 'bate_5'], N: ['kupe_A', 'kupe_K', 'kupe_6'], E: ['bate_6', 'spade_7'] } });
    s.voidKnown.E = ['kupe'];
    s = play(s, 'S', 'kupe_3');
    s = play(s, 'W', 'kupe_4');
    const { v, knobs } = view(s, 'N', { carico: 1 });
    expect(chooseCard4(v, knobs, rngFor('c')).uid).toBe(u4('kupe_A'));
    // carico off: no overtaking, the cheapest discard
    const { v: v2, knobs: k2 } = view(s, 'N', { carico: 0 });
    expect(chooseCard4(v2, k2, rngFor('c')).uid).toBe(u4('kupe_6'));
    // a master A in hand (N also holds the 2) is never thrown as carico
    let s3 = makeState4({ hands: { S: ['kupe_3', 'bate_4'], W: ['kupe_4', 'bate_5'], N: ['kupe_A', 'kupe_2', 'kupe_6'], E: ['bate_6', 'spade_7'] } });
    s3.voidKnown.E = ['kupe'];
    s3 = play(play(s3, 'S', 'kupe_3'), 'W', 'kupe_4');
    const r3 = view(s3, 'N', { carico: 1 });
    expect(chooseCard4(r3.v, r3.knobs, rngFor('c')).uid).toBe(u4('kupe_6'));
  });

  it('obeys Tučem (highest) and Strišo (lowest)', () => {
    let s = makeState4({ hands: { S: ['kupe_3', 'kupe_2', 'kupe_5'], W: ['kupe_4', 'bate_5'], N: ['kupe_A', 'kupe_K', 'kupe_6'], E: ['kupe_7', 'spade_7'] } });
    s = play(s, 'S', 'kupe_5', 'tucem');
    s = play(s, 'W', 'kupe_4');
    const { v, knobs } = view(s, 'N');
    expect(chooseCard4(v, knobs, rngFor('t')).uid).toBe(u4('kupe_A'));
    let s2 = makeState4({ hands: { S: ['kupe_3', 'kupe_C', 'kupe_5', 'bate_4'], W: ['bate_5', 'spade_4'], N: ['kupe_A', 'kupe_K', 'kupe_6'], E: ['kupe_7', 'spade_7'] } });
    s2 = play(s2, 'S', 'kupe_5', 'striso');
    s2 = play(s2, 'W', 'bate_5');
    const r2 = view(s2, 'N');
    expect(chooseCard4(r2.v, r2.knobs, rngFor('s')).uid).toBe(u4('kupe_6'));
  });

  it('returns the suit after the partner’s Tučem; leads a master into a Volo partner’s void', () => {
    const s = makeState4({ hands: { S: ['bate_4'], W: ['bate_5'], N: ['kupe_K', 'kupe_6', 'spade_3', 'bate_7'], E: ['bate_6'] }, leader: 'N', trickNo: 3 });
    s.signalsLog.push({ trickNo: 1, seat: 'S', kind: 'tucem', suit: 'kupe' });
    const { v, knobs } = view(s, 'N');
    const c = chooseCard4(v, knobs, rngFor('r')).uid;
    expect([u4('kupe_K'), u4('kupe_6')]).toContain(c);
    const s2 = makeState4({ hands: { S: ['bate_4'], W: ['bate_5'], N: ['spade_3', 'kupe_6', 'bate_7'], E: ['bate_6'] }, leader: 'N', trickNo: 3 });
    s2.voidKnown.S = ['spade'];
    const r2 = view(s2, 'N');
    expect(chooseCard4(r2.v, r2.knobs, rngFor('v')).uid).toBe(u4('spade_3'));
  });

  it('Vi fore policy: Pogled on the first turn targets the Mi seat with more unknown cards', () => {
    const s = makeState4({ hands: { S: ['kupe_4', 'kupe_5'], W: ['bate_5', 'kupe_3', 'bate_6'], N: ['kupe_6', 'bate_7', 'spade_4'], E: ['kupe_7'] }, leader: 'W', fore: { W: ['pogled'] }, rakija: { W: 1 } });
    const { v, knobs } = view(s, 'W');
    const ch = chooseCard4(v, knobs, rngFor('p'));
    const d = chooseFora4(v, ch.uid, knobs);
    expect(d.fore[0]).toEqual({ fora: 'pogled', targetSeat: 'N' });
  });
});
