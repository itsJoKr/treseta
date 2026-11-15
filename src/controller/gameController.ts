// Orchestrates engine <-> bot <-> animator <-> UI <-> audio (§16.4).
import * as THREE from 'three';
import gsap from 'gsap';
import type { AudioManager } from '../audio/audio';
import { VoiceDirector } from '../audio/voiceDirector';
import { akuzaBotLines, badDraw, botPlayEvent, handEndEvent, trickEndEvent } from '../audio/voiceTriggers';
import { getLang, t } from '../data/strings';
import type { VoiceEventType } from '../data/voiceEvents';
import type { VoiceLine } from '../data/voiceLines';
import { chooseCard, chooseFora, choosePending, Eval, thinkTime } from '../game/bot';
import { buildView, newMemory, observe } from '../game/botMemory';
import type { BotMemory } from '../game/botMemory';
import { BASE_THIRDS, fmtThirds, SUIT_NAME } from '../game/cards';
import { canUseFora, FORE } from '../game/fore';
import { firstDealer, matchAct, nextHand, startMatch } from '../game/match';
import { dvobojOpponent } from '../game/dvobojLadder';
import type { DvobojOpponent } from '../game/dvobojLadder';
import { applyMatchMods } from '../game/forge';
import { DVOBOJ_LADDER } from '../game/ladders';
import { matchTarget } from '../game/matchConfig';
import { toHeld } from '../game/rules';
import type { MatchSetup, MatchState } from '../game/match';
import type { BotKnobs } from '../game/opponents';
import { rngFor } from '../game/rng';
import type { Rng } from '../game/rng';
import type { MatchSave, RunState } from '../game/run';
import { findCard, legalPlays } from '../game/rules';
import type { Action, CardInst, DeckCard, ForaId, GameEvent, HandState, Side, SideBreakdown } from '../game/types';
import { other } from '../game/types';
import { UKRASI } from '../game/ukrasi';
import { wait } from '../render/animator';
import type { Animator4 } from '../render/animator4';
import type { CardObject, CardTextures } from '../render/cardMesh';
import type { FX } from '../render/fx';
import { Input } from '../render/input';
import { TRICK_CENTER } from '../render/layout';
import type { SceneManager } from '../render/scene';
import { art, h } from '../ui/dom';
import type { Hud } from '../ui/hud';
import type { Overlay } from '../ui/overlay';
import { lightSummary } from '../ui/summary4';

export interface ControllerDeps {
  sm: SceneManager;
  anim: Animator4;
  fx: FX;
  audio: AudioManager;
  hud: Hud;
  ov: Overlay;
  textures: CardTextures;
  settings: () => { subtitles: boolean; tipsSeen: string[]; language: 'hr' | 'en' };
  markTip: (id: string) => void;
  flags: { debug: boolean; autoplay: boolean; autonav: boolean };
  isPaused: () => boolean;
  waitUnpaused: () => Promise<void>;
  onHandEnd: (save: Omit<MatchSave, 'botMemory'>) => void;
  onSoldi: (n: number) => number; // returns new total
  onAkuza: (n: number) => void;
  openSettings: () => void;
  /** persist settings (tracker open state) */
  saveSettings?: () => void;
}

const AUTOPLAY_KNOBS: BotKnobs = { memory: 1, mistakeRate: 0, saveMasters: true, huntAce: true, pimcMaxCards: 4, pimcSamples: 10, thinkMs: [250, 500] };

export class GameController {
  match!: MatchState;
  private setup!: MatchSetup;
  private opp: DvobojOpponent;
  /** the one table deck of this match (public list for the bot views) */
  private tableDeck: DeckCard[] = [];
  /** per-hand breakdowns for the match-end table (§19.5.2) */
  handsLog: Record<Side, SideBreakdown>[] = [];
  private memory: BotMemory = newMemory('bot');
  private pMemory: BotMemory = newMemory('player');
  private botRng: Rng;
  private autoRng: Rng;
  private thinkRng: Rng;
  director: VoiceDirector;
  private input: Input;
  private resolveInput: ((a: Action) => void) | null = null;
  private targeting: ForaId | null = null;
  private seen: CardInst[] = [];
  private live: Record<Side, number> = { player: 0, bot: 0 };
  private rakijaShown = 0;
  private lastBreakdown: Record<Side, SideBreakdown> | null = null;
  private lastActivity = performance.now();
  private botJustPlayed = 0;
  private yourTurnShown = false;
  private trickCtx = { playerUsedDuplo: false };
  private destroyed = false;
  private animating = 0;
  private keyHandler: (e: KeyboardEvent) => void;
  private idleTimer: number;
  private chipUpdater: () => void;
  private summaryResolve: (() => void) | null = null;
  playerDeck: DeckCard[];
  log: GameEvent[] = [];
  /** What is being presented right now (debug/test hook). */
  phaseTag = '';

  constructor(private d: ControllerDeps, private run: RunState, private resume?: MatchSave) {
    this.opp = dvobojOpponent(run.ladderIndex);
    this.playerDeck = run.deck.map((c) => ({ ...c }));
    this.botRng = rngFor(run.seed, 'bot', run.ladderIndex, run.attempt);
    this.autoRng = rngFor(run.seed, 'auto', run.ladderIndex, run.attempt);
    this.thinkRng = rngFor(run.seed, 'think', run.ladderIndex, run.attempt);
    const vrng = rngFor(run.seed, 'voice', run.ladderIndex, run.attempt);
    this.director = new VoiceDirector({
      now: () => performance.now(),
      rng: vrng,
      persona: this.opp.persona,
      cussMult: this.opp.cussMult,
      say: (line, prio) => this.say(line, prio),
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
    d.anim.setBotFaces(d.flags.debug);
    d.hud.onFora = (id) => this.clickFora(id);
    d.hud.tracker.set(!!(d.settings() as { trackerOpen?: boolean }).trackerOpen);
    d.hud.tracker.onToggle = (open) => { (d.settings() as { trackerOpen?: boolean }).trackerOpen = open; d.saveSettings?.(); };
    this.chipUpdater = () => this.updateChips();
    d.sm.onUpdate(this.chipUpdater);
  }

  destroy(): void {
    this.destroyed = true;
    window.removeEventListener('keydown', this.keyHandler);
    window.clearInterval(this.idleTimer);
    this.input.dispose();
    this.d.sm.offUpdate(this.chipUpdater);
    this.resolveInput = null;
    this.d.anim.setLegal(null);
    this.d.anim.clearTable();
    this.director.enabled = false;
  }

  // ------------------------------------------------------------------ match

  async runMatch(): Promise<MatchState> {
    const run = this.run;
    this.setup = {
      runSeed: run.seed, ladderIndex: run.ladderIndex, attempt: run.attempt,
      deck: (this.tableDeck = applyMatchMods(this.playerDeck, DVOBOJ_LADDER[run.ladderIndex], run.seed, 'dvoboj', run.ladderIndex, run.attempt)),
      fore: { player: run.fore.slice(), bot: this.opp.fore.slice() },
      rakija: { player: run.rakijaBase, bot: this.opp.rakija },
    };
    this.match = startMatch(this.opp.id as never, this.resume ? this.resume : undefined, matchTarget('dvoboj'), firstDealer(run.ladderIndex));
    const hud = this.d.hud;
    hud.setOpponent(this.opp.id, run.ladderIndex);
    hud.setScores(this.match.scores.player, this.match.scores.bot);
    hud.setSoldi(run.soldi);
    hud.setLive(0, 0);
    hud.setSeen([]);
    void this.d.audio.preloadVoice(this.opp.persona);
    while (this.match.status !== 'over' && !this.destroyed) {
      await this.runHand();
    }
    return this.match;
  }

  private async runHand(): Promise<void> {
    const r = nextHand(this.match, this.setup);
    this.match = r.match;
    this.memory = observe(newMemory('bot'), r.events, this.opp.knobs.memory, this.botRng);
    this.pMemory = observe(newMemory('player'), r.events, 1, this.autoRng);
    this.logEvents(r.events);
    await this.present(r.events);
    while (!this.destroyed) {
      const s = this.hand;
      if (s.phase === 'over') break;
      if (s.phase === 'pending' && s.pending) {
        if (s.pending.side === 'bot') {
          const view = buildView(s, this.memory, this.tableDeck);
          await this.act({ type: 'resolvePending', side: 'bot', ...choosePending(view) });
        } else {
          await this.act(await this.playerPending());
        }
        continue;
      }
      if (s.turn === 'bot') await this.botTurn();
      else await this.act(await this.playerTurn());
    }
    if (this.destroyed) return;
    await this.endOfHand();
  }

  get hand(): HandState { return this.match.hand!; }

  private async act(a: Action): Promise<void> {
    const r = matchAct(this.match, a);
    this.match = r.match;
    this.memory = observe(this.memory, r.events, this.opp.knobs.memory, this.botRng);
    this.pMemory = observe(this.pMemory, r.events, 1, this.autoRng);
    this.logEvents(r.events);
    await this.present(r.events);
  }

  private logEvents(evs: GameEvent[]): void {
    this.log.push(...evs);
    if (this.log.length > 600) this.log.splice(0, this.log.length - 600);
    if (this.d.flags.debug) for (const e of evs) console.log('[event]', e.t, e);
  }

  // ------------------------------------------------------------------ bot

  private async botTurn(): Promise<void> {
    await this.d.waitUnpaused();
    const s = this.hand;
    const view0 = buildView(s, this.memory, this.tableDeck);
    this.d.hud.thinking(true);
    await wait(thinkTime(this.opp.knobs, view0.legal.length, this.thinkRng));
    await this.d.waitUnpaused();
    if (this.destroyed) return;
    const view = buildView(this.hand, this.memory, this.tableDeck);
    const tentative = chooseCard(view, this.opp.knobs, this.botRng);
    const dec = chooseFora(view, tentative);
    this.d.hud.thinking(false);
    for (const f of dec.fore) {
      if (!canUseFora(this.hand, 'bot', f.fora).ok) continue;
      await this.act({ type: 'fora', side: 'bot', fora: f.fora, targetUid: f.targetUid });
    }
    if (this.destroyed || this.hand.turn !== 'bot') return;
    let card = dec.card;
    const legal = legalPlays(this.hand, 'bot');
    if (!legal.includes(card)) card = legal[0];
    const pv = buildView(this.hand, this.memory, this.tableDeck);
    const ev = botPlayEvent(new Eval(pv), card);
    this.pendingBotVoice = ev;
    await this.act({ type: 'play', side: 'bot', uid: card });
    this.botJustPlayed = performance.now();
    this.yourTurnShown = false;
  }

  private pendingBotVoice: VoiceEventType | null = null;

  // ------------------------------------------------------------------ player

  private refreshFore(): void {
    const s = this.hand;
    const slots = s.sides.player.fore.map((id) => {
      const r = canUseFora(s, 'player', id);
      const used = s.sides.player.foreUsed.includes(id);
      return { id, state: used ? 'used' as const : r.ok ? 'ready' as const : 'unusable' as const, reason: r.reason };
    });
    this.d.hud.setFore(slots, this.targeting);
  }

  private playerTurn(): Promise<Action> {
    const s = this.hand;
    const legal = legalPlays(s, 'player');
    this.d.anim.setLegal(legal);
    this.refreshFore();
    this.lastActivity = performance.now();
    if (!this.tipSeen('follow')) this.tip('follow');
    const anyFora = s.sides.player.fore.some((f) => canUseFora(s, 'player', f).ok);
    if (anyFora && !this.tipSeen('fora')) this.tip('fora');
    if (this.d.flags.autoplay) {
      return wait(200 + this.autoRng() * 200).then(() => this.autoAction());
    }
    return new Promise<Action>((res) => {
      this.resolveInput = (a) => {
        this.resolveInput = null;
        this.d.anim.setLegal(null);
        res(a);
      };
    });
  }

  private autoAction(): Action {
    const s = this.hand;
    const view = buildView(s, this.pMemory, this.tableDeck);
    const tentative = chooseCard(view, AUTOPLAY_KNOBS, this.autoRng);
    const dec = chooseFora(view, tentative);
    this.d.anim.setLegal(null);
    for (const f of dec.fore) {
      if (canUseFora(s, 'player', f.fora).ok) return { type: 'fora', side: 'player', fora: f.fora, targetUid: f.targetUid };
    }
    return { type: 'play', side: 'player', uid: legalPlays(s, 'player').includes(dec.card) ? dec.card : legalPlays(s, 'player')[0] };
  }

  /** Public for the debug hook: play the i-th card of the displayed hand. */
  playIndex(i: number): boolean {
    const o = this.d.anim.playerHand[i];
    if (!o) return false;
    return this.tryCard(o.uid, 'click');
  }

  useFora(id: ForaId, targetIndex?: number): boolean {
    if (!this.resolveInput) return false;
    this.clickFora(id);
    if (this.targeting && targetIndex !== undefined) return this.playIndex(targetIndex);
    return true;
  }

  private tryCard(uid: string, source: 'click' | 'drag'): boolean {
    if (!this.resolveInput || this.animating > 0) return false;
    const s = this.hand;
    const o = this.d.anim.cards.get(uid);
    if (!o) return false;
    if (this.targeting) {
      const f = this.targeting;
      if (!s.sides.player.hand.some((c) => c.uid === uid)) return false;
      this.targeting = null;
      document.body.classList.remove('targeting');
      this.resolveInput({ type: 'fora', side: 'player', fora: f, targetUid: uid });
      return source === 'click';
    }
    const legal = legalPlays(s, 'player');
    if (!legal.includes(uid)) {
      if (source === 'click') this.illegal(o, true);
      return false;
    }
    this.resolveInput({ type: 'play', side: 'player', uid });
    return true;
  }

  private illegal(o: CardObject, shake: boolean): void {
    const s = this.hand;
    if (shake) void this.d.anim.illegalShake(o);
    else { this.d.audio.play('ui_error'); void this.d.anim.illegalShake(o); }
    const lead = s.table.find((c) => c.uid === s.trick.lead?.uid);
    let msg = t('reason.notYourTurn');
    if (s.phase === 'lead' && s.trick.excludedLead === o.uid) msg = t('toast.excluded');
    else if (lead) msg = s.trick.forcedHighest ? t('toast.mustHighest', { suit: SUIT_NAME[lead.suit] }) : t('toast.followSuit', { suit: SUIT_NAME[lead.suit] });
    this.d.ov.toast(msg, 'warn');
    this.director.onEvent('player_illegal');
  }

  private clickFora(id: ForaId): void {
    if (!this.resolveInput || this.animating > 0) return;
    const s = this.hand;
    if (this.targeting === id) { this.cancelTargeting(); return; }
    const r = canUseFora(s, 'player', id);
    if (!r.ok) {
      this.d.audio.play('ui_error');
      this.d.ov.toast(t('reason.' + r.reason), 'warn');
      return;
    }
    if (FORE[id].needsTarget) {
      this.targeting = id;
      document.body.classList.add('targeting');
      this.d.anim.setLegal(s.sides.player.hand.map((c) => c.uid), true);
      this.refreshFore();
      this.d.ov.toast(t('toast.target'));
      return;
    }
    this.resolveInput({ type: 'fora', side: 'player', fora: id });
  }

  private cancelTargeting(): void {
    if (!this.targeting) return;
    this.targeting = null;
    document.body.classList.remove('targeting');
    if (this.resolveInput) this.d.anim.setLegal(legalPlays(this.hand, 'player'));
    this.refreshFore();
  }

  private onKey(e: KeyboardEvent): void {
    if (this.destroyed) return;
    this.lastActivity = performance.now();
    if (e.key === 'Escape') {
      if (this.targeting) { this.cancelTargeting(); return; }
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
      this.director.onEvent('idle');
      this.lastActivity = now - 6000; // re-check later; the director cooldown limits frequency
    }
  }

  private playerPending(): Promise<Action> {
    const p = this.hand.pending!;
    if (this.d.flags.autoplay) {
      const view = buildView(this.hand, this.pMemory, this.tableDeck);
      return wait(300).then(() => ({ type: 'resolvePending', side: 'player', ...choosePending(view) }) as Action);
    }
    const mac = this.hand.mac;
    const cards = p.uids.map((u) => mac.find((c) => c.uid === u)!).filter(Boolean).map((c) => toHeld(c, 'player'));
    return new Promise((res) => {
      const wrap = h('div', { class: 'choice', 'data-testid': 'pending-choice' });
      const row = h('div', { class: 'cards' });
      const done = (a: Action) => { gsap.to(wrap, { opacity: 0, duration: 0.2, onComplete: () => wrap.remove() }); res(a); };
      if (p.kind === 'pickDraw') {
        wrap.append(h('h3', { text: t('toast.pickDraw') }), row);
        for (const c of cards) {
          row.append(h('div', { class: 'bigcard', style: `background-image:url(${this.d.textures.faceUrl(c)})`, onclick: () => done({ type: 'resolvePending', side: 'player', pick: c.uid }) }));
        }
      } else {
        let order = cards.slice();
        const render = () => {
          row.innerHTML = '';
          order.forEach((c, i) => {
            const el = h('div', { class: 'bigcard', draggable: 'true', title: i === 0 ? 'Top' : '', style: `background-image:url(${this.d.textures.faceUrl(c)})` });
            el.addEventListener('dragstart', (ev) => { (ev as DragEvent).dataTransfer?.setData('text/plain', String(i)); el.classList.add('dragging'); });
            el.addEventListener('dragover', (ev) => ev.preventDefault());
            el.addEventListener('drop', (ev) => {
              ev.preventDefault();
              const from = Number((ev as DragEvent).dataTransfer?.getData('text/plain'));
              const [m] = order.splice(from, 1);
              order.splice(i, 0, m);
              render();
            });
            el.addEventListener('click', () => { if (i > 0) { [order[i - 1], order[i]] = [order[i], order[i - 1]]; render(); } });
            row.append(el);
          });
        };
        render();
        wrap.append(h('h3', { text: t('toast.reorder') }), row, h('div', { class: 'hint', text: '← ' + (getLang() === 'hr' ? 'vrh maca' : 'top of stock') }),
          h('button', { class: 'btn', text: t('done'), onclick: () => done({ type: 'resolvePending', side: 'player', order: order.map((c) => c.uid) }) }));
      }
      this.d.ov.fxLayer.append(wrap);
      gsap.fromTo(row.children, { y: 80, opacity: 0 }, { y: 0, opacity: 1, duration: 0.3, stagger: 0.08, ease: 'back.out(1.6)' });
    });
  }

  // ------------------------------------------------------------------ presentation

  private card(uid: string): CardInst {
    const c = findCard(this.hand, uid);
    if (!c) throw new Error('card not found ' + uid);
    return c;
  }

  private async present(events: GameEvent[]): Promise<void> {
    this.animating++;
    try {
      this.phaseTag = 'events';
      for (let i = 0; i < events.length; i++) {
        if (this.destroyed) return;
        const e = events[i];
        if (e.t === 'dealt') { await this.presentDeal(e); continue; }
        if (e.t === 'cardDrawn') {
          const next = events[i + 1];
          if (next && next.t === 'cardDrawn' && next.side !== e.side && e.via === 'mac' && next.via === 'mac') {
            // §19.3.4: the winner's draw starts, the loser's 200 ms later
            i++;
            await Promise.all([this.presentDraw(e), wait(200).then(() => this.presentDraw(next))]);
            continue;
          }
          await this.presentDraw(e);
          continue;
        }
        await this.presentOne(e);
      }
    } finally {
      this.animating--;
      if (this.animating === 0) this.phaseTag = '';
      this.refreshTracker();
    }
  }

  /** Odigrano tracker cells from public + own knowledge (§19.5.1). */
  private refreshTracker(): void {
    const s = this.match?.hand;
    if (!s || this.destroyed) return;
    const inHand = new Set(s.sides.player.hand.map((c) => c.uid));
    const played = new Set([...s.table, ...s.sides.player.pile, ...s.sides.bot.pile].map((c) => c.uid));
    const revealed = new Set(s.sides.bot.hand.filter((c) => s.sides.bot.knownByOpp.includes(c.uid)).map((c) => c.uid));
    this.d.hud.tracker.update(this.tableDeck.map((c) => {
      const u = 'p:' + (c.slot ?? `${c.suit}_${c.rank}`);
      return { card: c, state: inHand.has(u) ? 'hand' : played.has(u) ? 'played' : revealed.has(u) ? 'revealed' : 'unknown' };
    }));
  }

  private async presentDeal(e: Extract<GameEvent, { t: 'dealt' }>): Promise<void> {
    this.phaseTag = 'deal';
    const s = this.hand;
    const held = (side: Side) => e.hands[side].map((u) => s.sides[side].hand.find((c) => c.uid === u) ?? this.card(u));
    await this.d.anim.deal2({ player: held('player'), bot: held('bot') }, s.dealer, e.mac.length);
  }

  /** Hidden draws (§19.3.2): the bot's draw stays face down and never enters Viđeno. */
  private async presentDraw(e: Extract<GameEvent, { t: 'cardDrawn' }>): Promise<void> {
    const c = this.hand.sides[e.side].hand.find((x) => x.uid === e.uid) ?? this.card(e.uid);
    if (!this.tipSeen('draw')) this.tip('draw');
    this.phaseTag = 'draw';
    await this.d.anim.drawHidden(c, e.side);
    if (e.side === 'bot' && badDraw(this.hand.sides.bot.hand, c)) this.director.onEvent('bot_bad_draw');
    if (e.side === 'player' && this.resolveInput) this.d.anim.setLegal(legalPlays(this.hand, 'player'));
  }

  private addSeen(c: CardInst): void {
    if (this.seen.some((x) => x.uid === c.uid)) return;
    this.seen.push({ ...c });
    this.d.hud.setSeen(this.seen, c.uid);
  }

  private removeSeen(uid: string): void {
    const n = this.seen.length;
    this.seen = this.seen.filter((x) => x.uid !== uid);
    if (this.seen.length !== n) this.d.hud.setSeen(this.seen);
  }

  private async presentOne(e: GameEvent): Promise<void> {
    const anim = this.d.anim;
    const hud = this.d.hud;
    switch (e.t) {
      case 'handStarted': {
        anim.clearTable();
        this.director.newHand();
        this.seen = [];
        hud.setSeen([]);
        this.live = { player: 0, bot: 0 };
        hud.setLive(0, 0);
        hud.setHandInfo(this.match.target, e.handNo);
        const base = this.run.rakijaBase;
        const wasEmpty = this.rakijaShown < base;
        this.rakijaShown = base;
        hud.setRakija(base, base, e.handNo > 1 && wasEmpty ? 'fill' : null);
        if (e.handNo > 1 && wasEmpty) this.d.audio.play('rakija_pour');
        this.trickCtx = { playerUsedDuplo: false };
        this.refreshForeIdle();
        if (e.handNo === 1 || (this.resume && e.handNo === this.resume.handNo)) this.director.onEvent('match_start');
        break;
      }
      case 'akuza': {
        await this.presentAkuza(e);
        break;
      }
      case 'turn':
        if (e.side === 'player') this.refreshFore();
        break;
      case 'rakija':
        if (e.side === 'player') {
          const prev = this.rakijaShown;
          this.rakijaShown = e.value;
          hud.setRakija(e.value, this.run.rakijaBase, e.value < prev ? 'drain' : 'fill');
          if (e.value > prev) this.d.audio.play('rakija_pour');
        }
        break;
      case 'foraUsed':
        await this.presentFora(e);
        break;
      case 'pending':
        if (e.pending.side === 'player' && e.pending.kind === 'pickDraw') this.d.ov.toast(t('toast.pickDraw'));
        break;
      case 'cardPlayed': {
        const o = anim.cards.get(e.uid) ?? anim.obtain(this.card(e.uid));
        const c = o.data;
        const strong = c.rank === '3' || c.ukras === 'pozlaceno' || c.ukras === 'nabruseno';
        if (e.drunk) this.d.ov.toast(e.side === 'player' ? t('toast.drunk') : t('toast.botDrunk', { name: this.opp.name }));
        this.phaseTag = 'play-' + e.side;
        if (e.side === 'player') {
          this.d.hud.hideTooltip();
          await anim.playerToTrick(o, e.role === 'lead', strong);
        } else {
          this.removeSeen(e.uid);
          await anim.botToTrick(o, e.role === 'lead', strong);
          if (this.pendingBotVoice) { this.director.onEvent(this.pendingBotVoice); this.pendingBotVoice = null; }
        }
        break;
      }
      case 'leadReturned': {
        const o = anim.cards.get(e.uid);
        if (o) {
          if (e.side === 'bot') this.addSeen(o.data);
          await anim.returnToHand(o, e.side);
        }
        break;
      }
      case 'trickResolved':
        await this.presentTrick(e);
        break;
      case 'handScored':
        this.lastBreakdown = e.breakdown;
        this.handsLog.push(e.breakdown);
        // §19.6: hand-end events only for hands that don't decide the match
        if (this.match.status !== 'over') {
          const ev = handEndEvent(e.breakdown);
          if (ev) this.director.onEvent(ev);
        }
        break;
      default:
        break;
    }
  }

  private refreshForeIdle(): void {
    const ids = this.run.fore;
    this.d.hud.setFore(ids.map((id) => ({ id, state: 'unusable' as const, reason: 'notYourTurn' })));
  }

  private async presentAkuza(e: Extract<GameEvent, { t: 'akuza' }>): Promise<void> {
    const hud = this.d.hud;
    if (!this.tipSeen('akuza')) this.tip('akuza');
    if (e.side === 'bot') this.director.onEvent('akuza_bot', { lines: akuzaBotLines(e.combos) });
    else this.director.onEvent('akuza_player');
    if (e.side === 'player') this.d.onAkuza(e.combos.length);
    const who = e.side === 'player' ? (getLang() === 'hr' ? 'Ti akužaš' : 'You declare') : this.opp.name;
    const uids = [...new Set(e.combos.flatMap((c) => c.uids))];
    this.phaseTag = 'akuza';
    let score = this.d.hud.shown[e.side];
    await this.d.anim.akuzaShow(uids, e.side, async () => {
      for (let k = 0; k < e.combos.length; k++) {
        const c = e.combos[k];
        this.d.audio.play('akuza_fanfare');
        this.d.fx.confettiBurst(new THREE.Vector3(0, 3.2, 1.0));
        const label = c.label + (c.glasno ? ` (Glasno +${c.glasno})` : '');
        score += c.points;
        const target = score;
        const p = hud.banner(this.d.ov.fxLayer, label, c.points, who, e.side === 'bot', e.combos.length > 1 ? 900 : 1400);
        void wait(500).then(() => hud.countTo(e.side, target));
        await p;
      }
    });
    if (e.side === 'bot') for (const u of uids) { const c = this.hand.sides.bot.hand.find((x) => x.uid === u); if (c) this.addSeen(c); }
  }

  private async presentFora(e: Extract<GameEvent, { t: 'foraUsed' }>): Promise<void> {
    const anim = this.d.anim;
    const def = FORE[e.fora];
    const hr = getLang() === 'hr';
    if (e.side === 'player') {
      if (e.fora === 'duplo_ili_nista') this.trickCtx.playerUsedDuplo = true;
      this.director.onEvent('player_fora');
    } else {
      this.director.onEvent('bot_fora', e.fora === 'tucem' ? { lines: ['tucem'], p: 1.0 } : { lines: ['aha_sta_je_sad'], p: 0.6 });
    }
    this.phaseTag = 'fora-' + e.side;
    await this.foraFly(e.side, e.fora);
    this.d.audio.play('glass_clink');
    if (e.fora === 'tucem') this.d.audio.play('table_knock');
    switch (e.fora) {
      case 'pogled':
        if (e.side === 'player' && e.revealed) {
          await anim.pogledReveal(e.revealed);
          for (const u of e.revealed) { const c = this.hand.sides.bot.hand.find((x) => x.uid === u); if (c) this.addSeen(c); }
        } else if (e.revealed) {
          anim.botPeek(e.revealed);
          this.d.ov.toast(t('toast.botPeeked', { name: this.opp.name }), 'warn');
          await wait(600);
        }
        break;
      case 'zamjena': {
        const o = e.targetUid ? anim.cards.get(e.targetUid) : undefined;
        if (o) await anim.toMacBottom(o, e.side);
        break;
      }
      case 'tucem': this.d.ov.toast(t('toast.tucem')); this.d.fx.shake(0.04, 200); break;
      case 'duplo_ili_nista': this.d.ov.toast(t('toast.duplo')); break;
      case 'krivi_racun': this.d.ov.toast(t('toast.krivi')); break;
      case 'ti_otvaraj': this.d.ov.toast(t('toast.youLead', { name: e.side === 'player' ? this.opp.name : (hr ? 'Ti' : 'You') })); break;
      case 'vrati': this.d.ov.toast(t('toast.vrati', { name: e.side === 'player' ? this.opp.name : (hr ? 'Ti' : 'You') })); break;
      case 'trica_iz_rukava': {
        this.d.ov.toast(t('toast.trica'));
        const o = e.targetUid ? anim.cards.get(e.targetUid) : undefined;
        if (o && e.side === 'player') anim.flashGlow(o, new THREE.Color('#FFD27A'), 1200, 1);
        break;
      }
      case 'napij_ga': this.d.ov.toast(t('toast.botDrunk', { name: e.side === 'player' ? this.opp.name : (hr ? 'Ti' : 'You') })); break;
      default: break;
    }
    void def;
    if (e.side === 'player') this.refreshFore();
  }

  /** A27: fora card flies from its slot (or the portrait for the bot) to the centre, glows, dissolves into sparks. */
  private async foraFly(side: Side, id: ForaId): Promise<void> {
    this.d.audio.play('fora_use');
    const u = this.uiScale();
    const W = 104 * u, H = 166 * u;
    const from = side === 'player' ? this.d.hud.slotRect(id) : this.d.hud.rect();
    const x0 = from ? from.left + from.width / 2 : window.innerWidth / 2;
    const y0 = from ? from.top + from.height / 2 : 100;
    const name = getLang() === 'hr' ? FORE[id].nameHr : FORE[id].nameEn;
    const el = h('div', { class: 'fora-fly' + (side === 'bot' ? ' bot' : ''), style: `left:${x0 - W / 2}px;top:${y0 - H / 2}px` },
      h('div', { class: 'art', style: `background-image:url(${art.fora(id)})` }), h('div', { class: 'ribbon', text: name }));
    this.d.ov.fxLayer.append(el);
    const cx = window.innerWidth / 2 - W / 2, cy = window.innerHeight * 0.42 - H / 2;
    await new Promise<void>((res) => {
      const tl = gsap.timeline({ onComplete: () => { el.remove(); res(); } });
      gsap.set(el, { filter: 'brightness(1) blur(0px)' });
      tl.to(el, { left: cx, top: cy, scale: 1.4, duration: 0.35, ease: 'power2.out' });
      tl.to(el, { filter: 'brightness(1.25) blur(0px)', duration: 0.3, ease: 'sine.inOut' });
      tl.call(() => this.sparkBurst(window.innerWidth / 2, window.innerHeight * 0.42));
      tl.to(el, { opacity: 0, scale: 1.7, filter: 'brightness(2.2) blur(5px)', duration: 0.4, ease: 'power2.in' });
    });
  }

  /** Gold sparks on a 2D canvas (A27 dissolve). */
  private sparkBurst(x: number, y: number): void {
    const cv = h('canvas', { class: 'spark-canvas' }) as HTMLCanvasElement;
    cv.width = window.innerWidth; cv.height = window.innerHeight;
    this.d.ov.fxLayer.append(cv);
    const ctx = cv.getContext('2d')!;
    const ps = Array.from({ length: 40 }, () => {
      const a = Math.random() * Math.PI * 2, sp = 2 + Math.random() * 7;
      return { x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 2, life: 1 };
    });
    const st = { t: 0 };
    gsap.to(st, {
      t: 1, duration: 0.6, ease: 'none',
      onUpdate: () => {
        ctx.clearRect(0, 0, cv.width, cv.height);
        for (const p of ps) {
          p.x += p.vx; p.y += p.vy; p.vy += 0.25;
          ctx.globalAlpha = 1 - st.t;
          ctx.fillStyle = '#FFD27A';
          ctx.beginPath(); ctx.arc(p.x, p.y, 3 * (1 - st.t * 0.6), 0, Math.PI * 2); ctx.fill();
        }
      },
      onComplete: () => cv.remove(),
    });
  }

  private async presentTrick(e: Extract<GameEvent, { t: 'trickResolved' }>): Promise<void> {
    const anim = this.d.anim;
    const lead = this.card(e.leadUid);
    const follow = this.card(e.followUid);
    const winUid = e.winner === lead.owner ? lead.uid : follow.uid;
    const loseUid = winUid === lead.uid ? follow.uid : lead.uid;
    const wo = anim.cards.get(winUid);
    const lo = anim.cards.get(loseUid);
    // strong: an A captured by the other side
    const loser = lead.uid === loseUid ? lead : follow;
    const aceCaptured = loser.rank === 'A';
    if (aceCaptured) {
      this.d.fx.shake(0.06, 250);
      this.d.fx.sparks(new THREE.Vector3(TRICK_CENTER.x, 0.1, TRICK_CENTER.z));
      this.d.fx.flash();
      this.d.audio.play('card_slam_strong', { volume: 0.6 });
    }
    // voice (§19.6: a forgery / Briškula winning the trick has its own moment)
    if (e.special && e.winner === 'bot') this.director.onEvent('bot_play_strong', { p: 1.0, lines: ['aha_sta_je_sad', 'evo_ti_ga_na'] });
    else if (e.special && e.winner === 'player') this.director.onEvent('player_great', { p: 0.8 });
    else {
      const ev = trickEndEvent(e, { lead, follow, playerUsedDuplo: this.trickCtx.playerUsedDuplo, playerTricaTarget: this.hand.sides.player.tricaTarget });
      this.director.onEvent(ev);
    }
    this.trickCtx = { playerUsedDuplo: false };
    // A15 pop
    const pops: [Side, number][] = [];
    for (const side of ['player', 'bot'] as Side[]) if (e.thirdsTo[side] > 0) pops.push([side, e.thirdsTo[side]]);
    const bonusFor = (side: Side) => e.bonus.filter((b) => b.side === side && b.points).map((b) => `${getLang() === 'hr' ? UKRASI[b.ukras].nameHr : UKRASI[b.ukras].nameEn} +${b.points}`);
    const sp = this.d.anim.screenOf(new THREE.Vector3(TRICK_CENTER.x, 0.3, TRICK_CENTER.z));
    const showPop = (side: Side, thirds: number, k: number) => {
      const lines = bonusFor(side);
      if (e.ultima && e.ultima.side === side) lines.push(`Ultima +${e.ultima.points}`);
      const text = thirds > 0 ? `+${fmtThirds(thirds)}` : '';
      if (!text && lines.length === 0) return;
      this.d.hud.pop(this.d.ov.fxLayer, sp.x + k * 140 * this.uiScale(), sp.y - 30, text || lines.shift()!, lines.length ? lines.join(' · ') : null, side === 'player' ? '#FFD27A' : '#C0533A');
    };
    const winnerSide = e.winner;
    let k = 0;
    const shown = new Set<Side>();
    for (const [side, th] of pops) { showPop(side, th, pops.length > 1 ? (k++ === 0 ? -0.5 : 0.5) : 0); shown.add(side); }
    for (const side of ['player', 'bot'] as Side[]) if (!shown.has(side) && (bonusFor(side).length || (e.ultima && e.ultima.side === side))) showPop(side, 0, 0);
    // live thirds
    this.live.player += e.thirdsTo.player;
    this.live.bot += e.thirdsTo.bot;
    this.d.hud.setLive(this.live.player, this.live.bot);
    // srebreno coins
    for (const b of e.bonus) {
      if (b.soldi && b.side === 'player') {
        const total = this.d.onSoldi(b.soldi);
        this.d.audio.play('coin_single');
        this.d.hud.bumpSoldi(total);
        this.d.ov.toast(t('toast.soldi', { n: b.soldi }));
      }
    }
    this.phaseTag = 'trick';
    if (wo && lo) await anim.resolveTrick(wo, lo, winnerSide);
    else await wait(300);
    void BASE_THIRDS;
  }

  private async endOfHand(): Promise<void> {
    const b = this.lastBreakdown;
    const m = this.match;
    this.d.onHandEnd({ scores: { ...m.scores }, handNo: m.handNo, dealer: m.dealer, akuzaPointsPlayer: m.akuzaPointsPlayer });
    if (!b) return;
    await wait(250);
    if (!this.tipSeen('summary')) this.tip('summary');
    await new Promise<void>((res) => {
      let el: HTMLElement | null = null;
      const finish = () => {
        if (!this.summaryResolve) return;
        this.summaryResolve = null;
        if (el) gsap.to(el, { opacity: 0, duration: 0.25, onComplete: () => el?.remove() });
        res();
      };
      el = lightSummary({ names: [t('summary.you'), this.opp.name.split(' ').slice(-1)[0]], b: [b.player, b.bot], scores: [m.scores.player, m.scores.bot], target: m.target, matchOver: m.status === 'over', onDone: finish });
      this.summaryResolve = finish;
      this.d.ov.fxLayer.append(el);
      // auto-continue after 3500 ms (§19.5.2)
      void wait(this.d.flags.autonav ? 1400 : m.status === 'over' ? 2400 : 3500).then(finish);
    });
    await Promise.all([this.d.hud.countTo('player', m.scores.player), this.d.hud.countTo('bot', m.scores.bot)]);
    await wait(300);
  }

  // ------------------------------------------------------------------ voice + misc

  private say(line: VoiceLine, _prio: number): { durationMs: number; stop(fadeMs: number): void } {
    const h2 = this.d.audio.playVoice(this.opp.persona, line.id, this.opp.playbackRate);
    const hold = Math.max(2200, h2.durationMs + 600);
    const gloss = this.d.settings().subtitles ? line.glossEn : null;
    this.d.hud.bubble(line.subtitleHr, gloss, hold, line.mood);
    if (line.mood === 'angry' && Math.random() < 0.4) this.d.audio.play('glass_slam', { delayMs: 150 });
    return h2;
  }

  private tipSeen(id: string): boolean { return this.d.settings().tipsSeen.includes(id); }
  private tip(id: string): void {
    this.d.markTip(id);
    void wait(400).then(() => this.d.ov.toast(t('tip.' + id), 'tip', 3200));
  }

  private updateChips(): void {
    if (this.destroyed) return;
    const anim = this.d.anim;
    const p = anim.screenOf(anim.sharedMac.base.clone().add(new THREE.Vector3(0, 0.1, 0.95)));
    this.d.hud.setChips({ ...p, n: anim.sharedMac.count }, { ...p, n: 0 });
  }

  /** Debug snapshot. */
  snapshot(): Record<string, unknown> {
    const s = this.match?.hand;
    return {
      opponent: this.opp.id,
      scores: this.match ? { ...this.match.scores } : null,
      matchStatus: this.match?.status,
      handNo: this.match?.handNo,
      phase: s?.phase,
      turn: s?.turn,
      trickNo: s?.trick.no,
      awaitingInput: !!this.resolveInput,
      animating: this.animating,
      playerHand: this.d.anim.playerHand.map((o) => o.uid),
      playerHandScreen: this.d.anim.playerHand.map((o) => this.d.anim.screenOfCard(o)),
      tableCards: s ? s.table.map((c) => c.uid) : [],
      legal: s ? legalPlays(s, 'player') : [],
      rakija: s?.sides.player.rakija,
      fore: s?.sides.player.fore,
      foreUsed: s?.sides.player.foreUsed,
      botHandSize: s?.sides.bot.hand.length,
      mac: s ? s.mac.length : null,
      tier: this.opp.tier,
      botFore: this.opp.fore,
      voiceLog: this.director.log.slice(-10),
      summaryOpen: !!this.summaryResolve,
      phaseTag: this.phaseTag,
    };
  }

  continueSummary(): void { this.summaryResolve?.(); }
  /** Force-end the match (debug: skipToShop). */
  forceEnd(): void { this.destroyed = true; this.resolveInput = null; }
  get other(): Side { return other('player'); }
}
