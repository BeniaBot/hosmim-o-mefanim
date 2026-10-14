// בדיקה בדפדפן בלי מסך: node v2/tools/shot.js <outdir> [scenario]
// דורש Playwright (מותקן גלובלית בסביבת הפיתוח), לא נדרש כדי לשחק.
const path = require('path');
let pw; try { pw = require('playwright'); } catch (e) { pw = require('/opt/node22/lib/node_modules/playwright'); }
const OUT = process.argv[2] || '.';
const scenario = process.argv[3] || 'basic';
const URL = 'file://' + path.resolve(__dirname, '..', 'index.html');
(async () => {
  const b = await pw.chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
  const p = await b.newPage({ viewport: { width: 1366, height: 768 } });
  const errs = [], reqs = [];
  p.on('pageerror', e => errs.push('PAGEERR ' + e.message + '\n' + (e.stack || '').split('\n').slice(0, 4).join('\n')));
  p.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') errs.push(m.type().toUpperCase() + ' ' + m.text()); });
  p.on('request', r => { const u = r.url(); if (!u.startsWith('file:') && !u.startsWith('data:') && !u.startsWith('blob:')) reqs.push(u); });
  await p.goto(URL);
  await p.waitForTimeout(3000);
  await p.screenshot({ path: OUT + '/01-menu.png' });
  if (errs.length) console.log('early errors:', errs.join('\n'));
  const ff = async (sec) => p.evaluate((sec) => { const G = HM.Game, w = G.world; const n = Math.round(sec / w.BAL.dt); for (let i = 0; i < n && !w.outcome; i++) { w.step(); G.hud.handleEvents(w.events.drain()); } }, sec);
  if (scenario === 'basic') {
    await p.click('#btnStart');
    await p.waitForTimeout(1500);
    await p.screenshot({ path: OUT + '/02-start.png' });
    await ff(6);
    await p.waitForTimeout(600);
    await p.screenshot({ path: OUT + '/03-after6s.png' });
    // בחירת חוליה דרך השלט שלה ושליחה לכביש
    const badge = await p.$('.badge.prot');
    if (badge) { const bb = await badge.boundingBox(); await p.mouse.click(bb.x + bb.width / 2, bb.y + bb.height / 2); }
    await p.waitForTimeout(400);
    const road = await p.evaluate(() => { const G = HM.Game; const s = G.hud.project(-2, 0, 0); return s; });
    await p.mouse.move(road.x, road.y);
    await p.waitForTimeout(500);
    await p.screenshot({ path: OUT + '/04-preview.png' });
    await p.mouse.click(road.x, road.y);
    await ff(10);
    await p.keyboard.press('KeyS');
    await ff(30);
    await p.waitForTimeout(500);
    await p.screenshot({ path: OUT + '/05-blocking.png' });
    await ff(60);
    await p.waitForTimeout(500);
    await p.screenshot({ path: OUT + '/06-police.png' });
    const st = await p.evaluate(() => { const w = HM.Game.world; return { t: w.t | 0, H: w.H.toFixed(1), jam: w.traffic.jamKm.toFixed(2), money: w.money.protest | 0, squads: w.squads.map(s => s.side[0] + s.type[0] + s.members.length).join(' '), fps: HM.Game.fps }; });
    console.log('state', JSON.stringify(st));
  }
  if (scenario === 'closeup') {
    await p.click('#btnStart');
    await p.waitForTimeout(1000);
    await p.evaluate(() => { const w = HM.Game.world; w.ai.protest = new HM.ProtestAI(w, 'bot'); });
    await ff(75);
    await p.evaluate(() => { const c = HM.Game.stage.cam; c.tx = -2; c.tz = 1; c.dist = 30; c.pitch = 0.72; c.yaw = 0.5; document.getElementById('hud').style.display = 'none'; });
    await p.waitForTimeout(800);
    await p.screenshot({ path: OUT + '/close-1.png' });
    await ff(70);
    await p.evaluate(() => { const w = HM.Game.world; const h = w.squads.find(s => s.type === 'horses' || s.type === 'cannon') || w.squads.find(s => s.side === 'police'); const c = HM.Units.centroid(h); const cam = HM.Game.stage.cam; cam.tx = c.x; cam.tz = c.z; cam.dist = 34; });
    await p.waitForTimeout(800);
    await p.screenshot({ path: OUT + '/close-2.png' });
    await ff(120);
    await p.evaluate(() => { const w = HM.Game.world; const h = w.squads.find(s => s.type === 'cannon') || w.squads.find(s => s.side === 'police'); const c = HM.Units.centroid(h); const cam = HM.Game.stage.cam; cam.tx = c.x; cam.tz = c.z; cam.dist = 40; cam.yaw = -0.6; });
    await p.waitForTimeout(800);
    await p.screenshot({ path: OUT + '/close-3.png' });
  }
  if (scenario === 'police') {
    await p.click('#sideSeg .segBtn[data-side="police"]');
    await p.click('#btnStart');
    await p.waitForTimeout(1000);
    await p.evaluate(() => { const w = HM.Game.world; w.ai.police = new HM.PoliceAI(w, 'human'); });
    let k = 0;
    for (;;) {
      await ff(45);
      await p.waitForTimeout(400);
      await p.screenshot({ path: OUT + `/police-${String(k++).padStart(2, '0')}.png` });
      const st = await p.evaluate(() => { const w = HM.Game.world; return { t: w.t | 0, H: w.H.toFixed(1), jam: w.traffic.jamKm.toFixed(2), out: w.outcome, prot: w.protestersOnStreet(), left: w.ai.protest.cfg.turnout - w.ai.protest.bought }; });
      console.log(JSON.stringify(st));
      if (st.out || k > 14) break;
    }
    await p.waitForTimeout(2500);
    await p.screenshot({ path: OUT + '/police-end.png' });
  }
  if (scenario === 'full' || scenario === 'idle') {
    await p.click('#btnStart');
    await p.waitForTimeout(1200);
    if (scenario === 'full') await p.evaluate(() => { const w = HM.Game.world; w.ai.protest = new HM.ProtestAI(w, 'bot'); });
    let k = 0;
    for (;;) {
      await ff(scenario === 'full' ? 45 : 120);
      await p.waitForTimeout(400);
      await p.screenshot({ path: OUT + `/${scenario}-${String(k++).padStart(2, '0')}.png` });
      const st = await p.evaluate(() => { const w = HM.Game.world; return { t: w.t | 0, H: w.H.toFixed(1), jam: w.traffic.jamKm.toFixed(2), out: w.outcome, mode: HM.Game.mode }; });
      console.log(JSON.stringify(st));
      if (st.out || k > 14) break;
    }
    await p.waitForTimeout(2500);
    await p.screenshot({ path: OUT + `/${scenario}-end.png` });
    const vis = await p.evaluate(() => !document.getElementById('end').classList.contains('hidden'));
    console.log('end screen visible:', vis);
    await p.click('#btnAgain');
    await p.waitForTimeout(1500);
    const mode = await p.evaluate(() => ({ mode: HM.Game.mode, t: HM.Game.world.t | 0 }));
    console.log('after again:', JSON.stringify(mode));
    await p.keyboard.press('Escape');
    await p.waitForTimeout(500);
    await p.screenshot({ path: OUT + `/${scenario}-pause.png` });
    await p.click('#btnQuit');
    await p.waitForTimeout(1200);
    console.log('after quit:', await p.evaluate(() => HM.Game.mode));
  }
  console.log('errors:', errs.length ? errs.join('\n') : 'none');
  console.log('network:', reqs.length ? reqs.join(', ') : 'none');
  await b.close();
})();
