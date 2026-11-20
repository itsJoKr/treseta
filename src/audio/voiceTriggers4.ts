// Partneri voice triggers (§18.7.2–§18.7.4): misplay detection, speaker routing, the shared
// table of three directors (N, W, E) on one VoiceArbiter, and the "argument" moment. No DOM.
import { ARGUMENT4, IDLE_PARTNER_P, MATCH_END_GAP4_MS, MISPLAY_P, VOICE_EVENTS4 } from '../data/voiceEvents4';
import type { Voice4EventType } from '../data/voiceEvents4';
import { VOICE_BY_ID } from '../data/voiceLines';
import type { VoiceLine, VoiceLineId } from '../data/voiceLines';
import { Eval4, val4 } from '../game/bot4';
import { buildView4 } from '../game/botMemory4';
import { knobsFor } from '../game/characters';
import type { Rng } from '../game/rng';
import { BASE_STRENGTH } from '../game/cards';
import type { AkuzaCombo, PersonaId, SideBreakdown, Suit } from '../game/types';
import type { Card4, GameEvent4, Hand4State, Seat, Team } from '../game/types4';
import { TEAM_OF } from '../game/types4';
import { VoiceArbiter } from './voiceArbiter';
import type { SpeakHandle } from './voiceDirector';
import { VoiceDirector } from './voiceDirector';
import { akuzaBotLines } from './voiceTriggers';

export type VSeat = 'W' | 'N' | 'E';
export const VOICE_SEATS: VSeat[] = ['N', 'W', 'E'];

type TrickRes = Extract<GameEvent4, { t: 'trickResolved' }>;

// ---------------- misplay detection (§18.7.3 partner_misplay) ----------------

/** Snapshot of the player's decision, captured right before S plays. */
export interface PlayerTurnCtx {
  played: Card4;
  legal: Card4[];
  ledSuit?: Suit;
  /** strength of each legal card (and of the played one) for S */
  str: Record<string, number>;
  partnerWinningSafe: boolean;
  partnerStr?: number;
  partnerTucem: boolean;
}

export function playerTurnCtx(s: Hand4State, uid: string, deck: Card4[]): PlayerTurnCtx {
  const mem = { me: 'S' as Seat, played: s.table.filter((c) => !s.trick.plays.some((p) => p.uid === c.uid)).map((c) => c.uid), myPlays: 0 };
  const v = buildView4(s, mem, deck);
  const e = new Eval4(v, knobsFor('bepo'));
  const legal = e.legalCards();
  const played = v.hand.find((c) => c.uid === uid)!;
  const str: Record<string, number> = {};
  for (const c of v.hand) str[c.uid] = e.str(c, 'S');
  const w = e.winning();
  const led = e.ledSuit();
  const partnerWinningSafe = !!w && w.seat === 'N' && !!led && e.safeAt(w.str, led);
  const sig = s.trick.signal;
  const partnerTucem = (sig?.seat === 'N' && sig.kind === 'tucem') || (!!s.trick.tucemFora && s.trick.leader === 'N');
  return { played, legal, ledSuit: led, str, partnerWinningSafe, partnerStr: w?.seat === 'N' ? w.str : undefined, partnerTucem };
}

export type MisplayKind = 'dump' | 'overtake' | 'tucem';

export function detectMisplay(c: PlayerTurnCtx, winnerTeam: Team): MisplayKind | null {
  const p = c.played;
  // (c) ignored Tučem: the player held the suit and didn't play their highest card of it
  if (c.partnerTucem && c.ledSuit) {
    const suit = c.legal.filter((x) => x.suit === c.ledSuit);
    if (suit.length && p.suit === c.ledSuit) {
      const top = Math.max(...suit.map((x) => c.str[x.uid]));
      if (c.str[p.uid] < top) return 'tucem';
    } else if (suit.length) return 'tucem';
  }
  // (b) overtake of a safe partner card with A/2/3 while holding a lower legal card of the suit
  if (c.partnerWinningSafe && c.ledSuit && c.partnerStr !== undefined && p.suit === c.ledSuit && ['A', '2', '3'].includes(p.rank)
    && c.str[p.uid] > c.partnerStr && c.legal.some((x) => x.suit === c.ledSuit && x.uid !== p.uid && c.str[x.uid] < c.partnerStr!)) return 'overtake';
  // (a) point dump onto a trick Vi won while holding a legal val-0 card
  if (winnerTeam === 'vi' && val4(p) >= 1 && c.legal.some((x) => val4(x) === 0)) return 'dump';
  return null;
}

// ---------------- routing ----------------

export interface Candidate { seat: VSeat; event: Voice4EventType; p?: number; lines?: VoiceLineId[] }

/** Vi seat whose own card in the trick had the highest val (tie: the one who played later). */
export function viLoser(e: TrickRes, cards: (uid: string) => Card4): VSeat {
  let best: { seat: Seat; v: number } | null = null;
  for (const p of e.plays) {
    if (TEAM_OF[p.seat] !== 'vi') continue;
    const v = val4(cards(p.uid));
    if (!best || v >= best.v) best = { seat: p.seat, v };
  }
  return (best?.seat ?? 'W') as VSeat;
}

export interface TrickVoiceCtx {
  cards: (uid: string) => Card4;
  misplay: MisplayKind | null;
  playerUsedDuplo?: boolean;
}

/** Ordered candidates for the end of a trick: partner misplay → partner events → opponent events. */
export function trickEndCandidates4(e: TrickRes, c: TrickVoiceCtx): Candidate[] {
  const out: Candidate[] = [];
  const total = e.thirdsTo.mi + e.thirdsTo.vi;
  const miWon = e.team === 'mi';
  const card = (seat: Seat) => { const p = e.plays.find((x) => x.seat === seat); return p ? c.cards(p.uid) : undefined; };
  const sCard = card('S');
  const loser = viLoser(e, c.cards);
  if (c.misplay) out.push({ seat: 'N', event: 'partner_misplay', p: MISPLAY_P[c.misplay] });
  // §19.6: a forgery or Briškula! winning the trick
  if (e.special && !miWon) out.push({ seat: e.winner as VSeat, event: 'bot_play_strong', p: 1.0, lines: ['aha_sta_je_sad', 'evo_ti_ga_na'] });
  if (e.special && miWon) out.push({ seat: 'N', event: 'partner_player_great' }, { seat: loser, event: 'player_great', p: 0.8 });
  if (e.trickNo === 10 && miWon) out.push({ seat: 'N', event: 'partner_ultima' });
  const viBig = e.plays.some((p) => TEAM_OF[p.seat] === 'vi' && ['A', '3'].includes(c.cards(p.uid).rank));
  const carico = e.winner === 'N' && !!sCard && val4(sCard) >= 3;
  if ((e.winner === 'S' && viBig) || carico) out.push({ seat: 'N', event: 'partner_player_great' });
  if (miWon && total >= 3) out.push({ seat: 'N', event: 'partner_team_big' });
  if (!miWon && total >= 3 && !c.misplay) out.push({ seat: 'N', event: 'partner_lose_big' });
  // opponent events (§9.4 with bot = Vi, player = Mi)
  if (e.trickNo === 10) {
    out.push(miWon ? { seat: loser, event: 'ultima_player' } : { seat: e.winner as VSeat, event: 'ultima_bot' });
    return out;
  }
  const lead = c.cards(e.plays[0].uid);
  if (miWon) {
    const beatLead = TEAM_OF[e.plays[0].seat] === 'vi' && (lead.rank === '2' || lead.rank === 'A');
    const bonus = e.bonus.some((b) => b.team === 'mi' && (b.points ?? 0) >= 1);
    const duplo = !!c.playerUsedDuplo && e.thirdsTo.mi >= 6;
    if (beatLead || bonus || duplo) out.push({ seat: loser, event: 'player_great' });
    if (total >= 3 || viBig) out.push({ seat: loser, event: 'bot_lose_big' });
    out.push({ seat: loser, event: 'bot_lose_trick' });
  } else {
    const miAce = e.plays.some((p) => TEAM_OF[p.seat] === 'mi' && c.cards(p.uid).rank === 'A');
    if (total >= 3 || miAce) out.push({ seat: e.winner as VSeat, event: 'bot_win_big' });
    out.push({ seat: e.winner as VSeat, event: 'bot_win_trick' });
  }
  return out;
}

/** bot_play_strong / bot_forced_bad for a Vi bot's play (from its own view). */
export function playEvent4(e: Eval4, uid: string): Voice4EventType | null {
  const v = e.v;
  const c = v.hand.find((x) => x.uid === uid);
  if (!c) return null;
  if (!v.plays.length) {
    if (c.rank === '3') return 'bot_play_strong';
    if (e.isMaster(c) && val4(c) * v.multiplier >= 3) return 'bot_play_strong';
    return null;
  }
  const w = e.winning()!;
  const V = v.plays.reduce((a, p) => a + val4(p.card), 0) * v.multiplier;
  const oppWinning = e.isOpp(w.seat);
  const beats = c.suit === e.ledSuit() && e.str(c, e.me) > w.str && oppWinning;
  if (beats && V >= 3) return 'bot_play_strong';
  // forced to feed points to the other team: they are winning, this card can't beat it, and every legal card has points
  if (oppWinning && !beats && val4(c) >= 1 && e.legalCards().every((x) => val4(x) >= 1)) return 'bot_forced_bad';
  return null;
}

// ---------------- §22.3 mid-trick reactions (Partneri) ----------------

export interface Play4ReactCtx {
  seat: Seat;
  card: Card4;
  /** the mover's legal cards right before the play */
  legal: Card4[];
  /** the trick's plays before this one, in order */
  before: { seat: Seat; card: Card4 }[];
  rng: () => number;
}

const FIGURE4 = ['K', 'C', 'F'];
const str4 = (c: Card4) => BASE_STRENGTH[c.rank];

/**
 * Who says what the moment a card lands, most specific first (VoiceTable4.first says at most one).
 * Every bot can react, not only the one that played: the victim of a 3 ("A zna sam da ima
 * tricu..."), the player's partner cheering, an opponent gloating over the player's lost ace.
 */
export function playReactions4(c: Play4ReactCtx): Candidate[] {
  const out: Candidate[] = [];
  const team = TEAM_OF[c.seat];
  if (c.before.length === 0) {
    // a led 3: someone on the other side grunts
    if (c.card.rank === '3') out.push({ seat: team === 'mi' ? (c.rng() < 0.5 ? 'W' : 'E') : 'N', event: 'react_short' });
    return out;
  }
  const led = c.before[0].card.suit;
  let best = c.before[0];
  for (const p of c.before) if (p.card.suit === led && str4(p.card) > str4(best.card)) best = p;
  const takesOver = c.card.suit === led && str4(c.card) > str4(best.card);
  const winner = takesOver ? { seat: c.seat, card: c.card } : best;
  const fromOther = TEAM_OF[best.seat] !== team;
  // (1) forced to give up an ace to the other side's 3 or 2
  if (c.card.rank === 'A' && c.card.suit === led && c.legal.length > 0 && c.legal.every((x) => x.rank === 'A')
    && TEAM_OF[winner.seat] !== team && (winner.card.rank === '3' || winner.card.rank === '2')) {
    if (c.seat !== 'S') out.push({ seat: c.seat as VSeat, event: 'ace_snatched' });
    else if (winner.seat === 'W' || winner.seat === 'E') out.push({ seat: winner.seat, event: 'gloat' });
  }
  if (takesOver && fromOther) {
    // (2) "I knew they had it": the bot whose card was winning
    if (best.seat !== 'S') {
      const victim = best.seat as VSeat;
      if (c.card.rank === '3' && (best.card.rank === 'A' || best.card.rank === '2')) out.push({ seat: victim, event: 'knew_trica' });
      else if (c.card.rank === 'A' && FIGURE4.includes(best.card.rank)) out.push({ seat: victim, event: 'knew_ace' });
    }
    // (3) the partner cheers the player's strong take-over
    if (c.seat === 'S' && (c.card.rank === '3' || best.card.rank === 'A' || best.card.rank === '2')) out.push({ seat: 'N', event: 'partner_react' });
    // (4) a grunt from the side that just lost the lead to a 3
    if (c.card.rank === '3') out.push({ seat: best.seat === 'S' ? 'N' : (best.seat as VSeat), event: 'react_short' });
  }
  return out;
}

// ---------------- the table: 3 directors on one arbiter ----------------

export interface VoiceTableDeps {
  now(): number;
  rng: Rng;
  schedule(fn: () => void, ms: number): void;
  say(seat: VSeat, line: VoiceLine, priority: number): SpeakHandle;
  speakers: Record<VSeat, { persona: PersonaId; cussMult: number }>;
  /** the argument face-off (opponent portrait shakes, partner bounces) */
  onArgument?(opp: VSeat): void;
}

export class VoiceTable4 {
  readonly arbiter: VoiceArbiter;
  readonly directors: Record<VSeat, VoiceDirector<Voice4EventType>>;
  argumentUsed = false;
  log: { seat: VSeat; event: Voice4EventType; line: VoiceLineId; at: number }[] = [];
  private _enabled = true;

  constructor(private deps: VoiceTableDeps) {
    this.arbiter = new VoiceArbiter(deps.now);
    const mk = (seat: VSeat) => new VoiceDirector<Voice4EventType>({
      now: deps.now, rng: deps.rng, persona: deps.speakers[seat].persona, cussMult: deps.speakers[seat].cussMult,
      say: (line, prio) => deps.say(seat, line, prio), arbiter: this.arbiter, speaker: seat, events: VOICE_EVENTS4,
    });
    this.directors = { N: mk('N'), W: mk('W'), E: mk('E') };
  }

  get enabled(): boolean { return this._enabled; }
  set enabled(v: boolean) { this._enabled = v; for (const s of VOICE_SEATS) this.directors[s].enabled = v; }

  newHand(): void {
    this.arbiter.newHand();
    this.argumentUsed = false;
    for (const s of VOICE_SEATS) this.directors[s].newHand();
  }

  speak(seat: VSeat, event: Voice4EventType, ctx?: { p?: number; lines?: VoiceLineId[]; ignoreGap?: boolean }): VoiceLineId | null {
    const id = this.directors[seat].onEvent(event, ctx);
    if (!id) return null;
    this.log.push({ seat, event, line: id, at: this.deps.now() });
    if (seat !== 'N' && VOICE_BY_ID[id].mood === 'angry') this.maybeArgue(seat);
    return id;
  }

  /** At most one line: the first candidate that speaks. */
  first(cands: Candidate[]): { seat: VSeat; line: VoiceLineId; event: Voice4EventType } | null {
    for (const c of cands) {
      const id = this.speak(c.seat, c.event, { p: c.p, lines: c.lines });
      if (id) return { seat: c.seat, line: id, event: c.event };
    }
    return null;
  }

  private maybeArgue(opp: VSeat): void {
    if (this.argumentUsed || !this._enabled) return;
    if (this.deps.rng() >= ARGUMENT4.p) return;
    this.argumentUsed = true;
    const delay = Math.max(0, this.arbiter.playingUntil - this.deps.now()) + ARGUMENT4.delayMs;
    this.deps.schedule(() => {
      const id = this.directors.N.onEvent('partner_argument', { ignoreGap: true });
      if (id) {
        this.log.push({ seat: 'N', event: 'partner_argument', line: id, at: this.deps.now() });
        this.deps.onArgument?.(opp);
      }
    }, delay);
  }

  // ---- convenience routing ----
  matchStart(): void { this.speak('W', 'match_start'); }

  akuza(seat: Seat, combos: AkuzaCombo[]): void {
    if (seat === 'N') this.speak('N', 'partner_akuza', { lines: akuzaBotLines(combos) });
    else if (seat === 'W' || seat === 'E') this.speak(seat, 'akuza_bot', { lines: akuzaBotLines(combos) });
    else this.speak(this.randomVi(), 'akuza_player');
  }

  fora(seat: Seat, fora: string, targetSeat?: Seat): void {
    if (seat === 'S') {
      const s: VSeat = targetSeat === 'W' || targetSeat === 'E' ? targetSeat : this.randomVi();
      this.speak(s, 'player_fora');
    } else if (seat === 'W' || seat === 'E') {
      if (fora === 'tucem') this.speak(seat, 'opp_signal');
      else this.speak(seat, 'bot_fora');
    } else if (fora === 'tucem') this.speak('N', 'partner_signal');
  }

  signal(seat: Seat, kind: string): void {
    if (kind !== 'tucem') return; // Strišo has no voice line (§18.2)
    if (seat === 'N') this.speak('N', 'partner_signal');
    else if (seat === 'W' || seat === 'E') this.speak(seat, 'opp_signal');
  }

  idle(): void { this.speak(this.deps.rng() < IDLE_PARTNER_P ? 'N' : this.randomVi(), 'idle'); }

  illegal(): void { this.speak('N', 'player_illegal'); }

  handEnd(b: Record<Team, SideBreakdown>): void {
    const mi = b.mi.total + b.mi.akuzaPoints;
    const vi = b.vi.total + b.vi.akuzaPoints;
    const cands: Candidate[] = [];
    if (mi >= vi + 6) cands.push({ seat: 'N', event: 'partner_hand_win' }, { seat: this.randomVi(), event: 'big_swing' });
    else if (vi > mi) cands.push({ seat: 'W', event: 'hand_end_bot_win' });
    else if (mi > vi) cands.push({ seat: 'E', event: 'hand_end_bot_lose' });
    this.first(cands);
  }

  /** Opponent first (W), then the partner 600 ms after that line ends (both priority 3). */
  matchEnd(winner: Team, margin: number): void {
    if (winner === 'mi') this.speak('W', 'match_bot_lose', margin >= 6 ? { lines: ['jebem_ti_mliko', 'grom_te_spanija', 'vrag_ti_sricu'] } : undefined);
    else this.speak('W', 'match_bot_win');
    const delay = Math.max(0, this.arbiter.playingUntil - this.deps.now()) + MATCH_END_GAP4_MS;
    this.deps.schedule(() => { this.speak('N', winner === 'mi' ? 'partner_match_win' : 'partner_match_lose'); }, delay);
  }

  private randomVi(): VSeat { return this.deps.rng() < 0.5 ? 'W' : 'E'; }
}
