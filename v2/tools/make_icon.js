// יוצר את אייקון המשחק (מקורי) כקבצי PNG: node v2/tools/make_icon.js
const path = require('path'), fs = require('fs');
let pw; try { pw = require('playwright'); } catch (e) { pw = require('/opt/node22/lib/node_modules/playwright'); }
(async () => {
  const b = await pw.chromium.launch();
  const p = await b.newPage();
  await p.setContent('<canvas id="c" width="512" height="512"></canvas>');
  const draw = (size) => p.evaluate((size) => {
    const c = document.getElementById('c'); c.width = c.height = size;
    const g = c.getContext('2d'), s = size / 512;
    g.scale(s, s);
    // רקע: שמיים של שקיעה בפינות מעוגלות
    const r = 96;
    g.beginPath(); g.moveTo(r, 0); g.arcTo(512, 0, 512, 512, r); g.arcTo(512, 512, 0, 512, r); g.arcTo(0, 512, 0, 0, r); g.arcTo(0, 0, 512, 0, r); g.closePath();
    const sky = g.createLinearGradient(0, 0, 0, 512);
    sky.addColorStop(0, '#f6c27a'); sky.addColorStop(0.55, '#e7804f'); sky.addColorStop(1, '#7c3427');
    g.fillStyle = sky; g.fill();
    g.save(); g.clip();
    // שמש
    g.fillStyle = '#ffe2a0'; g.beginPath(); g.arc(256, 300, 92, 0, Math.PI * 2); g.fill();
    // כביש בפרספקטיבה
    g.fillStyle = '#2d2f35';
    g.beginPath(); g.moveTo(0, 512); g.lineTo(512, 512); g.lineTo(300, 330); g.lineTo(212, 330); g.closePath(); g.fill();
    g.fillStyle = '#f2f2ee';
    for (let i = 0; i < 4; i++) { const t0 = 0.12 + i * 0.22, t1 = t0 + 0.1; const y0 = 330 + 182 * t0, y1 = 330 + 182 * t1; g.beginPath(); g.moveTo(256 - 3 - 7 * t0, y0); g.lineTo(256 + 3 + 7 * t0, y0); g.lineTo(256 + 4 + 9 * t1, y1); g.lineTo(256 - 4 - 9 * t1, y1); g.fill(); }
    // מכוניות קטנות עומדות
    g.fillStyle = '#c84a3a'; g.fillRect(150, 440, 70, 36); g.fillStyle = '#3a6fb0'; g.fillRect(300, 455, 74, 36);
    g.fillStyle = '#1b1b1f'; g.fillRect(156, 446, 58, 14); g.fillRect(306, 461, 62, 14);
    g.restore();
    // כובע שחור גדול מעל
    g.fillStyle = '#121214';
    g.beginPath(); g.ellipse(256, 238, 190, 40, 0, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.moveTo(150, 236); g.quadraticCurveTo(150, 92, 256, 88); g.quadraticCurveTo(362, 92, 362, 236); g.closePath(); g.fill();
    g.fillStyle = '#2c2c30'; g.fillRect(150, 196, 212, 30);
    // גומה בכובע
    g.strokeStyle = '#2a2a2e'; g.lineWidth = 8; g.beginPath(); g.moveTo(212, 118); g.quadraticCurveTo(256, 140, 300, 118); g.stroke();
    return c.toDataURL('image/png');
  }, size);
  for (const size of [512, 256, 64]) {
    const url = await draw(size);
    fs.writeFileSync(path.join(__dirname, '..', size === 64 ? 'favicon.png' : `icon-${size}.png`), Buffer.from(url.split(',')[1], 'base64'));
  }
  await b.close();
  console.log('icons written');
})();
