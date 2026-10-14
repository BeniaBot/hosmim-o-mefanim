// הרצת הרבה משחקים בלי ציור לבדיקת איזון: node v2/tools/batch.js [n] [difficulty] [protestMode]
const HM = require('../tests/load.js');
const n = +(process.argv[2] || 20), diff = process.argv[3] || 'normal', mode = process.argv[4] || 'ai';
const res = { protest: 0, police: 0 }, reasons = {}, times = [], peaks = [];
for (let s = 1; s <= n; s++) {
  const w = new HM.World({ seed: s * 7919, protest: mode === 'ai' ? 'ai' : 'human', police: 'ai', policeDifficulty: diff, protestDifficulty: 'bot' });
  while (!w.outcome && w.t < 900) { w.step(); w.events.drain(); }
  res[w.outcome.winner]++;
  reasons[w.outcome.reason] = (reasons[w.outcome.reason] || 0) + 1;
  times.push(w.outcome.t | 0); peaks.push(w.Hpeak | 0);
}
console.log(diff, mode, JSON.stringify(res), JSON.stringify(reasons), 'times', times.join(','), 'Hpeak', peaks.join(','));
