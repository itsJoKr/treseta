import { describe, expect, it } from 'vitest';
import { standardDeck } from '../src/game/cards';
import { applyAction, createHand, legalPlays, scoreHand } from '../src/game/rules';
import type { GameEvent, HandState, Side } from '../src/game/types';
import { rngFor } from '../src/game/rng';
import { makeState, uid } from './helpers';

function play(s: HandState, side: Side, u: string) {
  return applyAction(s, { type: 'play', side, uid: u });
}
type Tr = Extract<GameEvent, { t: 'trickResolved' }>;
type Hs = Extract<GameEvent, { t: 'handScored' }>;

describe('scoring', () => {
  it('floor of thirds per side (7 thirds -> 2) and the worked example', () => {
    const s = makeState({ player: { hand: [] }, bot: { hand: [] } });
    s.sides.player.thirds = 7;
    s.sides.bot.thirds = 5;
    const b = scoreHand(s);
    expect(b.player.cardPoints).toBe(2);
    expect(b.bot.cardPoints).toBe(1);
    s.ultima = { side: 'player', points: 1 };
    expect(scoreHand(s).player.total).toBe(3);
    s.sides.player.kriviRacun = true;
    expect(scoreHand(s).player.cardPoints).toBe(3);
    expect(scoreHand(s).player.total).toBe(4);
    expect(scoreHand(s).player.rounding).toBe('ceil');
  });

  it('ultima +1 on trick 20', () => {
    const s = makeState({ player: { hand: ['kupe_4'] }, bot: { hand: ['kupe_5'] }, leader: 'player', trickNo: 20 });
    const r = play(play(s, 'player', uid('kupe_4', 'player')).state, 'bot', uid('kupe_5', 'bot'));
    const tr = r.events.find((e) => e.t === 'trickResolved') as Tr;
    expect(tr.ultima).toEqual({ side: 'bot', points: 1 });
    const hs = r.events.find((e) => e.t === 'handScored') as Hs;
    expect(hs.breakdown.bot.ultima).toBe(1);
    expect(hs.breakdown.bot.total).toBe(1);
    expect(r.state.phase).toBe('over');
  });

  it('Ponoćno ultima +3', () => {
    const s = makeState({ player: { hand: ['kupe_4'] }, bot: { hand: ['kupe_5+ponocno'] }, leader: 'player', trickNo: 20 });
    const r = play(play(s, 'player', uid('kupe_4', 'player')).state, 'bot', uid('kupe_5', 'bot'));
    const hs = r.events.find((e) => e.t === 'handScored') as Hs;
    expect(hs.breakdown.bot.ultima).toBe(3);
  });

  it('Ponoćno only when the Ponoćno card wins', () => {
    const s = makeState({ player: { hand: ['kupe_4+ponocno'] }, bot: { hand: ['kupe_5'] }, leader: 'player', trickNo: 20 });
    const r = play(play(s, 'player', uid('kupe_4', 'player')).state, 'bot', uid('kupe_5', 'bot'));
    const hs = r.events.find((e) => e.t === 'handScored') as Hs;
    expect(hs.breakdown.bot.ultima).toBe(1);
  });

  it('Krivi račun rounds up', () => {
    const s = makeState({ player: { hand: ['kupe_K', 'bate_4'], fore: ['krivi_racun'] }, bot: { hand: ['kupe_4', 'bate_5'] }, leader: 'player', trickNo: 19 });
    const f = applyAction(s, { type: 'fora', side: 'player', fora: 'krivi_racun' });
    let st = play(f.state, 'player', uid('kupe_K', 'player')).state;
    st = play(st, 'bot', uid('kupe_4', 'bot')).state;
    st = play(st, 'player', uid('bate_4', 'player')).state;
    const r = play(st, 'bot', uid('bate_5', 'bot'));
    const hs = r.events.find((e) => e.t === 'handScored') as Hs;
    expect(hs.breakdown.player.thirds).toBe(1);
    expect(hs.breakdown.player.cardPoints).toBe(1);
  });

  it('Pozlaćeno +1 only for the owner who won', () => {
    const s = makeState({ player: { hand: ['kupe_A+pozlaceno'] }, bot: { hand: ['kupe_3'] }, leader: 'player', trickNo: 20 });
    const r = play(play(s, 'player', uid('kupe_A', 'player')).state, 'bot', uid('kupe_3', 'bot'));
    const tr = r.events.find((e) => e.t === 'trickResolved') as Tr;
    expect(tr.winner).toBe('bot');
    expect(tr.bonus).toEqual([]);
    expect(r.state.sides.player.bonusPoints).toBe(0);
    expect(r.state.sides.bot.bonusPoints).toBe(0);
    const s2 = makeState({ player: { hand: ['kupe_3+pozlaceno'] }, bot: { hand: ['kupe_A'] }, leader: 'player', trickNo: 20 });
    const r2 = play(play(s2, 'player', uid('kupe_3', 'player')).state, 'bot', uid('kupe_A', 'bot'));
    expect(r2.state.sides.player.bonusPoints).toBe(1);
    const hs = r2.events.find((e) => e.t === 'handScored') as Hs;
    expect(hs.breakdown.player.ukrasPoints).toBe(1);
  });

  it('Usoljeno redirects thirds to its losing owner', () => {
    const s = makeState({ player: { hand: ['kupe_A+usoljeno'] }, bot: { hand: ['kupe_3'] }, leader: 'player', trickNo: 20 });
    const r = play(play(s, 'player', uid('kupe_A', 'player')).state, 'bot', uid('kupe_3', 'bot'));
    const tr = r.events.find((e) => e.t === 'trickResolved') as Tr;
    expect(tr.thirdsTo).toEqual({ player: 3, bot: 1 });
  });

  it('Duplo x2 for card thirds, bonuses not doubled; Usoljeno doubled thirds go to owner', () => {
    const s = makeState({ player: { hand: ['kupe_3+pozlaceno'], fore: ['duplo_ili_nista'] }, bot: { hand: ['kupe_A+usoljeno'] }, leader: 'player', trickNo: 20 });
    const f = applyAction(s, { type: 'fora', side: 'player', fora: 'duplo_ili_nista' });
    const r = play(play(f.state, 'player', uid('kupe_3', 'player')).state, 'bot', uid('kupe_A', 'bot'));
    const tr = r.events.find((e) => e.t === 'trickResolved') as Tr;
    expect(tr.thirdsTo).toEqual({ player: 2, bot: 6 });
    expect(r.state.sides.player.bonusPoints).toBe(1);
  });

  it('one standard deck, no ukrasi: totals = floor(a/3)+floor(b/3)+1', () => {
    for (let k = 0; k < 30; k++) {
      let { state } = createHand({
        seed: `sc-${k}`, handNo: 1, dealer: k % 2 ? 'bot' : 'player',
        deck: standardDeck(),
        fore: { player: [], bot: [] }, rakija: { player: 0, bot: 0 },
      });
      const rng = rngFor('play', k);
      let hs: Hs | undefined;
      while (state.phase !== 'over') {
        const legal = legalPlays(state, state.turn);
        const r = play(state, state.turn, legal[Math.floor(rng() * legal.length)]);
        state = r.state;
        hs = (r.events.find((e) => e.t === 'handScored') as Hs) ?? hs;
      }
      const a = state.sides.player.thirds;
      const b = state.sides.bot.thirds;
      expect(hs).toBeDefined();
      expect(hs!.breakdown.player.total + hs!.breakdown.bot.total).toBe(Math.floor(a / 3) + Math.floor(b / 3) + 1);
      // all thirds of the 40 cards in play are captured by someone
      const inPlay = [...state.sides.player.pile, ...state.sides.bot.pile];
      expect(inPlay.length).toBe(40);
    }
  });
});
