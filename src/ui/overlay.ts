// Screen router, transitions (A33), modals, toasts.
import gsap from 'gsap';
import type { AudioManager } from '../audio/audio';
import { t } from '../data/strings';
import { h } from './dom';

export class Overlay {
  root: HTMLElement;
  screenLayer: HTMLElement;
  hudLayer: HTMLElement;
  fxLayer: HTMLElement;
  modalLayer: HTMLElement;
  toastLayer: HTMLElement;
  current: HTMLElement | null = null;
  private modalStack: HTMLElement[] = [];
  onModalChange: (open: boolean) => void = () => {};

  constructor(root: HTMLElement, private audio: AudioManager) {
    this.root = root;
    this.hudLayer = h('div', { class: 'hud-layer' });
    this.screenLayer = h('div', { class: 'screen-layer' });
    this.fxLayer = h('div', { class: 'fx-layer' });
    this.modalLayer = h('div', { class: 'modal-layer' });
    this.toastLayer = h('div', { class: 'toasts' });
    root.append(this.hudLayer, this.fxLayer, this.screenLayer, this.toastLayer, this.modalLayer);
    // button sfx (ui_click on click, ui_hover on hover)
    root.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest('.btn, .seg button, .fslot:not(.empty), .node.current, .dcard.pickable, .bigcard, .gear');
      if (b && !(b as HTMLButtonElement).disabled) this.audio.play('ui_click');
    });
    root.addEventListener('mouseover', (e) => {
      const b = (e.target as HTMLElement).closest('.btn, .node.current, .dcard.pickable, .bigcard');
      const from = (e.relatedTarget as HTMLElement | null)?.closest?.('.btn, .node.current, .dcard.pickable, .bigcard');
      if (b && b !== from) this.audio.play('ui_hover', { minGapMs: 50 });
    });
  }

  /** Crossfade to a full-screen overlay (or to the table when el is null). A33: 400 ms. */
  async show(el: HTMLElement | null): Promise<void> {
    const prev = this.current;
    this.current = el;
    const ps: Promise<void>[] = [];
    if (el) {
      el.style.opacity = '0';
      this.screenLayer.append(el);
      ps.push(new Promise((res) => gsap.to(el, { opacity: 1, duration: 0.4, ease: 'power2.inOut', onComplete: () => res() })));
    }
    if (prev && prev !== el) {
      prev.style.pointerEvents = 'none';
      ps.push(new Promise((res) => gsap.to(prev, { opacity: 0, duration: 0.4, ease: 'power2.inOut', onComplete: () => { prev.remove(); res(); } })));
    }
    await Promise.all(ps);
  }

  modal(content: HTMLElement, opts: { onClose?: () => void; closable?: boolean } = {}): { close: () => void; wrap: HTMLElement } {
    const wrap = h('div', { class: 'modal-wrap' }, content);
    const close = () => {
      if (!wrap.isConnected) return;
      this.modalStack = this.modalStack.filter((m) => m !== wrap);
      gsap.to(wrap, { opacity: 0, duration: 0.2, onComplete: () => wrap.remove() });
      opts.onClose?.();
      this.onModalChange(this.modalStack.length > 0);
    };
    if (opts.closable !== false) wrap.addEventListener('pointerdown', (e) => { if (e.target === wrap) close(); });
    (wrap as HTMLElement & { _close?: () => void })._close = close;
    this.modalLayer.append(wrap);
    this.modalStack.push(wrap);
    this.onModalChange(true);
    gsap.fromTo(wrap, { opacity: 0 }, { opacity: 1, duration: 0.25 });
    gsap.fromTo(content, { scale: 0.9, y: 20 }, { scale: 1, y: 0, duration: 0.3, ease: 'back.out(1.6)' });
    return { close, wrap };
  }

  closeTopModal(): boolean {
    const top = this.modalStack[this.modalStack.length - 1] as (HTMLElement & { _close?: () => void }) | undefined;
    if (!top) return false;
    top._close?.();
    return true;
  }

  get modalOpen(): boolean { return this.modalStack.length > 0; }

  confirm(text: string, yes = t('yes'), no = t('no')): Promise<boolean> {
    return new Promise((res) => {
      let answered = false;
      const panel = h('div', { class: 'panel modal' }, h('p', { text }));
      const row = h('div', { class: 'row' });
      const m = this.modal(panel, { onClose: () => { if (!answered) res(false); } });
      row.append(
        h('button', { class: 'btn', text: yes, onclick: () => { answered = true; m.close(); res(true); } }),
        h('button', { class: 'btn ghost', text: no, onclick: () => { answered = true; m.close(); res(false); } }),
      );
      panel.append(row);
    });
  }

  toast(text: string, kind: 'normal' | 'tip' | 'warn' = 'normal', ms = 1600): void {
    const el = h('div', { class: `toast ${kind === 'normal' ? '' : kind}`, text });
    this.toastLayer.append(el);
    while (this.toastLayer.children.length > 3) this.toastLayer.firstElementChild?.remove();
    gsap.fromTo(el, { opacity: 0, y: 14, scale: 0.92 }, { opacity: 1, y: 0, scale: 1, duration: 0.22, ease: 'back.out(2)' });
    gsap.to(el, { opacity: 0, y: -10, duration: 0.35, delay: (ms - 350) / 1000, onComplete: () => el.remove() });
  }
}
