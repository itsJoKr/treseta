import { describe, expect, it } from 'vitest';
import { detectNewAkuze } from '../src/game/akuze';
import { standardDeck } from '../src/game/cards';
import { applyMatchMods, canForge, forgeInDeck, identFor, MAX_FORGES } from '../src/game/forge';
import { applyAction } from '../src/game/rules';
import { applyAction4, createHand4 } from '../src/game/rules4';
import type { CardInst, GameEvent } from '../src/game/types';
import type { GameEvent4 } from '../src/game/types4';
import { NO_PERKS } from '../src/game/types4';
import { card, makeState, uid } from './helpers';
import { makeState4, u4 } from './helpers4';

describe('forgeries and identity (§19.4)', () => {
  it('ident() per holder: a Mi forgery is its copy for Mi, its printed card for Vi', () => {
    const deck = forgeInDeck(standardDeck(), 'bate_4', { suit: 'kupe', rank: '3' }, 'mi');
    const f = deck.find((c) => c.slot === 'bate_4')!;
    expect(identFor(f, 'mi')).toMatchObject({ suit: 'kupe', rank: '3', slot: 'bate_4' });
    expect(identFor(f, 'vi')).toMatchObject({ suit: 'bate', rank: '4', slot: 'bate_4' });
    // dealt in Partneri: S/N hold the copy, W/E the printed card
    for (let k = 0; k < 40; k++) {
      const { state } = createHand4({ seed: `id${k}`, handNo: 1, dealer: 'E', deck, fore: { S: [], W: [], N: [], E: [] }, rakija: { S: 0, W: 0, N: 0, E: 0 }, perks: NO_PERKS });
      for (const seat of ['S', 'W', 'N', 'E'] as const) {
        const c = state.seats[seat].hand.find((x) => x.uid === 'p:bate_4');
        if (!c) continue;
        if (seat === 'S' || seat === 'N') expect([c.suit, c.rank]).toEqual(['kupe', '3']);
        else expect([c.suit, c.rank]).toEqual(['bate', '4']);
      }
    }
  });

  it('equal effective strength → the earlier play wins (forged 3 vs real 3; Trica vs 3)', () => {
    const s = makeState({ player: { hand: ['kupe_3'] }, bot: { hand: ['bate_4=kupe_3'] }, leader: 'player', trickNo: 20 });
    const r = applyAction(applyAction(s, { type: 'play', side: 'player', uid: uid('kupe_3') }).state, { type: 'play', side: 'bot', uid: uid('bate_4') });
    const tr = r.events.find((e) => e.t === 'trickResolved') as Extract<GameEvent, { t: 'trickResolved' }>;
    expect(tr.winner).toBe('player');
    const s2 = makeState({ player: { hand: ['kupe_4'], fore: ['trica_iz_rukava'] }, bot: { hand: ['kupe_3'] }, leader: 'bot', trickNo: 20 });
    const t1 = applyAction(s2, { type: 'play', side: 'bot', uid: uid('kupe_3') });
    const t2 = applyAction(t1.state, { type: 'fora', side: 'player', fora: 'trica_iz_rukava', targetUid: uid('kupe_4') });
    const t3 = applyAction(t2.state, { type: 'play', side: 'player', uid: uid('kupe_4') });
    expect((t3.events.find((e) => e.t === 'trickResolved') as Extract<GameEvent, { t: 'trickResolved' }>).winner).toBe('bot');
    // Partneri: forged 3 played after the real 3 loses
    let p = makeState4({ hands: { S: ['kupe_3', 'bate_6'], W: ['kupe_4', 'bate_5'], N: ['bate_4=kupe_3', 'spade_4'], E: ['kupe_5', 'spade_5'] } });
    p = applyAction4(p, { type: 'play', seat: 'S', uid: u4('kupe_3') }).state;
    p = applyAction4(p, { type: 'play', seat: 'W', uid: u4('kupe_4') }).state;
    p = applyAction4(p, { type: 'play', seat: 'N', uid: u4('bate_4') }).state;
    const r4 = applyAction4(p, { type: 'play', seat: 'E', uid: u4('kupe_5') });
    expect((r4.events.find((e) => e.t === 'trickResolved') as Extract<GameEvent4, { t: 'trickResolved' }>).winner).toBe('S');
  });

  it('akuže never count a duplicate identity (napolitana / distinct suits)', () => {
    const h = (specs: string[]): CardInst[] => specs.map((x) => card(x, 'player'));
    // forged 3 kupe + real 3 bate + real 3 spade = three 3s
    expect(detectNewAkuze(h(['bate_4=kupe_3', 'bate_3', 'spade_3', 'dinari_7']), {}).total).toBe(3);
    // two 3s of kupe + a 3 of bate is not
    expect(detectNewAkuze(h(['bate_4=kupe_3', 'kupe_3', 'bate_3', 'dinari_7']), {}).total).toBe(0);
    // a duplicate never adds a second napolitana
    expect(detectNewAkuze(h(['kupe_A', 'kupe_2', 'kupe_3', 'bate_4=kupe_3']), {}).combos.filter((c) => c.key.startsWith('napolitana')).length).toBe(1);
  });

  it('forged thirds count for the beneficiary', () => {
    const s = makeState({ player: { hand: ['bate_4=kupe_A'] }, bot: { hand: ['kupe_5'] }, leader: 'player', trickNo: 20 });
    const r = applyAction(applyAction(s, { type: 'play', side: 'player', uid: uid('bate_4') }).state, { type: 'play', side: 'bot', uid: uid('kupe_5') });
    const tr = r.events.find((e) => e.t === 'trickResolved') as Extract<GameEvent, { t: 'trickResolved' }>;
    expect(tr.thirdsTo.player).toBe(3);
    expect(tr.special).toBe('forge');
  });

  it('Falsa only on a lišina without ukras/forgery, max 4, deck stays 40; Vi forgeries are per match only', () => {
    let d = standardDeck();
    expect(canForge(d, 'kupe_A')).toBe(false);
    d = d.map((c) => (c.suit === 'kupe' && c.rank === '7' ? { ...c, ukras: 'pijano' as const } : c));
    expect(canForge(d, 'kupe_7')).toBe(false);
    for (const k of ['kupe_6', 'kupe_5', 'kupe_4', 'bate_7']) d = forgeInDeck(d, k, { suit: 'spade', rank: '2' });
    expect(d.filter((c) => c.forge).length).toBe(MAX_FORGES);
    expect(canForge(d, 'bate_6')).toBe(false);
    expect(d.length).toBe(40);
    const base = standardDeck();
    const m = applyMatchMods(base, { marks: [], forgeries: ['3', 'A'] }, 'vf', 'dvoboj', 5, 0);
    expect(m.filter((c) => c.forge?.team === 'vi').length).toBe(2);
    expect(base.some((c) => c.forge)).toBe(false);
  });
});
