import { describe, expect, it } from 'vitest';
import { VoiceDirector } from '../src/audio/voiceDirector';
import { akuzaBotLines, handEndEvent, playReactions, trickEndEvent } from '../src/audio/voiceTriggers';
import { REACT_GAP_MS } from '../src/data/voiceEvents';
import { VOICE_BY_ID, variantsOf } from '../src/data/voiceLines';
import { rngFor } from '../src/game/rng';
import type { GameEvent } from '../src/game/types';
import { card } from './helpers';

function director(persona: 'barba' | 'gazda' | 'mali' = 'gazda', cussMult = 1) {
  let now = 100000;
  const said: string[] = [];
  const d = new VoiceDirector({
    now: () => now, rng: rngFor('v'), persona, cussMult,
    say: (line) => { said.push(line.id); return { durationMs: 1000, stop: () => {} }; },
  });
  return { d, said, advance: (ms: number) => { now += ms; } };
}

describe('voice director (§9.5)', () => {
  it('p=1 events always speak; lines are from the event pool and the persona', () => {
    const { d, said } = director('mali');
    expect(d.onEvent('match_start')).toBe('sidi_misaj');
    expect(said).toEqual(['sidi_misaj']);
  });

  it('global gap of 3500 ms after a line for priority < 3', () => {
    const { d, said, advance } = director();
    d.onEvent('match_start');
    advance(1000 + 2000); // line ends at +1000, only 2000 after
    expect(d.onEvent('idle')).toBeNull();
    advance(1600);
    expect(d.onEvent('idle')).not.toBeNull();
    expect(said.length).toBe(2);
  });

  it('priority 3 interrupts a playing line', () => {
    const { d, said } = director();
    d.onEvent('match_start');
    expect(d.onEvent('match_bot_win')).toBe('plati_rakiju');
    expect(said).toEqual(['sidi_misaj', 'plati_rakiju']);
  });

  it('event cooldown and per-hand cap of 10 (§22: was 8)', () => {
    const { d, advance } = director();
    expect(d.onEvent('idle')).not.toBeNull();
    advance(6000);
    expect(d.onEvent('idle')).toBeNull(); // 25 s cooldown
    advance(20000);
    expect(d.onEvent('idle')).not.toBeNull();
    const { d: d2, advance: adv2 } = director();
    let spoken = 0;
    for (let i = 0; i < 30; i++) { if (d2.onEvent('match_start')) spoken++; adv2(5000); }
    expect(spoken).toBe(10);
    d2.newHand();
    expect(d2.onEvent('match_start')).not.toBeNull();
  });

  it('avoids the last 3 lines when possible and respects persona exclusives', () => {
    const { d, said, advance } = director('barba');
    for (let i = 0; i < 6; i++) { d.onEvent('bot_win_big'); advance(10000); }
    for (const id of said) expect(VOICE_BY_ID[id as 'stari_ja'].personas).toContain('barba');
    for (let i = 1; i < said.length; i++) expect(said[i]).not.toBe(said[i - 1]);
  });

  it('trick-end selection order and akuža line choice', () => {
    const tr = (over: Partial<Extract<GameEvent, { t: 'trickResolved' }>>) => ({ t: 'trickResolved', trickNo: 5, winner: 'player', leadUid: '', followUid: '', thirdsTo: { player: 0, bot: 0 }, bonus: [], ...over }) as Extract<GameEvent, { t: 'trickResolved' }>;
    const lead = card('kupe_A', 'bot');
    const follow = card('kupe_3', 'player');
    expect(trickEndEvent(tr({ thirdsTo: { player: 4, bot: 0 } }), { lead, follow, playerUsedDuplo: false })).toBe('player_great');
    expect(trickEndEvent(tr({ winner: 'player', thirdsTo: { player: 3, bot: 0 } }), { lead: card('kupe_4', 'player'), follow: card('kupe_K', 'bot'), playerUsedDuplo: false })).toBe('bot_lose_big');
    expect(trickEndEvent(tr({ winner: 'bot', thirdsTo: { player: 0, bot: 0 } }), { lead: card('kupe_4', 'player'), follow: card('kupe_5', 'bot'), playerUsedDuplo: false })).toBe('bot_win_trick');
    expect(trickEndEvent(tr({ trickNo: 20, winner: 'bot' }), { lead, follow, playerUsedDuplo: false })).toBe('ultima_bot');
    expect(akuzaBotLines([{ key: 'napolitana:kupe', label: '', points: 3, uids: [] }])).toEqual(['napolitana']);
    expect(akuzaBotLines([{ key: 'kind:3', label: '', points: 4, uids: [] }])).toEqual(['akuzan_cetiri']);
    expect(akuzaBotLines([{ key: 'kind:3', label: '', points: 3, uids: [] }])).toEqual(['akuzan_tri']);
    const b = (p: number, q: number) => ({ player: { thirds: 0, cardPoints: p, rounding: 'floor' as const, ultima: 0, ukrasPoints: 0, akuzaPoints: 0, total: p }, bot: { thirds: 0, cardPoints: q, rounding: 'floor' as const, ultima: 0, ukrasPoints: 0, akuzaPoints: 0, total: q } });
    expect(handEndEvent(b(9, 2))).toBe('big_swing');
    expect(handEndEvent(b(2, 9))).toBe('hand_end_bot_win');
    expect(handEndEvent(b(6, 5))).toBe('hand_end_bot_lose');
  });
});

describe('mid-trick reactions (§22.3)', () => {
  const C = (spec: string, owner: 'player' | 'bot' = 'player') => card(spec, owner);

  it('ace_snatched: the bot must give its only ace to the player\'s 3', () => {
    const r = playReactions({ side: 'bot', card: C('kupe_A', 'bot'), legal: [C('kupe_A', 'bot')], lead: C('kupe_3') });
    expect(r).toEqual(['ace_snatched']);
    // not forced (it also had the 5): no reaction
    expect(playReactions({ side: 'bot', card: C('kupe_A', 'bot'), legal: [C('kupe_A', 'bot'), C('kupe_5', 'bot')], lead: C('kupe_3') })).toEqual([]);
    // the lead was only a King: the ace wins, nothing to be mad about
    expect(playReactions({ side: 'bot', card: C('kupe_A', 'bot'), legal: [C('kupe_A', 'bot')], lead: C('kupe_K') })).toEqual([]);
  });

  it('knew_trica / knew_ace when the player beats the bot\'s lead', () => {
    expect(playReactions({ side: 'player', card: C('bate_3'), legal: [C('bate_3'), C('bate_4')], lead: C('bate_2', 'bot') })[0]).toBe('knew_trica');
    expect(playReactions({ side: 'player', card: C('bate_3'), legal: [C('bate_3')], lead: C('bate_A', 'bot') })[0]).toBe('knew_trica');
    expect(playReactions({ side: 'player', card: C('spade_A'), legal: [C('spade_A')], lead: C('spade_C', 'bot') })).toEqual(['knew_ace']);
    // beating a 7 with a 3 is just a grunt
    expect(playReactions({ side: 'player', card: C('bate_3'), legal: [C('bate_3')], lead: C('bate_7', 'bot') })).toEqual(['react_short']);
  });

  it('gloat when the player must give up an ace to the bot\'s 2', () => {
    expect(playReactions({ side: 'player', card: C('dinari_A'), legal: [C('dinari_A')], lead: C('dinari_2', 'bot') })).toEqual(['gloat']);
  });

  it('a led 3 by the player may get a grunt; the bot\'s own leads say nothing here', () => {
    expect(playReactions({ side: 'player', card: C('kupe_3'), legal: [C('kupe_3')] })).toEqual(['react_short']);
    expect(playReactions({ side: 'bot', card: C('kupe_3', 'bot'), legal: [C('kupe_3', 'bot')] })).toEqual([]);
  });

  it('reactions need only REACT_GAP_MS of silence, not the 3500 ms global gap', () => {
    const { d, advance } = director();
    d.onEvent('match_start');
    advance(1000 + REACT_GAP_MS);
    expect(d.onEvent('idle')).toBeNull();
    expect(d.onEvent('ace_snatched', { p: 1 })).not.toBeNull();
    expect(VOICE_BY_ID.argh.short).toBe(true);
  });
});

describe('line variants (§22.4)', () => {
  it('a group speaks one of its wordings and does not repeat the last one', () => {
    const { d, advance } = director('mali');
    const said: string[] = [];
    for (let i = 0; i < 6; i++) {
      const id = d.onEvent('knew_ace', { p: 1 });
      if (id) said.push(id);
      advance(60000);
    }
    expect(said.length).toBe(6);
    for (const id of said) expect(VOICE_BY_ID[id as 'zna_sam_asa'].group).toBe('zna_sam_asa');
    for (let i = 1; i < said.length; i++) expect(said[i]).not.toBe(said[i - 1]);
    expect(new Set(said).size).toBeGreaterThan(1);
    expect(variantsOf('ko_je_misaja', 'barba').map((l) => l.subtitleHr)).toEqual([
      'Ko je ovo miša, a?!', 'Ko je ovo miša, da mu jebem sve!', 'Jebem ti sve i onog ko je miša ove karte!',
    ]);
  });
});
