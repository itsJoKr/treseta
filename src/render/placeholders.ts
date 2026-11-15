// Procedural canvas placeholders (§16.7) and helper textures.
import { RANK_INDEX, SUIT_COLOR, SUIT_NAME } from '../game/cards';
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

/** Simple suit shape centred at (cx, cy) with nominal size s. */
export function drawSuitShape(ctx: CanvasRenderingContext2D, suit: Suit, cx: number, cy: number, s: number): void {
  const col = SUIT_COLOR[suit];
  ctx.save();
  ctx.translate(cx, cy);
  ctx.lineJoin = 'round';
  ctx.strokeStyle = '#3A2618';
  ctx.lineWidth = Math.max(2, s * 0.045);
  if (suit === 'kupe') {
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.moveTo(-0.42 * s, -0.42 * s);
    ctx.lineTo(0.42 * s, -0.42 * s);
    ctx.quadraticCurveTo(0.4 * s, 0.05 * s, 0.08 * s, 0.12 * s);
    ctx.lineTo(0.06 * s, 0.32 * s);
    ctx.lineTo(0.28 * s, 0.42 * s);
    ctx.lineTo(-0.28 * s, 0.42 * s);
    ctx.lineTo(-0.06 * s, 0.32 * s);
    ctx.lineTo(-0.08 * s, 0.12 * s);
    ctx.quadraticCurveTo(-0.4 * s, 0.05 * s, -0.42 * s, -0.42 * s);
    ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#D9A441';
    ctx.fillRect(-0.4 * s, -0.36 * s, 0.8 * s, 0.08 * s);
  } else if (suit === 'bate') {
    ctx.fillStyle = '#8A5A33';
    roundRect(ctx, -0.11 * s, -0.46 * s, 0.22 * s, 0.92 * s, 0.11 * s);
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = col;
    for (const [x, y] of [[-0.16, -0.18], [0.17, 0.02], [-0.15, 0.2]]) {
      ctx.beginPath();
      ctx.ellipse(x * s, y * s, 0.09 * s, 0.05 * s, x > 0 ? -0.6 : 0.6, 0, Math.PI * 2);
      ctx.fill(); ctx.stroke();
    }
  } else if (suit === 'spade') {
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.moveTo(0, -0.5 * s);
    ctx.lineTo(0.08 * s, -0.38 * s);
    ctx.lineTo(0.07 * s, 0.22 * s);
    ctx.lineTo(-0.07 * s, 0.22 * s);
    ctx.lineTo(-0.08 * s, -0.38 * s);
    ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#D9A441';
    roundRect(ctx, -0.26 * s, 0.2 * s, 0.52 * s, 0.07 * s, 0.03 * s);
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#6B4A2E';
    ctx.fillRect(-0.04 * s, 0.27 * s, 0.08 * s, 0.14 * s);
    ctx.strokeRect(-0.04 * s, 0.27 * s, 0.08 * s, 0.14 * s);
    ctx.fillStyle = '#D9A441';
    ctx.beginPath(); ctx.arc(0, 0.45 * s, 0.055 * s, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  } else {
    ctx.fillStyle = col;
    ctx.beginPath(); ctx.arc(0, 0, 0.42 * s, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = '#8A5A1E';
    ctx.lineWidth = Math.max(2, s * 0.035);
    ctx.beginPath(); ctx.arc(0, 0, 0.32 * s, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = '#B5452B';
    ctx.beginPath(); ctx.arc(0, 0, 0.08 * s, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
}

function paper(ctx: CanvasRenderingContext2D, w: number, h: number, seed: number): void {
  let x = seed * 9301 + 49297;
  const rnd = () => { x = (x * 9301 + 49297) % 233280; return x / 233280; };
  ctx.save();
  for (let i = 0; i < 900; i++) {
    ctx.fillStyle = `rgba(90,60,30,${0.02 + rnd() * 0.04})`;
    ctx.fillRect(rnd() * w, rnd() * h, 1 + rnd() * 2, 1 + rnd() * 2);
  }
  ctx.restore();
}

export function cardFacePlaceholder(suit: Suit, rank: Rank, suitIcon?: HTMLImageElement | null): HTMLCanvasElement {
  const c = canvas(CARD_W, CARD_H);
  const ctx = c.getContext('2d')!;
  const col = SUIT_COLOR[suit];
  roundRect(ctx, 0, 0, CARD_W, CARD_H, 24);
  ctx.save();
  ctx.clip();
  const g = ctx.createRadialGradient(240, 340, 60, 240, 384, 520);
  g.addColorStop(0, '#FBF1DA');
  g.addColorStop(1, '#E9D7B0');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, CARD_W, CARD_H);
  paper(ctx, CARD_W, CARD_H, suit.length * 13 + rank.charCodeAt(0));
  ctx.restore();
  // borders
  ctx.lineWidth = 10;
  ctx.strokeStyle = col;
  roundRect(ctx, 5, 5, CARD_W - 10, CARD_H - 10, 20);
  ctx.stroke();
  ctx.lineWidth = 2;
  ctx.strokeStyle = 'rgba(58,38,24,0.55)';
  roundRect(ctx, 20, 20, CARD_W - 40, CARD_H - 40, 14);
  ctx.stroke();
  // corner indices
  const idx = RANK_INDEX[rank];
  const corner = (rot: boolean) => {
    ctx.save();
    if (rot) { ctx.translate(CARD_W, CARD_H); ctx.rotate(Math.PI); }
    ctx.fillStyle = '#3A2618';
    ctx.font = 'bold 52px Georgia, "Times New Roman", serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    // §19.7: aces have no corner numeral (keep the small corner suit icon)
    if (idx) ctx.fillText(idx, 58, 62);
    if (suitIcon) ctx.drawImage(suitIcon, 38, idx ? 96 : 40, 40, 40);
    else drawSuitShape(ctx, suit, 58, idx ? 116 : 60, 40);
    ctx.restore();
  };
  corner(false);
  corner(true);
  // centre
  if (!idx) {
    // the ace: one large ornamented suit in a laurel ring
    ctx.save();
    ctx.strokeStyle = col; ctx.lineWidth = 6;
    ctx.beginPath(); ctx.arc(240, 384, 190, 0, Math.PI * 2); ctx.stroke();
    ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(58,38,24,0.5)';
    ctx.beginPath(); ctx.arc(240, 384, 172, 0, Math.PI * 2); ctx.stroke();
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * Math.PI * 2;
      ctx.fillStyle = k % 2 ? col : '#6B7A3A';
      ctx.beginPath(); ctx.ellipse(240 + Math.cos(a) * 205, 384 + Math.sin(a) * 205, 16, 7, a + Math.PI / 2, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
    if (suitIcon) ctx.drawImage(suitIcon, 110, 254, 260, 260);
    else drawSuitShape(ctx, suit, 240, 384, 260);
    ctx.fillStyle = col;
    ctx.font = 'bold 40px Georgia, serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(SUIT_NAME[suit].toUpperCase(), 240, 660);
    return c;
  }
  if (suitIcon) ctx.drawImage(suitIcon, 150, 170, 180, 180);
  else drawSuitShape(ctx, suit, 240, 262, 190);
  ctx.fillStyle = '#3A2618';
  ctx.font = 'bold 150px Georgia, "Times New Roman", serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(idx, 240, 470);
  ctx.fillStyle = col;
  ctx.font = 'bold 40px Georgia, serif';
  ctx.fillText(SUIT_NAME[suit].toUpperCase(), 240, 580);
  return c;
}

export function cardBackPlaceholder(owner: 'player' | 'bot'): HTMLCanvasElement {
  const c = canvas(CARD_W, CARD_H);
  const ctx = c.getContext('2d')!;
  const a = owner === 'player' ? '#B5452B' : '#2F7C6B';
  roundRect(ctx, 0, 0, CARD_W, CARD_H, 24);
  ctx.save();
  ctx.clip();
  ctx.fillStyle = '#F3E6C8';
  ctx.fillRect(0, 0, CARD_W, CARD_H);
  ctx.save();
  ctx.translate(CARD_W / 2, CARD_H / 2);
  ctx.rotate(Math.PI / 4);
  ctx.fillStyle = a;
  for (let x = -900; x < 900; x += 48) ctx.fillRect(x, -900, 24, 1800);
  ctx.restore();
  // medallion
  ctx.fillStyle = '#F3E6C8';
  ctx.beginPath(); ctx.ellipse(240, 384, 120, 160, 0, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = a; ctx.lineWidth = 8;
  ctx.beginPath(); ctx.ellipse(240, 384, 106, 146, 0, 0, Math.PI * 2); ctx.stroke();
  ctx.strokeStyle = '#D9A441'; ctx.lineWidth = 4;
  ctx.beginPath(); ctx.ellipse(240, 384, 120, 160, 0, 0, Math.PI * 2); ctx.stroke();
  // little shot glass
  ctx.fillStyle = 'rgba(217,164,65,0.85)';
  ctx.strokeStyle = '#3A2618'; ctx.lineWidth = 5;
  ctx.beginPath(); ctx.moveTo(200, 330); ctx.lineTo(280, 330); ctx.lineTo(268, 440); ctx.lineTo(212, 440); ctx.closePath();
  ctx.fill(); ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.fillRect(214, 340, 10, 86);
  ctx.restore();
  ctx.lineWidth = 20;
  ctx.strokeStyle = '#F3E6C8';
  roundRect(ctx, 10, 10, CARD_W - 20, CARD_H - 20, 16);
  ctx.stroke();
  ctx.lineWidth = 3;
  ctx.strokeStyle = 'rgba(58,38,24,0.6)';
  roundRect(ctx, 1.5, 1.5, CARD_W - 3, CARD_H - 3, 23);
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
