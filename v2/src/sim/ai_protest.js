/* המפגינים הממוחשבים. משמש גם כ"שחקן בדיקה" אוטומטי (לכיוונון האיזון)
   וגם, בהמשך, כיריב כשהשחקן משחק משטרה. אותן פקודות כמו של שחקן אנושי. */
(function (root) {
  'use strict';
  const HM = root.HM || (root.HM = {});
  const U = HM.U;

  class ProtestAI {
    constructor(world, difficulty, opts) {
      this.w = world;
      const tiers = world.BAL.protestAI || {};
      this.cfg = tiers[difficulty] || tiers.normal || { think: 0.8, incomeMul: 1, turnout: 999, wave: 1, react: 1 };
      this.incomeMul = this.cfg.incomeMul;
      this.bought = 0;
      this.thinkT = 0.5;
      this.assign = new Map();   // squad id -> spot index
      this.opts = opts || {};
      this.spots = this.makeSpots();
      this.buyIdx = 0;
    }

    // האם להפגנה נשארו עוד משתתפים שיכולים להגיע
    hasMore() { return this.bought < (this.cfg.turnout || 0); }

    makeSpots() {
      const m = this.w.map, out = [];
      if (m.spots) return m.spots.map(s => Object.assign({}, s));
      for (const j of m.junctions) out.push({ x: j.x, z: j.z, pri: 3, cap: 2 });
      for (const k of Object.keys(m.arms)) {
        const a = m.arms[k];
        // נקודה בכניסה, כ-17 מטר מהצומת
        const j = m.junctions[0] || { x: 0, z: 0 };
        const dx = a.x - j.x, dz = a.z - j.z, d = Math.sqrt(dx * dx + dz * dz) || 1;
        out.push({ x: j.x + dx / d * 17, z: j.z + dz / d * 17, pri: 2, cap: 2 });
      }
      return out;
    }

    update(dt) {
      this.thinkT -= dt;
      if (this.thinkT > 0) return;
      this.thinkT = this.cfg.think;
      this.think();
    }

    think() {
      const w = this.w, Un = HM.Units, cfg = this.cfg;
      const mine = w.squads.filter(s => s.side === 'protest' && !s.broken && s.members.length);
      const police = w.squads.filter(s => s.side === 'police');

      // ---- קניות (בגלים: חוסכים ויוצאים כמה חוליות יחד) ----
      if (cfg.buy !== false && this.hasMore()) {
        const order = ['bochurim', 'avrechim', 'bochurim', 'askan', 'avrechim'];
        const wave = Math.max(1, cfg.wave || 1);
        if (wave === 1 || w.money.protest >= wave * 135) {
          let n = 0;
          for (let tries = 0; tries < order.length * 2 && n < wave && this.hasMore(); tries++) {
            const type = order[this.buyIdx % order.length];
            const can = w.canBuy('protest', type);
            if (can.ok) { w.cmd('protest', { type: 'buy', unit: type }); this.buyIdx++; this.bought++; n++; continue; }
            if (can.reason === 'max') { this.buyIdx++; continue; }
            break;
          }
          if (n >= 2) w.events.push('wave', { n });
        }
      }

      // ---- שופר ----
      const fleeing = mine.filter(s => s.fleeT > 0).length;
      const avgMor = mine.reduce((a, s) => a + s.morale, 0) / Math.max(1, mine.length);
      if (w.shofarCD <= 0 && w.t > w.BAL.protest.shofar.firstAt && (fleeing >= 2 || avgMor < 40)) {
        w.cmd('protest', { type: 'shofar' });
      }

      // ---- שיבוץ לנקודות חסימה ----
      const count = new Map();
      for (const [id, k] of this.assign) {
        const s = w.squadById(id);
        if (!s || s.broken || !s.members.length) { this.assign.delete(id); continue; }
        count.set(k, (count.get(k) || 0) + 1);
      }
      const askans = mine.filter(s => s.type === 'askan');
      for (const s of mine) {
        if (s.type === 'askan' || s.fleeT > 0) continue;
        // חוליה ששובצה אבל לא נמצאת בנקודה (ברחה, נדחקה) — חוזרת אליה
        if (this.assign.has(s.id) && !s.moving) {
          const sp = this.spots[this.assign.get(s.id)];
          const c0 = Un.centroid(s);
          if (U.dist(c0.x, c0.z, sp.x, sp.z) > 6) {
            if (w.rng.next() < (cfg.react === undefined ? 1 : Math.max(0.3, cfg.react))) w.cmd('protest', { type: 'move', squads: [s.id], x: sp.x, z: sp.z });
          }
        }
        if (!this.assign.has(s.id)) {
          let best = -1, bs = -1e9;
          const c = Un.centroid(s);
          this.spots.forEach((sp, k) => {
            const n = count.get(k) || 0;
            if (n >= sp.cap) return;
            const sc = sp.pri * 10 - n * 12 - U.dist(c.x, c.z, sp.x, sp.z) / 10;
            if (sc > bs) { bs = sc; best = k; }
          });
          if (best >= 0) {
            this.assign.set(s.id, best);
            count.set(best, (count.get(best) || 0) + 1);
            const sp = this.spots[best];
            const mates = [...this.assign].filter(([id, k]) => k === best).map(([id]) => id);
            w.cmd('protest', { type: 'move', squads: mates, x: sp.x, z: sp.z });
          }
        }
      }

      // ---- תגובות (ברמות נמוכות — מגיבים רק לפעמים, כמו בני אדם) ----
      const react = cfg.react === undefined ? 1 : cfg.react;
      if (react > 0) {
        for (const s of mine) {
          if (s.type === 'askan' || s.fleeT > 0) continue;
          if (react < 1 && w.rng.next() > react) continue;
          const c = Un.centroid(s);
          const onRoad = w.map.isRoad(c.x, c.z);
          let horseNear = false, cannonNear = false, copsNear = 0;
          for (const p of police) {
            const pc = Un.centroid(p);
            const d = U.dist(c.x, c.z, pc.x, pc.z);
            if (p.type === 'horses' && d < 26) horseNear = true;
            if (p.type === 'cannon' && d < 20 && p.vehicle.state !== 'refill' && p.vehicle.state !== 'return') cannonNear = true;
            if (p.type === 'patrol' && d < 14) copsNear++;
          }
          if (!s.moving && onRoad) {
            if (cannonNear && s.stance === 'sit' && this.opts.dodge !== false) {
              // בורחים מהמים לנקודה אחרת
              this.assign.delete(s.id);
              s.stance = 'stand';
            } else if (s.stance !== 'sit' && (horseNear || s.type === 'avrechim' || copsNear > 0)) {
              w.cmd('protest', { type: 'stance', squads: [s.id], stance: 'sit' });
            }
          }
        }
        // עסקן: הולך לחוליה הגדולה ביותר על הכביש ומעכב שוטרים
        for (const a of askans) {
          const am = a.members[0];
          if (!am || am.state !== 'free') continue;
          let best = null, bn = 0;
          for (const s of mine) {
            if (s.type === 'askan') continue;
            const c = Un.centroid(s);
            if (!w.map.isRoad(c.x, c.z)) continue;
            if (s.members.length > bn) { bn = s.members.length; best = c; }
          }
          if (best && U.dist(am.x, am.z, best.x, best.z) > 6 && !a.moving) {
            w.cmd('protest', { type: 'move', squads: [a.id], x: best.x + 3, z: best.z + 3 });
          }
          if ((a.cd.permit || 0) <= 0) {
            const r = w.cmd('protest', { type: 'permit', squad: a.id });
            void r;
          }
        }
      }
    }
  }

  HM.ProtestAI = ProtestAI;
})(typeof window !== 'undefined' ? window : globalThis);
