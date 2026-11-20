import { describe, expect, it } from 'vitest';
import { detectMisplay, playerTurnCtx, playReactions4, trickEndCandidates4, VoiceTable4 } from '../src/audio/voiceTriggers4';
import type { VSeat } from '../src/audio/voiceTriggers4';
import { PARTNER_EVENTS, VOICE_EVENTS4 } from '../src/data/voiceEvents4';
import { VOICE_BY_ID, VOICE_LINES } from '../src/data/voiceLines';
import { deckList4 } from '../src/game/botMemory4';
import { standardDeck } from '../src/game/cards';
import { rngFor } from '../src/game/rng';
import { applyAction4 } from '../src/game/rules4';
import type { Rng } from '../src/game/rng';
import type { GameEvent4, Hand4State, Seat } from '../src/game/types4';
import type { PersonaId } from '../src/game/types';
import { c4, makeState4, u4 } from './helpers4';

function table(opts: { rng?: Rng; dur?: number; personas?: Record<VSeat, PersonaId> } = {}) {
  let now = 100000;
  const said: { seat: VSeat; id: string; at: number }[] = [];
  const queue: { at: number; fn: () => void }[] = [];
  const personas = opts.personas ?? { N: 'barba', W: 'gazda', E: 'mali' };
  const t = new VoiceTable4({
    now: () => now, rng: opts.rng ?? rngFor('v4'),
    schedule: (fn, ms) => { queue.push({ at: now + ms, fn }); },
    say: (seat, line) => { said.push({ seat, id: line.id, at: now }); return { durationMs: opts.dur ?? 1000, stop: () => {} }; },
    speakers: { N: { persona: personas.N, cussMult: 1 }, W: { persona: personas.W, cussMult: 1 }, E: { persona: personas.E, cussMult: 1 } },
  });
  const advance = (ms: number) => {
    const end = now + ms;
    for (;;) {
      queue.sort((a, b) => a.at - b.at);
      const q = queue[0];
      if (!q || q.at > end) break;
      queue.shift();
      now = q.at;
      q.fn();
    }
    now = end;
  };
  return { t, said, advance, queue };
}

const ALWAYS: Rng = () => 0;
const play = (s: Hand4State, seat: Seat, spec: string) => applyAction4(s, { type: 'play', seat, uid: u4(spec) });

describe('voice4 (§18.7)', () => {
  it('every line id in voiceEvents4 exists', () => {
    const ids = new Set(VOICE_LINES.map((l) => l.id));
    expect(ids.size).toBe(60);
    for (const cfg of Object.values(VOICE_EVENTS4)) for (const id of cfg.lines) expect(ids.has(id)).toBe(true);
    expect(Object.keys(PARTNER_EVENTS).length).toBe(13);
  });

  it('routing: a point dump onto a Vi trick makes the partner (N) speak', () => {
    // E leads kupe 3; S holds kupe A and kupe 4 and dumps the A; W and N follow low → Vi wins
    let s = makeState4({ hands: { S: ['kupe_A', 'kupe_4'], W: ['kupe_5', 'bate_4'], N: ['kupe_6', 'bate_5'], E: ['kupe_3', 'bate_6'] }, leader: 'E' });
    s = play(s, 'E', 'kupe_3').state;
    const deck = deckList4(standardDeck());
    const ctx = playerTurnCtx(s, u4('kupe_A'), deck);
    let r = play(s, 'S', 'kupe_A');
    r = play(r.state, 'W', 'kupe_5');
    const evs: GameEvent4[] = [];
    r = play(r.state, 'N', 'kupe_6');
    evs.push(...r.events);
    const tr = evs.find((e) => e.t === 'trickResolved') as Extract<GameEvent4, { t: 'trickResolved' }>;
    expect(tr.team).toBe('vi');
    const mis = detectMisplay(ctx, tr.team);
    expect(mis).toBe('dump');
    const cands = trickEndCandidates4(tr, { cards: (uid) => deck.find((c) => c.uid === uid)!, misplay: mis });
    expect(cands[0]).toMatchObject({ seat: 'N', event: 'partner_misplay' });
    const { t, said } = table({ rng: ALWAYS });
    const res = t.first(cands);
    expect(res?.seat).toBe('N');
    expect(said[0].seat).toBe('N');
    expect(PARTNER_EVENTS.partner_misplay.lines).toContain(said[0].id);
  });

  it('overtake and ignored Tučem misplays', () => {
    const deck = deckList4(standardDeck());
    // N leads kupe 3 with Tučem; E follows; S holds kupe 2 and kupe 5 and plays the 5
    let s = makeState4({ hands: { S: ['kupe_2', 'kupe_5'], W: ['kupe_4', 'bate_4'], N: ['kupe_3', 'kupe_A', 'bate_5'], E: ['kupe_6', 'bate_6'] }, leader: 'N' });
    s = applyAction4(s, { type: 'play', seat: 'N', uid: u4('kupe_3'), signal: 'tucem' }).state;
    s = play(s, 'E', 'kupe_6').state;
    expect(detectMisplay(playerTurnCtx(s, u4('kupe_5'), deck), 'mi')).toBe('tucem');
    expect(detectMisplay(playerTurnCtx(s, u4('kupe_2'), deck), 'mi')).toBeNull();
    // W leads kupe 4, N plays kupe A (S is last, so it is safe) → S overtakes with the 2 while holding the 5
    let s2 = makeState4({ hands: { S: ['kupe_2', 'kupe_5'], W: ['kupe_4', 'bate_4'], N: ['kupe_A', 'bate_5'], E: ['kupe_6', 'bate_6'] }, leader: 'W' });
    s2 = play(s2, 'W', 'kupe_4').state;
    s2 = play(s2, 'N', 'kupe_A').state;
    s2 = play(s2, 'E', 'kupe_6').state;
    expect(detectMisplay(playerTurnCtx(s2, u4('kupe_2'), deck), 'mi')).toBe('overtake');
    expect(detectMisplay(playerTurnCtx(s2, u4('kupe_5'), deck), 'mi')).toBeNull();
  });

  it('global gap of 2500 ms across speakers', () => {
    const { t, said, advance } = table({ rng: ALWAYS });
    expect(t.speak('W', 'match_start')).toBe('sidi_misaj');
    advance(1000 + 2000); // line ended 2000 ms ago
    expect(t.speak('N', 'idle')).toBeNull();
    expect(t.speak('E', 'idle')).toBeNull();
    advance(600);
    expect(t.speak('E', 'idle')).not.toBeNull();
    expect(said.map((x) => x.seat)).toEqual(['W', 'E']);
  });

  it('per-hand caps: 12 in total and 5 per speaker (§22: was 9/4); priority 3 bypasses both', () => {
    const { t, advance } = table({ rng: ALWAYS });
    let w = 0;
    for (let i = 0; i < 10; i++) { if (t.speak('W', 'bot_win_trick')) w++; advance(20000); }
    expect(w).toBe(5);
    let n = 0;
    let e = 0;
    for (let i = 0; i < 10; i++) { if (t.speak('N', 'partner_team_big')) n++; advance(20000); }
    for (let i = 0; i < 10; i++) { if (t.speak('E', 'bot_win_trick')) e++; advance(20000); }
    expect(n).toBe(5);
    expect(w + n + e).toBe(12); // E gets only 2 before the total cap
    expect(e).toBe(2);
    // priority 3 bypasses caps and interrupts a playing line
    expect(t.speak('W', 'match_bot_win')).toBe('plati_rakiju');
    expect(t.speak('N', 'partner_match_lose')).not.toBeNull();
    t.newHand();
    advance(20000);
    expect(t.speak('W', 'bot_win_trick')).not.toBeNull();
  });

  it('cooldowns are per (speaker, event)', () => {
    const { t, advance } = table({ rng: ALWAYS });
    expect(t.speak('W', 'bot_win_trick')).not.toBeNull();
    advance(4000);
    expect(t.speak('W', 'bot_win_trick')).toBeNull(); // W's 8 s cooldown
    expect(t.speak('E', 'bot_win_trick')).not.toBeNull(); // E has its own
  });

  it('the argument: an angry opponent line gets a partner reply 900 ms after it ends, at most once per hand', () => {
    const { t, said, advance } = table({ rng: ALWAYS, dur: 1500 });
    // bot_lose_big pool is angry-heavy; force an angry line
    const id = t.speak('W', 'bot_lose_big', { lines: ['jebem_ti_mliko'] });
    expect(VOICE_BY_ID[id!].mood).toBe('angry');
    advance(1500 + 899);
    expect(said.length).toBe(1);
    advance(1);
    expect(said.length).toBe(2);
    expect(said[1].seat).toBe('N');
    expect(said[1].at - said[0].at).toBe(1500 + 900);
    expect(['sta_si_mislija', 'gledaj_i_uci', 'lipo_daj_ovamo', 'ajde_tovare']).toContain(said[1].id);
    // a second angry line in the same hand gets no reply
    advance(10000);
    t.speak('E', 'bot_lose_big', { lines: ['grom_te_spanija'] });
    advance(10000);
    expect(said.filter((x) => x.seat === 'N').length).toBe(1);
    t.newHand();
    t.speak('E', 'bot_lose_big', { lines: ['jebem_ti_pasa'] });
    advance(10000);
    expect(said.filter((x) => x.seat === 'N').length).toBe(2);
  });

  it('the argument fires with p = 0.25', () => {
    let hits = 0;
    for (let k = 0; k < 400; k++) {
      const { t, said, advance } = table({ rng: rngFor('arg', k) });
      t.speak('W', 'match_bot_win', { lines: ['jebem_ti_mliko'] }); // priority 3, always speaks
      advance(5000);
      if (said.some((x) => x.seat === 'N')) hits++;
    }
    expect(hits / 400).toBeGreaterThan(0.18);
    expect(hits / 400).toBeLessThan(0.32);
  });

  it('persona-exclusive lines are filtered per speaker', () => {
    const exclusive = VOICE_LINES.filter((l) => l.exclusive);
    expect(exclusive.length).toBeGreaterThan(0);
    for (let k = 0; k < 60; k++) {
      const { t, said, advance } = table({ rng: rngFor('px', k), personas: { N: 'mali', W: 'barba', E: 'gazda' } });
      for (let i = 0; i < 6; i++) { t.speak('N', 'partner_hand_win'); advance(20000); t.speak('W', 'bot_win_big'); advance(20000); t.speak('E', 'bot_win_big'); advance(20000); }
      const personaOf = { N: 'mali', W: 'barba', E: 'gazda' } as const;
      for (const x of said) expect(VOICE_BY_ID[x.id as keyof typeof VOICE_BY_ID].personas).toContain(personaOf[x.seat]);
    }
  });

  it('match end: the opponent speaks first, then the partner 600 ms after that line ends', () => {
    const { t, said, advance } = table({ rng: ALWAYS, dur: 1200 });
    t.matchEnd('mi', 3);
    advance(1200 + 599);
    expect(said.length).toBe(1);
    advance(1);
    expect(said.map((x) => [x.seat, x.id])).toEqual([['W', said[0].id], ['N', 'plati_rakiju']]);
  });
});

describe('voice §19.6', () => {
  it('a Vi forgery / Briškula win → that opponent speaks; a Mi one → the partner praises (existing ids only)', () => {
    const deck = deckList4(standardDeck());
    const cards = (uid: string) => deck.find((c) => c.uid === uid)!;
    const base = { t: 'trickResolved' as const, trickNo: 4, thirdsTo: { mi: 0, vi: 1 }, bonus: [], plays: [{ seat: 'S' as Seat, uid: u4('kupe_4') }, { seat: 'W' as Seat, uid: u4('bate_4') }, { seat: 'N' as Seat, uid: u4('kupe_5') }, { seat: 'E' as Seat, uid: u4('kupe_6') }] };
    const vi = trickEndCandidates4({ ...base, winner: 'W', team: 'vi', special: 'briskula' }, { cards, misplay: null });
    expect(vi[0]).toMatchObject({ seat: 'W', event: 'bot_play_strong', p: 1.0 });
    const mi = trickEndCandidates4({ ...base, winner: 'S', team: 'mi', special: 'forge' }, { cards, misplay: null });
    expect(mi[0]).toMatchObject({ seat: 'N', event: 'partner_player_great' });
    expect(mi[1]).toMatchObject({ event: 'player_great', p: 0.8 });
    const ids = new Set(VOICE_LINES.map((l) => l.id));
    for (const c of [...vi, ...mi]) for (const id of c.lines ?? VOICE_EVENTS4[c.event].lines) expect(ids.has(id)).toBe(true);
  });
});

describe('mid-trick reactions in Partneri (§22.3)', () => {
  const c = (spec: string) => c4(spec);
  const rng = () => 0.1;

  it('a bot forced to give its ace to the other side\'s 3 is mad; the player in that spot gets an opponent gloating', () => {
    const r = playReactions4({ seat: 'E', card: c('kupe_A'), legal: [c('kupe_A')], before: [{ seat: 'S', card: c('kupe_3') }, { seat: 'W', card: c('kupe_5') }, { seat: 'N', card: c('kupe_6') }], rng });
    expect(r[0]).toEqual({ seat: 'E', event: 'ace_snatched' });
    const g = playReactions4({ seat: 'S', card: c('bate_A'), legal: [c('bate_A')], before: [{ seat: 'W', card: c('bate_2') }], rng });
    expect(g[0]).toEqual({ seat: 'W', event: 'gloat' });
  });

  it('"A zna sam da ima tricu": the bot whose A or 2 was winning, when the other side plays the 3', () => {
    const r = playReactions4({ seat: 'S', card: c('spade_3'), legal: [c('spade_3'), c('spade_4')], before: [{ seat: 'E', card: c('spade_2') }], rng });
    expect(r[0]).toEqual({ seat: 'E', event: 'knew_trica' });
    expect(r).toContainEqual({ seat: 'N', event: 'partner_react' });
    const a = playReactions4({ seat: 'N', card: c('dinari_A'), legal: [c('dinari_A')], before: [{ seat: 'W', card: c('dinari_K') }], rng });
    expect(a[0]).toEqual({ seat: 'W', event: 'knew_ace' });
    // the partner's card was winning: a team-mate covering it is not a reaction
    expect(playReactions4({ seat: 'N', card: c('dinari_3'), legal: [c('dinari_3')], before: [{ seat: 'S', card: c('dinari_2') }, { seat: 'W', card: c('dinari_4') }], rng })).toEqual([]);
  });

  it('a 3 taking the player\'s trick makes the partner grunt; a led 3 makes the other side grunt', () => {
    const r = playReactions4({ seat: 'W', card: c('kupe_3'), legal: [c('kupe_3')], before: [{ seat: 'S', card: c('kupe_A') }], rng });
    expect(r).toEqual([{ seat: 'N', event: 'react_short' }]);
    expect(playReactions4({ seat: 'S', card: c('kupe_3'), legal: [c('kupe_3')], before: [], rng })).toEqual([{ seat: 'W', event: 'react_short' }]);
    expect(playReactions4({ seat: 'E', card: c('kupe_3'), legal: [c('kupe_3')], before: [], rng })).toEqual([{ seat: 'N', event: 'react_short' }]);
  });

  it('VoiceTable4.first says the first candidate that passes the arbiter', () => {
    const { t, said, advance } = table({ rng: ALWAYS });
    t.speak('W', 'match_start');
    advance(1000 + 1300); // past the 1200 ms reaction gap, inside the 2500 ms table gap
    expect(t.speak('W', 'bot_win_trick')).toBeNull();
    // W is gazda: his only "a 3 beat me" line (mali also has odjebi_tricon)
    const got = t.first([{ seat: 'W', event: 'knew_trica' }]);
    expect(got?.line).toBe('zna_sam_tricu');
    expect(said.map((x) => x.id)).toEqual(['sidi_misaj', 'zna_sam_tricu']);
  });
});
