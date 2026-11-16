// Raycasting, hover (A1/A2), click/drag (A5/A6) and targeting mode (§11.3, §11.5).
import * as THREE from 'three';
import gsap from 'gsap';
import type { Animator } from './animator';
import type { CardObject } from './cardMesh';
import { DEG, TRICK_CENTER } from './layout';
import type { SceneManager } from './scene';

export interface InputHandlers {
  /** Can the player act right now (turn + no blocking animation)? */
  canAct(): boolean;
  /** Returns true if the card was accepted (legal play / target chosen). */
  tryCard(uid: string, source: 'click' | 'drag'): boolean;
  /** After a rejected drag has returned to the hand. */
  rejected?(uid: string): void;
  cancel(): void;
  hover(card: CardObject | null): void;
  /** a face-up card on the table under the pointer (to show it enlarged), or null */
  hoverTable?(card: CardObject | null, x: number, y: number): void;
  activity(): void;
}

export class Input {
  private ray = new THREE.Raycaster();
  private ndc = new THREE.Vector2();
  private pointer = { x: 0, y: 0, inside: false };
  hovered: CardObject | null = null;
  /** face-up table card under the pointer (trick, revealed hands): shown enlarged by the HUD */
  private tableHovered: CardObject | null = null;
  /** last pointer was a finger (phones): hover comes from taps, table zoom from press-and-hold */
  private touch = false;
  private touchOnHand = false;
  private lastTableXY = { x: -1, y: -1 };
  private hoverUv = new THREE.Vector2(0.5, 0.5);
  private down: { card: CardObject; x: number; y: number } | null = null;
  dragging: CardObject | null = null;
  private dragTarget = new THREE.Vector3();
  private dragVel = 0;
  private dragRz = 0;
  private lastDragX = 0;
  enabled = true;
  private plane12 = new THREE.Plane(new THREE.Vector3(0, 1, 0), -1.2);
  private plane0 = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

  private disposers: (() => void)[] = [];

  constructor(private sm: SceneManager, private anim: Animator, private h: InputHandlers) {
    const el = sm.canvas;
    const on = <K extends keyof HTMLElementEventMap>(target: HTMLElement | Window, type: K, fn: (e: HTMLElementEventMap[K]) => void) => {
      target.addEventListener(type, fn as EventListener);
      this.disposers.push(() => target.removeEventListener(type, fn as EventListener));
    };
    on(el, 'pointermove', (e) => this.move(e));
    on(el, 'pointerdown', (e) => this.pointerDown(e));
    on(window, 'pointerup', (e) => this.pointerUp(e));
    on(el, 'pointerleave', (e) => {
      this.pointer.inside = false;
      this.setTableHover(null);
      // a finger lifting fires pointerleave too: keep the card it selected raised
      if (e.pointerType !== 'touch' && !this.dragging) this.setHover(null);
    });
    on(el, 'contextmenu', (e) => { e.preventDefault(); this.h.cancel(); });
    const upd = (dt: number) => this.update(dt);
    sm.onUpdate(upd);
    this.disposers.push(() => sm.offUpdate(upd));
  }

  dispose(): void {
    this.enabled = false;
    for (const d of this.disposers) d();
    this.disposers = [];
    this.hovered = null;
    this.dragging = null;
  }

  private setNdc(e: PointerEvent): void {
    this.pointer.x = e.clientX;
    this.pointer.y = e.clientY;
    this.pointer.inside = true;
    this.ndc.set((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
  }

  /**
   * Hit-test against the stable fan slots (not the lifted/scaled hover pose) so
   * hover never gets stuck on an enlarged card; fall back to the lifted card mesh
   * for the area above the fan.
   */
  private pick(): { card: CardObject; uv: THREE.Vector2 } | null {
    this.ray.setFromCamera(this.ndc, this.sm.camera);
    const hg = this.anim.handGroup;
    hg.updateWorldMatrix(true, false);
    const inv = new THREE.Matrix4().copy(hg.matrixWorld).invert();
    const local = this.ray.ray.clone().applyMatrix4(inv);
    let best: { card: CardObject; uv: THREE.Vector2; idx: number } | null = null;
    const hand = this.anim.playerHand;
    for (let idx = 0; idx < hand.length; idx++) {
      const o = hand[idx];
      if (!o.inHand) continue;
      const s = o.slot;
      const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), -s.z);
      const p = new THREE.Vector3();
      if (!local.intersectPlane(plane, p)) continue;
      const dx = p.x - s.x, dy = p.y - s.y;
      const c = Math.cos(-s.rz), sn = Math.sin(-s.rz);
      const lx = dx * c - dy * sn, ly = dx * sn + dy * c;
      if (Math.abs(lx) <= 0.4 && Math.abs(ly) <= 0.64) {
        if (!best || idx > best.idx) best = { card: o, uv: new THREE.Vector2(lx / 0.8 + 0.5, ly / 1.28 + 0.5), idx };
      }
    }
    if (best) return best;
    const hv = this.hovered;
    if (hv && hv.inHand) {
      const hits = this.ray.intersectObjects([hv.front, hv.back], false);
      if (hits.length) return { card: hv, uv: hits[0].uv ? hits[0].uv.clone() : new THREE.Vector2(0.5, 0.5) };
    }
    return null;
  }

  private move(e: PointerEvent): void {
    this.setNdc(e);
    this.h.activity();
    this.touch = e.pointerType === 'touch';
    if (this.down && !this.dragging) {
      const d = Math.hypot(e.clientX - this.down.x, e.clientY - this.down.y);
      if (d > 8 && this.h.canAct() && this.enabled && !this.anim.targetMode) this.startDrag(this.down.card);
    }
    if (this.dragging) return;
    if (this.touch) return; // fingers select by tapping (pointerUp), not by passing over
    const p = this.pick();
    if (p) this.hoverUv.copy(p.uv);
    this.setHover(p ? p.card : null);
  }

  setHover(card: CardObject | null): void {
    if (card === this.hovered) return;
    const prev = this.hovered;
    this.hovered = card;
    if (prev) {
      prev.hovered = false;
    }
    if (card) {
      card.hovered = true;
      this.anim.audio.play('ui_hover', { minGapMs: 60 });
    }
    // re-layout every hand card (hover lift + neighbour shift)
    for (const o of this.anim.playerHand) {
      if (o.root.parent !== this.anim.handGroup) continue;
      if (o === card) void this.anim.toSlot(o, 140, 'power2.out');
      else void this.anim.toSlot(o, o === prev ? 180 : 160, 'power2.inOut');
    }
    this.h.hover(card);
  }

  private pointerDown(e: PointerEvent): void {
    if (e.button !== 0) return;
    this.setNdc(e);
    this.h.activity();
    this.touch = e.pointerType === 'touch';
    const p = this.pick();
    this.touchOnHand = this.touch && !!p;
    if (p) this.down = { card: p.card, x: e.clientX, y: e.clientY };
  }

  private pointerUp(e: PointerEvent): void {
    if (e.button !== 0) return;
    this.pointerUpInner(e);
    // the finger is gone: no hold-to-zoom until the next touch
    if (e.pointerType === 'touch') { this.pointer.inside = false; this.touchOnHand = false; this.setTableHover(null); }
  }

  private pointerUpInner(e: PointerEvent): void {
    const down = this.down;
    this.down = null;
    if (this.dragging) {
      const card = this.dragging;
      this.dragging = null;
      this.ray.setFromCamera(this.ndc, this.sm.camera);
      const hit = new THREE.Vector3();
      const ok = this.ray.ray.intersectPlane(this.plane0, hit);
      const inZone = !!ok && Math.hypot(hit.x - TRICK_CENTER.x, hit.z - TRICK_CENTER.z) < 2.5;
      if (inZone && this.h.tryCard(card.uid, 'drag')) return;
      void this.returnCard(card).then(() => { if (inZone) this.h.rejected?.(card.uid); });
      return;
    }
    const finger = e.pointerType !== 'mouse';
    if (!down) {
      // a tap beside the hand puts a raised card back
      if (finger && this.hovered) this.setHover(null);
      return;
    }
    this.setNdc(e);
    const p = this.pick();
    if (p && p.card === down.card && Math.hypot(e.clientX - down.x, e.clientY - down.y) < 8) {
      // touch: the first tap raises the card (and shows its tooltip), a second tap plays it
      if (finger && this.hovered !== p.card) { this.setHover(p.card); return; }
      if (this.enabled) this.h.tryCard(p.card.uid, 'click');
    }
  }

  private startDrag(card: CardObject): void {
    if (!card.inHand) return;
    this.dragging = card;
    card.hovered = false;
    this.hovered = null;
    this.h.hover(null);
    gsap.killTweensOf(card.root.position); gsap.killTweensOf(card.root.rotation); gsap.killTweensOf(card.root.scale);
    this.anim.toSlot(card, 0, 'none');
    this.anim.toScene(card);
    card.setShadow(true);
    this.dragRz = 0;
    this.lastDragX = card.root.position.x;
    for (const o of this.anim.playerHand) if (o !== card && o.root.parent === this.anim.handGroup) void this.anim.toSlot(o, 160, 'power2.inOut');
  }

  /** A6: drag cancel return (260 ms, back.out(1.4)). */
  async returnCard(card: CardObject): Promise<void> {
    if (!this.anim.playerHand.includes(card)) return;
    const w = this.anim.handWorld(card.slot);
    await this.anim.fly(card, { pos: w.pos, quat: w.quat, scale: 1, dur: 260, ease: 'back.out(1.4)', rotEase: 'power2.out' });
    this.anim.attachToHand(card);
    card.root.position.set(card.slot.x, card.slot.y, card.slot.z);
    card.root.rotation.set(0, 0, card.slot.rz);
    card.root.scale.setScalar(1);
  }

  /** Topmost card under the pointer outside the hand; only a card showing its face counts. */
  private pickTable(): CardObject | null {
    this.ray.setFromCamera(this.ndc, this.sm.camera);
    const meshes: THREE.Object3D[] = [];
    for (const o of this.anim.cards.values()) {
      if (o.inHand || !o.root.parent || !o.root.visible) continue;
      meshes.push(o.front, o.back);
    }
    const hit = this.ray.intersectObjects(meshes, false)[0];
    if (!hit) return null;
    const card = hit.object.userData.card as CardObject | undefined;
    return card && hit.object === card.front ? card : null;
  }

  private setTableHover(card: CardObject | null): void {
    const moved = this.pointer.x !== this.lastTableXY.x || this.pointer.y !== this.lastTableXY.y;
    if (card === this.tableHovered && !(card && moved)) return;
    this.tableHovered = card;
    this.lastTableXY = { x: this.pointer.x, y: this.pointer.y };
    this.h.hoverTable?.(card, this.pointer.x, this.pointer.y);
  }

  private update(dt: number): void {
    // table cards move (tricks fly to the pile), so their hover is checked every frame
    if (this.h.hoverTable) {
      // mouse: hovering; finger: press and hold (not when the finger is on the hand)
      const free = this.touch ? !this.touchOnHand : !this.hovered;
      const over = this.pointer.inside && this.enabled && !this.dragging && free && !this.anim.targetMode;
      this.setTableHover(over ? this.pickTable() : null);
    }
    // tilt of the hovered card follows the pointer
    const hv = this.hovered;
    if (hv && hv.inHand && !this.dragging) {
      const dx = (this.hoverUv.x - 0.5) * 2;
      const dy = (this.hoverUv.y - 0.5) * 2;
      const k = 1 - Math.pow(0.001, dt);
      hv.root.rotation.x += (-dy * 8 * DEG - hv.root.rotation.x) * k;
      hv.root.rotation.y += (dx * 8 * DEG - hv.root.rotation.y) * k;
    }
    const d = this.dragging;
    if (d) {
      this.ray.setFromCamera(this.ndc, this.sm.camera);
      if (this.ray.ray.intersectPlane(this.plane12, this.dragTarget)) {
        d.root.position.lerp(this.dragTarget, 0.35);
      }
      const vx = (d.root.position.x - this.lastDragX) / Math.max(1e-3, dt);
      this.lastDragX = d.root.position.x;
      this.dragVel = vx;
      const targetRz = Math.max(-0.35, Math.min(0.35, -vx * 0.04));
      this.dragRz += (targetRz - this.dragRz) * 0.2;
      const q = this.anim.cameraQuat()
        .multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -0.35))
        .multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), this.dragRz));
      d.root.quaternion.slerp(q, 0.3);
      const s = d.root.scale.x + (1.1 - d.root.scale.x) * 0.2;
      d.root.scale.setScalar(s);
    }
  }
}
