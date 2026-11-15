import { describe, expect, it } from 'vitest';
import { RANKS, standardDeck } from '../src/game/cards';
import { applyAction, createHand, effectiveStrength, legalPlays } from '../src/game/rules';
import type { GameEvent, HandState, Side } from '../src/game/types';
import { makeState, uid } from './helpers';

function play(s: HandState, side: Side, u: string) {
  return applyAction(s, { type: 'play', side, uid: u });
}

/** Play out a hand with "first legal card" for both sides. */
function playOut(s: HandState): { state: HandState; events: GameEvent[] } {
  const all: GameEvent[] = [];
  let st = s;
  let guard = 0;
  while (st.phase !== 'over' && guard++ < 200) {
    if (st.phase === 'pending') {
      const p = st.pending!;
      const r = applyAction(st, p.kind === 'pickDraw' ? { type: 'resolvePending', side: p.side, pick: p.uids[0] } : { type: 'resolvePending', side: p.side, order: p.uids });
      st = r.state; all.push(...r.events); continue;
    }
    const legal = legalPlays(st, st.turn);
    const r = play(st, st.turn, legal[0]);
    st = r.state; all.push(...r.events);
  }
  return { state: st, events: all };
}

function stdHand(seed = 'seed-1') {
  return createHand({
    seed, handNo: 1, dealer: 'bot',
    deck: standardDeck(),
    fore: { player: [], bot: [] }, rakija: { player: 3, bot: 0 },
  });
}

describe('rules', () => {
  it('rank order 3 > 2 > A > K > C > F > 7 > 6 > 5 > 4', () => {
    expect(RANKS).toEqual(['3', '2', 'A', 'K', 'C', 'F', '7', '6', '5', '4']);
    for (let i = 0; i < RANKS.length - 1; i++) {
      const hi = RANKS[i];
      const lo = RANKS[i + 1];
      const s = makeState({ player: { hand: [`kupe_${lo}`] }, bot: { hand: [`kupe_${hi}`] }, leader: 'player', trickNo: 20 });
      const r1 = play(s, 'player', uid(`kupe_${lo}`, 'player'));
      const r2 = play(r1.state, 'bot', uid(`kupe_${hi}`, 'bot'));
      const tr = r2.events.find((e) => e.t === 'trickResolved') as Extract<GameEvent, { t: 'trickResolved' }>;
      expect(tr.winner).toBe('bot');
    }
  });

  it('equal strength: the earlier play wins (a forged 3 vs the real 3)', () => {
    const s = makeState({ player: { hand: ['bate_4=kupe_3'] }, bot: { hand: ['kupe_3'] }, leader: 'bot', trickNo: 20 });
    const r1 = play(s, 'bot', uid('kupe_3'));
    const r2 = play(r1.state, 'player', uid('bate_4'));
    const tr = r2.events.find((e) => e.t === 'trickResolved') as Extract<GameEvent, { t: 'trickResolved' }>;
    expect(tr.winner).toBe('bot');
  });

  it('off-suit never wins', () => {
    const s = makeState({ player: { hand: ['kupe_4'] }, bot: { hand: ['bate_3'] }, leader: 'player', trickNo: 20 });
    const r1 = play(s, 'player', uid('kupe_4'));
    const r2 = play(r1.state, 'bot', uid('bate_3', 'bot'));
    const tr = r2.events.find((e) => e.t === 'trickResolved') as Extract<GameEvent, { t: 'trickResolved' }>;
    expect(tr.winner).toBe('player');
  });

  it('follow-suit legality', () => {
    const s = makeState({ player: { hand: ['kupe_4', 'bate_5'] }, bot: { hand: ['kupe_7', 'kupe_3', 'bate_2'] }, leader: 'player' });
    const r1 = play(s, 'player', uid('kupe_4'));
    const legal = legalPlays(r1.state, 'bot');
    expect(legal.sort()).toEqual([uid('kupe_7', 'bot'), uid('kupe_3', 'bot')].sort());
    expect(() => play(r1.state, 'bot', uid('bate_2', 'bot'))).toThrow();
    // void -> anything legal
    const s2 = makeState({ player: { hand: ['dinari_4', 'bate_5'] }, bot: { hand: ['kupe_7', 'kupe_3', 'bate_2'] }, leader: 'player' });
    const r2 = play(s2, 'player', uid('dinari_4', 'player'));
    expect(legalPlays(r2.state, 'bot').length).toBe(3);
  });

  it('forcedHighest via Ljuto lead', () => {
    const s = makeState({ player: { hand: ['kupe_4+ljuto', 'bate_5'] }, bot: { hand: ['kupe_7', 'kupe_3', 'kupe_5'] }, leader: 'player' });
    const r1 = play(s, 'player', uid('kupe_4'));
    expect(r1.state.trick.forcedHighest).toBe(true);
    expect(legalPlays(r1.state, 'bot')).toEqual([uid('kupe_3', 'bot')]);
  });

  it('forcedHighest via Tučem!', () => {
    const s = makeState({ player: { hand: ['kupe_4', 'bate_5'], fore: ['tucem'] }, bot: { hand: ['kupe_7', 'kupe_2', 'kupe_5'] }, leader: 'player' });
    const f = applyAction(s, { type: 'fora', side: 'player', fora: 'tucem' });
    const r1 = play(f.state, 'player', uid('kupe_4'));
    expect(legalPlays(r1.state, 'bot')).toEqual([uid('kupe_2', 'bot')]);
  });

  it('one 40-card deck: 10 + 10 dealt in packets, a shared mac of 20; 20 tricks, every card played once', () => {
    const { state, events } = stdHand();
    const dealt = events.find((e) => e.t === 'dealt') as Extract<GameEvent, { t: 'dealt' }>;
    expect(dealt.hands.player.length).toBe(10);
    expect(dealt.hands.bot.length).toBe(10);
    expect(dealt.mac.length).toBe(20);
    const all = [...dealt.hands.player, ...dealt.hands.bot, ...dealt.mac];
    expect(new Set(all).size).toBe(40);
    for (const u of all) expect(u.startsWith('p:')).toBe(true);
    for (const c of state.sides.bot.hand) expect(c.owner).toBe('bot');
    const { state: end, events: evs } = playOut(state);
    expect(end.phase).toBe('over');
    expect(evs.filter((e) => e.t === 'trickResolved').length).toBe(20);
    const played = evs.filter((e) => e.t === 'cardPlayed').map((e) => (e as Extract<GameEvent, { t: 'cardPlayed' }>).uid);
    expect(played.length).toBe(40);
    expect(new Set(played).size).toBe(40);
    expect(end.mac.length).toBe(0);
  });

  it('the winner draws first; 10 hidden draws per side; draws never add to knownByOpp', () => {
    const { state } = stdHand('draws');
    const { state: end, events } = playOut(state);
    const draws = events.filter((e) => e.t === 'cardDrawn') as Extract<GameEvent, { t: 'cardDrawn' }>[];
    expect(draws.filter((d) => d.side === 'player').length).toBe(10);
    expect(draws.filter((d) => d.side === 'bot').length).toBe(10);
    for (let i = 0; i < events.length; i++) {
      const e = events[i];
      if (e.t === 'trickResolved' && e.trickNo <= 10) {
        const next = events.slice(i + 1).find((x) => x.t === 'cardDrawn') as Extract<GameEvent, { t: 'cardDrawn' }>;
        expect(next.side).toBe(e.winner);
      }
    }
    const s = makeState({ player: { hand: ['kupe_4', 'bate_5'] }, bot: { hand: ['kupe_7', 'bate_4'] }, leader: 'player', mac: ['dinari_6', 'spade_2'] });
    const r2 = play(play(s, 'player', uid('kupe_4')).state, 'bot', uid('kupe_7'));
    expect(r2.state.sides.bot.knownByOpp).toEqual([]);
    expect(r2.state.sides.player.knownByOpp).toEqual([]);
    expect(end.sides.player.hand.length + end.sides.bot.hand.length).toBe(0);
  });

  it('voids: set on a failed follow, cleared on each draw, exact once the mac is empty', () => {
    const s = makeState({ player: { hand: ['kupe_4', 'bate_5'] }, bot: { hand: ['dinari_7', 'bate_4'] }, leader: 'bot', mac: ['kupe_6', 'spade_2'] });
    const r1 = play(s, 'bot', uid('dinari_7'));
    const r2 = play(r1.state, 'player', uid('kupe_4'));
    // the player failed to follow dinari, then drew a hidden card → the void is no longer known
    expect(r2.events.some((e) => e.t === 'cardDrawn' && e.side === 'player')).toBe(true);
    expect(r2.state.sides.player.voidKnown).not.toContain('dinari');
    const s2 = makeState({ player: { hand: ['kupe_4', 'bate_5'] }, bot: { hand: ['dinari_7', 'bate_4'] }, leader: 'bot', trickNo: 11 });
    const a = play(s2, 'bot', uid('dinari_7'));
    const b = play(a.state, 'player', uid('kupe_4'));
    expect(b.state.sides.player.voidKnown).toContain('dinari');
  });

  it('Vrati! re-lead excludes the returned card', () => {
    const s = makeState({ player: { hand: ['kupe_4', 'bate_5'] }, bot: { hand: ['kupe_3', 'bate_2', 'spade_4'], fore: ['vrati'], rakija: 3 }, leader: 'player' });
    const r1 = play(s, 'player', uid('kupe_4'));
    const v = applyAction(r1.state, { type: 'fora', side: 'bot', fora: 'vrati' });
    expect(v.state.turn).toBe('player');
    expect(v.state.phase).toBe('lead');
    expect(legalPlays(v.state, 'player')).toEqual([uid('bate_5')]);
    expect(v.state.sides.player.knownByOpp).toContain(uid('kupe_4'));
    expect(v.state.sides.bot.rakija).toBe(1);
  });

  it('Ti otvaraj swaps the leader', () => {
    const s = makeState({ player: { hand: ['kupe_4', 'bate_5'], fore: ['ti_otvaraj'] }, bot: { hand: ['kupe_3', 'bate_2'] }, leader: 'player' });
    const r = applyAction(s, { type: 'fora', side: 'player', fora: 'ti_otvaraj' });
    expect(r.state.turn).toBe('bot');
    expect(r.state.trick.leader).toBe('bot');
    expect(legalPlays(r.state, 'bot').length).toBe(2);
    expect(legalPlays(r.state, 'player').length).toBe(0);
  });

  it('Napij ga forces a random legal play', () => {
    const s = makeState({ player: { hand: ['kupe_4', 'bate_5'], fore: ['napij_ga'] }, bot: { hand: ['kupe_3', 'kupe_2', 'kupe_A', 'bate_2'] }, leader: 'player' });
    const f = applyAction(s, { type: 'fora', side: 'player', fora: 'napij_ga' });
    expect(f.state.sides.bot.drunk).toBe(true);
    const r1 = play(f.state, 'player', uid('kupe_4'));
    // bot requests an illegal card; engine ignores it and picks a legal one
    const r2 = play(r1.state, 'bot', uid('bate_2', 'bot'));
    const cp = r2.events.find((e) => e.t === 'cardPlayed' && e.side === 'bot') as Extract<GameEvent, { t: 'cardPlayed' }>;
    expect(cp.drunk).toBe(true);
    expect(cp.uid.startsWith('p:kupe_')).toBe(true);
    expect(r2.state.sides.bot.drunk).toBe(false);
  });

  it('deterministic deal for a fixed seed; the non-dealer leads', () => {
    const a = stdHand('fixed');
    const b = stdHand('fixed');
    const c = stdHand('other');
    expect(a.state.sides.player.hand.map((x) => x.uid)).toEqual(b.state.sides.player.hand.map((x) => x.uid));
    expect(a.state.mac.map((x) => x.uid)).toEqual(b.state.mac.map((x) => x.uid));
    expect(a.state.sides.player.hand.map((x) => x.uid)).not.toEqual(c.state.sides.player.hand.map((x) => x.uid));
    expect(a.state.sides.player.hand.length).toBe(10);
    expect(a.state.mac.length).toBe(20);
    expect(a.state.turn).toBe('player');
  });

  it('input state is never mutated', () => {
    const { state } = stdHand();
    const snap = JSON.stringify(state);
    const legal = legalPlays(state, state.turn);
    play(state, state.turn, legal[0]);
    expect(JSON.stringify(state)).toBe(snap);
  });

  it('effective strength: base x2, Nabrušeno +3, Trica 20', () => {
    const s = makeState({ player: { hand: ['kupe_K+nabruseno', 'bate_5'], fore: ['trica_iz_rukava'] }, bot: { hand: ['kupe_3'] } });
    expect(effectiveStrength(s, uid('kupe_K', 'player'))).toBe(17);
    expect(effectiveStrength(s, uid('bate_5'))).toBe(4);
    const r = applyAction(s, { type: 'fora', side: 'player', fora: 'trica_iz_rukava', targetUid: uid('kupe_K', 'player') });
    expect(effectiveStrength(r.state, uid('kupe_K', 'player'))).toBe(23);
  });
});
