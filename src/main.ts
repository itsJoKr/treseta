// Bootstrap: settings, manifest, assets; renderer, audio, UI; routing (§16.2).
import '@fontsource/alegreya/400.css';
import '@fontsource/alegreya/700.css';
import '@fontsource/alegreya/800.css';
import '@fontsource/alegreya/400-italic.css';
import '@fontsource/alegreya-sans/400.css';
import '@fontsource/alegreya-sans/500.css';
import '@fontsource/alegreya-sans/700.css';
import '@fontsource/alegreya-sans/400-italic.css';
import './ui/styles.css';
import gsap from 'gsap';
import { Assets, assets } from './assets/loader';
import { AudioManager } from './audio/audio';
import { GameController } from './controller/gameController';
import { GameController4 } from './controller/gameController4';
import { setLang, t } from './data/strings';
import { FLAGS } from './env';
import { matchTarget, setMatchTargetOverride } from './game/matchConfig';
import { CHARACTERS as CHARS } from './game/characters';
import { dvobojOpponent } from './game/dvobojLadder';
import { applyMatchMods } from './game/forge';
import { DVOBOJ_LADDER } from './game/ladders';
import { randomSeed } from './game/rng';
import * as R from './game/run';
import type { RunState } from './game/run';
import * as R4 from './game/run4';
import type { RunState4 } from './game/run4';
import type { CharacterId } from './game/characters';
import { PAIRS } from './game/ladder4';
import {
  clampStats, clearRun, clearRun4, loadRun, loadRun4, loadSettings, loadStats, loadStats4, memoryStorage, removeOldSaves, saveRun, saveRun4, saveSettings, saveStats, saveStats4,
} from './game/save';
import type { Settings, StorageLike } from './game/save';
import type { Side } from './game/types';
import { wait } from './render/animator';
import { Animator4 } from './render/animator4';
import { CardTextures } from './render/cardMesh';
import { FX } from './render/fx';
import { SceneManager } from './render/scene';
import { art, h } from './ui/dom';
import { Hud } from './ui/hud';
import { Hud4 } from './ui/hud4';
import { intro4Panel, partnerPick } from './ui/partnerPick';
import { howtoModal, mainMenu, settingsModal } from './ui/menus';
import { Overlay } from './ui/overlay';
import { introPanel, runMap } from './ui/runMap';
import { flyCoins, matchEnd, runEnd } from './ui/screens';
import { ShopScreen } from './ui/shop';
import { applyDeviceClasses, installFullscreenOnTap, installRotateScreen, isIOS, isPhone, isStandalone, relabelRotateScreen } from './ui/mobile';

type Screen = 'loading' | 'menu' | 'map' | 'pick' | 'intro' | 'match' | 'matchend' | 'shop' | 'runend';

class App {
  storage: StorageLike;
  settings: Settings;
  stats;
  run: RunState | null = null;
  audio: AudioManager;
  ov: Overlay;
  sm!: SceneManager;
  fx!: FX;
  tex!: CardTextures;
  anim!: Animator4;
  hud!: Hud;
  hud4!: Hud4;
  ctrl: GameController | null = null;
  // ---- Partneri (§18) ----
  mode: 'dvoboj' | 'partneri' = 'dvoboj';
  run4: RunState4 | null = null;
  ctrl4: GameController4 | null = null;
  stats4;
  private oldSaveRemoved = false;
  screen: Screen = 'loading';
  shop: ShopScreen | null = null;
  private introModal: { close: () => void } | null = null;
  private lastScores: Record<Side, number> | null = null;
  /** Resolves when every manifest image has loaded (started in boot, after the critical set). */
  private allImages: Promise<void> = Promise.resolve();
  private allImagesDone = false;
  private bgProgress = 0;

  /** Run screens read images synchronously, so wait for the background preload before entering a run. */
  private async ensureImages(): Promise<void> {
    if (this.allImagesDone) return;
    const slow = setTimeout(() => this.ov.toast(t('menu.loading', { p: Math.round(this.bgProgress * 100) }), 'normal', 1500), 250);
    await this.allImages;
    clearTimeout(slow);
    this.allImagesDone = true;
  }

  constructor() {
    let st: StorageLike;
    try { st = FLAGS.nosave ? memoryStorage() : window.localStorage; st.getItem('x'); } catch { st = memoryStorage(); }
    this.storage = st;
    this.settings = loadSettings(st, navigator.language || 'en');
    if (FLAGS.fast) this.settings.fast = true;
    setMatchTargetOverride(FLAGS.target);
    setLang(this.settings.language);
    document.documentElement.lang = this.settings.language;
    applyDeviceClasses();
    installRotateScreen();
    installFullscreenOnTap();
    this.oldSaveRemoved = removeOldSaves(st);
    this.stats = clampStats(loadStats(st));
    this.stats4 = clampStats(loadStats4(st));
    this.audio = new AudioManager(assets, FLAGS.nosound);
    this.audio.setVolumes(this.settings.volumes);
    this.audio.onUnlock(() => { void this.audio.decodeAll().then(() => this.audio.setAmbient(this.screen === 'shop' ? 'shop' : 'normal')); });
    this.ov = new Overlay(document.getElementById('ui')!, this.audio);
    this.applySpeed();
  }

  applySpeed(): void {
    const ts = FLAGS.speed ?? (this.settings.fast ? 1.6 : 1);
    gsap.globalTimeline.timeScale(ts);
  }

  saveSettings(): void {
    const langChanged = this.settings.language !== (document.documentElement.lang || '');
    setLang(this.settings.language);
    document.documentElement.lang = this.settings.language;
    if (langChanged) { this.hud?.relabel(); relabelRotateScreen(); }
    this.audio.setVolumes(this.settings.volumes);
    this.applySpeed();
    saveSettings(this.storage, this.settings);
  }

  async boot(): Promise<void> {
    const loading = h('div', { class: 'screen menu' }, h('div', { class: 'menu-bg fallback' }),
      h('div', { class: 'menu-inner' }, h('div', { class: 'logo-text', text: 'TREŠETA' }), h('div', { class: 'loadbar' }, h('div', { id: 'lb' })), h('div', { class: 'loadtext', id: 'lt' })));
    void this.ov.show(loading);
    await assets.init();
    const fontsReady = (document as Document & { fonts?: FontFaceSet }).fonts?.ready ?? Promise.resolve();
    // Only what the menu and the 3D scene need blocks the first screen; the rest
    // (card faces, portraits, fore, shop/map backgrounds) streams in behind the menu.
    await assets.preloadImages((p) => {
      const lb = document.getElementById('lb');
      if (lb) lb.style.width = `${Math.round(p * 100)}%`;
      const lt = document.getElementById('lt');
      if (lt) lt.textContent = t('menu.loading', { p: Math.round(p * 100) });
    }, Assets.isCritical);
    this.allImages = assets.preloadImages((p) => { this.bgProgress = p; });
    try { await Promise.race([fontsReady, wait(1500)]); } catch { /* ignore */ }
    void this.audio.preloadSfx();
    const konoba = art.env('konoba');
    if (konoba) document.getElementById('app')!.style.backgroundImage = `url(${konoba})`;
    this.sm = new SceneManager(document.getElementById('scene') as HTMLCanvasElement);
    this.fx = new FX(this.sm);
    this.tex = new CardTextures(this.sm.maxAniso);
    this.anim = new Animator4(this.sm, this.fx, this.tex, this.audio);
    this.hud = new Hud(this.tex, this.audio);
    this.hud.onGear = () => this.openSettings();
    this.hud4 = new Hud4(this.tex, this.audio);
    this.hud4.onGear = () => this.openSettings();
    this.installDebugHook();
    this.ov.onModalChange = () => {};
    if (FLAGS.newrun) { if (FLAGS.mode === 'partneri') await this.newRun4(true); else await this.newRun(true); return; }
    this.showMenu();
  }

  // ----------------------------------------------------------- screens

  showMenu(): void {
    this.screen = 'menu';
    this.teardownMatch();
    this.audio.setAmbient('normal');
    const saved = loadRun(this.storage);
    const saved4 = loadRun4(this.storage);
    if ((!saved.ok && saved.reason !== 'none') || (!saved4.ok && saved4.reason !== 'none')) this.ov.toast(t('toast.saveDiscarded'), 'warn', 2500);
    if (this.oldSaveRemoved) { this.oldSaveRemoved = false; this.ov.toast(t('toast.oldSave'), 'warn', 3000); }
    const m = mainMenu({
      hasSave: saved.ok,
      dvobojKonoba: saved.ok ? saved.run.ladderIndex + 1 : 1,
      stats: { ...this.stats, runsStarted: this.stats.runsStarted + this.stats4.runsStarted, runsWon: this.stats.runsWon + this.stats4.runsWon },
      onContinue: () => void this.continueRun(),
      onNew: () => void this.newRun(false),
      onHowto: () => howtoModal(this.ov, this.tex),
      onSettings: () => this.openSettings(),
      partneri: {
        hasSave: saved4.ok,
        konoba: saved4.ok ? saved4.run.ladderIndex + 1 : 1,
        onContinue: () => void this.continueRun4(),
        onNew: () => void this.newRun4(false),
      },
      onLanguage: (l) => { this.settings.language = l; this.saveSettings(); this.showMenu(); },
    });
    m.setProgress(1);
    void this.ov.show(m.el);
    // iPhone Safari can't go full screen: once, explain Add to Home Screen
    if (isPhone() && isIOS() && !isStandalone() && !this.settings.tipsSeen.includes('iosHome')) {
      this.settings.tipsSeen.push('iosHome');
      saveSettings(this.storage, this.settings);
      window.setTimeout(() => this.ov.toast(t('tip.iosHome'), 'tip', 7000), 900);
    }
  }

  openSettings(): void {
    if (this.ov.modalOpen) return;
    settingsModal(this.ov, this.settings, () => this.saveSettings(), {
      onQuit: this.screen !== 'menu' ? () => this.showMenu() : undefined,
      onClose: () => { if (this.screen === 'menu') this.showMenu(); },
    });
  }

  async newRun(skipConfirm: boolean): Promise<void> {
    await this.ensureImages();
    this.mode = 'dvoboj';
    const saved = loadRun(this.storage);
    if (saved.ok && !skipConfirm) {
      const ok = await this.ov.confirm(t('menu.newConfirm'));
      if (!ok) return;
    }
    const seed = FLAGS.seed ?? randomSeed();
    this.run = R.newRun(seed, Date.now(), { start: FLAGS.start });
    this.stats.runsStarted += 1;
    this.stats.bestLadder = Math.max(this.stats.bestLadder, this.run.ladderIndex + 1);
    saveStats(this.storage, this.stats);
    this.persist();
    this.showMap();
  }

  async continueRun(): Promise<void> {
    await this.ensureImages();
    this.mode = 'dvoboj';
    const saved = loadRun(this.storage);
    if (!saved.ok) { this.showMenu(); return; }
    this.run = saved.run;
    switch (this.run.status) {
      case 'map': this.showMap(); break;
      case 'intro': this.showMap(); this.showIntro(); break;
      case 'match': void this.startMatch(this.run.match); break;
      case 'shop': this.showShop(); break;
      case 'lostOffer': this.showMatchEnd(false, this.run.lastScores ?? { player: 0, bot: matchTarget('dvoboj') }); break;
      case 'won': case 'lost': this.showRunEnd(); break;
    }
  }

  persist(): void {
    if (this.run) saveRun(this.storage, this.run);
  }

  showMap(travelFrom?: number): void {
    if (!this.run) return;
    this.screen = 'map';
    this.teardownMatch();
    this.audio.setAmbient('normal');
    this.run = R.setStatus(this.run, 'map');
    this.persist();
    const konobe = DVOBOJ_LADDER.map((m) => ({ portraits: [art.portrait(m.opp)], label: m.konoba }));
    const el = runMap({ ladderIndex: this.run.ladderIndex, soldi: this.run.soldi, travelFrom, konobe, revans: this.run.revans, onOpen: () => this.showIntro(), onSettings: () => this.openSettings() }, this.audio);
    void this.ov.show(el);
  }

  showIntro(): void {
    if (!this.run || this.introModal) return;
    this.screen = 'intro';
    this.run = R.setStatus(this.run, 'intro');
    this.persist();
    const opp = dvobojOpponent(this.run.ladderIndex);
    const deck = applyMatchMods(this.run.deck, DVOBOJ_LADDER[this.run.ladderIndex], this.run.seed, 'dvoboj', this.run.ladderIndex, this.run.attempt);
    const panel = introPanel(opp, this.run.ladderIndex, { marks: deck.filter((c) => c.ukras && c.ukrasTeam === 'vi'), forgeries: deck.filter((c) => c.forge && c.forge.team === 'vi') }, this.tex, () => {
      this.screen = 'match';
      this.introModal?.close();
      this.introModal = null;
      void this.startMatch();
    }, () => { this.introModal?.close(); });
    this.introModal = this.ov.modal(panel, { onClose: () => { this.introModal = null; if (this.screen === 'intro' && this.run) { this.screen = 'map'; this.run = R.setStatus(this.run, 'map'); this.persist(); } } });
  }

  private teardownMatch(): void {
    if (this.ctrl) { this.ctrl.destroy(); this.ctrl = null; }
    if (this.ctrl4) { this.ctrl4.destroy(); this.ctrl4 = null; }
    this.hud?.el.remove();
    this.hud4?.el.remove();
    this.sm?.canvas.classList.remove('lost');
    document.body.classList.remove('targeting');
  }

  async startMatch(resume?: R.MatchSave): Promise<void> {
    if (!this.run) return;
    this.teardownMatch();
    this.screen = 'match';
    this.run = resume ? R.setStatus(this.run, 'match') : R.beginMatch(this.run);
    this.persist();
    this.audio.setAmbient('normal');
    this.ov.hudLayer.append(this.hud.el);
    void this.ov.show(null);
    const ctrl = new GameController({
      sm: this.sm, anim: this.anim, fx: this.fx, audio: this.audio, hud: this.hud, ov: this.ov, textures: this.tex,
      settings: () => this.settings,
      markTip: (id) => { if (!this.settings.tipsSeen.includes(id)) { this.settings.tipsSeen.push(id); saveSettings(this.storage, this.settings); } },
      flags: { debug: FLAGS.debug, autoplay: FLAGS.autoplay, autonav: FLAGS.autonav || FLAGS.autoplay },
      isPaused: () => this.ov.modalOpen,
      waitUnpaused: async () => { while (this.ov.modalOpen) await new Promise((r) => setTimeout(r, 100)); },
      onHandEnd: (m) => { if (this.run && this.ctrl === ctrl) { this.run = R.saveMatchProgress(this.run, m); this.persist(); } },
      onSoldi: (n) => { if (!this.run) return 0; this.run = R.addSoldi(this.run, n); this.persist(); return this.run.soldi; },
      onAkuza: (n) => { if (this.run) this.run = R.recordAkuze(this.run, n); },
      openSettings: () => this.openSettings(),
      saveSettings: () => saveSettings(this.storage, this.settings),
    }, this.run, resume);
    this.ctrl = ctrl;
    const m = await ctrl.runMatch();
    if (this.ctrl !== ctrl || m.status !== 'over' || !m.winner) return;
    await this.matchOver(m.winner === 'player', m.scores, m.akuzaPointsPlayer);
  }

  debugMatchOver(win: boolean, scores: Record<Side, number>, akuza: number): Promise<void> {
    return this.matchOver(win, scores, akuza);
  }

  private async matchOver(win: boolean, scores: Record<Side, number>, akuza: number): Promise<void> {
    if (!this.run) return;
    this.lastScores = { ...scores };
    if (win) this.run = R.onMatchWon(this.run, scores, akuza, Date.now());
    else { this.run = R.onMatchLost(this.run, scores, Date.now()); this.run.lastScores = { ...scores }; }
    this.persist();
    this.showMatchEnd(win, scores);
  }

  showMatchEnd(win: boolean, scores: Record<Side, number>): void {
    if (!this.run) return;
    this.screen = 'matchend';
    const run = this.run;
    const opp = DVOBOJ_LADDER[run.ladderIndex].opp;
    const director = this.ctrl?.director;
    const hands = (this.ctrl?.handsLog ?? []).map((b) => [b.player, b.bot] as [import('./game/types').SideBreakdown, import('./game/types').SideBreakdown]);
    if (director) director.onEvent(win ? 'match_bot_lose' : 'match_bot_win');
    this.audio.play(win ? 'win_stinger' : 'lose_stinger');
    if (!win) this.sm.canvas.classList.add('lost');
    const el = matchEnd({
      win, opp, scores, reward: run.lastReward, finalMatch: run.status === 'won', revans: run.revans,
      hands, names: [t('summary.you'), CHARS[opp].name.split(' ').slice(-1)[0]],
      onShop: () => { if (this.run?.status === 'won') this.showRunEnd(); else this.showShop(); },
      onRevans: () => { if (!this.run) return; this.run = R.takeRevans(this.run); this.persist(); this.teardownMatch(); void this.startMatch(); },
      onGiveUp: () => { if (!this.run) return; this.run = R.giveUp(this.run, Date.now()); this.persist(); this.showRunEnd(); },
    });
    void this.ov.show(el);
    if (win && run.lastReward) {
      const before = run.soldi - run.lastReward.total;
      let shown = before;
      this.hud.setSoldi(before);
      void wait(700).then(() => {
        this.audio.play('coins');
        const n = Math.min(20, run.lastReward!.total);
        const step = run.lastReward!.total / n;
        return flyCoins(this.ov.fxLayer, n, this.hud.soldiRect(), () => { shown = Math.min(run.soldi, shown + step); this.hud.setSoldi(Math.round(shown)); });
      }).then(() => this.hud.setSoldi(run.soldi));
    }
  }

  showShop(): void {
    if (!this.run || !this.run.shop) return;
    this.teardownMatch();
    this.screen = 'shop';
    this.audio.play('shop_bell');
    this.audio.setAmbient('shop');
    const save = (r: RunState) => { this.run = r; this.persist(); return r; };
    this.shop = new ShopScreen(this.run, {
      buyUkras: (i, key) => save(R.buyUkras(this.run!, i, key)),
      buyFora: (i, d) => save(R.buyFora(this.run!, i, d)),
      buyCasica: (i) => save(R.buyCasica(this.run!, i)),
      reroll: () => save(R.reroll(this.run!)),
      buyFalsa: (i, key, tg) => save(R.buyFalsa(this.run!, i, key, tg)),
      move: (from, to) => save(R.moveUkras(this.run!, from, to)),
      canMove: () => R.canMove(this.run!),
      movePrice: () => R.movePrice({}),
      leave: () => {
        if (!this.run) return;
        const from = this.run.ladderIndex * 2 + 1;
        this.run = R.leaveShop(this.run);
        this.stats.bestLadder = Math.max(this.stats.bestLadder, this.run.ladderIndex + 1);
        saveStats(this.storage, this.stats);
        this.persist();
        this.shop = null;
        this.showMap(from);
      },
    }, this.ov, this.tex, this.audio);
    void this.ov.show(this.shop.el);
  }

  showRunEnd(): void {
    if (!this.run) return;
    this.teardownMatch();
    this.screen = 'runend';
    const run = this.run;
    if (run.status === 'won') this.stats.runsWon += 1;
    this.stats.bestLadder = Math.max(this.stats.bestLadder, run.ladderIndex + 1);
    this.stats.bestRunSoldi = Math.max(this.stats.bestRunSoldi, run.stats.soldiEarned);
    saveStats(this.storage, this.stats);
    clearRun(this.storage);
    const el = runEnd(run, () => { this.run = null; this.showMenu(); });
    void this.ov.show(el);
  }

  // ----------------------------------------------------------- Partneri (§18)

  persist4(): void { if (this.run4) saveRun4(this.storage, this.run4); }

  async newRun4(skipConfirm: boolean): Promise<void> {
    await this.ensureImages();
    this.mode = 'partneri';
    const saved = loadRun4(this.storage);
    if (saved.ok && !skipConfirm) {
      const ok = await this.ov.confirm(t('menu.newConfirm'));
      if (!ok) return;
    }
    const seed = FLAGS.seed ?? randomSeed();
    this.run4 = R4.newRun4(seed, Date.now(), { start: FLAGS.start });
    this.stats4.runsStarted += 1;
    this.stats4.bestLadder = Math.max(this.stats4.bestLadder, this.run4.ladderIndex + 1);
    saveStats4(this.storage, this.stats4);
    this.persist4();
    this.showMap4();
  }

  async continueRun4(): Promise<void> {
    await this.ensureImages();
    this.mode = 'partneri';
    const saved = loadRun4(this.storage);
    if (!saved.ok) { this.showMenu(); return; }
    this.run4 = saved.run;
    switch (this.run4.status) {
      case 'map': this.showMap4(); break;
      case 'pick': this.showPick4(); break;
      case 'intro': this.run4.partner ? (this.showMap4(), this.showIntro4()) : this.showPick4(); break;
      case 'match': void this.startMatch4(this.run4.match); break;
      case 'shop': this.showShop4(); break;
      case 'lostOffer': this.showMatchEnd4(false, this.run4.lastScores ?? { mi: 0, vi: PAIRS.length }); break;
      case 'won': case 'lost': this.showRunEnd4(); break;
    }
  }

  showMap4(travelFrom?: number): void {
    if (!this.run4) return;
    this.screen = 'map';
    this.teardownMatch();
    this.audio.setAmbient('normal');
    this.run4 = R4.setStatus4(this.run4, 'map');
    this.persist4();
    const konobe = PAIRS.map((p) => ({ portraits: [art.portrait(p.W), art.portrait(p.E)], label: p.konoba }));
    const el = runMap({ ladderIndex: this.run4.ladderIndex, soldi: this.run4.soldi, travelFrom, konobe, revans: this.run4.revans, onOpen: () => this.showPick4(), onSettings: () => this.openSettings() }, this.audio);
    void this.ov.show(el);
  }

  showPick4(): void {
    if (!this.run4) return;
    this.screen = 'pick';
    this.run4 = R4.setStatus4(this.run4, 'pick');
    this.persist4();
    const valid = R4.partnerChoices(this.run4);
    const pick = (id: CharacterId) => {
      if (!this.run4) return;
      this.run4 = R4.pickPartner(this.run4, id);
      this.persist4();
      this.showIntro4();
    };
    const pre = FLAGS.partner as CharacterId | undefined;
    if (pre && valid.includes(pre) && FLAGS.autonav) { pick(pre); return; }
    const el = partnerPick({ ladderIndex: this.run4.ladderIndex, unlocked: this.run4.unlocked, valid, onPick: pick, onBack: () => this.showMap4() });
    void this.ov.show(el);
    if (FLAGS.autonav && valid.length) void wait(600).then(() => { if (this.screen === 'pick') pick(valid[0]); });
  }

  showIntro4(): void {
    if (!this.run4 || !this.run4.partner || this.introModal) return;
    this.screen = 'intro';
    this.run4 = R4.setStatus4(this.run4, 'intro');
    this.persist4();
    const marks = R4.matchMarks(this.run4);
    const forgeries = R4.matchForgeries(this.run4);
    const partner = this.run4.partner!;
    const panel = intro4Panel({
      ladderIndex: this.run4.ladderIndex, partner, marks, forgeries, textures: this.tex,
      onSit: () => { this.screen = 'match'; this.introModal?.close(); this.introModal = null; void this.startMatch4(); },
      onBack: () => { this.introModal?.close(); },
    });
    this.introModal = this.ov.modal(panel, { onClose: () => { this.introModal = null; if (this.screen === 'intro' && this.run4) { this.showPick4(); } } });
    if (FLAGS.autonav) void wait(700).then(() => { if (this.screen === 'intro' && this.introModal) { this.screen = 'match'; this.introModal.close(); this.introModal = null; void this.startMatch4(); } });
  }

  async startMatch4(resume?: R4.Match4Save): Promise<void> {
    if (!this.run4) return;
    this.teardownMatch();
    this.screen = 'match';
    this.run4 = resume ? R4.setStatus4(this.run4, 'match') : R4.beginMatch4(this.run4);
    this.persist4();
    this.audio.setAmbient('normal');
    this.ov.hudLayer.append(this.hud4.el);
    void this.ov.show(null);
    const ctrl = new GameController4({
      sm: this.sm, anim: this.anim, fx: this.fx, audio: this.audio, hud: this.hud4, ov: this.ov, textures: this.tex,
      settings: () => this.settings,
      markTip: (id) => { if (!this.settings.tipsSeen.includes(id)) { this.settings.tipsSeen.push(id); saveSettings(this.storage, this.settings); } },
      flags: { debug: FLAGS.debug, autoplay: FLAGS.autoplay, autonav: FLAGS.autonav || FLAGS.autoplay },
      waitUnpaused: async () => { while (this.ov.modalOpen) await new Promise((r) => setTimeout(r, 100)); },
      onHandEnd: (m) => { if (this.run4 && this.ctrl4 === ctrl) { this.run4 = R4.saveMatch4(this.run4, m); this.persist4(); } },
      onSoldi: (n) => { if (!this.run4) return 0; this.run4 = R4.addSoldi4(this.run4, n); this.persist4(); return this.run4.soldi; },
      onAkuza: (n) => { if (this.run4) this.run4 = R4.recordAkuze4(this.run4, n); },
      openSettings: () => this.openSettings(),
      saveSettings: () => saveSettings(this.storage, this.settings),
    }, this.run4, resume);
    this.ctrl4 = ctrl;
    const m = await ctrl.runMatch();
    if (this.ctrl4 !== ctrl || m.status !== 'over' || !m.winner) return;
    await this.matchOver4(m.winner === 'mi', m.scores, m.akuzaPointsMi);
  }

  async matchOver4(win: boolean, scores: Record<'mi' | 'vi', number>, akuza: number): Promise<void> {
    if (!this.run4) return;
    if (win) this.run4 = R4.onMatchWon4(this.run4, scores, akuza, Date.now());
    else this.run4 = R4.onMatchLost4(this.run4, scores, Date.now());
    this.persist4();
    this.showMatchEnd4(win, scores);
  }

  showMatchEnd4(win: boolean, scores: Record<'mi' | 'vi', number>): void {
    if (!this.run4) return;
    this.screen = 'matchend';
    const run = this.run4;
    const pair = PAIRS[run.ladderIndex];
    this.ctrl4?.voice.matchEnd(win ? 'mi' : 'vi', Math.abs(scores.mi - scores.vi));
    this.audio.play(win ? 'win_stinger' : 'lose_stinger');
    if (!win) this.sm.canvas.classList.add('lost');
    const el = matchEnd({
      win, opp: [pair.W, pair.E], scores: { player: scores.mi, bot: scores.vi }, reward: run.lastReward, finalMatch: run.status === 'won', revans: run.revans,
      titles: [t('end.team.win'), t('end.team.lose')],
      hands: (this.ctrl4?.handsLog ?? []).map((b) => [b.mi, b.vi] as [import('./game/types').SideBreakdown, import('./game/types').SideBreakdown]),
      names: [t('hud.mi'), t('hud.vi')],
      onShop: () => { if (this.run4?.status === 'won') this.showRunEnd4(); else this.showShop4(); },
      onRevans: () => { if (!this.run4) return; this.run4 = R4.takeRevans4(this.run4); this.persist4(); this.teardownMatch(); void this.startMatch4(); },
      onGiveUp: () => { if (!this.run4) return; this.run4 = R4.giveUp4(this.run4, Date.now()); this.persist4(); this.showRunEnd4(); },
    });
    void this.ov.show(el);
    if (win && run.lastReward) {
      const before = run.soldi - run.lastReward.total;
      let shown = before;
      this.hud4.setSoldi(before);
      void wait(700).then(() => {
        this.audio.play('coins');
        const n = Math.min(20, run.lastReward!.total);
        const step = run.lastReward!.total / n;
        return flyCoins(this.ov.fxLayer, n, this.hud4.soldiRect(), () => { shown = Math.min(run.soldi, shown + step); this.hud4.setSoldi(Math.round(shown)); });
      }).then(() => this.hud4.setSoldi(run.soldi));
    }
    if (FLAGS.autonav) void wait(2600).then(() => { if (this.screen === 'matchend' && this.run4) { if (win) (this.run4.status === 'won' ? this.showRunEnd4() : this.showShop4()); } });
  }

  showShop4(): void {
    if (!this.run4 || !this.run4.shop) return;
    this.teardownMatch();
    this.screen = 'shop';
    this.audio.play('shop_bell');
    this.audio.setAmbient('shop');
    const save = (r: RunState4) => { this.run4 = r; this.persist4(); return r; };
    const d = () => this.run4!.discount;
    this.shop = new ShopScreen(this.run4, {
      buyUkras: (i, key) => save(R.buyUkras(this.run4!, i, key)),
      buyFora: (i, x) => save(R.buyFora(this.run4!, i, x)),
      buyCasica: (i) => save(R.buyCasica(this.run4!, i)),
      reroll: () => save(R.reroll(this.run4!, d())),
      buyFalsa: (i, key, tg) => save(R.buyFalsa(this.run4!, i, key, tg)),
      move: (from, to) => save(R4.moveUkras(this.run4!, from, to)),
      canMove: () => R4.canMove(this.run4!),
      movePrice: () => R4.movePrice(this.run4!),
      leave: () => {
        if (!this.run4) return;
        const from = this.run4.ladderIndex * 2 + 1;
        this.run4 = R4.leaveShop4(this.run4);
        this.stats4.bestLadder = Math.max(this.stats4.bestLadder, this.run4.ladderIndex + 1);
        saveStats4(this.storage, this.stats4);
        this.persist4();
        this.shop = null;
        this.showMap4(from);
      },
    }, this.ov, this.tex, this.audio);
    void this.ov.show(this.shop.el);
  }

  showRunEnd4(): void {
    if (!this.run4) return;
    this.teardownMatch();
    this.screen = 'runend';
    const run = this.run4;
    if (run.status === 'won') this.stats4.runsWon += 1;
    this.stats4.bestLadder = Math.max(this.stats4.bestLadder, run.ladderIndex + 1);
    this.stats4.bestRunSoldi = Math.max(this.stats4.bestRunSoldi, run.stats.soldiEarned);
    saveStats4(this.storage, this.stats4);
    clearRun4(this.storage);
    const el = runEnd(run, () => { this.run4 = null; this.showMenu(); });
    void this.ov.show(el);
  }

  // ----------------------------------------------------------- debug hook

  private installDebugHook(): void {
    const app = this;
    (window as unknown as { __treseta: unknown }).__treseta = {
      state() {
        return {
          screen: app.screen,
          modalOpen: app.ov.modalOpen,
          run: app.run ? {
            seed: app.run.seed, status: app.run.status, ladderIndex: app.run.ladderIndex, soldi: app.run.soldi,
            fore: app.run.fore, rakijaBase: app.run.rakijaBase, deckSize: app.run.deck.length, revans: app.run.revans,
            shop: app.run.shop, ukrasi: app.run.deck.filter((c) => c.ukras).map((c) => `${c.suit}_${c.rank}:${c.ukras}`),
          } : null,
          mode: app.mode,
          run4: app.run4 ? {
            seed: app.run4.seed, status: app.run4.status, ladderIndex: app.run4.ladderIndex, soldi: app.run4.soldi, partner: app.run4.partner,
            unlocked: app.run4.unlocked, fore: app.run4.fore, rakijaBase: app.run4.rakijaBase, deckSize: app.run4.deck.length, revans: app.run4.revans,
            discount: app.run4.discount, shop: app.run4.shop, ukrasi: app.run4.deck.filter((c) => c.ukras).map((c) => `${c.suit}_${c.rank}:${c.ukras}`),
            partnerChoices: R4.partnerChoices(app.run4),
          } : null,
          match: app.ctrl4?.snapshot() ?? app.ctrl?.snapshot() ?? null,
          render: app.sm?.info(),
          settings: app.settings,
          stats: app.stats,
          assetsVersion: assets.version,
        };
      },
      playCard: (i: number, signal?: string) => (app.ctrl4 ? app.ctrl4.playIndex(i, signal as never) : app.ctrl?.playIndex(i)) ?? false,
      useFora: (id: string, target?: number | string) => (app.ctrl4 ? app.ctrl4.useFora(id as never, target as never) : app.ctrl?.useFora(id as never, target as number)) ?? false,
      continue: () => (app.ctrl4 ?? app.ctrl)?.continueSummary(),
      newRun4: (seed?: string, start?: number) => { app.mode = 'partneri'; app.run4 = R4.newRun4(seed ?? randomSeed(), Date.now(), { start }); app.persist4(); app.showMap4(); },
      pickPartner: (id: string) => {
        if (!app.run4) return false;
        if (!R4.partnerChoices(app.run4).includes(id as CharacterId)) return false;
        app.run4 = R4.pickPartner(app.run4, id as CharacterId); app.persist4(); app.showIntro4(); return true;
      },
      characters: () => Object.fromEntries(Object.values(CHARS).map((c) => [c.id, c.name])),
      newRun: (seed?: string) => { app.run = R.newRun(seed ?? randomSeed(), Date.now()); app.persist(); app.showMap(); },
      skipToShop: () => {
        if (app.mode === 'partneri' && app.run4) {
          app.teardownMatch();
          app.introModal?.close();
          app.introModal = null;
          if (app.run4.ladderIndex >= PAIRS.length - 1) return false;
          if (!app.run4.partner) app.run4 = { ...app.run4, partner: R4.partnerChoices(app.run4)[0] };
          app.run4 = R4.onMatchWon4({ ...app.run4, status: 'match' }, { mi: matchTarget('partneri'), vi: 0 }, 0, Date.now());
          app.persist4();
          app.showShop4();
          return true;
        }
        if (!app.run) return false;
        app.teardownMatch();
        app.introModal?.close();
        app.introModal = null;
        if (app.run.ladderIndex >= DVOBOJ_LADDER.length - 1) return false;
        app.run = R.onMatchWon({ ...app.run, status: 'match' }, { player: matchTarget('dvoboj'), bot: 0 }, 0, Date.now());
        app.persist();
        app.showShop();
        return true;
      },
      setSpeed: (n: number) => gsap.globalTimeline.timeScale(n),
      /** Debug: end the current match with the given result. */
      endMatch: (win: boolean) => {
        if (app.ctrl4 && app.run4 && app.screen === 'match') {
          const ak = app.ctrl4.match?.akuzaPointsMi ?? 0;
          app.ctrl4.forceEnd();
          const tg = matchTarget('partneri');
          void app.matchOver4(win, win ? { mi: tg, vi: 3 } : { mi: 3, vi: tg }, ak);
          return true;
        }
        if (!app.run || app.screen !== 'match' || !app.ctrl) return false;
        const akuza = app.ctrl.match?.akuzaPointsPlayer ?? 0;
        app.ctrl.forceEnd();
        void app.debugMatchOver(win, win ? { player: matchTarget('dvoboj'), bot: 5 } : { player: 5, bot: matchTarget('dvoboj') }, akuza);
        return true;
      },
      /** Debug: patch the run (fore, ukrasi by card key, soldi, rakijaBase). */
      patchRun: (p: { fore?: string[]; ukrasi?: Record<string, string>; soldi?: number; rakijaBase?: number }) => {
        if (app.mode === 'partneri' && app.run4) {
          const r4 = structuredClone(app.run4);
          if (p.fore) r4.fore = p.fore as never;
          if (p.soldi !== undefined) r4.soldi = p.soldi;
          if (p.rakijaBase) r4.rakijaBase = p.rakijaBase;
          if (p.ukrasi) for (const c of r4.deck) { const u = p.ukrasi[`${c.suit}_${c.rank}`]; if (u) c.ukras = u as never; }
          app.run4 = r4;
          app.persist4();
          return true;
        }
        if (!app.run) return false;
        const r = structuredClone(app.run);
        if (p.fore) r.fore = p.fore as never;
        if (p.soldi !== undefined) r.soldi = p.soldi;
        if (p.rakijaBase) r.rakijaBase = p.rakijaBase;
        if (p.ukrasi) for (const c of r.deck) { const u = p.ukrasi[`${c.suit}_${c.rank}`]; if (u) c.ukras = u as never; }
        app.run = r;
        app.persist();
        return true;
      },
      log: () => (app.ctrl4 ?? app.ctrl)?.log.slice(-50) ?? [],
      opponents: () => DVOBOJ_LADDER.map((m) => CHARS[m.opp].name),
    };
  }
}

const app = new App();
void app.boot().catch((e) => {
  console.error('[boot] failed', e);
});
