// עטיפת דסקטופ (Electron) ל"חוסמים או מפנים": חלון אחד, בלי תפריט, F11 למסך מלא.
const { app, BrowserWindow, Menu, shell } = require('electron');
const path = require('path');
const fs = require('fs');

// צלילים מתחילים מיד, בלי לחכות ללחיצה
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

// עותק אחד בלבד (שני עותקים היו מתחרים על אותו אחסון התקדמות)
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    const w = BrowserWindow.getAllWindows()[0];
    if (w) { if (w.isMinimized()) w.restore(); w.focus(); }
  });
}

// זוכרים גודל ומיקום חלון בין הפעלות
const stateFile = () => path.join(app.getPath('userData'), 'window.json');
function loadState() { try { return JSON.parse(fs.readFileSync(stateFile(), 'utf8')); } catch (e) { return null; } }
function saveState(win) {
  try {
    const b = win.getNormalBounds();
    fs.writeFileSync(stateFile(), JSON.stringify({ x: b.x, y: b.y, w: b.width, h: b.height, max: win.isMaximized(), full: win.isFullScreen() }));
  } catch (e) { /* לא קריטי */ }
}

function createWindow() {
  const st = loadState();
  const win = new BrowserWindow({
    width: st ? st.w : 1366,
    height: st ? st.h : 800,
    ...(st && Number.isFinite(st.x) ? { x: st.x, y: st.y } : {}),
    minWidth: 960,
    minHeight: 600,
    title: 'חוסמים או מפנים',
    icon: path.join(__dirname, 'app', 'icon-512.png'),
    backgroundColor: '#26232c',
    autoHideMenuBar: true,
    webPreferences: { contextIsolation: true, sandbox: true, backgroundThrottling: false }
  });
  Menu.setApplicationMenu(null);
  // קישורים חיצוניים — לא נפתחים בתוך המשחק
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('before-input-event', (e, input) => {
    if (input.type === 'keyDown' && input.key === 'F11') { win.setFullScreen(!win.isFullScreen()); e.preventDefault(); }
  });
  // backgroundThrottling:false מבטל גם את "הדף מוסתר" של הדפדפן — אז מודיעים למשחק בעצמנו על מזעור
  const tell = (ev) => win.webContents.executeJavaScript(`window.dispatchEvent(new Event('${ev}')); 0`).catch(() => {});
  win.on('minimize', () => tell('hm-hidden'));
  win.on('restore', () => tell('hm-shown'));
  win.on('close', () => saveState(win));
  win.loadFile(path.join(__dirname, 'app', 'index.html'));
  if (!st || st.max) win.maximize();
  if (st && st.full) win.setFullScreen(true);
}

app.whenReady().then(createWindow);
app.on('window-all-closed', () => app.quit());
