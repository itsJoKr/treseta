// E2E (Partneri §18): menu → map → partner pick → intro → autoplayed match → butiga with
// Prebaci ukras → map → match 2 dealt. Then a second page plays a full hand with the real
// mouse, arming a player signal on the lead. Asserts no console errors.
// Usage: node tests/e2e/partneri.cjs [baseUrl] [shotsDir]
const { chromium } = require('playwright');
const fs = require('fs');

const BASE = process.argv[2] || 'http://localhost:5179/';
const SHOTS = process.argv[3] || require('path').join(__dirname, 'shots');
fs.mkdirSync(SHOTS, { recursive: true });

const errors = [];
const log = (...a) => console.log('[e2e4]', ...a);
function assert(cond, msg) { if (!cond) throw new Error('ASSERT: ' + msg); }

function watch(page, tag) {
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`${tag} ${m.text()}`); });
  page.on('pageerror', (e) => errors.push(`${tag} pageerror: ${e.message}`));
  page.on('requestfailed', (r) => { const f = r.failure(); if (!r.url().startsWith('data:') && !(f && /ERR_ABORTED/.test(f.errorText))) errors.push(`${tag} requestfailed: ${r.url()} ${f && f.errorText}`); });
  page.on('response', (r) => { if (r.status() >= 400) errors.push(`${tag} http ${r.status()}: ${r.url()}`); });
}

(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });

  // ================= part 1: autoplayed run at 1920×1080 =================
  {
    const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
    const page = await ctx.newPage();
    watch(page, '[run]');
    const shot = async (name) => { await page.screenshot({ path: `${SHOTS}/${name}.png` }); log('shot', name); };
    const state = () => page.evaluate(() => window.__treseta.state());
    const waitFor = (fn, arg, timeout = 90000) => page.waitForFunction(fn, arg, { timeout, polling: 100 });

    await page.goto(BASE + '?seed=e2e-p-run&autoplay=1&speed=3&nosave=1');
    await page.waitForSelector('[data-testid=new-run-partneri]', { timeout: 60000 });
    await page.waitForTimeout(500);
    await shot('p01_menu');
    await page.click('[data-testid=new-run-partneri]');
    await page.waitForSelector('[data-testid=map-current]');
    // give the run one Mi ukras and some šoldi so the shop can show Prebaci ukras
    await page.evaluate(() => window.__treseta.patchRun({ ukrasi: { kupe_A: 'pozlaceno' }, soldi: 20 }));
    await page.waitForTimeout(700);
    await shot('p02_map');
    await page.click('[data-testid=map-current]', { force: true });
    await page.waitForSelector('.pcard.valid');
    await page.waitForTimeout(1400);
    await shot('p03_pick');
    let s = await state();
    assert(s.run4.status === 'pick', 'status pick');
    assert(s.run4.partnerChoices.length === 2, 'two valid partners at match 1: ' + s.run4.partnerChoices);
    const busy = await page.$$eval('.pcard:not(.valid)', (els) => els.map((e) => e.getAttribute('data-partner')));
    assert(busy.includes('tonci') && busy.includes('stipe'), 'opponents are not pickable');
    await page.click(`[data-testid=pick-${s.run4.partnerChoices[0]}]`);
    await page.waitForSelector('[data-testid=sit]');
    await page.waitForTimeout(500);
    await shot('p04_intro');
    s = await state();
    assert(s.run4.partner === s.run4.partnerChoices[0], 'partner picked');
    await page.click('[data-testid=sit]');

    await waitFor(() => { const s = window.__treseta.state(); return s.match && s.match.phaseTag === 'deal'; });
    await page.waitForTimeout(1000);
    await shot('p05_dealing');
    await waitFor(() => { const s = window.__treseta.state(); const m = s.match; return m && m.playerHand.length === 10 && m.fanSizes.W === 10 && m.fanSizes.N === 10 && m.fanSizes.E === 10; });
    s = await state();
    assert(s.match.seatHandSizes.S === 10 && s.match.seatHandSizes.W === 10, '10 cards per seat');
    await shot('p06_dealt');

    // play the match out (autoplay); the shots catch a 4-card trick, a signal and the summary
    const got = new Set();
    let result = null;
    for (let attempt = 0; attempt < 3 && !result; attempt++) {
      const t0 = Date.now();
      while (Date.now() - t0 < 420000) {
        s = await state();
        if (s.screen === 'matchend') break;
        const m = s.match;
        if (m) {
          if (m.trickPlays && m.trickPlays.length === 4 && !got.has('four')) { got.add('four'); await shot('p07_four_cards'); }
          if (m.signal && !got.has('signal')) { got.add('signal'); await page.waitForTimeout(150); await shot('p08_signal_callout'); }
          if (m.phaseTag === 'trick' && m.trickNo >= 3 && !got.has('sweep')) { got.add('sweep'); await page.waitForTimeout(330); await shot('p09_sweep'); }
          if (m.summaryOpen && !got.has('summary')) { got.add('summary'); await page.waitForTimeout(450); await shot('p10_summary'); }
          if (m.voiceLog && m.voiceLog.some((v) => v.seat === 'N')) got.add('partnerSpoke');
        }
        await page.waitForTimeout(100);
      }
      s = await state();
      assert(s.screen === 'matchend', 'match ended');
      await page.waitForTimeout(900);
      await shot(`p11_matchend_${attempt}`);
      if (s.run4.status === 'shop') { result = 'won'; break; }
      if (s.run4.status === 'lostOffer') {
        log('lost a match; taking revanš (replays right away)');
        await page.click('[data-testid=revans]');
      }
    }
    if (!result) {
      log('autoplay lost twice, using skipToShop');
      await page.evaluate(() => window.__treseta.skipToShop());
    }
    log('partner spoke during the match:', got.has('partnerSpoke'));

    // ---------- butiga: Prebaci ukras ----------
    if ((await state()).screen === 'matchend') await page.click('[data-testid=to-shop]');
    await page.waitForSelector('[data-testid=move]');
    await page.waitForTimeout(900);
    await shot('p12_shop');
    s = await state();
    assert(s.run4.shop && s.run4.shop.moves === 0, 'shop with 0 moves');
    assert(await page.$('[data-testid=remove]') === null, 'no remove service in Partneri');
    const soldi0 = s.run4.soldi;
    const uk0 = s.run4.ukrasi.slice().sort();
    await page.click('[data-testid=move]');
    await page.waitForSelector('[data-testid=deck-grid] .dcard.pickable');
    await page.click('[data-testid=deck-grid] [data-card="kupe_A"]');
    await page.waitForTimeout(300);
    await shot('p13_move_pick_target');
    await page.click('[data-testid=deck-grid] [data-card="bate_4"]');
    await waitFor(() => window.__treseta.state().run4.shop.moves === 1);
    await page.waitForTimeout(700);
    s = await state();
    assert(s.run4.soldi === soldi0 - Math.max(1, 2 - s.run4.discount), `Prebaci costs 2 (−discount): ${soldi0} → ${s.run4.soldi}`);
    assert(s.run4.ukrasi.includes('bate_4:pozlaceno') && !s.run4.ukrasi.includes('kupe_A:pozlaceno'), 'ukras moved: ' + s.run4.ukrasi);
    assert(s.run4.deckSize === 40, 'deck stays 40');
    assert(uk0.length === s.run4.ukrasi.length, 'same number of ukrasi');
    await shot('p14_shop_after_move');

    // ---------- match 2 ----------
    await page.click('[data-testid=shop-continue]');
    await page.waitForSelector('[data-testid=map-current]');
    await page.waitForTimeout(1600);
    await shot('p15_map2');
    await page.click('[data-testid=map-current]', { force: true });
    await page.waitForSelector('.pcard.valid');
    s = await state();
    assert(s.run4.ladderIndex === 1, 'ladder index 1');
    assert(s.run4.partnerChoices.length === 2, 'two partners at match 2: ' + s.run4.partnerChoices);
    await page.waitForTimeout(1300);
    await shot('p16_pick2');
    await page.click(`[data-testid=pick-${s.run4.partnerChoices[0]}]`);
    await page.waitForSelector('[data-testid=sit]');
    await page.click('[data-testid=sit]');
    await waitFor(() => { const s = window.__treseta.state(); const m = s.match; return m && m.playerHand.length === 10 && m.fanSizes.W === 10; });
    await page.waitForTimeout(400);
    await shot('p17_match2_dealt');
    s = await state();
    const ch = s.match.chars;
    log('match 2 table', JSON.stringify(ch));
    assert(ch.W === 'jure' && ch.E === 'ive', 'match 2 opponents');
    await ctx.close();
  }

  // ================= part 2: a real-mouse hand with a player signal (1280×720) =================
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    const page = await ctx.newPage();
    watch(page, '[mouse]');
    const shot = async (name) => { await page.screenshot({ path: `${SHOTS}/${name}.png` }); log('shot', name); };
    const state = () => page.evaluate(() => window.__treseta.state());
    const waitFor = (fn, arg, timeout = 90000) => page.waitForFunction(fn, arg, { timeout, polling: 100 });
    await page.goto(BASE + '?seed=e2e-p-mouse&speed=2.5&nosave=1&mode=partneri&newrun=1&autonav=1&partner=luka');
    await page.waitForSelector('[data-testid=map-current]', { timeout: 60000 });
    await page.click('[data-testid=map-current]', { force: true });
    // autonav picks Luka and sits down
    await waitFor(() => { const s = window.__treseta.state(); return s.match && s.match.awaitingInput && s.match.leading && s.match.animating === 0; });
    await page.waitForTimeout(500);
    let s = await state();
    assert(s.match.chars.N === 'luka', 'partner Luka');
    await shot('m01_my_lead');
    // pick a signal that fits some card; prefer Tučem, then Volo, then Strišo
    const ls = s.match.legalSignals;
    const order = ['tucem', 'volo', 'striso'];
    const kind = order.find((k) => Object.values(ls).some((a) => a.includes(k)));
    assert(kind, 'some signal is legal on the lead: ' + JSON.stringify(ls));
    const fits = Object.keys(ls).filter((u) => ls[u].includes(kind));
    const misfit = Object.keys(ls).find((u) => !ls[u].includes(kind));
    // arm with the real mouse
    const btn = await page.$(`.signal-btn[data-signal=${kind}]`);
    const bb = await btn.boundingBox();
    await page.mouse.move(bb.x + bb.width / 2, bb.y + bb.height / 2, { steps: 6 });
    await page.mouse.down(); await page.mouse.up();
    await waitFor((k) => window.__treseta.state().match.armed === k, kind);
    await page.waitForTimeout(350);
    await shot('m02_signal_armed');
    const clickCard = async (uid) => {
      const st = await state();
      const i = st.match.playerHand.indexOf(uid);
      assert(i >= 0, 'card in hand ' + uid);
      const p = st.match.playerHandScreen[i];
      // aim at the upper part of the card (the visible part of a fanned card)
      await page.mouse.move(p.x, p.y - 30, { steps: 8 });
      await page.waitForTimeout(260);
      const st2 = await state();
      const p2 = st2.match.playerHandScreen[st2.match.playerHand.indexOf(uid)];
      await page.mouse.move(p2.x, p2.y - 30, { steps: 3 });
      await page.mouse.down(); await page.mouse.up();
    };
    if (misfit) {
      await clickCard(misfit);
      await page.waitForTimeout(500);
      s = await state();
      assert(s.match.awaitingInput && s.match.playerHand.includes(misfit), 'a card the signal does not fit is refused');
      await shot('m03_signal_misfit');
    }
    await clickCard(fits[0]);
    await waitFor((k) => { const m = window.__treseta.state().match; return m.signalsLog.some((x) => x.seat === 'S' && x.kind === k); }, kind);
    // the A38 chip pops after the card lands; catch it at full size (in 200 ms, hold 1200 ms)
    await page.waitForSelector('.signal-callout', { timeout: 4000 }).catch(() => {});
    await page.waitForTimeout(300);
    await shot('m04_signal_callout');
    log('player signal', kind, 'on', fits[0]);
    // play out the hand with the mouse
    let plays = 1;
    const t0 = Date.now();
    while (Date.now() - t0 < 300000) {
      s = await state();
      if (s.match.summaryOpen || s.screen !== 'match') break;
      if (s.match.awaitingInput && s.match.animating === 0) {
        const legal = s.match.legal;
        const uid = legal[legal.length - 1];
        await clickCard(uid);
        await waitFor((u) => { const m = window.__treseta.state().match; return !m.playerHand.includes(u) || m.summaryOpen; }, uid, 20000);
        plays++;
        if (plays === 4) await shot('m05_mid_hand');
      }
      await page.waitForTimeout(150);
    }
    s = await state();
    assert(s.match.summaryOpen || s.screen !== 'match', 'hand finished');
    assert(plays === 10, 'played 10 cards by mouse, got ' + plays);
    await page.waitForTimeout(450);
    await shot('m06_summary');
    await ctx.close();
  }

  await browser.close();
  const filtered = errors.filter((e) => !/ERR_ABORTED/.test(e));
  if (filtered.length) { console.error('console errors:', filtered); process.exit(1); }
  log('OK, no console errors');
})().catch((e) => { console.error(e); console.error('errors so far:', errors); process.exit(1); });
