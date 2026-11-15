// Butiga (§7, §12.6) including the deck grid.
import gsap from 'gsap';
import type { AudioManager } from '../audio/audio';
import { getLang, t } from '../data/strings';
import { cardKey, compareCards } from '../game/cards';
import { FORE } from '../game/fore';
import { FORE_SLOTS, rerollPrice } from '../game/run';
import { canForge, forgeTargets, slotOf } from '../game/forge';
import { SUIT_NAME } from '../game/cards';
import type { Rank, Suit } from '../game/types';
import type { Offer, RunState } from '../game/run';
import type { RunState4 } from '../game/run4';
import type { DeckCard, ForaId } from '../game/types';
import { UKRASI } from '../game/ukrasi';
import { foraDesc, ukrasDesc } from '../data/descriptions';
import type { CardTextures } from '../render/cardMesh';
import { RARITY_COLOR } from '../render/placeholders';
import { art, clear, h } from './dom';
import type { Overlay } from './overlay';

/** Either run type; Dvoboj has the remove service, Partneri has Prebaci ukras (§18.3.3). */
type ShopRun = RunState | RunState4;

export interface ShopActions {
  buyUkras(i: number, key: string): ShopRun;
  buyFora(i: number, discard?: ForaId): ShopRun;
  buyCasica(i: number): ShopRun;
  reroll(): ShopRun;
  remove?(key: string): ShopRun;
  /** Falsa karta (§19.2.3) */
  buyFalsa?(i: number, key: string, target: { suit: Suit; rank: Rank }): ShopRun;
  /** Prebaci ukras */
  move?(fromKey: string, toKey: string): ShopRun;
  canMove?(): { ok: boolean; reason?: string };
  movePrice?(): number;
  leave(): void;
}

export class ShopScreen {
  el: HTMLElement;
  private counter: HTMLElement;
  private side: HTMLElement;
  private bottom: HTMLElement;
  private soldi: HTMLElement;
  private busy = false;

  constructor(private run: ShopRun, private act: ShopActions, private ov: Overlay, private tex: CardTextures, private audio: AudioManager) {
    const bg = art.env('shop');
    this.el = h('div', { class: 'screen shop' + (bg ? '' : ' fallback'), 'data-screen': 'shop' });
    if (bg) this.el.style.backgroundImage = `url(${bg})`;
    this.soldi = h('span');
    this.counter = h('div', { class: 'counter' });
    this.side = h('div', { class: 'shop-side' });
    this.bottom = h('div', { class: 'shop-bottom' });
    this.el.append(
      h('div', { class: 'shop-title', text: t('shop.title') }),
      h('div', { class: 'shop-soldi' }, h('div', { class: 'soldi' }, h('i', { class: 'coin', style: `background-image:url(${art.coin()})` }), this.soldi)),
      this.counter, this.side, this.bottom,
    );
    this.render(true);
  }

  private get partneri(): boolean { return this.run.mode === 'partneri'; }

  private name(o: Offer): string {
    const hr = getLang() === 'hr';
    if (o.kind === 'ukras') return hr ? UKRASI[o.id].nameHr : UKRASI[o.id].nameEn;
    if (o.kind === 'fora') return hr ? FORE[o.id].nameHr : FORE[o.id].nameEn;
    if (o.kind === 'falsa') return t('shop.falsa');
    return t('shop.casica');
  }

  private desc(o: Offer): string {
    const hr = getLang() === 'hr';
    if (o.kind === 'ukras') return ukrasDesc(o.id, this.partneri);
    if (o.kind === 'fora') return foraDesc(o.id, this.partneri) + ` (${FORE[o.id].cost}× rakija)`;
    if (o.kind === 'falsa') return t('shop.falsaDesc');
    return t('shop.casicaDesc');
  }

  render(dealIn = false): void {
    const run = this.run;
    const shop = run.shop!;
    this.soldi.textContent = String(run.soldi);
    clear(this.counter);
    const cards: HTMLElement[] = [];
    shop.offers.forEach((o, i) => {
      const artEl = o.kind === 'fora'
        ? h('div', { class: 'oart fora', style: `background-image:url(${art.fora(o.id)})` })
        : o.kind === 'falsa'
          ? h('div', { class: 'oart falsa' }, h('div', { class: 'mini', style: `background-image:url(${this.tex.faceUrl({ suit: 'bate', rank: '4' })})` }), h('span', { class: 'arrow', text: '→' }), h('div', { class: 'mini q', text: '?' }), h('div', { class: 'band', text: 'FALSA' }))
          : h('div', { class: 'oart', style: `background-image:url(${o.kind === 'ukras' ? art.badge(o.id) : art.rakijaFull()})` });
      const tag = o.kind === 'ukras' ? t('shop.typeUkras') : o.kind === 'fora' ? t('shop.typeFora') : o.kind === 'falsa' ? t('shop.typeService') : t('shop.typePerm');
      const afford = run.soldi >= o.price;
      const btn = h('button', { class: 'btn', 'data-testid': `buy-${i}`, html: afford ? t('shop.buy', { p: o.price }) : t('shop.buy', { p: `<span class="price-bad">${o.price}</span>` }) }) as HTMLButtonElement;
      btn.disabled = !afford || o.sold;
      btn.addEventListener('click', () => this.buy(i));
      const card = h('div', { class: 'offer' + (o.sold ? ' sold' : ''), 'data-offer': String(i) },
        artEl,
        h('div', { class: 'oname', text: this.name(o) }),
        h('div', { class: 'otag' }, h('i', { class: 'pip', style: `background:${RARITY_COLOR[o.rarity]}` }), h('span', { text: `${tag} · ${t('shop.rarity.' + o.rarity)}` })),
        h('div', { class: 'odesc', text: this.desc(o) }),
        btn);
      if (o.sold) card.append(h('div', { class: 'stamp', text: t('shop.sold') }));
      cards.push(card);
      this.counter.append(card);
    });
    if (dealIn) gsap.fromTo(cards, { y: -600, rotation: -8, opacity: 0 }, { y: 0, rotation: 0, opacity: 1, duration: 0.3, stagger: 0.08, ease: 'back.out(1.5)' });
    // side column
    clear(this.side);
    const discount = 'discount' in run ? run.discount : 0;
    const rp = rerollPrice(shop, discount);
    const reroll = h('button', { class: 'btn', 'data-testid': 'reroll', html: run.soldi >= rp ? t('shop.reroll', { p: rp }) : t('shop.reroll', { p: `<span class="price-bad">${rp}</span>` }) }) as HTMLButtonElement;
    reroll.disabled = run.soldi < rp;
    reroll.addEventListener('click', () => this.doReroll());
    const cont = h('button', { class: 'btn ghost', 'data-testid': 'shop-continue', text: t('common.continue'), onclick: () => { if (!this.busy) this.act.leave(); } });
    if (this.act.move && 'moves' in shop) {
      const cm = this.act.canMove!();
      const mp = this.act.movePrice!();
      const move = h('button', { class: 'btn', 'data-testid': 'move', text: t('shop.move', { p: mp, u: shop.moves }) }) as HTMLButtonElement;
      move.disabled = !cm.ok;
      if (cm.reason === 'none') move.title = t('shop.moveNone');
      move.addEventListener('click', () => this.deckGrid('move'));
      this.side.append(reroll, move, cont);
      if (discount) this.side.append(h('div', { class: 'shop-msg', style: 'font-size:calc(20*var(--u))', text: t('shop.discount') }));
    } else this.side.append(reroll, cont);
    // bottom strip
    clear(this.bottom);
    const slots = h('div', { class: 'fore-slots' });
    for (let k = 0; k < FORE_SLOTS; k++) {
      const f = run.fore[k];
      if (!f) { slots.append(h('div', { class: 'fslot empty' })); continue; }
      slots.append(h('div', { class: 'fslot', 'data-fora': f, title: foraDesc(f, this.partneri) },
        h('div', { class: 'art', style: `background-image:url(${art.fora(f)})` }),
        h('div', { class: 'ribbon', text: getLang() === 'hr' ? FORE[f].nameHr : FORE[f].nameEn })));
    }
    const glasses = h('div', { class: 'glasses' });
    for (let k = 0; k < run.rakijaBase; k++) glasses.append(h('div', { class: 'glass' }, h('div', { class: 'full', style: `background-image:url(${art.rakijaFull()})` })));
    this.bottom.append(
      h('div', null, h('div', { class: 'label', text: t('shop.yourFore') }), slots),
      h('div', null, h('div', { class: 'label', text: t('hud.rakija') }), glasses),
      h('button', { class: 'btn ghost', 'data-testid': 'deck', text: t('shop.deck', { n: run.deck.length }), onclick: () => this.deckGrid('browse') }),
    );
  }

  update(run: ShopRun): void { this.run = run; this.render(); }

  private apply(fn: () => ShopRun): boolean {
    try {
      this.run = fn();
      return true;
    } catch (e) {
      this.ov.toast(String((e as Error).message), 'warn');
      return false;
    }
  }

  private async buy(i: number): Promise<void> {
    if (this.busy) return;
    const o = this.run.shop!.offers[i];
    if (o.sold || this.run.soldi < o.price) return;
    if (o.kind === 'ukras') { this.deckGrid('ukras', i); return; }
    if (o.kind === 'falsa') { this.deckGrid('falsa', i); return; }
    if (o.kind === 'casica') {
      if (this.apply(() => this.act.buyCasica(i))) {
        this.audio.play('glass_clink');
        this.audio.play('coin_single');
        this.render();
        const g = this.bottom.querySelectorAll('.glass');
        const last = g[g.length - 1] as HTMLElement | undefined;
        if (last) gsap.fromTo(last, { y: -40, scale: 1.6, opacity: 0 }, { y: 0, scale: 1, opacity: 1, duration: 0.5, ease: 'back.out(2)' });
      }
      return;
    }
    // fora
    let discard: ForaId | undefined;
    if (this.run.fore.length >= FORE_SLOTS) {
      discard = await this.pickDiscard();
      if (!discard) return;
      const hr = getLang() === 'hr';
      const ok = await this.ov.confirm(`${hr ? FORE[discard].nameHr : FORE[discard].nameEn} → ${this.name(o)}?`);
      if (!ok) return;
    }
    const offerEl = this.counter.querySelector(`[data-offer="${i}"] .oart`) as HTMLElement | null;
    const from = offerEl?.getBoundingClientRect();
    if (this.apply(() => this.act.buyFora(i, discard))) {
      this.audio.play('fora_use');
      this.audio.play('coin_single');
      this.render();
      const slot = this.bottom.querySelector(`[data-fora="${o.id}"]`) as HTMLElement | null;
      if (slot && from) {
        const to = slot.getBoundingClientRect();
        gsap.fromTo(slot, { x: from.left - to.left, y: from.top - to.top, scale: 1.4 }, { x: 0, y: 0, scale: 1, duration: 0.5, ease: 'power2.inOut' });
      }
    }
  }

  private pickDiscard(): Promise<ForaId | undefined> {
    return new Promise((res) => {
      let picked: ForaId | undefined;
      const row = h('div', { class: 'fore-slots', style: 'justify-content:center' });
      const panel = h('div', { class: 'panel modal' }, h('h2', { text: t('shop.discardFora'), style: 'font-size:calc(36*var(--u))' }), row);
      const m = this.ov.modal(panel, { onClose: () => res(picked) });
      for (const f of this.run.fore) {
        row.append(h('div', { class: 'fslot', 'data-discard': f, onclick: () => { picked = f; m.close(); } },
          h('div', { class: 'art', style: `background-image:url(${art.fora(f)})` }),
          h('div', { class: 'ribbon', text: getLang() === 'hr' ? FORE[f].nameHr : FORE[f].nameEn })));
      }
      panel.append(h('div', { class: 'row' }, h('button', { class: 'btn ghost', text: t('cancel'), onclick: () => m.close() })));
    });
  }

  private doReroll(): void {
    if (this.busy) return;
    if (this.apply(() => this.act.reroll())) {
      this.audio.play('shuffle');
      this.render(true);
    }
  }

  /** Deck grid modal: browse, pick an ukras target, pick a card to remove, or Prebaci ukras (2 steps). */
  deckGrid(mode: 'browse' | 'ukras' | 'remove' | 'move' | 'falsa', offerIndex = -1): void {
    const deck = this.run.deck.slice().sort(compareCards);
    const grid = h('div', { class: 'deckgrid', 'data-testid': 'deck-grid' });
    const offer = offerIndex >= 0 ? this.run.shop!.offers[offerIndex] : undefined;
    const title = mode === 'ukras' && offer ? t('shop.pickUkras', { name: this.name(offer) }) : mode === 'remove' ? t('shop.pickRemove') : mode === 'move' ? t('shop.pickMoveFrom') : mode === 'falsa' ? t('shop.pickFalsa') : t('shop.browse') + ` (${deck.length})`;
    const h2 = h('h2', { text: title, style: 'font-size:calc(38*var(--u))' });
    const panel = h('div', { class: 'panel modal', style: 'max-width:none' }, h2, grid);
    const m = this.ov.modal(panel);
    const cells = new Map<string, HTMLElement>();
    let moveFrom: { key: string; cell: HTMLElement; card: DeckCard } | null = null;
    const markMove = () => {
      for (const c of deck) {
        const cell = cells.get(cardKey(c))!;
        const ok = moveFrom ? !c.ukras : !!c.ukras;
        cell.classList.toggle('pickable', ok);
        cell.classList.toggle('dim', !ok);
        cell.classList.toggle('chosen', !!moveFrom && moveFrom.key === cardKey(c));
      }
      h2.textContent = moveFrom ? t('shop.pickMoveTo') : t('shop.pickMoveFrom');
    };
    for (const c of deck) {
      const key = cardKey(c);
      const forgeTip = c.forge ? `${t('shop.falsa')}: ${slotOf(c).replace('_', ' ')} → ${c.forge.rank} ${SUIT_NAME[c.forge.suit]}` : '';
      const shown = c.forge ? { ...c, suit: c.forge.suit, rank: c.forge.rank } : c;
      const cell = h('div', { class: 'dcard' + (mode !== 'browse' ? ' pickable' : ''), 'data-card': key, style: `background-image:url(${this.tex.faceUrl(shown)})`, title: forgeTip || (c.ukras ? (getLang() === 'hr' ? UKRASI[c.ukras].nameHr : UKRASI[c.ukras].nameEn) : '') });
      cells.set(key, cell);
      if (mode === 'falsa') {
        const ok = canForge(this.run.deck, slotOf(c));
        cell.classList.toggle('pickable', ok);
        cell.classList.toggle('dim', !ok);
        if (ok) cell.addEventListener('click', () => { if (!this.busy) this.falsaTarget(offerIndex, c, cell, m.close); });
      } else if (mode === 'move') {
        cell.addEventListener('click', () => {
          if (this.busy) return;
          if (!moveFrom || (c.ukras && moveFrom.key !== key)) {
            if (!c.ukras) return;
            moveFrom = { key, cell, card: c };
            markMove();
            return;
          }
          if (moveFrom.key === key) { moveFrom = null; markMove(); return; }
          if (c.ukras) return;
          void this.doMove(moveFrom.card, moveFrom.cell, c, cell, m.close);
        });
      } else if (mode !== 'browse') cell.addEventListener('click', () => void this.pickCard(mode, c, cell, m.close, offerIndex));
      grid.append(cell);
    }
    if (mode === 'move') markMove();
    gsap.fromTo([...cells.values()], { opacity: 0, y: 10 }, { opacity: 1, y: 0, duration: 0.2, stagger: 0.008 });
    panel.append(h('div', { class: 'row' }, h('button', { class: 'btn ghost', text: mode === 'browse' ? t('done') : t('cancel'), onclick: () => m.close() })));
  }

  /** Falsa karta, step 2: choose the copy identity (any 3, 2 or A). */
  private falsaTarget(offerIndex: number, c: DeckCard, cell: HTMLElement, closeGrid: () => void): void {
    const row = h('div', { class: 'deckgrid', 'data-testid': 'falsa-targets', style: 'grid-template-columns:repeat(4, auto)' });
    const panel = h('div', { class: 'panel modal', style: 'max-width:none' }, h('h2', { text: t('shop.pickFalsaTarget', { card: slotOf(c).replace('_', ' ') }), style: 'font-size:calc(34*var(--u))' }), row);
    const m = this.ov.modal(panel);
    for (const tg of forgeTargets()) {
      const el = h('div', { class: 'dcard pickable', 'data-target': `${tg.suit}_${tg.rank}`, style: `background-image:url(${this.tex.faceUrl(tg)})` });
      el.addEventListener('click', async () => {
        if (this.busy) return;
        this.busy = true;
        m.close();
        const ok = this.apply(() => this.act.buyFalsa!(offerIndex, slotOf(c), tg));
        if (ok) {
          this.audio.play('stamp');
          this.audio.play('coin_single');
          const upd = this.run.deck.find((d) => slotOf(d) === slotOf(c))!;
          cell.style.backgroundImage = `url(${this.tex.faceUrl({ ...upd, suit: tg.suit, rank: tg.rank })})`;
          gsap.fromTo(cell, { scale: 1.25, rotation: -6 }, { scale: 1, rotation: 0, duration: 0.35, ease: 'back.out(2.5)' });
          await new Promise((r) => setTimeout(r, 500));
        }
        this.busy = false;
        closeGrid();
        this.render();
      });
      row.append(el);
    }
    panel.append(h('div', { class: 'row' }, h('button', { class: 'btn ghost', text: t('cancel'), onclick: () => m.close() })));
    void cell;
  }

  /** Prebaci ukras: the badge fades from the source and stamps onto the target (A35). */
  private async doMove(from: DeckCard, fromCell: HTMLElement, to: DeckCard, toCell: HTMLElement, close: () => void): Promise<void> {
    const id = from.ukras!;
    this.busy = true;
    const ghost = h('div', { class: 'stampfx', style: `background-image:url(${art.badge(id)})` });
    fromCell.append(ghost);
    const badge = h('div', { class: 'stampfx', style: `background-image:url(${art.badge(id)})` });
    toCell.append(badge);
    await new Promise<void>((res) => {
      const tl = gsap.timeline({ onComplete: () => res() });
      tl.fromTo(ghost, { opacity: 1, scale: 1 }, { opacity: 0, scale: 0.4, y: -40, duration: 0.3, ease: 'power2.in' }, 0);
      tl.fromTo(badge, { scale: 3, y: -120, opacity: 0 }, { scale: 1.4, y: 0, opacity: 1, duration: 0.25, ease: 'power2.in' }, 0.15);
      tl.call(() => this.audio.play('stamp'));
      tl.to(badge, { scale: 1, duration: 0.12, ease: 'back.out(3)' });
      tl.fromTo(toCell, { scale: 0.94 }, { scale: 1, duration: 0.2, ease: 'back.out(3)' }, '<');
    });
    const ok = this.apply(() => this.act.move!(cardKey(from), cardKey(to)));
    this.busy = false;
    ghost.remove();
    badge.remove();
    if (ok) {
      this.audio.play('coin_single');
      const nf = this.run.deck.find((d) => cardKey(d) === cardKey(from))!;
      const nt = this.run.deck.find((d) => cardKey(d) === cardKey(to))!;
      fromCell.style.backgroundImage = `url(${this.tex.faceUrl(nf)})`;
      toCell.style.backgroundImage = `url(${this.tex.faceUrl(nt)})`;
      await new Promise((r) => setTimeout(r, 380));
    }
    close();
    this.render();
  }

  private async pickCard(mode: 'ukras' | 'remove', c: DeckCard, cell: HTMLElement, close: () => void, offerIndex: number): Promise<void> {
    if (this.busy) return;
    const key = cardKey(c);
    if (mode === 'ukras') {
      const offer = this.run.shop!.offers[offerIndex];
      if (offer.kind !== 'ukras') return;
      if (c.ukras && c.ukras !== offer.id) {
        const hr = getLang() === 'hr';
        const ok = await this.ov.confirm(t('shop.replaceUkras', { old: hr ? UKRASI[c.ukras].nameHr : UKRASI[c.ukras].nameEn, new: this.name(offer) }));
        if (!ok) return;
      }
      this.busy = true;
      // A35 stamp: badge flies onto the card (250 power2.in) + stamp (120 back.out)
      const badge = h('div', { class: 'stampfx', style: `background-image:url(${art.badge(offer.id)})` });
      cell.append(badge);
      await new Promise<void>((res) => {
        const tl = gsap.timeline({ onComplete: () => res() });
        tl.fromTo(badge, { scale: 3, y: -120, opacity: 0 }, { scale: 1.4, y: 0, opacity: 1, duration: 0.25, ease: 'power2.in' });
        tl.call(() => this.audio.play('stamp'));
        tl.to(badge, { scale: 1, duration: 0.12, ease: 'back.out(3)' });
        tl.fromTo(cell, { scale: 0.94 }, { scale: 1, duration: 0.2, ease: 'back.out(3)' }, '<');
      });
      const ok = this.apply(() => this.act.buyUkras(offerIndex, key));
      this.busy = false;
      if (ok) {
        const updated = this.run.deck.find((d) => cardKey(d) === key)!;
        cell.style.backgroundImage = `url(${this.tex.faceUrl(updated)})`;
        badge.remove();
        this.audio.play('coin_single');
        await new Promise((r) => setTimeout(r, 380));
        close();
        this.render();
      }
      return;
    }
    // remove (A37 burn + reflow)
    this.busy = true;
    cell.classList.add('burn');
    this.audio.play('stamp', { rate: 0.7 });
    await new Promise((r) => setTimeout(r, 400 / gsap.globalTimeline.timeScale()));
    const ok = this.apply(() => this.act.remove!(key));
    this.busy = false;
    if (ok) {
      gsap.to(cell, { width: 0, marginRight: 0, duration: 0.26, onComplete: () => { cell.remove(); } });
      setTimeout(() => { close(); this.render(); }, 300);
    } else cell.classList.remove('burn');
  }
}


