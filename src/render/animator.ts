// All A-numbered 3D animations (§11.1) as Promise-returning methods.
import * as THREE from 'three';
import gsap from 'gsap';
import type { AudioManager } from '../audio/audio';
import { compareCards } from '../game/cards';
import type { CardInst, Side } from '../game/types';
import { CardObject, CardStack, CardTextures, flatQuat, GLOW } from './cardMesh';
import type { FX } from './fx';
import {
  BOT_SCALE, botSlot, DECK_BOT, DECK_PLAYER, DEG, MAC_BOT, MAC_BOT_YAW, MAC_PLAYER, MAC_PLAYER_YAW, PILE_BOT,
  PILE_PLAYER, playerSlot, REVEAL_BOT, REVEAL_BOT_SCALE, REVEAL_PLAYER, REVEAL_PLAYER_SCALE, SHOWCASE, SHOWCASE_GAP,
  SHOWCASE_SCALE, trickSlot,
} from './layout';
import type { SceneManager } from './scene';

export function wait(ms: number): Promise<void> {
  return new Promise((res) => { gsap.delayedCall(ms / 1000, res); });
}

/** Promise that resolves (with nothing) when a timeline/tween completes. */
export function done(anim: gsap.core.Animation): Promise<void> {
  return new Promise((res) => { anim.eventCallback('onComplete', () => res()); });
}

function tweenP(target: gsap.TweenTarget, vars: gsap.TweenVars): Promise<void> {
  return new Promise((res) => { gsap.to(target, { ...vars, onComplete: () => res() }); });
}

const UP = new THREE.Vector3(0, 1, 0);

interface FlyOpts {
  pos: THREE.Vector3;
  quat: THREE.Quaternion;
  scale?: number;
  dur: number; // ms
  ease?: string;
  rotEase?: string;
  arc?: number; // control point lift
  flipTo?: boolean; // final faceUp
  flipWindow?: [number, number];
  onT?: (t: number) => void;
  marks?: { at: number; fn: () => void }[];
}

export class Animator {
  handGroup = new THREE.Group();
  cards = new Map<string, CardObject>();
  playerHand: CardObject[] = [];
  botHand: CardObject[] = [];
  macs: Record<Side, CardStack>;
  piles: Record<Side, CardStack>;
  decks: Record<Side, CardStack>;
  showBotFaces = false;
  private pulse = { v: 0.25 };
  private pulseTween: gsap.core.Tween | null = null;
  legalSet: Set<string> | null = null; // null = not the player's turn
  targetMode = false;

  constructor(public sm: SceneManager, public fx: FX, public tex: CardTextures, public audio: AudioManager) {
    sm.camera.add(this.handGroup);
    // phones: bring the hand closer to the camera and lift it, so whole cards and their corners show
    const placeHand = () => {
      const phone = document.documentElement.classList.contains('phone');
      this.handGroup.position.set(0, phone ? 0.5 : 0, phone ? 2.0 : 0);
    };
    placeHand();
    sm.resizeListeners.push(placeHand);
    this.macs = {
      player: new CardStack('player', tex, MAC_PLAYER, MAC_PLAYER_YAW, 0.02),
      bot: new CardStack('player', tex, MAC_BOT, MAC_BOT_YAW, 0.02),
    };
    this.piles = {
      player: new CardStack('player', tex, PILE_PLAYER, 0, 12 * DEG),
      bot: new CardStack('player', tex, PILE_BOT, 0, 12 * DEG),
    };
    this.decks = {
      player: new CardStack('player', tex, DECK_PLAYER, -4 * DEG, 0.015),
      bot: new CardStack('player', tex, DECK_BOT, 4 * DEG, 0.015),
    };
    // piles mix both owners' backs; use the player's back for its pile, bot's for its pile
    for (const s of [this.macs.player, this.macs.bot, this.piles.player, this.piles.bot, this.decks.player, this.decks.bot]) sm.scene.add(s.mesh);
    // deck stacks get their own fading material
    for (const side of ['player', 'bot'] as Side[]) {
      const m = (this.decks[side].mesh.material as THREE.MeshStandardMaterial).clone();
      m.transparent = true;
      this.decks[side].mesh.material = m;
    }
    sm.onUpdate(() => this.tickGlow());
  }

  // ---------------- card objects ----------------

  obtain(c: CardInst): CardObject {
    let o = this.cards.get(c.uid);
    if (!o) {
      o = new CardObject(c, this.tex);
      this.cards.set(c.uid, o);
    }
    return o;
  }

  release(uid: string): void {
    const o = this.cards.get(uid);
    if (!o) return;
    gsap.killTweensOf(o.root.position); gsap.killTweensOf(o.root.rotation); gsap.killTweensOf(o.root.scale); gsap.killTweensOf(o.flipper.rotation);
    o.dispose();
    this.cards.delete(uid);
    this.playerHand = this.playerHand.filter((x) => x !== o);
    this.botHand = this.botHand.filter((x) => x !== o);
  }

  clearTable(): void {
    for (const uid of [...this.cards.keys()]) this.release(uid);
    this.playerHand = [];
    this.botHand = [];
    for (const s of Object.values(this.macs)) s.setCount(0);
    for (const s of Object.values(this.piles)) s.setCount(0);
    for (const s of Object.values(this.decks)) { s.setCount(0); s.mesh.position.set(0, 0, 0); ((s.mesh.material as THREE.MeshStandardMaterial).opacity = 1); }
  }

  /** World transform helpers */
  toScene(o: CardObject): void {
    if (o.root.parent !== this.sm.scene) this.sm.scene.attach(o.root);
    o.inHand = false;
  }

  handWorld(slot: { x: number; y: number; z: number; rz: number }, extra?: THREE.Vector3): { pos: THREE.Vector3; quat: THREE.Quaternion } {
    this.sm.camera.updateMatrixWorld();
    const local = new THREE.Vector3(slot.x, slot.y, slot.z);
    if (extra) local.add(extra);
    const pos = this.handGroup.localToWorld(local.clone());
    const q = this.sm.camera.getWorldQuaternion(new THREE.Quaternion()).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), slot.rz));
    return { pos, quat: q };
  }

  cameraQuat(): THREE.Quaternion { return this.sm.camera.getWorldQuaternion(new THREE.Quaternion()); }

  /** Generic flight on a quadratic Bézier with slerped rotation (world space). */
  fly(o: CardObject, f: FlyOpts): Promise<void> {
    this.toScene(o);
    const p0 = o.root.position.clone();
    const q0 = o.root.quaternion.clone();
    const s0 = o.root.scale.x;
    const s1 = f.scale ?? s0;
    const ctrl = p0.clone().add(f.pos).multiplyScalar(0.5).add(new THREE.Vector3(0, f.arc ?? 0, 0));
    const flipFrom = o.flipper.rotation.y;
    const flipTarget = f.flipTo === undefined ? flipFrom : f.flipTo ? 0 : Math.PI;
    const [fa, fb] = f.flipWindow ?? [0, 1];
    const posEase = gsap.parseEase(f.ease ?? 'power2.out');
    const rotEase = gsap.parseEase(f.rotEase ?? f.ease ?? 'power2.inOut');
    const marks = (f.marks ?? []).map((m) => ({ ...m, done: false }));
    const st = { t: 0 };
    gsap.killTweensOf(o.root.position);
    gsap.killTweensOf(o.root.rotation);
    gsap.killTweensOf(o.root.scale);
    return new Promise((res) => {
      gsap.to(st, {
        t: 1, duration: f.dur / 1000, ease: 'none',
        onUpdate: () => {
          const t = st.t;
          const e = posEase(t);
          const a = (1 - e) * (1 - e), b = 2 * (1 - e) * e, c = e * e;
          o.root.position.set(a * p0.x + b * ctrl.x + c * f.pos.x, a * p0.y + b * ctrl.y + c * f.pos.y, a * p0.z + b * ctrl.z + c * f.pos.z);
          o.root.quaternion.slerpQuaternions(q0, f.quat, rotEase(t));
          const s = s0 + (s1 - s0) * posEase(t);
          o.root.scale.setScalar(s);
          if (flipTarget !== flipFrom) {
            const ft = Math.min(1, Math.max(0, (t - fa) / Math.max(0.0001, fb - fa)));
            o.flipper.rotation.y = flipFrom + (flipTarget - flipFrom) * gsap.parseEase('sine.inOut')(ft);
          }
          for (const m of marks) if (!m.done && t >= m.at) { m.done = true; m.fn(); }
          f.onT?.(t);
        },
        onComplete: () => {
          o.root.position.copy(f.pos);
          o.root.quaternion.copy(f.quat);
          o.root.scale.setScalar(s1);
          if (flipTarget !== flipFrom) { o.flipper.rotation.y = flipTarget; o.faceUp = flipTarget === 0; }
          for (const m of marks) if (!m.done) m.fn();
          res();
        },
      });
    });
  }

  // ---------------- hand layout (A3) ----------------

  sortPlayerHand(): void {
    this.playerHand.sort((a, b) => compareCards(a.data, b.data));
  }

  /** A3: all hand cards tween to their fan slots (260 ms). */
  layoutPlayer(dur = 260, except?: CardObject): Promise<void> {
    this.sortPlayerHand();
    const n = this.playerHand.length;
    const ps: Promise<void>[] = [];
    this.playerHand.forEach((o, i) => {
      const s = playerSlot(i, n);
      o.slot = s;
      o.root.renderOrder = i;
      if (o === except || o.root.parent !== this.handGroup) return;
      ps.push(this.toSlot(o, dur, 'power2.inOut'));
    });
    return Promise.all(ps).then(() => undefined);
  }

  /** Move a hand card to its slot (honouring hover / lowered state). */
  toSlot(o: CardObject, dur: number, ease: string): Promise<void> {
    const s = o.slot;
    const hov = o.hovered;
    const lowered = this.legalSet && !this.legalSet.has(o.uid) && !this.targetMode ? -0.05 : 0;
    const idx = this.playerHand.indexOf(o);
    const hi = this.playerHand.findIndex((c) => c.hovered);
    let dx = 0;
    if (hi >= 0 && !hov) dx = idx < hi ? -0.18 : idx > hi ? 0.18 : 0;
    gsap.killTweensOf(o.root.position);
    gsap.killTweensOf(o.root.rotation);
    gsap.killTweensOf(o.root.scale);
    const pos = { x: s.x + dx, y: s.y + (hov ? 0.55 : lowered), z: s.z + (hov ? 0.5 : 0) };
    const sc = hov ? 1.25 : 1;
    const rz = hov ? 0 : s.rz;
    return new Promise((res) => {
      const tl = gsap.timeline({ onComplete: () => res() });
      tl.to(o.root.position, { ...pos, duration: dur / 1000, ease }, 0);
      tl.to(o.root.scale, { x: sc, y: sc, z: sc, duration: dur / 1000, ease }, 0);
      tl.to(o.root.rotation, { z: rz, ...(hov ? {} : { x: 0, y: 0 }), duration: dur / 1000, ease }, 0);
    });
  }

  /** Immediately place a card into the hand group at its slot. */
  attachToHand(o: CardObject): void {
    this.handGroup.attach(o.root);
    o.inHand = true;
    o.root.rotation.order = 'XYZ';
    o.setShadow(false);
  }

  layoutBot(dur = 260, except?: CardObject): Promise<void> {
    const n = this.botHand.length;
    const ps: Promise<void>[] = [];
    this.botHand.forEach((o, i) => {
      if (o === except) return;
      const s = botSlot(i, n);
      ps.push(this.fly(o, { pos: s.pos, quat: s.quat, scale: BOT_SCALE, dur, ease: 'power2.inOut', flipTo: this.showBotFaces }));
    });
    return Promise.all(ps).then(() => undefined);
  }

  // ---------------- turn indicator (A28) ----------------

  setLegal(legal: string[] | null, targetMode = false): void {
    this.legalSet = legal ? new Set(legal) : null;
    this.targetMode = targetMode;
    if (legal && !this.pulseTween) {
      this.pulse.v = 0.25;
      this.pulseTween = gsap.to(this.pulse, { v: 0.55, duration: 0.8, ease: 'sine.inOut', yoyo: true, repeat: -1 });
    } else if (!legal && this.pulseTween) {
      this.pulseTween.kill();
      this.pulseTween = null;
    }
    for (const o of this.playerHand) {
      o.setTint(!!legal && !targetMode && !this.legalSet!.has(o.uid));
      if (o.root.parent === this.handGroup && !o.hovered) void this.toSlot(o, 300, 'sine.inOut');
    }
  }

  private flashes = new Map<CardObject, { color: THREE.Color; until: number; peak: number }>();
  flashGlow(o: CardObject, color: THREE.Color, ms: number, peak = 0.9): void {
    this.flashes.set(o, { color, until: performance.now() + ms / gsap.globalTimeline.timeScale(), peak });
  }

  winners = new Set<CardObject>();
  private winGlow = { v: 0 };

  private tickGlow(): void {
    const now = performance.now();
    for (const o of this.cards.values()) {
      const f = this.flashes.get(o);
      if (f) {
        if (now > f.until) this.flashes.delete(o);
        else { o.setGlow(f.color, f.peak * Math.min(1, (f.until - now) / 200)); continue; }
      }
      if (this.winners.has(o)) { o.setGlow(GLOW.win, this.winGlow.v); continue; }
      if (o.inHand && this.legalSet) {
        if (this.targetMode) o.setGlow(GLOW.target, o.hovered ? 0.95 : 0.6);
        else if (this.legalSet.has(o.uid)) o.setGlow(GLOW.legal, o.hovered ? 0.9 : this.pulse.v);
        else o.setGlow(GLOW.legal, 0);
      } else if (o.inHand && o.hovered) {
        o.setGlow(GLOW.legal, 0.35);
      } else {
        o.setGlow(GLOW.legal, 0);
      }
    }
  }

  // ---------------- A4 illegal shake ----------------

  async illegalShake(o: CardObject): Promise<void> {
    this.audio.play('ui_error');
    this.flashGlow(o, GLOW.error, 300);
    const x0 = o.slot.x;
    const offs = [0, -0.08, 0.08, -0.06, 0.06, -0.03, 0];
    gsap.killTweensOf(o.root.position, 'x');
    const tl = gsap.timeline();
    const seg = 0.32 / (offs.length - 1);
    offs.forEach((d, i) => { if (i > 0) tl.to(o.root.position, { x: x0 + d, duration: seg, ease: 'none' }); });
    await done(tl);
  }

  // ---------------- A7/A8/A9/A10 play to trick ----------------

  async playerToTrick(o: CardObject, first: boolean, strong: boolean): Promise<void> {
    this.playerHand = this.playerHand.filter((x) => x !== o);
    o.hovered = false;
    o.setTint(false);
    o.setShadow(true);
    const slot = trickSlot('player', first, Math.random() * 2 - 1);
    this.audio.play('card_slide');
    const relayout = this.layoutPlayer(260);
    await this.fly(o, { pos: slot.pos, quat: slot.quat, scale: 1, dur: 420, ease: 'power3.out', rotEase: 'power2.inOut', arc: 1.6, flipTo: true });
    await this.land(o, strong);
    await relayout;
  }

  async botToTrick(o: CardObject, first: boolean, strong: boolean): Promise<void> {
    this.botHand = this.botHand.filter((x) => x !== o);
    o.setShadow(true);
    const slot = trickSlot('bot', first, Math.random() * 2 - 1);
    // lift out of the fan (+0.3 y in 80 ms)
    await tweenP(o.root.position, { y: o.root.position.y + 0.3, duration: 0.08, ease: 'power1.out' });
    this.audio.play('card_slide');
    const relayout = this.layoutBot(260);
    await this.fly(o, {
      pos: slot.pos, quat: slot.quat, scale: 1, dur: 450, ease: 'power3.out', rotEase: 'power2.inOut', arc: 1.4,
      flipTo: true, flipWindow: [0.3, 0.7], marks: [{ at: 0.5, fn: () => this.audio.play('card_flip') }],
    });
    await this.land(o, strong);
    await relayout;
  }

  /** A8 land squash + dust; A10 strong FX replaces card_place with card_slam_strong. */
  async land(o: CardObject, strong: boolean): Promise<void> {
    const at = o.root.position.clone();
    this.fx.dust(at);
    if (strong) {
      this.audio.play('card_slam_strong');
      this.fx.shake(0.06, 250);
      this.fx.sparks(at);
      this.fx.flash();
    } else {
      this.audio.play('card_place');
    }
    await tweenP(o.root.scale, { x: 1.06, y: 1.06, z: 1.06, duration: 0.06, ease: 'power1.out', yoyo: true, repeat: 1 });
  }

  /** Vrati!: the led card goes back into its owner's hand. */
  async returnToHand(o: CardObject, side: Side): Promise<void> {
    if (side === 'player') {
      this.playerHand.push(o);
      this.sortPlayerHand();
      const i = this.playerHand.indexOf(o);
      const s = playerSlot(i, this.playerHand.length);
      o.slot = s;
      const w = this.handWorld(s);
      const p = this.layoutPlayer(320, o);
      await this.fly(o, { pos: w.pos, quat: w.quat, scale: 1, dur: 380, ease: 'power2.inOut', arc: 0.8 });
      this.attachToHand(o);
      o.root.position.set(s.x, s.y, s.z); o.root.rotation.set(0, 0, s.rz); o.root.scale.setScalar(1);
      await p;
    } else {
      this.botHand.push(o);
      const n = this.botHand.length;
      const s = botSlot(n - 1, n);
      const p = this.layoutBot(320, o);
      await this.fly(o, { pos: s.pos, quat: s.quat, scale: BOT_SCALE, dur: 380, ease: 'power2.inOut', arc: 0.8, flipTo: this.showBotFaces });
      await p;
    }
  }

  // ---------------- A11–A14 trick resolution ----------------

  async resolveTrick(winnerCard: CardObject, loserCard: CardObject, winner: Side): Promise<void> {
    // A11 hold 550 with A12 glow (200) inside
    this.winners.add(winnerCard);
    this.winGlow.v = 0;
    gsap.to(this.winGlow, { v: 0.9, duration: 0.2, ease: 'power2.out' });
    await wait(550);
    // A13 gather 180
    const wp = winnerCard.root.position.clone();
    await this.fly(loserCard, { pos: new THREE.Vector3(wp.x, wp.y + 0.01, wp.z), quat: winnerCard.root.quaternion.clone(), dur: 180, ease: 'power2.in' });
    this.winners.delete(winnerCard);
    winnerCard.setGlow(GLOW.win, 0);
    // A14 sweep 380 to pile, spinning 90° about y, flipping face down at 50%
    const pile = this.piles[winner];
    const target = pile.topPosition(1);
    this.audio.play('trick_whoosh');
    const spinQ = (o: CardObject) => new THREE.Quaternion().setFromAxisAngle(UP, Math.PI / 2).multiply(o.root.quaternion.clone());
    await Promise.all([winnerCard, loserCard].map((o, k) => this.fly(o, {
      pos: target.clone().add(new THREE.Vector3(0, 0.004 * k, 0)), quat: spinQ(o), dur: 380, ease: 'power2.inOut', arc: 0.4,
      flipTo: false, flipWindow: [0.35, 0.65],
    })));
    this.audio.play('card_pile');
    this.release(winnerCard.uid);
    this.release(loserCard.uid);
    pile.setCount(pile.count + 2);
  }

  // ---------------- A16–A19 draws ----------------

  /** A16 mac -> reveal point (380), A17 hold (600). Returns when the hold ends. */
  async drawToReveal(c: CardInst, side: Side, onHoldStart?: () => void): Promise<CardObject> {
    const mac = this.macs[side];
    const o = this.obtain(c);
    o.setFaceUp(false);
    o.setShadow(true);
    this.toScene(o);
    o.root.position.copy(mac.topPosition());
    o.root.quaternion.copy(flatQuat(side === 'player' ? MAC_PLAYER_YAW : MAC_BOT_YAW, true));
    o.root.scale.setScalar(1);
    mac.setCount(mac.count - 1);
    this.audio.play('card_slide');
    const pos = side === 'player' ? REVEAL_PLAYER : REVEAL_BOT;
    const scale = side === 'player' ? REVEAL_PLAYER_SCALE : REVEAL_BOT_SCALE;
    await this.fly(o, {
      pos, quat: this.cameraQuat(), scale, dur: 380, ease: 'power2.out', arc: 0.6, flipTo: true,
      flipWindow: [0.2, 0.75], marks: [{ at: 0.6, fn: () => this.audio.play('card_flip') }],
    });
    onHoldStart?.();
    return o;
  }

  /** A18 reveal -> hand (320). */
  async revealToHand(o: CardObject, side: Side): Promise<void> {
    if (side === 'player') {
      this.playerHand.push(o);
      this.sortPlayerHand();
      const n = this.playerHand.length;
      const i = this.playerHand.indexOf(o);
      const s = playerSlot(i, n);
      o.slot = s;
      const w = this.handWorld(s);
      const p = this.layoutPlayer(320, o);
      await this.fly(o, { pos: w.pos, quat: w.quat, scale: 1, dur: 320, ease: 'power2.inOut', arc: 0.3 });
      this.attachToHand(o);
      o.root.position.set(s.x, s.y, s.z);
      o.root.rotation.set(0, 0, s.rz);
      o.root.scale.setScalar(1);
      if (this.legalSet) o.setTint(!this.legalSet.has(o.uid));
      await p;
    } else {
      this.botHand.push(o);
      const n = this.botHand.length;
      const s = botSlot(n - 1, n);
      const p = this.layoutBot(320, o);
      await this.fly(o, { pos: s.pos, quat: s.quat, scale: BOT_SCALE, dur: 320, ease: 'power2.inOut', arc: 0.4, flipTo: this.showBotFaces });
      await p;
    }
  }

  /** Zamjena: hand card goes face-down to the bottom of the mac. */
  async cardToMac(o: CardObject, side: Side): Promise<void> {
    if (side === 'player') this.playerHand = this.playerHand.filter((x) => x !== o);
    else this.botHand = this.botHand.filter((x) => x !== o);
    o.hovered = false;
    const mac = this.macs[side];
    const p = side === 'player' ? this.layoutPlayer(260) : this.layoutBot(260);
    this.audio.play('card_slide');
    await this.fly(o, { pos: mac.base.clone().add(new THREE.Vector3(0, 0.004, 0)), quat: flatQuat(side === 'player' ? MAC_PLAYER_YAW : MAC_BOT_YAW, true), scale: 1, dur: 340, ease: 'power2.inOut', arc: 0.8, flipTo: false });
    this.release(o.uid);
    mac.setCount(mac.count + 1);
    await p;
  }

  // ---------------- A20–A22 shuffle, deal, mac ----------------

  /** A20: deck stacks split, hop 3 times and interleave (700 ms). */
  async shuffle(sizes: Record<Side, number>): Promise<void> {
    this.audio.play('shuffle');
    const ps: Promise<void>[] = [];
    for (const side of ['player', 'bot'] as Side[]) {
      const d = this.decks[side];
      (d.mesh.material as THREE.MeshStandardMaterial).opacity = 1;
      d.mesh.position.set(0, 0, 0);
      d.setCount(sizes[side]);
      const tl = gsap.timeline();
      const half = { x: 0, y: 0 };
      tl.to(half, { x: 0.45, duration: 0.12, ease: 'sine.inOut' });
      for (let k = 0; k < 3; k++) {
        tl.to(half, { y: 0.15, duration: 0.07, ease: 'sine.out' });
        tl.to(half, { y: 0, duration: 0.07, ease: 'sine.in' });
      }
      tl.to(half, { x: 0, duration: 0.16, ease: 'sine.inOut' });
      tl.eventCallback('onUpdate', () => {
        d.mesh.position.set(Math.sin(half.x * 20) * 0.02, half.y, 0);
        d.mesh.rotation.y = half.x * 0.12 * (side === 'player' ? 1 : -1);
      });
      ps.push(done(tl).then(() => { d.mesh.position.set(0, 0, 0); d.mesh.rotation.y = 0; }));
    }
    await Promise.all(ps);
  }

  /** A21: packets of 5 (player, bot, player, bot), flight 300, stagger 90; A22 mac form + remainder. */
  async deal(hands: Record<Side, CardInst[]>, macSize: Record<Side, number>, restSize: Record<Side, number>): Promise<void> {
    const order: [Side, number][] = [];
    for (const [side, from] of [['player', 0], ['bot', 0], ['player', 5], ['bot', 5]] as [Side, number][]) {
      for (let i = from; i < from + 5 && i < hands[side].length; i++) order.push([side, i]);
    }
    // final slots
    const playerSorted = hands.player.slice().sort(compareCards);
    const flights: Promise<void>[] = [];
    let k = 0;
    for (const [side, i] of order) {
      const c = hands[side][i];
      const delay = k * 90;
      k++;
      flights.push(wait(delay).then(async () => {
        const deck = this.decks[side];
        const o = this.obtain(c);
        o.setFaceUp(false);
        o.setShadow(true);
        this.toScene(o);
        o.root.position.copy(deck.topPosition()).add(deck.mesh.position);
        o.root.quaternion.copy(flatQuat(deck.yaw, true));
        o.root.scale.setScalar(1);
        deck.setCount(deck.count - 1);
        this.audio.play('deal', { rate: 0.95 + Math.random() * 0.1, minGapMs: 70 });
        if (side === 'player') {
          const idx = playerSorted.indexOf(c);
          const s = playerSlot(idx, playerSorted.length);
          o.slot = s;
          const w = this.handWorld(s);
          await this.fly(o, { pos: w.pos, quat: w.quat, scale: 1, dur: 300, ease: 'power2.out', arc: 0.8 });
          this.attachToHand(o);
          o.root.position.set(s.x, s.y, s.z);
          o.root.rotation.set(0, 0, s.rz);
          this.playerHand.push(o);
          // flip face up on arrival (200 ms)
          o.faceUp = true;
          await tweenP(o.flipper.rotation, { y: 0, duration: 0.2, ease: 'power2.out' });
        } else {
          const n = hands.bot.length;
          const s = botSlot(i, n);
          await this.fly(o, { pos: s.pos, quat: s.quat, scale: BOT_SCALE, dur: 300, ease: 'power2.out', arc: 0.6, flipTo: this.showBotFaces });
          this.botHand.splice(Math.min(i, this.botHand.length), 0, o);
        }
      }));
    }
    await Promise.all(flights);
    this.botHand.sort((a, b) => hands.bot.indexOf(a.data) - hands.bot.indexOf(b.data));
    this.sortPlayerHand();
    await this.formMacs(macSize, restSize);
  }

  /** A22: the next 10 slide to the mac; the remainder slides off the table edge and fades (300 ms). */
  async formMacs(macSize: Record<Side, number>, restSize: Record<Side, number>): Promise<void> {
    const ps: Promise<void>[] = [];
    for (const side of ['player', 'bot'] as Side[]) {
      const deck = this.decks[side];
      const mac = this.macs[side];
      // temporary moving stack for the mac cards
      const mover = new CardStack(side, this.tex, deck.base.clone(), deck.yaw, 0.015, 12);
      this.sm.scene.add(mover.mesh);
      mover.base.y = 0.004 * restSize[side];
      mover.setCount(macSize[side]);
      deck.setCount(restSize[side]);
      const from = mover.base.clone();
      const st = { t: 0 };
      ps.push(tweenP(st, {
        t: 1, duration: 0.3, ease: 'power2.out',
        onUpdate: () => {
          mover.mesh.position.set((mac.base.x - from.x) * st.t, (0 - from.y) * st.t + Math.sin(st.t * Math.PI) * 0.25, (mac.base.z - from.z) * st.t);
        },
      }).then(() => {
        mover.mesh.removeFromParent();
        mover.mesh.dispose();
        mac.setCount(macSize[side]);
      }));
      const mat = deck.mesh.material as THREE.MeshStandardMaterial;
      const dir = side === 'player' ? 1 : -1;
      const fade = { t: 0 };
      ps.push(wait(120).then(() => tweenP(fade, {
        t: 1, duration: 0.3, ease: 'power2.out',
        onUpdate: () => {
          deck.mesh.position.set(dir * 2 * fade.t, 0, dir * 0.4 * fade.t);
          mat.opacity = 1 - fade.t;
        },
      })).then(() => { deck.setCount(0); deck.mesh.position.set(0, 0, 0); mat.opacity = 1; }));
    }
    await Promise.all(ps);
  }

  // ---------------- A23 akuza showcase (3D part) ----------------

  async akuzaShow(uids: string[], side: Side, hold: () => Promise<void>): Promise<void> {
    const objs = uids.map((u) => this.cards.get(u)).filter((o): o is CardObject => !!o);
    if (objs.length === 0) { await hold(); return; }
    const q = this.cameraQuat();
    const n = objs.length;
    const camRight = new THREE.Vector3(1, 0, 0).applyQuaternion(q);
    await Promise.all(objs.map((o, i) => {
      o.hovered = false;
      const pos = SHOWCASE.clone().addScaledVector(camRight, (i - (n - 1) / 2) * SHOWCASE_GAP);
      return this.fly(o, { pos, quat: q, scale: SHOWCASE_SCALE, dur: 500, ease: 'back.out(1.7)', rotEase: 'power2.out', arc: 0.6, flipTo: true });
    }));
    objs.forEach((o) => this.flashGlow(o, GLOW.win, 1400, 0.8));
    await hold();
    // back to the hand (out 400, power2.in)
    if (side === 'player') {
      const ps = objs.map((o) => {
        const s = o.slot;
        const w = this.handWorld(s);
        return this.fly(o, { pos: w.pos, quat: w.quat, scale: 1, dur: 400, ease: 'power2.in', arc: 0.2 }).then(() => {
          this.attachToHand(o);
          o.root.position.set(s.x, s.y, s.z);
          o.root.rotation.set(0, 0, s.rz);
          o.root.scale.setScalar(1);
        });
      });
      await Promise.all(ps);
    } else {
      const n2 = this.botHand.length;
      await Promise.all(objs.map((o) => {
        const i = this.botHand.indexOf(o);
        const s = botSlot(Math.max(0, i), n2);
        return this.fly(o, { pos: s.pos, quat: s.quat, scale: BOT_SCALE, dur: 400, ease: 'power2.in', arc: 0.3, flipTo: this.showBotFaces });
      }));
    }
  }

  // ---------------- A27b Pogled ----------------

  /** Player used Pogled: bot cards lift, flip face up for 1200 ms, flip back. */
  async pogledReveal(uids: string[]): Promise<void> {
    const objs = uids.map((u) => this.cards.get(u)).filter((o): o is CardObject => !!o);
    await Promise.all(objs.map(async (o) => {
      this.flashGlow(o, GLOW.pogled, 1600, 0.7);
      const p0 = o.root.position.clone();
      const q0 = o.root.quaternion.clone();
      const q1 = flatQuat(0, true);
      await this.fly(o, { pos: p0.clone().add(new THREE.Vector3(0, 0.3, 0.25)), quat: q1, scale: 1, dur: 400, ease: 'power2.out', flipTo: true });
      await wait(1200);
      await this.fly(o, { pos: p0, quat: q0, scale: BOT_SCALE, dur: 400, ease: 'power2.inOut', flipTo: this.showBotFaces });
    }));
  }

  /** Bot used Pogled: targeted player cards flash red for 600 ms. */
  botPeek(uids: string[]): void {
    for (const u of uids) {
      const o = this.cards.get(u);
      if (o) this.flashGlow(o, GLOW.pogled, 600, 1);
    }
  }

  setBotFaces(show: boolean): void {
    this.showBotFaces = show;
    for (const o of this.botHand) o.setFaceUp(show);
  }

  /** Screen position of a world point (CSS px). */
  screenOf(v: THREE.Vector3): { x: number; y: number } {
    const p = this.sm.toScreen(v);
    return { x: p.x, y: p.y };
  }

  screenOfCard(o: CardObject): { x: number; y: number } {
    return this.screenOf(o.root.getWorldPosition(new THREE.Vector3()));
  }
}
