/* העולם: מחזיק את כל המצב, מריץ צעד סימולציה, מקבל פקודות משני הצדדים,
   ומחליט מי ניצח. אין כאן שום ציור — רץ גם ב-Node. */
(function (root) {
  'use strict';
  const HM = root.HM || (root.HM = {});
  const U = HM.U;

  class World {
    constructor(opts) {
      opts = opts || {};
      this.BAL = opts.BAL || HM.BAL;
      this.rng = new HM.Rng(opts.seed || 12345);
      this.map = HM.buildMap(opts.map || 'barilan', this.BAL);
      this.nav = HM.buildNav(this.map);
      this.difficulty = opts.difficulty || 'normal';
      this.ctl = { protest: opts.protest || 'human', police: opts.police || 'ai' };
      this.events = new HM.EventQueue();
      this.t = 0;
      this.sunset = opts.sunset || this.map.sunset;
      this.H = 0;
      this.Hpeak = 0;
      this.Hrate = 0;
      this.nextId = 1;
      this.squadNum = { protest: 0, police: 0 };
      this.squads = [];
      this.people = [];
      this.pending = [];                 // כוחות משטרה בדרך
      const M = this.BAL.money;
      this.money = { protest: M.protest.start, police: M.police.start };
      this.income = { protest: 0, police: 0 };
      this.shofarCD = 0;
      this.megaCD = 0;
      this.outcome = null;
      this.emptyT = 0;
      this.stats = { dragged: 0, removed: 0, broken: 0, soaked: 0, permits: 0, nearMiss: 0, jamPeak: 0, scandals: 0, bought: { protest: 0, police: 0 } };
      const vb = this.map.bases.van;
      this.van = { x: vb.x, z: vb.z, state: 'here', list: [], awayT: 0 };
      this.hash = new Map();
      this.traffic = new HM.Traffic(this);
      this.ai = {};
      if (this.ctl.police === 'ai' && HM.PoliceAI) this.ai.police = new HM.PoliceAI(this, opts.policeDifficulty || this.difficulty);
      if (this.ctl.protest === 'ai' && HM.ProtestAI) this.ai.protest = new HM.ProtestAI(this, opts.protestDifficulty || this.difficulty);
      this.setupStart(opts);
    }

    setupStart(opts) {
      if (opts.empty) return;
      const b = this.map.bases.protest;
      // הכוח הפותח של המפגינים — יוצא מחצר הישיבה
      const start = opts.protestStart || ['bochurim', 'bochurim', 'avrechim', 'askan'];
      start.forEach((t, i) => {
        const sq = HM.Units.makeSquad(this, 'protest', t, b.x + (i % 2) * 6 - 3, b.z + Math.floor(i / 2) * 5 - 2);
        const r = b.rally;
        HM.Units.setGoal(this, sq, r.x + (i - (start.length - 1) / 2) * 5, r.z - (i % 2) * 3, null);
      });
      const pstart = opts.policeStart || (this.ctl.police === 'human' ? this.BAL.police.humanStart : null);
      if (pstart) {
        const pb = this.map.bases.police;
        pstart.forEach((t, i) => {
          const sq = HM.Units.makeSquad(this, 'police', t, pb.x + i * 5, pb.z);
          const gx = pb.rally.x + (i - (pstart.length - 1) / 2) * 7, gz = pb.rally.z;
          HM.Units.setGoal(this, sq, gx, gz, null);
          sq.guard = { x: gx, z: gz };
        });
      }
    }

    squadById(id) { for (const s of this.squads) if (s.id === id) return s; return null; }

    // ---- רשת מרחבית לשכנים ----
    rebuildHash() {
      const h = this.hash; h.clear();
      for (const p of this.people) {
        if (p.state === 'detained' || p.state === 'gone') continue;
        const k = ((Math.floor(p.x / 3) + 512) << 10) | (Math.floor(p.z / 3) + 512);
        let a = h.get(k); if (!a) { a = []; h.set(k, a); }
        a.push(p);
      }
    }
    neighbors(x, z, r) {
      const out = [];
      const i0 = Math.floor((x - r) / 3), i1 = Math.floor((x + r) / 3);
      const j0 = Math.floor((z - r) / 3), j1 = Math.floor((z + r) / 3);
      for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
        const a = this.hash.get(((i + 512) << 10) | (j + 512));
        if (a) for (const p of a) out.push(p);
      }
      return out;
    }

    // מכשולים לתנועה: כל מי שעומד על הכביש
    trafficObstacles() {
      const out = [];
      for (const p of this.people) {
        if (p.state === 'detained' || p.state === 'gone' || p.state === 'carried') continue;
        // מי שעל הכביש, או ממש על שפתו (עלול להפריע לנתיב החיצוני)
        if (!this.map.isRoad(p.x, p.z) && !this.nearRoad(p.x, p.z, p.r + 0.2)) continue;
        out.push({ x: p.x, z: p.z, r: p.r + 0.2, kind: p.side === 'protest' ? 'protester' : 'police', person: p.side === 'protest', ref: p });
      }
      for (const sq of this.squads) {
        if (!sq.vehicle) continue;
        const V = sq.vehicle;
        for (let k = -1; k <= 1; k++) {
          out.push({ x: V.x + Math.sin(V.heading) * k * 2.6, z: V.z + Math.cos(V.heading) * k * 2.6, r: 1.6, kind: 'police', person: false, ref: null });
        }
      }
      return out;
    }
    // האם הנקודה בתוך גוף של מכונית (לאנשים: לא עוברים דרך רכבים)
    carAt(x, z, r) {
      const laneW = this.BAL.traffic.laneW;
      for (const lane of this.traffic.lanes) {
        const L = lane.L;
        const perp = L.axis === 'x' ? z : x;
        if (Math.abs(perp - L.off) > laneW / 2 + r) continue;
        const d = this.map.laneD(L, x, z);
        for (const c of lane.cars) {
          if (d < c.d + r && d > c.d - c.len - r && Math.abs(perp - L.off) < c.wid / 2 + r) return c;
        }
      }
      return null;
    }
    nearRoad(x, z, d) {
      return this.map.isRoad(x + d, z) || this.map.isRoad(x - d, z) || this.map.isRoad(x, z + d) || this.map.isRoad(x, z - d);
    }

    onNearMiss(person, car) {
      if (!person) return;
      this.stats.nearMiss++;
      this.events.push('nearMiss', { x: person.x, z: person.z, id: person.id, side: person.side });
      if (person.side === 'protest') {
        HM.Units.hitMorale(this, person.squad, this.BAL.protest.morale.nearMiss, person.x, person.z);
        person.scare = 1.2;
      }
    }

    addHeadline(amount, reason, x, z) {
      this.H = U.clamp(this.H + amount, 0, 100);
      this.Hpeak = Math.max(this.Hpeak, this.H);
      this.stats.scandals += (reason === 'horseScandal' || reason === 'askanArrest') ? 1 : 0;
      this.events.push('headline', { amount, reason, x, z });
      if (this.H >= 100 && !this.outcome) this.finish('protest', 'headlines');
    }

    moraleAround(x, z, r, delta) {
      for (const sq of this.squads) {
        if (sq.side !== 'protest' || sq.broken || !sq.members.length) continue;
        const c = HM.Units.centroid(sq);
        if (U.dist(x, z, c.x, c.z) < r) {
          if (delta < 0) HM.Units.hitMorale(this, sq, -delta, x, z);
          else sq.morale = Math.min(sq.maxMorale, sq.morale + delta);
        }
      }
    }

    // האם הנקודה בטווח ההשפעה של עסקן
    auraAt(x, z) {
      const R = this.BAL.protest.aura.range;
      for (const sq of this.squads) {
        if (sq.type !== 'askan' || sq.broken || !sq.members.length) continue;
        const a = sq.members[0];
        if (a.state === 'free' && U.dist2(a.x, a.z, x, z) < R * R) return true;
      }
      return false;
    }

    // ---- פקודות (שחקן או מחשב — אותו ממשק) ----
    cmd(side, c) {
      if (this.outcome) return { ok: false, reason: 'over' };
      const U2 = HM.Units;
      switch (c.type) {
        case 'buy': return this.buy(side, c.unit);
        case 'move': {
          const sqs = (c.squads || []).map(id => this.squadById(id)).filter(s => s && s.side === side && !s.broken && (s.members.length || s.vehicle));
          if (!sqs.length) return { ok: false, reason: 'noSquads' };
          this.groupMove(sqs, c.x, c.z);
          return { ok: true };
        }
        case 'stance': {
          let n = 0;
          for (const id of c.squads || []) {
            const s = this.squadById(id);
            if (!s || s.side !== 'protest' || side !== 'protest' || s.broken || s.fleeT > 0) continue;
            if (s.type === 'askan') continue;
            s.stance = c.stance === 'sit' ? 'sit' : 'stand';
            if (s.stance === 'sit' && s.moving) {
              // מתיישבים במקום שבו הם נמצאים עכשיו
              const ce = U2.centroid(s); U2.setGoal(this, s, ce.x, ce.z); s.stance = 'sit';
            }
            n++;
          }
          return { ok: n > 0 };
        }
        case 'permit': {
          const s = this.squadById(c.squad);
          if (!s || s.side !== side) return { ok: false };
          return U2.usePermit(this, s);
        }
        case 'shofar':
          if (side !== 'protest') return { ok: false };
          return U2.useShofar(this);
        case 'megaphone': {
          if (side !== 'police') return { ok: false };
          const Mg = this.BAL.police.megaphone;
          if (this.megaCD > 0 || this.t < Mg.firstAt) return { ok: false, reason: 'cooldown' };
          this.megaCD = Mg.cooldown;
          let n = 0;
          for (const sq of this.squads) {
            if (sq.side !== 'protest' || sq.broken || !sq.members.length) continue;
            const ce = U2.centroid(sq);
            if (U.dist(ce.x, ce.z, c.x, c.z) > Mg.range) continue;
            n++;
            U2.hitMorale(this, sq, Mg.morale, c.x, c.z);
            if (!sq.broken && !U2.squadSitting(sq) && sq.morale < Mg.fleeBelow) U2.fleeSquad(this, sq, c.x, c.z, 0, 'megaphone');
          }
          this.events.push('megaphone', { x: c.x, z: c.z, n });
          return { ok: true, n };
        }
        case 'target': {
          const tgt = this.squadById(c.target);
          if (!tgt || tgt.side === side || tgt.broken) return { ok: false, reason: 'noTarget' };
          let n = 0;
          for (const id of c.squads || []) {
            const s = this.squadById(id);
            if (!s || s.side !== side || side !== 'police') continue;
            if (s.type === 'patrol') {
              s.target = tgt.id; s.mode = 'arrest'; s.auto = false;
              for (const cop of s.members) if (cop.state === 'seek') { U2.dropVictim(cop); cop.state = 'free'; }
              const tc = U2.centroid(tgt); U2.setGoal(this, s, tc.x, tc.z, null);
              n++;
            } else if (s.type === 'horses') {
              if (s.mode === 'regroup' && s.modeT > 0) continue;
              s.target = tgt.id; s.mode = 'charge';
              const tc = U2.centroid(tgt); U2.setGoal(this, s, tc.x, tc.z, null);
              n++;
            } else if (s.type === 'cannon') {
              const V = s.vehicle;
              if (V.state === 'return' || V.state === 'refill') continue;
              s.target = tgt.id;
              V.state = 'idle';
              n++;
            }
          }
          return { ok: n > 0 };
        }
      }
      return { ok: false, reason: 'unknown' };
    }

    groupMove(sqs, x, z) {
      const U2 = HM.Units;
      const axis = U2.lineAxisAt(this, x, z);
      // פורסים כמה חוליות זו לצד זו לאורך אותו קו
      const widths = sqs.map(s => U2.formationWidth(this, s, axis) + 0.6);
      const total = widths.reduce((a, b) => a + b, 0);
      let off = -total / 2;
      sqs.forEach((s, i) => {
        const o = off + widths[i] / 2;
        off += widths[i];
        let gx = x, gz = z;
        if (sqs.length > 1) {
          if (axis === 'z') gz += o; else gx += o;
        }
        if (s.vehicle) {
          const V = s.vehicle;
          if (V.state === 'return' || V.state === 'refill') return;
          s.target = null;
          U2.vehicleGo(this, s, gx, gz);
          return;
        }
        if (s.side === 'police') {
          s.target = null; s.mode = 'idle'; s.auto = false;
          for (const c of s.members) if (c.state === 'seek' || c.state === 'grab') { U2.dropVictim(c); c.state = 'free'; }
          s.guard = { x: gx, z: gz };
        }
        U2.setGoal(this, s, gx, gz, s.side === 'police' ? null : axis);
      });
    }

    unitCount(side, type) {
      let n = this.squads.filter(s => s.side === side && s.type === type && !s.broken && (s.members.length || s.vehicle)).length;
      n += this.pending.filter(p => p.side === side && p.type === type).length;
      return n;
    }

    canBuy(side, type) {
      const cfg = side === 'protest' ? this.BAL.protest[type] : this.BAL.police[type];
      if (!cfg || !cfg.cost) return { ok: false, reason: 'unknown' };
      if (this.money[side] < cfg.cost) return { ok: false, reason: 'money' };
      if (cfg.max && this.unitCount(side, type) >= cfg.max) return { ok: false, reason: 'max' };
      return { ok: true, cost: cfg.cost };
    }

    buy(side, type) {
      const can = this.canBuy(side, type);
      if (!can.ok) return can;
      this.money[side] -= can.cost;
      this.stats.bought[side]++;
      if (side === 'protest') {
        const b = this.map.bases.protest;
        const sq = HM.Units.makeSquad(this, 'protest', type, b.x, b.z);
        const k = this.squads.filter(s => s.side === 'protest').length;
        HM.Units.setGoal(this, sq, b.rally.x + ((k % 5) - 2) * 4.5, b.rally.z - (k % 2) * 3, null);
        this.events.push('arrived', { side, unit: type, squad: sq.id, x: b.x, z: b.z });
        return { ok: true, squad: sq.id };
      }
      const arm = this.BAL.police.arrivalDelay;
      this.pending.push({ side, type, at: this.t + arm });
      this.events.push('incoming', { side, unit: type, eta: arm });
      return { ok: true, eta: arm };
    }

    spawnPending() {
      for (let i = this.pending.length - 1; i >= 0; i--) {
        const p = this.pending[i];
        if (this.t < p.at) continue;
        this.pending.splice(i, 1);
        const b = this.map.bases.police;
        const sq = HM.Units.makeSquad(this, 'police', p.type, b.x, b.z);
        const k = this.squads.filter(s => s.side === 'police').length;
        if (sq.vehicle) { sq.vehicle.heading = Math.PI; }
        else {
          const gx = b.rally.x + ((k % 4) - 1.5) * 5, gz = b.rally.z;
          HM.Units.setGoal(this, sq, gx, gz, null);
          sq.guard = { x: gx, z: gz };
        }
        this.events.push('arrived', { side: 'police', unit: p.type, squad: sq.id, x: b.x, z: b.z });
      }
    }

    // ---- צעד ----
    step(dt) {
      dt = dt || this.BAL.dt;
      if (this.outcome) return;
      this.t += dt;
      const U2 = HM.Units;
      this.shofarCD = Math.max(0, this.shofarCD - dt);
      this.megaCD = Math.max(0, this.megaCD - dt);
      // כסף
      const M = this.BAL.money;
      const mulP = this.ai.police ? this.ai.police.incomeMul : 1;
      const mulR = this.ai.protest ? this.ai.protest.incomeMul : 1;
      this.income.protest = (M.protest.perSec + this.H * M.protest.perHeadline) * mulR;
      this.income.police = (M.police.perSec + this.H * M.police.perHeadline) * mulP;
      this.money.protest += this.income.protest * dt;
      this.money.police += this.income.police * dt;

      this.spawnPending();
      this.rebuildHash();
      for (const k in this.ai) this.ai[k].update(dt);

      for (const sq of this.squads) {
        if (sq.side === 'police') {
          if (sq.type === 'patrol') U2.updatePatrolSquad(this, sq);
          else if (sq.type === 'horses') U2.updateHorseSquad(this, sq, dt);
        }
        U2.updateSquad(this, sq, dt);
      }
      // עסקן — מורל לסובבים
      const A = this.BAL.protest.aura;
      for (const sq of this.squads) {
        if (sq.type !== 'askan' || sq.broken || !sq.members.length) continue;
        const a = sq.members[0];
        if (a.state !== 'free') continue;
        for (const o of this.squads) {
          if (o.side !== 'protest' || o === sq || o.broken || !o.members.length) continue;
          const c = U2.centroid(o);
          if (U.dist2(c.x, c.z, a.x, a.z) < A.range * A.range) o.morale = Math.min(o.maxMorale, o.morale + A.morale * dt);
        }
      }
      for (const p of this.people) {
        p.px = p.x; p.pz = p.z;
        if (p.scare > 0) p.scare -= dt;
        if (p.wet > 0 && p.state !== 'detained') p.wet = Math.max(0, p.wet - dt * 0.15);
        U2.updatePerson(this, p, dt);
      }
      U2.updateGrabs(this, dt);
      U2.updateVan(this, dt);
      // ניקוי
      if (this.people.some(p => p.state === 'gone')) this.people = this.people.filter(p => p.state !== 'gone');
      this.cleanupSquads();

      this.traffic.step(dt);
      this.updateHeadlines(dt);
      this.checkOutcome(dt);
    }

    cleanupSquads() {
      const alive = new Set();
      for (const p of this.people) alive.add(p.squad);
      this.squads = this.squads.filter(s => s.vehicle || alive.has(s));
    }

    updateHeadlines(dt) {
      const Hb = this.BAL.headline;
      const km = this.traffic.jamKm;
      this.stats.jamPeak = Math.max(this.stats.jamPeak, km);
      let rate;
      if (km > Hb.deadzoneKm) rate = Math.min(Hb.maxRate, Hb.perKmSec * (km - Hb.deadzoneKm));
      else rate = -Hb.decay;
      this.Hrate = rate;
      this.H = U.clamp(this.H + rate * dt, 0, 100);
      this.Hpeak = Math.max(this.Hpeak, this.H);
    }

    protestersOnStreet() {
      let n = 0;
      for (const p of this.people) if (p.side === 'protest' && HM.Units.ON_STREET[p.state]) n++;
      return n;
    }

    checkOutcome(dt) {
      const E = this.BAL.end;
      if (this.H >= 100) return this.finish('protest', 'headlines');
      if (this.t >= this.sunset) return this.finish('police', 'sunset');
      // אף מפגין ברחוב (לא כולל עצורים) לאורך זמן = ההפגנה התפזרה
      const onStreet = this.protestersOnStreet();
      const away = this.people.some(p => p.side === 'protest' && (p.state === 'carried' || p.state === 'detained'));
      if (onStreet === 0 && !(this.ai.protest && this.ai.protest.hasMore())) {
        this.emptyT += dt;
        if (this.emptyT >= E.emptyStreetT && !away) return this.finish('police', 'dispersed');
        if (this.emptyT >= E.emptyStreetT * 2) return this.finish('police', 'dispersed');
      } else this.emptyT = 0;
    }

    finish(winner, reason) {
      const E = this.BAL.end;
      let stars = 1;
      if (winner === 'protest') {
        const left = this.sunset - this.t;
        stars = left >= E.starsProtest[0] ? 3 : left >= E.starsProtest[1] ? 2 : 1;
      } else {
        stars = this.Hpeak < E.starsPolice[0] ? 3 : this.Hpeak < E.starsPolice[1] ? 2 : 1;
      }
      this.outcome = { winner, reason, stars, t: this.t };
      this.events.push('outcome', this.outcome);
    }
  }

  HM.World = World;
})(typeof window !== 'undefined' ? window : globalThis);
