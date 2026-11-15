// The 8 characters, partner perks and bot knobs by tier (§18.4.1, §18.6).
import { OPPONENTS } from './opponents';
import type { OpponentId, PersonaId } from './types';

export type CharacterId = OpponentId | 'dino' | 'stipe' | 'ive' | 'frane';
export type PerkId = 'brzi_jezik' | 'sarmer' | 'na_crtu' | 'zidar' | 'postar' | 'pamcenje';

export interface PerkDef { id: PerkId; nameHr: string; nameEn: string; descHr: string; descEn: string }

export const PERKS: Record<PerkId, PerkDef> = {
  brzi_jezik: { id: 'brzi_jezik', nameHr: 'Brzi jezik', nameEn: 'Quick tongue', descHr: 'Svaka akuža vašeg para vrijedi +1.', descEn: 'Every declaration by your team scores +1.' },
  sarmer: { id: 'sarmer', nameHr: 'Šarmer', nameEn: 'Charmer', descHr: '+1 rakija svake ruke (najviše 5).', descEn: '+1 rakija every hand (max 5).' },
  na_crtu: { id: 'na_crtu', nameHr: 'Na crtu', nameEn: 'On the tab', descHr: 'Nakon pobjede s njim sve u butigi je 1 šoldo jeftinije.', descEn: 'After a win with him, everything in the shop costs 1 less.' },
  zidar: { id: 'zidar', nameHr: 'Zidar', nameEn: 'Stonemason', descHr: 'Ultima vašeg para vrijedi +1.', descEn: 'Your team’s ultima is worth +1.' },
  postar: { id: 'postar', nameHr: 'Poštar zna sve', nameEn: 'The postman knows', descHr: 'Na početku svake ruke vidiš po jednu kartu svakog protivnika.', descEn: 'Each hand you see 1 card of each opponent.' },
  pamcenje: { id: 'pamcenje', nameHr: 'Pamćenje', nameEn: 'Memory', descHr: 'Vidiš koje boje protivnicima fale.', descEn: 'You see which suits the opponents are out of.' },
};

export interface CharacterDef {
  id: CharacterId;
  name: string;
  persona: PersonaId;
  rate: number;
  tier: 1 | 2 | 3 | 4;
  aggression: number;
  perk: PerkId | null;
  bioEn: string;
  bioHr: string;
}

export const CHARACTERS: Record<CharacterId, CharacterDef> = {
  tonci: { id: 'tonci', name: 'Mali Tonči', persona: 'mali', rate: 1.0, tier: 1, aggression: 0.6, perk: 'brzi_jezik', bioEn: OPPONENTS.tonci.bioEn, bioHr: OPPONENTS.tonci.bioHr },
  dino: { id: 'dino', name: 'Dino "Galeb"', persona: 'mali', rate: 1.06, tier: 3, aggression: 0.8, perk: 'sarmer',
    bioEn: 'Every summer a new girlfriend, every winter a new card trick.', bioHr: 'Svako lito nova cura, svaku zimu nova fora.' },
  jure: { id: 'jure', name: 'Gazda Jure', persona: 'gazda', rate: 1.0, tier: 2, aggression: 0.7, perk: 'na_crtu', bioEn: OPPONENTS.jure.bioEn, bioHr: OPPONENTS.jure.bioHr },
  stipe: { id: 'stipe', name: 'Stipe Kamenar', persona: 'gazda', rate: 0.94, tier: 2, aggression: 0.3, perk: 'zidar',
    bioEn: 'Builds walls on Brač that will outlive us all. Plays the same way.', bioHr: 'Zida mure na Braču koji će nas sve nadživit. Tako i igra.' },
  ive: { id: 'ive', name: 'Ive Poštar', persona: 'barba', rate: 1.08, tier: 2, aggression: 0.4, perk: 'postar',
    bioEn: 'Delivers the mail and every rumour on the island.', bioHr: 'Nosi poštu i sve ča se na otoku priča.' },
  luka: { id: 'luka', name: 'Barba Luka', persona: 'barba', rate: 1.0, tier: 3, aggression: 0.2, perk: 'pamcenje', bioEn: OPPONENTS.luka.bioEn, bioHr: OPPONENTS.luka.bioHr },
  frane: { id: 'frane', name: 'Kapetan Frane', persona: 'gazda', rate: 1.04, tier: 3, aggression: 0.5, perk: null,
    bioEn: 'Forty years on cargo ships. Still gives orders at the table.', bioHr: 'Četrdeset godina na brodu. I za stolom još zapovida.' },
  bepo: { id: 'bepo', name: 'Did Bepo', persona: 'barba', rate: 0.93, tier: 4, aggression: 0.5, perk: null, bioEn: OPPONENTS.bepo.bioEn, bioHr: OPPONENTS.bepo.bioHr },
};

export const CHARACTER_IDS = Object.keys(CHARACTERS) as CharacterId[];

export interface Knobs4 {
  memory: number;
  mistakeRate: number;
  signalUse: number;
  readSignals: number;
  carico: number;
  huntAce: boolean;
  pimcMaxCards: number;
  pimcSamples: number;
  thinkMs: [number, number];
  aggression: number;
}

const TIER_KNOBS: Record<1 | 2 | 3 | 4, Omit<Knobs4, 'aggression'>> = {
  1: { memory: 0.5, mistakeRate: 0.18, signalUse: 0.5, readSignals: 0.6, carico: 0.5, huntAce: false, pimcMaxCards: 0, pimcSamples: 0, thinkMs: [500, 900] },
  2: { memory: 0.75, mistakeRate: 0.1, signalUse: 0.75, readSignals: 0.85, carico: 0.8, huntAce: true, pimcMaxCards: 0, pimcSamples: 0, thinkMs: [600, 1100] },
  3: { memory: 0.92, mistakeRate: 0.04, signalUse: 0.9, readSignals: 1, carico: 0.95, huntAce: true, pimcMaxCards: 3, pimcSamples: 8, thinkMs: [700, 1300] },
  4: { memory: 1, mistakeRate: 0, signalUse: 1, readSignals: 1, carico: 1, huntAce: true, pimcMaxCards: 4, pimcSamples: 12, thinkMs: [800, 1500] },
};

/** §19.1.3: opponents use the knob row of the match tier; the partner its own tier. */
export function knobsForTier(tier: 1 | 2 | 3 | 4, aggression: number): Knobs4 {
  return { ...TIER_KNOBS[tier], aggression };
}

export function knobsFor(id: CharacterId): Knobs4 {
  const c = CHARACTERS[id];
  return { ...TIER_KNOBS[c.tier], aggression: c.aggression };
}

/** cussMult by tier (§18.7). */
export function cussMultFor(id: CharacterId): number {
  const t = CHARACTERS[id].tier;
  return t === 1 ? 1.1 : t === 2 ? 1.2 : 0.9;
}

export function playStyle(aggression: number): 'careful' | 'balanced' | 'aggressive' {
  return aggression < 0.4 ? 'careful' : aggression < 0.7 ? 'balanced' : 'aggressive';
}
