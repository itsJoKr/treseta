// Fore (trick cards) as data, canUse and apply (§6).
import type { ForaId, GameEvent, HandState, Rarity, Side } from './types';
import { other } from './types';
import { isTurncoat } from './ukrasi';

export type ForaWhen = 'any' | 'lead' | 'follow';
export type ReasonKey =
  | 'notYourTurn' | 'noRakija' | 'usedThisHand' | 'macEmpty' | 'leaderOnly'
  | 'followerOnly' | 'nothingToReveal' | 'pendingChoice' | 'oppOneCard' | 'notOwned' | 'needsTarget' | 'mustBeVoid';

export interface ForaDef {
  id: ForaId;
  nameHr: string;
  nameEn: string;
  cost: 1 | 2;
  rarity: Rarity;
  price: number;
  needsTarget: boolean;
  when: ForaWhen;
  requiresMac: boolean;
  descEn: string;
  descHr: string;
  botMayOwn: boolean;
}

export const FORE: Record<ForaId, ForaDef> = {
  pogled: { id: 'pogled', nameHr: 'Poviri', nameEn: 'A peek', cost: 1, rarity: 'common', price: 4, needsTarget: false, when: 'any', requiresMac: false,
    descEn: "Reveal up to 3 random opponent hand cards you don't know.", descHr: 'Malo se nagni i poviri do 3 karte koje ima drugi.', botMayOwn: true },
  zamjena: { id: 'zamjena', nameHr: 'Zamina', nameEn: 'Swap', cost: 1, rarity: 'common', price: 4, needsTarget: true, when: 'any', requiresMac: true,
    descEn: 'A hand card goes to the bottom of the mac; draw the top card (hidden).', descHr: 'Kartu iz ruke turi na dno maca i uzmi gornju.', botMayOwn: true },
  namjesteno: { id: 'namjesteno', nameHr: 'Namišteno', nameEn: 'Rigged', cost: 1, rarity: 'common', price: 4, needsTarget: false, when: 'any', requiresMac: true,
    descEn: 'Look at the top 3 cards of the mac and put them back in any order.', descHr: 'Vidi gornje 3 karte maca i složi ih kako oćeš.', botMayOwn: false },
  krivi_racun: { id: 'krivi_racun', nameHr: 'Krivi račun', nameEn: 'Wrong bill', cost: 1, rarity: 'common', price: 4, needsTarget: false, when: 'any', requiresMac: false,
    descEn: 'At the end of this hand, round your thirds up instead of down.', descHr: 'Ka u konobi: na kraju ruke bele se zaokružuju na gore.', botMayOwn: true },
  ti_otvaraj: { id: 'ti_otvaraj', nameHr: 'Aj ti prvi', nameEn: 'You lead', cost: 1, rarity: 'common', price: 4, needsTarget: false, when: 'lead', requiresMac: false,
    descEn: 'The opponent must lead this trick instead; you follow.', descHr: 'Protivnik mora otvorit ovaj štih.', botMayOwn: false },
  tucem: { id: 'tucem', nameHr: 'Tučem!', nameEn: 'I knock!', cost: 1, rarity: 'uncommon', price: 6, needsTarget: false, when: 'lead', requiresMac: false,
    descEn: 'If the opponent can follow suit, they must play their highest card of it.', descHr: 'Protivnik mora bacit najjaču kartu tražene boje.', botMayOwn: true },
  napij_ga: { id: 'napij_ga', nameHr: 'Napij ga', nameEn: 'Get him drunk', cost: 1, rarity: 'uncommon', price: 6, needsTarget: false, when: 'any', requiresMac: false,
    descEn: "The opponent's next card is chosen at random from their legal plays.", descHr: 'Protivnik se napije pa mu iduća karta ide nasumce.', botMayOwn: false },
  vrati: { id: 'vrati', nameHr: 'Vrati!', nameEn: 'Take it back!', cost: 2, rarity: 'uncommon', price: 6, needsTarget: false, when: 'follow', requiresMac: false,
    descEn: 'The opponent takes back their led card (you see it) and must lead another.', descHr: 'Protivnik vraća bačenu kartu i mora bacit drugu.', botMayOwn: false },
  trica_iz_rukava: { id: 'trica_iz_rukava', nameHr: 'Trica iz rukava', nameEn: 'A 3 up the sleeve', cost: 2, rarity: 'rare', price: 8, needsTarget: true, when: 'any', requiresMac: false,
    descEn: 'Chosen hand card is as strong as a 3 for the rest of the hand.', descHr: 'Izabrana karta do kraja ruke jaka je ka trica.', botMayOwn: true },
  duplo_ili_nista: { id: 'duplo_ili_nista', nameHr: 'Duplo ili ništa', nameEn: 'Double or nothing', cost: 2, rarity: 'uncommon', price: 7, needsTarget: false, when: 'any', requiresMac: false,
    descEn: 'Card thirds in this trick are doubled for whoever wins it.', descHr: 'Bele u ovom štihu vride duplo, za onoga ko ga odnese.', botMayOwn: true },
  briskula: { id: 'briskula', nameHr: 'Briškula!', nameEn: 'Trump!', cost: 2, rarity: 'rare', price: 9, needsTarget: false, when: 'follow', requiresMac: false,
    descEn: "Only when you can't follow suit: the card you play makes its suit trump for this trick.", descHr: 'Samo kad nemaš traženu boju: karta koju baciš postaje adut u ovom štihu.', botMayOwn: true },
};

/** Fore never offered in the shop (the starting fora). */
export const START_ONLY_FORE: ForaId[] = ['pogled'];

export const FORA_IDS = Object.keys(FORE) as ForaId[];

export function canUseFora(s: HandState, side: Side, id: ForaId): { ok: boolean; reason?: ReasonKey } {
  const def = FORE[id];
  const me = s.sides[side];
  const opp = s.sides[other(side)];
  if (!me.fore.includes(id)) return { ok: false, reason: 'notOwned' };
  if (s.phase === 'pending') return { ok: false, reason: 'pendingChoice' };
  if (s.phase === 'over' || s.turn !== side) return { ok: false, reason: 'notYourTurn' };
  if (me.foreUsed.includes(id)) return { ok: false, reason: 'usedThisHand' };
  if (def.when === 'lead' && s.phase !== 'lead') return { ok: false, reason: 'leaderOnly' };
  if (def.when === 'follow' && s.phase !== 'follow') return { ok: false, reason: 'followerOnly' };
  if (def.requiresMac && s.mac.length < 1) return { ok: false, reason: 'macEmpty' };
  if (id === 'briskula') {
    const lead = s.table.find((c) => c.uid === s.trick.lead?.uid);
    if (!lead || s.trick.briskulaBy) return { ok: false, reason: 'mustBeVoid' };
    if (me.hand.some((c) => c.suit === lead.suit || isTurncoat(c, side))) return { ok: false, reason: 'mustBeVoid' };
  }
  if (id === 'pogled') {
    const unknown = opp.hand.filter((c) => !opp.knownByOpp.includes(c.uid));
    if (unknown.length === 0) return { ok: false, reason: 'nothingToReveal' };
  }
  if (id === 'vrati') {
    // the opponent must hold >= 2 cards including the led one
    if (!s.trick.lead || opp.hand.length < 1) return { ok: false, reason: 'oppOneCard' };
  }
  if (me.rakija < def.cost) return { ok: false, reason: 'noRakija' };
  return { ok: true };
}

export interface ForaCtx {
  events: GameEvent[];
  rand(): number;
  draw(side: Side, via: 'mac' | 'zamjena'): void;
}

/** Apply a fora effect on a (cloned, mutable) state. Cost/once-per-hand handled by the caller. */
export function applyFora(s: HandState, side: Side, id: ForaId, targetUid: string | undefined, ctx: ForaCtx): void {
  const me = s.sides[side];
  const oppSide = other(side);
  const opp = s.sides[oppSide];
  const ev: GameEvent & { t: 'foraUsed' } = { t: 'foraUsed', side, fora: id };
  if (targetUid) ev.targetUid = targetUid;
  switch (id) {
    case 'pogled': {
      const unknown = opp.hand.filter((c) => !opp.knownByOpp.includes(c.uid)).map((c) => c.uid);
      const revealed: string[] = [];
      while (revealed.length < 3 && unknown.length > 0) {
        const i = Math.floor(ctx.rand() * unknown.length) % unknown.length;
        revealed.push(unknown.splice(i, 1)[0]);
      }
      opp.knownByOpp.push(...revealed);
      ev.revealed = revealed;
      ctx.events.push(ev);
      return;
    }
    case 'zamjena': {
      const idx = me.hand.findIndex((c) => c.uid === targetUid);
      const [card] = me.hand.splice(idx, 1);
      me.knownByOpp = me.knownByOpp.filter((u) => u !== card.uid);
      s.mac.push(card);
      ctx.events.push(ev);
      ctx.draw(side, 'zamjena');
      // record the drawn uid on the fora event for convenience
      for (const e of ctx.events) if (e.t === 'cardDrawn' && e.via === 'zamjena' && e.side === side) ev.drawn = e.uid;
      return;
    }
    case 'namjesteno': {
      const uids = s.mac.slice(0, 3).map((c) => c.uid);
      ctx.events.push(ev);
      s.pendingReturn = s.phase === 'follow' ? 'follow' : 'lead';
      s.pending = { kind: 'reorderMac', side, uids };
      s.phase = 'pending';
      ctx.events.push({ t: 'pending', pending: s.pending });
      return;
    }
    case 'krivi_racun':
      me.kriviRacun = true;
      ctx.events.push(ev);
      return;
    case 'ti_otvaraj':
      s.trick.leader = oppSide;
      s.turn = oppSide;
      ctx.events.push(ev);
      return;
    case 'tucem':
      s.trick.forcedHighest = true;
      s.trick.tucem = true;
      ctx.events.push(ev);
      return;
    case 'napij_ga':
      opp.drunk = true;
      ctx.events.push(ev);
      return;
    case 'vrati': {
      const lead = s.trick.lead!;
      const idx = s.table.findIndex((c) => c.uid === lead.uid);
      const [card] = s.table.splice(idx, 1);
      opp.hand.push(card);
      if (!opp.knownByOpp.includes(card.uid)) opp.knownByOpp.push(card.uid);
      s.trick.excludedLead = card.uid;
      s.trick.lead = undefined;
      s.trick.forcedHighest = !!s.trick.tucem;
      s.turn = lead.side;
      s.phase = 'lead';
      ctx.events.push(ev);
      ctx.events.push({ t: 'leadReturned', side: lead.side, uid: card.uid });
      return;
    }
    case 'trica_iz_rukava':
      me.tricaTarget = targetUid;
      ctx.events.push(ev);
      return;
    case 'duplo_ili_nista':
      s.trick.multiplier = 2;
      ctx.events.push(ev);
      return;
    case 'briskula':
      s.trick.briskulaBy = side;
      ctx.events.push(ev);
      return;
  }
}
