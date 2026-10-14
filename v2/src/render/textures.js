/* מרקמים שמצוירים בקוד (Canvas) — אין קבצי תמונה חיצוניים. */
(function (root) {
  'use strict';
  const HM = root.HM || (root.HM = {});
  const T = root.THREE;

  function canvas(w, h) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    return c;
  }
  function tex(c, repeat) {
    const t = new T.CanvasTexture(c);
    t.encoding = T.sRGBEncoding;
    t.anisotropy = 4;
    if (repeat) { t.wrapS = t.wrapT = T.RepeatWrapping; }
    return t;
  }
  // רעש עדין לאבן
  function stoneNoise(g, w, h, base, seed) {
    g.fillStyle = base; g.fillRect(0, 0, w, h);
    let s = seed || 7;
    const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
    for (let i = 0; i < w * h / 30; i++) {
      const v = rnd() * 0.08;
      g.fillStyle = rnd() > 0.5 ? `rgba(255,255,255,${v})` : `rgba(80,60,40,${v})`;
      g.fillRect(rnd() * w, rnd() * h, 2 + rnd() * 3, 2 + rnd() * 2);
    }
    // שורות אבן
    g.strokeStyle = 'rgba(120,100,80,0.18)'; g.lineWidth = 1;
    for (let y = 0; y < h; y += h / 6) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }
  }

  // חזית מגורים: מקטע אחד = 4 מ' רוחב × 3 מ' גובה (קומה)
  function facade(kind) {
    const w = 256, h = 192, c = canvas(w, h), g = c.getContext('2d');
    const base = kind === 'police' ? '#e8e3d8' : kind === 'yeshiva' ? '#e3d3b4' : kind === 'apt1' ? '#ead6b2' : kind === 'apt2' ? '#ddd7cc' : '#e6dac3';
    stoneNoise(g, w, h, base, kind === 'yeshiva' ? 11 : 7);
    if (kind === 'yeshiva') {
      // חלון קשתי
      g.fillStyle = '#c9b48f'; g.fillRect(76, 34, 104, 130);
      g.fillStyle = '#34465a';
      g.beginPath(); g.moveTo(86, 160); g.lineTo(86, 80); g.arc(128, 80, 42, Math.PI, 0); g.lineTo(170, 160); g.closePath(); g.fill();
      g.strokeStyle = '#d8c7a5'; g.lineWidth = 5;
      g.beginPath(); g.moveTo(128, 40); g.lineTo(128, 160); g.moveTo(86, 110); g.lineTo(170, 110); g.stroke();
    } else {
      // חלון מלבני עם מסגרת, אדן ותריס
      g.fillStyle = '#cdbf9f'; g.fillRect(64, 44, 128, 104);
      const grd = g.createLinearGradient(0, 52, 0, 140);
      grd.addColorStop(0, '#4d6178'); grd.addColorStop(1, '#2c3a4a');
      g.fillStyle = grd; g.fillRect(72, 52, 112, 88);
      g.fillStyle = 'rgba(255,255,255,0.18)'; g.fillRect(76, 56, 30, 80);
      g.fillStyle = '#d8cfba'; g.fillRect(126, 52, 4, 88);
      g.fillStyle = '#b7a888'; g.fillRect(58, 148, 140, 8);
      if (kind === 'apt1') {
        // תריסים ירוקים בצדדים
        g.fillStyle = '#5f7f5a';
        g.fillRect(48, 52, 22, 88); g.fillRect(186, 52, 22, 88);
        g.strokeStyle = 'rgba(0,0,0,0.18)';
        for (let y = 56; y < 140; y += 6) { g.beginPath(); g.moveTo(48, y); g.lineTo(70, y); g.moveTo(186, y); g.lineTo(208, y); g.stroke(); }
      } else if (kind === 'apt2') {
        // מרפסת עם מעקה
        g.fillStyle = '#c9c2b4'; g.fillRect(52, 132, 152, 10);
        g.strokeStyle = '#7d7a73'; g.lineWidth = 3;
        g.beginPath(); g.moveTo(54, 112); g.lineTo(202, 112); g.stroke();
        g.lineWidth = 2;
        for (let x = 58; x < 202; x += 12) { g.beginPath(); g.moveTo(x, 112); g.lineTo(x, 132); g.stroke(); }
      } else {
        // תריס גלילה חלקי
        g.fillStyle = '#ddd5c2'; g.fillRect(72, 52, 112, 18);
        g.strokeStyle = 'rgba(0,0,0,0.12)';
        for (let y = 54; y < 70; y += 4) { g.beginPath(); g.moveTo(72, y); g.lineTo(184, y); g.stroke(); }
      }
    }
    return tex(c, true);
  }
  // אותו מקטע אבל עם חלון מואר (לשקיעה) — רק החלון, השאר שחור, משמש כ-emissiveMap
  function facadeGlow() {
    const w = 256, h = 192, c = canvas(w, h), g = c.getContext('2d');
    g.fillStyle = '#000'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#ffcf87'; g.fillRect(72, 70, 112, 70);
    return tex(c, true);
  }
  // קומת קרקע של חנות
  function shopfront() {
    const w = 256, h = 192, c = canvas(w, h), g = c.getContext('2d');
    stoneNoise(g, w, h, '#e3d6bd', 3);
    g.fillStyle = '#3f4d5c'; g.fillRect(20, 40, 216, 140);
    g.fillStyle = 'rgba(255,255,255,0.15)'; g.fillRect(28, 48, 60, 124);
    g.fillStyle = '#9aa3ad'; g.fillRect(126, 40, 6, 140);
    g.fillStyle = '#6b7178'; g.fillRect(14, 30, 228, 12);
    return tex(c, true);
  }

  // שלט עם טקסט עברי
  function sign(text, opts) {
    opts = opts || {};
    const w = 1024, h = 192, c = canvas(w, h), g = c.getContext('2d');
    g.fillStyle = opts.bg || '#1f3a6e';
    g.fillRect(0, 0, w, h);
    g.strokeStyle = opts.border || 'rgba(255,255,255,0.85)'; g.lineWidth = 10;
    g.strokeRect(12, 12, w - 24, h - 24);
    g.fillStyle = opts.fg || '#ffffff';
    g.direction = 'rtl'; g.textAlign = 'center'; g.textBaseline = 'middle';
    let size = opts.size || 104;
    g.font = `900 ${size}px 'Frank Ruhl Libre', 'Heebo', serif`;
    while (g.measureText(text).width > w - 80 && size > 40) { size -= 6; g.font = `900 ${size}px 'Frank Ruhl Libre', 'Heebo', serif`; }
    g.fillText(text, w / 2, h / 2 + 6);
    const t = tex(c, false);
    return t;
  }

  // שלט מחאה בכתב יד (קרטון לבן, אותיות שחורות)
  function placard(text) {
    const w = 256, h = 144, c = canvas(w, h), g = c.getContext('2d');
    g.fillStyle = '#f7f4ec'; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#1b1b1b'; g.lineWidth = 6; g.strokeRect(5, 5, w - 10, h - 10);
    g.fillStyle = '#141414';
    g.direction = 'rtl'; g.textAlign = 'center'; g.textBaseline = 'middle';
    let size = 54;
    g.font = `900 ${size}px 'Frank Ruhl Libre', 'Heebo', serif`;
    while (g.measureText(text).width > w - 30 && size > 24) { size -= 4; g.font = `900 ${size}px 'Frank Ruhl Libre', 'Heebo', serif`; }
    g.fillText(text, w / 2, h / 2 + 4);
    return tex(c, false);
  }

  // אספלט עם גרעיניות קלה
  function asphalt() {
    const w = 256, h = 256, c = canvas(w, h), g = c.getContext('2d');
    g.fillStyle = '#4b4f56'; g.fillRect(0, 0, w, h);
    let s = 3;
    const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
    for (let i = 0; i < 2600; i++) {
      const v = rnd() * 0.1;
      g.fillStyle = rnd() > 0.5 ? `rgba(255,255,255,${v})` : `rgba(0,0,0,${v})`;
      g.fillRect(rnd() * w, rnd() * h, 1 + rnd() * 2, 1 + rnd() * 2);
    }
    return tex(c, true);
  }
  // מרצפות מדרכה
  function pavers(color, line) {
    const w = 128, h = 128, c = canvas(w, h), g = c.getContext('2d');
    g.fillStyle = color; g.fillRect(0, 0, w, h);
    g.strokeStyle = line; g.lineWidth = 2;
    for (let y = 0; y <= h; y += 32) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }
    for (let y = 0; y < h; y += 32) for (let x = (y / 32) % 2 ? 0 : 32; x <= w; x += 64) { g.beginPath(); g.moveTo(x, y); g.lineTo(x, y + 32); g.stroke(); }
    return tex(c, true);
  }
  // שפת מדרכה צבועה אדום-לבן (כמו בכבישים בישראל)
  function curb() {
    const w = 128, h = 16, c = canvas(w, h), g = c.getContext('2d');
    g.fillStyle = '#efefea'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#c8433a'; g.fillRect(0, 0, w / 2, h);
    return tex(c, true);
  }

  HM.Tex = { facade, facadeGlow, shopfront, sign, placard, asphalt, pavers, curb };
})(typeof window !== 'undefined' ? window : globalThis);
