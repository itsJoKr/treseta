import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildDefaultManifest, SFX_IDS } from '../src/assets/defaultManifest';
import type { AssetManifest } from '../src/assets/defaultManifest';
import { VOICE_EVENTS } from '../src/data/voiceEvents';
import { linesForPersona, VOICE_LINES } from '../src/data/voiceLines';
import { RANKS, rankFile, SUITS } from '../src/game/cards';
import { FORA_IDS } from '../src/game/fore';
import { LADDER, OPPONENTS } from '../src/game/opponents';
import { UKRAS_IDS } from '../src/game/ukrasi';

const json = JSON.parse(readFileSync(resolve(process.cwd(), 'public/assets/manifest.json'), 'utf8')) as AssetManifest;

describe('manifest', () => {
  it('counts from §15.2', () => {
    const m = json;
    expect(m.version).toBe(1);
    expect(m.basePath).toBe('assets/');
    expect(Object.keys(m.images.cards).length).toBe(40);
    expect(Object.keys(m.images.backs).length).toBe(2);
    expect(Object.keys(m.images.suits).length).toBe(4);
    expect(Object.keys(m.images.ukrasi).length).toBe(11);
    expect(Object.keys(m.images.fore).length).toBe(11);
    expect(Object.keys(m.images.portraits).length).toBe(8);
    expect(Object.keys(m.images.env).length).toBe(4);
    expect(Object.keys(m.images.ui).length).toBe(6);
    expect(Object.keys(m.audio.sfx).length).toBe(25);
    expect(Object.keys(m.audio.ambient).length).toBe(2);
    const voice = Object.values(m.audio.voice).reduce((a, v) => a + Object.keys(v).length, 0);
    expect(voice).toBe(90);
    for (const p of Object.keys(m.audio.voice)) expect(Object.keys(m.audio.voice[p as 'barba']).length).toBe(30);
  });

  it('manifest.json matches the built-in manifest', () => {
    expect(json).toEqual(buildDefaultManifest());
  });

  it('every id in data files exists in the manifest', () => {
    for (const s of SUITS) for (const r of RANKS) expect(json.images.cards[`${s}_${rankFile(r)}`]).toBe(`cards/${s}_${rankFile(r)}.webp`);
    // every ukras and fora has painted art (Prevrtljivo and Briškula! since play-test round 3)
    for (const u of UKRAS_IDS) expect(json.images.ukrasi[u]).toBe(`ukrasi/${u}.webp`);
    for (const f of FORA_IDS) expect(json.images.fore[f]).toBe(`fore/${f}.webp`);
    expect(json.images.ui.falsa).toBe('ui/falsa.webp');
    expect(json.images.ui.joe).toBe('ui/joe.webp');
    for (const o of LADDER) {
      expect(json.images.portraits[o]).toBeDefined();
      const persona = OPPONENTS[o].persona;
      expect(json.audio.voice[persona]).toBeDefined();
    }
    for (const id of ['dino', 'stipe', 'ive', 'frane'] as const) expect(json.images.portraits[id]).toBe(`portraits/${id}.webp`);
    for (const id of SFX_IDS) expect(json.audio.sfx[id]).toBeDefined();
    for (const ev of Object.values(VOICE_EVENTS)) {
      for (const line of ev.lines) {
        const personas = VOICE_LINES.find((l) => l.id === line)!.personas;
        for (const p of personas) expect(json.audio.voice[p][line]).toBe(`audio/voice/${p}/${line}.mp3`);
      }
    }
    for (const p of ['barba', 'gazda', 'mali'] as const) expect(linesForPersona(p).length).toBe(30);
  });

  it('voice lines: user lines verbatim and no religious terms', () => {
    const user = [
      ['jebem_ti_mliko', 'Jebem ti mliko majčino!'], ['ej_ko_te_napravi', 'Ej, ko te napravi!'], ['jarca_ti', 'Jarca ti!'],
      ['jebate_led', 'Jebate led!'], ['ajme_majko', 'Ajme majko moja!'], ['jebem_ti_pasa', 'Jebem ti pasa!'],
      ['grom_te_spanija', 'Grom te Španija!'], ['vrag_ti_sricu', 'Vrag ti sriću odnija!'], ['ajde_tovare', 'Ajde tovare jedno!'],
      ['aha_sta_je_sad', 'Aha, šta je sad!'],
    ];
    for (const [id, text] of user) expect(VOICE_LINES.find((l) => l.id === id)!.subtitleHr).toBe(text);
    const banned = /\b(bog|boga|isus|kriste?|gospe?|madon\w*|svet\w*|crkv\w*|nebo|raj|pakl\w*|vrag\w*)\b/i;
    for (const l of VOICE_LINES) {
      if (l.id === 'vrag_ti_sricu') continue;
      expect(banned.test(l.subtitleHr)).toBe(false);
    }
    expect(VOICE_LINES.length).toBe(34);
    expect(Object.keys(VOICE_EVENTS).length).toBe(22);
  });
});
