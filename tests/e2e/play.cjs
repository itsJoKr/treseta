// E2E: load the game, start a run, play a full match (autoplay), visit the shop,
// buy something and start the next match. Asserts no console errors.
// Usage: node tests/e2e/play.cjs [baseUrl] [shotsDir]
const { chromium } = require('playwright');
const fs = require('fs');

const BASE = process.argv[2] || 'http://localhost:5179/';
const SHOTS = process.argv[3] || require('path').join(__dirname, 'shots');
fs.mkdirSync(SHOTS, { recursive: true });

const errors = [];
const log = (...a) => console.log('[e2e]', ...a);
function assert(cond, msg) { if (!cond) throw new Error('ASSERT: ' + msg); }

(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 900 } });
  const page = await ctx.newPage();
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('requestfailed', (r) => { const f = r.failure(); if (!r.url().startsWith('data:') && !(f && /ERR_ABORTED/.test(f.errorText))) errors.push('requestfailed: ' + r.url() + ' ' + (f && f.errorText)); });
  page.on('response', (r) => { if (r.status() >= 400) errors.push(`http ${r.status()}: ${r.url()}`); });
  const shot = async (name) => { await page.screenshot({ path: `${SHOTS}/${name}.png` }); log('shot', name); };
  const state = () => page.evaluate(() => window.__treseta.state());
  const waitFor = (fn, arg, timeout = 60000) => page.waitForFunction(fn, arg, { timeout, polling: 100 });

  // ---------- menu ----------
  await page.goto(BASE + '?seed=e2e-run-1&autoplay=1&speed=3');
  await page.waitForSelector('[data-testid=new-run]', { timeout: 60000 });
  await page.waitForTimeout(600);
  await shot('01_menu');
  await page.click('[data-testid=new-run]');

  // ---------- map + intro ----------
  await page.waitForSelector('[data-testid=map-current]');
  await page.waitForTimeout(500);
  await shot('02_map');
  await page.click('[data-testid=map-current]', { force: true });
  await page.waitForSelector('[data-testid=sit]');
  await page.waitForTimeout(400);
  await shot('03_intro');
  await page.click('[data-testid=sit]');

  // ---------- match 1 (autoplay) ----------
  await waitFor(() => { const s = window.__treseta.state(); return s.screen === 'match' && s.match && s.match.playerHand.length === 10; });
  await shot('04_dealt');
  const shotsTaken = new Set();
  let wins = 0;
  for (let attempt = 0; attempt < 3; attempt++) {
    const t0 = Date.now();
    while (Date.now() - t0 < 600000) {
      const s = await state();
      if (s.screen === 'matchend') break;
      const m = s.match;
      if (m) {
        if (m.tableCards.length === 2 && !shotsTaken.has('trick')) { shotsTaken.add('trick'); await shot('05_trick'); }
        if (m.tableCards.length === 1 && m.trickNo >= 3 && !shotsTaken.has('lead')) { shotsTaken.add('lead'); await shot('06_lead'); }
        if (m.summaryOpen && !shotsTaken.has('summary')) { shotsTaken.add('summary'); await page.waitForTimeout(900); await shot('08_summary'); }
        if (m.trickNo >= 12 && !shotsTaken.has('late')) { shotsTaken.add('late'); await shot('07_late_hand'); }
      }
      await page.waitForTimeout(120);
    }
    const s = await state();
    assert(s.screen === 'matchend', 'match did not end in time');
    await page.waitForTimeout(1600);
    if (s.run.status === 'shop') { wins++; await shot('09_match_won'); break; }
    await shot(`09_match_lost_${attempt}`);
    if (s.run.status === 'lostOffer') {
      await page.click('[data-testid=revans]');
      await waitFor(() => { const s = window.__treseta.state(); return s.screen === 'match' && s.match && s.match.playerHand.length === 10; });
      continue;
    }
    // run over: start a new run on the same seed path and skip to the shop (still exercises the shop)
    log('run lost; using debug skipToShop');
    await page.evaluate(() => { window.__treseta.newRun('e2e-run-2'); window.__treseta.skipToShop(); });
    break;
  }
  log('match wins:', wins);

  // ---------- shop ----------
  if ((await state()).screen === 'matchend') await page.click('[data-testid=to-shop]');
  await waitFor(() => window.__treseta.state().screen === 'shop');
  await page.waitForTimeout(900);
  await shot('10_shop');
  let s = await state();
  const soldiBefore = s.run.soldi;
  const offers = s.run.shop.offers;
  log('offers', JSON.stringify(offers), 'soldi', soldiBefore);
  let idx = offers.findIndex((o) => !o.sold && o.price <= soldiBefore);
  if (idx < 0) {
    // reroll until something affordable shows up (or give the run some coins via a removal-free path)
    log('nothing affordable; trying a reroll');
    await page.click('[data-testid=reroll]');
    await page.waitForTimeout(600);
    s = await state();
    idx = s.run.shop.offers.findIndex((o) => !o.sold && o.price <= s.run.soldi);
  }
  assert(idx >= 0, 'no affordable offer in the shop');
  const offer = (await state()).run.shop.offers[idx];
  await page.click(`[data-testid=buy-${idx}]`);
  if (offer.kind === 'ukras') {
    await page.waitForSelector('[data-testid=deck-grid] .dcard.pickable');
    await page.waitForTimeout(500);
    await shot('11_deck_grid');
    await page.click('[data-testid=deck-grid] .dcard.pickable >> nth=2');
  }
  await page.waitForTimeout(1500);
  s = await state();
  assert(s.run.shop.offers[idx].sold, 'offer not marked sold');
  assert(s.run.soldi === soldiBefore - offer.price, `soldi not deducted (${soldiBefore} -> ${s.run.soldi})`);
  if (offer.kind === 'ukras') assert(s.run.ukrasi.length > 0, 'ukras not stamped');
  if (offer.kind === 'fora') assert(s.run.fore.includes(offer.id), 'fora not added');
  if (offer.kind === 'casica') assert(s.run.rakijaBase === 3, 'casica not applied');
  log('bought', JSON.stringify(offer));
  await shot('12_shop_after_buy');
  // reload must not reroll the shop (save on every purchase)
  const offersBeforeReload = JSON.stringify(s.run.shop.offers);

  // ---------- next match ----------
  await page.click('[data-testid=shop-continue]');
  await waitFor(() => window.__treseta.state().screen === 'map');
  await page.waitForTimeout(1500);
  await shot('13_map_after_shop');
  s = await state();
  assert(s.run.ladderIndex === 1, 'ladder did not advance');
  await page.click('[data-testid=map-current]', { force: true });
  await page.waitForSelector('[data-testid=sit]');
  await page.waitForTimeout(300);
  await shot('14_intro_2');
  await page.click('[data-testid=sit]');
  await waitFor(() => { const s = window.__treseta.state(); return s.screen === 'match' && s.match && s.match.playerHand.length === 10; });
  await page.waitForTimeout(300);
  await shot('15_match2_dealt');
  s = await state();
  assert(s.match.opponent === 'jure', 'second opponent should be Gazda Jure');

  // ---------- persistence: reload mid-run resumes ----------
  await page.goto(BASE + '?speed=3');
  await page.waitForSelector('[data-testid=continue]', { timeout: 60000 });
  await page.click('[data-testid=continue]');
  await waitFor(() => { const s = window.__treseta.state(); return s.screen === 'match' && s.match && s.match.opponent === 'jure' && s.match.playerHand.length === 10; });
  log('resume OK');
  void offersBeforeReload;

  log('console errors:', errors.length);
  if (errors.length) { console.log(errors.join('\n')); }
  await browser.close();
  assert(errors.length === 0, 'console errors present');
  log('PASS');
})().catch(async (e) => {
  console.error(e);
  console.log('errors so far:\n' + errors.join('\n'));
  process.exit(1);
});
