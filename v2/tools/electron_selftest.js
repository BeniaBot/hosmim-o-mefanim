// בדיקה עצמית בתוך Electron (העטיפה של ה-EXE), בלינוקס בלי מסך:
//   1) בתיקייה זמנית: npm install electron@43 ; מעתיקים את קבצי המשחק ל-app/ ואת v2/desktop/main.js
//   2) מעתיקים לשם את הקובץ הזה ומריצים:
//      xvfb-run -a -s "-screen 0 1366x800x24" ./node_modules/electron/dist/electron --no-sandbox \
//        --enable-unsafe-swiftshader --use-angle=swiftshader --ignore-gpu-blocklist electron_selftest.js
//   חשוב: בלי --use-angle=swiftshader הגרפיקה ב-Xvfb נכשלת (גם במשחק הישן) — זו בעיית סביבה, לא באג.
//   התוצאה: elog.txt + electron-menu.png + electron-game.png
// בדיקה עצמית: מריץ את main.js האמיתי ובודק את החלון
const { app, BrowserWindow } = require('electron');
const fs = require('fs');
app.on('browser-window-created', (e, win) => {
  win.webContents.on('console-message', (ev, level, msg) => { if (level >= 2) fs.appendFileSync('elog.txt', 'console: ' + msg + '\n'); });
  win.webContents.once('did-finish-load', async () => {
    try {
      await new Promise(r => setTimeout(r, 4000));
      const r1 = await win.webContents.executeJavaScript(`({ mode: HM.Game.mode, title: document.title, three: THREE.REVISION, menu: !document.getElementById('menu').classList.contains('hidden'), ls: (()=>{try{localStorage.setItem('x','1');return localStorage.getItem('x')==='1'}catch(e){return 'ERR '+e.message}})() })`);
      fs.appendFileSync('elog.txt', 'menu: ' + JSON.stringify(r1) + '\n');
      const img = await win.webContents.capturePage();
      fs.writeFileSync('electron-menu.png', img.toPNG());
      const r2 = await win.webContents.executeJavaScript(`(() => { document.getElementById('btnStart').click(); const G = HM.Game, w = G.world; w.ai.protest = new HM.ProtestAI(w, 'bot'); for (let i = 0; i < 30 * 90; i++) { w.step(); G.hud.handleEvents(w.events.drain()); } return { mode: G.mode, t: w.t | 0, H: w.H.toFixed(1), people: w.people.length, cars: w.traffic.cars.length }; })()`);
      fs.appendFileSync('elog.txt', 'game: ' + JSON.stringify(r2) + '\n');
      await new Promise(r => setTimeout(r, 1500));
      const img2 = await win.webContents.capturePage();
      fs.writeFileSync('electron-game.png', img2.toPNG());
    } catch (err) { fs.appendFileSync('elog.txt', 'ERROR ' + err.message + '\n'); }
    app.quit();
  });
});
require('./main.js');
