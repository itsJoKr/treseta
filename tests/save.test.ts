import { describe, expect, it } from 'vitest';
import { newRun, onMatchWon } from '../src/game/run';
import { defaultSettings, loadRun, loadSettings, memoryStorage, SAVE_KEY, saveRun, saveSettings } from '../src/game/save';
import { sameSuitForges } from '../src/game/forge';

describe('save', () => {
  it('round trip', () => {
    const st = memoryStorage();
    const run = onMatchWon(newRun('abc', 123), { player: 21, bot: 9 }, 3, 456);
    saveRun(st, run);
    const r = loadRun(st);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.run).toEqual(run);
  });

  it('version mismatch is discarded', () => {
    const st = memoryStorage();
    st.setItem(SAVE_KEY, JSON.stringify({ version: 1, run: newRun('x', 0) }));
    const r = loadRun(st);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('version');
    expect(st.getItem(SAVE_KEY)).toBeNull();
    st.setItem(SAVE_KEY, '{not json');
    expect(loadRun(st).ok).toBe(false);
    expect(loadRun(memoryStorage())).toEqual({ ok: false, reason: 'none' });
  });

  it('settings defaults and round trip', () => {
    expect(defaultSettings('hr-HR').language).toBe('hr');
    expect(defaultSettings('en-US').language).toBe('hr'); // Croatian by default for everyone
    expect(defaultSettings('hr-HR').subtitles).toBe(false);
    expect(defaultSettings('en-US').subtitles).toBe(true);
    const st = memoryStorage();
    const s = { ...defaultSettings('en'), fast: true, tipsSeen: ['follow'] };
    saveSettings(st, s);
    expect(loadSettings(st, 'en')).toEqual(s);
  });

  it('older saves: a forgery into another suit keeps its rank in its own suit', () => {
    const d = sameSuitForges([{ suit: 'kupe', rank: '6', slot: 'kupe_6', forge: { suit: 'dinari', rank: 'A', team: 'mi' } }, { suit: 'bate', rank: '4' }] as never[]);
    expect((d[0] as { forge: unknown }).forge).toEqual({ suit: 'kupe', rank: 'A', team: 'mi' });
    expect(d[1]).toEqual({ suit: 'bate', rank: '4' });
  });
});
