import { describe, expect, it } from 'vitest';
import { cardKey } from '../src/game/cards';
import {
  beginMatch4, canMove, firstDealer4, leaveShop4, matchDeck, matchForgeries, matchMarks, matchSetup4, moveUkras, movePrice, newRun4,
  onMatchLost4, onMatchWon4, pickPartner, reward4, takeRevans4,
} from '../src/game/run4';
import type { RunState4 } from '../src/game/run4';
import { buyUkras, reroll, rerollPrice } from '../src/game/run';

function shop(partner: 'luka' | 'ive' = 'luka'): RunState4 {
  let r = pickPartner(newRun4('r4', 0), partner);
  r = beginMatch4(r);
  r = onMatchWon4(r, { mi: 13, vi: 7 }, 4, 1);
  r.soldi = 100;
  return r;
}

describe('run4 (§18.4 with §19.1 numbers)', () => {
  it('start kit and rewards: base + min(6, margin) + team Mi akuže; first dealer per match', () => {
    const r0 = newRun4('a', 0);
    expect(r0.fore).toEqual(['pogled']);
    expect(r0.rakijaBase).toBe(2);
    expect(r0.soldi).toBe(6);
    expect(r0.revans).toBe(2);
    expect(reward4(0, 10, 2)).toEqual({ base: 8, margin: 6, akuze: 2, total: 16 });
    let r = beginMatch4(pickPartner(r0, 'ive'));
    expect(r.match!.dealer).toBe('E');
    r = onMatchWon4(r, { mi: 12, vi: 9 }, 3, 1);
    expect(r.soldi).toBe(6 + 8 + 3 + 3);
    expect(r.status).toBe('shop');
    expect(r.shop!.offers.length).toBe(4);
    expect(r.shop!.offers.every((o) => o.rarity === 'common')).toBe(true);
    expect(['E', 'S', 'W', 'N', 'E', 'S']).toEqual([0, 1, 2, 3, 4, 5].map(firstDealer4));
  });

  it('6 matches, shops after 1–5; Revanš twice', () => {
    let r = newRun4('six', 0);
    for (let i = 0; i < 6; i++) {
      r = pickPartner({ ...r, status: 'pick' }, (['luka', 'dino', 'stipe', 'ive', 'jure', 'tonci'] as const)[i]);
      r = onMatchWon4(beginMatch4(r), { mi: 11, vi: 3 }, 0, 1);
      if (i < 5) { expect(r.status).toBe('shop'); r = leaveShop4(r); } else expect(r.status).toBe('won');
    }
    let l = beginMatch4(pickPartner(newRun4('rv', 0), 'luka'));
    l = takeRevans4(onMatchLost4(l, { mi: 3, vi: 11 }, 1));
    l = takeRevans4(onMatchLost4(beginMatch4(l), { mi: 3, vi: 11 }, 1));
    expect(l.revans).toBe(0);
    expect(l.attempt).toBe(2);
    expect(onMatchLost4(beginMatch4(l), { mi: 3, vi: 11 }, 1).status).toBe('lost');
  });

  it('Prebaci ukras: price 2, max 2, target without an ukras, deck stays 40; no removal service', () => {
    let r = shop();
    r.deck = r.deck.map((c) => (cardKey(c) === 'kupe_A' ? { ...c, ukras: 'pozlaceno' } : c));
    expect(canMove(r).ok).toBe(true);
    expect(movePrice(r)).toBe(2);
    const before = r.soldi;
    r = moveUkras(r, 'kupe_A', 'bate_4');
    expect(r.soldi).toBe(before - 2);
    expect(r.deck.find((c) => cardKey(c) === 'bate_4')!.ukras).toBe('pozlaceno');
    expect(() => moveUkras(r, 'bate_4', 'bate_4')).toThrow();
    r = moveUkras(r, 'bate_4', 'spade_4');
    expect(canMove(r).reason).toBe('limit');
    expect(r.deck.length).toBe(40);
    expect('removals' in r.shop!).toBe(false);
  });

  it('Jure discount: every price −1 (min 1) in that visit, including reroll and Prebaci', () => {
    const unlocked: RunState4['unlocked'] = ['luka', 'ive', 'dino', 'tonci', 'stipe', 'jure'];
    let r = beginMatch4(pickPartner({ ...newRun4('j', 1), unlocked, ladderIndex: 2 }, 'jure'));
    r = onMatchWon4(r, { mi: 11, vi: 2 }, 0, 1);
    expect(r.discount).toBe(1);
    const plain = onMatchWon4(beginMatch4(pickPartner({ ...newRun4('j', 1), unlocked, ladderIndex: 2 }, 'stipe')), { mi: 11, vi: 2 }, 0, 1);
    r.shop!.offers.forEach((o, i) => expect(o.price).toBe(Math.max(1, plain.shop!.offers[i].price - 1)));
    expect(rerollPrice(r.shop!, r.discount)).toBe(1);
    expect(movePrice(r)).toBe(1);
    r.soldi = 50;
    const rr = reroll(r, r.discount);
    expect(rr.soldi).toBe(49);
    expect(leaveShop4(r).discount).toBe(0);
  });

  it('Dino (Šarmer) adds rakija; Ive/Tonči perks map to engine perks', () => {
    const base = { ...newRun4('d', 0, { start: 1 }), unlocked: ['luka', 'ive', 'dino', 'tonci', 'stipe'] as RunState4['unlocked'] };
    expect(matchSetup4(pickPartner(base, 'dino')).rakija.S).toBe(3);
    expect(matchSetup4(pickPartner(base, 'tonci')).perks.akuzaBonusMi).toBe(1);
    expect(matchSetup4(pickPartner(newRun4('i', 0), 'ive')).perks.revealEachHand).toBe(true);
  });

  it('Šarane karte and Vi forgeries are seeded, on free cards only, and never stored in the run deck', () => {
    const r = { ...newRun4('mk', 0, { start: 5 }), partner: 'dino' as const };
    r.deck.find((c) => cardKey(c) === 'kupe_3')!.ukras = 'srebreno';
    const a = matchMarks(r);
    expect(a.map((c) => cardKey(c))).toEqual(matchMarks(r).map((c) => cardKey(c)));
    expect(a.length).toBe(4);
    expect(a.map((c) => cardKey(c))).not.toContain('kupe_3');
    expect(matchForgeries(r).length).toBe(1);
    const d = matchDeck(r);
    expect(d.find((c) => cardKey(c) === 'kupe_3')).toMatchObject({ ukras: 'srebreno', ukrasTeam: 'mi' });
    expect(r.deck.filter((c) => c.ukras).length).toBe(1);
    expect(r.deck.some((c) => c.forge)).toBe(false);
    expect(matchMarks({ ...r, attempt: 2 }).map((c) => cardKey(c))).not.toEqual(a.map((c) => cardKey(c)));
  });

  it('shop functions from run.ts work on RunState4', () => {
    let r = shop();
    r.shop!.offers[0] = { kind: 'ukras', id: 'glasno', rarity: 'uncommon', price: 7, sold: false };
    r = buyUkras(r, 0, 'kupe_A');
    expect(r.mode).toBe('partneri');
    expect(r.deck.find((c) => cardKey(c) === 'kupe_A')!.ukras).toBe('glasno');
  });
});
