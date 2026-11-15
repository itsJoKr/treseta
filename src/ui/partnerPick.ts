// Partner pick screen (§18.4) and the Partneri intro panel (§18.8).
import gsap from 'gsap';
import { getLang, t } from '../data/strings';
import { CHARACTER_IDS, CHARACTERS, PERKS } from '../game/characters';
import type { CharacterId } from '../game/characters';
import { FORE } from '../game/fore';
import { PAIRS } from '../game/ladder4';
import type { DeckCard } from '../game/types';
import type { CardTextures } from '../render/cardMesh';
import { art, h } from './dom';

export interface PickOpts {
  ladderIndex: number;
  unlocked: CharacterId[];
  valid: CharacterId[];
  onPick: (id: CharacterId) => void;
  onBack: () => void;
}

export function partnerPick(o: PickOpts): HTMLElement {
  const pair = PAIRS[o.ladderIndex];
  const hr = getLang() === 'hr';
  const bg = art.env('konoba');
  const el = h('div', { class: 'screen pick' + (bg ? '' : ' fallback'), 'data-screen': 'pick', style: bg ? `background:linear-gradient(rgba(20,10,5,0.72),rgba(20,10,5,0.82)),url(${bg}) center/cover` : 'background:rgba(20,10,5,0.85)' });
  el.append(h('h1', { text: t('pick.title') }));
  el.append(h('div', { class: 'pick-sub' },
    h('img', { src: art.portrait(pair.W), alt: '' }), h('img', { src: art.portrait(pair.E), alt: '' }),
    h('span', { text: t('pick.sub', { konoba: pair.konoba, w: CHARACTERS[pair.W].name, e: CHARACTERS[pair.E].name }) })));
  const row = h('div', { class: 'pick-row' });
  const cards: HTMLElement[] = [];
  // the six characters with a perk can ever be partners (Frane and Bepo never are)
  for (const id of CHARACTER_IDS.filter((c) => CHARACTERS[c].perk !== null)) {
    const c = CHARACTERS[id];
    const perk = PERKS[c.perk!];
    const valid = o.valid.includes(id);
    const busy = id === pair.W || id === pair.E;
    const locked = !o.unlocked.includes(id);
    const card = h('div', { class: 'pcard' + (valid ? ' valid' : '') + (locked ? ' locked' : ''), 'data-partner': id, 'data-testid': valid ? `pick-${id}` : undefined },
      h('div', { class: 'portrait' }, h('img', { src: art.portrait(id), alt: '' })),
      h('div', { class: 'pname', text: c.name }),
      h('div', { class: 'pperk', text: `${t('pick.perk')}: ${hr ? perk.nameHr : perk.nameEn}` }),
      h('div', { class: 'pdesc', text: hr ? perk.descHr : perk.descEn }));
    if (!valid) card.append(h('div', { class: 'pstate', text: busy ? t('pick.busy') : locked ? t('pick.locked') : t('pick.persona') }));
    else {
      const btn = h('button', { class: 'btn small', text: t('pick.sit') });
      card.append(btn);
      card.addEventListener('click', () => {
        card.classList.add('chosen');
        gsap.to(card, { scale: 1.06, duration: 0.15, yoyo: true, repeat: 1, ease: 'power2.out', onComplete: () => o.onPick(id) });
      });
    }
    cards.push(card);
    row.append(card);
  }
  el.append(row);
  el.append(h('button', { class: 'btn ghost', text: t('cancel'), onclick: o.onBack }));
  gsap.fromTo(cards, { y: 60, opacity: 0 }, { y: 0, opacity: 1, duration: 0.35, stagger: 0.06, ease: 'back.out(1.5)' });
  return el;
}

export function intro4Panel(o: {
  ladderIndex: number; partner: CharacterId; marks: DeckCard[]; forgeries?: DeckCard[]; textures: CardTextures; onSit: () => void; onBack?: () => void;
}): HTMLElement {
  const pair = PAIRS[o.ladderIndex];
  const hr = getLang() === 'hr';
  const w = CHARACTERS[pair.W];
  const e = CHARACTERS[pair.E];
  const foreRow = (seat: 'W' | 'E') => {
    const list = h('div', { class: 'list' });
    const f = pair.fore[seat];
    if (!f.length) list.append(h('span', { text: t('intro.none') }));
    for (const id of f) list.append(h('div', { class: 'item' }, h('div', { class: 'fart', style: `background-image:url(${art.fora(id)})` }), h('span', { text: hr ? FORE[id].nameHr : FORE[id].nameEn })));
    return list;
  };
  const foreHead = (name: string, rakija: number) => `${name} · ${t('intro.fore')}${rakija > 0 ? ` (${t('intro.rakija', { n: rakija })})` : ''}:`;
  const marks = h('div', { class: 'list' });
  if (!o.marks.length) marks.append(h('span', { text: t('intro.none') }));
  for (const c of o.marks) marks.append(h('div', { class: 'mini-wrap' }, h('div', { class: 'mini', style: `background-image:url(${o.textures.faceUrl(c)})` })));
  const pc = CHARACTERS[o.partner];
  const perk = pc.perk ? PERKS[pc.perk] : null;
  const left = h('div', { class: 'left' },
    h('div', { class: 'pair' },
      h('div', { class: 'portrait' }, h('img', { src: art.portrait(pair.W), alt: '' })),
      h('div', { class: 'portrait' }, h('img', { src: art.portrait(pair.E), alt: '' }))),
    h('div', { class: 'meta', text: `${w.name} · ${e.name}` }));
  const right = h('div', { class: 'right' },
    h('h2', { text: pair.konoba }),
    h('div', { class: 'konoba', text: t('intro.match4', { i: o.ladderIndex + 1, n: PAIRS.length }) }),
    h('div', { class: 'sect', text: foreHead(w.name, pair.rakija.W) }), foreRow('W'),
    h('div', { class: 'sect', text: foreHead(e.name, pair.rakija.E) }), foreRow('E'),
    h('div', { class: 'sect', text: t('intro.marks', { n: o.marks.length }) }), marks,
    h('div', { class: 'sect', text: t('intro.forgeries', { n: (o.forgeries ?? []).length }) }),
    (() => { const l = h('div', { class: 'list' }); const f = o.forgeries ?? []; if (!f.length) l.append(h('span', { text: t('intro.none') })); for (const c of f) l.append(h('div', { class: 'mini-wrap' }, h('div', { class: 'mini', style: `background-image:url(${o.textures.faceUrl({ ...c, suit: c.forge!.suit, rank: c.forge!.rank })})` }))); return l; })(),
    h('div', { class: 'partner-line' }, h('img', { src: art.portrait(o.partner), alt: '' }),
      h('div', null, h('div', { class: 'sect', text: `${t('intro.partner')}: ${pc.name}` }), h('div', { class: 'bio', text: perk ? `${hr ? perk.nameHr : perk.nameEn}: ${hr ? perk.descHr : perk.descEn}` : '' }))));
  const actions = h('div', { class: 'actions' });
  if (o.onBack) actions.append(h('button', { class: 'btn ghost', text: t('cancel'), onclick: o.onBack }));
  actions.append(h('button', { class: 'btn', 'data-testid': 'sit', text: t('map.sit'), onclick: o.onSit }));
  return h('div', { class: 'panel intro intro4', 'data-testid': 'intro' }, left, right, actions);
}
