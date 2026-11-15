import { describe, expect, it } from 'vitest';
import { canUseFora } from '../src/game/fore';
import { canUseFora4 } from '../src/game/fore4';
import { applyAction, legalPlays } from '../src/game/rules';
import { applyAction4, legalPlays4 } from '../src/game/rules4';
import type { GameEvent } from '../src/game/types';
import type { GameEvent4 } from '../src/game/types4';
import { makeState, uid } from './helpers';
import { makeState4, u4 } from './helpers4';

type Tr = Extract<GameEvent, { t: 'trickResolved' }>;
type Tr4 = Extract<GameEvent4, { t: 'trickResolved' }>;

describe('Prevrtljivo (§19.2.3)', () => {
  it('legal as a follow, satisfies the follow-suit obligation, wins by its own strength', () => {
    const s = makeState({ player: { hand: ['kupe_4'] }, bot: { hand: ['bate_3+prevrtljivo', 'kupe_5', 'spade_4'] }, leader: 'player', trickNo: 20 });
    const a = applyAction(s, { type: 'play', side: 'player', uid: uid('kupe_4') });
    expect(legalPlays(a.state, 'bot').sort()).toEqual([uid('bate_3'), uid('kupe_5')].sort());
    const b = applyAction(a.state, { type: 'play', side: 'bot', uid: uid('bate_3') });
    expect((b.events.find((e) => e.t === 'trickResolved') as Tr).winner).toBe('bot');
    expect(b.state.sides.bot.voidKnown).not.toContain('kupe');
  });

  it('printed suit when leading; the forcedHighest restriction; inert for the other side', () => {
    const s = makeState({ player: { hand: ['bate_4+prevrtljivo', 'kupe_5'] }, bot: { hand: ['bate_5', 'kupe_3'] }, leader: 'player', trickNo: 20 });
    const a = applyAction(s, { type: 'play', side: 'player', uid: uid('bate_4') });
    expect(legalPlays(a.state, 'bot')).toEqual([uid('bate_5')]);
    // forcedHighest (Tučem!): the turncoat only if it is at least as strong as the highest real card
    const t = makeState({ player: { hand: ['kupe_5', 'bate_4'], fore: ['tucem'] }, bot: { hand: ['kupe_2', 'bate_A+prevrtljivo', 'spade_4+prevrtljivo'] }, leader: 'player', trickNo: 20 });
    const t1 = applyAction(t, { type: 'fora', side: 'player', fora: 'tucem' });
    const t2 = applyAction(t1.state, { type: 'play', side: 'player', uid: uid('kupe_5') });
    expect(legalPlays(t2.state, 'bot')).toEqual([uid('kupe_2')]);
    // a Mi Prevrtljivo held by the bot is a plain card
    const o = makeState({ player: { hand: ['kupe_4'] }, bot: { hand: ['bate_3+prevrtljivo@mi', 'kupe_5'] }, leader: 'player', trickNo: 20 });
    const o1 = applyAction(o, { type: 'play', side: 'player', uid: uid('kupe_4') });
    expect(legalPlays(o1.state, 'bot')).toEqual([uid('kupe_5')]);
  });

  it('Partneri: counts as the led suit for its team only', () => {
    let s = makeState4({ hands: { S: ['kupe_4', 'bate_6'], W: ['kupe_5', 'bate_5'], N: ['spade_3+prevrtljivo@mi', 'kupe_6'], E: ['kupe_7', 'spade_5'] } });
    s = applyAction4(s, { type: 'play', seat: 'S', uid: u4('kupe_4') }).state;
    s = applyAction4(s, { type: 'play', seat: 'W', uid: u4('kupe_5') }).state;
    expect(legalPlays4(s, 'N').sort()).toEqual([u4('kupe_6'), u4('spade_3')].sort());
    s = applyAction4(s, { type: 'play', seat: 'N', uid: u4('spade_3') }).state;
    const r = applyAction4(s, { type: 'play', seat: 'E', uid: u4('kupe_7') });
    expect((r.events.find((e) => e.t === 'trickResolved') as Tr4).winner).toBe('N');
  });
});

describe('Briškula! (§19.2.3)', () => {
  it('only when void (mustBeVoid); the trump card beats the led suit (Dvoboj)', () => {
    const s = makeState({ player: { hand: ['kupe_3'] }, bot: { hand: ['bate_4', 'spade_5'], fore: ['briskula'], rakija: 2 }, leader: 'player', trickNo: 20 });
    expect(canUseFora(s, 'bot', 'briskula').ok).toBe(false);
    const a = applyAction(s, { type: 'play', side: 'player', uid: uid('kupe_3') });
    expect(canUseFora(a.state, 'bot', 'briskula').ok).toBe(true);
    const f = applyAction(a.state, { type: 'fora', side: 'bot', fora: 'briskula' });
    const r = applyAction(f.state, { type: 'play', side: 'bot', uid: uid('bate_4') });
    const tr = r.events.find((e) => e.t === 'trickResolved') as Tr;
    expect(tr.winner).toBe('bot');
    expect(tr.special).toBe('briskula');
    const holding = makeState({ player: { hand: ['kupe_3'] }, bot: { hand: ['kupe_4', 'spade_5'], fore: ['briskula'], rakija: 2 }, leader: 'player', trickNo: 20 });
    const h1 = applyAction(holding, { type: 'play', side: 'player', uid: uid('kupe_3') });
    expect(canUseFora(h1.state, 'bot', 'briskula').reason).toBe('mustBeVoid');
  });

  it('Partneri: trump beats non-trump, the highest trump wins, ties go to the earlier play; others still follow', () => {
    let s = makeState4({ hands: { S: ['kupe_3', 'bate_6'], W: ['bate_4', 'spade_6'], N: ['kupe_4', 'bate_2'], E: ['bate_5', 'spade_5'] }, fore: { W: ['briskula'] }, rakija: { W: 2 } });
    s = applyAction4(s, { type: 'play', seat: 'S', uid: u4('kupe_3') }).state;
    expect(canUseFora4(s, 'W', 'briskula').ok).toBe(true);
    s = applyAction4(s, { type: 'fora', seat: 'W', fora: 'briskula' }).state;
    s = applyAction4(s, { type: 'play', seat: 'W', uid: u4('bate_4') }).state;
    expect(s.trick.trump).toBe('bate');
    // N must still follow kupe
    expect(legalPlays4(s, 'N')).toEqual([u4('kupe_4')]);
    s = applyAction4(s, { type: 'play', seat: 'N', uid: u4('kupe_4') }).state;
    // E is void in kupe and plays a higher bate: the highest trump wins
    const r = applyAction4(s, { type: 'play', seat: 'E', uid: u4('bate_5') });
    expect((r.events.find((e) => e.t === 'trickResolved') as Tr4).winner).toBe('E');
    let s2 = makeState4({ hands: { S: ['kupe_3', 'bate_6'], W: ['bate_4', 'spade_6'], N: ['kupe_4', 'bate_2'], E: ['spade_5', 'spade_4'] }, fore: { W: ['briskula'] }, rakija: { W: 2 } });
    s2 = applyAction4(s2, { type: 'play', seat: 'S', uid: u4('kupe_3') }).state;
    s2 = applyAction4(applyAction4(s2, { type: 'fora', seat: 'W', fora: 'briskula' }).state, { type: 'play', seat: 'W', uid: u4('bate_4') }).state;
    s2 = applyAction4(s2, { type: 'play', seat: 'N', uid: u4('kupe_4') }).state;
    const r2 = applyAction4(s2, { type: 'play', seat: 'E', uid: u4('spade_5') });
    expect((r2.events.find((e) => e.t === 'trickResolved') as Tr4).winner).toBe('W');
  });
});
