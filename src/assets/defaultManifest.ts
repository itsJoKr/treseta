// Built-in manifest generated from the id tables (§15, §16.7).
import type { CharacterId } from '../game/characters';
import { RANKS, rankFile, SUITS } from '../game/cards';
import { FORA_IDS } from '../game/fore';
import type { OpponentId, PersonaId, Suit } from '../game/types';
import { UKRAS_IDS } from '../game/ukrasi';
import { linesForPersona } from '../data/voiceLines';

export type SfxId =
  | 'card_slide' | 'card_flip' | 'card_place' | 'card_slam_strong' | 'shuffle' | 'deal' | 'trick_whoosh'
  | 'card_pile' | 'coins' | 'coin_single' | 'glass_clink' | 'glass_slam' | 'rakija_pour' | 'akuza_fanfare'
  | 'win_stinger' | 'lose_stinger' | 'ui_click' | 'ui_hover' | 'ui_error' | 'stamp' | 'fora_use'
  | 'table_knock' | 'chalk_tick' | 'shop_bell' | 'map_step';

export const SFX_VOLUMES: Record<SfxId, number> = {
  card_slide: 0.7, card_flip: 0.7, card_place: 0.8, card_slam_strong: 0.9, shuffle: 0.7, deal: 0.5,
  trick_whoosh: 0.6, card_pile: 0.6, coins: 0.8, coin_single: 0.7, glass_clink: 0.7, glass_slam: 0.8,
  rakija_pour: 0.7, akuza_fanfare: 0.8, win_stinger: 0.8, lose_stinger: 0.8, ui_click: 0.5, ui_hover: 0.25,
  ui_error: 0.6, stamp: 0.8, fora_use: 0.8, table_knock: 0.9, chalk_tick: 0.5, shop_bell: 0.7, map_step: 0.6,
};
export const SFX_IDS = Object.keys(SFX_VOLUMES) as SfxId[];

export interface AssetManifest {
  version: 1;
  basePath: string;
  images: {
    cards: Record<string, string>;
    backs: { player: string; bot: string };
    suits: Record<Suit, string>;
    ukrasi: Record<string, string>;
    fore: Record<string, string>;
    portraits: Record<CharacterId, string>;
    env: { table: string; konoba: string; map: string; shop: string };
    ui: { coin: string; rakija_full: string; rakija_empty: string; logo: string; falsa: string };
  };
  audio: {
    sfx: Record<string, { src: string; volume: number }>;
    ambient: Record<'konoba' | 'cicadas', { src: string; volume: number; loop: true }>;
    voice: Record<PersonaId, Record<string, string>>;
  };
}

export function buildDefaultManifest(): AssetManifest {
  const cards: Record<string, string> = {};
  for (const s of SUITS) for (const r of RANKS) cards[`${s}_${rankFile(r)}`] = `cards/${s}_${rankFile(r)}.webp`;
  const ukrasi: Record<string, string> = {};
  for (const u of UKRAS_IDS) ukrasi[u] = `ukrasi/${u}.webp`;
  const fore: Record<string, string> = {};
  for (const f of FORA_IDS) fore[f] = `fore/${f}.webp`;
  const sfx: Record<string, { src: string; volume: number }> = {};
  for (const id of SFX_IDS) sfx[id] = { src: `audio/sfx/${id}.mp3`, volume: SFX_VOLUMES[id] };
  const voice = {} as Record<PersonaId, Record<string, string>>;
  for (const p of ['barba', 'gazda', 'mali'] as PersonaId[]) {
    voice[p] = {};
    for (const l of linesForPersona(p)) voice[p][l.id] = `audio/voice/${p}/${l.id}.mp3`;
  }
  return {
    version: 1,
    basePath: 'assets/',
    images: {
      cards,
      backs: { player: 'cards/back_player.webp', bot: 'cards/back_bot.webp' },
      suits: { kupe: 'cards/suits/kupe.webp', bate: 'cards/suits/bate.webp', spade: 'cards/suits/spade.webp', dinari: 'cards/suits/dinari.webp' },
      ukrasi,
      fore,
      portraits: {
        tonci: 'portraits/tonci.webp', jure: 'portraits/jure.webp', luka: 'portraits/luka.webp', bepo: 'portraits/bepo.webp',
        dino: 'portraits/dino.webp', stipe: 'portraits/stipe.webp', ive: 'portraits/ive.webp', frane: 'portraits/frane.webp',
      },
      env: { table: 'env/table_wood.webp', konoba: 'env/bg_konoba.webp', map: 'env/bg_map.webp', shop: 'env/bg_shop.webp' },
      ui: { coin: 'ui/coin.webp', rakija_full: 'ui/rakija_full.webp', rakija_empty: 'ui/rakija_empty.webp', logo: 'ui/logo.webp', falsa: 'ui/falsa.webp' },
    },
    audio: {
      sfx,
      ambient: {
        konoba: { src: 'audio/sfx/ambient_konoba.mp3', volume: 0.35, loop: true },
        cicadas: { src: 'audio/sfx/ambient_cicadas.mp3', volume: 0.25, loop: true },
      },
      voice,
    },
  };
}
