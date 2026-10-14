/* חוסמים או מפנים — עזרים בסיסיים.
   כל קובץ נטען כסקריפט רגיל (בלי מודולים — כדי שיעבוד גם מ-file://)
   ונרשם על האובייקט הגלובלי HM. ב-Node אותו קובץ נטען עם require. */
(function (root) {
  'use strict';
  const HM = root.HM || (root.HM = {});

  // מחולל אקראי עם זרע — הסימולציה דטרמיניסטית לגמרי (חשוב לבדיקות)
  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  class Rng {
    constructor(seed) { this.next = mulberry32(seed || 1); }
    f(a = 0, b = 1) { return a + (b - a) * this.next(); }
    i(a, b) { return a + Math.floor(this.next() * (b - a + 1)); }
    pick(arr) { return arr[Math.floor(this.next() * arr.length)]; }
    chance(p) { return this.next() < p; }
  }

  const U = {
    clamp(v, a, b) { return v < a ? a : v > b ? b : v; },
    lerp(a, b, t) { return a + (b - a) * t; },
    dist(ax, az, bx, bz) { const dx = ax - bx, dz = az - bz; return Math.sqrt(dx * dx + dz * dz); },
    dist2(ax, az, bx, bz) { const dx = ax - bx, dz = az - bz; return dx * dx + dz * dz; },
    wrapAngle(a) { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; },
    // סיבוב הדרגתי של זווית לכיוון יעד
    turnToward(cur, target, maxStep) {
      const d = U.wrapAngle(target - cur);
      if (Math.abs(d) <= maxStep) return target;
      return cur + Math.sign(d) * maxStep;
    },
    approach(cur, target, step) {
      if (cur < target) return Math.min(target, cur + step);
      return Math.max(target, cur - step);
    },
    fmtTime(sec) {
      sec = Math.max(0, Math.ceil(sec));
      const m = Math.floor(sec / 60), s = sec % 60;
      return m + ':' + (s < 10 ? '0' : '') + s;
    },
    fmtNum(n) { return Math.round(n).toLocaleString('he-IL'); },
    smoothstep(e0, e1, x) { const t = U.clamp((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); }
  };

  // אוסף בסיסי של אירועים — הסימולציה דוחפת, הממשק והסאונד שואבים
  class EventQueue {
    constructor() { this.list = []; }
    push(type, data) { const e = Object.assign({}, data || {}, { type }); this.list.push(e); return e; }
    drain() { const l = this.list; this.list = []; return l; }
  }

  HM.U = U;
  HM.Rng = Rng;
  HM.EventQueue = EventQueue;
  if (typeof module !== 'undefined' && module.exports) module.exports = HM;
})(typeof window !== 'undefined' ? window : globalThis);
