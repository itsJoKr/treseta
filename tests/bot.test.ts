import { describe, expect, it } from 'vitest';
import { chooseCard, chooseFora, choosePending, Eval } from '../src/game/bot';
import { buildView, newMemory, observe } from '../src/game/botMemory';
import { standardDeck } from '../src/game/cards';
import { canUseFora, FORA_IDS, FORE } from '../src/game/fore';
import { OPPONENTS } from '../src/game/opponents';
import { applyMatchMods } from '../src/game/forge';
import { DVOBOJ_LADDER } from '../src/game/ladders';
import { rngFor } from '../src/game/rng';
import { applyAction, createHand, legalPlays } from '../src/game/rules';
import type { Action, DeckCard, GameEvent, HandState, OpponentId } from '../src/game/types';
import { makeState, uid } from './helpers';

// tiers 1-4 at ladder matches 1, 2, 5, 6 (match 5/6 bring Vi marks, forgeries and Briškula)
const TIER_MATCH: Record<OpponentId, number> = { tonci: 0, jure: 1, luka: 4, bepo: 5 };

function simulateHand(opp: OpponentId, k: number, playerFore = false, onBotView?: (s: HandState, v: ReturnType<typeof buildView>, drawn: string[]) => void) {
  const def = OPPONENTS[opp];
  const li = TIER_MATCH[opp];
  const m = DVOBOJ_LADDER[li];
  // the player's deck carries a Prevrtljivo and a forgery in some hands
  const run: DeckCard[] = standardDeck().map((c) => (k % 4 === 1 && c.suit === 'kupe' && c.rank === 'K' ? { ...c, ukras: 'prevrtljivo' as const } : k % 4 === 2 && c.suit === 'bate' && c.rank === '4' ? { ...c, slot: 'bate_4', forge: { suit: 'spade' as const, rank: '3' as const, team: 'mi' as const } } : c));
  const playerDeck: DeckCard[] = applyMatchMods(run, m, `bot-${opp}`, 'dvoboj', li, k);
  let { state, events } = createHand({
    seed: `bot-${opp}-${k}`, handNo: 1, dealer: k % 2 ? 'player' : 'bot',
    deck: playerDeck,
    fore: { player: playerFore ? FORA_IDS.slice(0, 4).concat(['briskula', 'vrati', 'tucem']) : [], bot: m.fore },
    rakija: { player: playerFore ? 5 : 0, bot: m.rakija },
  });
  const drawn: string[] = [];
  const rng = rngFor('bt', opp, k);
  const botRng = rngFor('bot', opp, k);
  let mem = observe(newMemory('bot'), events, def.knobs.memory, botRng);
  const act = (a: Action) => {
    const r = applyAction(state, a);
    state = r.state;
    for (const e of r.events) if (e.t === 'cardDrawn' && e.side === 'player') drawn.push(e.uid);
    mem = observe(mem, r.events, def.knobs.memory, botRng);
    return r.events;
  };
  let guard = 0;
  while (state.phase !== 'over') {
    if (++guard > 400) throw new Error('hand did not finish');
    if (state.phase === 'pending') {
      const p = state.pending!;
      if (p.side === 'bot') {
        const view = buildView(state, mem, playerDeck);
        act({ type: 'resolvePending', side: 'bot', ...choosePending(view) });
      } else {
        act(p.kind === 'pickDraw' ? { type: 'resolvePending', side: 'player', pick: p.uids[1] } : { type: 'resolvePending', side: 'player', order: p.uids.slice().reverse() });
      }
      continue;
    }
    if (state.turn === 'bot') {
      const view = buildView(state, mem, playerDeck);
      onBotView?.(state, view, drawn);
      const tentative = chooseCard(view, def.knobs, botRng);
      expect(view.legal).toContain(tentative);
      const dec = chooseFora(view, tentative);
      for (const f of dec.fore) {
        expect(canUseFora(state, 'bot', f.fora).ok).toBe(true);
        expect(FORE[f.fora].botMayOwn).toBe(true);
        act({ type: 'fora', side: 'bot', fora: f.fora, targetUid: f.targetUid });
      }
      const legal = legalPlays(state, 'bot');
      expect(legal).toContain(dec.card);
      act({ type: 'play', side: 'bot', uid: dec.card });
    } else {
      if (playerFore && rng() < 0.3) {
        const usable = FORA_IDS.filter((f) => canUseFora(state, 'player', f).ok);
        if (usable.length) {
          const f = usable[Math.floor(rng() * usable.length)];
          const target = FORE[f].needsTarget ? state.sides.player.hand[Math.floor(rng() * state.sides.player.hand.length)].uid : undefined;
          act({ type: 'fora', side: 'player', fora: f, targetUid: target });
          continue;
        }
      }
      const legal = legalPlays(state, 'player');
      act({ type: 'play', side: 'player', uid: legal[Math.floor(rng() * legal.length)] });
    }
  }
  return state;
}

describe('bot', () => {
  for (const opp of ['tonci', 'jure', 'luka', 'bepo'] as OpponentId[]) {
    it(`only returns legal moves across 300 seeded hands (${opp}; forgeries, Prevrtljivo, Briškula present)`, () => {
      for (let k = 0; k < 300; k++) {
        const end = simulateHand(opp, k, k % 3 === 0);
        expect(end.phase).toBe('over');
      }
    }, 120_000);
  }

  it('BotView never contains a uid the player drew unless it was revealed (300 seeded hands)', () => {
    let checks = 0;
    for (let k = 0; k < 300; k++) {
      simulateHand(k % 2 ? 'luka' : 'jure', k, k % 3 === 0, (st, view, drawn) => {
        const { unseen, ...rest } = view;
        void unseen;
        const json = JSON.stringify(rest);
        for (const u of drawn) {
          if (!st.sides.player.hand.some((c) => c.uid === u)) continue;
          if (st.sides.player.knownByOpp.includes(u)) continue;
          expect(json.includes(u)).toBe(false);
          checks++;
        }
      });
    }
    expect(checks).toBeGreaterThan(100);
  });

  it('pHas = handUnknown / (handUnknown + mac), and 1 once the mac is empty', () => {
    const s = makeState({ player: { hand: ['kupe_4', 'bate_5', 'spade_6'] }, bot: { hand: ['dinari_7', 'bate_4'] }, leader: 'bot', mac: ['kupe_C', 'spade_C', 'dinari_C'] });
    const v = buildView(s, newMemory('bot'), standardDeck());
    const e = new Eval(v);
    expect(e.pHas(uid('kupe_4'))).toBeCloseTo(3 / 6);
    const s2 = makeState({ player: { hand: ['kupe_4', 'bate_5'] }, bot: { hand: ['dinari_7', 'bate_4'] }, leader: 'bot', trickNo: 12 });
    const e2 = new Eval(buildView(s2, newMemory('bot'), standardDeck()));
    expect(e2.pHas(uid('kupe_4'))).toBe(1);
  });

  it('memory filter: forgotten observations are lost', () => {
    const s = makeState({ player: { hand: ['kupe_4', 'bate_5', 'dinari_3'], fore: ['vrati'] }, bot: { hand: ['kupe_7', 'bate_4'] } });
    s.sides.player.knownByOpp.push(uid('dinari_3'));
    const r1 = applyAction(s, { type: 'play', side: 'player', uid: uid('kupe_4', 'player') });
    const r2 = applyAction(r1.state, { type: 'play', side: 'bot', uid: uid('kupe_7', 'bot') });
    const evs: GameEvent[] = [...r1.events, ...r2.events];
    const forget = observe(newMemory('bot'), evs, 0, rngFor('m'));
    expect(forget.played).toEqual([]);
    expect(buildView(r2.state, forget, standardDeck()).unseen.some((c) => c.uid === uid('kupe_4'))).toBe(true);
    const remember = observe(newMemory('bot'), evs, 1, rngFor('m'));
    expect(remember.played).toEqual([uid('kupe_4', 'player')]);
    expect(buildView(r2.state, remember, standardDeck()).unseen.some((c) => c.uid === uid('kupe_4'))).toBe(false);
  });

  const knobs = { ...OPPONENTS.jure.knobs, mistakeRate: 0 };

  it('takes a led ace when it can', () => {
    const s = makeState({ player: { hand: ['kupe_A', 'bate_4', 'bate_5'] }, bot: { hand: ['kupe_3', 'kupe_4', 'bate_7'] }, leader: 'player', trickNo: 5 });
    const r = applyAction(s, { type: 'play', side: 'player', uid: uid('kupe_A', 'player') });
    const mem = observe(newMemory('bot'), r.events, 1, rngFor('a'));
    const view = buildView(r.state, mem, standardDeck());
    expect(chooseCard(view, knobs, rngFor('c'))).toBe(uid('kupe_3', 'bot'));
  });

  it("dumps a lišina when it can't win", () => {
    const s = makeState({ player: { hand: ['kupe_3', 'bate_4', 'bate_5'] }, bot: { hand: ['kupe_K', 'kupe_4', 'bate_7'] }, leader: 'player', trickNo: 5 });
    const r = applyAction(s, { type: 'play', side: 'player', uid: uid('kupe_3', 'player') });
    const view = buildView(r.state, observe(newMemory('bot'), r.events, 1, rngFor('a')), standardDeck());
    expect(chooseCard(view, knobs, rngFor('c'))).toBe(uid('kupe_4', 'bot'));
  });

  it('discards off-suit: never an ace while a non-ace exists', () => {
    const s = makeState({ player: { hand: ['dinari_3', 'bate_4', 'bate_5'] }, bot: { hand: ['kupe_A', 'spade_K', 'bate_7'] }, leader: 'player', trickNo: 5 });
    const r = applyAction(s, { type: 'play', side: 'player', uid: uid('dinari_3', 'player') });
    const view = buildView(r.state, observe(newMemory('bot'), r.events, 1, rngFor('a')), standardDeck());
    expect(chooseCard(view, knobs, rngFor('c'))).toBe(uid('bate_7', 'bot'));
  });

  it('keeps a master for the ultima with 2 cards left', () => {
    // macs empty, trick 19; bot holds kupe_3 (master) and bate_4; player hand 2 unknown cards
    const s = makeState({ player: { hand: ['kupe_A', 'bate_K'] }, bot: { hand: ['kupe_3', 'bate_4'] }, leader: 'bot', trickNo: 19 });
    const view = buildView(s, newMemory('bot'), [{ suit: 'kupe', rank: 'A' }, { suit: 'bate', rank: 'K' }, { suit: 'bate', rank: '2' }]);
    const e = new Eval(view);
    expect(e.isMaster(view.hand.find((c) => c.rank === '3')!)).toBe(true);
    expect(chooseCard(view, { ...knobs, pimcMaxCards: 0 }, rngFor('c'))).toBe(uid('bate_4', 'bot'));
  });

  it('PIMC returns a legal move and finds the obvious win', () => {
    const s = makeState({ player: { hand: ['kupe_A', 'bate_K', 'spade_4'] }, bot: { hand: ['kupe_3', 'bate_2', 'spade_5'] }, leader: 'player', trickNo: 18 });
    const r = applyAction(s, { type: 'play', side: 'player', uid: uid('kupe_A', 'player') });
    const view = buildView(r.state, observe(newMemory('bot'), r.events, 1, rngFor('p')), standardDeck());
    expect(chooseCard(view, OPPONENTS.bepo.knobs, rngFor('c'))).toBe(uid('kupe_3', 'bot'));
  });

  it('uses Trica iz rukava on a led ace it cannot beat', () => {
    const s = makeState({ player: { hand: ['kupe_A', 'bate_4'] }, bot: { hand: ['kupe_4', 'kupe_K', 'bate_7'], fore: ['trica_iz_rukava'], rakija: 3 }, leader: 'player', trickNo: 3 });
    // make the player's 3 and 2 of kupe "known played" isn't needed: the bot has no winner over A except K? K < A
    const r = applyAction(s, { type: 'play', side: 'player', uid: uid('kupe_A', 'player') });
    const view = buildView(r.state, observe(newMemory('bot'), r.events, 1, rngFor('a')), standardDeck());
    const tentative = chooseCard(view, knobs, rngFor('c'));
    const d = chooseFora(view, tentative);
    expect(d.fore.map((f) => f.fora)).toContain('trica_iz_rukava');
    expect(d.card).toBe(uid('kupe_4', 'bot'));
  });
});
