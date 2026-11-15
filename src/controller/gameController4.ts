// Partneri orchestration (§18): engine4 <-> 3 bots <-> Animator4 <-> Hud4 <-> voice table.
import * as THREE from 'three';
import gsap from 'gsap';
import type { AudioManager } from '../audio/audio';
import { detectMisplay, playerTurnCtx, playEvent4, trickEndCandidates4, VoiceTable4 } from '../audio/voiceTriggers4';
import type { PlayerTurnCtx, VSeat } from '../audio/voiceTriggers4';
import type { Voice4EventType } from '../data/voiceEvents4';
import { getLang, t } from '../data/strings';
import { chooseCard4, chooseFora4, Eval4, thinkTime4 } from '../game/bot4';
import { buildView4, deckList4, newMemory4, observe4 } from '../game/botMemory4';
import type { BotMemory4 } from '../game/botMemory4';
import { fmtThirds, SUIT_NAME } from '../game/cards';
import { CHARACTERS, cussMultFor, knobsFor, knobsForTier } from '../game/characters';
import type { CharacterId, Knobs4 } from '../game/characters';
import { FORE } from '../game/fore';
import { canUseFora4, SEAT_TARGET } from '../game/fore4';
import { PAIRS } from '../game/ladder4';
import { matchAct4, nextHand4, startMatch4 } from '../game/match4';
import type { Match4Setup, Match4State } from '../game/match4';
import { rngFor } from '../game/rng';
import type { Rng } from '../game/rng';
import { firstDealer4, matchDeck, matchSetup4 } from '../game/run4';
import type { Match4Save, RunState4 } from '../game/run4';
import { knownCards, legalPlays4, legalSignals4 } from '../game/rules4';
import type { ForaId, SideBreakdown } from '../game/types';
import type { Action4, Card4, GameEvent4, Hand4State, Seat, Signal, Team } from '../game/types4';
import { TEAM_OF } from '../game/types4';
import { UKRASI } from '../game/ukrasi';
import { wait } from '../render/animator';
import type { Animator4 } from '../render/animator4';
import type { CardObject, CardTextures } from '../render/cardMesh';
import type { FX } from '../render/fx';
import { Input } from '../render/input';
import { TRICK4_CENTER } from '../render/layout';
import type { SceneManager } from '../render/scene';
import { art, h } from '../ui/dom';
import type { Hud4 } from '../ui/hud4';
import type { Overlay } from '../ui/overlay';
import { lightSummary4 } from '../ui/summary4';

export interface Controller4Deps {
  sm: SceneManager;
  anim: Animator4;
  fx: FX;
  audio: AudioManager;
  hud: Hud4;
  ov: Overlay;
  textures: CardTextures;
  settings: () => { subtitles: boolean; tipsSeen: string[]; language: 'hr' | 'en' };
  markTip: (id: string) => void;
  flags: { debug: boolean; autoplay: boolean; autonav: boolean };
  waitUnpaused: () => Promise<void>;
  onHandEnd: (save: Match4Save) => void;
  onSoldi: (n: number) => number;
  onAkuza: (n: number) => void;
  openSettings: () => void;
  saveSettings?: () => void;
}

const BOT_SEATS: VSeat[] = ['W', 'N', 'E'];
const AUTOPLAY_KNOBS: Knobs4 = { ...knobsFor('bepo'), mistakeRate: 0, pimcMaxCards: 0, pimcSamples: 0, thinkMs: [200, 400] };

export class GameController4 {
  match!: Match4State;
  setup!: Match4Setup;
  chars: Record<VSeat, CharacterId>;
  private knobs: Record<VSeat, Knobs4>;
  private mems!: Record<VSeat, BotMemory4>;
  private pMem: BotMemory4 = newMemory4('S');
  private deck: Card4[] = [];
  private byUid = new Map<string, Card4>();
  private botRng: Rng;
  private autoRng: Rng;
  private thinkRng: Rng;
  voice: VoiceTable4;
  private input: Input;
  private resolveInput: ((a: Action4) => void) | null = null;
  private targeting: ForaId | null = null;
  private seatTargeting: ForaId | null = null;
  armed: Signal | null = null;
  private live: Record<Team, number> = { mi: 0, vi: 0 };
  private rakijaShown = 0;
  private lastBreakdown: Record<Team, SideBreakdown> | null = null;
  private partnerAkuza = 0;
  private lastActivity = performance.now();
  private botJustPlayed = 0;
  private yourTurnShown = false;
  private turnCtx: PlayerTurnCtx | null = null;
  private trickCtx = { playerUsedDuplo: false };
  private pendingVoice: { seat: VSeat; ev: Voice4EventType } | null = null;
  private destroyed = false;
  private animating = 0;
  private keyHandler: (e: KeyboardEvent) => void;
  private idleTimer: number;
  private summaryResolve: (() => void) | null = null;
  private timers: number[] = [];
  log: GameEvent4[] = [];
  phaseTag = '';
  /** per-hand breakdowns for the match-end table (§19.5.2) */
  handsLog: Record<Team, SideBreakdown>[] = [];

  constructor(private d: Controller4Deps, private run: RunState4, private resume?: Match4Save) {
    const pair = PAIRS[run.ladderIndex];
    this.chars = { W: pair.W, N: run.partner ?? 'luka', E: pair.E };
    this.knobs = { W: knobsForTier(pair.tier, CHARACTERS[pair.W].aggression), N: knobsFor(this.chars.N), E: knobsForTier(pair.tier, CHARACTERS[pair.E].aggression) };
    this.botRng = rngFor(run.seed, 'bot4', run.ladderIndex, run.attempt);
    this.autoRng = rngFor(run.seed, 'auto4', run.ladderIndex, run.attempt);
    this.thinkRng = rngFor(run.seed, 'think4', run.ladderIndex, run.attempt);
    const vrng = rngFor(run.seed, 'voice4', run.ladderIndex, run.attempt);
    const sp = (id: CharacterId) => ({ persona: CHARACTERS[id].persona, cussMult: cussMultFor(id) });
    this.voice = new VoiceTable4({
      now: () => performance.now(), rng: vrng,
      schedule: (fn, ms) => { this.timers.push(window.setTimeout(() => { if (!this.destroyed) fn(); }, ms)); },
      say: (seat, line) => this.say(seat, line),
      speakers: { N: sp(this.chars.N), W: sp(this.chars.W), E: sp(this.chars.E) },
      onArgument: (opp) => { d.hud.seatReact(opp, 'angry', 900); d.hud.seatReact('N', 'laugh', 900); },
    });
    this.input = new Input(d.sm, d.anim, {
      canAct: () => !!this.resolveInput && this.animating === 0,
      tryCard: (uid, source) => this.tryCard(uid, source),
      rejected: (uid) => { const o = d.anim.cards.get(uid); if (o) this.illegal(o, false); },
      cancel: () => this.cancelTargeting(),
      hover: (card) => this.onHover(card),
      activity: () => { this.lastActivity = performance.now(); },
    });
    this.keyHandler = (e) => this.onKey(e);
    window.addEventListener('keydown', this.keyHandler);
    this.idleTimer = window.setInterval(() => this.checkIdle(), 500);
    d.anim.setSeatFaces(d.flags.debug);
    d.hud.onFora = (id) => this.clickFora(id);
    d.hud.onSignal = (k) => this.clickSignal(k);
    d.hud.onSeatPick = (seat) => this.pickSeat(seat);
    d.hud.tracker.set(!!(d.settings() as { trackerOpen?: boolean }).trackerOpen);
    d.hud.tracker.onToggle = (open) => { (d.settings() as { trackerOpen?: boolean }).trackerOpen = open; d.saveSettings?.(); };
  }

  destroy(): void {
    this.destroyed = true;
    window.removeEventListener('keydown', this.keyHandler);
    window.clearInterval(this.idleTimer);
    for (const x of this.timers) window.clearTimeout(x);
    this.input.dispose();
    this.resolveInput = null;
    this.d.anim.setLegal(null);
    this.d.anim.clearTable();
    this.d.hud.turn(null);
    this.d.hud.seatTargeting(null);
    this.voice.enabled = false;
  }

  get hand(): Hand4State { return this.match.hand!; }

  // ------------------------------------------------------------------ match

  async runMatch(): Promise<Match4State> {
    const run = this.run;
    const deck = matchDeck(run);
    const ms = matchSetup4(run);
    this.setup = { runSeed: run.seed, ladderIndex: run.ladderIndex, attempt: run.attempt, deck, fore: ms.fore, rakija: ms.rakija, perks: ms.perks };
    this.deck = deckList4(deck);
    for (const c of this.deck) this.byUid.set(c.uid, c);
    this.match = startMatch4(this.resume ?? { scores: { mi: 0, vi: 0 }, handNo: 1, dealer: firstDealer4(run.ladderIndex), akuzaPointsMi: 0 });
    const hud = this.d.hud;
    hud.setTable(this.chars, run.ladderIndex);
    hud.setScores(this.match.scores.mi, this.match.scores.vi);
    hud.setSoldi(run.soldi);
    hud.setLive(0, 0);
    for (const id of new Set(BOT_SEATS.map((s) => CHARACTERS[this.chars[s]].persona))) void this.d.audio.preloadVoice(id);
    while (this.match.status !== 'over' && !this.destroyed) await this.runHand();
    return this.match;
  }

  private async runHand(): Promise<void> {
    const r = nextHand4(this.match, this.setup);
    this.match = r.match;
    this.mems = { W: newMemory4('W'), N: newMemory4('N'), E: newMemory4('E') };
    this.pMem = newMemory4('S');
    this.observe(r.events);
    this.logEvents(r.events);
    await this.present(r.events);
    while (!this.destroyed) {
      const s = this.hand;
      if (s.phase === 'over') break;
      if (s.turn === 'S') await this.act(await this.playerTurn());
      else await this.botTurn(s.turn as VSeat);
    }
    if (this.destroyed) return;
    await this.endOfHand();
  }

  private observe(evs: GameEvent4[]): void {
    for (const s of BOT_SEATS) this.mems[s] = observe4(this.mems[s], evs, this.knobs[s].memory, this.botRng);
    this.pMem = observe4(this.pMem, evs, 1, this.autoRng);
  }

  private async act(a: Action4): Promise<void> {
    if (a.type === 'play' && a.seat === 'S') this.turnCtx = playerTurnCtx(this.hand, a.uid, this.deck);
    const r = matchAct4(this.match, a);
    this.match = r.match;
    this.observe(r.events);
    this.logEvents(r.events);
    await this.present(r.events);
  }

  private logEvents(evs: GameEvent4[]): void {
    this.log.push(...evs);
    if (this.log.length > 800) this.log.splice(0, this.log.length - 800);
    if (this.d.flags.debug) for (const e of evs) console.log('[event4]', e.t, e);
  }

  // ------------------------------------------------------------------ bots

  private async botTurn(seat: VSeat): Promise<void> {
    await this.d.waitUnpaused();
    const knobs = this.knobs[seat];
    const v0 = buildView4(this.hand, this.mems[seat], this.deck);
    this.d.hud.turn(seat);
    this.d.hud.seatThinking(seat, true);
    await wait(thinkTime4(knobs, v0.legal.length, this.thinkRng));
    await this.d.waitUnpaused();
    if (this.destroyed) return;
    const view = buildView4(this.hand, this.mems[seat], this.deck);
    const ch = chooseCard4(view, knobs, this.botRng);
    this.d.hud.seatThinking(seat, false);
    let card = ch.uid;
    if (TEAM_OF[seat] === 'vi') {
      const dec = chooseFora4(view, ch.uid, knobs);
      for (const f of dec.fore) {
        if (!canUseFora4(this.hand, seat, f.fora, f.targetSeat).ok) continue;
        await this.act({ type: 'fora', seat, fora: f.fora, targetSeat: f.targetSeat, targetUid: f.targetUid });
        if (this.destroyed || this.hand.turn !== seat) return;
      }
      card = dec.card;
    }
    if (this.destroyed || this.hand.turn !== seat) return;
    const legal = legalPlays4(this.hand, seat);
    if (!legal.includes(card)) card = legal[0];
    const signal = card === ch.uid && ch.signal && legalSignals4(this.hand, seat, card).includes(ch.signal) ? ch.signal : undefined;
    if (TEAM_OF[seat] === 'vi') {
      const pv = buildView4(this.hand, this.mems[seat], this.deck);
      const ev = playEvent4(new Eval4(pv, knobs), card);
      this.pendingVoice = ev ? { seat, ev } : null;
    }
    await this.act({ type: 'play', seat, uid: card, signal });
    this.botJustPlayed = performance.now();
    this.yourTurnShown = false;
  }

  // ------------------------------------------------------------------ player

  private refreshFore(): void {
    const s = this.hand;
    const me = s.seats.S;
    const slots = me.fore.map((id) => {
      const r = canUseFora4(s, 'S', id);
      const used = me.foreUsed.includes(id);
      return { id, state: used ? 'used' as const : r.ok ? 'ready' as const : 'unusable' as const, reason: r.reason };
    });
    this.d.hud.setFore(slots, this.targeting ?? this.seatTargeting);
  }

  private refreshForeIdle(): void {
    this.d.hud.setFore(this.run.fore.map((id) => ({ id, state: 'unusable' as const, reason: 'notYourTurn' })));
  }

  private leading(): boolean { const s = this.hand; return s.turn === 'S' && s.trick.plays.length === 0 && s.phase === 'play'; }

  private refreshSignals(): void {
    const s = this.hand;
    const lead = !!this.resolveInput && this.leading();
    const avail = { tucem: false, striso: false, volo: false } as Record<Signal, boolean>;
    if (lead) for (const u of legalPlays4(s, 'S')) for (const k of legalSignals4(s, 'S', u)) avail[k] = true;
    if (!lead) this.armed = null;
    this.d.hud.setSignals({ enabled: lead, available: avail, armed: this.armed });
  }

  /** Legal cards for the current mode (armed signal dims cards it doesn't fit). */
  private legalNow(): string[] {
    const s = this.hand;
    const legal = legalPlays4(s, 'S');
    if (!this.armed) return legal;
    return legal.filter((u) => legalSignals4(s, 'S', u).includes(this.armed!));
  }

  private playerTurn(): Promise<Action4> {
    this.d.hud.turn('S');
    this.lastActivity = performance.now();
    this.refreshFore();
    if (!this.tipSeen('signals') && this.leading()) this.tip('signals');
    if (this.d.flags.autoplay) {
      this.refreshSignals();
      return wait(200 + this.autoRng() * 200).then(() => this.autoAction());
    }
    return new Promise<Action4>((res) => {
      this.resolveInput = (a) => {
        this.resolveInput = null;
        this.d.anim.setLegal(null);
        this.armed = null;
        this.refreshSignals();
        this.d.hud.seatTargeting(null);
        res(a);
      };
      this.d.anim.setLegal(this.legalNow());
      this.refreshSignals();
    });
  }

  private autoAction(): Action4 {
    const s = this.hand;
    const view = buildView4(s, this.pMem, this.deck);
    const ch = chooseCard4(view, AUTOPLAY_KNOBS, this.autoRng);
    this.d.anim.setLegal(null);
    const legal = legalPlays4(s, 'S');
    const uid = legal.includes(ch.uid) ? ch.uid : legal[0];
    const signal = ch.signal && legalSignals4(s, 'S', uid).includes(ch.signal) ? ch.signal : undefined;
    return { type: 'play', seat: 'S', uid, signal };
  }

  /** Debug hook: play the i-th displayed card (optionally with a signal). */
  playIndex(i: number, signal?: Signal): boolean {
    const o = this.d.anim.playerHand[i];
    if (!o) return false;
    if (signal && this.armed !== signal) this.clickSignal(signal);
    return this.tryCard(o.uid, 'click');
  }

  useFora(id: ForaId, target?: number | Seat): boolean {
    if (!this.resolveInput) return false;
    this.clickFora(id);
    if (this.targeting && typeof target === 'number') return this.playIndex(target);
    if (this.seatTargeting && typeof target === 'string') { this.pickSeat(target as VSeat); return true; }
    return true;
  }

  private tryCard(uid: string, source: 'click' | 'drag'): boolean {
    if (!this.resolveInput || this.animating > 0) return false;
    const s = this.hand;
    const o = this.d.anim.cards.get(uid);
    if (!o) return false;
    if (this.seatTargeting) { this.d.ov.toast(t('toast.pickSeat')); return false; }
    if (this.targeting) {
      const f = this.targeting;
      if (!s.seats.S.hand.some((c) => c.uid === uid)) return false;
      this.targeting = null;
      document.body.classList.remove('targeting');
      this.resolveInput({ type: 'fora', seat: 'S', fora: f, targetUid: uid });
      return source === 'click';
    }
    const legal = legalPlays4(s, 'S');
    if (!legal.includes(uid)) {
      if (source === 'click') this.illegal(o, true);
      return false;
    }
    if (this.armed && !legalSignals4(s, 'S', uid).includes(this.armed)) {
      void this.d.anim.illegalShake(o);
      this.d.ov.toast(t('toast.signalIllegal'), 'warn');
      return false;
    }
    this.resolveInput({ type: 'play', seat: 'S', uid, signal: this.armed ?? undefined });
    return true;
  }

  private illegal(o: CardObject, shake: boolean): void {
    const s = this.hand;
    if (shake) void this.d.anim.illegalShake(o);
    else { this.d.audio.play('ui_error'); void this.d.anim.illegalShake(o); }
    const leadPlay = s.trick.plays[0];
    const lead = leadPlay ? this.byUid.get(leadPlay.uid) : undefined;
    let msg = t('reason.notYourTurn');
    if (s.turn === 'S' && s.trick.excludedLead === o.uid) msg = t('toast.excluded');
    else if (lead && s.turn === 'S') msg = s.trick.forcedTeam === 'mi' ? t('toast.mustHighest', { suit: SUIT_NAME[lead.suit] }) : t('toast.followSuit', { suit: SUIT_NAME[lead.suit] });
    this.d.ov.toast(msg, 'warn');
    this.voice.illegal();
  }

  private clickSignal(k: Signal): void {
    if (!this.resolveInput || this.animating > 0) return;
    if (!this.leading()) { this.d.ov.toast(t('signal.leadOnly'), 'warn'); return; }
    this.armed = this.armed === k ? null : k;
    this.d.audio.play('ui_click');
    this.d.anim.setLegal(this.legalNow());
    this.refreshSignals();
  }

  private clickFora(id: ForaId): void {
    if (!this.resolveInput || this.animating > 0) return;
    const s = this.hand;
    if (this.targeting === id || this.seatTargeting === id) { this.cancelTargeting(); return; }
    const r = canUseFora4(s, 'S', id);
    if (!r.ok) {
      this.d.audio.play('ui_error');
      this.d.ov.toast(t('reason.' + r.reason), 'warn');
      return;
    }
    if (SEAT_TARGET.includes(id)) {
      const seats = (['W', 'E'] as VSeat[]).filter((st) => canUseFora4(s, 'S', id, st).ok);
      if (seats.length === 0) { this.d.ov.toast(t('reason.nothingToReveal'), 'warn'); return; }
      this.seatTargeting = id;
      this.d.hud.seatTargeting(seats);
      this.refreshFore();
      this.d.ov.toast(t('toast.pickSeat'));
      return;
    }
    if (FORE[id].needsTarget) {
      this.targeting = id;
      document.body.classList.add('targeting');
      this.d.anim.setLegal(s.seats.S.hand.map((c) => c.uid), true);
      this.refreshFore();
      this.d.ov.toast(t('toast.target'));
      return;
    }
    this.resolveInput({ type: 'fora', seat: 'S', fora: id });
  }

  private pickSeat(seat: VSeat): void {
    const f = this.seatTargeting;
    if (!f || !this.resolveInput || seat === 'N') return;
    if (!canUseFora4(this.hand, 'S', f, seat).ok) { this.d.audio.play('ui_error'); return; }
    this.seatTargeting = null;
    this.d.hud.seatTargeting(null);
    this.resolveInput({ type: 'fora', seat: 'S', fora: f, targetSeat: seat });
  }

  private cancelTargeting(): void {
    if (!this.targeting && !this.seatTargeting) return;
    this.targeting = null;
    this.seatTargeting = null;
    document.body.classList.remove('targeting');
    this.d.hud.seatTargeting(null);
    if (this.resolveInput) this.d.anim.setLegal(this.legalNow());
    this.refreshFore();
  }

  private onKey(e: KeyboardEvent): void {
    if (this.destroyed) return;
    this.lastActivity = performance.now();
    if (e.key === 'Escape') {
      if (this.targeting || this.seatTargeting) { this.cancelTargeting(); return; }
      if (this.d.ov.closeTopModal()) return;
      this.d.openSettings();
      return;
    }
    if ((e.key === ' ' || e.key === 'Enter') && this.summaryResolve) { e.preventDefault(); this.summaryResolve(); return; }
    if ((e.key === 't' || e.key === 'T') && !this.d.ov.modalOpen) { this.d.hud.tracker.toggle(); return; }
    if (/^[0-9]$/.test(e.key) && !this.d.ov.modalOpen) {
      const n = e.key === '0' ? 9 : Number(e.key) - 1;
      this.playIndex(n);
    }
  }

  private onHover(card: CardObject | null): void {
    if (!card || !card.data.ukras) { this.d.hud.hideTooltip(); return; }
    const p = this.d.anim.screenOfCard(card);
    this.d.hud.ukrasTooltip(card.data.ukras, p.x, p.y - 150 * this.uiScale());
  }

  private uiScale(): number { return parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--ui-scale')) || 1; }

  private checkIdle(): void {
    if (!this.resolveInput || this.destroyed || this.d.flags.autoplay) return;
    const now = performance.now();
    if (!this.yourTurnShown && this.botJustPlayed && now - this.botJustPlayed > 1500 && now - this.lastActivity > 1500) {
      this.yourTurnShown = true;
      this.d.ov.toast(t('toast.yourTurn'));
    }
    if (now - this.lastActivity > 12000) {
      this.voice.idle();
      this.lastActivity = now - 6000;
    }
  }

  // ------------------------------------------------------------------ presentation

  private card(uid: string): Card4 {
    const c = this.byUid.get(uid);
    if (!c) throw new Error('card not found ' + uid);
    return c;
  }

  private obj(uid: string): CardObject { return this.d.anim.cards.get(uid) ?? this.d.anim.obtain(this.card(uid)); }

  private async present(events: GameEvent4[]): Promise<void> {
    this.animating++;
    try {
      this.phaseTag = 'events';
      for (const e of events) {
        if (this.destroyed) return;
        await this.presentOne(e);
      }
    } finally {
      this.animating--;
      if (this.animating === 0) this.phaseTag = '';
      this.refreshTracker();
    }
  }

  private playedBy = new Map<string, Team>();

  /** Odigrano tracker (§19.5.1): played (team dot), in my hand, revealed in another hand, unknown. */
  private refreshTracker(): void {
    const s = this.match?.hand;
    if (!s || this.destroyed) return;
    for (const p of s.trick.plays) this.playedBy.set(p.uid, TEAM_OF[p.seat]);
    const inHand = new Set(s.seats.S.hand.map((c) => c.uid));
    const played = new Set([...s.table, ...s.teams.mi.pile, ...s.teams.vi.pile].map((c) => c.uid));
    const revealed = new Set<string>();
    for (const seat of BOT_SEATS) for (const c of knownCards(s, seat, 'mi')) revealed.add(c.uid);
    this.d.hud.tracker.update(this.setup.deck.map((c) => {
      const u = 'p:' + (c.slot ?? `${c.suit}_${c.rank}`);
      const st = inHand.has(u) ? 'hand' : played.has(u) ? 'played' : revealed.has(u) ? 'revealed' : 'unknown';
      return { card: c, state: st, team: st === 'played' ? this.playedBy.get(u) : undefined };
    }));
  }

  private perk(): string | null { return CHARACTERS[this.chars.N].perk; }

  /** Viđeno strips: cards of a seat known to Mi that are still in that hand. */
  private refreshSeen(pop?: string[]): void {
    const s = this.hand;
    for (const seat of BOT_SEATS) {
      const cards = knownCards(s, seat, 'mi').filter((c) => s.seats[seat].hand.some((x) => x.uid === c.uid));
      this.d.hud.setSeatSeen(seat, cards, pop?.find((u) => cards.some((c) => c.uid === u)));
    }
  }

  private refreshVoids(): void {
    if (this.perk() !== 'pamcenje') return;
    const s = this.hand;
    this.d.hud.setVoids('W', s.voidKnown.W);
    this.d.hud.setVoids('E', s.voidKnown.E);
  }

  private name(seat: Seat): string {
    if (seat === 'S') return getLang() === 'hr' ? 'Ti' : 'You';
    return CHARACTERS[this.chars[seat as VSeat]].name;
  }

  private async presentOne(e: GameEvent4): Promise<void> {
    const anim = this.d.anim;
    const hud = this.d.hud;
    switch (e.t) {
      case 'handStarted': {
        anim.clearTable();
        this.playedBy.clear();
        this.voice.newHand();
        this.live = { mi: 0, vi: 0 };
        this.partnerAkuza = 0;
        hud.setLive(0, 0);
        hud.setHandInfo(this.match.target, e.handNo);
        for (const seat of BOT_SEATS) { hud.setSeatSeen(seat, []); hud.setVoids(seat, []); }
        const base = this.setup.rakija.S;
        const wasEmpty = this.rakijaShown < base;
        this.rakijaShown = base;
        hud.setRakija(base, base, e.handNo > 1 && wasEmpty ? 'fill' : null);
        if (e.handNo > 1 && wasEmpty) this.d.audio.play('rakija_pour');
        this.trickCtx = { playerUsedDuplo: false };
        this.refreshForeIdle();
        this.refreshSignals();
        if (e.handNo === 1 || (this.resume && e.handNo === this.resume.handNo)) this.voice.matchStart();
        break;
      }
      case 'dealt': {
        this.phaseTag = 'deal';
        const hands = {} as Record<Seat, Card4[]>;
        for (const seat of ['S', 'W', 'N', 'E'] as Seat[]) hands[seat] = e.hands[seat].map((u) => this.card(u));
        await anim.deal4(hands, this.hand.dealer);
        break;
      }
      case 'revealed': {
        if (e.to === 'mi') {
          if (e.via === 'pogled' || e.via === 'ribarsko' || e.via === 'postar') {
            if (e.via === 'ribarsko') this.d.ov.toast(t('toast.ribarsko'));
            if (e.via === 'postar') this.d.ov.toast(t('toast.postar'));
            this.phaseTag = 'reveal';
            await anim.peekReveal(e.uids);
          }
          if (e.via === 'namjesteno') this.d.ov.toast(t('toast.namjesteno'));
          this.refreshSeen(e.uids);
        } else if (e.via === 'pogled') {
          anim.botPeek(e.uids);
          this.d.ov.toast(e.seat === 'S' ? t('toast.seatPeeked', { name: this.name(this.lastForaSeat ?? 'W') }) : t('toast.partnerPeeked', { name: this.name(this.lastForaSeat ?? 'W') }), 'warn');
          await wait(600);
        }
        break;
      }
      case 'akuza':
        await this.presentAkuza(e);
        break;
      case 'turn':
        if (e.seat === 'S') { this.refreshFore(); hud.turn('S'); } else hud.turn(e.seat as VSeat);
        break;
      case 'rakija':
        if (e.seat === 'S') {
          const prev = this.rakijaShown;
          this.rakijaShown = e.value;
          hud.setRakija(e.value, this.setup.rakija.S, e.value < prev ? 'drain' : 'fill');
          if (e.value > prev) this.d.audio.play('rakija_pour');
        }
        break;
      case 'foraUsed':
        await this.presentFora(e);
        break;
      case 'cardPlayed': {
        this.playedBy.set(e.uid, TEAM_OF[e.seat]);
        const o = this.obj(e.uid);
        const c = o.data;
        const strong = c.rank === '3' || c.ukras === 'pozlaceno' || c.ukras === 'nabruseno';
        if (e.drunk) this.d.ov.toast(t('toast.seatDrunk', { name: this.name(e.seat) }));
        this.phaseTag = 'play-' + e.seat;
        if (e.seat === 'S') this.d.hud.hideTooltip();
        await anim.seatToTrick(o, e.seat, e.pos - 1, strong);
        if (e.seat !== 'S') this.refreshSeen();
        if (this.pendingVoice && this.pendingVoice.seat === e.seat) { this.voice.speak(this.pendingVoice.seat, this.pendingVoice.ev); this.pendingVoice = null; }
        break;
      }
      case 'signal': {
        const o = anim.cards.get(this.hand.trick.plays[0]?.uid ?? '') ?? [...anim.cards.values()].find((x) => x.uid === this.hand.trick.plays[0]?.uid);
        if (o) anim.pinSignal(o, e.kind);
        this.d.audio.play(e.kind === 'tucem' ? 'table_knock' : e.kind === 'striso' ? 'card_slide' : 'card_place');
        if (e.kind === 'tucem') this.d.fx.shake(0.03, 160);
        const p = anim.trickScreen(e.seat);
        void hud.callout(this.d.ov.fxLayer, p.x, p.y - 70 * this.uiScale(), e.kind, e.seat === 'S' ? undefined : this.name(e.seat));
        if (e.seat === 'N') this.d.ov.toast(t('toast.partnerSignal', { name: this.name('N'), signal: t('signal.' + e.kind) }));
        this.voice.signal(e.seat, e.kind);
        if (e.kind === 'volo') this.refreshVoids();
        await wait(350);
        break;
      }
      case 'leadReturned': {
        const o = anim.cards.get(e.uid);
        if (o) await anim.returnToHand4(o, e.seat);
        break;
      }
      case 'swapped': {
        const mine = anim.cards.get(e.a);
        const theirs = anim.cards.get(e.b);
        if (mine && theirs) { this.phaseTag = 'swap'; await anim.swapWithPartner(mine, theirs); }
        this.d.ov.toast(t('toast.zamjena'));
        break;
      }
      case 'trickResolved':
        await this.presentTrick(e);
        break;
      case 'handScored':
        this.lastBreakdown = e.breakdown;
        this.handsLog.push(e.breakdown);
        if (this.match.status !== 'over') this.voice.handEnd(e.breakdown);
        break;
      default:
        break;
    }
  }

  private lastForaSeat: Seat | null = null;

  private async presentAkuza(e: Extract<GameEvent4, { t: 'akuza' }>): Promise<void> {
    const hud = this.d.hud;
    if (!this.tipSeen('akuza')) this.tip('akuza');
    this.voice.akuza(e.seat, e.combos);
    if (e.seat === 'S') this.d.onAkuza(e.combos.length);
    if (e.seat === 'N') this.partnerAkuza += e.total;
    const who = e.seat === 'S' ? (getLang() === 'hr' ? 'Ti akužaš' : 'You declare') : this.name(e.seat);
    const uids = [...new Set(e.combos.flatMap((c) => c.uids))];
    this.phaseTag = 'akuza';
    const side = e.team === 'mi' ? 'player' : 'bot';
    let score = hud.shown[side];
    await this.d.anim.akuzaShow4(uids, e.seat, async () => {
      for (const c of e.combos) {
        this.d.audio.play('akuza_fanfare');
        this.d.fx.confettiBurst(new THREE.Vector3(0, 3.2, 1.0));
        const label = c.label + (c.glasno ? ` (Glasno +${c.glasno})` : '');
        score += c.points;
        const target = score;
        const p = hud.banner(this.d.ov.fxLayer, label, c.points, who, e.team === 'vi', e.combos.length > 1 ? 900 : 1400);
        void wait(500).then(() => hud.countTo(side, target));
        await p;
      }
    });
    this.refreshSeen();
  }

  private async presentFora(e: Extract<GameEvent4, { t: 'foraUsed' }>): Promise<void> {
    const anim = this.d.anim;
    this.lastForaSeat = e.seat;
    if (e.seat === 'S' && e.fora === 'duplo_ili_nista') this.trickCtx.playerUsedDuplo = true;
    this.voice.fora(e.seat, e.fora, e.targetSeat);
    this.phaseTag = 'fora-' + e.seat;
    await this.foraFly(e.seat, e.fora);
    this.d.audio.play('glass_clink');
    const tgt = e.targetSeat ? this.name(e.targetSeat) : '';
    switch (e.fora) {
      case 'tucem': this.d.audio.play('table_knock'); this.d.ov.toast(t('toast.tucem')); this.d.fx.shake(0.04, 200); break;
      case 'duplo_ili_nista': this.d.ov.toast(t('toast.duplo')); break;
      case 'krivi_racun': this.d.ov.toast(t('toast.krivi')); break;
      case 'ti_otvaraj': this.d.ov.toast(t('toast.leads', { name: this.name(this.hand.trick.leader) })); break;
      case 'vrati': this.d.ov.toast(t('toast.vrati', { name: this.name(this.hand.trick.leader) })); break;
      case 'napij_ga': this.d.ov.toast(t('toast.seatDrunk', { name: tgt || this.name('S') })); break;
      case 'trica_iz_rukava': {
        this.d.ov.toast(t('toast.trica'));
        const o = e.targetUid ? anim.cards.get(e.targetUid) : undefined;
        if (o && e.seat === 'S') anim.flashGlow(o, new THREE.Color('#FFD27A'), 1200, 1);
        break;
      }
      default: break;
    }
    if (e.seat === 'S') this.refreshFore();
  }

  /** A27 for any seat: the fora card flies from the slot / the seat portrait to the centre and dissolves. */
  private async foraFly(seat: Seat, id: ForaId): Promise<void> {
    this.d.audio.play('fora_use');
    const u = this.uiScale();
    const W = 104 * u, H = 166 * u;
    const from = seat === 'S' ? this.d.hud.slotRect(id) : this.d.hud.seatRect(seat as VSeat);
    const x0 = from ? from.left + from.width / 2 : window.innerWidth / 2;
    const y0 = from ? from.top + from.height / 2 : 100;
    const name = getLang() === 'hr' ? FORE[id].nameHr : FORE[id].nameEn;
    const el = h('div', { class: 'fora-fly' + (TEAM_OF[seat] === 'vi' ? ' bot' : ''), style: `left:${x0 - W / 2}px;top:${y0 - H / 2}px` },
      h('div', { class: 'art', style: `background-image:url(${art.fora(id)})` }), h('div', { class: 'ribbon', text: name }));
    this.d.ov.fxLayer.append(el);
    const cx = window.innerWidth / 2 - W / 2, cy = window.innerHeight * 0.42 - H / 2;
    await new Promise<void>((res) => {
      const tl = gsap.timeline({ onComplete: () => { el.remove(); res(); } });
      gsap.set(el, { filter: 'brightness(1) blur(0px)' });
      tl.to(el, { left: cx, top: cy, scale: 1.4, duration: 0.35, ease: 'power2.out' });
      tl.to(el, { filter: 'brightness(1.25) blur(0px)', duration: 0.3, ease: 'sine.inOut' });
      tl.to(el, { opacity: 0, scale: 1.7, filter: 'brightness(2.2) blur(5px)', duration: 0.4, ease: 'power2.in' });
    });
  }

  private async presentTrick(e: Extract<GameEvent4, { t: 'trickResolved' }>): Promise<void> {
    const anim = this.d.anim;
    const cards = (uid: string) => this.card(uid);
    const winPlay = e.plays.find((p) => p.seat === e.winner)!;
    // an opponent's A captured by Mi (or Mi's A by Vi): the strong FX
    const aceCaptured = e.plays.some((p) => TEAM_OF[p.seat] !== e.team && cards(p.uid).rank === 'A');
    if (aceCaptured) {
      this.d.fx.shake(0.06, 250);
      this.d.fx.sparks(new THREE.Vector3(TRICK4_CENTER.x, 0.1, TRICK4_CENTER.z));
      this.d.fx.flash();
      this.d.audio.play('card_slam_strong', { volume: 0.6 });
    }
    // voice: misplay → partner → opponents, at most one line
    const sPlayed = e.plays.some((p) => p.seat === 'S');
    const misplay = sPlayed && this.turnCtx ? detectMisplay(this.turnCtx, e.team) : null;
    this.voice.first(trickEndCandidates4(e, { cards, misplay, playerUsedDuplo: this.trickCtx.playerUsedDuplo }));
    this.turnCtx = null;
    this.trickCtx = { playerUsedDuplo: false };
    // A15 pops
    const sp = anim.screenOf(new THREE.Vector3(TRICK4_CENTER.x, 0.3, TRICK4_CENTER.z));
    const bonusFor = (team: Team) => e.bonus.filter((b) => b.team === team && b.points).map((b) => `${getLang() === 'hr' ? UKRASI[b.ukras].nameHr : UKRASI[b.ukras].nameEn} +${b.points}`);
    let k = 0;
    const teams = (['mi', 'vi'] as Team[]).filter((tm) => e.thirdsTo[tm] > 0 || bonusFor(tm).length || e.ultima?.team === tm);
    for (const tm of teams) {
      const lines = bonusFor(tm);
      if (e.ultima && e.ultima.team === tm) lines.push(`Ultima +${e.ultima.points}`);
      const text = e.thirdsTo[tm] > 0 ? `+${fmtThirds(e.thirdsTo[tm])}` : lines.shift() ?? '';
      const off = teams.length > 1 ? (k++ === 0 ? -0.5 : 0.5) : 0;
      this.d.hud.pop(this.d.ov.fxLayer, sp.x + off * 140 * this.uiScale(), sp.y - 30, text, lines.length ? lines.join(' · ') : null, tm === 'mi' ? '#FFD27A' : '#C0533A');
    }
    this.live.mi += e.thirdsTo.mi;
    this.live.vi += e.thirdsTo.vi;
    this.d.hud.setLive(this.live.mi, this.live.vi);
    for (const b of e.bonus) {
      if (b.soldi && b.team === 'mi') {
        const total = this.d.onSoldi(b.soldi);
        this.d.audio.play('coin_single');
        this.d.hud.bumpSoldi(total);
        this.d.ov.toast(t('toast.soldi', { n: b.soldi }));
      }
    }
    this.phaseTag = 'trick';
    await anim.resolveTrick4(winPlay.uid, e.plays.map((p) => p.uid), e.team);
    this.refreshVoids();
  }

  private async endOfHand(): Promise<void> {
    const b = this.lastBreakdown;
    const m = this.match;
    this.d.hud.turn(null);
    this.d.onHandEnd({ scores: { ...m.scores }, handNo: m.handNo, dealer: m.dealer, akuzaPointsMi: m.akuzaPointsMi });
    if (!b) return;
    await wait(250);
    await new Promise<void>((res) => {
      let el: HTMLElement | null = null;
      let timer = 0;
      const finish = () => {
        if (!this.summaryResolve) return;
        this.summaryResolve = null;
        window.clearTimeout(timer);
        if (el) gsap.to(el, { opacity: 0, duration: 0.25, onComplete: () => el?.remove() });
        res();
      };
      el = lightSummary4({ b, scores: m.scores, target: m.target, partnerAkuza: this.partnerAkuza, matchOver: m.status === 'over', onDone: finish });
      this.summaryResolve = finish;
      this.d.ov.fxLayer.append(el);
      // auto-continue after 3500 ms (§19.5.2); the deciding hand waits a little less before the match end
      timer = window.setTimeout(finish, this.d.flags.autonav ? 1400 : m.status === 'over' ? 2400 : 3500);
    });
    await Promise.all([this.d.hud.countTo('player', m.scores.mi), this.d.hud.countTo('bot', m.scores.vi)]);
    await wait(300);
  }

  // ------------------------------------------------------------------ voice + misc

  private say(seat: VSeat, line: import('../data/voiceLines').VoiceLine): { durationMs: number; stop(fadeMs: number): void } {
    const id = this.chars[seat];
    const c = CHARACTERS[id];
    const h2 = this.d.audio.playVoice(c.persona, line.id, c.rate);
    const hold = Math.max(2200, h2.durationMs + 600);
    const gloss = this.d.settings().subtitles ? line.glossEn : null;
    this.d.hud.seatBubble(seat, line.subtitleHr, gloss, hold, line.mood);
    if (line.mood === 'angry' && Math.random() < 0.4) this.d.audio.play('glass_slam', { delayMs: 150 });
    return h2;
  }

  private tipSeen(id: string): boolean { return this.d.settings().tipsSeen.includes(id); }
  private tip(id: string): void {
    this.d.markTip(id);
    const key = 'tip.' + id;
    const txt = t(key);
    if (txt === key) return;
    void wait(400).then(() => this.d.ov.toast(txt, 'tip', 3200));
  }

  /** Debug snapshot. */
  snapshot(): Record<string, unknown> {
    const s = this.match?.hand;
    return {
      mode: 'partneri',
      chars: { ...this.chars },
      scores: this.match ? { ...this.match.scores } : null,
      target: this.match?.target,
      matchStatus: this.match?.status,
      handNo: this.match?.handNo,
      phase: s?.phase,
      turn: s?.turn,
      leader: s?.trick.leader,
      trickNo: s?.trick.no,
      trickPlays: s?.trick.plays.map((p) => `${p.seat}:${p.uid}`),
      signal: s?.trick.signal,
      signalsLog: s?.signalsLog,
      awaitingInput: !!this.resolveInput,
      leading: s ? this.leading() : false,
      armed: this.armed,
      animating: this.animating,
      playerHand: this.d.anim.playerHand.map((o) => o.uid),
      playerHandScreen: this.d.anim.playerHand.map((o) => this.d.anim.screenOfCard(o)),
      seatHandSizes: s ? { S: s.seats.S.hand.length, W: s.seats.W.hand.length, N: s.seats.N.hand.length, E: s.seats.E.hand.length } : null,
      fanSizes: { W: this.d.anim.seatHands.W.length, N: this.d.anim.seatHands.N.length, E: this.d.anim.seatHands.E.length },
      legal: s && s.turn === 'S' ? legalPlays4(s, 'S') : [],
      legalSignals: s && s.turn === 'S' && s.trick.plays.length === 0 ? Object.fromEntries(legalPlays4(s, 'S').map((u) => [u, legalSignals4(s, 'S', u)])) : {},
      rakija: s?.seats.S.rakija,
      fore: s?.seats.S.fore,
      foreUsed: s?.seats.S.foreUsed,
      voiceLog: this.voice.log.slice(-12),
      arbiter: { lines: this.voice.arbiter.linesThisHand, perSpeaker: { ...this.voice.arbiter.perSpeaker } },
      summaryOpen: !!this.summaryResolve,
      phaseTag: this.phaseTag,
    };
  }

  continueSummary(): void { this.summaryResolve?.(); }
  forceEnd(): void { this.destroyed = true; this.resolveInput = null; }
}
