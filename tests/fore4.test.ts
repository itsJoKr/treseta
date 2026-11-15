import { describe, expect, it } from 'vitest';
import { canUseFora4 } from '../src/game/fore4';
import { applyAction4, legalPlays4 } from '../src/game/rules4';
import type { ForaId } from '../src/game/types';
import type { GameEvent4, Hand4State, Seat } from '../src/game/types4';
import { makeState4, u4 } from './helpers4';

const hands = { S: ['kupe_4', 'kupe_K', 'bate_5', 'dinari_3'], W: ['kupe_3', 'kupe_2', 'bate_A', 'spade_4'], N: ['spade_3', 'spade_2', 'dinari_A', 'bate_6'], E: ['kupe_5', 'bate_7', 'dinari_7', 'spade_6'] };
function st(fore: ForaId[], leader: Seat = 'S', rakija = 5): Hand4State {
  return makeState4({ hands, leader, fore: { S: fore }, rakija: { S: rakija } });
}
const fora = (s: Hand4State, f: ForaId, extra: { targetUid?: string; targetSeat?: Seat } = {}) => applyAction4(s, { type: 'fora', seat: 'S', fora: f, ...extra });

describe('fore4', () => {
  it('generic reasons: notOwned, notYourTurn, usedThisHand, noRakija', () => {
    expect(canUseFora4(st(['pogled']), 'S', 'tucem').reason).toBe('notOwned');
    expect(canUseFora4(st(['pogled'], 'W'), 'S', 'pogled').reason).toBe('notYourTurn');
    const r = fora(st(['krivi_racun']), 'krivi_racun');
    expect(canUseFora4(r.state, 'S', 'krivi_racun').reason).toBe('usedThisHand');
    expect(canUseFora4(st(['pogled'], 'S', 0), 'S', 'pogled').reason).toBe('noRakija');
  });

  it('pogled targets a chosen opponent seat (reveals up to 3 unknown to the team)', () => {
    expect(() => fora(st(['pogled']), 'pogled')).toThrow();
    expect(() => fora(st(['pogled']), 'pogled', { targetSeat: 'N' })).toThrow();
    const r = fora(st(['pogled']), 'pogled', { targetSeat: 'W' });
    const rev = r.events.find((e) => e.t === 'revealed') as Extract<GameEvent4, { t: 'revealed' }>;
    expect(rev.seat).toBe('W');
    expect(rev.uids.length).toBe(3);
    for (const u of rev.uids) expect(r.state.knownTo[u]).toEqual(['mi']);
    const s2 = st(['pogled']);
    for (const c of [...s2.seats.W.hand, ...s2.seats.E.hand]) s2.knownTo[c.uid] = ['mi'];
    expect(canUseFora4(s2, 'S', 'pogled').reason).toBe('nothingToReveal');
  });

  it('zamjena swaps with a random partner card; both known to the team; partnerEmpty', () => {
    const r = fora(st(['zamjena']), 'zamjena', { targetUid: u4('kupe_4') });
    expect(r.state.seats.N.hand.some((c) => c.uid === u4('kupe_4'))).toBe(true);
    const sw = r.events.find((e) => e.t === 'swapped') as Extract<GameEvent4, { t: 'swapped' }>;
    expect(r.state.seats.S.hand.some((c) => c.uid === sw.b)).toBe(true);
    expect(r.state.knownTo[sw.a]).toContain('mi');
    expect(r.state.knownTo[sw.b]).toContain('mi');
    const empty = makeState4({ hands: { ...hands, N: [] }, fore: { S: ['zamjena'] } });
    expect(canUseFora4(empty, 'S', 'zamjena').reason).toBe('partnerEmpty');
  });

  it('namjesteno reveals the partner’s whole hand to the team', () => {
    const r = fora(st(['namjesteno']), 'namjesteno');
    expect(r.state.partnerHandShown).toBe(true);
    for (const c of r.state.seats.N.hand) expect(r.state.knownTo[c.uid]).toContain('mi');
  });

  it('ti_otvaraj: the next seat leads; order W, N, E, S', () => {
    let s = fora(st(['ti_otvaraj']), 'ti_otvaraj').state;
    const order: Seat[] = [];
    for (let i = 0; i < 4; i++) { order.push(s.turn); s = applyAction4(s, { type: 'play', seat: s.turn, uid: legalPlays4(s, s.turn)[0] }).state; }
    expect(order).toEqual(['W', 'N', 'E', 'S']);
    expect(canUseFora4(st(['ti_otvaraj'], 'E'), 'S', 'ti_otvaraj').reason).toBe('notYourTurn');
  });

  it('tucem: leader only; both opponents forced, the partner free', () => {
    let s = st(['tucem']);
    s = fora(s, 'tucem').state;
    s = applyAction4(s, { type: 'play', seat: 'S', uid: u4('kupe_4') }).state;
    expect(legalPlays4(s, 'W')).toEqual([u4('kupe_3')]);
  });

  it('napij_ga makes the chosen opponent drunk', () => {
    const r = fora(st(['napij_ga']), 'napij_ga', { targetSeat: 'E' });
    expect(r.state.seats.E.drunk).toBe(true);
    expect(() => fora(st(['napij_ga']), 'napij_ga', { targetSeat: 'N' })).toThrow();
  });

  it('vrati: only as 2nd seat after an opponent’s lead (E led)', () => {
    expect(canUseFora4(st(['vrati']), 'S', 'vrati').reason).toBe('secondOnly');
    let s = makeState4({ hands, leader: 'E', fore: { S: ['vrati'] }, rakija: { S: 5 } });
    s = applyAction4(s, { type: 'play', seat: 'E', uid: u4('kupe_5') }).state;
    expect(canUseFora4(s, 'S', 'vrati').ok).toBe(true);
    const r = fora(s, 'vrati');
    expect(r.state.turn).toBe('E');
    expect(r.state.seats.S.rakija).toBe(3);
    expect(legalPlays4(r.state, 'E')).not.toContain(u4('kupe_5'));
    expect(r.state.knownTo[u4('kupe_5')]).toContain('mi');
    // as 3rd seat: not allowed
    let s3 = makeState4({ hands, leader: 'N', fore: { S: ['vrati'] }, rakija: { S: 5 } });
    s3 = applyAction4(s3, { type: 'play', seat: 'N', uid: u4('bate_6') }).state;
    s3 = applyAction4(s3, { type: 'play', seat: 'E', uid: u4('bate_7') }).state;
    expect(canUseFora4(s3, 'S', 'vrati').reason).toBe('secondOnly');
  });

  it('trica_iz_rukava, team krivi_racun and team duplo', () => {
    const t = fora(st(['trica_iz_rukava']), 'trica_iz_rukava', { targetUid: u4('kupe_4') });
    expect(t.state.seats.S.tricaTarget).toBe(u4('kupe_4'));
    const k = fora(st(['krivi_racun']), 'krivi_racun');
    expect(k.state.teams.mi.kriviRacun).toBe(true);
    let d = fora(st(['duplo_ili_nista']), 'duplo_ili_nista').state;
    expect(d.trick.multiplier).toBe(2);
    d = applyAction4(d, { type: 'play', seat: 'S', uid: u4('kupe_K') }).state;
    d = applyAction4(d, { type: 'play', seat: 'W', uid: u4('kupe_2') }).state;
    d = applyAction4(d, { type: 'play', seat: 'N', uid: u4('spade_3') }).state;
    const r = applyAction4(d, { type: 'play', seat: 'E', uid: u4('kupe_5') });
    const tr = r.events.find((e) => e.t === 'trickResolved') as Extract<GameEvent4, { t: 'trickResolved' }>;
    expect(tr.team).toBe('vi');
    expect(tr.thirdsTo.vi).toBe(6);
  });
});
