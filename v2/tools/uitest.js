// בדיקת ממשק: לוחצים באמת על כל כפתור ובודקים שקרה מה שכתוב עליו.
// node v2/tools/uitest.js [outdir]
const path = require('path');
let pw; try { pw = require('playwright'); } catch (e) { pw = require('/opt/node22/lib/node_modules/playwright'); }
const OUT = process.argv[2] || '.';
const URL = 'file://' + path.resolve(__dirname, '..', 'index.html') + '?seed=4242';
const URL_UNLOCK = URL + '&unlock=1';
const results = [];
function check(name, ok, info) { results.push({ name, ok: !!ok, info }); console.log((ok ? 'PASS ' : 'FAIL ') + name + (info !== undefined ? '  ' + JSON.stringify(info) : '')); }

(async () => {
  const b = await pw.chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
  const p = await b.newPage({ viewport: { width: 1366, height: 768 } });
  const errs = [];
  p.on('pageerror', e => errs.push('PAGEERR ' + e.message));
  p.on('console', m => { if (m.type() === 'error') errs.push('CONSOLE ' + m.text()); });
  await p.goto(URL);
  await p.waitForTimeout(3000);
  const ev = (f, a) => p.evaluate(f, a);
  const ff = (sec) => ev((sec) => { const G = HM.Game, w = G.world; const n = Math.round(sec / w.BAL.dt); for (let i = 0; i < n && !w.outcome; i++) { w.step(); G.hud.handleEvents(w.events.drain()); } G.hud.update(0.2); G.hud.updateSelection(true); }, sec);
  const visible = (id) => ev((id) => { const e = document.getElementById(id); return !!e && !e.classList.contains('hidden') && getComputedStyle(e).display !== 'none'; }, id);

  // ---- תפריט ----
  check('menu visible', await visible('menu'));
  await p.click('#diffSeg .segBtn[data-diff="hard"]');
  check('difficulty selection updates summary', (await p.textContent('#startSum')).includes('קשה'));
  await p.click('#diffSeg .segBtn[data-diff="normal"]');
  await p.click('#btnHow');
  check('how-to opens', await visible('howto'));
  await p.click('#btnHowBack');
  check('how-to back returns to menu', await visible('menu'));
  await p.click('#btnSettings');
  check('settings opens', await visible('settings'));
  await p.fill('#volSlider', '40');
  await p.dispatchEvent('#volSlider', 'input');
  check('volume slider sets volume', await ev(() => Math.abs(HM.Audio.vol - 0.4) < 0.01));
  await p.click('#musicOn');
  check('music checkbox turns music off', await ev(() => HM.Audio.musicOn === false && localStorage.getItem('hm2-music') === 'false'));
  await p.click('#musicOn');
  check('music checkbox turns music back on', await ev(() => HM.Audio.musicOn === true && !!HM.Audio.mus));
  await p.click('#btnSetBack');
  check('settings back', await visible('menu'));

  // ---- מקלדת בתפריט ----
  await p.keyboard.press('ArrowDown'); await p.keyboard.press('ArrowDown');
  check('arrow keys move the menu row focus', await ev(() => document.getElementById('diffSeg').classList.contains('kbd')));
  await p.keyboard.press('ArrowLeft');
  check('arrow left changes the difficulty', (await p.textContent('#startSum')).includes('קשה'), await p.textContent('#startSum'));
  await p.keyboard.press('ArrowRight');
  check('arrow right changes it back', (await p.textContent('#startSum')).includes('רגיל'), await p.textContent('#startSum'));
  await p.keyboard.press('KeyH');
  check('H opens how-to from the menu', await visible('howto'));
  await p.keyboard.press('Escape');
  check('Esc closes how-to', await visible('menu'));

  // ---- התחלה (Enter) ----
  await p.keyboard.press('Enter');
  await p.waitForTimeout(800);
  check('start shows HUD', await visible('hud'));
  check('game mode is play', (await ev(() => HM.Game.mode)) === 'play');
  check('difficulty passed to world', (await ev(() => HM.Game.world.difficulty)) === 'normal');
  const n0 = await ev(() => HM.Game.world.squads.filter(s => s.side === 'protest').length);
  check('starts with 4 protest squads', n0 === 4, n0);

  // ---- קנייה בכרטיס ----
  const money0 = await ev(() => HM.Game.world.money.protest);
  await p.click('#buyCards .card:nth-child(1)');
  const n1 = await ev(() => HM.Game.world.squads.filter(s => s.side === 'protest').length);
  const money1 = await ev(() => HM.Game.world.money.protest);
  check('buy card "bochurim" adds a squad and costs money', n1 === n0 + 1 && money0 - money1 > 100, { n1, spent: money0 - money1 });
  await p.keyboard.press('KeyX');
  const n2 = await ev(() => HM.Game.world.squads.filter(s => s.side === 'protest').length);
  check('hotkey X buys avrechim (if affordable)', n2 === n1 + 1 || (await ev(() => HM.Game.world.money.protest)) < 150, n2);

  // ---- בחירה בלחיצה על שלט ----
  await ff(3);
  await p.waitForTimeout(300);
  const badge = await p.$('.badge.prot');
  const bb = await badge.boundingBox();
  await p.mouse.click(bb.x + bb.width / 2, bb.y + bb.height / 2);
  await p.waitForTimeout(200);
  check('click on badge selects squad', (await ev(() => HM.Game.input.selected.size)) === 1);
  check('selection panel shows the squad', await visible('selBody'));
  check('selected squad shows a flavor line', (await p.textContent('#selFlavor')).length > 5, await p.textContent('#selFlavor'));
  check('news ticker shows the opening headline', (await p.textContent('#tickText')).length > 5 || (await ev(() => HM.Game.hud.tick.q.length)) > 0);

  // ---- שליחה לכביש ----
  const road = await ev(() => HM.Game.hud.project(-30, 0, 2.5));
  await p.mouse.move(road.x, road.y);
  await p.waitForTimeout(300);
  check('hover shows lane-block hint', (await p.textContent('#hint')).length > 0, await p.textContent('#hint'));
  await p.mouse.click(road.x, road.y);
  const goal = await ev(() => { const s = HM.Game.world.squadById([...HM.Game.input.selected][0]); return s.goal; });
  check('click on road sends squad there', Math.abs(goal.x + 30) < 2 && Math.abs(goal.z - 2.5) < 4, goal);
  // לחיצה קרובה לחוליות שלכם (כשיש בחירה) היא פקודה, לא בחירה מחדש
  const near = await ev(() => { const G = HM.Game, w = G.world; const s = w.squadById([...G.input.selected][0]); const other = w.squads.find(q => q.side === 'protest' && q !== s && q.members.length); const c = HM.Units.centroid(other); const t = { x: c.x + 4.5, z: c.z }; const sp = G.hud.project(t.x, 0, t.z); return { id: s.id, t, sx: sp.x, sy: sp.y }; });
  await p.mouse.click(near.sx, near.sy);
  const goal2 = await ev((id) => HM.Game.world.squadById(id).goal, near.id);
  check('click next to another own squad still moves the selection', (await ev(() => [...HM.Game.input.selected].length)) === 1 && Math.hypot(goal2.x - near.t.x, goal2.z - near.t.z) < 3, { goal2, want: near.t });
  await ff(15);

  // ---- לשבת ----
  await p.click('#selActions .act');
  await ff(4);
  const st = await ev(() => { const s = HM.Game.world.squadById([...HM.Game.input.selected][0]); return { stance: s.stance, sit: s.members.map(m => m.sit.toFixed(1)).join() }; });
  check('"sit" button makes squad sit', st.stance === 'sit', st);
  await p.keyboard.press('KeyS');
  await ff(3);
  const st2 = await ev(() => HM.Game.world.squadById([...HM.Game.input.selected][0]).stance);
  check('S key toggles back to standing', st2 === 'stand', st2);

  // ---- גרירת מלבן ----
  await p.keyboard.press('Escape');
  check('Esc clears selection (not pause)', (await ev(() => HM.Game.input.selected.size)) === 0 && (await ev(() => HM.Game.mode)) === 'play');
  await p.keyboard.press('KeyH');
  check('H in game pauses and opens how-to', await visible('howto') && (await ev(() => HM.Game.mode)) === 'paused');
  await p.keyboard.press('Escape');
  check('Esc from in-game how-to returns to the pause screen', await visible('pause'));
  await p.keyboard.press('Escape');
  check('Esc on the pause screen resumes', (await ev(() => HM.Game.mode)) === 'play');
  await p.keyboard.press('KeyT');
  check('T toggles double speed', (await ev(() => HM.Game.speed)) === 2);
  await p.keyboard.press('KeyT');
  // הרשימה (כשאין בחירה) מתעדכנת כשנוספת חוליה
  const newNum = await ev(() => { const w = HM.Game.world; w.money.protest += 500; const before = new Set(w.squads.map(s => s.id)); w.cmd('protest', { type: 'buy', unit: 'bochurim' }); const s = w.squads.find(q => !before.has(q.id)); return s ? s.num : null; });
  await p.waitForFunction((n) => [...document.querySelectorAll('#selEmpty .rosterChip .num')].some(e => +e.textContent === n), newNum, { timeout: 4000 }).catch(() => {});
  const nums = await p.$$eval('#selEmpty .rosterChip .num', els => els.map(e => +e.textContent));
  check('roster updates while nothing is selected', newNum !== null && nums.includes(newNum), { newNum, nums });
  await p.mouse.move(5, 300); await p.mouse.down(); await p.mouse.move(1360, 560, { steps: 5 }); await p.mouse.up();
  const boxSel = await ev(() => HM.Game.input.selected.size);
  check('drag box selects several squads', boxSel >= 2, boxSel);

  // ---- מקשי מספר ----
  await p.keyboard.press('Digit2');
  const sel2 = await ev(() => { const id = [...HM.Game.input.selected][0]; return HM.Game.world.squadById(id).num; });
  check('digit 2 selects squad #2', sel2 === 2, sel2);

  // ---- עסקן ----
  await ev(() => { const w = HM.Game.world; const a = w.squads.find(s => s.type === 'askan'); const pol = HM.Units.makeSquad(w, 'police', 'patrol', HM.Units.centroid(a).x + 3, HM.Units.centroid(a).z + 3); HM.Units.setGoal(w, pol, pol.members[0].x, pol.members[0].z); });
  await ff(0.5);
  await p.keyboard.press('KeyF');
  await ff(0.2);
  check('F: askan permit stalls nearby police', await ev(() => HM.Game.world.people.some(c => c.kind === 'cop' && c.state === 'stalled')));

  // ---- שופר ----
  await ff(45);
  const cd0 = await ev(() => HM.Game.world.shofarCD);
  await p.click('#buyCards .card:nth-child(6)');
  const cd1 = await ev(() => HM.Game.world.shofarCD);
  check('shofar card triggers shofar', cd0 === 0 && cd1 > 0, { cd0, cd1 });

  // ---- צלם והסעה ----
  await ev(() => { HM.Game.world.money.protest = 2000; });
  await p.keyboard.press('KeyB');
  check('B buys a photographer', await ev(() => HM.Game.world.squads.some(s => s.type === 'photographer')));
  await p.keyboard.press('KeyN');
  check('N enters bus aim mode', await ev(() => HM.Game.input.aim === 'bus'));
  const side = await ev(() => { const s = HM.Game.hud.project(-40, 0, 12.5); return s; });
  await p.mouse.click(side.x, side.y);
  check('click on sidewalk orders the bus', await ev(() => HM.Game.world.pending.some(q => q.bus)));
  await ff(10);
  check('bus drops 2 squads', await ev(() => HM.Game.world.busProps.length === 1 && HM.Game.world.squads.filter(s => s.side === 'protest').length >= 8));
  await p.screenshot({ path: OUT + '/ui-bus.png' });

  // ---- כפתורי בקרה ----
  await p.click('#btnSpeed');
  check('speed button sets x2', (await ev(() => HM.Game.speed)) === 2 && (await p.textContent('#btnSpeed')) === '×2');
  await p.click('#btnSpeed');
  await p.click('#btnMute');
  check('mute button mutes', await ev(() => HM.Audio.muted === true));
  await p.click('#btnMute');
  await p.click('#btnPause');
  check('pause button pauses', (await ev(() => HM.Game.mode)) === 'paused' && await visible('pause'));
  const t0 = await ev(() => HM.Game.world.t);
  await p.waitForTimeout(600);
  check('time stops while paused', (await ev(() => HM.Game.world.t)) === t0);
  await p.click('#btnResume');
  check('resume button resumes', (await ev(() => HM.Game.mode)) === 'play');
  await p.keyboard.press('Space');
  check('space pauses', (await ev(() => HM.Game.mode)) === 'paused');
  await p.click('#btnRestart');
  await p.waitForTimeout(600);
  check('restart starts a fresh game', (await ev(() => HM.Game.mode)) === 'play' && (await ev(() => HM.Game.world.t)) < 2);
  await p.screenshot({ path: OUT + '/ui-restart.png' });
  await p.keyboard.press('KeyP');
  await p.click('#btnQuit');
  await p.waitForTimeout(600);
  check('quit returns to menu', (await ev(() => HM.Game.mode)) === 'menu' && await visible('menu') && !(await visible('hud')));

  // ---- ניצחון ----
  await p.click('#btnStart');
  await p.waitForTimeout(500);
  await ev(() => { HM.Game.world.addHeadline(100, 'test', 0, 0); });
  await p.waitForFunction(() => !document.getElementById('end').classList.contains('hidden'), null, { timeout: 8000 }).catch(() => {});
  check('reaching 100 shows a win end screen', await visible('end') && (await p.textContent('#endTitle')).includes('בכותרות'), await p.textContent('#endTitle'));
  check('end screen awards a funny title', (await p.textContent('#endBadge')).length > 4, await p.textContent('#endBadge'));
  check('win shows stars', (await ev(() => document.querySelectorAll('#endStars .off').length)) < 3);
  await p.screenshot({ path: OUT + '/ui-win.png' });
  await p.click('#btnEndMenu');
  await p.waitForTimeout(500);
  check('end "to menu" button works', await visible('menu'));
  check('map unlocked by this win is clickable right away', await ev(() => !document.querySelector('#mapSeg [data-map="kvish4"]').disabled));

  // ---- אחרי סוף המשחק: אין הפסקה, ומסך סיום ישן לא קופץ על התפריט ----
  await p.click('#btnStart');
  await p.waitForTimeout(500);
  await ev(() => { HM.Game.world.addHeadline(100, 'test', 0, 0); });
  await p.waitForTimeout(100);
  await p.keyboard.press('Escape');
  check('no pause after the game is decided', !(await visible('pause')));
  await p.waitForFunction(() => !document.getElementById('end').classList.contains('hidden'), null, { timeout: 8000 }).catch(() => {});
  check('end screen still arrives after Esc', await visible('end'));
  await p.keyboard.press('Enter');
  check('Enter on the end screen starts another game', (await ev(() => HM.Game.mode)) === 'play' && !(await visible('end')));
  await p.waitForTimeout(400);
  await ev(() => { HM.Game.world.addHeadline(100, 'test', 0, 0); });
  await p.waitForTimeout(150);
  await ev(() => HM.Game.toMenu());
  await p.waitForTimeout(2000);
  check('stale end screen does not cover the menu', await visible('menu') && !(await visible('end')) && (await ev(() => HM.Game.mode)) === 'menu');

  // ---- התקדמות: מפות נעולות עד ניצחון ----
  check('Route 4 locked before any win', await ev(() => { localStorage.removeItem('hm2-prog'); HM.Game.updateMapButtons(); return document.querySelector('#mapSeg [data-map="kvish4"]').disabled; }));
  await ev(() => { localStorage.setItem('hm2-prog', JSON.stringify({ protest: { barilan: { easy: 2 } } })); HM.Game.updateMapButtons(); });
  check('Route 4 unlocks after a Bar Ilan win', await ev(() => !document.querySelector('#mapSeg [data-map="kvish4"]').disabled && document.querySelector('#mapSeg [data-map="gesher"]').disabled));
  check('stars shown on map button', (await ev(() => { HM.Game.diff = 'easy'; HM.Game.updateMapButtons(); return document.querySelector('#mapSeg [data-map="barilan"] span').textContent; })).includes('★★'));
  await ev(() => { HM.Game.diff = 'normal'; HM.Game.updateMapButtons(); });

  // ================= צד המשטרה =================
  await p.click('#sideSeg .segBtn[data-side="police"]');
  check('police side selectable', (await p.textContent('#startSum')).includes('משטרה'));
  await p.click('#btnStart');
  await p.waitForTimeout(800);
  check('police game starts with 2 patrols', (await ev(() => HM.Game.world.squads.filter(s => s.side === 'police').length)) === 2);
  check('police cards shown (6)', (await ev(() => document.querySelectorAll('#buyCards .card').length)) === 6);
  check('money label is police budget', (await p.textContent('#moneyLbl')).includes('תקציב'));
  await ff(25);
  await p.waitForTimeout(300);
  const pb = await p.$('.badge.pol');
  const pbb = await pb.boundingBox();
  await p.mouse.click(pbb.x + pbb.width / 2, pbb.y + pbb.height / 2);
  await p.waitForTimeout(200);
  check('click on police badge selects police squad', (await ev(() => { const id = [...HM.Game.input.selected][0]; const s = HM.Game.world.squadById(id); return s && s.side; })) === 'police');
  // לוחצים על חוליית מפגינים
  const enemy = await ev(() => { const w = HM.Game.world; const s = w.squads.find(q => q.side === 'protest' && q.members.length); const p0 = s.members[0]; const sp = HM.Game.hud.project(p0.x, 1.1, p0.z); return { id: s.id, x: sp.x, y: sp.y }; });
  await p.mouse.move(enemy.x, enemy.y);
  await p.waitForTimeout(300);
  check('hover over protesters shows police hint', (await p.textContent('#hint')).length > 0, await p.textContent('#hint'));
  await p.mouse.click(enemy.x, enemy.y);
  const tg = await ev(() => { const id = [...HM.Game.input.selected][0]; return HM.Game.world.squadById(id).target; });
  check('click on protesters sets police target', tg === enemy.id, { tg, want: enemy.id });
  await ff(8);
  check('cops go to work (seek/grab/drag, or stopped by an askan permit)', await ev(() => HM.Game.world.people.some(c => c.kind === 'cop' && (c.state === 'seek' || c.state === 'grab' || c.state === 'drag' || (c.state === 'stalled' && c.squad.target)))), await ev(() => HM.Game.world.people.filter(c => c.kind === 'cop').map(c => c.state + (c.squad.target ? '*' : '')).join()));
  await ev(() => { HM.Game.world.money.police = 3000; });
  await p.keyboard.press('KeyX');
  await p.keyboard.press('KeyC');
  await p.keyboard.press('KeyB');
  await p.keyboard.press('KeyN');
  check('hotkeys order horses + cannon + riot + officer (pending)', (await ev(() => HM.Game.world.pending.length)) === 4);
  await ff(9);
  check('horses, cannon, riot and officer arrive', await ev(() => { const w = HM.Game.world; return ['horses', 'cannon', 'riot', 'officer'].every(t => w.squads.some(s => s.type === t)); }));
  // כריזה
  await p.click('#buyCards .card:nth-child(6)');
  check('megaphone card enters aim mode', await ev(() => HM.Game.input.aim === 'megaphone'));
  const spot = await ev(() => HM.Game.hud.project(0, 0, 0));
  await p.mouse.click(spot.x, spot.y);
  check('click places megaphone (cooldown starts)', (await ev(() => HM.Game.world.megaCD)) > 0);
  // מכת"זית — חזרה למילוי
  await ev(() => { const w = HM.Game.world; const c = w.squads.find(s => s.type === 'cannon'); HM.Game.input.selected.clear(); HM.Game.input.selected.add(c.id); c.vehicle.tank = 3; HM.Game.hud.updateSelection(true); });
  await p.keyboard.press('KeyR');
  check('R sends cannon to refill', (await ev(() => HM.Game.world.squads.find(s => s.type === 'cannon').vehicle.state)) === 'return');
  // לרדת למדרכה
  await ev(() => { const w = HM.Game.world; const s = w.squads.find(q => q.type === 'patrol'); HM.Game.input.selected.clear(); HM.Game.input.selected.add(s.id); w.cmd('police', { type: 'move', squads: [s.id], x: 0, z: 0 }); });
  await ff(10);
  await p.keyboard.press('KeyG');
  const g = await ev(() => { const w = HM.Game.world; const s = w.squadById([...HM.Game.input.selected][0]); return { onRoad: w.map.isRoad(s.goal.x, s.goal.z) }; });
  check('G sends squad to the sidewalk', !g.onRoad, g);
  await p.screenshot({ path: OUT + '/ui-police.png' });
  // הפסד משטרה במד 100
  await ev(() => HM.Game.world.addHeadline(100, 'test', 0, 0));
  await p.waitForTimeout(2500);
  check('police loss end screen', await visible('end') && (await p.textContent('#endTitle')).includes('השר'), await p.textContent('#endTitle'));
  await p.screenshot({ path: OUT + '/ui-police-end.png' });

  console.log('\nerrors:', errs.length ? errs.join('\n') : 'none');
  const fails = results.filter(r => !r.ok).length;
  console.log(`\n${results.length - fails}/${results.length} passed`);
  await b.close();
  process.exit(fails || errs.length ? 1 : 0);
})();
