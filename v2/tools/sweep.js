// סריקת פרמטר איזון: node v2/tools/sweep.js headline.perKmSec 0.2,0.25,0.3 [n]
const HM = require('../tests/load.js');
const key = process.argv[2], vals = process.argv[3].split(',').map(Number), n = +(process.argv[4] || 10);
function setPath(o, p, v) { const ks = p.split('.'); let t = o; for (let i = 0; i < ks.length - 1; i++) t = t[ks[i]]; t[ks[ks.length - 1]] = v; }
for (const v of vals) {
  const out = [];
  for (const diff of ['easy', 'normal', 'hard']) {
    const BAL = JSON.parse(JSON.stringify(HM.BAL));
    setPath(BAL, key, v);
    let win = 0, tsum = 0;
    for (let s = 1; s <= n; s++) {
      const w = new HM.World({ BAL, seed: s * 7919, protest: 'ai', police: 'ai', policeDifficulty: diff, protestDifficulty: 'bot' });
      while (!w.outcome && w.t < 900) { w.step(); w.events.drain(); }
      if (w.outcome.winner === 'protest') { win++; tsum += w.outcome.t; }
    }
    out.push(`${diff}: bot wins ${win}/${n}${win ? ' avg ' + (tsum / win | 0) + 's' : ''}`);
  }
  console.log(key, '=', v, '|', out.join(' | '));
}
