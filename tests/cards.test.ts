import { describe, expect, it } from 'vitest';
import { RANK_INDEX } from '../src/game/cards';

describe('cards (§19.7)', () => {
  it('aces have no corner index; the other indices are unchanged', () => {
    expect(RANK_INDEX.A).toBe('');
    expect(RANK_INDEX).toMatchObject({ '3': '3', '2': '2', K: '13', C: '12', F: '11', '7': '7', '6': '6', '5': '5', '4': '4' });
  });
});
