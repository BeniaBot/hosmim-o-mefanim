// בדיקת קוף: לחיצות ומקשים אקראיים בכל המפות ובשני הצדדים, מחפשים שגיאות.
// node v2/tools/monkey.js [rounds]
const path = require('path');
let pw; try { pw = require('playwright'); } catch (e) { pw = require('/opt/node22/lib/node_modules/playwright'); }
const rounds = +(process.argv[2] || 6);
const URL = 'file://' + path.resolve(__dirname, '..', 'index.html') + '?unlock=1&seed=';
(async () => {
  const b = await pw.chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const errs = [];
  let seed = 1;
  for (let r = 0; r < rounds; r++) {
    const side = r % 2 ? 'police' : 'protest', map = ['barilan', 'kvish4', 'gesher'][r % 3];
    const p = await b.newPage({ viewport: { width: 1280, height: 760 } });
    p.on('pageerror', e => errs.push(`[${side}/${map}] ${e.message}\n${(e.stack || '').split('\n').slice(1, 3).join('\n')}`));
    await p.goto(URL + (seed++));
    await p.waitForTimeout(2200);
    await p.click(`#sideSeg .segBtn[data-side="${side}"]`);
    await p.click(`#mapSeg .segBtn[data-map="${map}"]`);
    await p.click('#btnStart');
    await p.waitForTimeout(600);
    let rnd = r * 7919 + 1;
    const R = () => { rnd = (rnd * 16807) % 2147483647; return rnd / 2147483647; };
    const keys = ['KeyZ', 'KeyX', 'KeyC', 'KeyB', 'KeyN', 'KeyV', 'KeyS', 'KeyF', 'KeyR', 'KeyG', 'Digit1', 'Digit2', 'Digit3', 'Digit4', 'Tab', 'Escape', 'KeyQ', 'KeyE', 'Equal', 'Minus'];
    for (let i = 0; i < 260; i++) {
      const x = 20 + R() * 1240, y = 20 + R() * 720, k = R();
      if (k < 0.45) await p.mouse.click(x, y);
      else if (k < 0.6) await p.mouse.click(x, y, { button: 'right' });
      else if (k < 0.7) { await p.mouse.move(x, y); await p.mouse.down(); await p.mouse.move(x + 150 * (R() - 0.5), y + 150 * (R() - 0.5), { steps: 3 }); await p.mouse.up(); }
      else if (k < 0.95) await p.keyboard.press(keys[Math.floor(R() * keys.length)]);
      else await p.mouse.wheel(0, R() < 0.5 ? 200 : -200);
      if (i % 20 === 0) {
        // מקדמים זמן משחק
        await p.evaluate(() => { const G = HM.Game, w = G.world; if (G.mode === 'paused') G.togglePause(); for (let j = 0; j < 30 * 8 && !w.outcome; j++) { w.step(); G.hud.handleEvents(w.events.drain()); } });
        const st = await p.evaluate(() => ({ mode: HM.Game.mode, out: !!HM.Game.world.outcome }));
        if (st.mode === 'end' || st.out) break;
        if (st.mode === 'menu') { await p.click('#btnStart'); await p.waitForTimeout(300); }
      }
    }
    const fin = await p.evaluate(() => { const w = HM.Game.world; return { t: w.t | 0, H: w.H | 0, mode: HM.Game.mode, squads: w.squads.length, people: w.people.length }; });
    console.log(`round ${r} ${side}/${map}:`, JSON.stringify(fin));
    await p.close();
  }
  console.log(errs.length ? 'ERRORS:\n' + errs.join('\n\n') : 'no errors');
  await b.close();
  process.exit(errs.length ? 1 : 0);
})();
