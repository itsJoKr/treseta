// Procedural canvas placeholders (§16.7) and helper textures.
import { RANK_INDEX } from '../game/cards';
import { FORE } from '../game/fore';
import type { ForaId, PersonaId, Rank, Rarity, Suit, UkrasId } from '../game/types';
import { UKRASI } from '../game/ukrasi';

import { briskulaArt, prevrtljivoBadge } from '../assets/procedural';

export const CARD_W = 480;
export const CARD_H = 768;
export const RARITY_COLOR: Record<Rarity, string> = { common: '#F3E6C8', uncommon: '#2F5D7C', rare: '#D9A441' };
export const PERSONA_COLOR: Record<PersonaId, string> = { barba: '#2F5D7C', gazda: '#B5452B', mali: '#6B7A3A' };

export function canvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

export function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function shade(hex: string, f: number): string {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  if (f < 0) { r = Math.round(r * (1 + f)); g = Math.round(g * (1 + f)); b = Math.round(b * (1 + f)); }
  else { r = Math.round(r + (255 - r) * f); g = Math.round(g + (255 - g) * f); b = Math.round(b + (255 - b) * f); }
  return `rgb(${r},${g},${b})`;
}

/** Flat print colours of the Triestine faces (sampled from the card art). */
export const TRI = { red: '#EA2E18', blue: '#085CDE', yellow: '#FAD00A', black: '#0C0C0C', white: '#FFFFFF' };

/**
 * Triestine face layout on the 480×768 canvas. The art build (tools/art/build.py) prints the
 * same frame line and corner numeral; the ukras badge and the forgery pen marks are placed
 * relative to these.
 */
export const FACE = {
  /** thin black frame line, inset from the card edge */
  frame: { inset: 20, radius: 12, width: 3 },
  /** centre of the top-left corner numeral (two-digit numerals are centred 8 px further right) */
  index: { x: 54, y: 58, px: 60 },
  /** ukras badge: left side, under the corner numeral, so it shows in the hand fan */
  badge: { x: 22, y: 92, size: 80 },
};

/** Corner numeral of a rank as printed on the Triestine faces (A → "1"; RANK_INDEX keeps A empty for §19.7). */
export function indexNumeral(rank: Rank): string { return rank === 'A' ? '1' : RANK_INDEX[rank]; }

const INDEX_FONT = '"Bodoni 72", "Bodoni MT", "Times New Roman", Times, serif';
const LABEL_SUIT: Record<Suit, string> = { kupe: 'COPPE', bate: 'BASTONI', spade: 'SPADE', dinari: 'DANARI' };
const LABEL_RANK: Partial<Record<Rank, string>> = { F: 'FANTE', C: 'CAVAL', K: 'RE' };

/** Simple Triestine suit shape centred at (cx, cy) with nominal height s (cup, baton, sword, coin). */
export function drawSuitShape(ctx: CanvasRenderingContext2D, suit: Suit, cx: number, cy: number, s: number): void {
  const { red, blue, yellow, black, white } = TRI;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(s, s);
  ctx.lineJoin = 'round';
  ctx.strokeStyle = black;
  ctx.lineWidth = Math.max(1.5, s * 0.022) / s;
  const poly = (pts: [number, number][], fill: string) => {
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (const [x, y] of pts.slice(1)) ctx.lineTo(x, y);
    ctx.closePath();
    ctx.fillStyle = fill; ctx.fill(); ctx.stroke();
  };
  if (suit === 'kupe') {
    // hexagonal goblet: black lid, ribbed yellow rim, blue leaf stem with a red knot, yellow foot
    poly([[-0.3, -0.5], [0.3, -0.5], [0.36, -0.43], [0.3, -0.36], [-0.3, -0.36], [-0.36, -0.43]], black);
    ctx.fillStyle = red;
    ctx.beginPath(); ctx.ellipse(0, -0.43, 0.13, 0.035, 0, 0, Math.PI * 2); ctx.fill();
    poly([[-0.33, -0.36], [0.33, -0.36], [0.33, -0.24], [-0.33, -0.24]], yellow);
    ctx.beginPath();
    for (let k = -4; k <= 4; k++) { ctx.moveTo(k * 0.07, -0.35); ctx.lineTo(k * 0.07, -0.25); }
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-0.26, -0.24);
    ctx.quadraticCurveTo(-0.02, -0.14, -0.07, 0);
    ctx.quadraticCurveTo(-0.02, 0.14, -0.26, 0.24);
    ctx.lineTo(0.26, 0.24);
    ctx.quadraticCurveTo(0.02, 0.14, 0.07, 0);
    ctx.quadraticCurveTo(0.02, -0.14, 0.26, -0.24);
    ctx.closePath();
    ctx.fillStyle = blue; ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.ellipse(0, 0, 0.17, 0.045, 0, 0, Math.PI * 2);
    ctx.fillStyle = red; ctx.fill(); ctx.stroke();
    poly([[-0.33, 0.24], [0.33, 0.24], [0.33, 0.37], [-0.33, 0.37]], yellow);
    poly([[-0.36, 0.37], [0.36, 0.37], [0.3, 0.5], [-0.3, 0.5]], black);
    ctx.fillStyle = red;
    ctx.beginPath(); ctx.ellipse(0, 0.435, 0.13, 0.035, 0, 0, Math.PI * 2); ctx.fill();
  } else if (suit === 'bate') {
    // baton: blue dome cap, yellow capital, long red shaft with diamonds, yellow bulb knob
    ctx.beginPath(); ctx.arc(0, -0.5, 0.035, 0, Math.PI * 2); ctx.fillStyle = yellow; ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.ellipse(0, -0.39, 0.085, 0.08, 0, Math.PI, 0); ctx.closePath();
    ctx.fillStyle = blue; ctx.fill(); ctx.stroke();
    poly([[-0.12, -0.39], [0.12, -0.39], [0.1, -0.32], [-0.1, -0.32]], yellow);
    poly([[-0.07, -0.32], [0.07, -0.32], [0.07, 0.3], [-0.07, 0.3]], red);
    for (const y of [-0.16, 0, 0.16]) poly([[0, y - 0.04], [0.03, y], [0, y + 0.04], [-0.03, y]], black);
    poly([[-0.08, 0.3], [0.08, 0.3], [0.08, 0.34], [-0.08, 0.34]], blue);
    ctx.beginPath(); ctx.ellipse(0, 0.41, 0.11, 0.075, 0, 0, Math.PI * 2); ctx.fillStyle = yellow; ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.arc(0, 0.5, 0.035, 0, Math.PI * 2); ctx.fillStyle = blue; ctx.fill(); ctx.stroke();
  } else if (suit === 'spade') {
    // straight sword, point up: white blade, scrolled yellow guard, yellow grip, red pommel
    poly([[0, -0.5], [0.06, -0.4], [0.06, 0.2], [-0.06, 0.2], [-0.06, -0.4]], white);
    ctx.beginPath(); ctx.moveTo(0, -0.42); ctx.lineTo(0, 0.18); ctx.stroke();
    poly([[-0.2, 0.2], [0.2, 0.2], [0.2, 0.26], [-0.2, 0.26]], yellow);
    for (const x of [-0.22, 0.22]) {
      ctx.beginPath(); ctx.arc(x, 0.27, 0.04, 0, Math.PI * 2); ctx.fillStyle = yellow; ctx.fill(); ctx.stroke();
    }
    poly([[-0.04, 0.26], [0.04, 0.26], [0.04, 0.41], [-0.04, 0.41]], yellow);
    ctx.beginPath();
    for (let k = 0; k < 4; k++) { ctx.moveTo(-0.04, 0.28 + k * 0.035); ctx.lineTo(0.04, 0.3 + k * 0.035); }
    ctx.stroke();
    ctx.beginPath(); ctx.arc(0, 0.46, 0.05, 0, Math.PI * 2); ctx.fillStyle = red; ctx.fill(); ctx.stroke();
  } else {
    // coin rosette: white ring, blue (left) and yellow (right) petals, red centre
    ctx.beginPath(); ctx.arc(0, 0, 0.47, 0, Math.PI * 2); ctx.fillStyle = white; ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.arc(0, 0, 0.38, Math.PI / 2, Math.PI * 1.5); ctx.closePath(); ctx.fillStyle = blue; ctx.fill();
    ctx.beginPath(); ctx.arc(0, 0, 0.38, -Math.PI / 2, Math.PI / 2); ctx.closePath(); ctx.fillStyle = yellow; ctx.fill();
    ctx.beginPath(); ctx.arc(0, 0, 0.38, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath();
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * Math.PI * 2;
      ctx.moveTo(Math.cos(a) * 0.12, Math.sin(a) * 0.12);
      ctx.lineTo(Math.cos(a) * 0.38, Math.sin(a) * 0.38);
    }
    ctx.stroke();
    ctx.beginPath(); ctx.arc(0, 0, 0.12, 0, Math.PI * 2); ctx.fillStyle = red; ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.arc(0, 0, 0.03, 0, Math.PI * 2); ctx.fillStyle = black; ctx.fill();
  }
  ctx.restore();
}

/** Pip centres of the fallback cups and coins (columns, as on the printed cards). */
const PIP_LAYOUT: Record<string, [number, number][]> = {
  '2': [[240, 230], [240, 538]],
  '3': [[240, 200], [240, 384], [240, 568]],
  '4': [[160, 230], [320, 230], [160, 538], [320, 538]],
  '5': [[160, 210], [320, 210], [240, 384], [160, 558], [320, 558]],
  '6': [[160, 190], [320, 190], [160, 384], [320, 384], [160, 578], [320, 578]],
  '7': [[160, 180], [320, 180], [240, 300], [160, 440], [320, 440], [160, 600], [320, 600]],
};

/** Corner numeral with its ink box centred on (cx, cy). */
function drawNumeral(ctx: CanvasRenderingContext2D, txt: string, cx: number, cy: number, px: number): void {
  ctx.font = `bold ${px}px ${INDEX_FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  const m = ctx.measureText(txt);
  const asc = m.actualBoundingBoxAscent || px * 0.68;
  const desc = m.actualBoundingBoxDescent || 0;
  ctx.fillText(txt, cx, cy + (asc - desc) / 2);
}

/** Fallback face (?noassets=1): white card, black frame line, corner numerals and simple drawn pips. */
export function cardFacePlaceholder(suit: Suit, rank: Rank, suitIcon?: HTMLImageElement | null): HTMLCanvasElement {
  const c = canvas(CARD_W, CARD_H);
  const ctx = c.getContext('2d')!;
  const { inset, radius, width } = FACE.frame;
  roundRect(ctx, 0, 0, CARD_W, CARD_H, 24);
  ctx.fillStyle = TRI.white;
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = 'rgba(0,0,0,0.25)';
  roundRect(ctx, 1, 1, CARD_W - 2, CARD_H - 2, 23);
  ctx.stroke();
  const pip = (x: number, y: number, size: number, rot = 0) => {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot);
    if (suitIcon) ctx.drawImage(suitIcon, -size / 2, -size / 2, size, size);
    else drawSuitShape(ctx, suit, 0, 0, size);
    ctx.restore();
  };
  const idx = indexNumeral(rank);
  const label = LABEL_RANK[rank];
  if (label) {
    // double-ended court: the suit symbol in each half, the name on a white banner across the middle
    ctx.fillStyle = suit === 'kupe' || suit === 'spade' ? 'rgba(211,38,44,0.12)' : 'rgba(31,85,166,0.12)';
    ctx.fillRect(inset, inset, CARD_W - 2 * inset, CARD_H - 2 * inset);
    pip(220, 215, 230);
    pip(260, 553, 230, Math.PI);
    ctx.fillStyle = TRI.white;
    ctx.fillRect(inset, 362, CARD_W - 2 * inset, 44);
    ctx.lineWidth = 2; ctx.strokeStyle = TRI.black;
    ctx.strokeRect(inset, 362, CARD_W - 2 * inset, 44);
    ctx.fillStyle = TRI.black;
    ctx.font = '600 28px "Times New Roman", Times, serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(`${label} DI ${LABEL_SUIT[suit]}`, 240, 386);
  } else if (rank === 'A') {
    // the ace: one big symbol in an oval of red, blue and yellow beads
    for (let k = 0; k < 24; k++) {
      const a = (k / 24) * Math.PI * 2;
      ctx.fillStyle = [TRI.red, TRI.blue, TRI.yellow][k % 3];
      ctx.beginPath(); ctx.arc(240 + Math.cos(a) * 180, 400 + Math.sin(a) * 250, 9, 0, Math.PI * 2); ctx.fill();
    }
    pip(240, 400, 330);
  } else if (suit === 'bate' || suit === 'spade') {
    // clubs and swords cross in an X (pairs of parallel ones on 4–7), plus a vertical one on odd numbers
    const n = Number(rank);
    const per = Math.floor(n / 2);
    const size = [0, 330, 310, 290][per];
    const gap = [0, 0, 70, 56][per];
    for (let i = 0; i < per; i++) {
      const o = (i - (per - 1) / 2) * gap;
      pip(240 + o, 384, size, -0.42);
      pip(240 - o, 384, size, 0.42);
    }
    if (n % 2) pip(240, 384, size + 20);
  } else {
    const pts = PIP_LAYOUT[rank] ?? [];
    const size = rank === '2' || rank === '3' ? 170 : 130;
    pts.forEach(([x, y]) => pip(x, y, size));
  }
  // frame line and corner numerals (drawn last, over the art; the numeral sits on a white patch)
  ctx.lineWidth = width;
  ctx.strokeStyle = TRI.black;
  roundRect(ctx, inset, inset, CARD_W - 2 * inset, CARD_H - 2 * inset, radius);
  ctx.stroke();
  const corner = (rot: boolean) => {
    ctx.save();
    if (rot) { ctx.translate(CARD_W, CARD_H); ctx.rotate(Math.PI); }
    ctx.fillStyle = TRI.white;
    ctx.fillRect(inset + 4, inset + 4, idx.length > 1 ? 76 : 60, 64);
    ctx.fillStyle = TRI.black;
    drawNumeral(ctx, idx, FACE.index.x + (idx.length > 1 ? 8 : 0), FACE.index.y, FACE.index.px);
    ctx.restore();
  };
  corner(false);
  corner(true);
  return c;
}

/** Fallback back: a fine diamond lattice (red for the player, blue-teal for the bot) inside a white border. */
export function cardBackPlaceholder(owner: 'player' | 'bot'): HTMLCanvasElement {
  const c = canvas(CARD_W, CARD_H);
  const ctx = c.getContext('2d')!;
  const a = owner === 'player' ? '#C4232B' : '#1C6F8A';
  roundRect(ctx, 0, 0, CARD_W, CARD_H, 24);
  ctx.fillStyle = TRI.white;
  ctx.fill();
  ctx.save();
  roundRect(ctx, 22, 22, CARD_W - 44, CARD_H - 44, 10);
  ctx.clip();
  ctx.fillStyle = a;
  ctx.fillRect(0, 0, CARD_W, CARD_H);
  ctx.strokeStyle = TRI.white;
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let k = -CARD_H; k < CARD_W + CARD_H; k += 24) {
    ctx.moveTo(k, 0); ctx.lineTo(k - CARD_H * 0.6, CARD_H);
    ctx.moveTo(k, 0); ctx.lineTo(k + CARD_H * 0.6, CARD_H);
  }
  ctx.stroke();
  ctx.restore();
  ctx.lineWidth = 2;
  ctx.strokeStyle = a;
  roundRect(ctx, 12, 12, CARD_W - 24, CARD_H - 24, 16);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(0,0,0,0.25)';
  roundRect(ctx, 1, 1, CARD_W - 2, CARD_H - 2, 23);
  ctx.stroke();
  return c;
}

export function ukrasBadgePlaceholder(id: UkrasId, size = 128): HTMLCanvasElement {
  if (id === 'prevrtljivo') return prevrtljivoBadge(size);
  const c = canvas(size, size);
  const ctx = c.getContext('2d')!;
  const def = UKRASI[id];
  const k = size / 128;
  ctx.fillStyle = def.color;
  ctx.beginPath(); ctx.arc(64 * k, 64 * k, 56 * k, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = shade(def.color, -0.35);
  ctx.lineWidth = 4 * k;
  ctx.beginPath(); ctx.arc(64 * k, 64 * k, 54 * k, 0, Math.PI * 2); ctx.stroke();
  ctx.strokeStyle = shade(def.color, 0.3);
  ctx.lineWidth = 2 * k;
  ctx.beginPath(); ctx.arc(64 * k, 64 * k, 44 * k, 0, Math.PI * 2); ctx.stroke();
  const light = ['usoljeno', 'srebreno'].includes(id);
  ctx.fillStyle = light ? '#3A2618' : '#FFFFFF';
  ctx.font = `bold ${64 * k}px Alegreya, Georgia, serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(def.nameHr[0], 64 * k, 68 * k);
  return c;
}

export function foraArtPlaceholder(id: ForaId): HTMLCanvasElement {
  if (id === 'briskula') return briskulaArt();
  const c = canvas(CARD_W, CARD_H);
  const ctx = c.getContext('2d')!;
  const def = FORE[id];
  const g = ctx.createLinearGradient(0, 0, 0, CARD_H);
  g.addColorStop(0, RARITY_COLOR[def.rarity]);
  g.addColorStop(1, '#2A1A10');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, CARD_W, CARD_H);
  ctx.globalAlpha = 0.12;
  ctx.fillStyle = '#000';
  for (let i = 0; i < 14; i++) ctx.fillRect(0, i * 60, CARD_W, 2);
  ctx.globalAlpha = 1;
  ctx.fillStyle = '#F3E6C8';
  ctx.font = 'bold 64px Alegreya, Georgia, serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const words = def.nameHr.split(' ');
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    if ((cur + ' ' + w).trim().length > 10 && cur) { lines.push(cur); cur = w; } else cur = (cur + ' ' + w).trim();
  }
  if (cur) lines.push(cur);
  lines.forEach((l, i) => ctx.fillText(l, 240, 384 + (i - (lines.length - 1) / 2) * 76));
  return c;
}

export function portraitPlaceholder(persona: PersonaId, name: string): HTMLCanvasElement {
  const c = canvas(256, 256);
  const ctx = c.getContext('2d')!;
  const col = PERSONA_COLOR[persona];
  const g = ctx.createRadialGradient(110, 90, 20, 128, 128, 140);
  g.addColorStop(0, shade(col, 0.25));
  g.addColorStop(1, shade(col, -0.25));
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(128, 128, 126, 0, Math.PI * 2); ctx.fill();
  const initials = name.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase();
  ctx.fillStyle = '#F3E6C8';
  ctx.font = 'bold 110px Alegreya, Georgia, serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(initials, 128, 136);
  return c;
}

export function tablePlaceholder(): HTMLCanvasElement {
  const c = canvas(1024, 683);
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#7A5232';
  ctx.fillRect(0, 0, 1024, 683);
  let x = 12345;
  const rnd = () => { x = (x * 9301 + 49297) % 233280; return x / 233280; };
  const plankH = 683 / 6;
  for (let p = 0; p < 6; p++) {
    const y0 = p * plankH;
    const tint = 0.85 + rnd() * 0.25;
    ctx.fillStyle = `rgba(${Math.round(122 * tint)},${Math.round(82 * tint)},${Math.round(50 * tint)},1)`;
    ctx.fillRect(0, y0, 1024, plankH);
    for (let i = 0; i < 70; i++) {
      ctx.strokeStyle = `rgba(50,28,12,${0.06 + rnd() * 0.12})`;
      ctx.lineWidth = 0.6 + rnd() * 1.6;
      const yy = y0 + rnd() * plankH;
      ctx.beginPath();
      ctx.moveTo(0, yy);
      for (let xx = 0; xx <= 1024; xx += 64) ctx.lineTo(xx, yy + Math.sin(xx * 0.01 + i) * 2.5);
      ctx.stroke();
    }
    // knots
    for (let k = 0; k < 2; k++) {
      const kx = rnd() * 1024, ky = y0 + 20 + rnd() * (plankH - 40);
      ctx.strokeStyle = 'rgba(45,25,10,0.35)';
      for (let r = 4; r < 22; r += 4) { ctx.beginPath(); ctx.ellipse(kx, ky, r * 1.8, r * 0.7, 0, 0, Math.PI * 2); ctx.stroke(); }
    }
    ctx.fillStyle = 'rgba(25,12,4,0.7)';
    ctx.fillRect(0, y0, 1024, 3);
    ctx.fillStyle = 'rgba(255,220,170,0.07)';
    ctx.fillRect(0, y0 + 3, 1024, 2);
    // plank joints
    const jx = 200 + rnd() * 600;
    ctx.fillStyle = 'rgba(25,12,4,0.5)';
    ctx.fillRect(jx, y0, 3, plankH);
  }
  // warm light pool
  const g = ctx.createRadialGradient(512, 342, 60, 512, 342, 560);
  g.addColorStop(0, 'rgba(255,200,120,0.18)');
  g.addColorStop(1, 'rgba(0,0,0,0.35)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 1024, 683);
  return c;
}

/** Soft rounded-rect glow texture for card halos. */
export function glowTexture(): HTMLCanvasElement {
  const w = 256, h = 384;
  const c = canvas(w, h);
  const ctx = c.getContext('2d')!;
  const steps = 26;
  for (let i = 0; i < steps; i++) {
    const t = i / steps;
    const inset = 4 + t * 34;
    ctx.fillStyle = `rgba(255,255,255,${0.022 + t * t * 0.045})`;
    roundRect(ctx, inset, inset, w - inset * 2, h - inset * 2, 30 - t * 14);
    ctx.fill();
  }
  return c;
}

export function dotTexture(): HTMLCanvasElement {
  const c = canvas(64, 64);
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.35, 'rgba(255,255,255,0.6)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  return c;
}

export function coinPlaceholder(size = 64): HTMLCanvasElement {
  const c = canvas(size, size);
  const ctx = c.getContext('2d')!;
  const r = size / 2;
  const g = ctx.createRadialGradient(r * 0.7, r * 0.6, r * 0.1, r, r, r);
  g.addColorStop(0, '#FFE7A0');
  g.addColorStop(0.6, '#D9A441');
  g.addColorStop(1, '#8A5A1E');
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(r, r, r * 0.94, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#7A4E16'; ctx.lineWidth = size * 0.06;
  ctx.beginPath(); ctx.arc(r, r, r * 0.72, 0, Math.PI * 2); ctx.stroke();
  return c;
}

const urlCache = new Map<string, string>();
export function canvasUrl(key: string, make: () => HTMLCanvasElement): string {
  let u = urlCache.get(key);
  if (!u) {
    u = make().toDataURL('image/png');
    urlCache.set(key, u);
  }
  return u;
}
