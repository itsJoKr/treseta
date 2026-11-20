// Pure classification of game situations into voice events (§9.4). No DOM.
import type { VoiceEventType } from '../data/voiceEvents';
import type { VoiceLineId } from '../data/voiceLines';
import { val } from '../game/bot';
import type { Eval } from '../game/bot';
import { BASE_STRENGTH } from '../game/cards';
import type { AkuzaCombo, CardInst, GameEvent, Rank, Side, SideBreakdown, Suit } from '../game/types';

type Tr = Extract<GameEvent, { t: 'trickResolved' }>;

export interface TrickCtx {
  lead: CardInst;
  follow: CardInst;
  playerUsedDuplo: boolean;
  playerTricaTarget?: string;
}

/** Trick-end selection: first matching of player_great, bot_lose_big, bot_win_big, bot_lose_trick, bot_win_trick; ultima on trick 20. */
export function trickEndEvent(e: Tr, c: TrickCtx): VoiceEventType {
  if (e.trickNo === 20) return e.winner === 'bot' ? 'ultima_bot' : 'ultima_player';
  const total = e.thirdsTo.player + e.thirdsTo.bot;
  const botCard = c.lead.owner === 'bot' ? c.lead : c.follow;
  const playerCard = c.lead.owner === 'player' ? c.lead : c.follow;
  const playerWon = e.winner === 'player';
  const playerBonus = e.bonus.some((b) => b.side === 'player' && (b.points ?? 0) >= 1);
  const winCard = e.winner === c.lead.owner ? c.lead : c.follow;
  const foraGreat = playerWon && ((c.playerUsedDuplo && e.thirdsTo.player >= 6) || (!!c.playerTricaTarget && winCard.uid === c.playerTricaTarget && e.thirdsTo.player >= 3));
  const beatLead = playerWon && c.lead.owner === 'bot' && (c.lead.rank === '2' || c.lead.rank === 'A');
  if (beatLead || playerBonus || foraGreat) return 'player_great';
  if (playerWon && (total >= 3 || botCard.rank === 'A' || botCard.rank === '3')) return 'bot_lose_big';
  if (!playerWon && (total >= 3 || playerCard.rank === 'A')) return 'bot_win_big';
  return playerWon ? 'bot_lose_trick' : 'bot_win_trick';
}

/** bot_play_strong / bot_forced_bad for a bot play decided from its view. */
export function botPlayEvent(e: Eval, uid: string): VoiceEventType | null {
  const v = e.v;
  const c = v.hand.find((x) => x.uid === uid);
  if (!c) return null;
  const legal = e.legalCards();
  if (!v.leadCard) {
    if (c.rank === '3') return 'bot_play_strong';
    if (e.isMaster(c) && val(c) * v.multiplier >= 3) return 'bot_play_strong';
    return null;
  }
  const L = v.leadCard;
  const V = val(L) * v.multiplier;
  const beats = c.suit === L.suit && e.strMine(c) > (v.leadStr ?? e.strOpp(L));
  if (beats && V >= 3) return 'bot_play_strong';
  if (!beats && val(c) >= 1 && legal.every((x) => val(x) >= 1)) return 'bot_forced_bad';
  return null;
}

export function akuzaBotLines(combos: AkuzaCombo[]): VoiceLineId[] {
  if (combos.some((c) => c.key.startsWith('napolitana'))) return ['napolitana'];
  if (combos.some((c) => c.points - (c.glasno ?? 0) >= 4 || c.upgrade)) return ['akuzan_cetiri'];
  return ['akuzan_tri'];
}

export function handEndEvent(b: Record<Side, SideBreakdown>): VoiceEventType | null {
  const p = b.player.total + b.player.akuzaPoints;
  const q = b.bot.total + b.bot.akuzaPoints;
  if (p - q >= 6) return 'big_swing';
  if (q > p) return 'hand_end_bot_win';
  if (q < p) return 'hand_end_bot_lose';
  return null;
}

export function badDraw(hand: CardInst[], drawn: CardInst): boolean {
  return val(drawn) === 0 && hand.filter((c) => c.uid !== drawn.uid && val(c) >= 1).length <= 1;
}

// ---------------- §22.3 mid-trick reactions (Dvoboj) ----------------

type C = { suit: Suit; rank: Rank };
const FIGURE: Rank[] = ['K', 'C', 'F'];

export interface PlayReactCtx {
  /** who just played */
  side: Side;
  card: C;
  /** the mover's legal cards right before the play */
  legal: C[];
  /** the card this play follows (the other side's lead), if any */
  lead?: C;
}

/**
 * What the bot may say the moment a card lands, most specific first (the director tries them in
 * order and says at most one). Rank strength only: ukras and fora tweaks don't matter for banter.
 * - ace_snatched: the bot had to give up its ace (only aces were legal) to the player's 3 or 2;
 * - knew_trica / knew_ace: the player's 3 beats the bot's led A or 2, the player's ace beats its
 *   led King, Knight or Knave ("A zna sam da ima tricu...");
 * - gloat: the player had to give up an ace to the bot's 3 or 2;
 * - react_short: a grunt at the player's 3 (led, or taking the trick).
 */
export function playReactions(c: PlayReactCtx): VoiceEventType[] {
  const out: VoiceEventType[] = [];
  const L = c.lead;
  if (!L) {
    if (c.side === 'player' && c.card.rank === '3') out.push('react_short');
    return out;
  }
  const beats = c.card.suit === L.suit && BASE_STRENGTH[c.card.rank] > BASE_STRENGTH[L.rank];
  const forcedAce = c.card.rank === 'A' && c.card.suit === L.suit && (L.rank === '3' || L.rank === '2')
    && c.legal.length > 0 && c.legal.every((x) => x.rank === 'A');
  if (c.side === 'bot') {
    if (forcedAce) out.push('ace_snatched');
    return out;
  }
  if (beats && c.card.rank === '3' && (L.rank === 'A' || L.rank === '2')) out.push('knew_trica');
  if (beats && c.card.rank === 'A' && FIGURE.includes(L.rank)) out.push('knew_ace');
  if (forcedAce) out.push('gloat');
  if (beats && c.card.rank === '3') out.push('react_short');
  return out;
}
