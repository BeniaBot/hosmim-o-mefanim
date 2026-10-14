/* אמבולנס: מגיע מדי פעם עם סירנה, נוסע בין הנתיבים (המכוניות זזות לו),
   ונעצר רק מול אנשים. חסימה ארוכה שלו הופכת את התקשורת נגד ההפגנה;
   פינוי דרך — כותרת טובה. */
(function (root) {
  'use strict';
  const HM = root.HM || (root.HM = {});
  const U = HM.U;

  class Ambulances {
    constructor(world) {
      this.w = world;
      this.A = world.BAL.ambulance;
      this.list = [];
      this.nextT = world.rng.f(this.A.first[0], this.A.first[1]);
    }

    spawn() {
      const w = this.w;
      // מעדיפים נתיב שיש בו חסימה של ההפגנה — שם זה מעניין
      const lanes = w.traffic.lanes.filter(l => !l.L.tram);
      let cand = lanes.filter(l => l.jamCars > 3);
      if (!cand.length) cand = lanes;
      const lane = cand[Math.floor(w.rng.next() * cand.length)];
      const L = lane.L;
      const a = {
        id: w.nextId++, L, d: 0, v: this.A.speed, x: L.p0.x, z: L.p0.z, px: L.p0.x, pz: L.p0.z,
        heading: Math.atan2(L.dx, L.dz), blockedT: 0, warned: false, penalized: false, blocker: null
      };
      this.place(a);
      a.px = a.x; a.pz = a.z;
      this.list.push(a);
      w.events.push('ambIncoming', { x: a.x, z: a.z, arm: L.arm });
    }

    // נוסע בין הנתיבים, לכיוון מרכז הכביש (כאילו המכוניות זזו לצד)
    place(a) {
      const L = a.L;
      const c = a.d - 2.8;
      const road = this.w.map.roads.find(r => r.id === L.road);
      const toward = road ? -Math.sign(L.off - road.c) || 1 : 1;
      const side = toward * (this.w.BAL.traffic.laneW / 2 - 0.35);
      a.x = L.p0.x + L.dx * c + (L.axis === 'z' ? side : 0);
      a.z = L.p0.z + L.dz * c + (L.axis === 'x' ? side : 0);
    }

    update(dt) {
      const w = this.w, A = this.A;
      if (w.t >= this.nextT) {
        this.nextT = w.t + w.rng.f(A.every[0], A.every[1]);
        this.spawn();
      }
      for (let i = this.list.length - 1; i >= 0; i--) {
        const a = this.list[i];
        a.px = a.x; a.pz = a.z;
        // מי עומד מקדימה במסדרון של הנתיב?
        const L = a.L, half = w.BAL.traffic.laneW / 2 + 0.6;
        let block = null, gap = 1e9;
        for (const p of w.people) {
          if (p.state === 'detained' || p.state === 'gone' || p.state === 'carried') continue;
          const perp = L.axis === 'x' ? p.z : p.x;
          if (Math.abs(perp - L.off) > half) continue;
          const d = w.map.laneD(L, p.x, p.z) - a.d;
          if (d > -0.5 && d < gap) { gap = d; block = p; }
        }
        let target = A.speed;
        if (block && gap < 9) target = Math.max(0, (gap - 2.2) * 1.5);
        a.v = U.approach(a.v, target, (target < a.v ? 12 : 3) * dt);
        a.d += a.v * dt;
        this.place(a);
        // חסום ע"י מפגינים
        if (block && block.side === 'protest' && a.v < 0.5 && gap < 5) {
          a.blockedT += dt;
          a.blocker = block.squad;
          if (a.blockedT > A.warnAfter && !a.warned) {
            a.warned = true;
            w.events.push('ambBlocked', { x: a.x, z: a.z, squad: block.squad.id, num: block.squad.num, limit: A.scandalAfter });
          }
          if (a.blockedT > A.scandalAfter && !a.penalized) {
            a.penalized = true;
            w.H = U.clamp(w.H - A.scandalH, 0, 100);
            w.moraleAround(a.x, a.z, 40, -A.scandalMorale);
            w.stats.ambBlocked = (w.stats.ambBlocked || 0) + 1;
            w.events.push('ambScandal', { x: a.x, z: a.z, amount: A.scandalH });
          }
        } else if (a.warned && !a.penalized && a.v > 2 && !a.thanked) {
          // פינו דרך בזמן — כבוד
          a.thanked = true;
          w.addHeadline(A.respectH, 'ambRespect', a.x, a.z);
          w.stats.ambCleared = (w.stats.ambCleared || 0) + 1;
        }
        if (a.d > L.len + 6) this.list.splice(i, 1);
      }
    }

    // אמבולנס כמכשול לתנועה הרגילה (המכוניות לא נכנסות בו)
    obstacles(out) {
      for (const a of this.list) out.push({ x: a.x, z: a.z, r: 1.4, kind: 'ambulance', person: false, ref: null });
    }
  }

  HM.Ambulances = Ambulances;
})(typeof window !== 'undefined' ? window : globalThis);
