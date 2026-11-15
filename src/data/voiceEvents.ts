// §9.4 voice events as data.
import type { VoiceLineId } from './voiceLines';

export type VoiceEventType =
  | 'match_start' | 'bot_play_strong' | 'bot_forced_bad' | 'player_great' | 'bot_lose_big' | 'bot_win_big'
  | 'bot_lose_trick' | 'bot_win_trick' | 'bot_bad_draw' | 'player_fora' | 'bot_fora' | 'akuza_bot'
  | 'akuza_player' | 'ultima_bot' | 'ultima_player' | 'big_swing' | 'hand_end_bot_win' | 'hand_end_bot_lose'
  | 'idle' | 'player_illegal' | 'match_bot_win' | 'match_bot_lose';

export interface VoiceEventCfg<T extends string = VoiceEventType> {
  type: T;
  p: number;
  /** Cooldown in ms (0 = none). */
  cooldown: number;
  priority: 1 | 2 | 3;
  lines: VoiceLineId[];
}

export const VOICE_EVENTS: Record<VoiceEventType, VoiceEventCfg> = {
  match_start: { type: 'match_start', p: 1.0, cooldown: 0, priority: 2, lines: ['sidi_misaj'] },
  bot_play_strong: { type: 'bot_play_strong', p: 0.35, cooldown: 10000, priority: 1, lines: ['aha_sta_je_sad', 'evo_ti_ga_na'] },
  bot_forced_bad: { type: 'bot_forced_bad', p: 0.85, cooldown: 6000, priority: 2, lines: ['ajme_majko', 'jebate_led', 'same_lisine', 'ko_je_misaja'] },
  player_great: { type: 'player_great', p: 0.6, cooldown: 8000, priority: 2, lines: ['ej_ko_te_napravi', 'vrag_ti_sricu', 'ukra_si_mi'] },
  bot_lose_big: { type: 'bot_lose_big', p: 0.8, cooldown: 5000, priority: 2, lines: ['jebem_ti_mliko', 'jebem_ti_pasa', 'grom_te_spanija', 'ukra_si_mi', 'ne_mogu_virovat'] },
  bot_win_big: { type: 'bot_win_big', p: 0.7, cooldown: 5000, priority: 2, lines: ['gledaj_i_uci', 'lipo_daj_ovamo', 'sta_si_mislija', 'ka_bombone', 'u_mojoj_konobi', 'stari_ja'] },
  bot_lose_trick: { type: 'bot_lose_trick', p: 0.12, cooldown: 10000, priority: 1, lines: ['jarca_ti', 'srice_nima'] },
  bot_win_trick: { type: 'bot_win_trick', p: 0.2, cooldown: 8000, priority: 1, lines: ['lipo_daj_ovamo', 'sta_si_mislija', 'ka_bombone'] },
  bot_bad_draw: { type: 'bot_bad_draw', p: 0.25, cooldown: 15000, priority: 1, lines: ['ko_je_misaja', 'same_lisine'] },
  player_fora: { type: 'player_fora', p: 0.5, cooldown: 12000, priority: 1, lines: ['ej_ko_te_napravi', 'jebate_led'] },
  // p for bot_fora depends on the fora: 1.0 for tucem, 0.6 for others (see voiceDirector)
  bot_fora: { type: 'bot_fora', p: 0.6, cooldown: 10000, priority: 2, lines: ['aha_sta_je_sad'] },
  akuza_bot: { type: 'akuza_bot', p: 1.0, cooldown: 0, priority: 3, lines: ['akuzan_tri'] },
  akuza_player: { type: 'akuza_player', p: 0.75, cooldown: 0, priority: 2, lines: ['opet_akuza', 'ajme_majko', 'jarca_ti'] },
  ultima_bot: { type: 'ultima_bot', p: 0.6, cooldown: 0, priority: 2, lines: ['ultima_moja'] },
  ultima_player: { type: 'ultima_player', p: 0.5, cooldown: 0, priority: 2, lines: ['jebem_ti_pasa', 'jarca_ti'] },
  big_swing: { type: 'big_swing', p: 0.9, cooldown: 0, priority: 2, lines: ['jebem_ti_mliko', 'grom_te_spanija', 'vrag_ti_sricu'] },
  hand_end_bot_win: { type: 'hand_end_bot_win', p: 0.4, cooldown: 0, priority: 1, lines: ['gledaj_i_uci', 'lipo_daj_ovamo'] },
  hand_end_bot_lose: { type: 'hand_end_bot_lose', p: 0.4, cooldown: 0, priority: 1, lines: ['srice_nima', 'jarca_ti'] },
  idle: { type: 'idle', p: 1.0, cooldown: 25000, priority: 1, lines: ['igraj_vise', 'ajde_tovare', 'oces_danas', 'ka_riba'] },
  player_illegal: { type: 'player_illegal', p: 0.3, cooldown: 20000, priority: 1, lines: ['ajde_tovare'] },
  match_bot_win: { type: 'match_bot_win', p: 1.0, cooldown: 0, priority: 3, lines: ['plati_rakiju'] },
  match_bot_lose: { type: 'match_bot_lose', p: 1.0, cooldown: 0, priority: 3, lines: ['ajme_majko', 'jebem_ti_mliko', 'runda_na_mene'] },
};

export const TRICK_END_ORDER: VoiceEventType[] = ['player_great', 'bot_lose_big', 'bot_win_big', 'bot_lose_trick', 'bot_win_trick'];
