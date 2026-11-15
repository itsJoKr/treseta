// Pure classification of game situations into voice events (§9.4). No DOM.
import type { VoiceEventType } from '../data/voiceEvents';
import type { VoiceLineId } from '../data/voiceLines';
import { val } from '../game/bot';
import type { Eval } from '../game/bot';
import type { AkuzaCombo, CardInst, GameEvent, Side, SideBreakdown } from '../game/types';

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
