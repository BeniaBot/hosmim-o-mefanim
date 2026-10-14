// הרצת משחק שלם בלי ציור: node v2/tools/simrun.js [seed] [protest=ai|idle] [difficulty]
const HM = require('../tests/load.js');
const seed = +(process.argv[2] || 1), mode = process.argv[3] || 'ai', diff = process.argv[4] || 'normal';
const w = new HM.World({ seed, protest: mode === 'ai' ? 'ai' : 'human', police: 'ai', difficulty: diff });
const t0 = Date.now();
let next = 0;
while (!w.outcome && w.t < 900) {
  w.step();
  if (w.t >= next) {
    next += 30;
    const sq = w.squads.filter(s => s.side === 'protest');
    const pol = w.squads.filter(s => s.side === 'police');
    console.log(`t=${w.t.toFixed(0).padStart(3)} H=${w.H.toFixed(1).padStart(5)} jam=${w.traffic.jamKm.toFixed(2)}km cars=${w.traffic.cars.length} ` +
      `prot=${w.protestersOnStreet()} sq=${sq.length} pol=${pol.map(s=>s.type[0]).join('')} $P=${w.money.protest|0} $C=${w.money.police|0} van=${w.van.list.length}/${w.van.state} drag=${w.stats.dragged} rem=${w.stats.removed} flee/soak=${w.stats.soaked}`);
  }
  w.events.drain();
}
console.log('OUTCOME', JSON.stringify(w.outcome), 'Hpeak', w.Hpeak.toFixed(1), 'jamPeak', w.stats.jamPeak.toFixed(2), 'stats', JSON.stringify(w.stats), 'ms', Date.now() - t0);
