// בדיקות הלוגיקה של המשחק. הרצה: node --test v2/tests/
const test = require('node:test');
const assert = require('node:assert');
const HM = require('./load.js');
const U = HM.Units;

function run(w, sec, fn) {
  const end = w.t + sec;
  while (w.t < end && !w.outcome) { w.step(); if (fn) fn(w); w.events.drain(); }
}
function newWorld(opts) {
  return new HM.World(Object.assign({ seed: 42, protest: 'human', police: 'human', empty: true }, opts || {}));
}
function placeSquad(w, side, type, x, z, sit) {
  const sq = U.makeSquad(w, side, type, x, z);
  U.setGoal(w, sq, x, z, undefined);
  if (sit) sq.stance = 'sit';
  return sq;
}

test('map: lanes, junction and arms are built', () => {
  const m = HM.buildMap('barilan', HM.BAL);
  assert.strictEqual(m.lanes.length, 6);
  assert.strictEqual(m.junctions.length, 1);
  assert.deepStrictEqual(Object.keys(m.arms).sort(), ['E', 'N', 'S', 'W']);
  assert.ok(m.isRoad(0, 0) && m.isRoad(-50, 3) && !m.isRoad(-50, 9));
  assert.ok(m.isSidewalk(-50, 9));
  // נסיעה בצד ימין: מזרחה = צד דרומי
  const east = m.lanes.find(l => l.axis === 'x' && l.dir > 0);
  assert.ok(east.off > 0);
});

test('nav: path goes around buildings and stays walkable', () => {
  const m = HM.buildMap('barilan', HM.BAL);
  const nav = HM.buildNav(m);
  // מחצר הישיבה אל מאחורי בניין הישיבה
  const p = nav.foot.path(-25, 27, -25, 56);
  assert.ok(p.length >= 2, 'needs a detour');
  let prev = { x: -25, z: 27 };
  for (const q of p) { assert.ok(nav.foot.los(prev.x, prev.z, q.x, q.z), 'segment clear'); prev = q; }
});

test('traffic: free flow has no overlaps and no jam', () => {
  const w = newWorld();
  run(w, 90);
  for (const l of w.traffic.lanes) {
    for (let i = 1; i < l.cars.length; i++) {
      const gap = l.cars[i - 1].d - l.cars[i - 1].len - l.cars[i].d;
      assert.ok(gap > -0.01, 'cars overlap');
    }
  }
  assert.ok(w.traffic.jamKm < 0.2, 'no jam without protest, got ' + w.traffic.jamKm);
  assert.ok(w.traffic.cars.length > 30);
});

test('blocking: a seated line across the west arm creates a jam and headlines', () => {
  const w = newWorld();
  placeSquad(w, 'protest', 'bochurim', -20, 0, true);
  run(w, 120);
  assert.ok(w.traffic.armJam.W > 0.25, 'west jam ' + w.traffic.armJam.W);
  assert.ok(w.traffic.jamKm > 0.4);
  assert.ok(w.H > 0, 'headlines rise');
});

test('cars never drive through people', () => {
  const w = newWorld();
  const sq = placeSquad(w, 'protest', 'bochurim', -30, 0, false);
  run(w, 40, () => {
    for (const p of sq.members) {
      for (const c of w.traffic.cars) {
        const L = c.lane.L;
        const perp = L.axis === 'x' ? p.z : p.x;
        if (Math.abs(perp - L.off) > 1.0) continue;
        const pd = w.map.laneD(L, p.x, p.z);
        // החרטום לא חוצה את האדם
        assert.ok(!(c.d > pd + 0.2 && c.d - c.len < pd - 0.2), 'car body over person');
      }
    }
  });
});

test('police drag protesters to the van, who are released and return', () => {
  const w = newWorld();
  const prot = placeSquad(w, 'protest', 'bochurim', 10, 3, false);
  const pol = U.makeSquad(w, 'police', 'patrol', 14, -9);
  U.setGoal(w, pol, 14, -9);
  w.cmd('police', { type: 'target', squads: [pol.id], target: prot.id });
  let detainedSeen = false, returningSeen = false;
  run(w, 120, () => {
    for (const p of w.people) {
      if (p.state === 'detained') detainedSeen = true;
      if (p.state === 'returning') returningSeen = true;
    }
  });
  assert.ok(w.stats.dragged >= 2, 'dragged ' + w.stats.dragged);
  assert.ok(detainedSeen, 'someone detained');
  assert.ok(returningSeen, 'someone released');
});

test('van departs when full and removes detainees', () => {
  const w = newWorld();
  const cap = HM.BAL.police.van.cap;
  const sq = U.makeSquad(w, 'protest', 'bochurim', 0, 0);
  for (let i = 0; i < cap; i++) {
    const p = U.makePerson(w, sq, 'bochur', w.van.x, w.van.z);
    p.state = 'carried';
    U.deliverToVan(w, p);
  }
  assert.strictEqual(w.van.state, 'away');
  assert.strictEqual(w.stats.removed, cap);
});

test('horses scatter a standing squad but halt before sitters (and it makes headlines)', () => {
  const w = newWorld();
  const standing = placeSquad(w, 'protest', 'bochurim', -15, 0, false);
  const horses = U.makeSquad(w, 'police', 'horses', 12, -9);
  U.setGoal(w, horses, 12, -9);
  run(w, 2);
  w.cmd('police', { type: 'target', squads: [horses.id], target: standing.id });
  let fled = false;
  run(w, 20, () => { if (standing.fleeT > 0) fled = true; });
  assert.ok(fled, 'standing squad fled');

  const w2 = newWorld();
  const sitters = placeSquad(w2, 'protest', 'avrechim', -15, 0, true);
  run(w2, 6);
  const h2 = U.makeSquad(w2, 'police', 'horses', 12, -9);
  U.setGoal(w2, h2, 12, -9);
  w2.cmd('police', { type: 'target', squads: [h2.id], target: sitters.id });
  let fled2 = false;
  run(w2, 20, () => { if (sitters.fleeT > 0) fled2 = true; });
  assert.ok(!fled2, 'sitters do not flee from horses');
  assert.ok(w2.stats.scandals >= 1, 'scandal recorded');
  assert.ok(w2.Hpeak >= HM.BAL.headline.horseOnSitters - 1);
});

test('water cannon makes a sitting squad flee', () => {
  const w = newWorld();
  const sitters = placeSquad(w, 'protest', 'avrechim', 0, 0, true);
  run(w, 6);
  const c = U.makeSquad(w, 'police', 'cannon', 20, -25);
  w.cmd('police', { type: 'target', squads: [c.id], target: sitters.id });
  let fled = false;
  run(w, 40, () => { if (sitters.fleeT > 0) fled = true; });
  assert.ok(fled, 'soaked squad fled');
  assert.ok(w.stats.soaked >= 1, 'soak counted');
});

test('askan permit stalls a nearby patrol; shofar has a cooldown', () => {
  const w = newWorld();
  const a = placeSquad(w, 'protest', 'askan', 0, 0, false);
  const pol = U.makeSquad(w, 'police', 'patrol', 4, 4);
  U.setGoal(w, pol, 4, 4);
  run(w, 1);
  const r = w.cmd('protest', { type: 'permit', squad: a.id });
  assert.ok(r.ok);
  assert.ok(pol.members.every(c => c.state === 'stalled'));
  assert.ok(!w.cmd('protest', { type: 'permit', squad: a.id }).ok, 'cooldown');
  run(w, HM.BAL.protest.shofar.firstAt);
  assert.ok(w.cmd('protest', { type: 'shofar' }).ok);
  assert.ok(!w.cmd('protest', { type: 'shofar' }).ok);
});

test('economy: buying costs money and respects limits', () => {
  const w = newWorld();
  w.money.protest = 1000;
  assert.ok(w.cmd('protest', { type: 'buy', unit: 'askan' }).ok);
  assert.ok(w.cmd('protest', { type: 'buy', unit: 'askan' }).ok);
  assert.strictEqual(w.cmd('protest', { type: 'buy', unit: 'askan' }).reason, 'max');
  w.money.protest = 10;
  assert.strictEqual(w.cmd('protest', { type: 'buy', unit: 'bochurim' }).reason, 'money');
  w.money.police = 1000;
  const r = w.cmd('police', { type: 'buy', unit: 'patrol' });
  assert.ok(r.ok && r.eta > 0, 'police arrive with a delay');
  run(w, r.eta + 0.5);
  assert.ok(w.squads.some(s => s.type === 'patrol'));
});

test('outcomes: headlines win, sunset win, dispersal', () => {
  const w = newWorld();
  w.H = 99.99; w.addHeadline(1, 'test');
  run(w, 0.1);
  assert.strictEqual(w.outcome.winner, 'protest');

  const w2 = newWorld({ sunset: 5 });
  placeSquad(w2, 'protest', 'bochurim', -40, -10, false);
  run(w2, 6);
  assert.strictEqual(w2.outcome.winner, 'police');
  assert.strictEqual(w2.outcome.reason, 'sunset');

  const w3 = newWorld();
  run(w3, HM.BAL.end.emptyStreetT + 1);
  assert.strictEqual(w3.outcome.reason, 'dispersed');
});

test('determinism: same seed gives the same game', () => {
  const a = new HM.World({ seed: 5, protest: 'ai', police: 'ai', protestDifficulty: 'bot' });
  const b = new HM.World({ seed: 5, protest: 'ai', police: 'ai', protestDifficulty: 'bot' });
  run(a, 60); run(b, 60);
  assert.strictEqual(a.H.toFixed(6), b.H.toFixed(6));
  assert.strictEqual(a.traffic.cars.length, b.traffic.cars.length);
  assert.strictEqual(a.people.length, b.people.length);
});

test('a full AI vs AI game ends with a winner and no stuck state', () => {
  const w = new HM.World({ seed: 99, protest: 'ai', police: 'ai', protestDifficulty: 'bot' });
  run(w, 900);
  assert.ok(w.outcome, 'game ended');
  assert.ok(['protest', 'police'].includes(w.outcome.winner));
  assert.ok(w.stats.dragged > 0, 'police did something');
  for (const p of w.people) {
    assert.ok(Number.isFinite(p.x) && Number.isFinite(p.z), 'finite positions');
    assert.ok(!w.map.inBuilding(p.x, p.z, -0.25), 'nobody inside a building');
  }
});

// ---------------- צד המשטרה ----------------
test('police mode: human police starts with patrols and AI protesters have a finite turnout', () => {
  const w = new HM.World({ seed: 3, protest: 'ai', police: 'human', difficulty: 'easy' });
  assert.strictEqual(w.squads.filter(s => s.side === 'police').length, HM.BAL.police.humanStart.length);
  assert.ok(w.ai.protest && !w.ai.police);
  assert.ok(w.ai.protest.hasMore());
  w.ai.protest.bought = w.ai.protest.cfg.turnout;
  assert.ok(!w.ai.protest.hasMore());
});

test('idle patrols auto-engage blockers nearby, but not far away', () => {
  const w = newWorld();
  const pol = U.makeSquad(w, 'police', 'patrol', 20, -9);
  U.setGoal(w, pol, 20, -9); pol.guard = { x: 20, z: -9 };
  const near = placeSquad(w, 'protest', 'bochurim', 20, 0, false);
  const far = placeSquad(w, 'protest', 'bochurim', -60, 0, false);
  run(w, 3);
  assert.strictEqual(pol.target, near.id);
  assert.ok(pol.auto);
  assert.notStrictEqual(pol.target, far.id);
});

test('after clearing, police step off the road', () => {
  const w = newWorld();
  const pol = U.makeSquad(w, 'police', 'patrol', 0, 0);
  U.setGoal(w, pol, 0, 0); pol.guard = { x: 0, z: 0 };
  U.returnToGuard(w, pol);
  assert.ok(!w.map.isRoad(pol.goal.x, pol.goal.z), 'goal moved to sidewalk');
});

test('megaphone hurts morale in range and has a cooldown', () => {
  const w = newWorld();
  const sq = placeSquad(w, 'protest', 'bochurim', 0, 30, false);
  sq.morale = 50;
  run(w, HM.BAL.police.megaphone.firstAt + 0.1);
  const before = sq.morale;
  const r = w.cmd('police', { type: 'megaphone', x: 0, z: 30 });
  assert.ok(r.ok && r.n === 1);
  assert.ok(Math.abs(before - sq.morale - HM.BAL.police.megaphone.morale) < 0.5, before + ' -> ' + sq.morale);
  assert.ok(!w.cmd('police', { type: 'megaphone', x: 0, z: 30 }).ok);
});

test('police standing on an empty road do not raise the headline meter', () => {
  const w = newWorld();
  const pol = U.makeSquad(w, 'police', 'patrol', -20, 0);
  U.setGoal(w, pol, -20, 0, 'z');
  run(w, 90);
  assert.ok(w.traffic.jamKm < 0.1, 'jam ' + w.traffic.jamKm);
  assert.strictEqual(Math.round(w.H), 0);
});

test('police can win by dispersal when the protest runs out of people', () => {
  const w = new HM.World({ seed: 11, protest: 'ai', police: 'human', difficulty: 'easy' });
  w.ai.protest.bought = w.ai.protest.cfg.turnout;   // אף אחד כבר לא יגיע
  for (const p of w.people) if (p.side === 'protest') p.state = 'gone';
  run(w, HM.BAL.end.emptyStreetT + 2);
  assert.ok(w.outcome && w.outcome.winner === 'police' && w.outcome.reason === 'dispersed', JSON.stringify(w.outcome));
});

// ---------------- יחידות נוספות ומפות ----------------
test('photographer slows dragging and documented drags make headlines', () => {
  const w = newWorld();
  const prot = placeSquad(w, 'protest', 'bochurim', 10, 3, false);
  const ph = placeSquad(w, 'protest', 'photographer', 12, 9, false);
  void ph;
  const pol = U.makeSquad(w, 'police', 'patrol', 14, -9);
  U.setGoal(w, pol, 14, -9);
  run(w, 2);
  assert.ok(w.photoAt(10, 3));
  w.cmd('police', { type: 'target', squads: [pol.id], target: prot.id });
  let docs = 0;
  const end = w.t + 40;
  while (w.t < end) { w.step(); for (const e of w.events.drain()) if (e.type === 'headline' && e.reason === 'documented') docs++; }
  assert.ok(docs >= 1, 'documented drags: ' + docs);
});

test('officer next to the askan blocks "I have a permit"', () => {
  const w = newWorld();
  const a = placeSquad(w, 'protest', 'askan', 0, 0, false);
  const pol = U.makeSquad(w, 'police', 'patrol', 4, 4);
  U.setGoal(w, pol, 4, 4);
  const off = U.makeSquad(w, 'police', 'officer', 3, -3);
  U.setGoal(w, off, 3, -3);
  run(w, 1);
  const r = w.cmd('protest', { type: 'permit', squad: a.id });
  assert.ok(!r.ok && r.reason === 'officer');
});

test('officer following a squad drains its morale', () => {
  const w = newWorld();
  const sq = placeSquad(w, 'protest', 'avrechim', -20, 0, true);
  run(w, 3);
  const off = U.makeSquad(w, 'police', 'officer', -20, -9);
  U.setGoal(w, off, -20, -9);
  w.cmd('police', { type: 'target', squads: [off.id], target: sq.id });
  const m0 = sq.morale;
  run(w, 20);
  assert.ok(sq.morale < m0 - 5, m0 + ' -> ' + sq.morale);
});

test('riot squad drags faster than a patrol', () => {
  function timeToFirstDrag(type) {
    const w = newWorld();
    const prot = placeSquad(w, 'protest', 'avrechim', 10, 3, true);
    run(w, 4);
    const pol = U.makeSquad(w, 'police', type, 12, -8);
    U.setGoal(w, pol, 12, -8);
    w.cmd('police', { type: 'target', squads: [pol.id], target: prot.id });
    const t0 = w.t;
    while (w.stats.dragged === 0 && w.t - t0 < 60) { w.step(); w.events.drain(); }
    return w.t - t0;
  }
  assert.ok(timeToFirstDrag('riot') < timeToFirstDrag('patrol'));
});

test('bus brings two squads to a chosen sidewalk spot', () => {
  const w = newWorld();
  placeSquad(w, 'protest', 'bochurim', -60, -10, false);   // שלא ייחשב "התפזרה"
  w.money.protest = 1000;
  run(w, HM.BAL.protest.bus.firstAt + 0.5);
  assert.strictEqual(w.cmd('protest', { type: 'bus', x: -40, z: 0 }).reason, 'place', 'not on the road');
  const r = w.cmd('protest', { type: 'bus', x: -40, z: 9.5 });
  assert.ok(r.ok, JSON.stringify(r));
  const n0 = w.squads.filter(s => s.side === 'protest').length;
  run(w, HM.BAL.protest.bus.delay + 0.5);
  assert.strictEqual(w.squads.filter(s => s.side === 'protest').length, n0 + 2);
  assert.ok(!w.cmd('protest', { type: 'bus', x: -40, z: 9.5 }).ok, 'cooldown');
});

test('all three maps build and run a full AI game', () => {
  for (const id of ['barilan', 'kvish4', 'gesher']) {
    const w = new HM.World({ seed: 21, map: id, protest: 'ai', police: 'ai', protestDifficulty: 'bot' });
    run(w, 900);
    assert.ok(w.outcome, id + ' ended');
    for (const p of w.people) assert.ok(!w.map.inBuilding(p.x, p.z, -0.3), id + ': person inside a wall/building');
  }
});

test('route 4: walls leave gaps and the pedestrian light stops traffic', () => {
  const m = HM.buildMap('kvish4', HM.BAL);
  const nav = HM.buildNav(m);
  assert.ok(!nav.foot.isWalkable(-40, 15.9), 'wall blocks');
  assert.ok(nav.foot.isWalkable(-77, 15.9), 'gap is open');
  const w = new HM.World({ seed: 2, map: 'kvish4', protest: 'human', police: 'human', empty: true });
  let red = false;
  run(w, 45, () => { if (w.traffic.light.x === 'R') red = true; });
  assert.ok(red, 'pedestrian phase happens');
});

test('chords bridge: a blocked tram boosts the headline meter', () => {
  const w = new HM.World({ seed: 4, map: 'gesher', protest: 'human', police: 'human', empty: true });
  // שורה לרוחב כל הכביש כולל המסילה
  const a = U.makeSquad(w, 'protest', 'bochurim', -30, -3); U.setGoal(w, a, -30, -3, 'z'); a.stance = 'sit';
  const b = U.makeSquad(w, 'protest', 'bochurim', -30, 3); U.setGoal(w, b, -30, 3, 'z'); b.stance = 'sit';
  let blocked = false;
  run(w, 150, () => { if (w.traffic.tramBlocked) blocked = true; });
  assert.ok(blocked, 'a tram got stuck');
  assert.ok((w.stats.tramT || 0) > 5);
});

test('ambulance: blocking it too long turns the media; clearing the way earns respect', () => {
  // חסימה ממושכת
  const w = new HM.World({ seed: 8, protest: 'human', police: 'human', empty: true, ambulance: true });
  const sq = placeSquad(w, 'protest', 'bochurim', -25, 0, true);
  void sq;
  w.H = 50;
  w.amb.nextT = 1;
  let scandal = false;
  run(w, 60, () => { for (const e of w.events.list) if (e.type === 'ambScandal') scandal = true; });
  assert.ok(scandal, 'scandal when the ambulance is blocked');
  // פינוי בזמן
  const w2 = new HM.World({ seed: 8, protest: 'human', police: 'human', empty: true, ambulance: true });
  const s2 = placeSquad(w2, 'protest', 'bochurim', -25, 0, true);
  w2.amb.nextT = 1;
  let respect = false, moved = false;
  run(w2, 60, () => {
    for (const e of w2.events.list) {
      if (e.type === 'ambBlocked' && !moved) { moved = true; w2.cmd('protest', { type: 'move', squads: [s2.id], x: -25, z: 9.5 }); }
      if (e.type === 'headline' && e.reason === 'ambRespect') respect = true;
    }
  });
  assert.ok(moved, 'ambulance got blocked first');
  assert.ok(respect, 'respect for clearing the way');
});

test('cops do not lock up when standing avrechim sit down mid-approach (sitters need two cops)', () => {
  let stuck = 0;
  for (let s = 1; s <= 6; s++) {
    const w = newWorld({ seed: s });
    const x = w.rng.f(-40, 40);
    const prot = placeSquad(w, 'protest', 'avrechim', x, 0, false);
    run(w, 5);
    const pol = U.makeSquad(w, 'police', 'patrol', x + 6, 10);
    U.setGoal(w, pol, pol.members[0].x, 10);
    w.cmd('police', { type: 'target', squads: [pol.id], target: prot.id });
    run(w, 1);
    w.cmd('protest', { type: 'stance', squads: [prot.id], stance: 'sit' });
    run(w, 90);
    if (w.stats.dragged === 0) stuck++;
  }
  assert.strictEqual(stuck, 0, 'every run ends with at least one arrest');
});

test('a member released after his squad broke walks home instead of blocking forever', () => {
  const w = newWorld();
  const sq = placeSquad(w, 'protest', 'bochurim', -30, 0, false);
  run(w, 4);
  const p = sq.members[0];
  const cop = U.makeSquad(w, 'police', 'patrol', -30, 6).members[0];
  // מחזיקים אותו, החוליה מתפרקת, ואז השוטר משחרר
  p.state = 'held'; p.holders = [cop]; p.claims = [cop]; cop.state = 'grab'; cop.victim = p;
  U.breakSquad(w, sq);
  cop.state = 'free'; cop.victim = null;
  run(w, 1);
  assert.notStrictEqual(p.state, 'free');
  assert.ok(p.state === 'home' || p.state === 'gone', p.state);
  run(w, 60);
  assert.ok(!w.people.includes(p) || !w.map.isRoad(p.x, p.z), 'left the road');
});

test('water cannon with a vanished target stops driving (goes idle, then home)', () => {
  const w = newWorld();
  const tgt = placeSquad(w, 'protest', 'bochurim', -20, 0, false);
  const can = U.makeSquad(w, 'police', 'cannon', 30, -31);
  w.cmd('police', { type: 'target', squads: [can.id], target: tgt.id });
  run(w, 2);
  assert.strictEqual(can.vehicle.state, 'drive');
  for (const m of tgt.members) m.state = 'gone';
  tgt.members.length = 0;
  run(w, 1);
  assert.notStrictEqual(can.vehicle.state, 'drive');
});

test('cars wait before the crosswalk when someone stands just past it (crosswalk stays open)', () => {
  const w = newWorld({ map: 'kvish4' });
  // מישהו עומד בנתיב מערבה, מעט אחרי מעבר החציה (x=0, רוחב 6)
  const sq = placeSquad(w, 'protest', 'askan', -5.5, -2.4, false);
  let inside = 0;
  run(w, 60, () => {
    for (const lane of w.traffic.lanes) {
      if (lane.L.axis !== 'x' || lane.L.dir > 0) continue;
      for (const c of lane.cars) if (c.v < 0.3 && Math.abs(c.z - (-2.4)) < 1 && c.x - c.len / 2 < 3 && c.x + c.len / 2 > -3) inside++;
    }
    sq.members[0].x = -5.5; sq.members[0].z = -2.4; sq.members[0].vx = sq.members[0].vz = 0;
  });
  assert.strictEqual(inside, 0, 'no stopped car on the crosswalk');
});

test('kugel truck: a clear road brings morale to the protest; blocking it too long lets the kugel go cold', () => {
  // דרך פנויה — מורל
  const w = new HM.World({ seed: 9, protest: 'human', police: 'human', empty: true, ambulance: true });
  const sq = placeSquad(w, 'protest', 'bochurim', -25, 26);   // בחצר הישיבה, לא על הכביש
  sq.morale = 40;
  w.amb.nextT = 1e9; w.amb.nextK = 1;
  let delivered = false;
  run(w, 90, () => { for (const e of w.events.list) if (e.type === 'kugelDelivered') delivered = true; });
  assert.ok(delivered, 'delivered');
  assert.ok(sq.morale > 60, 'morale rose: ' + sq.morale);
  // חסימה ממושכת — מתקרר
  const w2 = new HM.World({ seed: 9, protest: 'human', police: 'human', empty: true, ambulance: true });
  w2.amb.nextT = 1e9; w2.amb.nextK = 1;
  run(w2, 1.2);
  const k = w2.amb.list.find(a => a.kind === 'kugel');
  assert.ok(k, 'truck spawned');
  // חוליה יושבת בנתיב של המשאית, קצת לפניה
  const L = k.L, p = w2.map.lanePos(L, Math.min(L.len - 20, k.d + 30));
  placeSquad(w2, 'protest', 'avrechim', p.x, p.z, true);
  let cold = false;
  run(w2, 60, () => { for (const e of w2.events.list) if (e.type === 'kugelCold') cold = true; });
  assert.ok(cold, 'kugel went cold');
});

test('an ambulance squeezing past does not wipe out a jam that is already there', () => {
  const w = new HM.World({ seed: 21, protest: 'human', police: 'human', empty: true, ambulance: true });
  w.amb.nextT = 1e9; w.amb.nextK = 1e9;
  placeSquad(w, 'protest', 'avrechim', -25, 0, true);    // חוסמים את הכביש הראשי
  run(w, 70);
  w.amb.spawn('amb');
  // הנתיב של האמבולנס (התור שלו מערבית לחוסמים — רמזורים לא משפיעים עליו)
  const lane = w.traffic.lanes.find(l => l.L === w.amb.list[0].L);
  const before = lane.jamCars;
  assert.ok(before > 5, 'a jam formed in the ambulance lane: ' + before);
  let minJam = before;
  run(w, 8, () => { minJam = Math.min(minJam, lane.jamCars); });
  assert.ok(minJam >= before * 0.7, `jam stays while the ambulance passes (${before} → min ${minJam})`);
});

test('an askan next to the liaison officer does not spam "I have a permit"', () => {
  const w = new HM.World({ seed: 5, protest: 'ai', police: 'human', empty: true, protestDifficulty: 'normal' });
  const ask = placeSquad(w, 'protest', 'askan', -20, 0);
  placeSquad(w, 'protest', 'bochurim', -22, 0, true);
  const off = U.makeSquad(w, 'police', 'officer', -19, 1.5); U.setGoal(w, off, -19, 1.5);
  const cops = U.makeSquad(w, 'police', 'patrol', -16, 3); U.setGoal(w, cops, -16, 3);
  void ask;
  let blocked = 0;
  run(w, 60, () => { for (const e of w.events.list) if (e.type === 'permitBlocked') blocked++; });
  assert.ok(blocked <= 4, 'permit blocked events in a minute: ' + blocked);
});
