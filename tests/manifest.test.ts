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
    // 28 common + 2 exclusive per persona (§9.3) + 16 round-4 lines (§22.2) + 4 variants (§22.4) + the §22.5 picks
    expect(voice).toBe(158);
    const per = { barba: 52, gazda: 52, mali: 54 } as const;
    for (const p of Object.keys(m.audio.voice)) expect(Object.keys(m.audio.voice[p as 'barba']).length).toBe(per[p as 'barba']);
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
    for (const [p, n] of [['barba', 52], ['gazda', 52], ['mali', 54]] as const) expect(linesForPersona(p).length).toBe(n);
  });

  it('voice lines: user lines verbatim and no religious terms', () => {
    const user = [
      ['jebem_ti_mliko', 'Jebem ti mliko majčino!'], ['ej_ko_te_napravi', 'Ej, ko te napravi!'], ['jarca_ti', 'Jarca ti!'],
      ['jebate_led', 'Jebate led!'], ['ajme_majko', 'Ajme majko moja!'], ['jebem_ti_pasa', 'Jebem ti pasa!'],
      ['grom_te_spanija', 'Grom te Španija!'], ['vrag_ti_sricu', 'Vrag ti sriću odnija!'], ['ajde_tovare', 'Ajde tovare jedno!'],
      ['aha_sta_je_sad', 'Aha, šta je sad!'],
      // play-test round 4 (§22.2), verbatim
      ['pusi_mrtav', 'Puši kurac pederu, mrtav si za mene!'], ['muci', 'Muči!'], ['pizda_ti_materina', 'Pizda ti materina!'],
      ['jebenti_iruda', 'Jebenti Iruda!'], ['dava_odnija', 'A da te đava odnija!'],
      ['kruv_i_mast', 'Jebemti kruv i mast i ko ih sastavi!'], ['jebemti_dan', 'Jebemti dan!'], ['asti_sto', 'Asti sto!'],
      ['zna_sam_tricu', 'A zna sam da ima tricu... jebenti tricu!'], ['zna_sam_asa', 'A zna sam da ima aša, jebemti aša i ko ga stvori!'],
      ['smrdis_bakalar', 'Smrdiš ka bakalar!'], ['kartu_izmisli', 'Jebem ti kartu i ko je izmisli!'], ['idi_u_kurac', 'Iđi u kurac!'],
      ['odjebi_tricon', 'Odjebi s tom tricon!'], ['jebi_se_karte', 'Ma jebi se ti i tvoje karte!'], ['kurac_lisine', 'Kurac moj, opet lišine!'],
    ];
    for (const [id, text] of user) expect(VOICE_LINES.find((l) => l.id === id)!.subtitleHr).toBe(text);
    const banned = /(^|[^\p{L}])(bog|boga|isus|kriste?|gospe?|madon\p{L}*|svet\p{L}*|crkv\p{L}*|nebo|raj|pakl\p{L}*|vrag\p{L}*|đav\p{L}*)(?![\p{L}])/iu;
    // the devil lines the user asked for by name
    for (const l of VOICE_LINES) {
      if (l.id === 'vrag_ti_sricu' || l.id === 'dava_odnija') continue;
      expect(banned.test(l.subtitleHr)).toBe(false);
    }
    expect(VOICE_LINES.length).toBe(60);
    expect(Object.keys(VOICE_EVENTS).length).toBe(27);
  });
});
