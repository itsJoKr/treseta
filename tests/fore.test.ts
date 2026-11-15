import { describe, expect, it } from 'vitest';
import { canUseFora, FORE, FORA_IDS } from '../src/game/fore';
import { applyAction, legalPlays } from '../src/game/rules';
import type { ForaId, GameEvent, HandState } from '../src/game/types';
import { makeState, uid } from './helpers';

function base(fore: ForaId[], extra?: Partial<{ leader: 'player' | 'bot'; rakija: number; mac: string[] }>): HandState {
  return makeState({
    player: { hand: ['kupe_4', 'kupe_K', 'bate_5', 'dinari_3'], mac: extra?.mac ?? ['spade_3', 'spade_2', 'spade_A', 'spade_7'], fore, rakija: extra?.rakija ?? 3 },
    bot: { hand: ['kupe_3', 'kupe_2', 'bate_A', 'spade_4'], mac: extra?.mac ? [] : ['dinari_4', 'dinari_5'] },
    leader: extra?.leader ?? 'player',
  });
}

const fora = (s: HandState, f: ForaId, targetUid?: string) => applyAction(s, { type: 'fora', side: 'player', fora: f, targetUid });

describe('fore', () => {
  it('has the 11 fore with costs from §6.3 (+ Briškula!, §19.2.3)', () => {
    expect(FORA_IDS.length).toBe(11);
    expect(FORE.briskula.cost).toBe(2);
    expect(FORE.vrati.cost).toBe(2);
    expect(FORE.trica_iz_rukava.cost).toBe(2);
    expect(FORE.duplo_ili_nista.cost).toBe(2);
    expect(FORE.pogled.cost).toBe(1);
  });

  it('generic preconditions: not owned, not your turn, once per hand, no rakija, pending', () => {
    const s = base(['pogled', 'krivi_racun']);
    expect(canUseFora(s, 'player', 'tucem').reason).toBe('notOwned');
    const sBot = base(['pogled'], { leader: 'bot' });
    expect(canUseFora(sBot, 'player', 'pogled').reason).toBe('notYourTurn');
    const r = fora(s, 'krivi_racun');
    expect(canUseFora(r.state, 'player', 'krivi_racun').reason).toBe('usedThisHand');
    expect(() => fora(r.state, 'krivi_racun')).toThrow();
    const poor = base(['pogled'], { rakija: 0 });
    expect(canUseFora(poor, 'player', 'pogled').reason).toBe('noRakija');
    const nm = fora(base(['namjesteno', 'pogled']), 'namjesteno');
    expect(canUseFora(nm.state, 'player', 'pogled').reason).toBe('pendingChoice');
  });

  it('pogled: reveals up to 3 unknown cards, then nothingToReveal', () => {
    const s = base(['pogled']);
    const r = fora(s, 'pogled');
    const ev = r.events.find((e) => e.t === 'foraUsed') as Extract<GameEvent, { t: 'foraUsed' }>;
    expect(ev.revealed!.length).toBe(3);
    expect(r.state.sides.bot.knownByOpp.length).toBe(3);
    expect(r.state.sides.player.rakija).toBe(2);
    const s2 = base(['pogled']);
    s2.sides.bot.knownByOpp = s2.sides.bot.hand.map((c) => c.uid);
    expect(canUseFora(s2, 'player', 'pogled').reason).toBe('nothingToReveal');
  });

  it('zamjena: card to the bottom of the shared mac, draw the top hidden; macEmpty', () => {
    const s = base(['zamjena']);
    const r = fora(s, 'zamjena', uid('kupe_4', 'player'));
    const st = r.state.sides.player;
    expect(r.state.mac[r.state.mac.length - 1].uid).toBe(uid('kupe_4', 'player'));
    expect(st.hand.some((c) => c.uid === uid('spade_3', 'player'))).toBe(true);
    expect(st.knownByOpp).not.toContain(uid('spade_3', 'player'));
    const drawn = r.events.find((e) => e.t === 'cardDrawn') as Extract<GameEvent, { t: 'cardDrawn' }>;
    expect(drawn.via).toBe('zamjena');
    expect(canUseFora(base(['zamjena'], { mac: [] }), 'player', 'zamjena').reason).toBe('macEmpty');
    expect(() => fora(s, 'zamjena')).toThrow();
  });

  it('namjesteno: reorder the top 3; macEmpty', () => {
    const s = base(['namjesteno']);
    const r = fora(s, 'namjesteno');
    expect(r.state.phase).toBe('pending');
    const p = r.state.pending!;
    expect(p.kind).toBe('reorderMac');
    const order = p.uids.slice().reverse();
    const r2 = applyAction(r.state, { type: 'resolvePending', side: 'player', order });
    expect(r2.state.mac.slice(0, 3).map((c) => c.uid)).toEqual(order);
    expect(r2.state.mac[3].uid).toBe(uid('spade_7', 'player'));
    expect(r2.state.phase).toBe('lead');
    expect(canUseFora(base(['namjesteno'], { mac: [] }), 'player', 'namjesteno').reason).toBe('macEmpty');
  });

  it('krivi_racun sets the flag', () => {
    const r = fora(base(['krivi_racun']), 'krivi_racun');
    expect(r.state.sides.player.kriviRacun).toBe(true);
  });

  it('ti_otvaraj: leader only, swaps', () => {
    expect(canUseFora(base(['ti_otvaraj']), 'player', 'ti_otvaraj').ok).toBe(true);
    const s = base(['ti_otvaraj'], { leader: 'bot' });
    const s2 = applyAction(s, { type: 'play', side: 'bot', uid: uid('kupe_3', 'bot') }).state;
    expect(canUseFora(s2, 'player', 'ti_otvaraj').reason).toBe('leaderOnly');
    const r = fora(base(['ti_otvaraj']), 'ti_otvaraj');
    expect(r.state.turn).toBe('bot');
  });

  it('tucem: leader only, sets forcedHighest', () => {
    const r = fora(base(['tucem']), 'tucem');
    expect(r.state.trick.forcedHighest).toBe(true);
    const r2 = applyAction(r.state, { type: 'play', side: 'player', uid: uid('kupe_4', 'player') });
    expect(legalPlays(r2.state, 'bot')).toEqual([uid('kupe_3', 'bot')]);
  });

  it('napij_ga sets the opponent drunk', () => {
    const r = fora(base(['napij_ga']), 'napij_ga');
    expect(r.state.sides.bot.drunk).toBe(true);
  });

  it('vrati: follower only, cost 2, oppOneCard', () => {
    expect(canUseFora(base(['vrati']), 'player', 'vrati').reason).toBe('followerOnly');
    const s = base(['vrati'], { leader: 'bot' });
    const s2 = applyAction(s, { type: 'play', side: 'bot', uid: uid('kupe_3', 'bot') }).state;
    expect(canUseFora(s2, 'player', 'vrati').ok).toBe(true);
    const r = fora(s2, 'vrati');
    expect(r.state.sides.player.rakija).toBe(1);
    expect(r.state.turn).toBe('bot');
    expect(legalPlays(r.state, 'bot')).not.toContain(uid('kupe_3', 'bot'));
    // opponent with one card
    const one = makeState({ player: { hand: ['kupe_4', 'bate_4'], fore: ['vrati'] }, bot: { hand: ['kupe_3'] }, leader: 'bot' });
    const one2 = applyAction(one, { type: 'play', side: 'bot', uid: uid('kupe_3', 'bot') }).state;
    expect(canUseFora(one2, 'player', 'vrati').reason).toBe('oppOneCard');
  });

  it('trica_iz_rukava: target strength 20 for the rest of the hand', () => {
    const s = base(['trica_iz_rukava']);
    const r = fora(s, 'trica_iz_rukava', uid('kupe_4', 'player'));
    expect(r.state.sides.player.tricaTarget).toBe(uid('kupe_4', 'player'));
    expect(r.state.sides.player.rakija).toBe(1);
    // led trica-4 vs real 3: leader wins ties
    let st = applyAction(r.state, { type: 'play', side: 'player', uid: uid('kupe_4', 'player') }).state;
    const res = applyAction(st, { type: 'play', side: 'bot', uid: uid('kupe_3', 'bot') });
    const tr = res.events.find((e) => e.t === 'trickResolved') as Extract<GameEvent, { t: 'trickResolved' }>;
    expect(tr.winner).toBe('player');
    void st;
  });

  it('duplo_ili_nista doubles the trick multiplier', () => {
    const r = fora(base(['duplo_ili_nista']), 'duplo_ili_nista');
    expect(r.state.trick.multiplier).toBe(2);
    expect(r.state.sides.player.rakija).toBe(1);
  });
});
