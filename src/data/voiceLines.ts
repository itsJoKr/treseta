// §9.3 voice lines as data.
import type { PersonaId } from '../game/types';

export type Mood = 'angry' | 'laugh' | 'sad' | 'neutral';
export type VoiceLineId =
  | 'jebem_ti_mliko' | 'ej_ko_te_napravi' | 'jarca_ti' | 'jebate_led' | 'ajme_majko' | 'jebem_ti_pasa'
  | 'grom_te_spanija' | 'vrag_ti_sricu' | 'ajde_tovare' | 'aha_sta_je_sad' | 'lipo_daj_ovamo' | 'sta_si_mislija'
  | 'gledaj_i_uci' | 'evo_ti_ga_na' | 'srice_nima' | 'ne_mogu_virovat' | 'ko_je_misaja' | 'ukra_si_mi'
  | 'same_lisine' | 'igraj_vise' | 'napolitana' | 'akuzan_tri' | 'akuzan_cetiri' | 'opet_akuza'
  | 'ultima_moja' | 'sidi_misaj' | 'plati_rakiju' | 'tucem' | 'ka_bombone' | 'oces_danas'
  | 'u_mojoj_konobi' | 'runda_na_mene' | 'ka_riba' | 'stari_ja'
  // play-test round 4 (§22): new curses, two "I knew it" lines and short interjections
  | 'pusi_mrtav' | 'muci' | 'pizda_ti_materina' | 'jebenti_iruda' | 'dava_odnija' | 'kruv_i_mast'
  | 'jebemti_dan' | 'asti_sto' | 'zna_sam_tricu' | 'zna_sam_asa'
  | 'argh' | 'joj' | 'oho' | 'ehe' | 'ma_daj' | 'pff'
  // §22.4 variants: other wordings of a line (same group, picked at random when the group is said)
  | 'zna_sam_asa_2' | 'zna_sam_asa_3' | 'ko_je_misaja_2' | 'ko_je_misaja_3'
  // §22.5 the user's picks, mostly one character each so the voices differ
  | 'smrdis_bakalar' | 'kartu_izmisli' | 'idi_u_kurac' | 'odjebi_tricon' | 'jebi_se_karte' | 'kurac_lisine';

export interface VoiceLine {
  id: VoiceLineId;
  personas: PersonaId[];
  tts: string;
  subtitleHr: string;
  glossEn: string;
  mood: Mood;
  exclusive: boolean;
  /** a short interjection (a grunt, "Oho!"): used for quick mid-trick reactions */
  short: boolean;
  /** the line this one is a wording of (its own id for a base line); event pools list groups */
  group: VoiceLineId;
}

const ALL: PersonaId[] = ['barba', 'gazda', 'mali'];

const RAW: [VoiceLineId, PersonaId[] | 'all', string, string][] = [
  ['jebem_ti_mliko', 'all', '[angry] Jebem ti mliko majčino!', "Damn your mother's milk!"],
  ['ej_ko_te_napravi', 'all', '[surprised] Ej, ko te napravi!', 'Hey, who on earth made you?!'],
  ['jarca_ti', 'all', '[frustrated] Jarca ti!', 'Goat take it!'],
  ['jebate_led', 'all', '[exasperated] Jebate led!', 'Damn the ice!'],
  ['ajme_majko', 'all', '[sighs] Ajme majko moja!', 'Oh, mother of mine!'],
  ['jebem_ti_pasa', 'all', '[angry] Jebem ti pasa!', 'Damn your dog!'],
  ['grom_te_spanija', 'all', '[shouting] Grom te Španija!', 'Thunder strike you!'],
  ['vrag_ti_sricu', 'all', '[frustrated] Vrag ti sriću odnija!', 'May the devil take your luck!'],
  ['ajde_tovare', 'all', '[sarcastic] Ajde tovare jedno!', 'Come on, you donkey!'],
  ['aha_sta_je_sad', 'all', '[excited] Aha, šta je sad!', 'Aha, what now?!'],
  ['lipo_daj_ovamo', 'all', '[laughs] Lipo, lipo... daj to ovamo!', 'Nice, nice... hand it over!'],
  ['sta_si_mislija', 'all', '[sarcastic] Ma šta si mislija, a?', 'And what were you thinking, huh?'],
  ['gledaj_i_uci', 'all', 'Gledaj i uči, mali!', 'Watch and learn, kid!'],
  ['evo_ti_ga_na', 'all', '[excited] Evo ti ga na!', 'There, take that!'],
  ['srice_nima', 'all', '[sighs] Jebi ga, sriće nima.', 'Damn it, no luck at all.'],
  ['ne_mogu_virovat', 'all', '[frustrated] Ma ne mogu virovat!', "I can't believe it!"],
  ['ko_je_misaja', 'all', '[angry] Ko je ovo miša, a?!', 'Who shuffled this, huh?!'],
  ['ukra_si_mi', 'all', "[shouting] Ukra' si mi to, lopove!", 'You stole that from me, you thief!'],
  ['same_lisine', 'all', '[sighs] Same lišine, same lišine...', 'Nothing but junk cards...'],
  ['igraj_vise', 'all', '[impatient] Ajde, igraj više, zaspa si!', 'Come on, play already, you fell asleep!'],
  ['napolitana', 'all', '[shouting] Napolitana! Piši tri!', 'Napolitana! Write down three!'],
  ['akuzan_tri', 'all', '[excited] Akužan tri! Piši, piši!', 'I declare three! Write it down!'],
  ['akuzan_cetiri', 'all', '[shouting] Akužan četiri! Gledaj i plači!', 'I declare four! Look and weep!'],
  ['opet_akuza', 'all', '[frustrated] Opet akuža?! Di ti to sve dođe?', 'Another declaration?! Where does it all come from?'],
  ['ultima_moja', 'all', '[laughs] Ultima je moja!', 'The last trick is mine!'],
  ['sidi_misaj', 'all', 'Ajde, sidi... mišaj karte.', 'Come on, sit down... shuffle the cards.'],
  ['plati_rakiju', 'all', '[laughs] Plati rakiju i ne plači!', "Pay for the rakija and don't cry!"],
  ['tucem', 'all', '[shouting] Tučem!', 'I knock!'],
  ['ka_bombone', ['mali'], "[giggles] Ka' da ditetu bombone otimam!", 'Like taking candy from a baby!'],
  ['oces_danas', ['mali'], '[mischievously] Oćeš danas ili sutra, brate?', 'Today or tomorrow, bro?'],
  ['u_mojoj_konobi', ['gazda'], '[shouting] U mojoj konobi ja dobivan!', 'In my konoba, I win!'],
  ['runda_na_mene', ['gazda'], '[sighs] Dobro, dobro... ova runda je na mene.', "Fine, fine... this round's on me."],
  ['ka_riba', ['barba'], '[grumbling] Šta čekaš, da riba zagrize?', 'What are you waiting for, a fish to bite?'],
  ['stari_ja', ['barba'], "[laughs] Igra' san ja ovo prije nego si se ti rodija!", 'I was playing this before you were born!'],
  // 35-44: play-test round 4 lines (§22.2)
  ['pusi_mrtav', 'all', '[furious] Puši kurac pederu, mrtav si za mene!', "Suck it, you f*g, you're dead to me!"],
  ['muci', 'all', '[angry] Muči!', 'Shut up!'],
  ['pizda_ti_materina', 'all', '[furious] Pizda ti materina!', 'Damn your mother!'],
  ['jebenti_iruda', 'all', '[exasperated] Jebenti Iruda!', 'Damn Herod!'],
  ['dava_odnija', 'all', '[frustrated] A da te đava odnija!', 'May the devil take you!'],
  ['kruv_i_mast', 'all', '[shouting] Jebemti kruv i mast i ko ih sastavi!', 'Damn the bread and the lard and whoever put them together!'],
  ['jebemti_dan', 'all', '[sighs] Jebemti dan!', 'Damn this day!'],
  ['asti_sto', 'all', '[surprised] Asti sto!', "Well, I'll be!"],
  ['zna_sam_tricu', 'all', '[frustrated] A zna sam da ima tricu... jebenti tricu!', 'I knew he had the three... damn the three!'],
  ['zna_sam_asa', 'all', '[frustrated] A zna sam da ima aša, jebemti aša i ko ga stvori!', 'I knew he had the ace, damn the ace and whoever made it!'],
  // 45-50: short interjections
  ['argh', 'all', '[groans] Argh.', 'Argh.'],
  ['joj', 'all', '[sighs] Joj, joj, joj...', 'Oh no, oh no...'],
  ['oho', 'all', '[surprised] Oho!', 'Whoa!'],
  ['ehe', 'all', '[chuckles] Ehe-he!', 'Heh-heh!'],
  ['ma_daj', 'all', '[annoyed] Ma daj!', 'Oh, come on!'],
  ['pff', 'all', '[exhales] Pff.', 'Pff.'],
  // §22.5 (rows 55-60 of §9.3)
  ['smrdis_bakalar', ['barba'], '[mocking] Smrdiš ka bakalar!', 'You stink like salt cod!'],
  ['kartu_izmisli', ['gazda'], '[angry] Jebem ti kartu i ko je izmisli!', 'Damn the card and whoever invented it!'],
  ['idi_u_kurac', ['mali'], '[angry] Iđi u kurac!', 'Go to hell!'],
  ['odjebi_tricon', ['mali'], '[annoyed] Odjebi s tom tricon!', 'Piss off with that three!'],
  ['jebi_se_karte', ['mali'], '[furious] Ma jebi se ti i tvoje karte!', 'Screw you and your cards!'],
  ['kurac_lisine', 'all', '[frustrated] Kurac moj, opet lišine!', 'Damn it, junk cards again!'],
];

/** Moods of the §22.5 lines (the index lists below cover rows 1-50). */
const MOOD_BY_ID: Partial<Record<VoiceLineId, Mood>> = {
  smrdis_bakalar: 'laugh', kartu_izmisli: 'angry', idi_u_kurac: 'angry', odjebi_tricon: 'angry', jebi_se_karte: 'angry', kurac_lisine: 'sad',
};

/** §22.4 other wordings: [id, group, tts, gloss]. Same personas and mood as the group's base line. */
const VARIANTS: [VoiceLineId, VoiceLineId, string, string][] = [
  ['zna_sam_asa_2', 'zna_sam_asa', '[angry] Jebemti aša i ko ga stvori!', 'Damn the ace and whoever made it!'],
  ['zna_sam_asa_3', 'zna_sam_asa', '[frustrated] Jebemti aša, zna sam da ga imaš!', 'Damn the ace, I knew you had it!'],
  ['ko_je_misaja_2', 'ko_je_misaja', '[furious] Ko je ovo miša, da mu jebem sve!', 'Who shuffled this, damn everything of his!'],
  ['ko_je_misaja_3', 'ko_je_misaja', '[shouting] Jebem ti sve i onog ko je miša ove karte!', 'Damn it all and whoever shuffled these cards!'],
];

const SHORT: VoiceLineId[] = ['muci', 'asti_sto', 'argh', 'joj', 'oho', 'ehe', 'ma_daj', 'pff'];

const ANGRY = [1, 6, 7, 17, 18, 35, 36, 37, 38, 39, 40, 45];
const LAUGH = [11, 25, 27, 29, 34, 48];
const SAD = [5, 15, 19, 32, 41, 46];

export function stripTags(tts: string): string {
  return tts.replace(/\[[^\]]*\]\s*/g, '').trim();
}

const BASE_LINES: VoiceLine[] = RAW.map(([id, personas, tts, gloss], i) => {
  const n = i + 1;
  const mood: Mood = MOOD_BY_ID[id] ?? (ANGRY.includes(n) ? 'angry' : LAUGH.includes(n) ? 'laugh' : SAD.includes(n) ? 'sad' : 'neutral');
  return {
    id,
    personas: personas === 'all' ? ALL.slice() : personas,
    tts,
    subtitleHr: stripTags(tts),
    glossEn: gloss,
    mood,
    exclusive: personas !== 'all',
    short: SHORT.includes(id),
    group: id,
  };
});

export const VOICE_LINES: VoiceLine[] = [
  ...BASE_LINES,
  ...VARIANTS.map(([id, group, tts, gloss]) => {
    const base = BASE_LINES.find((l) => l.id === group)!;
    return { ...base, id, tts, subtitleHr: stripTags(tts), glossEn: gloss, group };
  }),
];

export const VOICE_BY_ID: Record<VoiceLineId, VoiceLine> = Object.fromEntries(VOICE_LINES.map((l) => [l.id, l])) as Record<VoiceLineId, VoiceLine>;

export function linesForPersona(p: PersonaId): VoiceLine[] {
  return VOICE_LINES.filter((l) => l.personas.includes(p));
}

/** Every wording of a group that `p` can say (the base line first). */
export function variantsOf(group: VoiceLineId, p: PersonaId): VoiceLine[] {
  return VOICE_LINES.filter((l) => l.group === group && l.personas.includes(p));
}
