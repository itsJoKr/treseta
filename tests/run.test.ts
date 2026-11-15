import { describe, expect, it } from 'vitest';
import { applyMatchMods, MAX_FORGES, printedOf } from '../src/game/forge';
import { FORE } from '../src/game/fore';
import { DVOBOJ_LADDER, PARTNERI_LADDER } from '../src/game/ladders';
import {
  buyCasica, buyFalsa, buyFora, canMove, CASICA_PRICES, generateOffers, leaveShop, matchReward, moveUkras, newRun,
  onMatchLost, onMatchWon, reroll, rerollPrice, takeRevans,
} from '../src/game/run';
import type { Offer, RunState } from '../src/game/run';
import { UKRASI } from '../src/game/ukrasi';

const tierOf = (o: Offer): number => ({ common: 0, uncommon: 1, rare: 2 })[o.rarity];

function inShop(r: RunState, visit = 1, soldi = 100): RunState {
  return { ...structuredClone(r), status: 'shop', soldi, shop: { visit, rerolls: 0, moves: 0, offers: generateOffers(r, visit, 0) } };
}

describe('run (§19.1–§19.2)', () => {
  it('starting kit: plain 40 cards, Pogled only, rakija 2, 6 šoldi, 2 Revanš tokens', () => {
    const r = newRun('s', 0);
    expect(r.deck.length).toBe(40);
    expect(r.deck.some((c) => c.ukras || c.forge)).toBe(false);
    expect(r.fore).toEqual(['pogled']);
    expect(r.rakijaBase).toBe(2);
    expect(r.soldi).toBe(6);
    expect(r.revans).toBe(2);
  });

  it('reward = base + min(6, margin) + akuže', () => {
    expect(matchReward(8, 3, 2)).toEqual({ base: 8, margin: 3, akuze: 2, total: 13 });
    expect(matchReward(12, 10, 0).total).toBe(18);
    expect(matchReward(9, -2, 3).total).toBe(12);
    const won = onMatchWon(newRun('w', 0), { player: 12, bot: 9 }, 3, 1);
    expect(won.soldi).toBe(6 + 8 + 3 + 3);
  });

  it('6 matches with a shop after matches 1–5, none after the boss', () => {
    let r = newRun('six', 0);
    for (let i = 0; i < 6; i++) {
      expect(r.ladderIndex).toBe(i);
      r = onMatchWon({ ...r, status: 'match' }, { player: 11, bot: 4 }, 0, 1);
      if (i < 5) { expect(r.status).toBe('shop'); expect(r.shop!.visit).toBe(i + 1); r = leaveShop(r); }
      else expect(r.status).toBe('won');
    }
  });

  it('two Revanš tokens: each replays the match (attempt + 1); with 0 tokens the run ends', () => {
    let r = newRun('rv', 0);
    r = onMatchLost({ ...r, status: 'match' }, { player: 5, bot: 11 }, 2);
    expect(r.status).toBe('lostOffer');
    r = takeRevans(r);
    expect(r.revans).toBe(1);
    expect(r.attempt).toBe(1);
    r = takeRevans(onMatchLost({ ...r, status: 'match' }, { player: 5, bot: 11 }, 3));
    expect(r.revans).toBe(0);
    r = onMatchLost({ ...r, status: 'match' }, { player: 5, bot: 11 }, 4);
    expect(r.status).toBe('lost');
  });

  it('tier weights per visit: no T2 at visit 1, no T3 before visit 4; Falsa only from T3; no owned fore; no duplicates', () => {
    for (let k = 0; k < 200; k++) {
      const r = { ...newRun(`sh${k}`, 0), fore: ['pogled', 'tucem'] as RunState['fore'] };
      for (let v = 1; v <= 5; v++) {
        const offers = generateOffers(r, v, 0);
        expect(offers.length).toBe(3);
        for (const o of offers) {
          if (v === 1) expect(tierOf(o)).toBe(0);
          if (v < 4) expect(tierOf(o)).toBeLessThan(2);
          if (o.kind === 'falsa') expect(o.rarity).toBe('rare');
          if (o.kind === 'fora') { expect(['pogled', 'tucem']).not.toContain(o.id); expect(o.price).toBe(FORE[o.id].price); }
          if (o.kind === 'ukras') expect(o.price).toBe(UKRASI[o.id].price);
        }
        const keys = offers.map((o) => o.kind + ('id' in o ? o.id : ''));
        expect(new Set(keys).size).toBe(keys.length);
      }
    }
    // T3 actually appears at visit 5
    let rare = 0;
    for (let k = 0; k < 100; k++) rare += generateOffers(newRun(`t3${k}`, 0), 5, 0).filter((o) => o.rarity === 'rare').length;
    expect(rare).toBeGreaterThan(80);
  });

  it('Promišaj costs 1, then +1 per reroll; Veća čašica twice (8, then 10) up to rakija 4', () => {
    expect(rerollPrice({ rerolls: 0 })).toBe(1);
    expect(rerollPrice({ rerolls: 2 })).toBe(3);
    let r = inShop(newRun('rr', 0));
    r = reroll(r);
    expect(r.soldi).toBe(99);
    r = reroll(r);
    expect(r.soldi).toBe(97);
    let c = inShop(newRun('cas', 0));
    for (const price of CASICA_PRICES) {
      c.shop!.offers = [{ kind: 'casica', rarity: 'common', price, sold: false }];
      const before = c.soldi;
      c = buyCasica(c, 0);
      expect(before - c.soldi).toBe(price);
    }
    expect(c.rakijaBase).toBe(4);
    expect(c.casicaBought).toBe(2);
    c.shop!.offers = [{ kind: 'casica', rarity: 'common', price: 10, sold: false }];
    expect(() => buyCasica(c, 0)).toThrow();
    // no čašica offers after two purchases
    for (let k = 0; k < 50; k++) expect(generateOffers({ ...c, seed: `c${k}` }, 1, 0).some((o) => o.kind === 'casica')).toBe(false);
  });

  it('Prebaci ukras (both modes): 2 šoldi, max 2 per visit, onto a card with no ukras and no forgery', () => {
    let r = inShop(newRun('mv', 0), 2, 10);
    r.deck = r.deck.map((c) => (c.suit === 'kupe' && c.rank === 'A' ? { ...c, ukras: 'pozlaceno' as const } : c));
    r = moveUkras(r, 'kupe_A', 'bate_7');
    expect(r.soldi).toBe(8);
    expect(r.deck.find((c) => c.suit === 'bate' && c.rank === '7')!.ukras).toBe('pozlaceno');
    r = moveUkras(r, 'bate_7', 'spade_7');
    expect(canMove(r)).toEqual({ ok: false, reason: 'limit' });
    expect(r.deck.length).toBe(40);
  });

  it('buyFora respects ownership; Falsa karta forges a lišina into a 3/2/A (max 4, deck stays 40)', () => {
    let r = inShop(newRun('fa', 0), 5, 200);
    r.shop!.offers = [{ kind: 'fora', id: 'pogled', rarity: 'common', price: 4, sold: false }];
    expect(() => buyFora(r, 0)).toThrow();
    const keys = ['bate_4', 'bate_5', 'spade_6', 'dinari_7'];
    for (const key of keys) {
      r.shop!.offers = [{ kind: 'falsa', rarity: 'rare', price: 12, sold: false }];
      r = buyFalsa(r, 0, key, { suit: 'kupe', rank: '3' });
    }
    expect(r.deck.length).toBe(40);
    expect(r.deck.filter((c) => c.forge).length).toBe(MAX_FORGES);
    r.shop!.offers = [{ kind: 'falsa', rarity: 'rare', price: 12, sold: false }];
    expect(() => buyFalsa(r, 0, 'kupe_4', { suit: 'kupe', rank: '3' })).toThrow();
    const f = r.deck.find((c) => c.forge && c.suit === 'bate' && c.rank === '4')!;
    expect(printedOf(f).rank).toBe('4');
    expect(f.forge).toEqual({ suit: 'kupe', rank: '3', team: 'mi' });
    // not on a strong card
    const r2 = inShop(newRun('fb', 0), 5, 200);
    r2.shop!.offers = [{ kind: 'falsa', rarity: 'rare', price: 12, sold: false }];
    expect(() => buyFalsa(r2, 0, 'kupe_A', { suit: 'kupe', rank: '3' })).toThrow();
  });

  it('per-match bot fore, marks and forgeries follow the §19.1.3 tables; matches 1–2 are plain', () => {
    for (const [ladder, mode] of [[DVOBOJ_LADDER, 'dvoboj'], [PARTNERI_LADDER, 'partneri']] as const) {
      expect(ladder.length).toBe(6);
      for (let i = 0; i < 6; i++) {
        const m = ladder[i];
        const deck = applyMatchMods(newRun('mods', 0).deck, m, 'mods', mode, i, 0);
        const marks = deck.filter((c) => c.ukrasTeam === 'vi' && c.ukras);
        const forg = deck.filter((c) => c.forge && c.forge.team === 'vi');
        expect(marks.length).toBe(m.marks.length);
        expect(forg.length).toBe(m.forgeries.length);
        for (const f of forg) expect(['7', '6', '5', '4']).toContain(printedOf(f).rank);
        if (i < 2) { expect(marks.length + forg.length).toBe(0); }
        expect(deck.length).toBe(40);
      }
    }
    expect(DVOBOJ_LADDER.map((m) => m.base)).toEqual([8, 9, 10, 11, 12, 15]);
    expect(DVOBOJ_LADDER[5].fore).toContain('briskula');
    expect(DVOBOJ_LADDER.map((m) => m.opp)).toEqual(['tonci', 'jure', 'ive', 'dino', 'luka', 'bepo']);
  });
});
