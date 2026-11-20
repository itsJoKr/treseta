// Card mesh factory, texture compositing and cache (§10.4).
import * as THREE from 'three';
import { assets } from '../assets/loader';
import { drawForgeTag, drawPenCorrection } from '../assets/procedural';
import { forgeView, printedOf, slotOf } from '../game/forge';
import { cardFileKey, SUIT_COLOR } from '../game/cards';
import type { CardInst, DeckCard, Side, UkrasId } from '../game/types';
import { UKRASI } from '../game/ukrasi';
import {
  CARD_H, CARD_W, canvas, cardBackPlaceholder, cardFacePlaceholder, FACE, glowTexture, roundRect, ukrasBadgePlaceholder,
} from './placeholders';

export const CARD_WU = 0.8;
export const CARD_HU = 1.28;

export const GLOW = {
  legal: new THREE.Color('#FFD27A'),
  win: new THREE.Color('#FFE9A8'),
  pogled: new THREE.Color('#E0483A'),
  target: new THREE.Color('#7FD6E0'),
  error: new THREE.Color('#E0483A'),
};

const planeGeo = new THREE.PlaneGeometry(CARD_WU, CARD_HU);
const glowGeo = new THREE.PlaneGeometry(CARD_WU * 1.08 * 1.25, CARD_HU * 1.08 * 1.17);

export class CardTextures {
  private faces = new Map<string, THREE.Texture>();
  private faceCanvases = new Map<string, HTMLCanvasElement>();
  private backs = new Map<Side, THREE.Texture>();
  private backMats = new Map<Side, THREE.MeshStandardMaterial>();
  glowTex: THREE.Texture;
  constructor(private aniso: number) {
    this.glowTex = new THREE.CanvasTexture(glowTexture());
    this.glowTex.colorSpace = THREE.SRGBColorSpace;
  }

  private tex(src: HTMLCanvasElement | HTMLImageElement): THREE.Texture {
    const t = src instanceof HTMLCanvasElement ? new THREE.CanvasTexture(src) : new THREE.Texture(src);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = this.aniso;
    t.needsUpdate = true;
    return t;
  }

  /** Composite face canvas: base face + ukras badge + edge stroke. Cached by suit_rank|ukras. */
  faceCanvas(c: DeckCard): HTMLCanvasElement {
    const key = faceKey(c);
    const hit = this.faceCanvases.get(key);
    if (hit) return hit;
    const cv = canvas(CARD_W, CARD_H);
    const ctx = cv.getContext('2d')!;
    // a forgery always shows its printed card; the blue pen says what it counts as (§19.4.3)
    const fv = forgeView(c);
    const base = fv ? printedOf(c) : c;
    const img = assets.imageSync('cards', cardFileKey(base));
    if (img) ctx.drawImage(img, 0, 0, CARD_W, CARD_H);
    else ctx.drawImage(cardFacePlaceholder(base.suit, base.rank, assets.imageSync('suits', base.suit)), 0, 0);
    if (c.ukras) drawUkrasOnFace(ctx, c.ukras);
    if (c.ukras && c.ukrasTeam === 'vi') drawViMark(ctx);
    if (fv && c.forge) {
      if (fv.copy) drawPenCorrection(ctx, c.forge.rank);
      else drawForgeTag(ctx);
    }
    this.faceCanvases.set(key, cv);
    return cv;
  }

  face(c: DeckCard): THREE.Texture {
    const key = faceKey(c);
    let t = this.faces.get(key);
    if (!t) {
      t = this.tex(this.faceCanvas(c));
      this.faces.set(key, t);
    }
    return t;
  }

  back(owner: Side): THREE.Texture {
    let t = this.backs.get(owner);
    if (!t) {
      const img = assets.imageSync('backs', owner);
      t = this.tex(img ?? cardBackPlaceholder(owner));
      this.backs.set(owner, t);
    }
    return t;
  }

  backMaterial(owner: Side): THREE.MeshStandardMaterial {
    let m = this.backMats.get(owner);
    if (!m) {
      m = new THREE.MeshStandardMaterial({ map: this.back(owner), roughness: 0.6, metalness: 0, alphaTest: 0.5 });
      this.backMats.set(owner, m);
    }
    return m;
  }

  /** Data URL for HTML mini cards. */
  private urls = new Map<string, string>();
  faceUrl(c: DeckCard): string {
    const key = faceKey(c);
    let u = this.urls.get(key);
    if (!u) {
      const small = canvas(240, 384);
      small.getContext('2d')!.drawImage(this.faceCanvas(c), 0, 0, 240, 384);
      u = small.toDataURL('image/png');
      this.urls.set(key, u);
    }
    return u;
  }

  backUrl(owner: Side): string {
    const key = `back|${owner}`;
    let u = this.urls.get(key);
    if (!u) {
      const img = assets.imageSync('backs', owner);
      const small = canvas(240, 384);
      small.getContext('2d')!.drawImage(img ?? cardBackPlaceholder(owner), 0, 0, 240, 384);
      u = small.toDataURL('image/png');
      this.urls.set(key, u);
    }
    return u;
  }
}

export function badgeSource(id: UkrasId): HTMLImageElement | HTMLCanvasElement {
  return assets.imageSync('ukrasi', id) ?? ukrasBadgePlaceholder(id, 256);
}

/** Texture cache key: suit_rank|ukras (+ |vi for a Partneri opponent mark). */
export function faceKey(c: DeckCard): string {
  const team = c.ukras && c.ukrasTeam === 'vi' ? '|vi' : '';
  const fv = forgeView(c);
  const f = fv ? `|f:${fv.team}:${fv.copy ? 'c' : 'p'}:${slotOf(c)}` : '';
  return `${c.suit}_${c.rank}|${c.ukras ?? ''}${team}${f}`;
}

/** Šarane karte (§18.4.3): an opponent mark gets a terracotta ring round the badge and a "VI" tab under it. */
export function drawViMark(ctx: CanvasRenderingContext2D): void {
  const { x, y, size } = FACE.badge;
  const cx = x + size / 2, cy = y + size / 2;
  ctx.save();
  ctx.strokeStyle = '#C0392B';
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.arc(cx, cy, size / 2 + 6, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = '#C0392B';
  roundRect(ctx, cx - 28, y + size + 10, 56, 28, 8);
  ctx.fill();
  ctx.fillStyle = '#FFFFFF';
  ctx.font = '800 22px Alegreya, serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('VI', cx, y + size + 25);
  ctx.restore();
}

/**
 * Ukras on a face: a coloured edge stroke and the badge on the LEFT, under the corner numeral
 * (FACE.badge), so it stays visible in the hand fan where the next card covers the right ~45%.
 */
export function drawUkrasOnFace(ctx: CanvasRenderingContext2D, id: UkrasId): void {
  const def = UKRASI[id];
  // edge glow stroke (6 px inner, 70% alpha), in the white margin outside the printed frame line
  ctx.save();
  ctx.globalAlpha = 0.7;
  ctx.strokeStyle = def.color;
  ctx.lineWidth = 6;
  roundRect(ctx, 3, 3, CARD_W - 6, CARD_H - 6, 22);
  ctx.stroke();
  ctx.restore();
  const { x, y, size } = FACE.badge;
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.45)';
  ctx.shadowBlur = 6;
  ctx.shadowOffsetY = 2;
  ctx.drawImage(badgeSource(id), x, y, size, size);
  ctx.restore();
}

export class CardObject {
  root = new THREE.Group();
  flipper = new THREE.Group();
  front: THREE.Mesh;
  back: THREE.Mesh;
  glow: THREE.Mesh;
  frontMat: THREE.MeshStandardMaterial;
  glowMat: THREE.MeshBasicMaterial;
  faceUp = true;
  /** Animation-owned state for the hand. */
  hovered = false;
  inHand = false;
  slot = { x: 0, y: 0, z: 0, rz: 0 };
  lowered = 0;
  constructor(public data: CardInst, textures: CardTextures) {
    this.frontMat = new THREE.MeshStandardMaterial({ map: textures.face(data), roughness: 0.6, metalness: 0, alphaTest: 0.5 });
    this.front = new THREE.Mesh(planeGeo, this.frontMat);
    this.front.castShadow = true;
    // §19.3.4: one deck, every card uses back_player
    this.back = new THREE.Mesh(planeGeo, textures.backMaterial('player'));
    this.back.rotation.y = Math.PI;
    this.back.castShadow = true;
    this.glowMat = new THREE.MeshBasicMaterial({
      map: textures.glowTex, color: GLOW.legal.clone(), transparent: true, opacity: 0,
      blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
    });
    this.glow = new THREE.Mesh(glowGeo, this.glowMat);
    // behind the card and behind its fan neighbours (hand cards are spaced 0.004)
    this.glow.position.z = -0.016;
    this.glow.visible = false;
    this.glow.renderOrder = -1;
    this.flipper.add(this.glow, this.front, this.back);
    this.root.add(this.flipper);
    this.front.userData.card = this;
    this.back.userData.card = this;
    this.root.userData.card = this;
  }

  get uid(): string { return this.data.uid; }

  /** Switch to another identity of the same card (a forgery seen by its holder, §19.4.1). */
  setData(data: CardInst, textures: CardTextures): void {
    if (faceKey(data) === faceKey(this.data)) { this.data = data; return; }
    this.data = data;
    this.frontMat.map = textures.face(data);
    this.frontMat.needsUpdate = true;
  }

  setFaceUp(up: boolean): void {
    this.faceUp = up;
    this.flipper.rotation.y = up ? 0 : Math.PI;
  }

  setGlow(color: THREE.Color, opacity: number): void {
    this.glowMat.color.copy(color);
    this.glowMat.opacity = opacity;
    this.glow.visible = opacity > 0.005;
  }

  setTint(dim: boolean): void {
    this.frontMat.color.set(dim ? 0x8a8a8a : 0xffffff);
  }

  setShadow(on: boolean): void {
    this.front.castShadow = on;
    this.back.castShadow = on;
  }

  dispose(): void {
    this.frontMat.dispose();
    this.glowMat.dispose();
    this.root.removeFromParent();
  }
}

/** Instanced stack of face-down cards (macs, piles, deck stacks): 1 draw call. */
export class CardStack {
  mesh: THREE.InstancedMesh;
  count = 0;
  private yaws: number[] = [];
  private tmp = new THREE.Object3D();
  constructor(public owner: Side, textures: CardTextures, public base: THREE.Vector3, public yaw: number, public jitter = 0, max = 44) {
    this.mesh = new THREE.InstancedMesh(planeGeo, textures.backMaterial(owner), max);
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    for (let i = 0; i < max; i++) this.yaws.push((Math.random() * 2 - 1) * jitter);
  }

  setCount(n: number): void {
    this.count = Math.max(0, Math.min(n, this.yaws.length));
    for (let k = 0; k < this.count; k++) {
      this.tmp.position.set(this.base.x, this.base.y + 0.004 * (k + 1), this.base.z);
      // the instanced quad carries the back texture and faces up
      this.tmp.quaternion.copy(flatQuat(this.yaw + this.yaws[k], true));
      this.tmp.updateMatrix();
      this.mesh.setMatrixAt(k, this.tmp.matrix);
    }
    this.mesh.count = this.count;
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  /** World position of the top card (or the slot above it). */
  topPosition(extra = 0): THREE.Vector3 {
    return new THREE.Vector3(this.base.x, this.base.y + 0.004 * (this.count + extra), this.base.z);
  }

  topQuat(): THREE.Quaternion { return flatQuat(this.yaw, true); }
}

const _e = new THREE.Euler();
const _qx = new THREE.Quaternion();
const _qy = new THREE.Quaternion();
/**
 * Quaternion for a card lying flat on the table. faceUp: the front (local +Z)
 * points up and the card top points away from the player (-z); yaw rotates about world Y.
 * Face-down is expressed with the flipper (rotation about the card's long axis),
 * so the root orientation is the same; for instanced stacks we bake the flip in.
 */
export function flatQuat(yaw: number, faceUp = true): THREE.Quaternion {
  _qy.setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
  _qx.setFromEuler(_e.set(-Math.PI / 2, 0, 0));
  const q = _qy.clone().multiply(_qx);
  if (!faceUp) q.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI));
  return q;
}

export function suitColor(c: DeckCard): string { return SUIT_COLOR[c.suit]; }
