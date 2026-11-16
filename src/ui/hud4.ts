// Partneri HUD (§18.8): three seat panels (N partner top centre, W left, E right) with
// bubbles, turn rings (A39), Viđeno strips and void chips (A40); the MI : VI chalkboard;
// the two signal buttons; seat targeting; the A38 signal callout.
import gsap from 'gsap';
import { assets } from '../assets/loader';
import type { AudioManager } from '../audio/audio';
import { getLang, t } from '../data/strings';
import type { Mood } from '../data/voiceLines';
import { CHARACTERS, PERKS } from '../game/characters';
import type { CharacterId } from '../game/characters';
import { PAIRS } from '../game/ladder4';
import type { Suit } from '../game/types';
import type { Card4, Signal } from '../game/types4';
import { SIGNALS } from '../game/types4';
import { SIGNAL_PATHS } from '../render/animator4';
import type { CardTextures } from '../render/cardMesh';
import { canvas, canvasUrl, drawSuitShape } from '../render/placeholders';
import { art, clear, h } from './dom';
import { Hud } from './hud';

export type VSeat = 'W' | 'N' | 'E';

export function signalSvg(kind: Signal): string {
  const p = SIGNAL_PATHS[kind];
  return p.stroke
    ? `<svg viewBox="0 0 24 24"><path d="${p.d}" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>`
    : `<svg viewBox="0 0 24 24"><path d="${p.d}" fill="currentColor"/></svg>`;
}

function suitIcon(suit: Suit): string {
  return assets.imageUrl('suits', suit) ?? canvasUrl('suiticon_' + suit, () => {
    const c = canvas(64, 64);
    const ctx = c.getContext('2d')!;
    drawSuitShape(ctx, suit, 32, 32, 22);
    return c;
  });
}

const uScale = () => parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--ui-scale')) || 1;

class SeatPanel {
  el: HTMLElement;
  portrait: HTMLElement;
  private img: HTMLImageElement;
  private ring: HTMLElement;
  private nameplate: HTMLElement;
  private bubbleEl: HTMLElement;
  private thinkingEl: HTMLElement;
  private seenWrap: HTMLElement;
  private seenCards: HTMLElement;
  private seenLabel: HTMLElement;
  private voidsEl: HTMLElement;
  private bubbleTl: gsap.core.Timeline | null = null;
  private reactTl: gsap.core.Timeline | null = null;
  private voids: Suit[] = [];
  charId: CharacterId = 'luka';
  onPick: () => void = () => {};

  constructor(public seat: VSeat, private textures: CardTextures) {
    this.img = h('img', { alt: '' });
    this.portrait = h('div', { class: 'portrait' }, this.img, h('div', { class: 'anger' }));
    this.ring = h('div', { class: 'turn-ring' });
    const frame = h('div', { class: 'pframe' }, this.portrait, this.ring);
    frame.addEventListener('click', () => this.onPick());
    this.nameplate = h('div', { class: 'nameplate' });
    this.bubbleEl = h('div', { class: 'bubble' });
    this.thinkingEl = h('div', { class: 'thinking' }, h('i'), h('i'), h('i'));
    this.seenCards = h('div', { class: 'seen-cards' });
    this.seenLabel = h('div', { class: 'seen-label', text: t('hud.seen') });
    this.seenWrap = h('div', { class: 'seen hidden' }, this.seenLabel, this.seenCards);
    this.voidsEl = h('div', { class: 'voids' });
    const cls = seat === 'N' ? 'portrait-wrap seat seat-n teammate' : `seat seat-${seat.toLowerCase()} opponent`;
    this.el = h('div', { class: cls, 'data-seat': seat }, frame, this.nameplate, this.voidsEl, this.bubbleEl, this.thinkingEl, this.seenWrap);
  }

  set(id: CharacterId): void {
    this.charId = id;
    this.img.src = art.portrait(id);
    const name = CHARACTERS[id].name;
    this.nameplate.textContent = this.seat === 'N' ? t('hud.partner', { name }) : name;
    this.portrait.classList.remove('sad', 'angry');
    this.setSeen([]);
    this.setVoids([]);
  }

  relabel(): void { this.seenLabel.textContent = t('hud.seen'); this.set(this.charId); }

  bubble(text: string, gloss: string | null, holdMs: number, mood: Mood): void {
    this.bubbleTl?.kill();
    clear(this.bubbleEl);
    const main = h('span');
    this.bubbleEl.append(main);
    if (gloss) this.bubbleEl.append(h('span', { class: 'gloss', text: gloss }));
    this.thinking(false);
    const tl = gsap.timeline();
    this.bubbleTl = tl;
    tl.fromTo(this.bubbleEl, { opacity: 0, scale: 0.4 }, { opacity: 1, scale: 1, duration: 0.22, ease: 'back.out(2)' });
    const chars = { n: 0 };
    tl.to(chars, { n: text.length, duration: (text.length * 25) / 1000, ease: 'none', onUpdate: () => { main.textContent = text.slice(0, Math.round(chars.n)); } }, 0.05);
    tl.to(this.bubbleEl, { opacity: 0, duration: 0.25, ease: 'power1.in' }, Math.max(0.27, holdMs / 1000));
    this.react(mood, holdMs);
  }

  react(mood: Mood, ms: number): void {
    this.reactTl?.kill();
    const p = this.portrait;
    gsap.set(p, { x: 0, y: 0, scale: 1 });
    p.classList.remove('angry', 'sad');
    const tl = gsap.timeline({ onComplete: () => { gsap.set(p, { x: 0, y: 0, scale: 1 }); p.classList.remove('angry', 'sad'); } });
    this.reactTl = tl;
    const u = uScale();
    if (mood === 'angry') {
      p.classList.add('angry');
      for (let i = 0; i < 6; i++) tl.to(p, { x: (i % 2 ? -6 : 6) * u, duration: 0.05, ease: 'none' });
      tl.to(p, { x: 0, duration: 0.05 });
      tl.to({}, { duration: Math.max(0, ms / 1000 - 0.35) });
    } else if (mood === 'laugh') {
      for (let i = 0; i < 2; i++) { tl.to(p, { y: -8 * u, duration: 0.08, ease: 'sine.out' }); tl.to(p, { y: 0, duration: 0.08, ease: 'sine.in' }); }
      tl.to(p, { scale: 1.04, duration: 0.12, yoyo: true, repeat: Math.max(1, Math.floor(ms / 240) - 2), ease: 'sine.inOut' });
    } else if (mood === 'sad') {
      p.classList.add('sad');
      tl.to(p, { y: 4 * u, duration: 0.25, ease: 'power2.out' });
      tl.to(p, { y: 4 * u, duration: 0.75 });
      tl.to(p, { y: 0, duration: 0.3 });
    } else {
      tl.to(p, { scale: 1.04, duration: 0.12, yoyo: true, repeat: Math.max(1, Math.floor(ms / 120) - 1), ease: 'sine.inOut' });
    }
  }

  thinking(on: boolean): void { this.thinkingEl.classList.toggle('on', on); }
  turn(on: boolean): void { this.ring.classList.toggle('on', on); }
  targetable(on: boolean): void { this.el.classList.toggle('targetable', on); this.el.classList.toggle('interactive', on); }

  setSeen(cards: Card4[], popUid?: string): void {
    clear(this.seenCards);
    this.seenWrap.classList.toggle('hidden', cards.length === 0);
    for (const c of cards) {
      const m = h('div', { class: 'mini', style: `background-image:url(${this.textures.faceUrl(c)})`, 'data-uid': c.uid });
      if (c.uid !== popUid) m.style.animation = 'none';
      this.seenCards.append(m);
    }
  }

  setVoids(suits: Suit[]): void {
    const added = suits.filter((s) => !this.voids.includes(s));
    this.voids = suits.slice();
    clear(this.voidsEl);
    for (const s of suits) {
      const chip = h('div', { class: 'void-chip', title: s, style: `background-image:url(${suitIcon(s)})` });
      this.voidsEl.append(chip);
      if (added.includes(s)) gsap.fromTo(chip, { scale: 0 }, { scale: 1, duration: 0.2, ease: 'back.out(2)' });
    }
  }

  rect(): DOMRect { return this.portrait.getBoundingClientRect(); }
}

export class Hud4 extends Hud {
  panels: Record<VSeat, SeatPanel>;
  private signalBar: HTMLElement;
  private signalBtns = {} as Record<Signal, HTMLButtonElement>;
  onSignal: (s: Signal) => void = () => {};
  onSeatPick: (seat: VSeat) => void = () => {};
  private ladder4 = 0;

  constructor(private tex4: CardTextures, audio: AudioManager) {
    super(tex4, audio);
    this.partneri = true;
    this.el.classList.add('hud4');
    this.panels = { N: new SeatPanel('N', tex4), W: new SeatPanel('W', tex4), E: new SeatPanel('E', tex4) };
    for (const s of ['N', 'W', 'E'] as VSeat[]) {
      this.panels[s].onPick = () => { if (this.panels[s].el.classList.contains('targetable')) this.onSeatPick(s); };
      this.el.append(this.panels[s].el);
    }
    this.signalBar = h('div', { class: 'signal-bar', 'data-testid': 'signal-bar' });
    for (const k of SIGNALS) {
      const b = h('button', { class: 'signal-btn interactive', 'data-signal': k, title: t(`signal.${k}Desc`) },
        h('span', { class: 'ico', html: signalSvg(k) }), h('span', { class: 'lbl', text: t(`signal.${k}`) })) as HTMLButtonElement;
      b.addEventListener('click', () => { if (!b.classList.contains('off')) this.onSignal(k); });
      this.signalBtns[k] = b;
      this.signalBar.append(b);
    }
    this.el.append(this.signalBar);
    this.setSignals({ enabled: false, available: { tucem: false, striso: false }, armed: null });
  }

  /** Partneri: the match tag shows the konoba, the chalkboard columns are MI : VI. */
  override setOpponent(_id: unknown, ladderIndex: number): void {
    this.ladder4 = ladderIndex;
    const pair = PAIRS[Math.min(ladderIndex, PAIRS.length - 1)];
    const tag = this.el.querySelector('.match-tag') as HTMLElement;
    tag.innerHTML = '';
    tag.append(pair.konoba, h('small', { text: t('intro.match4', { i: ladderIndex + 1, n: PAIRS.length }) }));
    const names = this.el.querySelectorAll('.scoreboard .sb-name');
    if (names[0]) names[0].textContent = t('hud.mi');
    if (names[1]) names[1].textContent = t('hud.vi');
  }

  setTable(chars: Record<VSeat, CharacterId>, ladderIndex: number): void {
    for (const s of ['N', 'W', 'E'] as VSeat[]) this.panels[s].set(chars[s]);
    this.setOpponent(null, ladderIndex);
  }

  override relabel(): void {
    super.relabel();
    for (const s of ['N', 'W', 'E'] as VSeat[]) this.panels[s].relabel();
    for (const k of SIGNALS) {
      (this.signalBtns[k].querySelector('.lbl') as HTMLElement).textContent = t(`signal.${k}`);
      this.signalBtns[k].title = t(`signal.${k}Desc`);
    }
    this.setOpponent(null, this.ladder4);
  }

  seatBubble(seat: VSeat, text: string, gloss: string | null, holdMs: number, mood: Mood): void { this.panels[seat].bubble(text, gloss, holdMs, mood); }
  seatReact(seat: VSeat, mood: Mood, ms: number): void { this.panels[seat].react(mood, ms); }
  seatThinking(seat: VSeat, on: boolean): void { this.panels[seat].thinking(on); }

  /** A39: the active bot seat's ring pulses; null clears all. */
  turn(seat: 'S' | VSeat | null): void {
    for (const s of ['N', 'W', 'E'] as VSeat[]) {
      this.panels[s].turn(s === seat);
      if (s !== seat) this.panels[s].thinking(false);
    }
  }

  setSeatSeen(seat: VSeat, cards: Card4[], popUid?: string): void { this.panels[seat].setSeen(cards, popUid); }
  setVoids(seat: VSeat, suits: Suit[]): void { this.panels[seat].setVoids(suits); }

  setSignals(st: { enabled: boolean; available: Record<Signal, boolean>; armed: Signal | null }): void {
    this.signalBar.classList.toggle('disabled', !st.enabled);
    for (const k of SIGNALS) {
      const b = this.signalBtns[k];
      b.classList.toggle('armed', st.armed === k);
      b.classList.toggle('off', !st.enabled || !st.available[k]);
    }
  }

  signalRect(k: Signal): DOMRect { return this.signalBtns[k].getBoundingClientRect(); }

  seatTargeting(seats: VSeat[] | null): void {
    for (const s of ['N', 'W', 'E'] as VSeat[]) this.panels[s].targetable(!!seats && seats.includes(s));
  }

  seatRect(seat: VSeat): DOMRect { return this.panels[seat].rect(); }

  /** A38 callout chip at a screen point: in 200 back.out(1.7), hold 1200, fade 300. */
  callout(fx: HTMLElement, x: number, y: number, kind: Signal, who?: string): Promise<void> {
    const label = kind === 'tucem' ? 'TUČEM!' : 'STRIŠO';
    const el = h('div', { class: 'signal-callout', style: `left:${x}px;top:${y}px` }, h('span', { class: 'ico', html: signalSvg(kind) }), h('b', { text: label }));
    if (who) el.append(h('small', { text: who }));
    fx.append(el);
    return new Promise((res) => {
      const tl = gsap.timeline({ onComplete: () => { el.remove(); res(); } });
      tl.fromTo(el, { scale: 0.3, opacity: 0, xPercent: -50, yPercent: -50 }, { scale: 1, opacity: 1, duration: 0.2, ease: 'back.out(1.7)' });
      tl.to(el, { duration: 1.2 });
      tl.to(el, { opacity: 0, duration: 0.3 });
    });
  }

  perkLine(id: CharacterId): string {
    const perk = CHARACTERS[id].perk;
    if (!perk) return '';
    const hr = getLang() === 'hr';
    return hr ? PERKS[perk].nameHr : PERKS[perk].nameEn;
  }
}
