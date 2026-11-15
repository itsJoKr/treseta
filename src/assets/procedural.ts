// Procedural art for the §19 items that have no image files (§19.2.3, §19.4.3).
// The manifest does not list these ids; art.badge / art.fora route here.
import { canvas, drawSuitShape, roundRect } from '../render/placeholders';
import type { Suit } from '../game/types';

export { isProceduralFora, isProceduralUkras, PROCEDURAL } from './proceduralIds';

/** Prevrtljivo badge: circle r 56 #C46FA0, 4 px darker rim, white "⇄" glyph. */
export function prevrtljivoBadge(size = 128): HTMLCanvasElement {
  const c = canvas(size, size);
  const ctx = c.getContext('2d')!;
  const k = size / 128;
  ctx.scale(k, k);
  ctx.fillStyle = '#C46FA0';
  ctx.beginPath(); ctx.arc(64, 64, 56, 0, Math.PI * 2); ctx.fill();
  ctx.lineWidth = 4; ctx.strokeStyle = '#8E4874'; ctx.stroke();
  ctx.fillStyle = '#fff';
  ctx.font = '700 64px Alegreya, serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('⇄', 64, 68);
  return c;
}

/** Briškula! fora art: gradient #2F5D7C → #2A1A10, the 4 suits in a diamond, "BRIŠKULA!" in cream. */
export function briskulaArt(suitImgs?: Partial<Record<Suit, HTMLImageElement | null>>): HTMLCanvasElement {
  const W = 480, H = 768;
  const c = canvas(W, H);
  const ctx = c.getContext('2d')!;
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#2F5D7C'); g.addColorStop(1, '#2A1A10');
  ctx.fillStyle = g; roundRect(ctx, 0, 0, W, H, 28); ctx.fill();
  ctx.strokeStyle = '#D9A441'; ctx.lineWidth = 8; roundRect(ctx, 10, 10, W - 20, H - 20, 22); ctx.stroke();
  // kept in the upper two thirds: the HUD fora label covers the bottom of the art
  const pos: [Suit, number, number][] = [['kupe', 240, 125], ['bate', 120, 255], ['spade', 360, 255], ['dinari', 240, 385]];
  for (const [s, x, y] of pos) {
    ctx.fillStyle = 'rgba(243,230,200,0.12)';
    ctx.beginPath(); ctx.arc(x, y, 70, 0, Math.PI * 2); ctx.fill();
    const img = suitImgs?.[s];
    if (img) ctx.drawImage(img, x - 60, y - 60, 120, 120);
    else drawSuitShape(ctx, s, x, y, 44);
  }
  ctx.fillStyle = '#F3E6C8';
  ctx.font = '800 48px Alegreya, serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('BRIŠKULA!', 240, 520);
  return c;
}

/** "FALSA" stamp band and dashed border for forged copies (§19.4.3). */
export function drawFalsaStamp(ctx: CanvasRenderingContext2D, vi: boolean): void {
  ctx.save();
  ctx.setLineDash([14, 10]);
  ctx.strokeStyle = vi ? '#7A1F14' : '#C0392B';
  ctx.lineWidth = 4;
  roundRect(ctx, 14, 14, 452, 740, 18); ctx.stroke();
  ctx.restore();
  ctx.save();
  ctx.translate(240, 560);
  ctx.rotate((-20 * Math.PI) / 180);
  ctx.globalAlpha = 0.75;
  ctx.fillStyle = vi ? '#7A1F14' : '#C0392B';
  ctx.fillRect(-230, -40, 460, 80);
  ctx.globalAlpha = 1;
  ctx.fillStyle = '#F3E6C8';
  ctx.font = '800 54px Alegreya, serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(vi ? 'FALSA · VI' : 'FALSA', 0, 4);
  ctx.restore();
}

/** Small "F" tag for a forgery shown with its printed face (held by the other side). */
export function drawForgeTag(ctx: CanvasRenderingContext2D, vi: boolean): void {
  ctx.save();
  if (vi) {
    ctx.setLineDash([14, 10]); ctx.strokeStyle = '#C0392B'; ctx.lineWidth = 4;
    roundRect(ctx, 14, 14, 452, 740, 18); ctx.stroke(); ctx.setLineDash([]);
  }
  ctx.fillStyle = vi ? '#C0392B' : '#D9A441';
  ctx.beginPath(); ctx.arc(52, 150, 28, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = vi ? '#F3E6C8' : '#2A1A10';
  ctx.font = '800 36px Alegreya, serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('F', 52, 153);
  ctx.restore();
}
