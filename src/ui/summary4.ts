// Light between-hands panel for Partneri (§19.5.2 shape, with the §18.8 "od toga partner" row).
import gsap from 'gsap';
import { t } from '../data/strings';
import type { SideBreakdown } from '../game/types';
import type { Team } from '../game/types4';
import { h } from './dom';

/** Dvoboj light panel (§19.5.2): Ti / bot columns. */
export function lightSummary(o: {
  names: [string, string]; b: [SideBreakdown, SideBreakdown]; scores: [number, number]; target: number; matchOver: boolean; onDone: () => void;
}): HTMLElement {
  const hand = (x: SideBreakdown) => x.total + x.akuzaPoints;
  const line = (x: SideBreakdown) => `${t('summary.cardsLabel').split(' ')[0]} ${x.cardPoints} · ${t('summary.ultima')} ${x.ultima} · ${t('summary.ukrasi')} ${x.ukrasPoints} · ${t('summary.akuze')} ${x.akuzaPoints}`;
  const table = h('table', null,
    h('tr', null, h('th'), h('th', { text: o.names[0] }), h('th', { text: o.names[1] })),
    h('tr', null, h('td', { text: t('summary.hand') }), h('td', { text: String(hand(o.b[0])) }), h('td', { text: String(hand(o.b[1])) })),
    h('tr', { class: 'match' }, h('td', { text: `${t('summary.match')} / ${o.target}` }), h('td', { text: String(o.scores[0]) }), h('td', { text: String(o.scores[1]) })));
  const bar = h('div', { class: 'bar' });
  const el = h('div', { class: 'lightsum', 'data-testid': 'hand-summary' }, h('h3', { text: t('summary.title') }), table,
    h('div', { class: 'lsline', text: `${o.names[0]}: ${line(o.b[0])}` }), h('div', { class: 'lsline', text: `${o.names[1]}: ${line(o.b[1])}` }), bar);
  el.addEventListener('click', () => o.onDone());
  gsap.fromTo(el, { y: -300, opacity: 0 }, { y: 0, opacity: 1, duration: 0.3, ease: 'power3.out' });
  if (!o.matchOver) gsap.fromTo(bar, { scaleX: 1 }, { scaleX: 0, duration: 3.5, ease: 'none' });
  else bar.remove();
  return el;
}

export function lightSummary4(o: {
  b: Record<Team, SideBreakdown>; scores: Record<Team, number>; target: number; partnerAkuza: number; matchOver: boolean; onDone: () => void;
}): HTMLElement {
  const hand = (x: SideBreakdown) => x.total + x.akuzaPoints;
  const line = (x: SideBreakdown) => `${t('summary.cardsLabel').split(' ')[0]} ${x.cardPoints} · ${t('summary.ultima')} ${x.ultima} · ${t('summary.ukrasi')} ${x.ukrasPoints} · ${t('summary.akuze')} ${x.akuzaPoints}`;
  const table = h('table', null,
    h('tr', null, h('th'), h('th', { text: t('hud.mi') }), h('th', { text: t('hud.vi') })),
    h('tr', null, h('td', { text: t('summary.hand') }), h('td', { text: String(hand(o.b.mi)) }), h('td', { text: String(hand(o.b.vi)) })),
    h('tr', { class: 'sub' }, h('td', { text: t('summary.akuze') }), h('td', { text: String(o.b.mi.akuzaPoints) }), h('td', { text: String(o.b.vi.akuzaPoints) })),
    h('tr', { class: 'sub' }, h('td', { text: '· ' + t('summary.partner') }), h('td', { text: String(o.partnerAkuza) }), h('td', { text: '' })),
    h('tr', { class: 'match' }, h('td', { text: `${t('summary.match')} / ${o.target}` }), h('td', { text: String(o.scores.mi) }), h('td', { text: String(o.scores.vi) })));
  const note = (x: SideBreakdown) => (x.rounding === 'ceil' && x.thirds % 3 ? t('summary.ceil') : x.thirds % 3 === 1 ? t('summary.dropped') : x.thirds % 3 === 2 ? t('summary.dropped2') : '');
  const bar = h('div', { class: 'bar' });
  const el = h('div', { class: 'lightsum', 'data-testid': 'hand-summary' },
    h('h3', { text: t('summary.title') }), table,
    h('div', { class: 'lsline', text: `${t('hud.mi')}: ${line(o.b.mi)} ${note(o.b.mi)}` }),
    h('div', { class: 'lsline', text: `${t('hud.vi')}: ${line(o.b.vi)} ${note(o.b.vi)}` }), bar);
  el.addEventListener('click', () => o.onDone());
  gsap.fromTo(el, { y: -300, opacity: 0 }, { y: 0, opacity: 1, duration: 0.3, ease: 'power3.out' });
  if (!o.matchOver) gsap.fromTo(bar, { scaleX: 1 }, { scaleX: 0, duration: 3.5, ease: 'none' });
  else bar.remove();
  return el;
}
