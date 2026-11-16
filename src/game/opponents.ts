// Opponent definitions (§8.1, §4.2).
import { standardDeck } from './cards';
import type { DeckCard, ForaId, OpponentId, PersonaId, Rank, Suit, UkrasId } from './types';

export interface BotKnobs {
  memory: number;
  mistakeRate: number;
  saveMasters: boolean;
  huntAce: boolean;
  pimcMaxCards: number;
  pimcSamples: number;
  thinkMs: [number, number];
}

export interface OpponentDef {
  id: OpponentId;
  name: string;
  konoba: string;
  bioEn: string;
  bioHr: string;
  persona: PersonaId;
  playbackRate: number;
  difficulty: number;
  baseReward: number;
  deck: () => DeckCard[];
  rakija: number;
  fore: ForaId[];
  knobs: BotKnobs;
  cussMult: number;
}

function withUkrasi(deck: DeckCard[], list: [Suit, Rank, UkrasId][]): DeckCard[] {
  return deck.map((c) => {
    const m = list.find(([s, r]) => s === c.suit && r === c.rank);
    return m ? { ...c, ukras: m[2] } : c;
  });
}

export const OPPONENTS: Record<OpponentId, OpponentDef> = {
  tonci: {
    id: 'tonci', name: 'Mali Tonči', konoba: 'Konoba "Škoj"',
    bioEn: 'Spends summers "working" at the beach bar. Plays fast, talks faster.',
    bioHr: 'Priko lita "radi" na beach baru. Igra brzo, a priča još brže.',
    persona: 'mali', playbackRate: 1.0, difficulty: 1, baseReward: 10,
    deck: () => standardDeck(), rakija: 0, fore: [],
    knobs: { memory: 0.5, mistakeRate: 0.2, saveMasters: false, huntAce: false, pimcMaxCards: 0, pimcSamples: 0, thinkMs: [600, 1100] },
    cussMult: 1.1,
  },
  jure: {
    id: 'jure', name: 'Gazda Jure', konoba: 'Konoba "Kod Jure"',
    bioEn: 'Owns the konoba, owns the table, thinks he owns the cards.',
    bioHr: 'Vlasnik konobe, stola i, misli on, karata.',
    persona: 'gazda', playbackRate: 1.0, difficulty: 2, baseReward: 12,
    deck: () => withUkrasi(standardDeck(), [['dinari', 'A', 'pozlaceno'], ['kupe', 'A', 'pozlaceno']]),
    rakija: 1, fore: ['pogled'],
    knobs: { memory: 0.75, mistakeRate: 0.1, saveMasters: false, huntAce: true, pimcMaxCards: 0, pimcSamples: 0, thinkMs: [800, 1400] },
    cussMult: 1.3,
  },
  luka: {
    id: 'luka', name: 'Barba Luka', konoba: 'Konoba "Ribarska"',
    bioEn: "Fished these waters for fifty years. Remembers every card you've played.",
    bioHr: 'Pedeset godina lovi ribu. Pamti svaku kartu koju si bacija.',
    persona: 'barba', playbackRate: 1.0, difficulty: 3, baseReward: 14,
    deck: () => withUkrasi(standardDeck(), [['bate', 'A', 'usoljeno'], ['spade', 'A', 'usoljeno'], ['kupe', 'K', 'nabruseno']]),
    rakija: 2, fore: ['tucem', 'krivi_racun'],
    knobs: { memory: 0.95, mistakeRate: 0.04, saveMasters: true, huntAce: true, pimcMaxCards: 4, pimcSamples: 12, thinkMs: [1000, 1800] },
    cussMult: 0.8,
  },
  bepo: {
    id: 'bepo', name: 'Did Bepo', konoba: 'Konoba "Na Brdu"',
    bioEn: 'The island champion. Nobody remembers the last time he lost.',
    bioHr: 'Šampion škoja. Niko se ne sića kad je zadnji put izgubija.',
    persona: 'barba', playbackRate: 0.93, difficulty: 4, baseReward: 20,
    deck: () => withUkrasi(standardDeck().filter((c) => c.rank !== '4'), [
      ['kupe', '3', 'pozlaceno'], ['dinari', '3', 'pozlaceno'], ['bate', '2', 'nabruseno'], ['spade', '3', 'ljuto'], ['spade', 'A', 'glasno'],
    ]),
    rakija: 3, fore: ['tucem', 'trica_iz_rukava', 'duplo_ili_nista'],
    knobs: { memory: 1.0, mistakeRate: 0, saveMasters: true, huntAce: true, pimcMaxCards: 5, pimcSamples: 24, thinkMs: [1100, 2000] },
    cussMult: 0.9,
  },
};

export const LADDER: OpponentId[] = ['tonci', 'jure', 'luka', 'bepo'];

