// Hand summary (§12.4), match end (§12.5) and run end (§12.7).
import gsap from 'gsap';
import { t } from '../data/strings';
import { OPPONENTS } from '../game/opponents';
import type { RunState } from '../game/run';
import { CHARACTERS } from '../game/characters';
import type { CharacterId } from '../game/characters';
import type { RunStats } from '../game/run';
import type { OpponentId, Side, SideBreakdown } from '../game/types';
import { art, h } from './dom';

export function handSummary(opp: OpponentId, b: Record<Side, SideBreakdown>, matchScores: Record<Side, number>, onContinue: () => void, matchOver: boolean): HTMLElement {
  const name = OPPONENTS[opp].name.split(' ').slice(-1)[0];
  const note = (x: SideBreakdown) => {
    if (x.rounding === 'ceil' && x.thirds % 3 !== 0) return t('summary.ceil');
    if (x.thirds % 3 === 1) return t('summary.dropped');
    if (x.thirds % 3 === 2) return t('summary.dropped2');
    return '';
  };
  const cell = (v: number, plus = true) => (v ? (plus ? `+${v}` : String(v)) : '–');
  const rows: [string, string, string, string][] = [
    ['cards', t('summary.cardsLabel'), String(b.player.cardPoints), String(b.bot.cardPoints)],
    ['ultima', t('summary.ultima'), cell(b.player.ultima), cell(b.bot.ultima)],
    ['ukrasi', t('summary.ukrasi'), cell(b.player.ukrasPoints), cell(b.bot.ukrasPoints)],
    ['akuze', t('summary.akuze'), cell(b.player.akuzaPoints), cell(b.bot.akuzaPoints)],
  ];
  const tp = b.player.total + b.player.akuzaPoints;
  const tb = b.bot.total + b.bot.akuzaPoints;
  const table = h('table');
  table.append(h('tr', null, h('th'), h('th', { text: t('summary.you') }), h('th', { text: name })));
  const trs: HTMLElement[] = [];
  for (const [k, label, p, bb] of rows) {
    const tdL = h('td', { text: label });
    if (k === 'cards') {
      const np = note(b.player), nb = note(b.bot);
      const pc = h('td', null, p, h('span', { class: 'note', text: t('summary.thirds', { b: b.player.thirds }) }), np ? h('span', { class: 'note', text: np }) : null);
      const bc = h('td', null, bb, h('span', { class: 'note', text: t('summary.thirds', { b: b.bot.thirds }) }), nb ? h('span', { class: 'note', text: nb }) : null);
      const tr = h('tr', null, tdL, pc, bc);
      trs.push(tr);
      table.append(tr);
      continue;
    }
    const tr = h('tr', null, tdL, h('td', { text: p }), h('td', { text: bb }));
    trs.push(tr);
    table.append(tr);
  }
  const numP = h('td', { text: '0', 'data-count': String(tp) });
  const numB = h('td', { text: '0', 'data-count': String(tb) });
  const total = h('tr', { class: 'total' }, h('td', { text: t('summary.hand') }), numP, numB);
  const match = h('tr', { class: 'match' }, h('td', { text: t('summary.match') }), h('td', { text: String(matchScores.player) }), h('td', { text: String(matchScores.bot) }));
  trs.push(total, match);
  table.append(total, match);
  const btn = h('button', { class: 'btn', 'data-testid': 'summary-continue', text: t('common.continue'), onclick: onContinue });
  void matchOver;
  const panel = h('div', { class: 'panel summary', 'data-testid': 'hand-summary' }, h('h2', { text: t('summary.title') }), table, h('div', { class: 'actions' }, btn));
  const el = h('div', { class: 'screen', style: 'align-items:flex-start;padding-top:calc(140 * var(--u));background:rgba(10,5,2,0.35)' }, panel);
  // A30: slide from top, rows stagger 150, numbers count up 600
  gsap.fromTo(panel, { y: -500, opacity: 0 }, { y: 0, opacity: 1, duration: 0.4, ease: 'power3.out' });
  gsap.fromTo(trs, { opacity: 0, x: -20 }, { opacity: 1, x: 0, duration: 0.25, stagger: 0.15, delay: 0.25 });
  for (const td of [numP, numB]) {
    const target = Number(td.getAttribute('data-count'));
    const o = { v: 0 };
    gsap.to(o, { v: target, duration: 0.6, delay: 0.25 + 0.15 * 4, ease: 'power1.out', onUpdate: () => { td.textContent = String(Math.round(o.v)); } });
  }
  return el;
}

export function matchEnd(o: {
  win: boolean; opp: CharacterId | CharacterId[]; scores: Record<Side, number>; reward?: { base: number; margin: number; akuze: number; total: number };
  finalMatch: boolean; revans: number; onShop: () => void; onRevans: () => void; onGiveUp: () => void; titles?: [string, string];
  /** per-hand breakdown (§19.5.2): [our side, their side] per hand */
  hands?: [SideBreakdown, SideBreakdown][]; names?: [string, string];
}): HTMLElement {
  const title = h('div', { class: 'title', text: o.win ? (o.titles?.[0] ?? t('match.win')) : (o.titles?.[1] ?? t('match.lose')) });
  const ids = Array.isArray(o.opp) ? o.opp : [o.opp];
  const portrait = h('div', { class: 'end-portraits', style: 'display:flex;gap:calc(20 * var(--u))' }, ...ids.map((id) => h('div', { class: 'portrait big-portrait' + (o.win ? ' sad' : '') }, h('img', { src: art.portrait(id), alt: '' }))));
  const final = h('div', { class: 'final', text: t('match.final', { a: o.scores.player, b: o.scores.bot }) });
  const el = h('div', { class: 'screen matchend ' + (o.win ? 'win' : 'lose'), 'data-screen': 'matchend' }, title, portrait, final);
  if (o.hands && o.hands.length) {
    const nm = o.names ?? [t('summary.you'), '—'];
    const tb = h('table', { class: 'hands-table' });
    const hd = h('tr', null, h('th', { text: '#' }));
    for (const n of nm) for (const k of ['summary.cardsLabel', 'summary.ultima', 'summary.ukrasi', 'summary.akuze', 'summary.total']) hd.append(h('th', { text: k === 'summary.cardsLabel' ? `${n}: ${t(k).split(' ')[0]}` : t(k) }));
    tb.append(hd);
    o.hands.forEach(([a, b], i) => {
      const tr = h('tr', { class: i === o.hands!.length - 1 ? 'last' : '' }, h('td', { text: String(i + 1) }));
      for (const x of [a, b]) for (const v of [x.cardPoints, x.ultima, x.ukrasPoints, x.akuzaPoints, x.total + x.akuzaPoints]) tr.append(h('td', { text: String(v) }));
      tb.append(tr);
    });
    const last = o.hands[o.hands.length - 1];
    const note = last[0].rounding === 'ceil' ? t('summary.ceil') : last[0].thirds % 3 ? t(last[0].thirds % 3 === 1 ? 'summary.dropped' : 'summary.dropped2') : '';
    el.append(h('div', { class: 'panel hands-panel' }, tb, note ? h('div', { class: 'note', text: note }) : null));
  }
  if (o.win && o.reward) {
    const r = o.reward;
    el.append(h('div', { class: 'reward' }, h('i', { class: 'coin', style: `background-image:url(${art.coin()})` }),
      h('span', { html: t('match.reward', { base: r.base, margin: r.margin, ak: r.akuze, total: `<b>${r.total}</b>` }) })));
  }
  const row = h('div', { class: 'row' });
  if (o.win) {
    row.append(h('button', { class: 'btn', 'data-testid': 'to-shop', text: o.finalMatch ? t('common.continue') : t('match.toShop'), onclick: o.onShop }));
  } else {
    if (o.revans > 0) row.append(h('button', { class: 'btn', 'data-testid': 'revans', text: t('match.revans', { n: o.revans }), onclick: o.onRevans }));
    row.append(h('button', { class: 'btn ghost', 'data-testid': 'give-up', text: t('match.giveUp'), onclick: o.onGiveUp }));
  }
  el.append(row);
  // A31/A32
  gsap.fromTo(title, { scale: 0.6 }, { scale: 1, duration: 0.9, ease: 'elastic.out(1, 0.6)' });
  if (!o.win) gsap.fromTo(portrait, { y: 0 }, { y: -8, duration: 0.16, yoyo: true, repeat: 5, ease: 'sine.inOut' });
  return el;
}

/** A31 coin flight: coins fly from the centre to the target rect. */
export function flyCoins(fx: HTMLElement, n: number, to: DOMRect, onEach?: () => void): Promise<void> {
  const count = Math.min(20, n);
  if (count <= 0) return Promise.resolve();
  const cx = window.innerWidth / 2;
  const cy = window.innerHeight / 2;
  const ps: Promise<void>[] = [];
  for (let i = 0; i < count; i++) {
    const c = h('div', { class: 'flycoin', style: `background-image:url(${art.coin()});left:${cx}px;top:${cy}px` });
    fx.append(c);
    ps.push(new Promise((res) => {
      gsap.fromTo(c, { x: (Math.random() - 0.5) * 120, y: (Math.random() - 0.5) * 80, scale: 0.6 }, {
        x: to.left + to.width / 2 - cx, y: to.top + to.height / 2 - cy, scale: 1, duration: 0.5, delay: i * 0.06, ease: 'power2.in',
        onComplete: () => { c.remove(); onEach?.(); res(); },
      });
    }));
  }
  return Promise.all(ps).then(() => undefined);
}

export function runEnd(run: Pick<RunState, 'status'> & { stats: RunStats } | { status: string; stats: RunStats }, onNew: () => void): HTMLElement {
  const won = run.status === 'won';
  const ms = Math.max(0, (run.stats.endedAt ?? Date.now()) - run.stats.startedAt);
  const mm = Math.floor(ms / 60000);
  const ss = Math.floor((ms % 60000) / 1000);
  const stats = h('div', { class: 'panel stats' },
    h('span', { text: t('run.matches') }), h('span', { text: String(run.stats.matchesWon) }),
    h('span', { text: t('run.points') }), h('span', { text: String(run.stats.totalPoints) }),
    h('span', { text: t('run.akuze') }), h('span', { text: String(run.stats.akuzeDeclared) }),
    h('span', { text: t('run.soldi') }), h('span', { text: String(run.stats.soldiEarned) }),
    h('span', { text: t('run.time') }), h('span', { text: `${mm}:${String(ss).padStart(2, '0')}` }));
  if (!won && run.stats.beatenBy) stats.append(h('span', { text: t('run.beatenBy') }), h('span', { text: CHARACTERS[run.stats.beatenBy].name }));
  const title = h('div', { class: 'title', text: won ? t('run.won') : t('run.lost') });
  const el = h('div', { class: 'screen runend ' + (won ? 'won' : 'lost'), 'data-screen': 'runend' }, title, stats,
    h('button', { class: 'btn', 'data-testid': 'run-new', text: t('menu.new'), onclick: onNew }));
  gsap.fromTo(title, { scale: 0.6 }, { scale: 1, duration: 0.9, ease: 'elastic.out(1, 0.6)' });
  gsap.fromTo(stats, { y: 40, opacity: 0 }, { y: 0, opacity: 1, duration: 0.5, delay: 0.3 });
  return el;
}
