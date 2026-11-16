// Fallback drawings for the §19 items (Prevrtljivo badge, Briškula! art), used only when their
// image files are missing (e.g. ?noassets=1). The painted versions are in the manifest.
import { canvas, drawSuitShape, roundRect } from '../render/placeholders';
import type { Suit } from '../game/types';

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
/** Blue ballpoint used for every forgery mark (play-test round 3). */
export const PEN = '#1D3FD1';

function penLine(ctx: CanvasRenderingContext2D, pts: [number, number][]): void {
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length - 1; i++) {
    const [x, y] = pts[i];
    const [nx, ny] = pts[i + 1];
    ctx.quadraticCurveTo(x, y, (x + nx) / 2, (y + ny) / 2);
  }
  const last = pts[pts.length - 1];
  ctx.lineTo(last[0], last[1]);
  ctx.stroke();
}

/**
 * Forgery shown as what it counts as (§19.4.3, play-test round 3): the printed corner number is
 * crossed out in blue pen and the copy's number is written next to it ("6" crossed out, "3"
 * written), in both corners. A forgery keeps its suit, so only the number changes. Call it on the
 * PRINTED face.
 */
export function drawPenCorrection(ctx: CanvasRenderingContext2D, copyRank: string): void {
  const W = 480, H = 768;
  const corner = () => {
    ctx.save();
    ctx.strokeStyle = PEN; ctx.lineWidth = 6; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.globalAlpha = 0.92;
    // cross out the printed number (centred at 46,52)
    penLine(ctx, [[22, 30], [40, 46], [58, 62], [71, 77]]);
    penLine(ctx, [[70, 27], [54, 44], [37, 62], [23, 78]]);
    // the copy's number, written beside it
    ctx.translate(118, 54);
    ctx.rotate((-9 * Math.PI) / 180);
    ctx.fillStyle = PEN;
    ctx.font = 'italic 800 68px Alegreya, Georgia, serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(copyRank, 0, 0);
    // a quick underline flourish
    penLine(ctx, [[-24, 36], [0, 40], [26, 34]]);
    ctx.restore();
  };
  corner();
  ctx.save();
  ctx.translate(W, H);
  ctx.rotate(Math.PI);
  corner();
  ctx.restore();
}

/**
 * Forgery held by the side it does NOT work for (a plain card for them): the printed face and a
 * small circled "F" in the same blue pen, so it can be recognised; the tooltip explains it.
 */
export function drawForgeTag(ctx: CanvasRenderingContext2D): void {
  ctx.save();
  ctx.strokeStyle = PEN; ctx.fillStyle = PEN; ctx.lineWidth = 4; ctx.globalAlpha = 0.9;
  ctx.beginPath(); ctx.ellipse(52, 152, 25, 23, -0.2, 0.15, Math.PI * 2 - 0.05); ctx.stroke();
  ctx.font = 'italic 700 34px Alegreya, Georgia, serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('F', 52, 154);
  ctx.restore();
}
