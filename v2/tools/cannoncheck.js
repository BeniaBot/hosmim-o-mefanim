// מדידה: כמה זמן המכת"זית עולה על שפת מדרכה / חופפת מכונית. node v2/tools/cannoncheck.js [games]
const HM = require('../tests/load.js');
const n = +(process.argv[2] || 8);
const maps = (process.env.MAP || 'barilan,kvish4,gesher').split(',');
for (const map of maps) {
  let frames = 0, curb = 0, overlap = 0, stuck = 0, moving = 0, sprays = 0;
  for (let s = 1; s <= n; s++) {
    const w = new HM.World({ seed: s * 4099, map, protest: 'ai', police: 'ai', policeDifficulty: 'hard', protestDifficulty: 'hard' });
    let lastX = null, lastZ = null, still = 0;
    while (!w.outcome && w.t < 600) {
      w.step(); w.events.drain();
      for (const sq of w.squads) {
        const V = sq.vehicle;
        if (!V || sq.type !== 'cannon') continue;
        if (V.state !== 'drive' && V.state !== 'return') continue;
        frames++;
        if (V.spray) sprays++;
        // ארבע פינות הרכב (2.5x6 מ') — אחת מחוץ לכביש/רחבה = עלייה על מדרכה
        const s1 = Math.sin(V.heading), c1 = Math.cos(V.heading);
        let off = false;
        for (const [a, b] of [[1.1, 2.6], [-1.1, 2.6], [1.1, -2.6], [-1.1, -2.6]]) {
          const x = V.x + c1 * a + s1 * b, z = V.z - s1 * a + c1 * b;
          if (!w.nav.car.isWalkable(x, z) && !w.map.isRoad(x, z)) { off = true; break; }
        }
        if (off) curb++;
        if (w.carAt(V.x + s1 * 2.2, V.z + c1 * 2.2, -0.2) || w.carAt(V.x, V.z, -0.2)) overlap++;
        if (V.v < 0.3) still++; else moving++;
      }
    }
    stuck += still;
  }
  console.log(map, 'driveFrames', frames, 'curb%', (100 * curb / Math.max(1, frames)).toFixed(1), 'overlap%', (100 * overlap / Math.max(1, frames)).toFixed(1), 'stopped%', (100 * stuck / Math.max(1, frames)).toFixed(1));
}
