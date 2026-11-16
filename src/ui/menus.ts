// Main menu, settings and how-to-play (§12.1, §12.8, §12.9).
import { getLang, HOWTO, HOWTO4, t } from '../data/strings';
import { matchTarget } from '../game/matchConfig';
import type { Settings, Stats } from '../game/save';
import type { CardTextures } from '../render/cardMesh';
import { art, h } from './dom';
import type { Overlay } from './overlay';

export interface MenuOpts {
  hasSave: boolean;
  stats: Stats;
  onContinue: () => void;
  onNew: () => void;
  onHowto: () => void;
  onSettings: () => void;
  /** §18.9: Partneri is the primary mode; each mode has its own Continue. */
  partneri?: { hasSave: boolean; konoba: number; onContinue: () => void; onNew: () => void };
  dvobojKonoba?: number;
  /** language switch in the bottom-right corner (saved like the Settings one) */
  onLanguage?: (l: 'hr' | 'en') => void;
}

export function mainMenu(o: MenuOpts): { el: HTMLElement; setProgress: (p: number) => void } {
  const bgUrl = art.env('konoba');
  const bg = h('div', { class: 'menu-bg' + (bgUrl ? '' : ' fallback') });
  if (bgUrl) bg.style.backgroundImage = `url(${bgUrl})`;
  const logoUrl = art.logo();
  const logo = logoUrl ? h('img', { class: 'logo-img', src: logoUrl, alt: 'TREŠETA' }) : h('div', { class: 'logo-text', text: 'TREŠETA' });
  const buttons = h('div', { class: 'menu-buttons' });
  if (o.partneri) {
    const p = o.partneri;
    if (p.hasSave) buttons.append(h('button', { class: 'btn', 'data-testid': 'continue-partneri', text: t('menu.continueMode', { mode: t('mode.partneriName'), k: p.konoba }), onclick: p.onContinue }));
    if (o.hasSave) buttons.append(h('button', { class: 'btn', 'data-testid': 'continue', text: t('menu.continueMode', { mode: t('mode.dvobojName'), k: o.dvobojKonoba ?? 1 }), onclick: o.onContinue }));
    buttons.append(
      h('button', { class: 'btn mode-primary', 'data-testid': 'new-run-partneri', onclick: p.onNew }, t('mode.partneri'), h('small', { text: t('mode.partneriSub') })),
      h('button', { class: 'btn ghost mode-secondary', 'data-testid': 'new-run', onclick: o.onNew }, t('mode.dvoboj'), h('small', { text: t('mode.dvobojSub') })),
    );
  } else {
    if (o.hasSave) buttons.append(h('button', { class: 'btn', 'data-testid': 'continue', text: t('menu.continue'), onclick: o.onContinue }));
    buttons.append(h('button', { class: 'btn', 'data-testid': 'new-run', text: t('menu.new'), onclick: o.onNew }));
  }
  buttons.append(
    h('button', { class: 'btn ghost', 'data-testid': 'howto', text: t('menu.howto'), onclick: o.onHowto }),
    h('button', { class: 'btn ghost', 'data-testid': 'settings', text: t('menu.settings'), onclick: o.onSettings }),
  );
  const bar = h('div');
  const loadtext = h('div', { class: 'loadtext' });
  const loader = h('div', { class: 'loadbar hidden' }, bar);
  const inner = h('div', { class: 'menu-inner' }, logo, h('div', { class: 'tagline', text: t('menu.tagline') }), buttons, loader, loadtext);
  const footer = h('div', { class: 'menu-footer', text: t('menu.stats', { runs: o.stats.runsStarted, wins: o.stats.runsWon }) });
  const madeBy = h('a', { class: 'made-by', href: 'https://joe-it-solutions.com/', target: '_blank', rel: 'noopener', 'data-testid': 'made-by' },
    h('span', { text: t('menu.madeBy') }), h('b', null, art.joe() ? h('img', { src: art.joe()!, alt: 'joe' }) : null, 'joe'));
  const langs = h('div', { class: 'lang-switch', role: 'group', 'aria-label': t('settings.language') });
  for (const [code, label] of [['hr', 'HR'], ['en', 'EN']] as const) {
    langs.append(h('button', {
      class: 'lang-btn' + (getLang() === code ? ' on' : ''), 'data-testid': `lang-${code}`, 'aria-pressed': String(getLang() === code),
      title: code === 'hr' ? 'Hrvatski' : 'English', text: label,
      onclick: () => { if (getLang() !== code) o.onLanguage?.(code); },
    }));
  }
  const el = h('div', { class: 'screen menu', 'data-screen': 'menu' }, bg, h('div', { class: 'menu-glow' }), inner, footer, madeBy, langs);
  return {
    el,
    setProgress: (p: number) => {
      loader.classList.toggle('hidden', p >= 1);
      bar.style.width = `${Math.round(p * 100)}%`;
      loadtext.textContent = p >= 1 ? '' : t('menu.loading', { p: Math.round(p * 100) });
    },
  };
}

export function settingsModal(ov: Overlay, s: Settings, onChange: (s: Settings) => void, opts: { onQuit?: () => void; onClose?: () => void } = {}): void {
  const panel = h('div', { class: 'panel modal', 'data-testid': 'settings-modal' });
  const render = () => {
    panel.innerHTML = '';
    panel.append(h('h2', { text: t('settings.title') }));
    const grid = h('div', { class: 'settings-grid' });
    const seg = (vals: [string, string][], cur: string, set: (v: string) => void) => {
      const e = h('div', { class: 'seg' });
      for (const [v, label] of vals) e.append(h('button', { class: v === cur ? 'on' : '', text: label, onclick: () => { set(v); onChange(s); render(); } }));
      return e;
    };
    grid.append(h('label', { text: t('settings.language') }), seg([['hr', 'Hrvatski'], ['en', 'English']], s.language, (v) => { s.language = v as 'hr' | 'en'; }));
    grid.append(h('label', { text: t('settings.subtitles') }), seg([['1', t('yes')], ['0', t('no')]], s.subtitles ? '1' : '0', (v) => { s.subtitles = v === '1'; }));
    grid.append(h('label', { text: t('settings.fast') }), seg([['1', t('yes')], ['0', t('no')]], s.fast ? '1' : '0', (v) => { s.fast = v === '1'; }));
    for (const k of ['master', 'voice', 'sfx', 'ambient'] as const) {
      const r = h('input', { type: 'range', min: '0', max: '1', step: '0.05', value: String(s.volumes[k]) }) as HTMLInputElement;
      r.addEventListener('input', () => { s.volumes[k] = Number(r.value); onChange(s); });
      grid.append(h('label', { text: t('settings.' + k) }), r);
    }
    panel.append(grid);
    const row = h('div', { class: 'row' });
    if (opts.onQuit) row.append(h('button', { class: 'btn ghost small', text: t('settings.quit'), onclick: () => { m.close(); opts.onQuit!(); } }));
    row.append(h('button', { class: 'btn', text: t('done'), onclick: () => m.close() }));
    panel.append(row);
  };
  const m = ov.modal(panel, { onClose: opts.onClose });
  render();
}

export function howtoModal(ov: Overlay, textures: CardTextures, onClose?: () => void): void {
  const lang = getLang();
  const strip = h('div', { class: 'rank-strip' });
  for (const r of ['3', '2', 'A', 'K', 'C', 'F', '7', '6', '5', '4'] as const) {
    strip.append(h('figure', null, h('img', { src: textures.faceUrl({ suit: 'kupe', rank: r }) }), h('figcaption', { text: { '3': '3', '2': '2', A: getLang() === 'hr' ? 'As' : 'Ace', K: '13', C: '12', F: '11', '7': '7', '6': '6', '5': '5', '4': '4' }[r] })));
  }
  const ol = h('ol');
  ol.append(h('li', { class: 'howto4', html: `<b>${t('mode.partneri')}:</b> ` + HOWTO4[lang].replace('{target}', String(matchTarget('partneri'))) }));
  for (const line of HOWTO[lang]) ol.append(h('li', { text: line.replace('{target}', String(matchTarget('dvoboj'))) }));
  const panel = h('div', { class: 'panel modal howto' }, h('h2', { text: t('howto.title') }), h('div', { class: 'sect head', style: 'text-align:center;color:var(--cream2);font-size:calc(22*var(--u))', text: t('howto.ranks') }), strip, ol);
  const m = ov.modal(panel, { onClose });
  panel.append(h('div', { class: 'row' }, h('button', { class: 'btn', text: t('done'), onclick: () => m.close() })));
}
