// §9.4 voice events as data.
import type { VoiceLineId } from './voiceLines';

export type VoiceEventType =
  | 'match_start' | 'bot_play_strong' | 'bot_forced_bad' | 'player_great' | 'bot_lose_big' | 'bot_win_big'
  | 'bot_lose_trick' | 'bot_win_trick' | 'bot_bad_draw' | 'player_fora' | 'bot_fora' | 'akuza_bot'
  | 'akuza_player' | 'ultima_bot' | 'ultima_player' | 'big_swing' | 'hand_end_bot_win' | 'hand_end_bot_lose'
  | 'idle' | 'player_illegal' | 'match_bot_win' | 'match_bot_lose'
  // §22 mid-trick reactions: spoken right after a card lands, not only at the end of a trick
  | 'ace_snatched' | 'knew_trica' | 'knew_ace' | 'gloat' | 'react_short';

export interface VoiceEventCfg<T extends string = VoiceEventType> {
  type: T;
  p: number;
  /** Cooldown in ms (0 = none). */
  cooldown: number;
  priority: 1 | 2 | 3;
  lines: VoiceLineId[];
  /** minimum silence since the last line, in ms (default: the global gap). Mid-trick reactions use less. */
  gapMs?: number;
}

/** Silence a mid-trick reaction needs after the previous line (§22.3). */
export const REACT_GAP_MS = 1200;

export const VOICE_EVENTS: Record<VoiceEventType, VoiceEventCfg> = {
  match_start: { type: 'match_start', p: 1.0, cooldown: 0, priority: 2, lines: ['sidi_misaj'] },
  bot_play_strong: { type: 'bot_play_strong', p: 0.35, cooldown: 10000, priority: 1, lines: ['aha_sta_je_sad', 'evo_ti_ga_na'] },
  bot_forced_bad: { type: 'bot_forced_bad', p: 0.85, cooldown: 6000, priority: 2, gapMs: REACT_GAP_MS, lines: ['ajme_majko', 'jebate_led', 'same_lisine', 'ko_je_misaja', 'jebenti_iruda', 'joj', 'argh', 'kurac_lisine'] },
  player_great: { type: 'player_great', p: 0.6, cooldown: 8000, priority: 2, lines: ['ej_ko_te_napravi', 'vrag_ti_sricu', 'ukra_si_mi', 'muci', 'asti_sto', 'dava_odnija', 'idi_u_kurac', 'jebi_se_karte'] },
  bot_lose_big: { type: 'bot_lose_big', p: 0.8, cooldown: 5000, priority: 2, lines: ['jebem_ti_mliko', 'jebem_ti_pasa', 'grom_te_spanija', 'ukra_si_mi', 'ne_mogu_virovat', 'pizda_ti_materina', 'kruv_i_mast', 'dava_odnija', 'jebemti_dan', 'kartu_izmisli', 'idi_u_kurac'] },
  bot_win_big: { type: 'bot_win_big', p: 0.7, cooldown: 5000, priority: 2, lines: ['gledaj_i_uci', 'lipo_daj_ovamo', 'sta_si_mislija', 'ka_bombone', 'u_mojoj_konobi', 'stari_ja', 'ehe', 'smrdis_bakalar'] },
  bot_lose_trick: { type: 'bot_lose_trick', p: 0.15, cooldown: 10000, priority: 1, lines: ['jarca_ti', 'srice_nima', 'ma_daj', 'pff', 'joj'] },
  bot_win_trick: { type: 'bot_win_trick', p: 0.2, cooldown: 8000, priority: 1, lines: ['lipo_daj_ovamo', 'sta_si_mislija', 'ka_bombone', 'ehe'] },
  bot_bad_draw: { type: 'bot_bad_draw', p: 0.25, cooldown: 15000, priority: 1, lines: ['ko_je_misaja', 'same_lisine', 'jebemti_dan', 'joj', 'kurac_lisine'] },
  player_fora: { type: 'player_fora', p: 0.5, cooldown: 12000, priority: 1, lines: ['ej_ko_te_napravi', 'jebate_led', 'asti_sto', 'muci'] },
  // p for bot_fora depends on the fora: 1.0 for tucem, 0.6 for others (see voiceDirector)
  bot_fora: { type: 'bot_fora', p: 0.6, cooldown: 10000, priority: 2, lines: ['aha_sta_je_sad'] },
  akuza_bot: { type: 'akuza_bot', p: 1.0, cooldown: 0, priority: 3, lines: ['akuzan_tri'] },
  akuza_player: { type: 'akuza_player', p: 0.75, cooldown: 0, priority: 2, lines: ['opet_akuza', 'ajme_majko', 'jarca_ti', 'asti_sto', 'jebemti_dan'] },
  ultima_bot: { type: 'ultima_bot', p: 0.6, cooldown: 0, priority: 2, lines: ['ultima_moja'] },
  ultima_player: { type: 'ultima_player', p: 0.5, cooldown: 0, priority: 2, lines: ['jebem_ti_pasa', 'jarca_ti', 'dava_odnija', 'pizda_ti_materina'] },
  big_swing: { type: 'big_swing', p: 0.9, cooldown: 0, priority: 2, lines: ['jebem_ti_mliko', 'grom_te_spanija', 'vrag_ti_sricu', 'kruv_i_mast', 'pusi_mrtav', 'jebi_se_karte'] },
  hand_end_bot_win: { type: 'hand_end_bot_win', p: 0.4, cooldown: 0, priority: 1, lines: ['gledaj_i_uci', 'lipo_daj_ovamo'] },
  hand_end_bot_lose: { type: 'hand_end_bot_lose', p: 0.4, cooldown: 0, priority: 1, lines: ['srice_nima', 'jarca_ti', 'jebemti_dan', 'pff', 'kurac_lisine'] },
  idle: { type: 'idle', p: 1.0, cooldown: 25000, priority: 1, lines: ['igraj_vise', 'ajde_tovare', 'oces_danas', 'ka_riba'] },
  player_illegal: { type: 'player_illegal', p: 0.3, cooldown: 20000, priority: 1, lines: ['ajde_tovare', 'ma_daj'] },
  match_bot_win: { type: 'match_bot_win', p: 1.0, cooldown: 0, priority: 3, lines: ['plati_rakiju'] },
  match_bot_lose: { type: 'match_bot_lose', p: 1.0, cooldown: 0, priority: 3, lines: ['ajme_majko', 'jebem_ti_mliko', 'runda_na_mene', 'kruv_i_mast', 'pusi_mrtav'] },
  // §22.3 mid-trick reactions (see playReactions / playReactions4)
  // the speaker had to give up an ace (no other legal card) to the other side's 3 or 2
  ace_snatched: { type: 'ace_snatched', p: 0.9, cooldown: 8000, priority: 2, gapMs: REACT_GAP_MS, lines: ['pizda_ti_materina', 'jebenti_iruda', 'dava_odnija', 'kruv_i_mast', 'jebemti_dan', 'argh', 'ukra_si_mi', 'kartu_izmisli'] },
  // the speaker's A or 2 was just beaten by the other side's 3
  knew_trica: { type: 'knew_trica', p: 0.85, cooldown: 45000, priority: 2, gapMs: REACT_GAP_MS, lines: ['zna_sam_tricu', 'odjebi_tricon'] },
  // the speaker's King, Knight or Knave was just beaten by the other side's ace
  knew_ace: { type: 'knew_ace', p: 0.85, cooldown: 45000, priority: 2, gapMs: REACT_GAP_MS, lines: ['zna_sam_asa'] },
  // the player had to give up an ace to the speaker's 3 or 2
  gloat: { type: 'gloat', p: 0.6, cooldown: 10000, priority: 1, gapMs: 1500, lines: ['ehe', 'lipo_daj_ovamo', 'ka_bombone', 'sta_si_mislija', 'smrdis_bakalar'] },
  // a 3 from the other side takes the trick over: a short grunt
  react_short: { type: 'react_short', p: 0.35, cooldown: 7000, priority: 1, gapMs: REACT_GAP_MS, lines: ['oho', 'ma_daj', 'argh', 'pff', 'asti_sto', 'odjebi_tricon'] },
};

export const TRICK_END_ORDER: VoiceEventType[] = ['player_great', 'bot_lose_big', 'bot_win_big', 'bot_lose_trick', 'bot_win_trick'];
