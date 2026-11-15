// Odigrano tracker (§19.5.1): 4 suits × 10 ranks of the deck's 40 slots by printed identity.
import gsap from 'gsap';
import { t } from '../data/strings';
import { RANKS, SUITS } from '../game/cards';
import { printedOf, slotOf } from '../game/forge';
import type { DeckCard } from '../game/types';
import type { CardTextures } from '../render/cardMesh';
import { clear, h } from './dom';

export type CellState = 'played' | 'hand' | 'revealed' | 'unknown';
export interface TrackerCell { card: DeckCard; state: CellState; team?: 'mi' | 'vi' }

export class Tracker {
  el: HTMLElement;
  private panel: HTMLElement;
  private grid: HTMLElement;
  private btn: HTMLButtonElement;
  open = false;
  onToggle: (open: boolean) => void = () => {};

  constructor(private textures: CardTextures) {
    this.grid = h('div', { class: 'tracker-grid' });
    this.panel = h('div', { class: 'tracker-panel', 'data-testid': 'tracker' }, h('div', { class: 'tracker-title', text: t('tracker.title') }), this.grid);
    this.btn = h('button', { class: 'tracker-btn interactive', 'data-testid': 'tracker-toggle', text: t('tracker.title') + ' (T)' }) as HTMLButtonElement;
    this.btn.addEventListener('click', () => this.toggle());
    this.el = h('div', { class: 'tracker' }, this.panel, this.btn);
    this.set(false);
  }

  set(open: boolean): void {
    this.open = open;
    this.panel.classList.toggle('open', open);
    this.btn.classList.toggle('on', open);
  }

  toggle(): void {
    this.set(!this.open);
    if (this.open) gsap.fromTo(this.panel, { x: 40, opacity: 0 }, { x: 0, opacity: 1, duration: 0.2, ease: 'power2.out' });
    this.onToggle(this.open);
  }

  relabel(): void {
    (this.panel.firstChild as HTMLElement).textContent = t('tracker.title');
    this.btn.textContent = t('tracker.title') + ' (T)';
  }

  update(cells: TrackerCell[]): void {
    clear(this.grid);
    const bySlot = new Map(cells.map((c) => [slotOf(c.card), c]));
    for (const suit of SUITS) for (const rank of RANKS) {
      const cell = bySlot.get(`${suit}_${rank}`);
      if (!cell) { this.grid.append(h('div', { class: 'tcell empty' })); continue; }
      const c = cell.card;
      const shown = c.forge ? { ...c, suit: c.forge.suit, rank: c.forge.rank } : { ...c, ...printedOf(c) };
      const el = h('div', { class: `tcell ${cell.state}`, 'data-slot': `${suit}_${rank}`, style: `background-image:url(${this.textures.faceUrl(shown)})` });
      if (cell.state === 'played' && cell.team) el.append(h('i', { class: 'dot ' + cell.team }));
      this.grid.append(el);
    }
  }
}
