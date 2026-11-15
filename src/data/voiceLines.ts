// §9.3 voice lines as data.
import type { PersonaId } from '../game/types';

export type Mood = 'angry' | 'laugh' | 'sad' | 'neutral';
export type VoiceLineId =
  | 'jebem_ti_mliko' | 'ej_ko_te_napravi' | 'jarca_ti' | 'jebate_led' | 'ajme_majko' | 'jebem_ti_pasa'
  | 'grom_te_spanija' | 'vrag_ti_sricu' | 'ajde_tovare' | 'aha_sta_je_sad' | 'lipo_daj_ovamo' | 'sta_si_mislija'
  | 'gledaj_i_uci' | 'evo_ti_ga_na' | 'srice_nima' | 'ne_mogu_virovat' | 'ko_je_misaja' | 'ukra_si_mi'
  | 'same_lisine' | 'igraj_vise' | 'napolitana' | 'akuzan_tri' | 'akuzan_cetiri' | 'opet_akuza'
  | 'ultima_moja' | 'sidi_misaj' | 'plati_rakiju' | 'tucem' | 'ka_bombone' | 'oces_danas'
  | 'u_mojoj_konobi' | 'runda_na_mene' | 'ka_riba' | 'stari_ja';

export interface VoiceLine {
  id: VoiceLineId;
  personas: PersonaId[];
  tts: string;
  subtitleHr: string;
  glossEn: string;
  mood: Mood;
  exclusive: boolean;
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
  ['ko_je_misaja', 'all', '[angry] Ko je ovo mišaja, a?!', 'Who shuffled this, huh?!'],
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
];

const ANGRY = [1, 6, 7, 17, 18];
const LAUGH = [11, 25, 27, 29, 34];
const SAD = [5, 15, 19, 32];

export function stripTags(tts: string): string {
  return tts.replace(/\[[^\]]*\]\s*/g, '').trim();
}

export const VOICE_LINES: VoiceLine[] = RAW.map(([id, personas, tts, gloss], i) => {
  const n = i + 1;
  const mood: Mood = ANGRY.includes(n) ? 'angry' : LAUGH.includes(n) ? 'laugh' : SAD.includes(n) ? 'sad' : 'neutral';
  return {
    id,
    personas: personas === 'all' ? ALL.slice() : personas,
    tts,
    subtitleHr: stripTags(tts),
    glossEn: gloss,
    mood,
    exclusive: personas !== 'all',
  };
});

export const VOICE_BY_ID: Record<VoiceLineId, VoiceLine> = Object.fromEntries(VOICE_LINES.map((l) => [l.id, l])) as Record<VoiceLineId, VoiceLine>;

export function linesForPersona(p: PersonaId): VoiceLine[] {
  return VOICE_LINES.filter((l) => l.personas.includes(p));
}
