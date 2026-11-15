import { standardDeck } from '../src/game/cards';
import { describe, expect, it } from 'vitest';
import { detectNewAkuze } from '../src/game/akuze';
import { applyAction, createHand } from '../src/game/rules';
import type { DeckCard, GameEvent } from '../src/game/types';
import { card, makeState, uid } from './helpers';

const H = (...specs: string[]) => specs.map((s) => card(s, 'player'));

describe('akuze', () => {
  it('napolitana', () => {
    const r = detectNewAkuze(H('kupe_A', 'kupe_2', 'kupe_3', 'bate_5'), {});
    expect(r.combos.length).toBe(1);
    expect(r.combos[0].key).toBe('napolitana:kupe');
    expect(r.combos[0].points).toBe(3);
    expect(r.total).toBe(3);
    expect(r.combos[0].label).toContain('NAPOLITANA');
  });

  it('three and four of a kind', () => {
    const r3 = detectNewAkuze(H('kupe_3', 'bate_3', 'spade_3', 'dinari_5'), {});
    expect(r3.combos.map((c) => [c.key, c.points])).toEqual([['kind:3', 3]]);
    expect(r3.combos[0].label).toBe('TRI TRICE!');
    const r4 = detectNewAkuze(H('kupe_A', 'bate_A', 'spade_A', 'dinari_A'), {});
    expect(r4.combos.map((c) => [c.key, c.points])).toEqual([['kind:A', 4]]);
    expect(r4.combos[0].label).toBe('ČETIRI AŠA!');
  });

  it('upgrade 3 -> 4 gives +1, no double scoring', () => {
    const first = detectNewAkuze(H('kupe_2', 'bate_2', 'spade_2'), {});
    expect(first.total).toBe(3);
    const again = detectNewAkuze(H('kupe_2', 'bate_2', 'spade_2'), first.declared);
    expect(again.total).toBe(0);
    const up = detectNewAkuze(H('kupe_2', 'bate_2', 'spade_2', 'dinari_2'), first.declared);
    expect(up.total).toBe(1);
    expect(up.combos[0].upgrade).toBe(true);
    expect(up.declared['kind:2']).toBe(4);
    const after = detectNewAkuze(H('kupe_2', 'bate_2', 'spade_2', 'dinari_2'), up.declared);
    expect(after.total).toBe(0);
  });

  it('same card counts in several combinations', () => {
    const r = detectNewAkuze(H('kupe_A', 'kupe_2', 'kupe_3', 'bate_3', 'spade_3'), {});
    expect(r.combos.map((c) => c.key).sort()).toEqual(['kind:3', 'napolitana:kupe']);
    expect(r.total).toBe(6);
  });

  it('check after a draw', () => {
    const s = makeState({ player: { hand: ['kupe_A', 'kupe_2', 'bate_4'] }, bot: { hand: ['bate_5', 'dinari_4'] }, leader: 'player', mac: ['spade_4', 'kupe_3'] });
    let r = applyAction(s, { type: 'play', side: 'player', uid: uid('bate_4', 'player') });
    r = applyAction(r.state, { type: 'play', side: 'bot', uid: uid('bate_5', 'bot') });
    const ak = r.events.find((e) => e.t === 'akuza') as Extract<GameEvent, { t: 'akuza' }>;
    expect(ak).toBeDefined();
    expect(ak.side).toBe('player');
    expect(ak.total).toBe(3);
    expect(r.state.sides.player.akuzaPoints).toBe(3);
    // akuza event comes after the player's draw
    const iDraw = r.events.findIndex((e) => e.t === 'cardDrawn' && e.side === 'player');
    expect(r.events.indexOf(ak)).toBeGreaterThan(iDraw);
  });

  it('Glasno +2 for new combos, not for upgrades', () => {
    const r = detectNewAkuze(H('kupe_3+glasno', 'bate_3', 'spade_3'), {});
    expect(r.total).toBe(5);
    expect(r.combos[0].glasno).toBe(2);
    const up = detectNewAkuze(H('kupe_3+glasno', 'bate_3', 'spade_3', 'dinari_3'), r.declared);
    expect(up.total).toBe(1);
  });

  it('Divlje best assignment', () => {
    // Divlje 5 of kupe can be the missing 3 of kupe -> napolitana kupe (3)
    const r = detectNewAkuze(H('kupe_A', 'kupe_2', 'kupe_5+divlje'), {});
    expect(r.total).toBe(3);
    expect(r.combos[0].key).toBe('napolitana:kupe');
    // as the 3 it makes both napolitana and three 3s: 6 > any single
    const r2 = detectNewAkuze(H('kupe_A', 'kupe_2', 'kupe_5+divlje', 'bate_3', 'spade_3'), {});
    expect(r2.total).toBe(6);
    // duplicate identity adds nothing
    const r3 = detectNewAkuze(H('kupe_A', 'kupe_5+divlje', 'bate_7'), {});
    expect(r3.total).toBe(0);
    // Divlje 2 bate counts as A bate to complete three aces (prefers real if it doesn't matter)
    const r4 = detectNewAkuze(H('kupe_A', 'spade_A', 'bate_2+divlje'), {});
    expect(r4.combos.map((c) => c.key)).toEqual(['kind:A']);
  });

  it('reveal uids: combo cards become known to the opponent', () => {
    const deck: DeckCard[] = standardDeck();
    // put the napolitana in the first 10 by using a deck where shuffle can't miss: find a seed
    for (let k = 0; k < 200; k++) {
      const { state, events } = createHand({ seed: `ak${k}`, handNo: 1, dealer: 'bot', deck, fore: { player: [], bot: [] }, rakija: { player: 3, bot: 0 } });
      const ak = events.find((e) => e.t === 'akuza' && e.side === 'player') as Extract<GameEvent, { t: 'akuza' }> | undefined;
      if (!ak) continue;
      for (const u of ak.combos[0].uids) expect(state.sides.player.knownByOpp).toContain(u);
      return;
    }
    throw new Error('no seed produced a napolitana');
  });
});
