/* יחידות: חוליות ואנשים, תנועה, מבנים, וכל האינטראקציות בין הצדדים
   (גרירה, פרשים, מכת"זית, עסקן, שופר, ניידת עצורים). */
(function (root) {
  'use strict';
  const HM = root.HM || (root.HM = {});
  const U = HM.U;

  const KIND = { bochurim: 'bochur', avrechim: 'avrech', askan: 'askan', patrol: 'cop', horses: 'rider' };
  const ON_STREET = { free: 1, held: 1, returning: 1 };   // נחשבים "מפגינים ברחוב"

  // ---------- יצירה ----------
  function cfgOf(world, side, type) {
    return side === 'protest' ? world.BAL.protest[type] : world.BAL.police[type];
  }

  function makePerson(world, sq, kind, x, z) {
    const p = {
      id: world.nextId++, squad: sq, side: sq.side, kind, x, z, px: x, pz: z, vx: 0, vz: 0,
      face: sq.side === 'protest' ? Math.PI : 0, state: 'free', sit: 0, slotI: 0,
      r: kind === 'rider' ? 1.0 : world.BAL.people.radius,
      // מפגין
      holders: [], claims: [], grabT: 0, carrier: null, wet: 0, scare: 0,
      // שוטר
      victim: null, carry: null, stallT: 0, path: null, pathI: 0, pathT: 0, pathGoal: null,
      walkPhase: world.rng.f(0, 6.28), bubbleT: 0
    };
    world.people.push(p);
    return p;
  }

  // המספר הפנוי הקטן ביותר — כך שמקשי 1–9 תמיד מכסים את החוליות החיות
  function freeNum(world, side) {
    const used = new Set();
    for (const s of world.squads) if (s.side === side) used.add(s.num);
    let n = 1;
    while (used.has(n)) n++;
    return n;
  }

  function makeSquad(world, side, type, x, z) {
    const cfg = cfgOf(world, side, type);
    const sq = {
      id: world.nextId++, side, type, cfg, num: freeNum(world, side),
      members: [], goal: { x, z }, anchor: { x, z }, path: null, pathI: 0, moving: false,
      finalSlots: null, stance: 'stand', morale: cfg.morale || 100, maxMorale: cfg.morale || 100,
      fleeT: 0, flee: null, broken: false, target: null, mode: 'idle', modeT: 0, cd: {},
      lastScandal: -999, wetHits: 0, vehicle: null, bornT: world.t
    };
    if (type === 'cannon') {
      sq.vehicle = { x, z, px: x, pz: z, heading: 0, v: 0, tank: cfg.tank, state: 'ready', spray: false,
                     path: null, pathI: 0, fire: null, refillT: 0 };
    } else {
      const n = cfg.members;
      for (let i = 0; i < n; i++) {
        const a = i * 2.39996, r = 0.8 * Math.sqrt(i);
        const p = makePerson(world, sq, KIND[type], x + Math.cos(a) * r, z + Math.sin(a) * r);
        p.slotI = i;
        sq.members.push(p);
      }
    }
    world.squads.push(sq);
    return sq;
  }

  // ---------- מבנים ----------
  function centroid(sq) {
    if (sq.vehicle) return { x: sq.vehicle.x, z: sq.vehicle.z };
    let x = 0, z = 0, n = 0;
    for (const p of sq.members) { x += p.x; z += p.z; n++; }
    if (!n) return { x: sq.anchor.x, z: sq.anchor.z };
    return { x: x / n, z: z / n };
  }

  // באיזה ציר לפרוס שורה בנקודה (שורה ניצבת לכביש = חוסמת את כל הנתיבים שהיא חוצה)
  function lineAxisAt(world, x, z) {
    const m = world.map;
    if (m.junctionAt(x, z)) {
      // בצומת: ניצב לכביש הרחב יותר
      const rs = m.roads.slice().sort((a, b) => b.halfW - a.halfW);
      return rs[0].axis === 'x' ? 'z' : 'x';
    }
    const r = m.roadAt(x, z);
    if (!r) return null;
    return r.axis === 'x' ? 'z' : 'x';
  }

  function spacingOf(sq, world) {
    return sq.type === 'horses' ? 2.4 : sq.type === 'patrol' ? 1.25 : world.BAL.people.lineSpacing;
  }

  function formationWidth(world, sq, axis) {
    const n = Math.max(1, sq.members.length);
    if (axis) return n * spacingOf(sq, world);
    return Math.min(3, n) * 1.15;
  }

  function computeSlots(world, sq, cx, cz, axis) {
    const n = sq.members.length, out = [];
    const foot = world.nav.foot;
    if (axis) {
      const sp = spacingOf(sq, world);
      for (let k = 0; k < n; k++) {
        const o = (k - (n - 1) / 2) * sp;
        out.push(axis === 'z' ? { x: cx, z: cz + o } : { x: cx + o, z: cz });
      }
    } else {
      const sp = sq.type === 'horses' ? 2.4 : 1.15;
      const rows = Math.ceil(n / 3);
      for (let k = 0; k < n; k++) {
        const row = Math.floor(k / 3), cnt = Math.min(3, n - row * 3), col = k % 3;
        out.push({ x: cx + (col - (cnt - 1) / 2) * sp, z: cz + (row - (rows - 1) / 2) * sp });
      }
    }
    for (const s of out) {
      if (!foot.isWalkable(s.x, s.z)) { const w = foot.nearestWalkable(s.x, s.z); s.x = w.x; s.z = w.z; }
    }
    return out;
  }

  function assignSlots(sq, slots) {
    const free = sq.members.slice();
    const used = new Array(free.length).fill(false);
    slots.forEach((s, k) => {
      let bi = -1, bd = 1e9;
      for (let i = 0; i < free.length; i++) {
        if (used[i]) continue;
        const d = U.dist2(free[i].x, free[i].z, s.x, s.z);
        if (d < bd) { bd = d; bi = i; }
      }
      if (bi >= 0) { used[bi] = true; free[bi].slotI = k; }
    });
  }

  // קביעת יעד לחוליה (נקודת מרכז + פריסה סופית)
  function setGoal(world, sq, x, z, axisOverride) {
    if (sq.vehicle) { vehicleGo(world, sq, x, z); sq.target = null; sq.mode = 'idle'; return; }
    const foot = world.nav.foot;
    if (!foot.isWalkable(x, z)) { const w = foot.nearestWalkable(x, z); x = w.x; z = w.z; }
    const c = centroid(sq);
    sq.goal = { x, z };
    sq.path = foot.path(c.x, c.z, x, z);
    sq.pathI = 0;
    sq.anchor = { x: c.x, z: c.z };
    sq.moving = true;
    const axis = axisOverride !== undefined ? axisOverride : lineAxisAt(world, x, z);
    sq.axis = axis;
    sq.finalSlots = computeSlots(world, sq, x, z, axis);
    assignSlots(sq, sq.finalSlots);
    if (sq.side === 'protest' && sq.stance === 'sit') sq.stance = 'stand';
  }

  // עדכון יעד הפריסה כשמשתנה מספר האנשים (מישהו נגרר / חזר)
  function refreshSlots(world, sq) {
    if (sq.vehicle || !sq.members.length) return;
    const g = sq.goal;
    sq.finalSlots = computeSlots(world, sq, g.x, g.z, sq.axis);
    assignSlots(sq, sq.finalSlots);
  }

  function isSitting(p) { return p.sit > 0.7; }
  function squadSitting(sq) {
    if (!sq.members.length) return false;
    let n = 0;
    for (const p of sq.members) if (isSitting(p)) n++;
    return n * 2 >= sq.members.length;
  }

  // ---------- תנועה של אדם ----------
  function steer(world, p, tx, tz, speed, dt, stopDist) {
    const dx = tx - p.x, dz = tz - p.z;
    const d = Math.sqrt(dx * dx + dz * dz);
    let dvx = 0, dvz = 0;
    if (d > (stopDist || 0.12)) {
      const s = speed * Math.min(1, d / 1.0);
      dvx = dx / d * s; dvz = dz / d * s;
    }
    // הפרדה
    const sep = world.BAL.people.sepDist + (p.kind === 'rider' ? 1.0 : 0);
    const near = world.neighbors(p.x, p.z, sep + 1.2);
    let sx = 0, sz = 0;
    for (const q of near) {
      if (q === p || q.state === 'carried' || q.state === 'detained') continue;
      const ex = p.x - q.x, ez = p.z - q.z;
      const min = sep + (q.kind === 'rider' ? 1.0 : 0);
      const dd = ex * ex + ez * ez;
      if (dd < min * min && dd > 1e-6) {
        const dl = Math.sqrt(dd), push = (min - dl) / min;
        sx += ex / dl * push; sz += ez / dl * push;
      } else if (dd <= 1e-6) { sx += (p.id % 7 - 3) * 0.1; sz += (p.id % 5 - 2) * 0.1; }
    }
    const sepGain = 2.6;
    dvx += sx * sepGain; dvz += sz * sepGain;
    // תאוצה
    const acc = p.kind === 'rider' ? 7 : 10;
    p.vx = U.approach(p.vx, dvx, acc * dt);
    p.vz = U.approach(p.vz, dvz, acc * dt);
    const foot = world.nav.foot;
    let nx = p.x + p.vx * dt, nz = p.z + p.vz * dt;
    if (!foot.isWalkable(nx, nz)) {
      if (foot.isWalkable(nx, p.z)) { nz = p.z; p.vz = 0; }
      else if (foot.isWalkable(p.x, nz)) { nx = p.x; p.vx = 0; }
      else { nx = p.x; nz = p.z; p.vx = p.vz = 0; }
    }
    // לא עוברים דרך מכוניות — מחליקים לאורכן
    const rr = p.kind === 'rider' ? 0.9 : 0.25;
    if ((nx !== p.x || nz !== p.z) && world.carAt(nx, nz, rr) && !world.carAt(p.x, p.z, rr)) {
      if (!world.carAt(nx, p.z, rr)) { nz = p.z; p.vz = 0; }
      else if (!world.carAt(p.x, nz, rr)) { nx = p.x; p.vx = 0; }
      else { nx = p.x; nz = p.z; p.vx = p.vz = 0; }
    }
    p.x = nx; p.z = nz;
    const sp2 = p.vx * p.vx + p.vz * p.vz;
    if (sp2 > 0.09) p.face = U.turnToward(p.face, Math.atan2(p.vx, p.vz), 8 * dt);
    p.walkPhase += Math.sqrt(sp2) * dt * 3.2;
    return d;
  }

  // הליכה עם מסלול (לשוטרים שרודפים / גוררים)
  function walkTo(world, p, tx, tz, speed, dt, stopDist) {
    const foot = world.nav.foot;
    p.pathT -= dt;
    const goalMoved = !p.pathGoal || U.dist2(p.pathGoal.x, p.pathGoal.z, tx, tz) > 4;
    if (!p.path || (goalMoved && p.pathT <= 0)) {
      p.path = foot.path(p.x, p.z, tx, tz);
      p.pathI = 0; p.pathT = 1.0; p.pathGoal = { x: tx, z: tz };
    }
    let wx = tx, wz = tz;
    if (p.path && p.pathI < p.path.length - 1) {
      const w = p.path[p.pathI];
      if (U.dist2(p.x, p.z, w.x, w.z) < 1.2) p.pathI++;
      wx = p.path[p.pathI].x; wz = p.path[p.pathI].z;
    }
    if (p.path && p.pathI >= p.path.length - 1) { wx = tx; wz = tz; }
    return steer(world, p, wx, wz, speed, dt, stopDist) <= (stopDist || 0.12) + 0.05
      && U.dist(p.x, p.z, tx, tz) <= (stopDist || 0.12) + 0.6;
  }

  // ---------- עדכון חוליה ----------
  function squadSpeed(world, sq) {
    let s = sq.cfg.speed || 3;
    if (sq.side === 'protest' && sq.morale < world.BAL.protest.morale.lowWarn) s *= 0.85;
    if (sq.type === 'horses' && sq.mode !== 'charge') s *= 0.6;
    return s;
  }

  function updateSquad(world, sq, dt) {
    if (sq.vehicle) { updateCannon(world, sq, dt); return; }
    const B = world.BAL;
    for (const k in sq.cd) if (sq.cd[k] > 0) sq.cd[k] = Math.max(0, sq.cd[k] - dt);
    if (sq.side === 'protest') {
      if (sq.fleeT > 0) {
        sq.fleeT -= dt;
        if (sq.fleeT <= 0) {
          sq.fleeT = 0;
          const c = centroid(sq);
          setGoal(world, sq, c.x, c.z);
        }
      } else if (!sq.broken) {
        sq.morale = Math.min(sq.maxMorale, sq.morale + B.protest.morale.regen * dt);
      }
    }
    // מתקדמים לאורך המסלול
    if (sq.moving && sq.path) {
      const c = centroid(sq);
      const lead = U.dist(sq.anchor.x, sq.anchor.z, c.x, c.z);
      if (lead < 3.2) {
        let step = squadSpeed(world, sq) * dt;
        while (step > 0 && sq.pathI < sq.path.length) {
          const w = sq.path[sq.pathI];
          const d = U.dist(sq.anchor.x, sq.anchor.z, w.x, w.z);
          if (d <= step) { sq.anchor.x = w.x; sq.anchor.z = w.z; step -= d; sq.pathI++; }
          else { sq.anchor.x += (w.x - sq.anchor.x) / d * step; sq.anchor.z += (w.z - sq.anchor.z) / d * step; step = 0; }
        }
        if (sq.pathI >= sq.path.length) sq.moving = false;
      }
    }
  }

  // יעד אישי לחבר חוליה במצב "חופשי"
  function memberTarget(world, sq, p) {
    if (sq.fleeT > 0 && sq.flee) {
      const k = p.slotI, a = k * 2.39996, r = 0.9 * Math.sqrt(k);
      return { x: sq.flee.x + Math.cos(a) * r, z: sq.flee.z + Math.sin(a) * r, run: true };
    }
    if (sq.moving) {
      const k = p.slotI, n = sq.members.length;
      const row = Math.floor(k / 3), cnt = Math.min(3, n - row * 3), col = k % 3;
      const sp = sq.type === 'horses' ? 2.4 : 1.1;
      return { x: sq.anchor.x + (col - (cnt - 1) / 2) * sp, z: sq.anchor.z + row * sp * 0.9 };
    }
    const s = sq.finalSlots && sq.finalSlots[p.slotI];
    if (s) return s;
    return sq.goal;
  }

  // ---------- עדכון אדם ----------
  function updatePerson(world, p, dt) {
    const sq = p.squad, B = world.BAL;
    switch (p.state) {
      case 'free': {
        const t = memberTarget(world, sq, p);
        let speed = squadSpeed(world, sq);
        if (t.run) speed *= B.people.fleeSpeedMul;
        const wantSit = sq.side === 'protest' && sq.stance === 'sit' && !sq.moving && sq.fleeT <= 0;
        if (sq.fleeT > 0) p.sit = 0;
        if (wantSit) {
          const d = U.dist(p.x, p.z, t.x, t.z);
          if (d < 0.35 || p.sit > 0) {
            p.sit = U.approach(p.sit, 1, dt / B.people.sitTime);
            p.vx = p.vz = 0;
            // מתיישבים בדיוק במקום שלהם בשורה (שלא יישארו פרצות)
            const k = Math.min(1, dt * 3);
            if (d < 1.0) { p.x += (t.x - p.x) * k; p.z += (t.z - p.z) * k; }
            if (p.sit < 1) p.face = U.turnToward(p.face, sitFacing(world, sq, p), 4 * dt);
            break;
          }
        } else if (p.sit > 0) {
          p.sit = U.approach(p.sit, 0, dt / B.people.sitTime);
          p.vx = p.vz = 0;
          break;
        }
        const d = steer(world, p, t.x, t.z, speed, dt, 0.1);
        if (d < 0.3 && !sq.moving && sq.side === 'protest' && sq.fleeT <= 0) {
          p.face = U.turnToward(p.face, sitFacing(world, sq, p), 3 * dt);
        }
        break;
      }
      case 'held': p.vx = p.vz = 0; break;
      case 'carried': {
        const c = p.carrier;
        if (c) {
          p.px = p.x; p.pz = p.z;
          p.x = c.x - Math.sin(c.face) * 0.9; p.z = c.z - Math.cos(c.face) * 0.9;
          p.face = c.face;
        }
        break;
      }
      case 'returning': {
        const alive = sq.members.length > 0 && !sq.broken;
        if (alive) {
          const c = centroid(sq);
          if (walkTo(world, p, c.x, c.z, 2.6, dt, 2.0)) {
            p.state = 'free';
            sq.members.push(p);
            refreshSlots(world, sq);
            world.events.push('rejoin', { squad: sq.id, x: p.x, z: p.z });
          }
        } else {
          p.state = 'home';
        }
        break;
      }
      case 'home': {
        const b = world.map.bases.protest;
        if (walkTo(world, p, b.x, b.z, 2.4, dt, 1.5)) p.state = 'gone';
        break;
      }
      // ----- שוטרים -----
      case 'seek': {
        const v = p.victim;
        if (!v || (v.state !== 'free' && v.state !== 'held') || v.squad.fleeT > 0 && v.state === 'free' && U.dist(p.x, p.z, v.x, v.z) > 8) {
          dropVictim(p); p.state = 'free'; break;
        }
        if (walkTo(world, p, v.x, v.z, sq.cfg.speed * 1.1, dt, 0.85)) {
          p.state = 'grab';
          if (!v.holders.includes(p)) v.holders.push(p);
          if (v.state === 'free') { v.state = 'held'; v.sit = v.sit; world.events.push('grab', { x: v.x, z: v.z, id: v.id }); }
        }
        break;
      }
      case 'grab': {
        const v = p.victim;
        if (!v || v.state !== 'held') { dropVictim(p); p.state = 'free'; break; }
        p.vx = p.vz = 0;
        p.face = Math.atan2(v.x - p.x, v.z - p.z);
        break;
      }
      case 'drag': {
        const van = world.van;
        if (walkTo(world, p, van.x, van.z, sq.cfg.dragSpeed, dt, 2.2)) {
          deliverToVan(world, p.carry);
          p.carry = null;
          p.state = 'free';
        }
        break;
      }
      case 'stalled':
      case 'stunned': {
        p.vx = p.vz = 0;
        p.stallT -= dt;
        if (p.stallT <= 0) p.state = 'free';
        break;
      }
      case 'free_police':
        break;
    }
  }

  function sitFacing(world, sq, p) {
    // יושבים עם הפנים לכיוון התנועה שנחסמת (בערך) — כאן: מול המצלמה הכללית/המשטרה
    if (sq.axis === 'z') return p.x > sq.goal.x ? Math.PI / 2 : -Math.PI / 2;
    if (sq.axis === 'x') return p.z > sq.goal.z ? 0 : Math.PI;
    return p.face;
  }

  function dropVictim(cop) {
    const v = cop.victim;
    if (v) {
      v.claims = v.claims.filter(c => c !== cop);
      const hi = v.holders.indexOf(cop);
      if (hi >= 0) v.holders.splice(hi, 1);
      if (v.state === 'held' && v.holders.length === 0) { v.state = 'free'; v.grabT = 0; }
    }
    cop.victim = null;
  }

  // ---------- ניידת עצורים ----------
  function deliverToVan(world, v) {
    if (!v) return;
    const van = world.van, B = world.BAL.police.van;
    v.carrier = null;
    if (van.state === 'here' && van.list.length < B.cap) {
      v.state = 'detained';
      van.list.push({ p: v, at: world.t + B.release });
      world.events.push('detained', { x: van.x, z: van.z, n: van.list.length });
      if (van.list.length >= B.cap) {
        // הניידת מלאה — נוסעת לתחנה, והעצורים יוצאים מהמשחק
        for (const e of van.list) { e.p.state = 'gone'; world.stats.removed++; }
        world.events.push('vanDeparted', { n: van.list.length });
        van.list = [];
        van.state = 'away';
        van.awayT = B.away;
      }
    } else {
      v.state = 'returning';
      v.x = van.x + world.rng.f(-1.5, 1.5); v.z = van.z + world.rng.f(-1.5, 1.5);
      v.px = v.x; v.pz = v.z;
      world.events.push('released', { x: v.x, z: v.z, full: true });
    }
  }

  function updateVan(world, dt) {
    const van = world.van;
    if (van.state === 'away') {
      van.awayT -= dt;
      if (van.awayT <= 0) { van.state = 'here'; world.events.push('vanBack', {}); }
      return;
    }
    for (let i = van.list.length - 1; i >= 0; i--) {
      const e = van.list[i];
      if (world.t >= e.at) {
        van.list.splice(i, 1);
        const p = e.p;
        p.state = 'returning';
        p.x = van.x + world.rng.f(-1.5, 1.5); p.z = van.z + world.rng.f(-1, 1);
        p.px = p.x; p.pz = p.z; p.sit = 0; p.path = null;
        world.events.push('released', { x: p.x, z: p.z });
      }
    }
  }

  // ---------- גרירה ----------
  function grabNeed(world, v) {
    const c = world.BAL.protest[v.squad.type];
    return isSitting(v) ? (c.copsSit || 1) : 1;
  }
  function grabTime(world, v) {
    const c = world.BAL.protest[v.squad.type];
    let t = isSitting(v) ? c.grab.sit : c.grab.stand;
    if (world.auraAt(v.x, v.z)) t *= world.BAL.protest.aura.grabMul;
    return t;
  }

  function updateGrabs(world, dt) {
    for (const v of world.people) {
      if (v.state !== 'held') continue;
      // מנקים מחזיקים שכבר לא מחזיקים
      v.holders = v.holders.filter(c => c.state === 'grab' && c.victim === v);
      if (!v.holders.length) { v.state = 'free'; v.grabT = 0; continue; }
      if (v.holders.length >= grabNeed(world, v)) {
        v.grabT += dt / grabTime(world, v);
        if (v.grabT >= 1) {
          const cop = v.holders[0];
          for (const other of v.holders) if (other !== cop) { other.victim = null; other.state = 'free'; }
          v.holders = []; v.claims = [];
          v.state = 'carried'; v.carrier = cop; v.sit = 0; v.grabT = 0;
          cop.carry = v; cop.victim = null; cop.state = 'drag'; cop.path = null;
          const sq = v.squad;
          const i = sq.members.indexOf(v);
          if (i >= 0) sq.members.splice(i, 1);
          world.stats.dragged++;
          if (sq.type === 'askan') {
            world.addHeadline(world.BAL.headline.askanArrest, 'askanArrest', v.x, v.z);
            world.moraleAround(v.x, v.z, 15, -world.BAL.protest.morale.askanArrested);
          }
          hitMorale(world, sq, world.BAL.protest.morale.dragged, v.x, v.z);
          refreshSlots(world, sq);
          world.events.push('dragged', { x: v.x, z: v.z, kind: v.kind, squad: sq.id });
        }
      }
    }
  }

  function hitMorale(world, sq, amount, x, z) {
    if (sq.side !== 'protest' || sq.broken) return;
    sq.morale -= amount;
    if (sq.morale <= 0) breakSquad(world, sq, x, z);
  }

  function breakSquad(world, sq) {
    sq.morale = 0;
    sq.broken = true;
    for (const p of sq.members) {
      if (p.state === 'free') { p.state = 'home'; p.sit = 0; p.path = null; }
    }
    // מי שמוחזק — נשאר ייגרר; מי שבחוץ — ילך הביתה כשישתחרר
    sq.members = sq.members.filter(p => p.state === 'held');
    world.events.push('broken', { squad: sq.id, unit: sq.type, num: sq.num });
    world.stats.broken++;
  }

  function fleeSquad(world, sq, fx, fz, loss, reason) {
    if (sq.side !== 'protest' || sq.broken) return;
    const B = world.BAL.people;
    hitMorale(world, sq, loss, fx, fz);
    if (sq.broken) return;
    const c = centroid(sq);
    let dx = c.x - fx, dz = c.z - fz;
    let d = Math.sqrt(dx * dx + dz * dz);
    if (d < 0.01) { dx = 0; dz = 1; d = 1; }
    let tx = c.x + dx / d * B.fleeDist, tz = c.z + dz / d * B.fleeDist;
    const m = world.map;
    if (m.isRoad(tx, tz)) { const s = m.nearestSidewalk(tx, tz); tx = s.x; tz = s.z; }
    const w = world.nav.foot.nearestWalkable(tx, tz);
    sq.flee = { x: w.x, z: w.z };
    sq.fleeT = B.fleeTime;
    sq.stance = 'stand';
    sq.moving = false;
    for (const p of sq.members) if (p.state === 'free') p.sit = 0;
    world.events.push('flee', { squad: sq.id, x: c.x, z: c.z, reason });
  }

  // אחרי פינוי חוזרים לעמדה — ואם העמדה על הכביש, יורדים למדרכה הקרובה
  // (שוטרים שעומדים על הכביש עוצרים גם הם את התנועה)
  function returnToGuard(world, sq) {
    let g = sq.guard;
    if (!g || world.map.isRoad(g.x, g.z)) {
      const c = centroid(sq);
      const s2 = world.map.nearestSidewalk(c.x, c.z);
      g = world.nav.foot.nearestWalkable(s2.x, s2.z);
      sq.guard = { x: g.x, z: g.z };
    }
    setGoal(world, sq, g.x, g.z, null);
  }

  // ---------- שוטרים: בחירת מטרות ----------
  function updatePatrolSquad(world, sq) {
    let tgt = sq.target ? world.squadById(sq.target) : null;
    const R = world.BAL.police.autoEngage;
    if (sq.target && (!tgt || tgt.broken || !tgt.members.length)) {
      sq.target = null; sq.mode = 'idle'; sq.auto = false;
      returnToGuard(world, sq);
    }
    if (!sq.target) {
      // שוטרים במנוחה עוצרים מפגינים שחוסמים קרוב אליהם
      if (sq.moving || !sq.members.length || !sq.members.every(c => c.state === 'free')) return;
      const g = sq.guard || centroid(sq);
      let best = null, bd = R * R;
      for (const o of world.squads) {
        if (o.side !== 'protest' || o.broken || !o.members.length || o.fleeT > 0) continue;
        let onRoad = false;
        for (const p of o.members) if (world.map.isRoad(p.x, p.z)) { onRoad = true; break; }
        if (!onRoad) continue;
        const c = centroid(o);
        const d = U.dist2(c.x, c.z, g.x, g.z);
        if (d < bd) { bd = d; best = o; }
      }
      if (!best) return;
      sq.target = best.id; sq.mode = 'arrest'; sq.auto = true;
      tgt = best;
      world.events.push('autoEngage', { squad: sq.id, target: best.id });
    }
    // חוליה שיצאה למעצר אוטומטי לא נגררת רחוק מהעמדה שלה
    if (sq.auto && sq.guard) {
      const tc = centroid(tgt);
      if (U.dist(tc.x, tc.z, sq.guard.x, sq.guard.z) > R + 10 && !sq.members.some(c => c.state === 'drag' || c.state === 'grab')) {
        sq.target = null; sq.auto = false; sq.mode = 'idle';
        for (const c of sq.members) if (c.state === 'seek') { dropVictim(c); c.state = 'free'; }
        returnToGuard(world, sq);
        return;
      }
    }
    // מתקרבים לחוליית המטרה
    const tc = centroid(tgt);
    if (U.dist(sq.goal.x, sq.goal.z, tc.x, tc.z) > 6) setGoal(world, sq, tc.x, tc.z, null);
    for (const cop of sq.members) {
      if (cop.state !== 'free') continue;
      // חיפוש קורבן פנוי
      let best = null, bd = 1e9;
      for (const v of tgt.members) {
        if (v.state !== 'free' && v.state !== 'held') continue;
        const need = grabNeed(world, v);
        if (v.claims.length >= need) continue;
        const d = U.dist2(cop.x, cop.z, v.x, v.z);
        if (d < bd) { bd = d; best = v; }
      }
      if (best) {
        cop.victim = best; best.claims.push(cop);
        cop.state = 'seek'; cop.path = null;
      }
    }
  }

  // ---------- פרשים ----------
  function updateHorseSquad(world, sq, dt) {
    const H = world.BAL.police.horses;
    sq.modeT -= dt;
    if (sq.mode === 'regroup' && sq.modeT <= 0) {
      sq.mode = 'idle';
      const c = centroid(sq);
      if (world.map.isRoad(c.x, c.z)) returnToGuard(world, sq);
    }
    if (sq.mode === 'charge') {
      const tgt = world.squadById(sq.target);
      if (!tgt || tgt.broken || !tgt.members.length || tgt.fleeT > 0) {
        sq.mode = 'regroup'; sq.modeT = 2; sq.target = null;
        const c = centroid(sq); setGoal(world, sq, c.x, c.z, null);
        return;
      }
      const tc = centroid(tgt);
      if (U.dist(sq.goal.x, sq.goal.z, tc.x, tc.z) > 3) setGoal(world, sq, tc.x, tc.z, null);
      // מגע עם חוליות מפגינים
      for (const o of world.squads) {
        if (o.side !== 'protest' || o.broken || o.fleeT > 0 || !o.members.length) continue;
        let md = 1e9, mx = 0, mz = 0;
        for (const r of sq.members) for (const p of o.members) {
          if (p.state !== 'free' && p.state !== 'held') continue;
          const d = U.dist(r.x, r.z, p.x, p.z);
          if (d < md) { md = d; mx = r.x; mz = r.z; }
        }
        if (squadSitting(o)) {
          if (md < H.sitStop + 1.2) {
            // סוסים לא דורכים על יושבים — עוצרים. והצילום מגיע לחדשות.
            if (world.t - o.lastScandal > 30) {
              o.lastScandal = world.t;
              world.addHeadline(world.BAL.headline.horseOnSitters, 'horseScandal', mx, mz);
            }
            const c = centroid(sq);
            const tc2 = centroid(o);
            const dx = c.x - tc2.x, dz = c.z - tc2.z, dl = Math.max(0.1, Math.sqrt(dx * dx + dz * dz));
            setGoal(world, sq, c.x + dx / dl * 7, c.z + dz / dl * 7, null);
            sq.mode = 'regroup'; sq.modeT = H.cooldown; sq.target = null;
            world.events.push('horsesHalt', { x: mx, z: mz });
            return;
          }
        } else if (md < H.scatterR) {
          fleeSquad(world, o, mx, mz, world.BAL.protest.morale.horses, 'horses');
          if (o.id === sq.target) {
            sq.mode = 'regroup'; sq.modeT = H.cooldown; sq.target = null;
            const c = centroid(sq); setGoal(world, sq, c.x, c.z, null);
          }
        }
      }
    }
    // שומרים על הסוסים בשטח: רוכבים עוצרים כשאין פקודה
  }

  // ---------- מכת"זית ----------
  function vehicleGo(world, sq, x, z) {
    const V = sq.vehicle, grid = world.nav.car;
    const t = grid.isWalkable(x, z) ? { x, z } : grid.nearestWalkable(x, z);
    V.path = grid.path(V.x, V.z, t.x, t.z);
    V.pathI = 0;
    V.dest = t;
    if (V.state !== 'refill' && V.state !== 'return') V.state = 'drive';
  }

  function cannonFirePoint(world, sq, tgt) {
    const V = sq.vehicle, tc = centroid(tgt), grid = world.nav.car;
    let dx = V.x - tc.x, dz = V.z - tc.z;
    let d = Math.sqrt(dx * dx + dz * dz);
    if (d < 0.1) { dx = 1; dz = 0; d = 1; }
    const want = 10;
    for (let k = 0; k < 8; k++) {
      const a = Math.atan2(dz, dx) + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * 0.45;
      const px = tc.x + Math.cos(a) * want, pz = tc.z + Math.sin(a) * want;
      if (grid.isWalkable(px, pz)) return { x: px, z: pz };
    }
    return grid.nearestWalkable(tc.x + dx / d * want, tc.z + dz / d * want);
  }

  function driveVehicle(world, V, speed, dt) {
    if (!V.path || V.pathI >= V.path.length) { V.v = U.approach(V.v, 0, 6 * dt); return true; }
    const w = V.path[V.pathI];
    const dx = w.x - V.x, dz = w.z - V.z, d = Math.sqrt(dx * dx + dz * dz);
    const last = V.pathI === V.path.length - 1;
    if (d < (last ? 0.8 : 2.0)) { V.pathI++; return V.pathI >= V.path.length; }
    const want = Math.atan2(dx, dz);
    V.heading = U.turnToward(V.heading, want, 1.6 * dt);
    const align = Math.cos(U.wrapAngle(want - V.heading));
    const target = speed * Math.max(0.15, align) * (last ? Math.min(1, d / 6) : 1);
    V.v = U.approach(V.v, target, 4 * dt);
    // לא דורסים: עוצרים אם יש אדם ממש מקדימה
    const fx = V.x + Math.sin(V.heading) * 4.2, fz = V.z + Math.cos(V.heading) * 4.2;
    for (const q of world.neighbors(fx, fz, 2.4)) {
      if (q.state === 'carried' || q.state === 'detained' || q.side === 'police') continue;   // שוטרים זזים הצידה
      if (U.dist2(q.x, q.z, fx, fz) < 2.4 * 2.4) { V.v = Math.min(V.v, 0); break; }
    }
    // רכב אזרחי ממש מקדימה — מאטים (המכוניות מפנות דרך לאט)
    if (world.carAt(fx, fz, 0.6)) V.v = Math.min(V.v, 0.8);
    V.x += Math.sin(V.heading) * V.v * dt;
    V.z += Math.cos(V.heading) * V.v * dt;
    return false;
  }

  function updateCannon(world, sq, dt) {
    const V = sq.vehicle, C = world.BAL.police.cannon;
    V.px = V.x; V.pz = V.z;
    V.spray = false;
    const base = world.map.bases.police;
    switch (V.state) {
      case 'ready':
      case 'idle':
        V.v = 0;
        // מכת"זית שעומדת בלי משימה על הכביש — חוזרת לתחנה (ולא חוסמת את התנועה)
        if (!sq.target && world.map.isRoad(V.x, V.z)) {
          V.idleT = (V.idleT || 0) + dt;
          if (V.idleT > 6) { V.idleT = 0; vehicleGo(world, sq, base.x, base.z); V.state = 'return'; }
        } else V.idleT = 0;
        if (sq.target) {
          const tgt = world.squadById(sq.target);
          if (tgt && tgt.members.length && !tgt.broken) { V.fire = cannonFirePoint(world, sq, tgt); vehicleGo(world, sq, V.fire.x, V.fire.z); V.state = 'drive'; }
          else sq.target = null;
        }
        break;
      case 'drive': {
        const tgt = sq.target ? world.squadById(sq.target) : null;
        const arrived = driveVehicle(world, V, C.speed, dt);
        if (tgt && tgt.members.length) {
          const tc = centroid(tgt);
          const d = U.dist(V.x, V.z, tc.x, tc.z);
          if (d < C.range - 2 && (arrived || d < 11)) { V.state = 'spray'; V.v = 0; }
          else if (arrived) { V.fire = cannonFirePoint(world, sq, tgt); vehicleGo(world, sq, V.fire.x, V.fire.z); }
        } else if (arrived) { V.state = 'idle'; sq.target = null; }
        break;
      }
      case 'spray': {
        V.v = 0;
        let tgt = sq.target ? world.squadById(sq.target) : null;
        if (!tgt || tgt.broken || !tgt.members.length || tgt.fleeT > 0) {
          // מחפשים מטרה קרובה אחרת על הכביש
          tgt = null; sq.target = null;
          let bd = (C.range + 4) * (C.range + 4);
          for (const o of world.squads) {
            if (o.side !== 'protest' || o.broken || o.fleeT > 0 || !o.members.length) continue;
            const c = centroid(o);
            if (!world.map.isRoad(c.x, c.z)) continue;
            const d = U.dist2(V.x, V.z, c.x, c.z);
            if (d < bd) { bd = d; tgt = o; }
          }
          if (tgt) sq.target = tgt.id; else { V.state = 'idle'; break; }
        }
        const tc = centroid(tgt);
        const d = U.dist(V.x, V.z, tc.x, tc.z);
        if (d > C.range) { V.state = 'drive'; V.fire = cannonFirePoint(world, sq, tgt); vehicleGo(world, sq, V.fire.x, V.fire.z); V.state = 'drive'; break; }
        const want = Math.atan2(tc.x - V.x, tc.z - V.z);
        V.aim = U.turnToward(V.aim === undefined ? V.heading : V.aim, want, 1.5 * dt);
        if (Math.abs(U.wrapAngle(V.aim - want)) < 0.5) {
          V.spray = true;
          V.tank -= dt;
          const nx = V.x + Math.sin(V.heading) * 1.5, nz = V.z + Math.cos(V.heading) * 1.5;
          for (const o of world.squads) {
            if (o.side !== 'protest' || o.broken || o.fleeT > 0) continue;
            let hit = 0;
            for (const p of o.members) {
              if (p.state !== 'free' && p.state !== 'held') continue;
              const ex = p.x - nx, ez = p.z - nz, el = Math.sqrt(ex * ex + ez * ez);
              if (el > C.range) continue;
              if (Math.abs(U.wrapAngle(Math.atan2(ex, ez) - V.aim)) < C.halfAngle) { p.wet += dt; hit++; }
            }
            if (hit) {
              let wetN = 0;
              for (const p of o.members) if (p.wet > C.wetToFlee) wetN++;
              if (wetN * 2 >= o.members.length) {
                for (const p of o.members) p.wet = 0;
                fleeSquad(world, o, V.x, V.z, world.BAL.protest.morale.water, 'water');
                world.stats.soaked++;
              }
            }
          }
        }
        if (V.tank <= 0) {
          V.tank = 0; V.state = 'return'; sq.target = null;
          vehicleGo(world, sq, base.x, base.z);
          V.state = 'return';
          world.events.push('cannonEmpty', { x: V.x, z: V.z });
        }
        break;
      }
      case 'return': {
        if (driveVehicle(world, V, C.speed, dt)) { V.state = 'refill'; V.refillT = C.refill; }
        break;
      }
      case 'refill': {
        V.v = 0;
        V.refillT -= dt;
        V.tank = Math.min(C.tank, V.tank + C.tank / C.refill * dt);
        if (V.refillT <= 0) { V.tank = C.tank; V.state = 'ready'; world.events.push('cannonReady', {}); }
        break;
      }
    }
    // מים מתייבשים לאט
  }

  // ---------- עסקן ושופר ----------
  function usePermit(world, sq) {
    const P = world.BAL.protest.permit;
    if (sq.type !== 'askan' || sq.broken || !sq.members.length || (sq.cd.permit || 0) > 0) return { ok: false, reason: 'cooldown' };
    const a = sq.members[0];
    if (a.state !== 'free') return { ok: false, reason: 'busy' };
    let best = null, bd = P.range * P.range;
    for (const o of world.squads) {
      if (o.side !== 'police' || o.type !== 'patrol') continue;
      for (const c of o.members) {
        if (c.state === 'drag') continue;
        const d = U.dist2(a.x, a.z, c.x, c.z);
        if (d < bd) { bd = d; best = o; }
      }
    }
    if (!best) return { ok: false, reason: 'noTarget' };
    sq.cd.permit = P.cooldown;
    for (const c of best.members) {
      if (c.state === 'drag') continue;
      dropVictim(c);
      c.state = 'stalled'; c.stallT = P.stall; c.vx = c.vz = 0;
    }
    world.events.push('permit', { x: a.x, z: a.z, squad: sq.id, police: best.id });
    world.stats.permits++;
    return { ok: true };
  }

  function useShofar(world) {
    const S = world.BAL.protest.shofar;
    if (world.shofarCD > 0 || world.t < S.firstAt) return { ok: false, reason: 'cooldown' };
    world.shofarCD = S.cooldown;
    for (const sq of world.squads) {
      if (sq.side !== 'protest' || sq.broken) continue;
      sq.morale = Math.min(100, sq.morale + S.morale);
      if (sq.fleeT > 0) sq.fleeT = 0.01;
    }
    for (const c of world.people) {
      if (c.side !== 'police' || c.kind !== 'cop') continue;
      if (c.state === 'drag' || c.state === 'carried') continue;
      let near = false;
      for (const q of world.neighbors(c.x, c.z, S.stunRange)) { if (q.side === 'protest' && ON_STREET[q.state]) { near = true; break; } }
      if (near) { dropVictim(c); c.state = 'stunned'; c.stallT = S.stun; }
    }
    world.events.push('shofar', {});
    return { ok: true };
  }

  HM.Units = {
    KIND, ON_STREET, makeSquad, makePerson, centroid, setGoal, refreshSlots, updateSquad, updatePerson,
    updateGrabs, updatePatrolSquad, updateHorseSquad, updateVan, deliverToVan, fleeSquad, hitMorale,
    breakSquad, usePermit, useShofar, squadSitting, isSitting, lineAxisAt, formationWidth, computeSlots,
    dropVictim, vehicleGo, returnToGuard, centroidOf: centroid
  };
})(typeof window !== 'undefined' ? window : globalThis);
