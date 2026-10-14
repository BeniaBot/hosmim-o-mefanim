/* המשטרה הממוחשבת (כשהשחקן משחק מפגינים).
   משתמשת בדיוק באותן פקודות שהשחקן משתמש בהן: קנייה, יעד, תזוזה. */
(function (root) {
  'use strict';
  const HM = root.HM || (root.HM = {});
  const U = HM.U;

  class PoliceAI {
    constructor(world, difficulty) {
      this.w = world;
      this.cfg = world.BAL.policeAI[difficulty] || world.BAL.policeAI.normal;
      this.incomeMul = this.cfg.incomeMul;
      this.thinkT = 1;
      this.sitSince = new Map();
    }

    update(dt) {
      this.thinkT -= dt;
      if (this.thinkT > 0) return;
      this.thinkT = this.cfg.think;
      this.think();
    }

    threats() {
      const w = this.w, Un = HM.Units, out = [];
      for (const sq of w.squads) {
        if (sq.side !== 'protest' || sq.broken || !sq.members.length) continue;
        let onRoad = 0;
        for (const p of sq.members) if ((p.state === 'free' || p.state === 'held') && w.map.isRoad(p.x, p.z)) onRoad++;
        const c = Un.centroid(sq);
        const sitting = Un.squadSitting(sq);
        if (sitting) { if (!this.sitSince.has(sq.id)) this.sitSince.set(sq.id, w.t); }
        else this.sitSince.delete(sq.id);
        if (!onRoad || sq.fleeT > 0) continue;
        const inBox = !!w.map.junctionAt(c.x, c.z);
        out.push({ sq, c, onRoad, sitting, n: sq.members.length, value: onRoad * (inBox ? 1.6 : 1) + (sq.type === 'askan' ? 0.5 : 0),
                   sitDur: sitting ? w.t - this.sitSince.get(sq.id) : 0 });
      }
      out.sort((a, b) => b.value - a.value);
      return out;
    }

    mine(type) { return this.w.squads.filter(s => s.side === 'police' && s.type === type); }

    think() {
      const w = this.w, cfg = this.cfg, t = w.t, Un = HM.Units;
      const th = this.threats();
      const patrols = this.mine('patrol').concat(this.mine('riot'));
      const nPatrol = w.unitCount('police', 'patrol');
      // ---- קניות ----
      // חוסכים לכלי הכבד כשהגיע זמנו (אחרת כל הכסף הולך על עוד שוטרים)
      const P = w.BAL.police;
      let reserve = 0;
      const wantCannon = t >= cfg.cannonAt && w.unitCount('police', 'cannon') === 0 &&
        th.some(x => x.sitting && x.n >= 3 && x.sitDur > 10);
      const wantHorses = t >= cfg.horsesAt && w.unitCount('police', 'horses') === 0 &&
        th.some(x => !x.sitting && x.n >= 3) && nPatrol >= 1;
      if (wantCannon) { if (!w.cmd('police', { type: 'buy', unit: 'cannon' }).ok) reserve = P.cannon.cost; }
      if (wantHorses) { if (!w.cmd('police', { type: 'buy', unit: 'horses' }).ok) reserve = Math.max(reserve, P.horses.cost); }
      if (t >= cfg.patrolAt && th.length && nPatrol < Math.min(cfg.maxPatrols, th.length + 1) &&
          (nPatrol < 2 || w.money.police - P.patrol.cost >= reserve)) {
        w.cmd('police', { type: 'buy', unit: 'patrol' });
      }
      // יס"מ כשההפגנה גדולה; קצין קישור כשיש עסקן
      if (t >= cfg.horsesAt && th.length >= 3 && w.money.police - P.riot.cost >= reserve + 150) w.cmd('police', { type: 'buy', unit: 'riot' });
      if (t >= cfg.patrolAt + 40 && w.squads.some(s => s.type === 'askan' && s.members.length) && w.money.police - P.officer.cost >= reserve) w.cmd('police', { type: 'buy', unit: 'officer' });
      for (const o of this.mine('officer')) {
        if (o.target && w.squadById(o.target)) continue;
        const ask = w.squads.find(s => s.type === 'askan' && s.members.length && !s.broken);
        const tg = ask || (th[0] && th[0].sq);
        if (tg) w.cmd('police', { type: 'target', squads: [o.id], target: tg.id });
      }

      // ---- שוטרים ----
      const load = new Map();
      for (const p of patrols) if (p.target) load.set(p.target, (load.get(p.target) || 0) + 1);
      for (const p of patrols) {
        const cur = p.target ? w.squadById(p.target) : null;
        const busy = p.members.some(c => c.state === 'drag' || c.state === 'grab');
        if (cur && !cur.broken && cur.members.length && (busy || th.some(x => x.sq === cur))) continue;
        if (p.target) { load.set(p.target, (load.get(p.target) || 1) - 1); p.target = null; }
        const pc = Un.centroid(p);
        let best = null, bs = -1e9;
        for (const x of th) {
          const l = load.get(x.sq.id) || 0;
          if (l >= 2) continue;
          const d = U.dist(pc.x, pc.z, x.c.x, x.c.z);
          const s = x.value * 2 - d / 15 - l * 4 - (x.sitting ? 1.5 : 0);
          if (s > bs) { bs = s; best = x; }
        }
        if (best) {
          w.cmd('police', { type: 'target', squads: [p.id], target: best.sq.id });
          load.set(best.sq.id, (load.get(best.sq.id) || 0) + 1);
        } else if (!p.moving && !th.length) {
          // אין מה לפנות — עומדים על המדרכה ליד הצומת
          const b = w.map.bases.police.rally;
          if (U.dist(pc.x, pc.z, b.x, b.z) > 12 && p.members.every(c => c.state === 'free')) {
            w.cmd('police', { type: 'move', squads: [p.id], x: b.x, z: b.z });
          }
        }
      }

      // ---- פרשים ----
      for (const h of this.mine('horses')) {
        if (h.mode === 'charge' || (h.mode === 'regroup' && h.modeT > 0)) continue;
        const hc = Un.centroid(h);
        let best = null, bd = 1e9;
        for (const x of th) {
          if (x.sitting || x.n < 2) continue;
          const d = U.dist(hc.x, hc.z, x.c.x, x.c.z);
          if (d < bd) { bd = d; best = x; }
        }
        if (best) w.cmd('police', { type: 'target', squads: [h.id], target: best.sq.id });
      }

      // ---- כריזה: על קבוצה גדולה של עומדים ----
      if (w.megaCD <= 0 && t >= w.BAL.police.megaphone.firstAt) {
        const Mg = w.BAL.police.megaphone;
        let best = null, bn = 1;
        for (const x of th) {
          if (x.sitting) continue;
          let n = 0;
          for (const y of th) if (!y.sitting && U.dist(x.c.x, x.c.z, y.c.x, y.c.z) < Mg.range * 0.8) n += y.n;
          if (n > bn) { bn = n; best = x; }
        }
        if (best && bn >= 6) w.cmd('police', { type: 'megaphone', x: best.c.x, z: best.c.z });
      }

      // ---- מכת"זית ----
      for (const c of this.mine('cannon')) {
        const V = c.vehicle;
        if (V.state !== 'ready' && V.state !== 'idle') continue;
        let best = null, bs = -1;
        for (const x of th) {
          const s = x.n * (x.sitting ? 2 : 1) + x.onRoad;
          if (s > bs) { bs = s; best = x; }
        }
        if (best && (best.sitting || best.n >= 4)) w.cmd('police', { type: 'target', squads: [c.id], target: best.sq.id });
      }
    }
  }

  HM.PoliceAI = PoliceAI;
})(typeof window !== 'undefined' ? window : globalThis);
