// Partneri 3D animations (§18.8): 4-seat deal, seat → trick, 4-card resolution to the team
// pile, Vrati!, akuža showcase from any seat, Zamjena swap and the pinned signal icon.
// Subclass of the Dvoboj Animator, whose methods stay untouched.
import * as THREE from 'three';
import gsap from 'gsap';
import type { AudioManager } from '../audio/audio';
import { compareCards } from '../game/cards';
import type { CardInst, Side } from '../game/types';
import type { Card4, Seat, Signal, Team } from '../game/types4';
import { nextSeat } from '../game/types4';
import { Animator, done, wait } from './animator';
import { CardObject, CardStack, CardTextures, flatQuat, GLOW } from './cardMesh';
import type { FX } from './fx';
import { BOT_SCALE, botSlot, DECK4, DECK_B2, DECK_P2, DEG, PILE_MI, PILE_VI, playerSlot, SHARED_MAC, SHARED_MAC_YAW, SHOWCASE, SHOWCASE_GAP, SHOWCASE_SCALE, seatSlot, TRICK4, trickSlot4 } from './layout';
import type { BotSeat } from './layout';
import type { SceneManager } from './scene';

const UP = new THREE.Vector3(0, 1, 0);

function tweenP(target: gsap.TweenTarget, vars: gsap.TweenVars): Promise<void> {
  return new Promise((res) => { gsap.to(target, { ...vars, onComplete: () => res() }); });
}

/** 24×24 SVG paths for the three signals (shared with the HUD buttons / callout). */
export const SIGNAL_PATHS: Record<Signal, { d: string; stroke?: boolean }> = {
  tucem: { d: 'M12 1.8 14.6 8.4 21.6 7.4 17 12.4 21.2 17.9 14.4 16.2 12 22.6 9.6 16.2 2.8 17.9 7 12.4 2.4 7.4 9.4 8.4Z' },
  striso: { d: 'M3 9.5c3-3.2 6-3.2 9 0s6 3.2 9 0M3 15.5c3-3.2 6-3.2 9 0s6 3.2 9 0', stroke: true },
  volo: { d: 'M12 2.5 20 11.5H15V21.5H9V11.5H4Z' },
};

const iconTex = new Map<Signal, THREE.Texture>();
function signalTexture(kind: Signal): THREE.Texture {
  let t = iconTex.get(kind);
  if (t) return t;
  const cv = document.createElement('canvas');
  cv.width = cv.height = 128;
  const ctx = cv.getContext('2d')!;
  ctx.fillStyle = '#2A1A10';
  ctx.beginPath(); ctx.arc(64, 64, 60, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#D9A441'; ctx.lineWidth = 6; ctx.stroke();
  ctx.save();
  ctx.translate(64 - 12 * 3.4, 64 - 12 * 3.4);
  ctx.scale(3.4, 3.4);
  const p = new Path2D(SIGNAL_PATHS[kind].d);
  if (SIGNAL_PATHS[kind].stroke) { ctx.strokeStyle = '#F3E6C8'; ctx.lineWidth = 2.4; ctx.lineCap = 'round'; ctx.stroke(p); }
  else { ctx.fillStyle = '#F3E6C8'; ctx.fill(p); }
  ctx.restore();
  t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  iconTex.set(kind, t);
  return t;
}

export class Animator4 extends Animator {
  seatHands: Record<BotSeat, CardObject[]> = { W: [], N: [], E: [] };
  teamPiles: Record<Team, CardStack>;
  deck4: CardStack;
  /** Dvoboj §19.3.4: the shared mac */
  sharedMac: CardStack;
  showSeatFaces = false;

  constructor(sm: SceneManager, fx: FX, tex: CardTextures, audio: AudioManager) {
    super(sm, fx, tex, audio);
    // one deck: every back is the player's back (§18.8)
    this.teamPiles = { mi: new CardStack('player', tex, PILE_MI, 0, 12 * DEG), vi: new CardStack('player', tex, PILE_VI, 0, 12 * DEG) };
    this.deck4 = new CardStack('player', tex, DECK4.E.clone(), 0, 0.015);
    this.sharedMac = new CardStack('player', tex, SHARED_MAC.clone(), SHARED_MAC_YAW, 0.02);
    for (const s of [this.teamPiles.mi, this.teamPiles.vi, this.deck4, this.sharedMac]) sm.scene.add(s.mesh);
  }

  override release(uid: string): void {
    const o = this.cards.get(uid);
    super.release(uid);
    if (!o) return;
    for (const s of ['W', 'N', 'E'] as BotSeat[]) this.seatHands[s] = this.seatHands[s].filter((x) => x !== o);
  }

  override clearTable(): void {
    super.clearTable();
    this.seatHands = { W: [], N: [], E: [] };
    this.teamPiles.mi.setCount(0);
    this.teamPiles.vi.setCount(0);
    this.deck4.setCount(0);
    this.deck4.mesh.position.set(0, 0, 0);
    this.sharedMac.setCount(0);
  }

  // ---------------- Dvoboj on one deck (§19.3.4) ----------------

  /** Shuffle at the dealer's stack, deal packets of 5 (non-dealer first), then the 20 slide to the mac. */
  async deal2(hands: Record<Side, CardInst[]>, dealer: Side, macCount: number): Promise<void> {
    const d = this.deck4;
    d.base.copy(dealer === 'player' ? DECK_P2 : DECK_B2);
    d.yaw = (dealer === 'player' ? -4 : 4) * DEG;
    d.mesh.position.set(0, 0, 0);
    d.setCount(40);
    this.audio.play('shuffle');
    await this.shuffleStack(d);
    const nonDealer: Side = dealer === 'player' ? 'bot' : 'player';
    const order: [Side, number][] = [[nonDealer, 0], [dealer, 0], [nonDealer, 5], [dealer, 5]];
    const sorted = hands.player.slice().sort(compareCards);
    const flights: Promise<void>[] = [];
    order.forEach(([side, from], packet) => {
      for (let j = 0; j < 5; j++) {
        const c = hands[side][from + j];
        if (!c) continue;
        flights.push(wait(packet * (5 * 60 + 250) + j * 60).then(() => this.dealOne2(c, side, from + j, sorted, hands)));
      }
    });
    await Promise.all(flights);
    this.botHand.sort((a, b) => hands.bot.findIndex((x) => x.uid === a.uid) - hands.bot.findIndex((x) => x.uid === b.uid));
    this.sortPlayerHand();
    // the remaining cards slide to the shared mac (300 ms)
    const from = d.base.clone();
    const to = this.sharedMac.base.clone();
    const st = { t: 0 };
    this.audio.play('card_slide');
    await new Promise<void>((res) => gsap.to(st, {
      t: 1, duration: 0.3, ease: 'power2.inOut',
      onUpdate: () => d.mesh.position.set((to.x - from.x) * st.t, 0.15 * Math.sin(Math.PI * st.t), (to.z - from.z) * st.t),
      onComplete: () => res(),
    }));
    d.setCount(0);
    d.mesh.position.set(0, 0, 0);
    this.sharedMac.setCount(macCount);
  }

  private async shuffleStack(d: CardStack): Promise<void> {
    const tl = gsap.timeline();
    const half = { x: 0, y: 0 };
    tl.to(half, { x: 0.45, duration: 0.14, ease: 'sine.inOut' });
    for (let k = 0; k < 3; k++) { tl.to(half, { y: 0.16, duration: 0.07, ease: 'sine.out' }); tl.to(half, { y: 0, duration: 0.07, ease: 'sine.in' }); }
    tl.to(half, { x: 0, duration: 0.14, ease: 'sine.inOut' });
    tl.eventCallback('onUpdate', () => { d.mesh.position.set(Math.sin(half.x * 20) * 0.02, half.y, 0); d.mesh.rotation.y = half.x * 0.12; });
    await done(tl);
    d.mesh.position.set(0, 0, 0);
    d.mesh.rotation.y = 0;
  }

  private async dealOne2(c: CardInst, side: Side, i: number, sorted: CardInst[], hands: Record<Side, CardInst[]>): Promise<void> {
    const d = this.deck4;
    const o = this.obtain(c);
    o.setFaceUp(false);
    o.setShadow(true);
    this.toScene(o);
    o.root.position.copy(d.topPosition());
    o.root.quaternion.copy(flatQuat(d.yaw, true));
    o.root.scale.setScalar(1);
    d.setCount(d.count - 1);
    this.audio.play('deal', { rate: 0.95 + Math.random() * 0.1, minGapMs: 70 });
    if (side === 'player') {
      const idx = sorted.indexOf(c);
      const sl = playerSlot(idx, sorted.length);
      o.slot = sl;
      const w = this.handWorld(sl);
      await this.fly(o, { pos: w.pos, quat: w.quat, scale: 1, dur: 280, ease: 'power2.out', arc: 0.8 });
      this.attachToHand(o);
      o.root.position.set(sl.x, sl.y, sl.z);
      o.root.rotation.set(0, 0, sl.rz);
      this.playerHand.push(o);
      o.faceUp = true;
      await tweenP(o.flipper.rotation, { y: 0, duration: 0.2, ease: 'power2.out' });
    } else {
      const sl = botSlot(i, hands.bot.length);
      await this.fly(o, { pos: sl.pos, quat: sl.quat, scale: BOT_SCALE, dur: 280, ease: 'power2.out', arc: 0.6, flipTo: this.showBotFaces });
      this.botHand.push(o);
    }
  }

  /** Hidden draw: player → fan, flipping up in the last 40% (420 ms); bot → fan face down (380 ms). */
  async drawHidden(c: CardInst, side: Side): Promise<void> {
    const mac = this.sharedMac;
    const o = this.obtain(c);
    o.setFaceUp(false);
    o.setShadow(true);
    this.toScene(o);
    o.root.position.copy(mac.topPosition());
    o.root.quaternion.copy(flatQuat(mac.yaw, true));
    o.root.scale.setScalar(1);
    mac.setCount(mac.count - 1);
    this.audio.play('card_slide');
    if (side === 'player') {
      this.playerHand.push(o);
      this.sortPlayerHand();
      const i = this.playerHand.indexOf(o);
      const sl = playerSlot(i, this.playerHand.length);
      o.slot = sl;
      const w = this.handWorld(sl);
      const relayout = this.layoutPlayer(380, o);
      await this.fly(o, { pos: w.pos, quat: w.quat, scale: 1, dur: 420, ease: 'power2.inOut', arc: 0.7, flipTo: true, flipWindow: [0.6, 1] });
      this.attachToHand(o);
      o.root.position.set(sl.x, sl.y, sl.z);
      o.root.rotation.set(0, 0, sl.rz);
      o.root.scale.setScalar(1);
      await relayout;
    } else {
      this.botHand.push(o);
      const n = this.botHand.length;
      const sl = botSlot(n - 1, n);
      const relayout = this.layoutBot(340, o);
      await this.fly(o, { pos: sl.pos, quat: sl.quat, scale: BOT_SCALE, dur: 380, ease: 'power2.inOut', arc: 0.5, flipTo: this.showBotFaces });
      await relayout;
    }
  }

  /** Zamjena (Dvoboj): a hand card goes face down to the bottom of the shared mac. */
  async toMacBottom(o: CardObject, side: Side): Promise<void> {
    if (side === 'player') this.playerHand = this.playerHand.filter((x) => x !== o);
    else this.botHand = this.botHand.filter((x) => x !== o);
    const mac = this.sharedMac;
    const relayout = side === 'player' ? this.layoutPlayer(300) : this.layoutBot(300);
    await this.fly(o, { pos: mac.base.clone().add(new THREE.Vector3(0, 0.002, 0)), quat: flatQuat(mac.yaw, true), scale: 1, dur: 380, ease: 'power2.inOut', arc: 0.6, flipTo: false });
    this.release(o.uid);
    mac.setCount(mac.count + 1);
    await relayout;
  }

  seatOf(o: CardObject): Seat | undefined {
    if (this.playerHand.includes(o)) return 'S';
    for (const s of ['W', 'N', 'E'] as BotSeat[]) if (this.seatHands[s].includes(o)) return s;
    return undefined;
  }

  layoutSeat(seat: BotSeat, dur = 260, except?: CardObject): Promise<void> {
    const hand = this.seatHands[seat];
    const n = hand.length;
    return Promise.all(hand.map((o, i) => {
      if (o === except) return Promise.resolve();
      const s = seatSlot(seat, i, n);
      return this.fly(o, { pos: s.pos, quat: s.quat, scale: s.scale, dur, ease: 'power2.inOut', flipTo: this.showSeatFaces });
    })).then(() => undefined);
  }

  setSeatFaces(show: boolean): void {
    this.showSeatFaces = show;
    for (const s of ['W', 'N', 'E'] as BotSeat[]) for (const o of this.seatHands[s]) o.setFaceUp(show);
  }

  // ---------------- A20/A21 (Partneri): shuffle + 8 packets of 5 ----------------

  async shuffle4(dealer: Seat): Promise<void> {
    const d = this.deck4;
    d.base.copy(DECK4[dealer]);
    d.yaw = { S: -4, W: 8, N: 4, E: -8 }[dealer] * DEG;
    d.mesh.position.set(0, 0, 0);
    d.setCount(40);
    this.audio.play('shuffle');
    const tl = gsap.timeline();
    const half = { x: 0, y: 0 };
    tl.to(half, { x: 0.45, duration: 0.14, ease: 'sine.inOut' });
    for (let k = 0; k < 3; k++) {
      tl.to(half, { y: 0.16, duration: 0.07, ease: 'sine.out' });
      tl.to(half, { y: 0, duration: 0.07, ease: 'sine.in' });
    }
    tl.to(half, { x: 0, duration: 0.14, ease: 'sine.inOut' });
    tl.to({}, { duration: 0.0 });
    tl.eventCallback('onUpdate', () => {
      d.mesh.position.set(Math.sin(half.x * 20) * 0.02, half.y, 0);
      d.mesh.rotation.y = half.x * 0.12;
    });
    await done(tl); // ≈ 700 ms
    d.mesh.position.set(0, 0, 0);
    d.mesh.rotation.y = 0;
  }

  async deal4(hands: Record<Seat, Card4[]>, dealer: Seat): Promise<void> {
    await this.shuffle4(dealer);
    const order: Seat[] = [];
    let s = nextSeat(dealer);
    for (let k = 0; k < 4; k++) { order.push(s); s = nextSeat(s); }
    const sorted = hands.S.slice().sort(compareCards);
    const flights: Promise<void>[] = [];
    for (let packet = 0; packet < 8; packet++) {
      const seat = order[packet % 4];
      const from = packet < 4 ? 0 : 5;
      for (let j = 0; j < 5; j++) {
        const c = hands[seat][from + j];
        if (!c) continue;
        const delay = packet * 300 + j * 50;
        flights.push(wait(delay).then(() => this.dealOne(c, seat, from + j, sorted, hands)));
      }
    }
    await Promise.all(flights);
    for (const st of ['W', 'N', 'E'] as BotSeat[]) this.seatHands[st].sort((a, b) => hands[st].indexOf(a.data as Card4) - hands[st].indexOf(b.data as Card4));
    this.sortPlayerHand();
    this.deck4.setCount(0);
  }

  private async dealOne(c: Card4, seat: Seat, i: number, sorted: Card4[], hands: Record<Seat, Card4[]>): Promise<void> {
    const d = this.deck4;
    const o = this.obtain(c);
    o.setFaceUp(false);
    o.setShadow(true);
    this.toScene(o);
    o.root.position.copy(d.topPosition());
    o.root.quaternion.copy(flatQuat(d.yaw, true));
    o.root.scale.setScalar(1);
    d.setCount(d.count - 1);
    this.audio.play('deal', { rate: 0.95 + Math.random() * 0.1, minGapMs: 70 });
    if (seat === 'S') {
      const idx = sorted.indexOf(c);
      const sl = playerSlot(idx, sorted.length);
      o.slot = sl;
      const w = this.handWorld(sl);
      await this.fly(o, { pos: w.pos, quat: w.quat, scale: 1, dur: 280, ease: 'power2.out', arc: 0.8 });
      this.attachToHand(o);
      o.root.position.set(sl.x, sl.y, sl.z);
      o.root.rotation.set(0, 0, sl.rz);
      this.playerHand.push(o);
      o.faceUp = true;
      await tweenP(o.flipper.rotation, { y: 0, duration: 0.2, ease: 'power2.out' });
    } else {
      const sl = seatSlot(seat, i, hands[seat].length);
      await this.fly(o, { pos: sl.pos, quat: sl.quat, scale: sl.scale, dur: 280, ease: 'power2.out', arc: 0.6, flipTo: this.showSeatFaces });
      this.seatHands[seat].push(o);
    }
  }

  // ---------------- A7–A10 (Partneri): seat → trick ----------------

  async seatToTrick(o: CardObject, seat: Seat, playIndex: number, strong: boolean): Promise<void> {
    const slot = trickSlot4(seat, playIndex, Math.random() * 2 - 1);
    o.setShadow(true);
    if (seat === 'S') {
      this.playerHand = this.playerHand.filter((x) => x !== o);
      o.hovered = false;
      o.setTint(false);
      this.audio.play('card_slide');
      const relayout = this.layoutPlayer(260);
      await this.fly(o, { pos: slot.pos, quat: slot.quat, scale: 1, dur: 420, ease: 'power3.out', rotEase: 'power2.inOut', arc: 1.6, flipTo: true });
      await this.land(o, strong);
      await relayout;
      return;
    }
    this.seatHands[seat] = this.seatHands[seat].filter((x) => x !== o);
    await tweenP(o.root.position, { y: o.root.position.y + 0.3, duration: 0.08, ease: 'power1.out' });
    this.audio.play('card_slide');
    const relayout = this.layoutSeat(seat, 260);
    await this.fly(o, {
      pos: slot.pos, quat: slot.quat, scale: 1, dur: 420, ease: 'power3.out', rotEase: 'power2.inOut', arc: 1.4,
      flipTo: true, flipWindow: [0.3, 0.7], marks: [{ at: 0.5, fn: () => this.audio.play('card_flip') }],
    });
    await this.land(o, strong);
    await relayout;
  }

  /** A38 pinned icon: a 28 px-ish signal disc stuck to the lead card until the sweep. */
  pinSignal(o: CardObject, kind: Signal): void {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.3), new THREE.MeshBasicMaterial({ map: signalTexture(kind), transparent: true, depthWrite: false, toneMapped: false }));
    m.position.set(0.3, 0.56, 0.012);
    m.renderOrder = 5;
    m.name = 'signalPin';
    o.root.add(m);
    m.scale.setScalar(0.01);
    gsap.to(m.scale, { x: 1, y: 1, z: 1, duration: 0.2, ease: 'back.out(1.7)' });
  }

  // ---------------- A11–A14 (Partneri) ----------------

  async resolveTrick4(winnerUid: string, uids: string[], team: Team): Promise<void> {
    const objs = uids.map((u) => this.cards.get(u)).filter((o): o is CardObject => !!o);
    const w = this.cards.get(winnerUid);
    if (!w) return;
    this.flashGlow(w, GLOW.win, 850, 0.9);
    await wait(650);
    // A38 pins stay "until the sweep": shrink them away as the trick is gathered
    for (const o of objs) for (const pin of o.root.children.filter((x) => x.name === 'signalPin')) {
      gsap.to(pin.scale, { x: 0.01, y: 0.01, z: 0.01, duration: 0.18, ease: 'power2.in', onComplete: () => { o.root.remove(pin); } });
    }
    const wp = w.root.position.clone();
    const others = objs.filter((o) => o !== w);
    await Promise.all(others.map((o, k) => this.fly(o, { pos: new THREE.Vector3(wp.x, wp.y + 0.006 * (k + 1), wp.z), quat: w.root.quaternion.clone(), dur: 200, ease: 'power2.in' })));
    const pile = this.teamPiles[team];
    const target = pile.topPosition(1);
    this.audio.play('trick_whoosh');
    const spinQ = (o: CardObject) => new THREE.Quaternion().setFromAxisAngle(UP, Math.PI / 2).multiply(o.root.quaternion.clone());
    await Promise.all([w, ...others].map((o, k) => this.fly(o, {
      pos: target.clone().add(new THREE.Vector3(0, 0.004 * k, 0)), quat: spinQ(o), dur: 380, ease: 'power2.inOut', arc: 0.4,
      flipTo: false, flipWindow: [0.35, 0.65],
    })));
    this.audio.play('card_pile');
    for (const o of objs) this.release(o.uid);
    pile.setCount(pile.count + objs.length);
  }

  /** Vrati!: the led card goes back into its owner's fan/hand. */
  async returnToHand4(o: CardObject, seat: Seat): Promise<void> {
    for (const c of o.root.children.filter((x) => x.name === 'signalPin')) o.root.remove(c);
    if (seat === 'S') { await this.returnToHand(o, 'player'); return; }
    this.seatHands[seat].push(o);
    const n = this.seatHands[seat].length;
    const s = seatSlot(seat, n - 1, n);
    const p = this.layoutSeat(seat, 320, o);
    await this.fly(o, { pos: s.pos, quat: s.quat, scale: s.scale, dur: 380, ease: 'power2.inOut', arc: 0.8, flipTo: this.showSeatFaces });
    await p;
  }

  /** A23–A25 from any seat: cards fly to the showcase, hold, then return to their fan. */
  async akuzaShow4(uids: string[], seat: Seat, hold: () => Promise<void>): Promise<void> {
    if (seat === 'S') { await this.akuzaShow(uids, 'player', hold); return; }
    const objs = uids.map((u) => this.cards.get(u)).filter((o): o is CardObject => !!o);
    if (!objs.length) { await hold(); return; }
    const q = this.cameraQuat();
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(q);
    const n = objs.length;
    await Promise.all(objs.map((o, i) => this.fly(o, {
      pos: SHOWCASE.clone().addScaledVector(right, (i - (n - 1) / 2) * SHOWCASE_GAP), quat: q, scale: SHOWCASE_SCALE,
      dur: 500, ease: 'back.out(1.7)', rotEase: 'power2.out', arc: 0.6, flipTo: true,
    })));
    objs.forEach((o) => this.flashGlow(o, GLOW.win, 1400, 0.8));
    await hold();
    const hand = this.seatHands[seat];
    await Promise.all(objs.map((o) => {
      const s = seatSlot(seat, Math.max(0, hand.indexOf(o)), hand.length);
      return this.fly(o, { pos: s.pos, quat: s.quat, scale: s.scale, dur: 400, ease: 'power2.in', arc: 0.3, flipTo: this.showSeatFaces });
    }));
  }

  /** Pogled / Ribarsko / Poštar: cards lift out of a fan face up toward S, then go back. */
  async peekReveal(uids: string[]): Promise<void> {
    const objs = uids.map((u) => this.cards.get(u)).filter((o): o is CardObject => !!o);
    await Promise.all(objs.map(async (o) => {
      const seat = this.seatOf(o);
      if (!seat || seat === 'S') return;
      this.flashGlow(o, GLOW.pogled, 1600, 0.7);
      const p0 = o.root.position.clone();
      const q0 = o.root.quaternion.clone();
      const toward = TRICK4[seat].pos.clone().sub(p0).setY(0).normalize().multiplyScalar(0.35);
      await this.fly(o, { pos: p0.clone().add(new THREE.Vector3(toward.x, 0.35, toward.z + 0.2)), quat: flatQuat(0, true), scale: 1, dur: 400, ease: 'power2.out', flipTo: true });
      await wait(1200);
      const hand = this.seatHands[seat as BotSeat];
      const s = seatSlot(seat as BotSeat, Math.max(0, hand.indexOf(o)), hand.length);
      await this.fly(o, { pos: s.pos ?? p0, quat: s.quat ?? q0, scale: s.scale, dur: 400, ease: 'power2.inOut', flipTo: this.showSeatFaces });
    }));
  }

  /** Zamjena (Partneri): S's card goes to N's fan, N's card comes to S's hand. */
  async swapWithPartner(mine: CardObject, theirs: CardObject): Promise<void> {
    this.playerHand = this.playerHand.filter((x) => x !== mine);
    this.seatHands.N = this.seatHands.N.filter((x) => x !== theirs);
    this.toScene(mine);
    this.seatHands.N.push(mine);
    this.playerHand.push(theirs);
    this.sortPlayerHand();
    const i = this.playerHand.indexOf(theirs);
    const sl = playerSlot(i, this.playerHand.length);
    theirs.slot = sl;
    const w = this.handWorld(sl);
    const nN = this.seatHands.N.length;
    const sN = seatSlot('N', nN - 1, nN);
    this.audio.play('card_slide');
    await Promise.all([
      this.fly(mine, { pos: sN.pos, quat: sN.quat, scale: sN.scale, dur: 520, ease: 'power2.inOut', arc: 1.2, flipTo: this.showSeatFaces }),
      this.fly(theirs, { pos: w.pos, quat: w.quat, scale: 1, dur: 520, ease: 'power2.inOut', arc: 1.2, flipTo: true }),
      this.layoutPlayer(320, theirs),
    ]);
    this.attachToHand(theirs);
    theirs.root.position.set(sl.x, sl.y, sl.z); theirs.root.rotation.set(0, 0, sl.rz); theirs.root.scale.setScalar(1);
    await Promise.all([this.layoutPlayer(260), this.layoutSeat('N', 260)]);
  }

  /** Screen position (CSS px) of a seat's trick slot (signal callout, A38). */
  trickScreen(seat: Seat): { x: number; y: number } { return this.screenOf(TRICK4[seat].pos); }
}
