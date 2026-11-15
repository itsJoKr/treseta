// E2E (flows): empty-assets mode, revanš + give up + run end, final match -> run won,
// pending choices (Namješteno reorder, Ribarsko pick) via the real overlays.
// Usage: node tests/e2e/flow.cjs [baseUrl] [shotsDir]
const { chromium } = require('playwright');
const fs = require('fs');
const BASE = process.argv[2] || 'http://localhost:5179/';
const SHOTS = process.argv[3] || require('path').join(__dirname, 'shots');
fs.mkdirSync(SHOTS, { recursive: true });
const errors = [];
const log = (...a) => console.log('[e2e]', ...a);
function assert(c, m) { if (!c) throw new Error('ASSERT: ' + m); }

async function open(browser, query, tag) {
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 900 } });
  const page = await ctx.newPage();
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`[${tag}] ${m.text()}`); });
  page.on('pageerror', (e) => errors.push(`[${tag}] pageerror: ${e.message}`));
  page.on('response', (r) => { if (r.status() >= 400) errors.push(`[${tag}] http ${r.status()}: ${r.url()}`); });
  const requests = [];
  page.on('request', (r) => requests.push(r.url()));
  await page.goto(BASE + query);
  await page.waitForSelector('[data-testid=new-run]', { timeout: 60000 });
  const api = {
    page, ctx, requests,
    shot: async (n) => { await page.screenshot({ path: `${SHOTS}/${tag}_${n}.png` }); log('shot', `${tag}_${n}`); },
    state: () => page.evaluate(() => window.__treseta.state()),
    waitFor: (fn, arg, timeout = 90000) => page.waitForFunction(fn, arg, { timeout, polling: 100 }),
    async startMatch() {
      await page.waitForSelector('[data-testid=map-current]');
      await page.click('[data-testid=map-current]', { force: true });
      await page.click('[data-testid=sit]');
      await api.waitFor(() => { const s = window.__treseta.state(); return s.screen === 'match' && s.match && s.match.playerHand.length === 10 && s.match.animating === 0; });
    },
  };
  return api;
}

(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });

  // ---------- A: empty assets: full hand, shop, revanš, give up, run end ----------
  {
    const a = await open(browser, '?seed=noassets-1&noassets=1&autoplay=1&speed=4&nosave=1&target=30', 'empty');
    await a.page.waitForTimeout(400);
    await a.shot('menu');
    await a.page.click('[data-testid=new-run]');
    await a.page.waitForSelector('[data-testid=map-current]');
    await a.page.evaluate(() => window.__treseta.patchRun({ ukrasi: { kupe_A: 'pozlaceno' } }));
    await a.page.waitForTimeout(500);
    await a.shot('map');
    await a.startMatch();
    await a.shot('match');
    await a.waitFor(() => { const s = window.__treseta.state(); return s.match && s.match.handNo >= 2; }, null, 300000);
    await a.page.waitForTimeout(500);
    await a.shot('hand2');
    const assetReqs = a.requests.filter((u) => /\/assets\/(cards|ukrasi|fore|portraits|env|ui|audio)\//.test(u));
    assert(assetReqs.length === 0, 'noassets mode must not request asset files: ' + assetReqs.slice(0, 3).join(','));
    await a.page.evaluate(() => window.__treseta.endMatch(true));
    await a.page.waitForSelector('[data-testid=to-shop]');
    await a.page.waitForTimeout(1200);
    await a.shot('won');
    await a.page.click('[data-testid=to-shop]');
    await a.page.waitForSelector('[data-screen=shop]');
    await a.page.waitForTimeout(800);
    await a.shot('shop');
    // §19: no removal; Prebaci ukras moves an ukras (both modes)
    assert(!(await a.page.$('[data-testid=remove]')), 'no Izbaci kartu in §19');
    await a.page.click('[data-testid=move]');
    await a.page.waitForSelector('[data-testid=deck-grid] .dcard.pickable');
    await a.page.click('[data-testid=deck-grid] [data-card="kupe_A"]');
    await a.page.waitForTimeout(250);
    await a.shot('deckgrid');
    await a.page.click('[data-testid=deck-grid] [data-card="spade_7"]');
    await a.page.waitForTimeout(1200);
    let s = await a.state();
    assert(s.run.deckSize === 40 && s.run.ukrasi.includes('spade_7:pozlaceno'), 'ukras not moved: ' + s.run.ukrasi);
    await a.page.click('[data-testid=shop-continue]');
    await a.startMatch();
    await a.page.evaluate(() => window.__treseta.endMatch(false));
    await a.page.waitForSelector('[data-testid=revans]');
    await a.page.waitForTimeout(900);
    await a.shot('lost');
    await a.page.click('[data-testid=revans]');
    // §19.1.2: Revanš replays the same match right away (no intro)
    await a.waitFor(() => { const s = window.__treseta.state(); return s.screen === 'match' && s.match && s.match.playerHand.length === 10; });
    s = await a.state();
    assert(s.run.revans === 1, 'revanš not consumed');
    assert(s.match.opponent === 'jure', 'revanš must replay the same opponent');
    await a.page.evaluate(() => window.__treseta.endMatch(false));
    await a.page.waitForSelector('[data-testid=revans]');
    await a.page.click('[data-testid=revans]');
    await a.waitFor(() => { const s = window.__treseta.state(); return s.screen === 'match' && s.match && s.match.playerHand.length === 10; });
    await a.page.evaluate(() => window.__treseta.endMatch(false));
    await a.page.waitForSelector('[data-testid=give-up]');
    assert(!(await a.page.$('[data-testid=revans]')), 'no third revanš (2 tokens)');
    await a.page.click('[data-testid=give-up]');
    await a.page.waitForSelector('[data-testid=run-new]');
    await a.page.waitForTimeout(900);
    await a.shot('runend_lost');
    await a.page.click('[data-testid=run-new]');
    await a.page.waitForSelector('[data-testid=new-run]');
    s = await a.state();
    assert(s.stats.runsStarted >= 1 && s.screen === 'menu', 'back to menu');
    await a.ctx.close();
  }

  // ---------- B: ?start=5 (the boss), final match won -> run won ----------
  {
    const b = await open(browser, '?seed=final-1&start=5&speed=4&nosave=1', 'final');
    await b.page.click('[data-testid=new-run]');
    await b.startMatch();
    let s = await b.state();
    assert(s.match.opponent === 'bepo' && s.run.soldi === 30, 'start=5 sets the boss Bepo and 30 šoldi');
    await b.shot('bepo');
    await b.page.evaluate(() => window.__treseta.endMatch(true));
    await b.page.waitForSelector('[data-testid=to-shop]');
    await b.page.click('[data-testid=to-shop]');
    await b.page.waitForSelector('[data-testid=run-new]');
    await b.page.waitForTimeout(1000);
    await b.shot('runend_won');
    await b.ctx.close();
  }

  // ---------- C: pending choices via the real overlays ----------
  {
    const c = await open(browser, '?seed=pending-3&speed=3&nosave=1', 'pending');
    await c.page.click('[data-testid=new-run]');
    await c.page.waitForSelector('[data-testid=map-current]');
    const uk = {};
    for (const suit of ['kupe', 'bate', 'spade', 'dinari']) for (const r of ['3', '2', 'A', 'K']) uk[`${suit}_${r}`] = 'ribarsko';
    await c.page.evaluate((uk) => window.__treseta.patchRun({ fore: ['namjesteno', 'napij_ga', 'tucem', 'pogled'], ukrasi: uk, rakijaBase: 4 }), uk);
    await c.startMatch();
    await c.waitFor(() => { const s = window.__treseta.state(); return s.match.awaitingInput || s.match.turn === 'bot'; });
    await c.waitFor(() => window.__treseta.state().match.awaitingInput);
    await c.page.waitForTimeout(400);
    await c.shot('ukrasi_hand');
    // Namješteno -> reorder overlay
    await c.page.click('[data-fora=namjesteno]');
    await c.page.waitForSelector('[data-testid=pending-choice]');
    await c.page.waitForTimeout(500);
    await c.shot('reorder');
    await c.page.click('[data-testid=pending-choice] .bigcard >> nth=1');
    await c.page.click('[data-testid=pending-choice] button');
    await c.waitFor(() => window.__treseta.state().match.awaitingInput);
    // Tučem as leader
    let s = await c.state();
    if (s.match.phase === 'lead') { await c.page.click('[data-fora=tucem]'); await c.waitFor(() => window.__treseta.state().match.awaitingInput); }
    // play until a Ribarsko pick appears or the hand ends
    let picked = false;
    for (let k = 0; k < 60 && !picked; k++) {
      await c.waitFor(() => { const s = window.__treseta.state(); return s.match.awaitingInput || s.match.summaryOpen || !!document.querySelector('[data-testid=pending-choice]'); });
      if (await c.page.$('[data-testid=pending-choice]')) {
        await c.page.waitForTimeout(500);
        await c.shot('ribarsko_pick');
        await c.page.click('[data-testid=pending-choice] .bigcard >> nth=0');
        picked = true;
        break;
      }
      s = await c.state();
      if (s.match.summaryOpen) break;
      // prefer leading/following with a 3/2/A (ribarsko) to trigger the pick
      const legal = s.match.legal;
      let i = s.match.playerHand.findIndex((u) => legal.includes(u) && /_(3|2|A|K)$/.test(u));
      if (i < 0) i = s.match.playerHand.findIndex((u) => legal.includes(u));
      await c.page.evaluate((i) => window.__treseta.playCard(i), i);
      await c.page.waitForTimeout(100);
    }
    log('ribarsko pick seen:', picked);
    assert(picked, 'ribarsko pickDraw overlay never appeared');
    await c.waitFor(() => { const s = window.__treseta.state(); return s.match.awaitingInput || s.match.summaryOpen; });
    await c.page.waitForTimeout(300);
    await c.shot('after_pick');
    await c.ctx.close();
  }

  await browser.close();
  log('console errors:', errors.length);
  if (errors.length) console.log(errors.join('\n'));
  assert(errors.length === 0, 'console errors present');
  log('PASS');
})().catch((e) => { console.error(e); console.log(errors.join('\n')); process.exit(1); });
