// E2E (manual input): real mouse hover/click on 3D hand cards, illegal play, fora use,
// targeting, a full hand to the summary; screenshots at 1280x720 and 1920x1080.
// Usage: node tests/e2e/interact.cjs [baseUrl] [shotsDir]
const { chromium } = require('playwright');
const fs = require('fs');
const BASE = process.argv[2] || 'http://localhost:5179/';
const SHOTS = process.argv[3] || require('path').join(__dirname, 'shots');
fs.mkdirSync(SHOTS, { recursive: true });
const errors = [];
const log = (...a) => console.log('[e2e]', ...a);
function assert(c, m) { if (!c) throw new Error('ASSERT: ' + m); }

async function run(browser, w, hgt, tag) {
  const ctx = await browser.newContext({ viewport: { width: w, height: hgt } });
  const page = await ctx.newPage();
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`[${tag}] ${m.text()}`); });
  page.on('pageerror', (e) => errors.push(`[${tag}] pageerror: ${e.message}`));
  page.on('response', (r) => { if (r.status() >= 400) errors.push(`[${tag}] http ${r.status()}: ${r.url()}`); });
  const shot = async (n) => { await page.screenshot({ path: `${SHOTS}/${tag}_${n}.png` }); log('shot', `${tag}_${n}`); };
  const state = () => page.evaluate(() => window.__treseta.state());
  const waitFor = (fn, arg, timeout = 60000) => page.waitForFunction(fn, arg, { timeout, polling: 100 });
  const waitTurn = () => waitFor(() => { const s = window.__treseta.state(); return s.match && ((s.match.awaitingInput && s.match.animating === 0) || s.match.summaryOpen || s.screen !== 'match'); }, null, 90000);

  await page.goto(BASE + '?seed=interact-7&speed=2.5&nosave=1&target=30');
  await page.waitForSelector('[data-testid=new-run]', { timeout: 60000 });
  await page.click('[data-testid=new-run]');
  await page.waitForSelector('[data-testid=map-current]');
  // §19 starts with Pogled only: give this test run Zamjena too
  await page.evaluate(() => window.__treseta.patchRun({ fore: ['pogled', 'zamjena'], rakijaBase: 3 }));
  await page.click('[data-testid=map-current]', { force: true });
  await page.click('[data-testid=sit]');
  await waitTurn();
  await page.waitForTimeout(400);
  let s = await state();
  // hover the middle card with the real mouse
  const pos = s.match.playerHandScreen;
  const mid = Math.floor(pos.length / 2);
  await page.mouse.move(pos[mid].x, pos[mid].y - 40);
  await page.waitForTimeout(500);
  await shot('hover');
  // if following, try an illegal card first
  if (s.match.legal.length < s.match.playerHand.length) {
    const illegal = s.match.playerHand.findIndex((u) => !s.match.legal.includes(u));
    const p = s.match.playerHandScreen[illegal];
    await page.mouse.click(p.x, p.y - 40);
    await page.waitForTimeout(250);
    await shot('illegal');
    s = await state();
    assert(s.match.awaitingInput, 'illegal click must not play');
  }
  // use Pogled (click the fora slot)
  const slot = await page.$('[data-fora=pogled]');
  if (slot) {
    await slot.click();
    await page.waitForTimeout(700);
    await shot('fora_pogled');
    await waitTurn();
    s = await state();
    assert(s.match.foreUsed.includes('pogled') || !s.match.awaitingInput, 'pogled not used');
  }
  // Zamjena: targeting mode, then click a hand card
  s = await state();
  if (s.match.awaitingInput && s.match.rakija >= 1) {
    const z = await page.$('[data-fora=zamjena]');
    if (z) {
      await z.click();
      await page.waitForTimeout(300);
      await shot('targeting');
      s = await state();
      const p = s.match.playerHandScreen[0];
      await page.mouse.click(p.x, p.y - 40);
      await page.waitForTimeout(400);
      await waitTurn();
      s = await state();
      assert(s.match.foreUsed.includes('zamjena'), 'zamjena not used');
    }
  }
  // play cards with real clicks until the hand ends
  let plays = 0;
  for (let k = 0; k < 80; k++) {
    await waitTurn();
    s = await state();
    if (s.match.summaryOpen || s.screen !== 'match') break;
    const legal = s.match.legal;
    const i = s.match.playerHand.findIndex((u) => legal.includes(u));
    const p = s.match.playerHandScreen[i];
    await page.mouse.move(p.x, p.y - 40);
    await page.waitForTimeout(60);
    // the hovered card lifts; click slightly higher to stay on it
    await page.mouse.click(p.x, p.y - 60);
    plays++;
    await page.waitForTimeout(150);
    if (plays === 3) await shot('midplay');
    if (plays === 12) {
      await page.waitForTimeout(500);
      await shot('late');
    }
  }
  await waitFor(() => window.__treseta.state().match && window.__treseta.state().match.summaryOpen, null, 60000);
  await page.waitForTimeout(1600);
  await shot('summary');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(800);
  s = await state();
  log(tag, 'plays', plays, 'scores', JSON.stringify(s.match && s.match.scores), 'voice', JSON.stringify(s.match && s.match.voiceLog.map((v) => v.line)));
  assert(plays >= 8, 'too few plays');
  // settings modal + language switch to HR
  await page.click('.gear');
  await page.waitForSelector('[data-testid=settings-modal]');
  await page.click('[data-testid=settings-modal] .seg button >> text=Hrvatski');
  await page.waitForTimeout(300);
  await shot('settings_hr');
  await page.keyboard.press('Escape');
  await ctx.close();
}

(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  await run(browser, 1280, 720, 'r720');
  await run(browser, 1920, 1080, 'r1080');
  await browser.close();
  log('console errors:', errors.length);
  if (errors.length) console.log(errors.join('\n'));
  assert(errors.length === 0, 'console errors present');
  log('PASS');
})().catch((e) => { console.error(e); console.log(errors.join('\n')); process.exit(1); });
