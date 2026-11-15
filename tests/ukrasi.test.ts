import { describe, expect, it } from 'vitest';
import { detectNewAkuze } from '../src/game/akuze';
import { applyAction, effectiveStrength, legalPlays } from '../src/game/rules';
import type { GameEvent, HandState, Side } from '../src/game/types';
import { UKRAS_IDS } from '../src/game/ukrasi';
import { card, makeState, uid } from './helpers';

type Tr = Extract<GameEvent, { t: 'trickResolved' }>;
function trick(s: HandState, a: [Side, string], b: [Side, string]) {
  const r1 = applyAction(s, { type: 'play', side: a[0], uid: uid(a[1], a[0]) });
  const r2 = applyAction(r1.state, { type: 'play', side: b[0], uid: uid(b[1], b[0]) });
  return { state: r2.state, events: [...r1.events, ...r2.events], tr: r2.events.find((e) => e.t === 'trickResolved') as Tr };
}

describe('ukrasi', () => {
  it('there are 11 (with Prevrtljivo, §19.2.3)', () => expect(UKRAS_IDS.length).toBe(11));

  it('pozlaceno: +1 punat to the owner who won', () => {
    const s = makeState({ player: { hand: ['kupe_3+pozlaceno'] }, bot: { hand: ['kupe_4'] }, trickNo: 20 });
    const { tr, state } = trick(s, ['player', 'kupe_3'], ['bot', 'kupe_4']);
    expect(tr.bonus).toEqual([{ side: 'player', ukras: 'pozlaceno', points: 1 }]);
    expect(state.sides.player.bonusPoints).toBe(1);
  });

  it('srebreno: +3 šoldi for the player only (a Mi card that ends in the bot pile pays nothing)', () => {
    const s = makeState({ player: { hand: ['kupe_3+srebreno'] }, bot: { hand: ['kupe_4'] }, trickNo: 20 });
    const { tr, state } = trick(s, ['player', 'kupe_3'], ['bot', 'kupe_4']);
    expect(tr.bonus[0].soldi).toBe(3);
    expect(state.sides.player.soldi).toBe(3);
    const s2 = makeState({ player: { hand: ['kupe_4'] }, bot: { hand: ['kupe_3+srebreno'] }, trickNo: 20 });
    const r2 = trick(s2, ['player', 'kupe_4'], ['bot', 'kupe_3']);
    expect(r2.tr.bonus).toEqual([]);
  });

  it('nabruseno: K beats A but not 2; a 2 beats a led 3; inert for the other side', () => {
    const s = makeState({ player: { hand: ['kupe_A'] }, bot: { hand: ['kupe_K+nabruseno'] }, trickNo: 20 });
    expect(trick(s, ['player', 'kupe_A'], ['bot', 'kupe_K']).tr.winner).toBe('bot');
    const s2 = makeState({ player: { hand: ['kupe_2'] }, bot: { hand: ['kupe_K+nabruseno'] }, trickNo: 20 });
    expect(trick(s2, ['player', 'kupe_2'], ['bot', 'kupe_K']).tr.winner).toBe('player');
    const s3 = makeState({ player: { hand: ['kupe_3'] }, bot: { hand: ['kupe_2+nabruseno'] }, trickNo: 20 });
    expect(trick(s3, ['player', 'kupe_3'], ['bot', 'kupe_2']).tr.winner).toBe('bot');
    expect(effectiveStrength(s3, uid('kupe_2', 'bot'))).toBe(21);
    // a Mi Nabrušeno held by the bot is a plain card (§19.3.3)
    const s4 = makeState({ player: { hand: ['kupe_A'] }, bot: { hand: ['kupe_K+nabruseno@mi'] }, trickNo: 20 });
    expect(trick(s4, ['player', 'kupe_A'], ['bot', 'kupe_K']).tr.winner).toBe('player');
  });

  it('ljuto: leading it forces the highest card of the suit', () => {
    const s = makeState({ player: { hand: ['kupe_4+ljuto', 'bate_4'] }, bot: { hand: ['kupe_5', 'kupe_K', 'bate_3'] } });
    const r = applyAction(s, { type: 'play', side: 'player', uid: uid('kupe_4', 'player') });
    expect(legalPlays(r.state, 'bot')).toEqual([uid('kupe_K', 'bot')]);
    // following with a Ljuto card has no effect
    const s2 = makeState({ player: { hand: ['kupe_4', 'bate_4'] }, bot: { hand: ['kupe_5+ljuto', 'kupe_K'] }, leader: 'bot' });
    const r2 = applyAction(s2, { type: 'play', side: 'bot', uid: uid('kupe_K', 'bot') });
    expect(r2.state.trick.forcedHighest).toBe(false);
  });

  it('usoljeno: thirds stay with the owner on a lost trick', () => {
    const s = makeState({ player: { hand: ['kupe_K+usoljeno'] }, bot: { hand: ['kupe_3'] }, trickNo: 20 });
    const { tr } = trick(s, ['player', 'kupe_K'], ['bot', 'kupe_3']);
    expect(tr.thirdsTo).toEqual({ player: 1, bot: 1 });
  });

  it('pijano: +1 rakija once per card per hand, cap 5', () => {
    const s = makeState({ player: { hand: ['kupe_4+pijano', 'bate_4'], rakija: 2 }, bot: { hand: ['kupe_3', 'bate_3'] } });
    const r = applyAction(s, { type: 'play', side: 'player', uid: uid('kupe_4', 'player') });
    expect(r.state.sides.player.rakija).toBe(3);
    expect(r.events.some((e) => e.t === 'rakija' && e.value === 3)).toBe(true);
    const cap = makeState({ player: { hand: ['kupe_4+pijano'], rakija: 5 }, bot: { hand: ['kupe_3'] } });
    expect(applyAction(cap, { type: 'play', side: 'player', uid: uid('kupe_4', 'player') }).state.sides.player.rakija).toBe(5);
    // returned by Vrati and played again: only once
    const v = makeState({ player: { hand: ['kupe_4+pijano', 'bate_4'], rakija: 1 }, bot: { hand: ['kupe_3', 'bate_3'], fore: ['vrati'], rakija: 2 } });
    let st = applyAction(v, { type: 'play', side: 'player', uid: uid('kupe_4', 'player') }).state;
    expect(st.sides.player.rakija).toBe(2);
    st = applyAction(st, { type: 'fora', side: 'bot', fora: 'vrati' }).state;
    st = applyAction(st, { type: 'play', side: 'player', uid: uid('bate_4', 'player') }).state;
    expect(st.sides.player.rakija).toBe(2);
  });

  it('divlje: wild for akuže only', () => {
    const r = detectNewAkuze([card('bate_A', 'player'), card('bate_2', 'player'), card('bate_7+divlje', 'player')], {});
    expect(r.total).toBe(3);
    const s = makeState({ player: { hand: ['bate_7+divlje'] }, bot: { hand: ['bate_6'] } });
    expect(effectiveStrength(s, uid('bate_7', 'player'))).toBe(8);
  });

  it('glasno: +2 on akuže using it', () => {
    const r = detectNewAkuze([card('bate_A+glasno', 'player'), card('kupe_A', 'player'), card('spade_A', 'player')], {});
    expect(r.total).toBe(5);
  });

  it('ponocno: ultima 3 if it wins the last trick', () => {
    const s = makeState({ player: { hand: ['kupe_7+ponocno'] }, bot: { hand: ['kupe_6'] }, trickNo: 20 });
    expect(trick(s, ['player', 'kupe_7'], ['bot', 'kupe_6']).tr.ultima).toEqual({ side: 'player', points: 3 });
  });

  it('ribarsko: pick one of the top 2 mac cards; the other goes to the bottom', () => {
    const s = makeState({
      player: { hand: ['kupe_3+ribarsko', 'bate_4'], mac: ['spade_4', 'spade_A', 'dinari_7'] },
      bot: { hand: ['kupe_4', 'bate_5'], mac: ['dinari_4', 'dinari_5'] },
    });
    const r = trick(s, ['player', 'kupe_3'], ['bot', 'kupe_4']);
    expect(r.state.phase).toBe('pending');
    const p = r.state.pending!;
    expect(p.kind).toBe('pickDraw');
    expect(p.uids).toEqual([uid('spade_4', 'player'), uid('spade_A', 'player')]);
    // the loser has not drawn yet
    expect(r.state.sides.bot.hand.length).toBe(1);
    const r2 = applyAction(r.state, { type: 'resolvePending', side: 'player', pick: uid('spade_A', 'player') });
    const pl = r2.state.sides.player;
    expect(pl.hand.some((c) => c.uid === uid('spade_A', 'player'))).toBe(true);
    expect(r2.state.mac.map((c) => c.uid)).toEqual([uid('dinari_4', 'bot'), uid('dinari_5', 'bot'), uid('spade_4', 'player')]);
    expect(r2.state.sides.bot.hand.length).toBe(2);
    expect(r2.state.turn).toBe('player');
    expect(r2.state.phase).toBe('lead');
    // with 1 card in mac: normal draw
    const s1 = makeState({ player: { hand: ['kupe_3+ribarsko', 'bate_4'], mac: ['spade_4'] }, bot: { hand: ['kupe_4', 'bate_5'] } });
    expect(trick(s1, ['player', 'kupe_3'], ['bot', 'kupe_4']).state.phase).toBe('lead');
  });
});
