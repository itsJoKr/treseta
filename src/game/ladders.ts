// The 6-match ladders of both modes (§19.1.3). Knobs come from the match tier.
import type { CharacterId } from './characters';
import type { MatchMods } from './forge';
import type { ForaId, PersonaId } from './types';

export const MATCHES_PER_RUN = 6;

export interface DvobojMatchDef extends MatchMods {
  konoba: string; opp: CharacterId; tier: 1 | 2 | 3 | 4; fore: ForaId[]; rakija: number; base: number;
}

export interface PairDef extends MatchMods {
  konoba: string; W: CharacterId; E: CharacterId; partnerPersona: PersonaId; tier: 1 | 2 | 3 | 4;
  fore: { W: ForaId[]; E: ForaId[] }; rakija: { W: number; E: number }; base: number;
  /** kept for older callers */
  baseReward: number;
}

export const DVOBOJ_LADDER: DvobojMatchDef[] = [
  { konoba: 'Konoba "Škoj"', opp: 'tonci', tier: 1, fore: [], rakija: 0, marks: [], forgeries: [], base: 8 },
  { konoba: 'Konoba "Kod Jure"', opp: 'jure', tier: 2, fore: [], rakija: 0, marks: [], forgeries: [], base: 9 },
  { konoba: 'Konoba "Pod Lozom"', opp: 'ive', tier: 2, fore: ['pogled', 'krivi_racun'], rakija: 1, marks: [{ ukras: 'pozlaceno', rank: 'A' }], forgeries: [], base: 10 },
  { konoba: 'Konoba "Ribarska"', opp: 'dino', tier: 3, fore: ['tucem', 'duplo_ili_nista'], rakija: 2, marks: [{ ukras: 'nabruseno', rank: 'K' }, { ukras: 'usoljeno', rank: 'A' }], forgeries: [], base: 11 },
  { konoba: 'Konoba "Kamenolom"', opp: 'luka', tier: 3, fore: ['tucem', 'krivi_racun', 'trica_iz_rukava'], rakija: 2, marks: [{ ukras: 'ljuto', rank: '3' }, { ukras: 'pozlaceno', rank: 'A' }], forgeries: ['2'], base: 12 },
  { konoba: 'Konoba "Na Brdu"', opp: 'bepo', tier: 4, fore: ['tucem', 'trica_iz_rukava', 'duplo_ili_nista', 'briskula'], rakija: 3,
    marks: [{ ukras: 'pozlaceno', rank: '3' }, { ukras: 'ljuto', rank: '3' }, { ukras: 'nabruseno', rank: '2' }, { ukras: 'glasno', rank: 'A' }], forgeries: ['3'], base: 15 },
];

const pair = (p: Omit<PairDef, 'baseReward'>): PairDef => ({ ...p, baseReward: p.base });

export const PARTNERI_LADDER: PairDef[] = [
  pair({ konoba: 'Konoba "Škoj"', W: 'tonci', E: 'stipe', partnerPersona: 'barba', tier: 1, fore: { W: [], E: [] }, rakija: { W: 0, E: 0 }, marks: [], forgeries: [], base: 8 }),
  pair({ konoba: 'Konoba "Kod Jure"', W: 'jure', E: 'ive', partnerPersona: 'mali', tier: 2, fore: { W: [], E: [] }, rakija: { W: 0, E: 0 }, marks: [], forgeries: [], base: 9 }),
  pair({ konoba: 'Konoba "Pod Lozom"', W: 'tonci', E: 'ive', partnerPersona: 'gazda', tier: 2, fore: { W: ['pogled'], E: ['krivi_racun'] }, rakija: { W: 1, E: 1 }, marks: [{ ukras: 'pozlaceno', rank: 'A' }], forgeries: [], base: 10 }),
  pair({ konoba: 'Konoba "Ribarska"', W: 'stipe', E: 'dino', partnerPersona: 'barba', tier: 3, fore: { W: ['tucem'], E: ['duplo_ili_nista'] }, rakija: { W: 1, E: 2 }, marks: [{ ukras: 'nabruseno', rank: 'K' }, { ukras: 'usoljeno', rank: 'A' }], forgeries: [], base: 11 }),
  pair({ konoba: 'Konoba "Kamenolom"', W: 'dino', E: 'luka', partnerPersona: 'gazda', tier: 3, fore: { W: ['duplo_ili_nista'], E: ['tucem', 'krivi_racun'] }, rakija: { W: 2, E: 2 }, marks: [{ ukras: 'ljuto', rank: '3' }, { ukras: 'pozlaceno', rank: 'A' }], forgeries: ['2'], base: 12 }),
  pair({ konoba: 'Konoba "Na Brdu"', W: 'bepo', E: 'frane', partnerPersona: 'mali', tier: 4, fore: { W: ['tucem', 'trica_iz_rukava', 'duplo_ili_nista', 'briskula'], E: ['krivi_racun', 'pogled', 'briskula'] }, rakija: { W: 3, E: 2 },
    marks: [{ ukras: 'pozlaceno', rank: '3' }, { ukras: 'ljuto', rank: '3' }, { ukras: 'nabruseno', rank: '2' }, { ukras: 'glasno', rank: 'A' }], forgeries: ['3'], base: 15 }),
];

/** Shop tier weights per visit (§19.2.2). */
export const TIER_WEIGHTS: Record<number, [number, number, number]> = {
  1: [100, 0, 0], 2: [60, 40, 0], 3: [30, 70, 0], 4: [15, 45, 40], 5: [10, 35, 55],
};
