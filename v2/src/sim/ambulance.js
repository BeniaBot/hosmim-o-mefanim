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
      this.K = world.BAL.kugel;
      this.list = [];
      this.nextT = world.rng.f(this.A.first[0], this.A.first[1]);
      this.nextK = this.K ? world.rng.f(this.K.first[0], this.K.first[1]) : 1e9;
    }

    spawn(kind) {
      kind = kind || 'amb';
      const w = this.w;
      // מעדיפים נתיב שיש בו חסימה של ההפגנה — שם זה מעניין
      const lanes = w.traffic.lanes.filter(l => !l.L.tram);
      let cand = lanes.filter(l => l.jamCars > 3);
      if (!cand.length) cand = lanes;
      const lane = cand[Math.floor(w.rng.next() * cand.length)];
      const L = lane.L;
      const a = {
        id: w.nextId++, kind, L, d: 0, v: kind === 'kugel' ? this.K.speed : this.A.speed,
        aiYield: kind !== 'kugel' || w.rng.next() < 0.35,   // מפגינים ממוחשבים מפנים לקוגל רק לפעמים (לאמבולנס — תמיד)
        x: L.p0.x, z: L.p0.z, px: L.p0.x, pz: L.p0.z,
        heading: Math.atan2(L.dx, L.dz), blockedT: 0, warned: false, penalized: false, blocker: null
      };
      this.place(a);
      a.px = a.x; a.pz = a.z;
      this.list.push(a);
      w.events.push(kind === 'kugel' ? 'kugelIncoming' : 'ambIncoming', { x: a.x, z: a.z, arm: L.arm });
    }

    // נוסע בין הנתיבים, לכיוון מרכז הכביש (כאילו המכוניות זזו לצד)
    place(a) {
      const L = a.L;
      const c = a.d - 2.8;
      const road = this.w.map.roads.find(r => r.id === L.road);
      const toward = road ? -Math.sign(L.off - road.c) || 1 : 1;
      let side = toward * (this.w.BAL.traffic.laneW / 2);   // בדיוק על הקו בין הנתיבים (המכוניות זזות לו הצידה)
      // בכביש עם שטח הפרדה — לא עולים על המעקה/המסילה
      if (road && road.median) {
        const minOff = road.median / 2 + 1.0, off = L.off + side - road.c;
        if (Math.abs(off) < minOff) side = Math.sign(L.off - road.c) * minOff - (L.off - road.c);
      }
      a.x = L.p0.x + L.dx * c + (L.axis === 'z' ? side : 0);
      a.z = L.p0.z + L.dz * c + (L.axis === 'x' ? side : 0);
    }

    update(dt) {
      const w = this.w, A = this.A;
      if (w.t >= this.nextT) {
        this.nextT = w.t + w.rng.f(A.every[0], A.every[1]);
        this.spawn('amb');
      }
      if (this.K && w.t >= this.nextK) {
        this.nextK = w.t + w.rng.f(this.K.every[0], this.K.every[1]);
        if (!this.list.some(o => o.kind === 'kugel')) this.spawn('kugel');
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
        a.byProtest = !!(block && block.side === 'protest' && gap < 5);   // נכון רק כרגע (לא "פעם נחסם")
        const K = this.K, kug = a.kind === 'kugel';
        let target = kug ? K.speed : A.speed;
        if (block && gap < 9) target = Math.max(0, (gap - 2.2) * 1.5);
        a.v = U.approach(a.v, target, (target < a.v ? 12 : 3) * dt);
        a.d += a.v * dt;
        this.place(a);
        // משאית הקוגל: חסומה — מזהירים, ואחרי זמן — הקוגל מתקרר. עברה בחום — מורל לכל ההפגנה
        if (kug) {
          if (block && block.side === 'protest' && a.v < 0.5 && gap < 5) {
            a.blockedT += dt;
            a.blocker = block.squad;
            if (a.blockedT > K.warnAfter && !a.warned) { a.warned = true; w.events.push('kugelBlocked', { x: a.x, z: a.z, squad: block.squad.id, num: block.squad.num, limit: K.coldAfter }); }
            if (a.blockedT > K.coldAfter && !a.cold) { a.cold = true; w.events.push('kugelCold', { x: a.x, z: a.z }); }
          }
          if (a.d > L.len + 6) {
            if (!a.cold) {
              for (const sq of w.squads) if (sq.side === 'protest' && !sq.broken) sq.morale = Math.min(sq.maxMorale, sq.morale + K.morale);
              w.money.protest += K.money || 0;   // "תרומה מהמאפייה" על שפינו דרך
              w.addHeadline(K.cheerH, 'kugel', a.x, a.z);
              w.stats.kugel = (w.stats.kugel || 0) + 1;
              w.events.push('kugelDelivered', { x: a.x, z: a.z, morale: K.morale, money: K.money || 0 });
            }
            this.list.splice(i, 1);
          }
          continue;
        }
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
      // רכב שתקוע מול מפגינים — המכוניות שמאחוריו תקועות בגלל ההפגנה (וזה נספר כפקק שלה)
      for (const a of this.list) {
        const byProtest = a.byProtest && a.v < 0.5;
        out.push({ x: a.x, z: a.z, r: 1.4, kind: byProtest ? 'protester' : 'ambulance', person: false, ref: null });
      }
    }
  }

  HM.Ambulances = Ambulances;
})(typeof window !== 'undefined' ? window : globalThis);
