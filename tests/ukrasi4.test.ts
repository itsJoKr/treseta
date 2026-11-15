import { describe, expect, it } from 'vitest';
import { applyAction4 } from '../src/game/rules4';
import { createHand4 } from '../src/game/rules4';
import type { GameEvent4, Hand4State, Seat } from '../src/game/types4';
import { NO_PERKS } from '../src/game/types4';
import { standardDeck } from '../src/game/cards';
import { makeState4, u4 } from './helpers4';
import type { Spec4 } from './helpers4';

type Tr = Extract<GameEvent4, { t: 'trickResolved' }>;
function trick(sp: Spec4, plays: [Seat, string][]): { state: Hand4State; events: GameEvent4[]; tr: Tr } {
  let s = makeState4(sp);
  const evs: GameEvent4[] = [];
  for (const [seat, spec] of plays) { const r = applyAction4(s, { type: 'play', seat, uid: u4(spec) }); s = r.state; evs.push(...r.events); }
  return { state: s, events: evs, tr: evs.find((e) => e.t === 'trickResolved') as Tr };
}
const H = (S: string[], W: string[], N: string[], E: string[]) => ({ S, W, N, E });

describe('ukrasi4', () => {
  it('pozlaceno pays the team whose pile it ends in, whoever played it', () => {
    // Mi gilded card played by W (opponent) but captured by Mi -> Mi +1
    const r = trick({ hands: H(['kupe_3', 'x'].slice(0, 1), ['kupe_A+pozlaceno'], ['kupe_4'], ['kupe_5']) }, [['S', 'kupe_3'], ['W', 'kupe_A'], ['N', 'kupe_4'], ['E', 'kupe_5']]);
    expect(r.tr.team).toBe('mi');
    expect(r.state.teams.mi.bonusPoints).toBe(1);
    // Vi mark captured by Mi -> no bonus
    const r2 = trick({ hands: H(['kupe_3'], ['kupe_A+pozlaceno@vi'], ['kupe_4'], ['kupe_5']) }, [['S', 'kupe_3'], ['W', 'kupe_A'], ['N', 'kupe_4'], ['E', 'kupe_5']]);
    expect(r2.state.teams.mi.bonusPoints + r2.state.teams.vi.bonusPoints).toBe(0);
  });

  it('srebreno: +3 šoldi when it ends in Mi’s pile', () => {
    const r = trick({ hands: H(['kupe_3'], ['kupe_A+srebreno'], ['kupe_4'], ['kupe_5']) }, [['S', 'kupe_3'], ['W', 'kupe_A'], ['N', 'kupe_4'], ['E', 'kupe_5']]);
    expect(r.state.teams.mi.soldi).toBe(3);
    const r2 = trick({ hands: H(['kupe_A+srebreno'], ['kupe_3'], ['kupe_4'], ['kupe_5']) }, [['S', 'kupe_A'], ['W', 'kupe_3'], ['N', 'kupe_4'], ['E', 'kupe_5']]);
    expect(r2.state.teams.mi.soldi).toBe(0);
  });

  it('nabruseno only when played by its team', () => {
    const r = trick({ hands: H(['kupe_A'], ['kupe_K+nabruseno@vi'], ['kupe_4'], ['kupe_5']) }, [['S', 'kupe_A'], ['W', 'kupe_K'], ['N', 'kupe_4'], ['E', 'kupe_5']]);
    expect(r.tr.winner).toBe('W');
    const r2 = trick({ hands: H(['kupe_A'], ['kupe_K+nabruseno'], ['kupe_4'], ['kupe_5']) }, [['S', 'kupe_A'], ['W', 'kupe_K'], ['N', 'kupe_4'], ['E', 'kupe_5']]);
    expect(r2.tr.winner).toBe('S');
  });

  it('ljuto forces both seats of the other team', () => {
    const s = makeState4({ hands: H(['bate_4'], ['kupe_4+ljuto@vi', 'bate_9'.replace('9', '7')], ['kupe_5', 'kupe_2'], ['kupe_6']), leader: 'W' });
    const r = applyAction4(s, { type: 'play', seat: 'W', uid: u4('kupe_4') });
    expect(r.state.trick.forcedTeam).toBe('mi');
  });

  it('usoljeno only when played by its team', () => {
    const r = trick({ hands: H(['kupe_K+usoljeno'], ['kupe_3'], ['kupe_4'], ['kupe_5']) }, [['S', 'kupe_K'], ['W', 'kupe_3'], ['N', 'kupe_4'], ['E', 'kupe_5']]);
    expect(r.tr.thirdsTo).toEqual({ mi: 1, vi: 1 });
    const r2 = trick({ hands: H(['kupe_K+usoljeno@vi'], ['kupe_3'], ['kupe_4'], ['kupe_5']) }, [['S', 'kupe_K'], ['W', 'kupe_3'], ['N', 'kupe_4'], ['E', 'kupe_5']]);
    expect(r2.tr.thirdsTo).toEqual({ mi: 0, vi: 2 });
  });

  it('pijano played by S or N gives the player +1 rakija', () => {
    const r = trick({ hands: H(['kupe_3'], ['kupe_4'], ['kupe_5+pijano'], ['kupe_6']), rakija: { S: 2 } }, [['S', 'kupe_3'], ['W', 'kupe_4'], ['N', 'kupe_5'], ['E', 'kupe_6']]);
    expect(r.state.seats.S.rakija).toBe(3);
    const r2 = trick({ hands: H(['kupe_3'], ['kupe_4+pijano'], ['kupe_5'], ['kupe_6']), rakija: { S: 2 } }, [['S', 'kupe_3'], ['W', 'kupe_4'], ['N', 'kupe_5'], ['E', 'kupe_6']]);
    expect(r2.state.seats.S.rakija).toBe(2);
  });

  it('divlje and glasno only in the hands of their team', () => {
    // E leads; S's first-turn akuža check runs next
    const first = (S: string[]) => {
      const st = makeState4({ hands: H(S, ['bate_5'], ['bate_6'], ['kupe_6', 'bate_7']), leader: 'E' });
      st.seats.S.akuzaChecked = false;
      const r = applyAction4(st, { type: 'play', seat: 'E', uid: u4('kupe_6') });
      return r.events.find((e) => e.t === 'akuza') as Extract<GameEvent4, { t: 'akuza' }> | undefined;
    };
    const mi = first(['kupe_A', 'kupe_2', 'kupe_5+divlje', 'bate_4']);
    expect(mi?.seat).toBe('S');
    expect(mi?.team).toBe('mi');
    expect(mi?.combos[0].key).toBe('napolitana:kupe');
    expect(first(['kupe_A', 'kupe_2', 'kupe_5+divlje@vi', 'bate_4'])).toBeUndefined();
    expect(first(['kupe_3+glasno', 'bate_3', 'spade_3', 'dinari_7'])!.total).toBe(5);
    expect(first(['kupe_3+glasno@vi', 'bate_3', 'spade_3', 'dinari_7'])!.total).toBe(3);
  });

  it('ponocno: ultima 3 when played by its team and it wins trick 10', () => {
    const r = trick({ hands: H(['kupe_7+ponocno'], ['kupe_4'], ['kupe_5'], ['kupe_6']), trickNo: 10 }, [['S', 'kupe_7'], ['W', 'kupe_4'], ['N', 'kupe_5'], ['E', 'kupe_6']]);
    expect(r.tr.ultima).toEqual({ team: 'mi', points: 3 });
    const r2 = trick({ hands: H(['kupe_7+ponocno@vi'], ['kupe_4'], ['kupe_5'], ['kupe_6']), trickNo: 10 }, [['S', 'kupe_7'], ['W', 'kupe_4'], ['N', 'kupe_5'], ['E', 'kupe_6']]);
    expect(r2.tr.ultima).toEqual({ team: 'mi', points: 1 });
  });

  it('ribarsko reveals 1 card from each opponent to the winning team', () => {
    const r = trick({ hands: H(['kupe_3+ribarsko', 'bate_4'], ['kupe_4', 'bate_5', 'spade_5'], ['kupe_5', 'bate_6'], ['kupe_6', 'bate_7', 'spade_7']) }, [['S', 'kupe_3'], ['W', 'kupe_4'], ['N', 'kupe_5'], ['E', 'kupe_6']]);
    const rev = r.events.filter((e) => e.t === 'revealed') as Extract<GameEvent4, { t: 'revealed' }>[];
    expect(rev.map((x) => x.seat).sort()).toEqual(['E', 'W']);
    for (const x of rev) { expect(x.uids.length).toBe(1); expect(x.to).toBe('mi'); expect(r.state.knownTo[x.uids[0]]).toContain('mi'); }
  });

  it('createHand4 keeps ukrasTeam on dealt cards', () => {
    const deck = standardDeck().map((c) => (c.suit === 'kupe' && c.rank === 'A' ? { ...c, ukras: 'pozlaceno' as const, ukrasTeam: 'vi' as const } : c));
    const { state } = createHand4({ seed: 'x', handNo: 1, dealer: 'E', deck, fore: { S: [], W: [], N: [], E: [] }, rakija: { S: 3, W: 0, N: 0, E: 0 }, perks: NO_PERKS });
    const all = (['S', 'W', 'N', 'E'] as Seat[]).flatMap((s) => state.seats[s].hand);
    expect(all.find((c) => c.uid === 'p:kupe_A')!.ukrasTeam).toBe('vi');
  });
});
