// טוען את קבצי הסימולציה ב-Node באותו סדר שבו index.html טוען אותם
const path = require('path');
const SIM_FILES = [
  'core/util.js', 'sim/balance.js', 'sim/maps.js', 'sim/nav.js', 'sim/traffic.js',
  'sim/units.js', 'sim/ai_police.js', 'sim/ai_protest.js', 'sim/world.js'
];
for (const f of SIM_FILES) require(path.join(__dirname, '..', 'src', f));
module.exports = globalThis.HM;
module.exports.SIM_FILES = SIM_FILES;
