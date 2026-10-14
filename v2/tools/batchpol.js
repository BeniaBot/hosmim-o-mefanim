// איזון מצב המשטרה: משטרה-מחשב (בתור "שחקן") מול מפגינים-מחשב בכל דרגה.
// node v2/tools/batchpol.js [n]
const HM = require('../tests/load.js');
const n = +(process.argv[2] || 12);
for (const diff of ['easy', 'normal', 'hard']) {
  let polWins = 0; const reasons = {}; const peaks = [];
  for (let s = 1; s <= n; s++) {
    const w = new HM.World({ seed: s * 104729, protest: 'ai', police: 'ai', policeDifficulty: 'human', protestDifficulty: diff, policeStart: HM.BAL.police.humanStart });
    while (!w.outcome && w.t < 900) { w.step(); w.events.drain(); }
    if (w.outcome.winner === 'police') polWins++;
    reasons[w.outcome.reason] = (reasons[w.outcome.reason] || 0) + 1;
    peaks.push(w.Hpeak | 0);
  }
  console.log(`protest=${diff}: police wins ${polWins}/${n}`, JSON.stringify(reasons), 'Hpeak', peaks.join(','));
}
