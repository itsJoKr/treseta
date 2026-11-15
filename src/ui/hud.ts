// In-match HUD (§12.2): portrait, bubble, Viđeno, scoreboard, rakija, fore slots, šoldi, chips, pops, banners.
import gsap from 'gsap';
import type { AudioManager } from '../audio/audio';
import { getLang, t } from '../data/strings';
import type { Mood } from '../data/voiceLines';
import { fmtThirds } from '../game/cards';
import { FORE } from '../game/fore';
import type { ReasonKey } from '../game/fore';
import { CHARACTERS } from '../game/characters';
import type { CharacterId } from '../game/characters';
import { DVOBOJ_LADDER } from '../game/ladders';
import type { CardInst, ForaId, UkrasId } from '../game/types';
import { UKRASI } from '../game/ukrasi';
import { foraDesc, ukrasDesc } from '../data/descriptions';
import type { CardTextures } from '../render/cardMesh';
import { art, clear, h } from './dom';
import { Tracker } from './tracker';

export interface ForaSlotState { id: ForaId | null; state: 'ready' | 'unusable' | 'used' | 'empty'; reason?: ReasonKey | string }

const GEAR_SVG = '<svg viewBox="0 0 24 24"><path d="M19.4 13a7.6 7.6 0 0 0 0-2l2.1-1.6-2-3.5-2.5 1a7.5 7.5 0 0 0-1.7-1L15 3.3h-4l-.3 2.6a7.5 7.5 0 0 0-1.7 1l-2.5-1-2 3.5L6.6 11a7.6 7.6 0 0 0 0 2l-2.1 1.6 2 3.5 2.5-1a7.5 7.5 0 0 0 1.7 1l.3 2.6h4l.3-2.6a7.5 7.5 0 0 0 1.7-1l2.5 1 2-3.5zM13 15.5a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7z" transform="translate(-1 0)"/></svg>';

export class Hud {
  el: HTMLElement;
  private portrait: HTMLElement;
  private portraitImg: HTMLImageElement;
  private nameplate: HTMLElement;
  private bubbleEl: HTMLElement;
  private thinkingEl: HTMLElement;
  private seenCards: HTMLElement;
  private seenWrap: HTMLElement;
  private sbMain: HTMLElement;
  private sbP: HTMLElement;
  private sbB: HTMLElement;
  private sbName: HTMLElement;
  private sbSub: HTMLElement;
  private sbLive: HTMLElement;
  private glassesEl: HTMLElement;
  private slotsEl: HTMLElement;
  private soldiEl: HTMLElement;
  private soldiNum: HTMLElement;
  private chipP: HTMLElement;
  private chipB: HTMLElement;
  private tooltipEl: HTMLElement;
  private matchTag: HTMLElement;
  private labels: { el: HTMLElement; key: string }[] = [];
  private ladderIndex = 0;
  shown = { player: 0, bot: 0 };
  private bubbleTl: gsap.core.Timeline | null = null;
  private reactTl: gsap.core.Timeline | null = null;
  onGear: () => void = () => {};
  onFora: (id: ForaId) => void = () => {};
  oppId: CharacterId = 'tonci';
  private rakijaState = { value: 0, base: 3 };
  /** §19.5.1 Odigrano tracker */
  tracker: Tracker;
  private slotStates: ForaSlotState[] = [];

  /** Partneri shows the 4-seat item wording (§18.3). */
  protected partneri = false;

  constructor(private textures: CardTextures, private audio: AudioManager) {
    this.portraitImg = h('img', { alt: '' });
    this.portrait = h('div', { class: 'portrait' }, this.portraitImg, h('div', { class: 'anger' }));
    this.nameplate = h('div', { class: 'nameplate' });
    this.bubbleEl = h('div', { class: 'bubble' });
    this.thinkingEl = h('div', { class: 'thinking' }, h('i'), h('i'), h('i'));
    this.seenCards = h('div', { class: 'seen-cards' });
    const seenLabel = h('div', { class: 'seen-label', text: t('hud.seen') });
    this.labels.push({ el: seenLabel, key: 'hud.seen' });
    this.seenWrap = h('div', { class: 'seen hidden' }, seenLabel, this.seenCards);
    const pw = h('div', { class: 'portrait-wrap' }, this.portrait, this.nameplate, this.bubbleEl, this.thinkingEl, this.seenWrap);

    this.sbP = h('b', { text: '0' });
    this.sbB = h('b', { text: '0' });
    this.sbName = h('span', { class: 'sb-name' });
    this.sbMain = h('div', { class: 'sb-main' },
      h('div', { class: 'sb-col' }, this.lab(h('span', { class: 'sb-name' }), 'hud.you'), this.sbP),
      h('span', { class: 'sb-colon', text: ':' }),
      h('div', { class: 'sb-col' }, this.sbName, this.sbB));
    this.sbSub = h('div', { class: 'sb-sub' });
    this.sbLive = h('div', { class: 'sb-live' });
    const sb = h('div', { class: 'scoreboard' }, this.sbMain, this.sbSub, this.sbLive);

    const gear = h('div', { class: 'gear interactive', html: GEAR_SVG, title: t('menu.settings'), onclick: () => this.onGear() });
    this.matchTag = h('div', { class: 'match-tag' });

    this.slotsEl = h('div', { class: 'fore-slots' });
    this.glassesEl = h('div', { class: 'glasses' });
    const rak = h('div', { class: 'rakija' }, this.lab(h('div', { class: 'rakija-label' }), 'hud.rakija'), this.glassesEl);
    const dock = h('div', { class: 'leftdock' }, this.slotsEl, rak);

    this.soldiNum = h('span', { text: '0' });
    this.soldiEl = h('div', { class: 'soldi' }, h('i', { class: 'coin', style: `background-image:url(${art.coin()})` }), this.soldiNum);
    this.chipP = h('div', { class: 'chip' });
    this.chipB = h('div', { class: 'chip' });
    this.tooltipEl = h('div', { class: 'tooltip hidden' });
    this.tracker = new Tracker(textures);
    this.el = h('div', { class: 'hud' }, pw, sb, gear, this.matchTag, dock, this.soldiEl, this.chipP, this.chipB, this.tracker.el, this.tooltipEl);
  }

  private lab(el: HTMLElement, key: string): HTMLElement {
    el.textContent = t(key);
    this.labels.push({ el, key });
    return el;
  }

  /** Re-apply static labels after a language change. */
  relabel(): void {
    for (const l of this.labels) l.el.textContent = t(l.key);
    this.tracker.relabel();
    this.setOpponent(this.oppId, this.ladderIndex);
    if (this.slotStates.length) this.setFore(this.slotStates);
  }

  setOpponent(id: CharacterId, ladderIndex: number): void {
    this.oppId = id;
    this.ladderIndex = ladderIndex;
    const def = CHARACTERS[id];
    const m = DVOBOJ_LADDER[Math.min(ladderIndex, DVOBOJ_LADDER.length - 1)];
    this.portraitImg.src = art.portrait(id);
    this.nameplate.textContent = def.name;
    this.sbName.textContent = def.name.split(' ').slice(-1)[0].replace(/"/g, '').toUpperCase();
    this.matchTag.innerHTML = '';
    this.matchTag.append(m.konoba, h('small', { text: t('intro.match4', { i: ladderIndex + 1, n: DVOBOJ_LADDER.length }) }));
    this.portrait.classList.remove('sad', 'angry');
  }

  // ---------- score (A24) ----------
  setScores(p: number, b: number): void {
    this.shown = { player: p, bot: b };
    this.sbP.textContent = String(p);
    this.sbB.textContent = String(b);
  }

  countTo(side: 'player' | 'bot', value: number): Promise<void> {
    const el = side === 'player' ? this.sbP : this.sbB;
    const from = this.shown[side];
    this.shown[side] = value;
    if (value === from) return Promise.resolve();
    const o = { v: from };
    const ticks = Math.min(6, Math.abs(value - from));
    let lastTick = 0;
    return new Promise((res) => {
      gsap.to(o, {
        v: value, duration: 0.6, ease: 'power1.out',
        onUpdate: () => {
          el.textContent = String(Math.round(o.v));
          const k = Math.floor(((o.v - from) / (value - from)) * ticks);
          if (k > lastTick) { lastTick = k; this.audio.play('chalk_tick'); }
        },
        onComplete: () => { el.textContent = String(value); res(); },
      });
      gsap.fromTo(el, { scale: 1 }, { scale: 1.25, duration: 0.18, ease: 'back.out(3)', yoyo: true, repeat: 1 });
    });
  }

  setHandInfo(target: number, handNo: number): void { this.sbSub.textContent = t('hud.target', { n: target, h: handNo }); }
  setLive(p: number, b: number): void { this.sbLive.textContent = t('hud.inHand', { a: fmtThirds(p), b: fmtThirds(b) }); }

  // ---------- Viđeno ----------
  setSeen(cards: CardInst[], popUid?: string): void {
    clear(this.seenCards);
    this.seenWrap.classList.toggle('hidden', cards.length === 0);
    for (const c of cards) {
      const m = h('div', { class: 'mini', style: `background-image:url(${this.textures.faceUrl(c)})`, title: c.uid });
      if (c.uid !== popUid) m.style.animation = 'none';
      this.seenCards.append(m);
    }
  }

  // ---------- rakija ----------
  setRakija(value: number, base: number, animate: 'drain' | 'fill' | null = null): void {
    const prev = this.rakijaState.value;
    this.rakijaState = { value, base };
    clear(this.glassesEl);
    const n = Math.max(base, value);
    for (let i = 0; i < n; i++) {
      const g = h('div', { class: 'glass' + (i >= base ? ' extra' : '') },
        h('div', { class: 'empty', style: `background-image:url(${art.rakijaEmpty()})` }),
        h('div', { class: 'full', style: `background-image:url(${art.rakijaFull()})` }));
      const full = i < value;
      if (!full) g.classList.add('drained');
      if (animate === 'drain' && i >= value && i < prev) {
        g.classList.remove('drained');
        requestAnimationFrame(() => requestAnimationFrame(() => g.classList.add('drained')));
      }
      if (animate === 'fill' && full && i >= prev) g.classList.add('fill-in');
      this.glassesEl.append(g);
    }
  }

  // ---------- fore slots ----------
  setFore(slots: ForaSlotState[], armed?: ForaId | null): void {
    this.slotStates = slots;
    clear(this.slotsEl);
    for (let i = 0; i < 4; i++) {
      const s = slots[i] ?? { id: null, state: 'empty' };
      if (!s.id) { this.slotsEl.append(h('div', { class: 'fslot empty' })); continue; }
      const def = FORE[s.id];
      const cost = h('div', { class: 'cost' });
      for (let k = 0; k < def.cost; k++) cost.append(h('i', { style: `background-image:url(${art.rakijaFull()})` }));
      const name = getLang() === 'hr' ? def.nameHr : def.nameEn;
      const el = h('div', { class: `fslot interactive ${s.state}${armed === s.id ? ' armed' : ''}`, 'data-fora': s.id },
        h('div', { class: 'art', style: `background-image:url(${art.fora(s.id)})` }),
        h('div', { class: 'ribbon', text: name }), cost);
      el.addEventListener('click', () => this.onFora(s.id!));
      el.addEventListener('mouseenter', () => this.foraTooltip(el, s));
      el.addEventListener('mouseleave', () => this.hideTooltip());
      this.slotsEl.append(el);
    }
  }

  slotRect(id: ForaId): DOMRect | null {
    const el = this.slotsEl.querySelector(`[data-fora="${id}"]`) as HTMLElement | null;
    return el ? el.getBoundingClientRect() : null;
  }

  private foraTooltip(el: HTMLElement, s: ForaSlotState): void {
    if (!s.id) return;
    const def = FORE[s.id];
    const hr = getLang() === 'hr';
    clear(this.tooltipEl);
    const body = h('div', null,
      h('b', { text: hr ? def.nameHr : def.nameEn }),
      h('span', { class: 'meta', text: t('hud.cost', { n: def.cost }) }),
      h('div', { text: foraDesc(s.id, this.partneri) }));
    if (s.state !== 'ready' && s.reason) body.append(h('span', { class: 'reason', text: t('reason.' + s.reason) }));
    this.tooltipEl.append(h('img', { src: art.fora(s.id), style: 'width:auto;height:calc(80 * var(--u));border-radius:4px' }), body);
    const r = el.getBoundingClientRect();
    this.tooltipEl.classList.remove('hidden');
    this.tooltipEl.style.left = `${r.left}px`;
    this.tooltipEl.style.top = `${r.top - 12}px`;
    this.tooltipEl.style.transform = 'translateY(-100%)';
  }

  ukrasTooltip(ukras: UkrasId | undefined, x: number, y: number): void {
    if (!ukras) { this.hideTooltip(); return; }
    const def = UKRASI[ukras];
    const hr = getLang() === 'hr';
    clear(this.tooltipEl);
    this.tooltipEl.append(h('img', { src: art.badge(ukras) }), h('div', null, h('b', { text: hr ? def.nameHr : def.nameEn }), h('div', { text: ukrasDesc(ukras, this.partneri) })));
    this.tooltipEl.classList.remove('hidden');
    this.tooltipEl.style.left = `${x}px`;
    this.tooltipEl.style.top = `${y}px`;
    this.tooltipEl.style.transform = 'translate(-50%, -100%)';
  }

  hideTooltip(): void { this.tooltipEl.classList.add('hidden'); }

  setSoldi(n: number): void { this.soldiNum.textContent = String(n); }
  soldiRect(): DOMRect { return this.soldiEl.getBoundingClientRect(); }
  bumpSoldi(n: number): void {
    this.setSoldi(n);
    gsap.fromTo(this.soldiEl, { scale: 1 }, { scale: 1.2, duration: 0.15, yoyo: true, repeat: 1, ease: 'back.out(3)' });
  }

  // ---------- mac chips ----------
  setChips(p: { x: number; y: number; n: number }, b: { x: number; y: number; n: number }): void {
    this.chipP.textContent = t('hud.mac', { n: p.n });
    this.chipB.textContent = t('hud.mac', { n: b.n });
    this.chipP.style.left = `${p.x}px`; this.chipP.style.top = `${p.y}px`;
    this.chipB.style.left = `${b.x}px`; this.chipB.style.top = `${b.y}px`;
    this.chipP.classList.toggle('hidden', p.n <= 0);
    this.chipB.classList.toggle('hidden', b.n <= 0);
  }

  // ---------- bubble (A25) + portrait (A26) ----------
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
    const u = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--ui-scale')) || 1;
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

  setPortraitMood(mood: 'sad' | 'laugh' | null): void {
    this.portrait.classList.toggle('sad', mood === 'sad');
  }

  thinking(on: boolean): void { this.thinkingEl.classList.toggle('on', on); }

  // ---------- pops (A15) ----------
  pop(fx: HTMLElement, x: number, y: number, text: string, sub: string | null, color: string): void {
    const el = h('div', { class: 'pop', style: `left:${x}px;top:${y}px;color:${color}` }, text);
    if (sub) el.append(h('small', { text: sub }));
    fx.append(el);
    const u = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--ui-scale')) || 1;
    const tl = gsap.timeline({ onComplete: () => el.remove() });
    tl.fromTo(el, { y: 0, scale: 0.6, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.15, ease: 'back.out(2)' }, 0);
    tl.to(el, { y: -60 * u, duration: 0.9, ease: 'power1.out' }, 0);
    tl.to(el, { opacity: 0, duration: 0.3 }, 0.6);
  }

  // ---------- akuža banner (A23) ----------
  async banner(fx: HTMLElement, label: string, points: number, who: string, bot: boolean, holdMs: number): Promise<void> {
    const b = h('div', { class: 'banner' + (bot ? ' bot' : '') }, h('span', { class: 'who', text: who }), label, h('small', { text: `+${points}` }));
    const wrap = h('div', { class: 'banner-wrap' }, b);
    fx.append(wrap);
    await new Promise<void>((res) => {
      const tl = gsap.timeline({ onComplete: () => { wrap.remove(); res(); } });
      tl.fromTo(b, { scale: 0.4, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.7, ease: 'elastic.out(1, 0.5)' });
      tl.to(b, { scale: 1.03, duration: holdMs / 1000, ease: 'sine.inOut' });
      tl.to(b, { scale: 0.8, opacity: 0, duration: 0.4, ease: 'power2.in' });
    });
  }

  rect(): DOMRect { return this.portrait.getBoundingClientRect(); }
}
