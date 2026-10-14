/* סימולציית התנועה: נתיבים, רמזורים, מודל נהיגה (IDM), פקק מדומה מחוץ למפה.
   כל רכב נוסע בנתיב אחד מקצה לקצה (ישר דרך הצומת). */
(function (root) {
  'use strict';
  const HM = root.HM || (root.HM = {});
  const U = HM.U;

  class Traffic {
    constructor(world) {
      this.w = world;
      this.map = world.map;
      this.B = world.BAL.traffic;
      this.rng = world.rng;
      this.cars = [];
      this.nextId = 1;
      this.lanes = this.map.lanes.map(L => ({
        L, cars: [], backlog: 0, arrAcc: this.rng.f(0, 1), obs: [], jamCars: 0, inflowMul: 1,
        nextTram: L.tram ? this.rng.f(4, 25) : 0
      }));
      this.cycle = this.map.lights || this.B.lights;
      this.tramBlocked = false;
      this.phase = 0;
      this.phaseT = this.cycle[0].t;
      this.light = { x: 'G', z: 'R' };
      this.applyPhase();
      this.jamKm = 0;
      this.armJam = {};
      this.nearMissCD = new Map();
      this.prefill();
    }

    applyPhase() {
      const g = this.cycle[this.phase].g;
      this.light.x = g === 'x' ? 'G' : g === 'xy' ? 'Y' : 'R';
      this.light.z = g === 'z' ? 'G' : g === 'zy' ? 'Y' : 'R';
    }

    pickType() {
      const r = this.rng.next();
      let acc = 0;
      for (const t of this.B.types) { acc += t.p; if (r <= acc) return t; }
      return this.B.types[0];
    }

    makeCar(lane, d, v) {
      const t = lane.L.tram ? { id: 'tram', len: (this.map.tram && this.map.tram.len) || 30, w: 2.65, accel: 1.0 } : this.pickType();
      const car = {
        id: this.nextId++, lane, type: t.id, len: t.len, wid: t.w, accel: t.accel || this.B.idm.a,
        d, v, stopT: 0, jammed: false, braking: false, color: this.rng.i(0, 7),
        x: 0, z: 0, px: 0, pz: 0, heading: 0, honkT: this.rng.f(4, 12), blockBy: null
      };
      const L = lane.L;
      car.heading = Math.atan2(L.dx, L.dz);
      this.placeCar(car);
      car.px = car.x; car.pz = car.z;
      return car;
    }

    placeCar(car) {
      const L = car.lane.L;
      const c = car.d - car.len / 2; // מרכז הרכב
      car.x = L.p0.x + L.dx * c;
      car.z = L.p0.z + L.dz * c;
    }

    prefill() {
      for (const lane of this.lanes) {
        const L = lane.L;
        if (L.tram) continue;
        let d = L.len - this.rng.f(5, 25);
        while (d > 10) {
          // לא ממקמים בתוך הצומת
          const inBox = L.boxes.some(bx => d > bx.d0 - 3 && d - 12 < bx.d1 + 1);
          if (!inBox) {
            const car = this.makeCar(lane, d, L.speed * this.rng.f(0.8, 1));
            lane.cars.push(car);
            this.cars.push(car);
            d -= car.len + L.speed * this.rng.f(1.9, 3.6) / Math.max(0.5, L.inflow * 3);
          } else d -= 4;
        }
      }
    }

    // ---- צעד ----
    step(dt) {
      // רמזור
      this.phaseT -= dt;
      if (this.phaseT <= 0) {
        this.phase = (this.phase + 1) % this.cycle.length;
        this.phaseT += this.cycle[this.phase].t;
        this.applyPhase();
      }
      this.buildObstacles();
      this.boxOccupancy();
      for (const lane of this.lanes) this.stepLane(lane, dt);
      this.spawn(dt);
      this.measure();
      for (const [k, v] of this.nearMissCD) { if (v - dt <= 0) this.nearMissCD.delete(k); else this.nearMissCD.set(k, v - dt); }
    }

    buildObstacles() {
      const map = this.map, half = this.B.laneW / 2;
      for (const lane of this.lanes) lane.obs.length = 0;
      const obs = this.w.trafficObstacles();
      for (const o of obs) {
        for (const lane of this.lanes) {
          const L = lane.L;
          const perp = L.axis === 'x' ? o.z : o.x;
          if (Math.abs(perp - L.off) < half + o.r - 0.15) {
            lane.obs.push({ d: map.laneD(L, o.x, o.z), r: o.r, o });
          }
        }
      }
      for (const lane of this.lanes) lane.obs.sort((a, b) => a.d - b.d);
    }

    // אילו רכבים נמצאים כרגע בתוך כל צומת (ומאיזה ציר)
    boxOccupancy() {
      for (const j of this.map.junctions) { j.occX = 0; j.occZ = 0; }
      for (const lane of this.lanes) {
        const L = lane.L;
        for (const bx of L.boxes) {
          for (const car of lane.cars) {
            if (car.d > bx.d0 - 0.3 && car.d - car.len < bx.d1 + 0.3) {
              if (L.axis === 'x') bx.j.occX++; else bx.j.occZ++;
            }
          }
        }
      }
    }

    idmAcc(v, v0, gap, dv, A) {
      const I = this.B.idm;
      const sStar = I.s0 + Math.max(0, v * I.T + (v * dv) / (2 * Math.sqrt(A * I.b)));
      const g = Math.max(gap, 0.05);
      return A * (1 - Math.pow(v / v0, 4) - (sStar / g) * (sStar / g));
    }

    stepLane(lane, dt) {
      const L = lane.L, cars = lane.cars, I = this.B.idm;
      const lightAx = this.light[L.axis];
      for (let i = 0; i < cars.length; i++) {
        const car = cars[i];
        const v0 = L.speed;
        let acc = car.accel * (1 - Math.pow(car.v / v0, 4));
        let limitD = Infinity;          // אסור לעבור את הנקודה הזו (בלי חפיפה)
        let blockBy = null, personObs = null, personGap = Infinity;

        // רכב מקדימה
        if (i > 0) {
          const ld = cars[i - 1];
          const gap = ld.d - ld.len - car.d;
          const a = this.idmAcc(car.v, v0, gap, car.v - ld.v, car.accel);
          if (a < acc) { acc = a; blockBy = ld.jammed ? 'car' : 'traffic'; }
          limitD = Math.min(limitD, ld.d - ld.len - 0.4);
        }
        // מכשולים (אנשים, רכבי משטרה)
        for (const ob of lane.obs) {
          if (ob.d + ob.r < car.d - 0.2) continue;              // מאחורי החרטום
          const gap = ob.d - ob.r - car.d;
          const a = this.idmAcc(car.v, v0, gap, car.v, car.accel);
          if (a < acc) { acc = a; blockBy = ob.o.kind; }
          limitD = Math.min(limitD, ob.d - ob.r - 0.3);
          if (ob.o.person && gap < personGap) { personGap = gap; personObs = ob.o; }
          break; // הקרוב ביותר מספיק
        }
        // רמזור + "לא חוסמים צומת"
        for (const bx of L.boxes) {
          if (car.d > bx.d0 - 0.1) continue;                     // כבר בתוך הצומת או אחריו
          const toStop = bx.stopD - car.d;
          if (toStop > 60) break;
          let stop = false, why = 'light';
          if (lightAx !== 'G') {
            const need = (car.v * car.v) / (2 * 6);
            if (toStop >= need - 0.5) stop = true;               // יכול לעצור — עוצר
          } else {
            const crossOcc = L.axis === 'x' ? bx.j.occZ : bx.j.occX;
            if (crossOcc > 0 && toStop < 18) stop = true;
            if (i > 0) {
              // היציאה מהצומת חסומה — לא נכנסים (ואם זה בגלל פקק של ההפגנה, זה נחשב פקק)
              const ld = cars[i - 1];
              if (ld.d - ld.len < bx.d1 + car.len + 1.5 && ld.v < 1.5 && toStop < 25) { stop = true; if (ld.jammed) why = 'car'; }
            }
          }
          if (stop) {
            const a = this.idmAcc(car.v, v0, toStop + 0.6, car.v, car.accel);
            if (a < acc) { acc = a; blockBy = why; }
            limitD = Math.min(limitD, bx.stopD + 0.6);
          }
          break;
        }
        // "כמעט": אדם הופיע מול רכב שלא מספיק לעצור בנוחות
        if (personObs && personGap > -0.5 && car.v > 2.5) {
          const need = (car.v * car.v) / (2 * Math.max(0.3, personGap));
          if (need > this.B.nearMissDecel) {
            acc = Math.min(acc, -I.emergency);
            const key = personObs.ref ? personObs.ref.id : 0;
            if (!this.nearMissCD.has(key)) {
              this.nearMissCD.set(key, 3);
              this.w.onNearMiss(personObs.ref, car);
            }
          }
        }
        acc = Math.max(acc, -I.emergency);
        car.braking = acc < -1.2;
        car.v = Math.max(0, car.v + acc * dt);
        let nd = car.d + car.v * dt;
        if (nd > limitD) { nd = Math.max(car.d, limitD); car.v = Math.min(car.v, 0.5); }
        car.d = nd;
        if (car.v < 0.4) car.stopT += dt; else car.stopT = Math.max(0, car.stopT - dt * 3);
        // נספר בפקק רק מי שעומד בגלל ההפגנה (אדם/כוח משטרה מקדימה, או רכב פקוק לפניו)
        // משטרה שמפנה מפגינים — נחשב; משטרה שעומדת סתם על כביש ריק — לא
        car.jammed = car.stopT > this.B.jamStopT && (blockBy === 'car' || blockBy === 'protester' || blockBy === 'police');
        car.blockBy = blockBy;
        car.px = car.x; car.pz = car.z;
        this.placeCar(car);
        // צפירה של נהג עצבני
        if (car.stopT > 5 && (blockBy === 'protester' || blockBy === 'car')) {
          car.honkT -= dt;
          if (car.honkT <= 0) {
            car.honkT = this.rng.f(5, 14);
            this.w.events.push('honk', { x: car.x, z: car.z, car: car.id, front: blockBy === 'protester' });
          }
        }
      }
      // יציאה מהמפה
      while (cars.length && cars[0].d - cars[0].len > L.len) {
        const c = cars.shift();
        const k = this.cars.indexOf(c);
        if (k >= 0) this.cars.splice(k, 1);
      }
    }

    spawn(dt) {
      const B = this.B;
      for (const lane of this.lanes) {
        const L = lane.L;
        if (L.tram) {
          // רכבת קלה: לפי לוח זמנים, לא לפי זרימה
          lane.nextTram -= dt;
          if (lane.nextTram <= 0) {
            const last = lane.cars[lane.cars.length - 1];
            if (!last || last.d - last.len > 40) {
              const ev = (this.map.tram && this.map.tram.every) || [50, 80];
              lane.nextTram = this.rng.f(ev[0], ev[1]);
              const car = this.makeCar(lane, 0.01, L.speed);
              lane.cars.push(car); this.cars.push(car);
            }
          }
          continue;
        }
        lane.arrAcc += L.inflow * lane.inflowMul * dt * this.rng.f(0.4, 1.6);
        while (lane.arrAcc >= 1) { lane.arrAcc -= 1; lane.backlog += 1; }
        const last = lane.cars[lane.cars.length - 1];
        const blocked = last && last.jammed && last.d < 40;
        const rr = blocked ? B.rerouteBlocked : B.rerouteFree;
        if (lane.backlog > 1) lane.backlog -= lane.backlog * rr * dt;
        if (lane.backlog >= 1) {
          const space = last ? last.d - last.len : Infinity;
          if (space > B.carGapSpawn) {
            let v = L.speed;
            if (last) v = Math.min(L.speed, last.v + 3, Math.sqrt(2 * B.idm.b * Math.max(0, space - B.idm.s0 - 3)));
            const car = this.makeCar(lane, 0.01, v);
            if (!last || space > car.len + 2) {
              lane.cars.push(car);
              this.cars.push(car);
              lane.backlog -= 1;
            }
          }
        }
      }
    }

    measure() {
      const per = this.B.jamCarLen / 1000;
      let total = 0;
      this.armJam = {};
      this.tramBlocked = false;
      for (const lane of this.lanes) {
        if (lane.L.tram) {
          for (const c of lane.cars) if (c.jammed && c.stopT > 4) this.tramBlocked = true;
          continue;
        }
        let n = 0;
        for (const c of lane.cars) if (c.jammed) n++;
        const last = lane.cars[lane.cars.length - 1];
        if (lane.backlog >= 1 && last && last.jammed) n += Math.floor(lane.backlog);
        lane.jamCars = n;
        total += n;
        const arm = lane.L.arm;
        this.armJam[arm] = (this.armJam[arm] || 0) + n * per;
      }
      this.jamKm = total * per;
    }

    stoppedCount() { let n = 0; for (const c of this.cars) if (c.jammed) n++; return n; }
  }

  HM.Traffic = Traffic;
})(typeof window !== 'undefined' ? window : globalThis);
