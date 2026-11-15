import { describe, expect, it } from 'vitest';
import { newRun } from '../src/game/run';
import { newRun4 } from '../src/game/run4';
import { loadRun, loadRun4, loadStats, loadStats4, memoryStorage, SAVE4_KEY, SAVE_KEY, saveRun, saveRun4, saveStats4, clearRun4 } from '../src/game/save';

describe('save4', () => {
  it('separate keys; one mode does not touch the other', () => {
    const st = memoryStorage();
    const d = newRun('duel', 1);
    const p = newRun4('pair', 2);
    saveRun(st, d);
    saveRun4(st, p);
    expect(st.data.has(SAVE_KEY)).toBe(true);
    expect(st.data.has(SAVE4_KEY)).toBe(true);
    expect(loadRun(st)).toEqual({ ok: true, run: d });
    expect(loadRun4(st)).toEqual({ ok: true, run: p });
    clearRun4(st);
    expect(loadRun(st).ok).toBe(true);
    expect(loadRun4(st).ok).toBe(false);
    saveStats4(st, { runsStarted: 3, runsWon: 1, bestLadder: 2, bestRunSoldi: 40 });
    expect(loadStats(st).runsStarted).toBe(0);
    expect(loadStats4(st).runsStarted).toBe(3);
  });

  it('version mismatch is discarded', () => {
    const st = memoryStorage();
    st.setItem(SAVE4_KEY, JSON.stringify({ version: 3, run: newRun4('x', 0) }));
    expect(loadRun4(st)).toEqual({ ok: false, reason: 'version' });
    expect(st.getItem(SAVE4_KEY)).toBeNull();
  });
});

describe('§19.8 save cleanup', () => {
  it('v1 keys are deleted on startup (once), v2 keys per mode are kept', async () => {
    const { memoryStorage, removeOldSaves, SAVE_KEY, SAVE4_KEY } = await import('../src/game/save');
    const st = memoryStorage();
    st.setItem('treseta.save.v1', '{}');
    st.setItem('treseta.save.partneri.v1', '{}');
    st.setItem(SAVE_KEY, '{"version":2}');
    expect(SAVE_KEY).toBe('treseta.save.v2');
    expect(SAVE4_KEY).toBe('treseta.save.partneri.v2');
    expect(removeOldSaves(st)).toBe(true);
    expect(st.getItem('treseta.save.v1')).toBeNull();
    expect(st.getItem('treseta.save.partneri.v1')).toBeNull();
    expect(st.getItem(SAVE_KEY)).not.toBeNull();
    expect(removeOldSaves(st)).toBe(false);
  });
});
