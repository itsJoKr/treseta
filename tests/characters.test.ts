import { describe, expect, it } from 'vitest';
import { CHARACTERS } from '../src/game/characters';
import { PAIRS, START_UNLOCKED, unlockedAt, validPartners } from '../src/game/ladder4';
import { newRun4, onMatchWon4, leaveShop4, pickPartner, partnerChoices } from '../src/game/run4';

describe('characters and partner pick', () => {
  it('for every match and every valid partner the 3 bot personas are distinct', () => {
    expect(PAIRS.length).toBe(6);
    for (let m = 0; m < 6; m++) {
      const pair = PAIRS[m];
      const choices = validPartners(unlockedAt(m), m);
      for (const p of choices) {
        const personas = [CHARACTERS[pair.W].persona, CHARACTERS[pair.E].persona, CHARACTERS[p].persona];
        expect(new Set(personas).size).toBe(3);
        expect([pair.W, pair.E]).not.toContain(p);
      }
    }
  });

  it('exactly 2 valid unlocked partners per match on the winning path; unlock progression', () => {
    expect(START_UNLOCKED.sort()).toEqual(['dino', 'ive', 'luka']);
    const expected = [['ive', 'luka'], ['dino', 'tonci'], ['jure', 'stipe'], ['ive', 'luka'], ['jure', 'stipe'], ['dino', 'tonci']];
    let run = newRun4('cp', 0);
    for (let m = 0; m < 6; m++) {
      const ch = partnerChoices(run).sort();
      expect(ch).toEqual(expected[m]);
      run = pickPartner(run, ch[0]);
      run = onMatchWon4({ ...run, status: 'match' }, { mi: 11, vi: 4 }, 0, 1);
      expect(run.unlocked).toContain(PAIRS[m].W);
      expect(run.unlocked).toContain(PAIRS[m].E);
      if (m < 5) run = leaveShop4(run);
    }
    expect(run.status).toBe('won');
  });

  it('Frane and Bepo are never offered as partners', () => {
    const all = Object.keys(CHARACTERS) as (keyof typeof CHARACTERS)[];
    for (let m = 0; m < 6; m++) {
      const ch = validPartners(all, m);
      expect(ch).not.toContain('frane');
      expect(ch).not.toContain('bepo');
    }
  });

  it('invalid partner picks are rejected', () => {
    const run = newRun4('x', 0);
    expect(() => pickPartner(run, 'dino')).toThrow();
    expect(() => pickPartner(run, 'tonci')).toThrow();
  });
});
