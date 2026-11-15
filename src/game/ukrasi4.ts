// Team-aware ukras hooks for Partneri (§18.3.1). PURE.
import { BASE_STRENGTH } from './cards';
import type { UkrasId } from './types';
import type { Card4, Seat, Team } from './types4';
import { TEAM_OF } from './types4';

export interface Ctx4 { playedBy: Seat; winner?: Seat; team: Team }

/** Beneficiary team of a card's ukras (player's permanent ukrasi default to 'mi'). */
export function ukrasTeamOf(c: Card4): Team | undefined {
  return c.ukras ? (c.ukrasTeam ?? 'mi') : undefined;
}

function firesFor(c: Card4, seat: Seat): boolean {
  return !!c.ukras && ukrasTeamOf(c) === TEAM_OF[seat];
}

/** Effective strength (doubled units) when `seat` plays/holds the card. */
/** Prevrtljivo (§19.2.3): played by its team as a non-leader, it counts as the led suit. */
export function isTurncoat4(c: Card4, seat: Seat): boolean { return c.ukras === 'prevrtljivo' && firesFor(c, seat); }

export function strength4(c: Card4, seat: Seat, tricaTarget?: string): number {
  let s = BASE_STRENGTH[c.rank] * 2;
  if (tricaTarget && tricaTarget === c.uid) s = 20;
  if (c.ukras === 'nabruseno' && firesFor(c, seat)) s += 3;
  return s;
}

/** onLead: Ljuto led by a T seat forces the other team. Returns the forced team or undefined. */
export function onLead(c: Card4, leader: Seat): Team | undefined {
  if (c.ukras === 'ljuto' && firesFor(c, leader)) return TEAM_OF[leader] === 'mi' ? 'vi' : 'mi';
  return undefined;
}

/** onPlay: Pijano played by S or N (Mi ukras) gives the player +1 rakija. */
export function onPlay(c: Card4, seat: Seat): boolean {
  return c.ukras === 'pijano' && ukrasTeamOf(c) === 'mi' && (seat === 'S' || seat === 'N');
}

/** Usoljeno: who receives this card's thirds. */
export function thirdsRecipient(c: Card4, playedBy: Seat, winTeam: Team): Team {
  if (c.ukras === 'usoljeno' && firesFor(c, playedBy) && TEAM_OF[playedBy] !== winTeam) return TEAM_OF[playedBy];
  return winTeam;
}

/** Pozlaćeno / Srebreno: pay when the card ends in the beneficiary's pile (whoever played it). */
export function onTrickResolved(c: Card4, winTeam: Team): { team: Team; ukras: UkrasId; points?: number; soldi?: number } | null {
  const t = ukrasTeamOf(c);
  if (!t || t !== winTeam) return null;
  if (c.ukras === 'pozlaceno') return { team: t, ukras: 'pozlaceno', points: 1 };
  if (c.ukras === 'srebreno' && t === 'mi') return { team: 'mi', ukras: 'srebreno', soldi: 3 };
  return null;
}

/** Ponoćno: played by a T seat and wins trick 10 -> ultima 3. */
export function onUltima(winning: Card4, winner: Seat): number {
  return winning.ukras === 'ponocno' && firesFor(winning, winner) ? 3 : 1;
}

/** Ribarsko: a T seat wins a trick with this card. */
export function ribarskoFires(winning: Card4, winner: Seat): boolean {
  return winning.ukras === 'ribarsko' && firesFor(winning, winner);
}

/** Copies of a hand with ukrasi removed where the ukras team differs from the seat's team (Divlje/Glasno). */
export function akuzaView(hand: Card4[], seat: Seat): Card4[] {
  return hand.map((c) => {
    if (!c.ukras || ukrasTeamOf(c) === TEAM_OF[seat]) return c;
    const { ukras: _u, ...rest } = c;
    void _u;
    return rest as Card4;
  });
}

export const DESC4: Partial<Record<UkrasId, { en: string; hr: string }>> = {
  prevrtljivo: { en: 'Played by your team as 2nd–4th, it counts as the suit led.', hr: 'Kad ga tvoj par ne otvara, vrijedi kao tražena boja.' },
  pozlaceno: { en: 'If it ends in your team’s trick pile (whoever played it): +1 punat.', hr: 'Ako završi u štihovima tvog para (bilo tko je bacija): +1 punat.' },
  srebreno: { en: 'If it ends in your team’s trick pile: +3 šoldi.', hr: 'Ako završi u štihovima tvog para: +3 šoldi.' },
  nabruseno: { en: 'Strength +½ rank when played by your team.', hr: 'Jača za pola stupnja kad je baci tvoj par.' },
  ljuto: { en: 'Led by your team: both opponents must play their highest of that suit.', hr: 'Kad je tvoj par otvori: oba protivnika moraju baciti najjaču te boje.' },
  usoljeno: { en: 'Played by your team and the trick is lost: its thirds stay with you.', hr: 'Ako je baci tvoj par i izgubi štih, bodovi ostaju vama.' },
  pijano: { en: 'Played by you or your partner: +1 rakija for you.', hr: 'Kad je baciš ti ili partner: +1 rakija.' },
  divlje: { en: 'In your team’s hands: counts as the 3, 2 or A of its suit for akuže.', hr: 'U rukama tvog para vrijedi kao trica, duja ili as svoje boje za akužu.' },
  glasno: { en: 'An akuža declared by your team with it: +2.', hr: 'Akuža tvog para s ovom kartom: +2.' },
  ponocno: { en: 'Played by your team and wins the last trick: ultima 3.', hr: 'Ako je baci tvoj par i odnese zadnji štih: ultima 3.' },
  ribarsko: { en: 'Win a trick with it: see 1 card from each opponent.', hr: 'Kad odneseš štih s njom: vidiš po jednu kartu svakog protivnika.' },
};
