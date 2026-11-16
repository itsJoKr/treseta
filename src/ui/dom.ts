// Tiny DOM helpers + art URLs (image if present, else procedural placeholder).
import { assets } from '../assets/loader';
import { CHARACTERS } from '../game/characters';
import type { CharacterId } from '../game/characters';
import type { ForaId, UkrasId } from '../game/types';
import {
  canvas, canvasUrl, coinPlaceholder, foraArtPlaceholder, portraitPlaceholder, ukrasBadgePlaceholder,
} from '../render/placeholders';

type Attrs = {
  class?: string;
  style?: string;
  text?: string;
  html?: string;
  title?: string;
  [k: `on${string}`]: ((e: Event) => void) | undefined;
} & Record<string, unknown>;

export function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs?: Attrs | null, ...children: (Node | string | null | undefined | false)[]): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v === undefined || v === null) continue;
      if (k === 'class') e.className = String(v);
      else if (k === 'style') e.setAttribute('style', String(v));
      else if (k === 'text') e.textContent = String(v);
      else if (k === 'html') e.innerHTML = String(v);
      else if (k.startsWith('on') && typeof v === 'function') e.addEventListener(k.slice(2).toLowerCase(), v as EventListener);
      else e.setAttribute(k, String(v));
    }
  }
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    e.append(typeof c === 'string' ? document.createTextNode(c) : c);
  }
  return e;
}

function glassCanvas(full: boolean): HTMLCanvasElement {
  const c = canvas(88, 120);
  const ctx = c.getContext('2d')!;
  ctx.lineJoin = 'round';
  // glass body (trapezoid)
  ctx.beginPath();
  ctx.moveTo(10, 14); ctx.lineTo(78, 14); ctx.lineTo(68, 112); ctx.lineTo(20, 112); ctx.closePath();
  ctx.fillStyle = 'rgba(230,240,240,0.28)';
  ctx.fill();
  if (full) {
    ctx.save();
    ctx.clip();
    const g = ctx.createLinearGradient(0, 36, 0, 112);
    g.addColorStop(0, 'rgba(240,205,120,0.95)');
    g.addColorStop(1, 'rgba(200,150,60,0.95)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 36, 88, 80);
    ctx.fillStyle = 'rgba(255,245,210,0.85)';
    ctx.fillRect(0, 34, 88, 5);
    ctx.strokeStyle = '#4E7A2E'; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(40, 104); ctx.quadraticCurveTo(48, 70, 36, 44); ctx.stroke();
    ctx.restore();
  }
  ctx.strokeStyle = 'rgba(58,38,24,0.95)';
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(10, 14); ctx.lineTo(78, 14); ctx.lineTo(68, 112); ctx.lineTo(20, 112); ctx.closePath();
  ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.6)';
  ctx.fillRect(20, 22, 6, 70);
  return c;
}

export const art = {
  coin(): string { return assets.imageUrl('ui', 'coin') ?? canvasUrl('coin', () => coinPlaceholder(96)); },
  rakijaFull(): string { return assets.imageUrl('ui', 'rakija_full') ?? canvasUrl('rak_full', () => glassCanvas(true)); },
  rakijaEmpty(): string { return assets.imageUrl('ui', 'rakija_empty') ?? canvasUrl('rak_empty', () => glassCanvas(false)); },
  logo(): string | null { return assets.imageUrl('ui', 'logo'); },
  /** Falsa karta shop art (null: the shop draws its own composite) */
  falsa(): string | null { return assets.imageUrl('ui', 'falsa'); },
  portrait(id: CharacterId): string {
    const c = CHARACTERS[id];
    return assets.imageUrl('portraits', id) ?? canvasUrl('portrait_' + id, () => portraitPlaceholder(c.persona, c.name));
  },
  fora(id: ForaId): string { return assets.imageUrl('fore', id) ?? canvasUrl('fora_' + id, () => foraArtPlaceholder(id)); },
  badge(id: UkrasId): string { return assets.imageUrl('ukrasi', id) ?? canvasUrl('badge_' + id, () => ukrasBadgePlaceholder(id, 128)); },
  env(id: 'konoba' | 'map' | 'shop'): string | null { return assets.imageUrl('env', id); },
};

export function clear(e: HTMLElement): void { while (e.firstChild) e.removeChild(e.firstChild); }
