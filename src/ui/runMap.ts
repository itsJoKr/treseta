// Map (§12.3) and opponent intro panel.
import gsap from 'gsap';
import type { AudioManager } from '../audio/audio';
import { getLang, t } from '../data/strings';
import { FORE } from '../game/fore';
import type { DvobojOpponent } from '../game/dvobojLadder';
import { DVOBOJ_LADDER } from '../game/ladders';
import { LADDER, OPPONENTS } from '../game/opponents';
import type { DeckCard } from '../game/types';
import type { CardTextures } from '../render/cardMesh';
import { art, h } from './dom';

// §19.5.3: K1 B1 K2 B2 … K6 (11 nodes)
const NODES: [number, number][] = [[10, 80], [19, 69], [28, 61], [38, 55], [48, 50], [57, 44], [65, 38], [73, 31], [80, 25], [86, 19], [91, 12]];
const BUTIGA_TIER = ['t1', 't2', 't2', 't3', 't3'];

function pathD(pts: [number, number][]): string {
  if (pts.length < 2) return '';
  let d = `M ${pts[0][0]} ${pts[0][1]}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += ` C ${c1[0]} ${c1[1]}, ${c2[0]} ${c2[1]}, ${p2[0]} ${p2[1]}`;
  }
  return d;
}

export interface MapOpts {
  ladderIndex: number;
  soldi: number;
  travelFrom?: number; // node index to animate the token from
  onOpen: () => void;
  onSettings: () => void;
  /** each konoba node: one portrait (Dvoboj) or the pair (Partneri) */
  konobe?: { portraits: string[]; label: string }[];
  /** Revanš tokens left (chalk marks under the token) */
  revans?: number;
}

export function runMap(o: MapOpts, audio: AudioManager): HTMLElement {
  const bg = art.env('map');
  const el = h('div', { class: 'screen map' + (bg ? '' : ' fallback'), 'data-screen': 'map' });
  if (bg) el.style.backgroundImage = `url(${bg})`;
  const svgNS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(svgNS, 'svg');
  svg.setAttribute('viewBox', '0 0 100 100');
  svg.setAttribute('preserveAspectRatio', 'none');
  const path = document.createElementNS(svgNS, 'path');
  path.setAttribute('d', pathD(NODES));
  path.setAttribute('class', 'path');
  path.setAttribute('vector-effect', 'non-scaling-stroke');
  svg.append(path);
  el.append(svg);
  el.append(h('div', { class: 'map-title', text: t('map.title') }));
  const gear = h('button', { class: 'btn ghost small', text: t('menu.settings'), onclick: o.onSettings });
  el.append(h('div', { class: 'map-hud' }, h('div', { class: 'soldi', style: 'position:static' }, h('i', { class: 'coin', style: `background-image:url(${art.coin()})` }), h('span', { text: String(o.soldi) })), gear));
  const current = o.ladderIndex * 2;
  NODES.forEach(([x, y], i) => {
    const isK = i % 2 === 0;
    const k = i / 2;
    let cls = 'node ' + (isK ? 'konoba' : 'butiga') + (isK && k === 5 ? ' boss' : '') + (!isK ? ' tier-' + BUTIGA_TIER[(i - 1) / 2] : '');
    if (i < current) cls += ' beaten';
    else if (i === current) cls += ' current';
    else cls += ' locked';
    const node = h('div', { class: cls, style: `left:${x}%;top:${y}%`, 'data-node': String(i) });
    if (isK && o.konobe) {
      const kk = o.konobe[k];
      node.append(h('div', { class: 'faces' }, ...kk.portraits.map((src) => h('div', { class: 'face' }, h('img', { src, alt: '' })))), h('div', { class: 'label', text: kk.label }));
      if (i === current) {
        node.setAttribute('data-testid', 'map-current');
        node.addEventListener('click', () => o.onOpen());
      }
    } else if (isK) {
      const id = LADDER[k];
      node.append(h('div', { class: 'face' }, h('img', { src: art.portrait(id), alt: '' })), h('div', { class: 'label', text: OPPONENTS[id].konoba }));
      if (i === current) {
        node.setAttribute('data-testid', 'map-current');
        node.addEventListener('click', () => o.onOpen());
      }
    } else {
      node.append(h('i', { class: 'coin', style: `background-image:url(${art.coin()})` }), h('b', { class: 'pip' }));
    }
    el.append(node);
  });
  const token = h('div', { class: 'token', style: `background-image:url(${art.rakijaFull()})` });
  const [cx, cy] = NODES[current];
  token.style.left = `${cx}%`;
  token.style.top = `${cy}%`;
  if (o.revans !== undefined) {
    const marks = h('div', { class: 'chalk', title: 'Revanš' });
    for (let k = 0; k < o.revans; k++) marks.append(h('i'));
    token.append(marks);
  }
  el.append(token);
  el.append(h('div', { class: 'map-hint', text: t('map.hint') }));
  if (o.travelFrom !== undefined && o.travelFrom < current) {
    const from = o.travelFrom;
    const pts = NODES.slice(from, current + 1);
    const seg = document.createElementNS(svgNS, 'path');
    seg.setAttribute('d', pathD(pts));
    seg.setAttribute('fill', 'none');
    svg.append(seg);
    const total = seg.getTotalLength();
    const st = { t: 0 };
    const place = () => {
      const p = seg.getPointAtLength(total * st.t);
      token.style.left = `${p.x}%`;
      token.style.top = `${p.y}%`;
    };
    place();
    gsap.to(st, { t: 1, duration: 0.9, delay: 0.35, ease: 'power2.inOut', onUpdate: place, onStart: () => { audio.play('map_step'); gsap.delayedCall(0.45, () => audio.play('map_step')); } });
  }
  return el;
}

export function introPanel(def: DvobojOpponent, ladderIndex: number, mods: { marks: DeckCard[]; forgeries: DeckCard[] }, textures: CardTextures, onSit: () => void, onBack?: () => void): HTMLElement {
  const hr = getLang() === 'hr';
  const diff = h('div', { class: 'diff' });
  for (let i = 0; i < 4; i++) diff.append(h('i', { class: 'glass-ico' + (i < def.difficulty ? '' : ' off'), style: `background-image:url(${art.rakijaFull()})` }));
  const foreList = h('div', { class: 'list' });
  if (def.fore.length === 0) foreList.append(h('span', { text: t('intro.none') }));
  for (const f of def.fore) {
    foreList.append(h('div', { class: 'item' }, h('div', { class: 'fart', style: `background-image:url(${art.fora(f)})` }), h('span', { text: hr ? FORE[f].nameHr : FORE[f].nameEn })));
  }
  const mini = (cards: DeckCard[]) => {
    const l = h('div', { class: 'list' });
    if (!cards.length) l.append(h('span', { text: t('intro.none') }));
    for (const c of cards) l.append(h('div', { class: 'mini-wrap' }, h('div', { class: 'mini', style: `background-image:url(${textures.faceUrl(c.forge ? { ...c, suit: c.forge.suit, rank: c.forge.rank } : c)})` })));
    return l;
  };
  const left = h('div', { class: 'left' },
    h('div', { class: 'portrait' + (ladderIndex === 5 ? ' boss' : '') }, h('img', { src: art.portrait(def.id), alt: '' })),
    diff,
    h('div', { class: 'meta', text: t('intro.rakija', { n: def.rakija }) }));
  const right = h('div', { class: 'right' },
    h('h2', { text: def.name }),
    h('div', { class: 'konoba', text: `${def.konoba} · ${t('intro.match4', { i: ladderIndex + 1, n: DVOBOJ_LADDER.length })}` }),
    h('div', { class: 'bio', text: hr ? def.bioHr : def.bioEn }),
    h('div', { class: 'sect', text: t('intro.fore') + ':' }), foreList,
    h('div', { class: 'sect', text: t('intro.marks', { n: mods.marks.length }) }), mini(mods.marks),
    h('div', { class: 'sect', text: t('intro.forgeries', { n: mods.forgeries.length }) }), mini(mods.forgeries));
  const actions = h('div', { class: 'actions' });
  if (onBack) actions.append(h('button', { class: 'btn ghost', text: t('cancel'), onclick: onBack }));
  actions.append(h('button', { class: 'btn', 'data-testid': 'sit', text: t('map.sit'), onclick: onSit }));
  return h('div', { class: 'panel intro', 'data-testid': 'intro' }, left, right, actions);
}
