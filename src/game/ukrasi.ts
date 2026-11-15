// Ukrasi (card enhancements) as data plus pure hook functions (§5).
import type { CardInst, Rarity, Side, TeamId, UkrasId } from './types';
import { sideOfTeam, teamOfSide } from './types';

export interface UkrasDef {
  id: UkrasId;
  nameHr: string;
  nameEn: string;
  color: string;
  rarity: Rarity;
  price: number;
  descEn: string;
  descHr: string;
}

// Display rarity = shop tier (§19.2.1): common = T1, uncommon = T2, rare = T3.
export const UKRASI: Record<UkrasId, UkrasDef> = {
  pozlaceno: { id: 'pozlaceno', nameHr: 'Pozlaćeno', nameEn: 'Gilded', color: '#E2B43B', rarity: 'common', price: 7,
    descEn: 'If this card ends in your pile (whoever played it): +1 punat.', descHr: 'Ako ova karta završi u tvom štihu (bilo tko da ju je bacio): +1 punat.' },
  srebreno: { id: 'srebreno', nameHr: 'Srebreno', nameEn: 'Silvered', color: '#C9CED6', rarity: 'common', price: 5,
    descEn: 'If this card ends in your pile: +3 šoldi.', descHr: 'Ako ova karta završi u tvom štihu: +3 šoldi.' },
  nabruseno: { id: 'nabruseno', nameHr: 'Nabrušeno', nameEn: 'Whetted', color: '#8FB3C9', rarity: 'uncommon', price: 7,
    descEn: 'Played by you: strength +½ rank (beats the next-higher rank).', descHr: 'Kad je ti baciš: jača za pola stupnja.' },
  ljuto: { id: 'ljuto', nameHr: 'Ljuto', nameEn: 'Hot pepper', color: '#D2452B', rarity: 'uncommon', price: 7,
    descEn: 'When you lead it, the opponent must follow with their highest card of that suit.', descHr: 'Kad je baciš prva, protivnik mora baciti najjaču kartu te boje.' },
  usoljeno: { id: 'usoljeno', nameHr: 'Usoljeno', nameEn: 'Salted', color: '#EDE6D6', rarity: 'common', price: 5,
    descEn: 'Played by you and the trick is lost: its thirds still count for you.', descHr: 'Ako je baciš i izgubiš štih, bodovi ove karte ostaju tebi.' },
  pijano: { id: 'pijano', nameHr: 'Pijano', nameEn: 'Tipsy', color: '#7FA34A', rarity: 'common', price: 5,
    descEn: 'When you play this card: +1 rakija (max 5). Once per hand.', descHr: 'Kad je baciš: +1 rakija.' },
  divlje: { id: 'divlje', nameHr: 'Divlje', nameEn: 'Wild', color: '#6B4E9B', rarity: 'rare', price: 9,
    descEn: 'In your hand, for akuže only: counts as the 3, 2 or A of its suit.', descHr: 'U tvojoj ruci, za akužu vrijedi kao trica, duja ili as svoje boje.' },
  glasno: { id: 'glasno', nameHr: 'Glasno', nameEn: 'Loud', color: '#E07B2E', rarity: 'uncommon', price: 7,
    descEn: 'Every akuža you declare with this card scores +2.', descHr: 'Svaka tvoja akuža s ovom kartom vrijedi +2.' },
  ponocno: { id: 'ponocno', nameHr: 'Ponoćno', nameEn: 'Midnight', color: '#2A3D6B', rarity: 'common', price: 5,
    descEn: 'Played by you, if it wins the last trick: the ultima is worth 3 punta.', descHr: 'Ako je baciš i odnese zadnji štih, ultima vrijedi 3.' },
  ribarsko: { id: 'ribarsko', nameHr: 'Ribarsko', nameEn: "Fisherman's", color: '#2F8C8C', rarity: 'uncommon', price: 7,
    descEn: 'Win a trick with it: look at the top 2 mac cards, draw one, the other goes to the bottom.', descHr: 'Kad odneseš štih s njom: biraš jednu od dvije gornje karte iz maca.' },
  prevrtljivo: { id: 'prevrtljivo', nameHr: 'Prevrtljivo', nameEn: 'Turncoat', color: '#C46FA0', rarity: 'rare', price: 10,
    descEn: 'Played second (or later), it counts as the suit led.', descHr: 'Kad ne otvaraš, vrijedi kao tražena boja.' },
};

export const UKRAS_IDS = Object.keys(UKRASI) as UkrasId[];

// ---- hooks (team rules, §18.3.1 read with sides, §19.3.3) ----
// An ukras helps only its beneficiary team (`ukrasTeam`; untagged = the current holder's team).
// `c.owner` is the card's current holder / the side that played it.

export function ukrasTeamOf(c: CardInst): TeamId { return c.ukrasTeam ?? teamOfSide(c.owner); }

/** Does the ukras on `c` work for `side` (holder / player of the card)? */
export function benefits(c: CardInst, side: Side): boolean { return !!c.ukras && ukrasTeamOf(c) === teamOfSide(side); }

/** Prevrtljivo: played as a non-leader by its beneficiary, it counts as the led suit. */
export function isTurncoat(c: CardInst, side: Side): boolean { return c.ukras === 'prevrtljivo' && benefits(c, side); }

/** Strength modifier in doubled units (Nabrušeno +3, only when played by its team). */
export function strengthMod(c: CardInst): number {
  return c.ukras === 'nabruseno' && benefits(c, c.owner) ? 3 : 0;
}

/** onLead: does leading this card set forcedHighest? */
export function onLead(c: CardInst): boolean {
  return c.ukras === 'ljuto' && benefits(c, c.owner);
}

/** onPlay: Pijano rakija gain (Mi only; returns the rakija delta). */
export function onPlay(c: CardInst, pijanoUsed: string[]): number {
  return c.ukras === 'pijano' && c.owner === 'player' && ukrasTeamOf(c) === 'mi' && !pijanoUsed.includes(c.uid) ? 1 : 0;
}

/** onTrickResolved: whole-point and coin bonuses; Pozlaćeno/Srebreno pay when the card ends in T's pile. */
export function onTrickResolved(c: CardInst, winner: Side): { side: Side; points?: number; soldi?: number } | null {
  if (!c.ukras) return null;
  const tSide = sideOfTeam(ukrasTeamOf(c));
  if (winner !== tSide) return null;
  if (c.ukras === 'pozlaceno') return { side: tSide, points: 1 };
  if (c.ukras === 'srebreno' && tSide === 'player') return { side: 'player', soldi: 3 };
  return null;
}

/** Usoljeno redirect: who receives this card's thirds. */
export function thirdsRecipient(c: CardInst, winner: Side): Side {
  if (c.ukras === 'usoljeno' && benefits(c, c.owner) && c.owner !== winner) return c.owner;
  return winner;
}

/** onUltima: the ultima value for the winning card. */
export function onUltima(winningCard: CardInst): number {
  return winningCard.ukras === 'ponocno' && benefits(winningCard, winningCard.owner) ? 3 : 1;
}

/** akuzaMod: Glasno bonus for a newly awarded combination. */
export function akuzaMod(cards: CardInst[]): number {
  return cards.some((c) => c.ukras === 'glasno' && benefits(c, c.owner)) ? 2 : 0;
}

/** onDrawChoice: Ribarsko gives a choice when its team wins with it and the mac has >= 2. */
export function onDrawChoice(winningCard: CardInst | undefined, macSize: number): boolean {
  return !!winningCard && winningCard.ukras === 'ribarsko' && benefits(winningCard, winningCard.owner) && macSize >= 2;
}

/** Hand as seen for akuža detection: ukrasi of the other team are inert (Divlje, Glasno). */
export function akuzaView(hand: CardInst[], side: Side): CardInst[] {
  return hand.map((c) => (c.ukras && !benefits(c, side) ? { ...c, ukras: undefined } : c));
}
