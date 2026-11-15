// Fore for 4 seats (§18.3.2): canUse + descriptions. Effects are applied in rules4.ts.
import { FORE } from './fore';
import type { ForaId } from './types';
import type { Hand4State, Seat } from './types4';
import { opponentsOf, PARTNER_OF, TEAM_OF } from './types4';
import { isTurncoat4 } from './ukrasi4';

export type ReasonKey4 =
  | 'notYourTurn' | 'noRakija' | 'usedThisHand' | 'leaderOnly' | 'secondOnly' | 'nothingToReveal'
  | 'oppOneCard' | 'notOwned' | 'partnerEmpty' | 'pickSeat' | 'mustBeVoid';

/** Fore that need an opponent seat target. */
export const SEAT_TARGET: ForaId[] = ['pogled', 'napij_ga'];

export const FORA_DESC4: Record<ForaId, { en: string; hr: string }> = {
  pogled: { en: 'Pick an opponent: see up to 3 of his cards your team doesn’t know.', hr: 'Odaberi protivnika: vidiš do 3 njegove karte koje vaš par ne zna.' },
  zamjena: { en: 'A hand card swaps with a random card from your partner.', hr: 'Karta iz ruke mijenja se s nasumičnom kartom partnera.' },
  namjesteno: { en: 'See your partner’s whole hand for the rest of this hand.', hr: 'Vidiš cijelu partnerovu ruku do kraja ruke.' },
  krivi_racun: { en: 'At hand end your team’s thirds round up.', hr: 'Na kraju ruke bele vašeg para idu gore.' },
  ti_otvaraj: { en: 'As leader: the next seat leads instead; you play last.', hr: 'Kad otvaraš: otvara idući igrač, ti igraš zadnji.' },
  tucem: { en: 'As leader: both opponents must play their highest of the suit.', hr: 'Kad otvaraš: oba protivnika moraju baciti najjaču te boje.' },
  napij_ga: { en: 'Pick an opponent: his next card is random.', hr: 'Odaberi protivnika: njegova iduća karta je nasumična.' },
  vrati: { en: 'Playing 2nd after an opponent’s lead: he takes it back and leads another.', hr: 'Kad igraš drugi iza protivnika: vraća kartu i baca drugu.' },
  trica_iz_rukava: { en: 'Chosen hand card is as strong as a 3 for the rest of the hand.', hr: 'Odabrana karta do kraja ruke jaka je kao trica.' },
  duplo_ili_nista: { en: 'Card thirds in this trick are doubled for the team that wins it.', hr: 'Bele u ovom štihu duplo vrijede za par koji ga odnese.' },
  briskula: { en: "Only when you can't follow suit: your card's suit is trump for this trick.", hr: 'Samo kad nemaš traženu boju: boja tvoje karte je adut u ovom štihu.' },
};

export function unknownTo(s: Hand4State, seat: Seat, team: 'mi' | 'vi'): string[] {
  return s.seats[seat].hand.filter((c) => !(s.knownTo[c.uid] ?? []).includes(team)).map((c) => c.uid);
}

export function canUseFora4(s: Hand4State, seat: Seat, id: ForaId, targetSeat?: Seat): { ok: boolean; reason?: ReasonKey4 } {
  const def = FORE[id];
  const me = s.seats[seat];
  const team = TEAM_OF[seat];
  if (!me.fore.includes(id)) return { ok: false, reason: 'notOwned' };
  if (s.phase !== 'play' || s.turn !== seat) return { ok: false, reason: 'notYourTurn' };
  if (me.foreUsed.includes(id)) return { ok: false, reason: 'usedThisHand' };
  const pos = s.trick.plays.length + 1;
  if ((id === 'ti_otvaraj' || id === 'tucem') && pos !== 1) return { ok: false, reason: 'leaderOnly' };
  if (id === 'vrati') {
    if (pos !== 2) return { ok: false, reason: 'secondOnly' };
    const leader = s.trick.plays[0].seat;
    if (TEAM_OF[leader] === team) return { ok: false, reason: 'secondOnly' };
    if (s.seats[leader].hand.length < 1) return { ok: false, reason: 'oppOneCard' };
  }
  if (id === 'zamjena' && s.seats[PARTNER_OF[seat]].hand.length < 1) return { ok: false, reason: 'partnerEmpty' };
  if (id === 'pogled') {
    const targets = targetSeat ? [targetSeat] : opponentsOf(seat);
    if (targetSeat && !opponentsOf(seat).includes(targetSeat)) return { ok: false, reason: 'pickSeat' };
    if (targets.every((t) => unknownTo(s, t, team).length === 0)) return { ok: false, reason: 'nothingToReveal' };
  }
  if (id === 'napij_ga' && targetSeat && !opponentsOf(seat).includes(targetSeat)) return { ok: false, reason: 'pickSeat' };
  if (id === 'briskula') {
    const leadPlay = s.trick.plays[0];
    const led = leadPlay ? s.table.find((c) => c.uid === leadPlay.uid) : undefined;
    if (!led || s.trick.briskula) return { ok: false, reason: 'mustBeVoid' };
    if (me.hand.some((c) => c.suit === led.suit || isTurncoat4(c, seat))) return { ok: false, reason: 'mustBeVoid' };
  }
  if (me.rakija < def.cost) return { ok: false, reason: 'noRakija' };
  return { ok: true };
}
