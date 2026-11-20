// Partneri voice events (§18.7.3). New event ids, existing lines only (the 34 ids of §9.3).
import { REACT_GAP_MS, VOICE_EVENTS } from './voiceEvents';
import type { VoiceEventCfg, VoiceEventType } from './voiceEvents';
import type { VoiceLineId } from './voiceLines';

export type PartnerEventType =
  | 'partner_misplay' | 'partner_team_big' | 'partner_player_great' | 'partner_lose_big' | 'partner_akuza'
  | 'partner_signal' | 'opp_signal' | 'partner_ultima' | 'partner_hand_win' | 'partner_match_win'
  | 'partner_match_lose' | 'partner_argument' | 'partner_react';

export type Voice4EventType = VoiceEventType | PartnerEventType;

type Cfg = VoiceEventCfg<Voice4EventType>;
const ev = (type: PartnerEventType, p: number, cooldown: number, priority: 1 | 2 | 3, lines: VoiceLineId[]): Cfg => ({ type, p, cooldown, priority, lines });

export const PARTNER_EVENTS: Record<PartnerEventType, Cfg> = {
  // p is 0.75 for (a) point dump / (c) ignored Tučem, 0.6 for (b) overtake (passed as ctx.p)
  partner_misplay: ev('partner_misplay', 0.75, 10000, 2, ['ajde_tovare', 'ej_ko_te_napravi', 'sta_si_mislija', 'ne_mogu_virovat', 'jarca_ti', 'pusi_mrtav', 'ma_daj']),
  partner_team_big: ev('partner_team_big', 0.45, 8000, 1, ['lipo_daj_ovamo', 'evo_ti_ga_na', 'aha_sta_je_sad', 'gledaj_i_uci']),
  partner_player_great: ev('partner_player_great', 0.55, 8000, 2, ['aha_sta_je_sad', 'evo_ti_ga_na', 'lipo_daj_ovamo']),
  partner_lose_big: ev('partner_lose_big', 0.4, 10000, 1, ['jebem_ti_pasa', 'grom_te_spanija', 'jarca_ti', 'srice_nima', 'jebemti_dan', 'joj']),
  // lines chosen like akuza_bot (napolitana / akuzan_cetiri / akuzan_tri) and passed as ctx.lines
  partner_akuza: ev('partner_akuza', 1.0, 0, 3, ['napolitana', 'akuzan_cetiri', 'akuzan_tri']),
  partner_signal: ev('partner_signal', 1.0, 0, 2, ['tucem']),
  opp_signal: ev('opp_signal', 1.0, 0, 2, ['tucem']),
  partner_ultima: ev('partner_ultima', 0.5, 0, 2, ['ultima_moja']),
  partner_hand_win: ev('partner_hand_win', 0.6, 0, 2, ['gledaj_i_uci', 'lipo_daj_ovamo', 'u_mojoj_konobi', 'stari_ja', 'ka_bombone']),
  partner_match_win: ev('partner_match_win', 1.0, 0, 3, ['plati_rakiju']),
  partner_match_lose: ev('partner_match_lose', 1.0, 0, 3, ['ajme_majko', 'srice_nima', 'runda_na_mene', 'jebemti_dan']),
  // §18.7.4: p and delay live in ARGUMENT4; the reply ignores the gap but counts toward the caps
  partner_argument: ev('partner_argument', 1.0, 0, 2, ['sta_si_mislija', 'gledaj_i_uci', 'lipo_daj_ovamo', 'ajde_tovare', 'muci']),
  // §22.3: the partner cheers a strong mid-trick play by the player
  partner_react: { ...ev('partner_react', 0.45, 8000, 1, ['oho', 'ehe', 'asti_sto']), gapMs: REACT_GAP_MS },
};

export const VOICE_EVENTS4: Record<Voice4EventType, Cfg> = { ...(VOICE_EVENTS as Record<VoiceEventType, Cfg>), ...PARTNER_EVENTS };

export const ARGUMENT4 = { p: 0.25, delayMs: 900 } as const;
export const MATCH_END_GAP4_MS = 600;
export const IDLE_PARTNER_P = 0.6;
export const MISPLAY_P = { dump: 0.75, overtake: 0.6, tucem: 0.75 } as const;
