/* ציור העולם: בונה את המפה הסטטית פעם אחת, ובכל פריים מעדכן את האנשים,
   המכוניות והרכבים — הכול בציור מקובץ (InstancedMesh). */
(function (root) {
  'use strict';
  const HM = root.HM || (root.HM = {});
  const T = root.THREE;
  const U = HM.U;
  const M = HM.Models;

  const S = 1.12;                 // קנה מידה לדמויות (קצת גדולות מהמציאות — קריאות)
  const HIP = 0.9 * S;
  const CURB_H = 0.15;
  const CAR_COLORS = [0xe9e9e6, 0xb9c0c8, 0x2f3338, 0x8a2f2f, 0x2f4f7a, 0x6b7f8f, 0xd8d0bf, 0x4e6b52];
  const _m = new T.Matrix4(), _q = new T.Quaternion(), _e = new T.Euler(0, 0, 0, 'YXZ'), _p = new T.Vector3(), _s = new T.Vector3(1, 1, 1);
  const _c = new T.Color();

  function setM(mesh, i, x, y, z, ry, rx, rz, sc) {
    _e.set(rx || 0, ry || 0, rz || 0);
    _q.setFromEuler(_e);
    _p.set(x, y, z);
    const k = sc === undefined ? 1 : sc;
    _s.set(k, k, k);
    _m.compose(_p, _q, _s);
    mesh.setMatrixAt(i, _m);
  }
  function inst(geo, mat, n, opts) {
    const m = new T.InstancedMesh(geo, mat, n);
    m.instanceMatrix.setUsage(T.DynamicDrawUsage);
    m.frustumCulled = false;
    if (opts && opts.color) {
      // חייבים ליצור את מערך הצבעים לפני שמאפסים את count (setColorAt מקצה לפי count)
      const arr = new Float32Array(n * 3).fill(1);
      m.instanceColor = new T.InstancedBufferAttribute(arr, 3);
      m.instanceColor.setUsage(T.DynamicDrawUsage);
    }
    m.count = 0;
    m.castShadow = !!(opts && opts.shadow);
    m.receiveShadow = !!(opts && opts.receive);
    return m;
  }

  // מיזוג גיאומטריות עם קואורדינטות מרקם (לקירות ולמשטחים)
  function mergeUV(list) {
    list = list.map(g => g.index ? g.toNonIndexed() : g);
    let n = 0;
    for (const g of list) n += g.attributes.position.count;
    const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), uv = new Float32Array(n * 2);
    let o = 0;
    for (const g of list) {
      pos.set(g.attributes.position.array, o * 3);
      nor.set(g.attributes.normal.array, o * 3);
      uv.set(g.attributes.uv.array, o * 2);
      o += g.attributes.position.count;
    }
    const out = new T.BufferGeometry();
    out.setAttribute('position', new T.BufferAttribute(pos, 3));
    out.setAttribute('normal', new T.BufferAttribute(nor, 3));
    out.setAttribute('uv', new T.BufferAttribute(uv, 2));
    out.computeBoundingSphere();
    return out;
  }
  // מלבן אופקי (רצפה) עם מרקם בקנה מידה של מטרים
  function floorQuad(x0, x1, z0, z1, y, tile) {
    const g = new T.PlaneGeometry(x1 - x0, z1 - z0);
    g.rotateX(-Math.PI / 2);
    g.translate((x0 + x1) / 2, y, (z0 + z1) / 2);
    const uv = g.attributes.uv, pos = g.attributes.position;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, pos.getX(i) / tile, pos.getZ(i) / tile);
    return g;
  }
  // קיר אנכי עם מרקם: מקטע = 4 מ' × 3 מ'
  function wall(x0, z0, x1, z1, h, y0, tw, th, uOff) {
    const len = Math.hypot(x1 - x0, z1 - z0);
    const g = new T.PlaneGeometry(len, h);
    const ang = Math.atan2(z1 - z0, x1 - x0);
    g.rotateY(-ang);
    g.translate((x0 + x1) / 2, y0 + h / 2, (z0 + z1) / 2);
    const uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) {
      uv.setXY(i, uv.getX(i) * len / tw + (uOff || 0), uv.getY(i) * h / th);
    }
    return g;
  }

  class View {
    constructor(stage, world) {
      this.stage = stage;
      this.world = world;
      this.root = new T.Group();
      stage.scene.add(this.root);
      this.mats = [];
      this.buildStatic();
      this.buildDynamic();
    }

    mat(m) { this.mats.push(m); return m; }

    dispose() {
      this.stage.scene.remove(this.root);
      this.root.traverse(o => {
        if (o.geometry) o.geometry.dispose();
      });
      for (const m of this.mats) { if (m.map) m.map.dispose(); if (m.emissiveMap) m.emissiveMap.dispose(); m.dispose(); }
    }

    // ---- מוכר הבייגלה: נכנס לפקק גדול, הולך בין המכוניות התקועות, עוצר "למכור" ויוצא ----
    updateVendor(dt) {
      const w = this.world, v = this.vendorState, mesh = this.vendor;
      if (!mesh) return;
      dt = Math.min(dt, 0.1);
      const laneW = w.BAL.traffic.laneW;
      const posAt = (d) => { const p = w.map.lanePos(v.L, d); return v.L.axis === 'x' ? { x: p.x, z: v.b } : { x: v.b, z: p.z }; };
      if (!v.on) {
        mesh.visible = false;
        if (w.t < v.readyAt || w.outcome || w.traffic.jamKm < 0.8) return;
        // הנתיב הכי פקוק, וקו בין נתיבים שאפשר ללכת עליו (כביש משני הצדדים)
        const lanes = w.traffic.lanes.filter(l => !l.L.tram && l.jamCars >= 5).sort((a, b) => b.jamCars - a.jamCars);
        for (const lane of lanes) {
          const L = lane.L;
          for (const sg of [1, -1]) {
            const b = L.off + sg * laneW / 2;
            const probe = (o) => L.axis === 'x' ? w.map.isRoad(L.p0.x + L.dx * 40, b + o) : w.map.isRoad(b + o, L.p0.z + L.dz * 40);
            if (!probe(0.5) || !probe(-0.5)) continue;
            const tail = lane.cars[lane.cars.length - 1], head = lane.cars.find(c => c.jammed) || lane.cars[0];
            v.on = true; v.L = L; v.b = b; v.lane = lane;
            // נכנס כ-30 מטר מאחורי ראש הפקק — קרוב לאקשן, לא בקצה המפה
            v.d = U.clamp(head.d - 30, Math.max(3, tail.d - tail.len - 4), head.d - 8);
            v.stopT = 0; v.walkT = 0; v.leaveT = 55 + Math.random() * 25; v.leaving = 0; v.vx = 0; v.vz = 0;
            const p0 = posAt(v.d);
            v.x = p0.x; v.z = p0.z;
            v.face = Math.atan2(L.dx, L.dz);
            v.justArrived = true; v.thinT = 0; v.talkT = 0.3;
            break;
          }
          if (v.on) break;
        }
        if (!v.on) { v.readyAt = w.t + 5; return; }
      }
      v.leaveT -= dt;
      const lane = v.lane;
      const head = lane.cars.find(c => c.jammed);
      // סוף הסיבוב: הגיע לראש הפקק, נגמר הזמן, או שהפקק התפרק — יוצא לצד הכביש ונעלם
      // הפקק "התפרק" — רק אם זה נמשך כמה שניות (דגל הפקק יכול להבהב לרגע)
      v.thinT = (!head || lane.jamCars < 2) ? (v.thinT || 0) + dt : 0;
      if (!v.leaving && (v.leaveT <= 0 || v.thinT > 3.5 || (head && v.d > head.d + 2) || w.outcome)) {
        v.leaving = 3.5;
        const sw = w.map.nearestSidewalk(v.x, v.z);
        v.exit = sw;
      }
      if (v.leaving) {
        v.leaving -= dt;
        const dx = v.exit.x - v.x, dz = v.exit.z - v.z, dd = Math.hypot(dx, dz);
        if (dd > 0.3) { v.x += dx / dd * 1.3 * dt; v.z += dz / dd * 1.3 * dt; v.face = U.turnToward(v.face, Math.atan2(dx, dz), 4 * dt); }
        if (v.leaving <= 0) { v.on = false; v.readyAt = w.t + 70 + Math.random() * 40; mesh.visible = false; return; }
      } else if (v.stopT > 0) {
        // עומד ליד מכונית ו"מוכר" — מסתובב אליה
        v.stopT -= dt;
        v.face = U.turnToward(v.face, Math.atan2(v.L.axis === 'x' ? 0 : (v.L.off - v.b), v.L.axis === 'x' ? (v.L.off - v.b) : 0), 3 * dt);
      } else {
        // הולך קדימה לאורך הפקק; עוצר מול אנשים
        let blocked = false;
        const ahead = posAt(v.d + 1.6);
        for (const q of w.neighbors(ahead.x, ahead.z, 1.2)) if (q.state !== 'carried' && q.state !== 'detained') { blocked = true; break; }
        if (!blocked) v.d += 1.1 * dt;
        const p = posAt(v.d);
        v.x = p.x; v.z = p.z;
        v.face = U.turnToward(v.face, Math.atan2(v.L.dx, v.L.dz), 4 * dt);
        v.walkT += dt;
        if (v.walkT > 7 + Math.random() * 3) { v.walkT = 0; v.stopT = 2.5; }
      }
      mesh.visible = true;
      const bob = (v.stopT > 0 ? 0 : Math.abs(Math.sin(performance.now() / 1000 * 7)) * 0.04);
      mesh.position.set(v.x, this.groundY(v.x, v.z) + bob, v.z);
      mesh.rotation.y = v.face;
    }

    // ---- נהג יוצא מהמכונית בפקק ארוך, עומד ליד הדלת, ואחרי כמה שניות חוזר פנימה ----
    updateDriversOut(dt) {
      const w = this.world;
      if (!this.driversOut) return;
      for (const d of this.driversOut) {
        if (!d.car) continue;
        d.t -= dt;
        const c = d.car;
        // המכונית זזה / יצאה מהמפה / נגמר הזמן — חוזר פנימה
        if (d.t <= 0 || c.v > 0.4 || !c.lane.cars.includes(c) || w.outcome) { d.car = null; d.mesh.visible = false; continue; }
        const sh = Math.sin(c.heading), ch = Math.cos(c.heading);
        const off = c.wid / 2 + 0.45;
        const x = c.x - ch * off + sh * 0.4, z = c.z + sh * off + ch * 0.4;   // צד הנהג (שמאל)
        d.x = x; d.z = z;
        d.mesh.position.set(x, this.groundY(x, z), z);
        d.mesh.rotation.y = c.heading + Math.PI / 2 * (0.6 + 0.2 * Math.sin(performance.now() / 900));
        d.mesh.visible = true;
      }
      if (w.t < this.driverNextT || w.outcome) return;
      this.driverNextT = w.t + 12 + Math.random() * 14;
      const free = this.driversOut.find(d => !d.car);
      if (!free) return;
      // מכונית שעומדת בפקק כבר הרבה זמן, עם מקום פנוי ליד הדלת
      const cands = [];
      for (const lane of w.traffic.lanes) {
        if (lane.L.tram) continue;
        for (const c of lane.cars) if (c.jammed && c.stopT > 35 && c.type !== 'bus' && !this.driversOut.some(d => d.car === c)) cands.push(c);
      }
      for (let k = 0; k < 6 && cands.length; k++) {
        const c = cands.splice(Math.floor(Math.random() * cands.length), 1)[0];
        const sh = Math.sin(c.heading), ch = Math.cos(c.heading), off = c.wid / 2 + 0.45;
        const x = c.x - ch * off, z = c.z + sh * off;
        if (w.carAt(x, z, 0.35) || w.neighbors(x, z, 1).length) continue;
        free.car = c; free.t = 10 + Math.random() * 8; free.said = false;
        break;
      }
    }

    groundY(x, z) {
      return this.world.map.isRoad(x, z) ? 0 : CURB_H;
    }

    // ================= סטטי =================
    buildStatic() {
      const map = this.world.map, R = this.root, b = map.bounds;
      const lambert = (o) => this.mat(new T.MeshLambertMaterial(o));

      // קרקע כללית
      const ground = new T.Mesh(new T.PlaneGeometry(1600, 1600), lambert({ color: M.lin(0xcbbd9f) }));
      ground.rotation.x = -Math.PI / 2; ground.position.y = -0.03; ground.receiveShadow = true;
      R.add(ground);

      // ---- כבישים (מוארכים מעבר לגבולות המפה כדי שהפקק "ימשיך") ----
      const EXT = 220;
      const asphalt = HM.Tex.asphalt();
      const roadMat = lambert({ map: asphalt });
      const rg = [];
      for (const r of map.roads) {
        if (r.axis === 'x') {
          const segs = this.splitByJunctions(b.x0 - EXT, b.x1 + EXT, map.junctions.map(j => [j.x0, j.x1]));
          for (const [a, c] of segs) rg.push(floorQuad(a, c, r.c - r.halfW, r.c + r.halfW, 0, 8));
        } else {
          const segs = this.splitByJunctions(b.z0 - EXT, b.z1 + EXT, map.junctions.map(j => [j.z0, j.z1]));
          for (const [a, c] of segs) rg.push(floorQuad(r.c - r.halfW, r.c + r.halfW, a, c, 0, 8));
        }
      }
      for (const j of map.junctions) rg.push(floorQuad(j.x0, j.x1, j.z0, j.z1, 0, 8));
      const roads = new T.Mesh(mergeUV(rg), roadMat);
      roads.receiveShadow = true;
      R.add(roads);

      // ---- מדרכות, רחבות, שפת מדרכה ----
      const sw = map.sidewalk;
      const swMat = lambert({ map: HM.Tex.pavers('#cfc5b2', 'rgba(120,105,85,0.35)') });
      const plMat = lambert({ map: HM.Tex.pavers('#ddd2bc', 'rgba(140,120,95,0.3)') });
      const sg = [], cg = [];
      const sideTop = (x0, x1, z0, z1) => sg.push(floorQuad(x0, x1, z0, z1, CURB_H, 2));
      for (const r of map.roads) {
        if (r.axis === 'x') {
          const segs = this.splitByJunctions(b.x0 - EXT, b.x1 + EXT, map.junctions.map(j => [j.x0, j.x1]));
          for (const [a, c] of segs) {
            sideTop(a, c, r.c - r.halfW - sw, r.c - r.halfW);
            sideTop(a, c, r.c + r.halfW, r.c + r.halfW + sw);
            cg.push(wall(a, r.c - r.halfW, c, r.c - r.halfW, CURB_H, 0, 2, CURB_H * 4));
            cg.push(wall(c, r.c + r.halfW, a, r.c + r.halfW, CURB_H, 0, 2, CURB_H * 4));
          }
        } else {
          const segs = this.splitByJunctions(b.z0 - EXT, b.z1 + EXT, map.junctions.map(j => [j.z0, j.z1]));
          for (const [a, c] of segs) {
            // מדלגים על פינות שכבר מכוסות ע"י מדרכת הכביש הרוחבי
            sideTop(r.c - r.halfW - sw, r.c - r.halfW, a, c);
            sideTop(r.c + r.halfW, r.c + r.halfW + sw, a, c);
            cg.push(wall(r.c - r.halfW, c, r.c - r.halfW, a, CURB_H, 0, 2, CURB_H * 4));
            cg.push(wall(r.c + r.halfW, a, r.c + r.halfW, c, CURB_H, 0, 2, CURB_H * 4));
          }
        }
      }
      const side = new T.Mesh(mergeUV(sg), swMat); side.receiveShadow = true; R.add(side);
      const curbTex = HM.Tex.curb();
      const curb = new T.Mesh(mergeUV(cg), lambert({ map: curbTex })); R.add(curb);
      // רחבות + קרקע עירונית בתוך הגושים (מוגבהת כמו מדרכה)
      const pg = [];
      for (const p of map.plazas) pg.push(floorQuad(p.x0, p.x1, p.z0, p.z1, CURB_H + 0.005, 2.5));
      if (pg.length) { const pl = new T.Mesh(mergeUV(pg), plMat); pl.receiveShadow = true; R.add(pl); }
      // הגבהה כללית של הגושים
      const blockMat = lambert({ color: M.lin(0xd2c6ad) });
      const bg = [];
      const bx = [b.x0 - EXT, ...map.junctions.flatMap(j => [j.x0 - sw, j.x1 + sw]), b.x1 + EXT];
      for (const r of map.roads.filter(r => r.axis === 'x')) {
        const zN0 = b.z0 - EXT, zN1 = r.c - r.halfW - sw, zS0 = r.c + r.halfW + sw, zS1 = b.z1 + EXT;
        for (let k = 0; k < bx.length - 1; k += 2) {
          bg.push(floorQuad(bx[k], bx[k + 1], zN0, zN1, CURB_H - 0.004, 4));
          bg.push(floorQuad(bx[k], bx[k + 1], zS0, zS1, CURB_H - 0.004, 4));
        }
      }
      if (bg.length) { const bl = new T.Mesh(mergeUV(bg), blockMat); bl.receiveShadow = true; R.add(bl); }

      // ---- סימוני כביש ----
      this.buildMarkings(EXT);

      // ---- בניינים ----
      this.buildBuildings();

      // ---- עצים, פנסים, רמזורים ----
      this.buildProps(EXT);
      if (map.def.landmark === 'bridge') this.buildBridge();
    }

    splitByJunctions(a, c, cuts) {
      cuts = cuts.slice().sort((p, q) => p[0] - q[0]);
      const out = [];
      let s = a;
      for (const [c0, c1] of cuts) { if (c0 > s) out.push([s, c0]); s = Math.max(s, c1); }
      if (c > s) out.push([s, c]);
      return out;
    }

    buildMarkings(EXT) {
      const map = this.world.map, b = map.bounds, parts = [];
      const W = 0xf2f2ee, Y = 0xe8c547;
      const strip = (x0, x1, z0, z1, hex, y) => parts.push(M.part(M.box(x1 - x0, 0.02, z1 - z0), hex, (x0 + x1) / 2, y || 0.012, (z0 + z1) / 2));
      // פס לאורך הכביש בהיסט o מהמרכז
      const along = (r, a, c, o, w, hex, y) => {
        if (r.axis === 'x') strip(a, c, r.c + o - w / 2, r.c + o + w / 2, hex, y);
        else strip(r.c + o - w / 2, r.c + o + w / 2, a, c, hex, y);
      };
      const laneW = this.world.BAL.traffic.laneW;
      for (const r of map.roads) {
        const n = r.lanesPos, med = r.median || 0;
        const span = r.axis === 'x' ? [b.x0 - EXT, b.x1 + EXT] : [b.z0 - EXT, b.z1 + EXT];
        const cuts = map.junctions.filter(j => j.roads.includes(r.id))
          .map(j => r.axis === 'x' ? [j.x0 - 4.5, j.x1 + 4.5] : [j.z0 - 4.5, j.z1 + 4.5]);
        const segs = this.splitByJunctions(span[0], span[1], cuts);
        for (const [a, c] of segs) {
          if (med <= 0) {
            for (const o of [-0.14, 0.14]) along(r, a, c, o, 0.12, Y);           // קו מרכז כפול
          } else {
            for (const sg of [-1, 1]) along(r, a, c, sg * (med / 2 - 0.15), 0.14, W);  // שולי שטח ההפרדה
          }
          for (const sg of [-1, 1]) along(r, a, c, sg * (r.halfW - 0.3), 0.14, W);       // קווי שוליים
          // מקווקו בין נתיבים באותו כיוון
          for (let i = 1; i < n; i++) {
            for (const sg of [-1, 1]) {
              const o = sg * (med / 2 + laneW * i);
              for (let d = a + 1; d < c - 3; d += 9) {
                if (r.axis === 'x') strip(d, d + 3, r.c + o - 0.07, r.c + o + 0.07, W); else strip(r.c + o - 0.07, r.c + o + 0.07, d, d + 3, W);
              }
            }
          }
        }
        // שטח הפרדה עם מסילה (לכל האורך, גם בתוך הצומת)
        if (r.tram) {
          const tb = r.axis === 'x' ? [b.x0 - EXT, b.x1 + EXT] : [b.z0 - EXT, b.z1 + EXT];
          along(r, tb[0], tb[1], 0, med - 0.4, 0x9c978c, 0.006);
          for (const t of [-med / 4, med / 4]) {
            along(r, tb[0], tb[1], t, 2.0, 0x6f6a62, 0.009);                   // מצע
            for (const rr of [-0.72, 0.72]) along(r, tb[0], tb[1], t + rr, 0.09, 0xb8bcc2, 0.03); // פסים
          }
        }
      }
      // מעברי חציה וקווי עצירה
      for (const j of map.junctions) {
        const rs = j.roads.map(id => map.roads.find(r => r.id === id));
        const rx = rs.find(r => r.axis === 'x'), rz = rs.find(r => r.axis === 'z');
        if (j.crossing) {
          // מעבר חציה על כל רוחב הכביש, בתוך תחום הצומת
          const r = rs[0];
          if (r.axis === 'x') { for (let z = r.c - r.halfW + 0.6; z < r.c + r.halfW - 0.4; z += 1.2) strip(j.x0 + 0.5, j.x1 - 0.5, z, z + 0.6, W); }
          else { for (let x = r.c - r.halfW + 0.6; x < r.c + r.halfW - 0.4; x += 1.2) strip(x, x + 0.6, j.z0 + 0.5, j.z1 - 0.5, W); }
          continue;
        }
        for (const sgn of [-1, 1]) {
          if (rx) {
            const x0 = sgn < 0 ? j.x0 - 4.2 : j.x1 + 0.6, x1 = x0 + 3.6;
            for (let z = rx.c - rx.halfW + 0.6; z < rx.c + rx.halfW - 0.4; z += 1.2) strip(x0, x1, z, z + 0.6, W);
          }
          if (rz) {
            const z0 = sgn < 0 ? j.z0 - 4.2 : j.z1 + 0.6, z1 = z0 + 3.6;
            for (let x = rz.c - rz.halfW + 0.5; x < rz.c + rz.halfW - 0.4; x += 1.2) strip(x, x + 0.6, z0, z1, W);
          }
        }
      }
      for (const L of map.lanes) {
        if (L.tram) continue;
        for (const bx of L.boxes) {
          const p = map.lanePos(L, bx.stopD - (bx.j.crossing ? 0.4 : 3.4));
          if (L.axis === 'x') strip(p.x - 0.22, p.x + 0.22, L.off - laneW / 2 + 0.15, L.off + laneW / 2 - 0.15, W);
          else strip(L.off - laneW / 2 + 0.15, L.off + laneW / 2 - 0.15, p.z - 0.22, p.z + 0.22, W);
        }
      }
      const mk = new T.Mesh(M.merge(parts), this.mat(new T.MeshLambertMaterial({ vertexColors: true })));
      mk.receiveShadow = true;
      this.root.add(mk);
    }

    buildBuildings() {
      const map = this.world.map, R = this.root;
      const groups = { apt: [], apt1: [], apt2: [], shop: [], yeshiva: [], police: [] };
      const roofParts = [];
      const signs = [];
      const extra = this.fillerBuildings();
      const all = map.buildings.concat(extra);
      let seed = 1;
      const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
      const heaters = [];
      const wallParts = [];
      for (const B of all) {
        const h = B.h;
        let st = B.style || 'apt';
        if (st === 'pylon') continue;
        // גיוון: שלושה סוגי חזיתות לבנייני מגורים
        if (st === 'apt') { const k = Math.abs(Math.round(B.x0 * 7 + B.z0 * 13)) % 3; if (k) st = 'apt' + k; }
        if (st === 'wall' || st === 'barrier') {
          // קיר אקוסטי / מעקה בטון
          const w = B.x1 - B.x0, d = B.z1 - B.z0, cx = (B.x0 + B.x1) / 2, cz = (B.z0 + B.z1) / 2;
          if (st === 'barrier') {
            wallParts.push(M.part(M.box(w, 0.32, d + 0.25), 0xb9b4aa, cx, 0.16, cz));
            wallParts.push(M.part(M.box(w, h - 0.32, d * 0.7), 0xcbc6bb, cx, 0.32 + (h - 0.32) / 2, cz));
          } else {
            wallParts.push(M.part(M.box(w, h, d), 0xc9cfd2, cx, CURB_H + h / 2, cz));
            wallParts.push(M.part(M.box(w + 0.1, 0.25, d + 0.12), 0x8e979c, cx, CURB_H + h, cz));
            // עמודים כל 4 מטר
            const along = w > d;
            const L = along ? w : d;
            for (let k = 0; k <= L; k += 4) {
              const px = along ? B.x0 + k : cx, pz = along ? cz : B.z0 + k;
              wallParts.push(M.part(M.box(along ? 0.22 : d + 0.16, h + 0.1, along ? d + 0.16 : 0.22), 0x9aa3a8, px, CURB_H + h / 2, pz));
            }
          }
          continue;
        }
        const list = groups[st] || groups.apt;
        const th = st === 'shop' ? h : 3, tw = 4;
        list.push(wall(B.x0, B.z1, B.x1, B.z1, h, CURB_H, tw, th));            // דרום
        list.push(wall(B.x1, B.z0, B.x0, B.z0, h, CURB_H, tw, th));            // צפון
        list.push(wall(B.x1, B.z1, B.x1, B.z0, h, CURB_H, tw, th));            // מזרח
        list.push(wall(B.x0, B.z0, B.x0, B.z1, h, CURB_H, tw, th));            // מערב
        // גג + מעקה
        const roofCol = st === 'shop' ? 0xb9ad98 : 0xcfc3ad;
        roofParts.push(M.part(M.box(B.x1 - B.x0, 0.2, B.z1 - B.z0), roofCol, (B.x0 + B.x1) / 2, h + CURB_H + 0.1, (B.z0 + B.z1) / 2));
        roofParts.push(M.part(M.box(B.x1 - B.x0 + 0.3, 0.6, 0.3), 0xd8ccb5, (B.x0 + B.x1) / 2, h + CURB_H + 0.3, B.z0));
        roofParts.push(M.part(M.box(B.x1 - B.x0 + 0.3, 0.6, 0.3), 0xd8ccb5, (B.x0 + B.x1) / 2, h + CURB_H + 0.3, B.z1));
        roofParts.push(M.part(M.box(0.3, 0.6, B.z1 - B.z0), 0xd8ccb5, B.x0, h + CURB_H + 0.3, (B.z0 + B.z1) / 2));
        roofParts.push(M.part(M.box(0.3, 0.6, B.z1 - B.z0), 0xd8ccb5, B.x1, h + CURB_H + 0.3, (B.z0 + B.z1) / 2));
        if (st.startsWith('apt') && !B.filler) {
          const n = Math.floor((B.x1 - B.x0) * (B.z1 - B.z0) / 90);
          for (let k = 0; k < n; k++) heaters.push({ x: B.x0 + 1.5 + rnd() * (B.x1 - B.x0 - 3), z: B.z0 + 1.5 + rnd() * (B.z1 - B.z0 - 3), y: h + CURB_H + 0.2, r: rnd() < 0.5 ? 0 : 0.15 });
        }
        if (B.sign) signs.push(B);
      }
      const facadeMat = (kind) => {
        const m = this.mat(new T.MeshLambertMaterial({ map: HM.Tex.facade(kind), emissive: 0xffffff, emissiveIntensity: 0 }));
        m.emissiveMap = HM.Tex.facadeGlow();
        return m;
      };
      this.glowMats = [];
      for (const k of Object.keys(groups)) {
        if (!groups[k].length) continue;
        const mat = k === 'shop' ? this.mat(new T.MeshLambertMaterial({ map: HM.Tex.shopfront() })) : facadeMat(k);
        if (k !== 'shop') this.glowMats.push(mat);
        const mesh = new T.Mesh(mergeUV(groups[k]), mat);
        mesh.castShadow = true; mesh.receiveShadow = true;
        R.add(mesh);
      }
      if (wallParts.length) {
        const wm = new T.Mesh(M.merge(wallParts), this.mat(new T.MeshLambertMaterial({ vertexColors: true })));
        wm.castShadow = true; wm.receiveShadow = true;
        R.add(wm);
      }
      const roof = new T.Mesh(M.merge(roofParts), this.mat(new T.MeshLambertMaterial({ vertexColors: true })));
      roof.castShadow = true; roof.receiveShadow = true;
      R.add(roof);
      // דודי שמש על הגגות
      if (heaters.length) {
        const hm = new T.InstancedMesh(M.solarHeater(), this.mat(new T.MeshLambertMaterial({ vertexColors: true })), heaters.length);
        heaters.forEach((h, i) => setM(hm, i, h.x, h.y, h.z, h.r, 0, 0, 1));
        hm.castShadow = true;
        R.add(hm);
      }
      // שלטים
      for (const B of signs) {
        const opts = B.style === 'police' ? { bg: '#1f3a6e' } : B.style === 'yeshiva' ? { bg: '#3b2a1a', fg: '#f2d48a', border: '#c9a75a' } : { bg: '#2f5d50' };
        const tex = HM.Tex.sign(B.sign, opts);
        const m = this.mat(new T.MeshBasicMaterial({ map: tex }));
        const face = this.nearestRoadFace(B);
        const w = Math.min(10, face.len - 1), hh = w * 0.1875;
        const g = new T.PlaneGeometry(w, hh);
        const mesh = new T.Mesh(g, m);
        const y = B.style === 'shop' ? B.h - 0.9 : Math.min(B.h - 1, 6.5);
        mesh.position.set(face.x, y + CURB_H, face.z);
        mesh.rotation.y = face.rot;
        R.add(mesh);
      }
    }

    nearestRoadFace(B) {
      const map = this.world.map;
      const cands = [
        { x: (B.x0 + B.x1) / 2, z: B.z1 + 0.06, rot: 0, len: B.x1 - B.x0 },
        { x: (B.x0 + B.x1) / 2, z: B.z0 - 0.06, rot: Math.PI, len: B.x1 - B.x0 },
        { x: B.x1 + 0.06, z: (B.z0 + B.z1) / 2, rot: Math.PI / 2, len: B.z1 - B.z0 },
        { x: B.x0 - 0.06, z: (B.z0 + B.z1) / 2, rot: -Math.PI / 2, len: B.z1 - B.z0 }
      ];
      let best = cands[0], bd = 1e9;
      for (const c of cands) {
        let d = 1e9;
        for (const r of map.roads) d = Math.min(d, r.axis === 'x' ? Math.abs(c.z - r.c) : Math.abs(c.x - r.c));
        if (d < bd) { bd = d; best = c; }
      }
      return best;
    }

    // גשר המיתרים: תורן לבן נטוי עם כבלים כמו מיתרי נבל (תפאורה)
    buildBridge() {
      const map = this.world.map, R = this.root;
      const r = map.roads.find(q => q.axis === 'x');
      const base = { x: -100, z: r.c - r.halfW - 6.5 };
      const dir = new T.Vector3(0.42, 1, 0.3).normalize();
      const H = 58;
      const parts = [];
      const g = M.cyl(0.7, 1.6, H, 6);
      const top = { x: base.x + dir.x * H, y: dir.y * H, z: base.z + dir.z * H };
      const pm = new T.Mesh(g, this.mat(new T.MeshLambertMaterial({ color: M.lin(0xf4f4f2) })));
      pm.position.set(base.x + dir.x * H / 2, dir.y * H / 2, base.z + dir.z * H / 2);
      pm.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), dir);
      pm.castShadow = true;
      R.add(pm);
      // כבלים: מנקודות לאורך החצי העליון של התורן אל שולי הכביש מערבה (גיאומטריה אחת ממוזגת)
      const N = 18, cables = [];
      const up = new T.Vector3(0, 1, 0), q = new T.Quaternion(), e = new T.Euler();
      for (let i = 0; i < N; i++) {
        const t = 0.45 + 0.55 * i / (N - 1);
        const a = new T.Vector3(base.x + dir.x * H * t, dir.y * H * t, base.z + dir.z * H * t);
        for (const side of [-1, 1]) {
          const b2 = new T.Vector3(-108 - i * 5.2, 1.2, r.c + side * (r.halfW + 0.2));
          const len = a.distanceTo(b2);
          q.setFromUnitVectors(up, b2.clone().sub(a).normalize());
          e.setFromQuaternion(q);
          const mid = a.clone().add(b2).multiplyScalar(0.5);
          cables.push(M.part(M.cyl(0.05, 0.05, len, 4), 0xe8ecef, mid.x, mid.y, mid.z, e.x, e.y, e.z));
        }
      }
      R.add(new T.Mesh(M.merge(cables), this.mat(new T.MeshBasicMaterial({ vertexColors: true }))));
      // מעקה לבן לאורך "הגשר"
      for (const side of [-1, 1]) parts.push(M.part(M.box(110, 1.1, 0.25), 0xf4f4f2, -158, 0.55, r.c + side * (r.halfW + 0.25)));
      const rail = new T.Mesh(M.merge(parts), this.mat(new T.MeshLambertMaterial({ vertexColors: true })));
      rail.castShadow = true;
      R.add(rail);
      void top;
    }

    // בניינים מחוץ לשטח המשחק — שהעיר לא תיגמר בפתאומיות
    fillerBuildings() {
      const map = this.world.map, b = map.bounds, out = [];
      let seed = 99;
      const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
      const sw = map.sidewalk;
      for (const r of map.roads) {
        if (r.axis === 'x') {
          for (const side of [-1, 1]) {
            const zf = r.c + side * (r.halfW + sw + 1.5);
            for (const [a, c] of [[b.x1, b.x1 + 230], [b.x0 - 230, b.x0]]) {
              for (let x = a; x < c - 8; x += 0) {
                const w = 14 + rnd() * 18;
                const d = 12 + rnd() * 10, h = 8 + rnd() * 12;
                out.push({ x0: x, x1: Math.min(c, x + w), z0: side < 0 ? zf - d : zf, z1: side < 0 ? zf : zf + d, h, style: 'apt', filler: true });
                x += w + 3 + rnd() * 4;
              }
            }
          }
        } else {
          for (const side of [-1, 1]) {
            const xf = r.c + side * (r.halfW + sw + 1.5);
            for (const [a, c] of [[b.z1, b.z1 + 200], [b.z0 - 200, b.z0]]) {
              for (let z = a; z < c - 8; z += 0) {
                const w = 14 + rnd() * 16, d = 12 + rnd() * 10, h = 8 + rnd() * 12;
                out.push({ z0: z, z1: Math.min(c, z + w), x0: side < 0 ? xf - d : xf, x1: side < 0 ? xf : xf + d, h, style: 'apt', filler: true });
                z += w + 3 + rnd() * 4;
              }
            }
          }
        }
      }
      return out;
    }

    buildProps(EXT) {
      const map = this.world.map, b = map.bounds, R = this.root, sw = map.sidewalk;
      const trees = [], lamps = [];
      const okSpot = (x, z) => !map.inBuilding(x, z, 1.2) && !map.isRoad(x, z) && !map.plazas.some(p => x > p.x0 - 2 && x < p.x1 + 2 && z > p.z0 - 2 && z < p.z1 + 2);
      const nearJ = (x, z) => map.junctions.some(j => Math.abs(x - j.x) < j.x1 - j.x0 + sw + 6 && Math.abs(z - j.z) < j.z1 - j.z0 + sw + 6);
      for (const r of map.roads) {
        const span = r.axis === 'x' ? [b.x0 - EXT * 0.6, b.x1 + EXT * 0.6] : [b.z0 - EXT * 0.6, b.z1 + EXT * 0.6];
        for (const side of [-1, 1]) {
          const off = r.c + side * (r.halfW + sw - 0.9);
          let k = 0;
          for (let d = span[0]; d < span[1]; d += 11, k++) {
            const x = r.axis === 'x' ? d : off, z = r.axis === 'x' ? off : d;
            if (nearJ(x, z)) continue;
            if (k % 2 === 0) { if (okSpot(x, z)) trees.push({ x, z, r: k * 1.3, s: 0.85 + (k % 3) * 0.12 }); }
            else if (k % 4 === 1) lamps.push({ x, z, r: r.axis === 'x' ? (side < 0 ? 0 : Math.PI) : (side < 0 ? Math.PI / 2 : -Math.PI / 2) });
          }
        }
      }
      // עצים ברחבת הישיבה
      for (const p of map.plazas) {
        if (p.kind !== 'yeshiva') continue;
        trees.push({ x: p.x0 + 3, z: p.z0 + 3, r: 0.4, s: 1.05 }, { x: p.x1 - 3, z: p.z0 + 3, r: 1.1, s: 0.95 });
      }
      const tm = new T.InstancedMesh(M.tree(), this.mat(new T.MeshLambertMaterial({ vertexColors: true })), trees.length);
      trees.forEach((t, i) => setM(tm, i, t.x, CURB_H, t.z, t.r, 0, 0, t.s));
      tm.castShadow = true;
      R.add(tm);
      const lm = new T.InstancedMesh(M.lamp(), this.mat(new T.MeshLambertMaterial({ vertexColors: true })), lamps.length);
      lamps.forEach((t, i) => setM(lm, i, t.x, CURB_H, t.z, t.r, 0, 0, 1));
      lm.castShadow = true;
      R.add(lm);
      this.lampGlowMat = this.mat(new T.MeshBasicMaterial({ color: 0x8a8a80 }));
      const lg = new T.InstancedMesh(M.lampGlow(), this.lampGlowMat, lamps.length);
      lamps.forEach((t, i) => setM(lg, i, t.x, CURB_H, t.z, t.r, 0, 0, 1));
      R.add(lg);

      // רמזורים — ארבעה בפינות כל צומת
      this.lightHeads = [];
      const tlGeo = M.trafficLight();
      const tlMat = this.mat(new T.MeshLambertMaterial({ vertexColors: true }));
      for (const j of map.junctions) {
        let spots = [
          { x: j.x0 - 1.2, z: j.z1 + 1.3, ax: 'x', face: -Math.PI / 2 },   // לנוסעים מזרחה (מערב)
          { x: j.x1 + 1.2, z: j.z0 - 1.3, ax: 'x', face: Math.PI / 2 },
          { x: j.x0 - 1.3, z: j.z0 - 1.2, ax: 'z', face: Math.PI },        // לנוסעים דרומה (צפון)
          { x: j.x1 + 1.3, z: j.z1 + 1.2, ax: 'z', face: 0 }
        ];
        if (j.crossing) spots = spots.slice(0, 2);
        for (const s of spots) {
          const pole = new T.Mesh(tlGeo, tlMat);
          pole.position.set(s.x, CURB_H, s.z); pole.rotation.y = s.face; pole.castShadow = true;
          R.add(pole);
          const head = { ax: s.ax, lamps: [] };
          const cols = [0xd23c32, 0xe6b02e, 0x3cc35a];
          cols.forEach((c, k) => {
            const m = this.mat(new T.MeshBasicMaterial({ color: 0x222222 }));
            const l = new T.Mesh(new T.CircleGeometry(0.1, 12), m);
            l.position.set(0, 3.9 - k * 0.3, 0.16);
            pole.add(l);
            head.lamps.push({ m, on: new T.Color(c), off: new T.Color(0x2a2a2a) });
          });
          this.lightHeads.push(head);
        }
      }

      // ניידת העצורים + ניידות חונות ליד התחנה
      const vb = map.bases.van;
      const vanMat = this.mat(new T.MeshLambertMaterial({ vertexColors: true }));
      this.van = new T.Mesh(M.policeVan(), vanMat);
      this.van.position.set(vb.x, CURB_H, vb.z); this.van.rotation.y = Math.PI / 2; this.van.castShadow = true;
      R.add(this.van);
      this.vanHome = { x: vb.x, z: vb.z };
      const pb = map.bases.police;
      for (let k = 0; k < 3; k++) {
        const pc = new T.Mesh(M.patrolCar(), vanMat);
        pc.position.set(pb.x + 4 + k * 3, CURB_H, pb.z + 4); pc.rotation.y = Math.PI; pc.castShadow = true;
        R.add(pc);
      }
      // מחסומי משטרה ליד התחנה (קישוט)
      const barGeo = M.barrier();
      for (let k = 0; k < 3; k++) {
        const bm = new T.Mesh(barGeo, vanMat);
        bm.position.set(pb.x - 10 + k * 2.4, CURB_H, pb.z - 2); bm.castShadow = true;
        R.add(bm);
      }
    }

    // ================= דינמי =================
    buildDynamic() {
      const R = this.root;
      const pm = this.mat(new T.MeshLambertMaterial({ vertexColors: true }));
      this.people = {
        bochur: inst(M.bochur(), pm, 220, { shadow: false }),
        avrech: inst(M.avrech(), pm, 160),
        askan: inst(M.askan(), pm, 8),
        photographer: inst(M.photographer(), pm, 4),
        cop: inst(M.cop(), pm, 90),
        riot: inst(M.riot(), pm, 24),
        officer: inst(M.officer(), pm, 4),
        rider: inst(M.rider(), pm, 8)
      };
      for (const k in this.people) R.add(this.people[k]);
      this.legs = inst(M.leg(), pm, 1000, { color: true });
      R.add(this.legs);
      this.horses = inst(M.horse(), pm, 8, { shadow: true });
      R.add(this.horses);

      // שלטי מחאה ביד (כל שלישי מחזיק שלט)
      this.signTexts = ['לא זזים!', 'יש לנו זמן', 'צפרו אם אתם תקועים', 'סבלנות, נהגים!', 'סליחה על העיכוב', 'עד השקיעה'];
      const boardGeo = new T.PlaneGeometry(1.0, 0.56);
      this.signs = this.signTexts.map(t => {
        const tex = HM.Tex.placard(t);
        const m = inst(boardGeo, this.mat(new T.MeshLambertMaterial({ map: tex, side: T.DoubleSide })), 80);
        R.add(m);
        return m;
      });
      this.sticks = inst(M.box(0.05, 1.25, 0.05), this.mat(new T.MeshLambertMaterial({ color: M.lin(0x8a6a44) })), 320);
      R.add(this.sticks);

      // צללים עגולים מתחת לדמויות (זול ונקי)
      const sc = document.createElement('canvas'); sc.width = sc.height = 64;
      const g = sc.getContext('2d');
      const grd = g.createRadialGradient(32, 32, 2, 32, 32, 31);
      grd.addColorStop(0, 'rgba(0,0,0,0.42)'); grd.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
      const blobTex = new T.CanvasTexture(sc);
      const blobGeo = new T.PlaneGeometry(1, 1); blobGeo.rotateX(-Math.PI / 2);
      this.blobs = inst(blobGeo, this.mat(new T.MeshBasicMaterial({ map: blobTex, transparent: true, depthWrite: false })), 600);
      this.blobs.renderOrder = 1;
      R.add(this.blobs);

      // מכוניות
      const cm = this.mat(new T.MeshLambertMaterial({ vertexColors: true }));
      this.cars = {};
      for (const t of ['sedan', 'hatch', 'van', 'taxi', 'bus']) {
        this.cars[t] = inst(M.car(t), cm, t === 'bus' ? 60 : 260, { color: true, shadow: true });
        R.add(this.cars[t]);
      }
      this.cars.tram = inst(M.tram(), cm, 8, { color: true, shadow: true });
      R.add(this.cars.tram);
      this.ambMesh = inst(M.ambulance(), cm, 4, { shadow: true, color: true });   // חומר משותף עם מכוניות — חייב צבע מופע
      R.add(this.ambMesh);
      this.kugelMesh = inst(M.kugelTruck(), cm, 2, { shadow: true, color: true });
      R.add(this.kugelMesh);
      const lb = new T.BoxGeometry(0.5, 0.16, 0.3);
      this.ambRed = inst(lb, this.mat(new T.MeshBasicMaterial({ color: 0xff2a2a })), 4);
      this.ambBlue = inst(lb, this.mat(new T.MeshBasicMaterial({ color: 0x2a6bff })), 4);
      R.add(this.ambRed); R.add(this.ambBlue);
      const brakeGeo = new T.PlaneGeometry(0.34, 0.16);
      this.brakes = inst(brakeGeo, this.mat(new T.MeshBasicMaterial({ color: 0xff3a2a, side: T.DoubleSide })), 400);
      R.add(this.brakes);

      // מכת"זית
      this.cannon = new T.Group();
      const cb = new T.Mesh(M.cannonBody(), cm); cb.castShadow = true;
      this.cannonTurret = new T.Mesh(M.cannonTurret(), cm);
      this.cannonTurret.position.set(0, 2.75, 0.4);
      this.cannon.add(cb); this.cannon.add(this.cannonTurret);
      this.cannon.visible = false;
      R.add(this.cannon);
      // סילון מים
      const N = 260;
      this.water = { n: N, pos: new Float32Array(N * 3), vel: new Float32Array(N * 3), life: new Float32Array(N), next: 0 };
      const wg = new T.BufferGeometry();
      wg.setAttribute('position', new T.BufferAttribute(this.water.pos, 3));
      this.waterPts = new T.Points(wg, this.mat(new T.PointsMaterial({ color: 0xcfe8ff, size: 0.32, transparent: true, opacity: 0.8, depthWrite: false })));
      this.waterPts.frustumCulled = false;
      R.add(this.waterPts);

      // טבעות בחירה / סימונים
      const ringGeo = new T.RingGeometry(0.42, 0.56, 24); ringGeo.rotateX(-Math.PI / 2);
      this.rings = inst(ringGeo, this.mat(new T.MeshBasicMaterial({ color: 0x5ee37a, transparent: true, opacity: 0.9, depthWrite: false })), 200);
      this.rings.renderOrder = 2;
      R.add(this.rings);
      this.tRings = inst(ringGeo, this.mat(new T.MeshBasicMaterial({ color: 0xff5a4a, transparent: true, opacity: 0.85, depthWrite: false })), 120);
      this.tRings.renderOrder = 2;
      R.add(this.tRings);
      const dotGeo = new T.CircleGeometry(0.34, 16); dotGeo.rotateX(-Math.PI / 2);
      this.ghost = inst(dotGeo, this.mat(new T.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55, depthWrite: false })), 40);
      this.ghost.renderOrder = 2;
      R.add(this.ghost);
      const laneGeo = new T.PlaneGeometry(1, 1); laneGeo.rotateX(-Math.PI / 2);
      this.laneHi = inst(laneGeo, this.mat(new T.MeshBasicMaterial({ color: 0xff4d3d, transparent: true, opacity: 0.28, depthWrite: false })), 12);
      this.laneHi.renderOrder = 1;
      R.add(this.laneHi);
      // טבעות "בדרך": איפה יופיע כוח שהוזמן (משטרה בתחנה, הסעה ביעד)
      const pendGeo = new T.RingGeometry(0.85, 1.0, 40); pendGeo.rotateX(-Math.PI / 2);
      this.pendBlue = inst(pendGeo, this.mat(new T.MeshBasicMaterial({ color: 0x6ea2ff, transparent: true, opacity: 0.85, depthWrite: false })), 8);
      this.pendGold = inst(pendGeo, this.mat(new T.MeshBasicMaterial({ color: 0xffd96b, transparent: true, opacity: 0.85, depthWrite: false })), 4);
      this.pendBlue.renderOrder = 3; this.pendGold.renderOrder = 3;
      R.add(this.pendBlue); R.add(this.pendGold);
      // מוכר הבייגלה (בדיחה חיה — רק ציור, בלי השפעה על המשחק)
      this.vendor = new T.Mesh(M.vendor(), this.mat(new T.MeshLambertMaterial({ vertexColors: true })));
      this.vendor.castShadow = true;
      this.vendor.visible = false;
      R.add(this.vendor);
      this.vendorState = { on: false, readyAt: 25 };   // לפי שעון המשחק
      // נהגים שיוצאים מהמכונית בפקק ארוך (עד שניים בבת אחת)
      const dmat = this.mat(new T.MeshLambertMaterial({ vertexColors: true }));
      this.driversOut = [0xf1efe8, 0x86a8cf].map(shirt => {
        const m = new T.Mesh(M.driverOut(shirt), dmat);
        m.castShadow = true; m.visible = false; R.add(m);
        return { mesh: m, car: null, t: 0, said: false };
      });
      this.driverNextT = 40;
      const mkGeo = new T.RingGeometry(0.9, 1.2, 32); mkGeo.rotateX(-Math.PI / 2);
      this.marker = new T.Mesh(mkGeo, this.mat(new T.MeshBasicMaterial({ color: 0x5ee37a, transparent: true, opacity: 0, depthWrite: false })));
      this.marker.renderOrder = 3;
      R.add(this.marker);
      this.markerT = 0;
    }

    showMarker(x, z, color, radius) {
      if (radius) {
        // גל דק שמתרחב לרדיוס (כריזה)
        if (!this.pulse) {
          const g = new T.RingGeometry(0.96, 1.0, 72); g.rotateX(-Math.PI / 2);
          this.pulse = new T.Mesh(g, this.mat(new T.MeshBasicMaterial({ color: 0x6ea2ff, transparent: true, opacity: 0, depthWrite: false })));
          this.pulse.renderOrder = 3;
          this.root.add(this.pulse);
        }
        this.pulse.position.set(x, 0.2, z);
        this.pulse.material.color.setHex(color || 0x6ea2ff);
        this.pulseT = 1; this.pulseR = radius;
        return;
      }
      this.marker.position.set(x, this.groundY(x, z) + 0.05, z);
      this.marker.material.color.setHex(color || 0x5ee37a);
      this.markerT = 1;
      this.markerR = 1;
    }
    // עיגול כיוון (כריזה)
    setAim(p, r, color) {
      if (!this.aim) {
        const g = new T.RingGeometry(0.97, 1.0, 64); g.rotateX(-Math.PI / 2);
        this.aim = new T.Mesh(g, this.mat(new T.MeshBasicMaterial({ color: 0x6ea2ff, transparent: true, opacity: 0.9, depthWrite: false })));
        const g2 = new T.CircleGeometry(1, 48); g2.rotateX(-Math.PI / 2);
        this.aimFill = new T.Mesh(g2, this.mat(new T.MeshBasicMaterial({ color: 0x6ea2ff, transparent: true, opacity: 0.12, depthWrite: false })));
        this.aim.renderOrder = 3; this.aimFill.renderOrder = 2;
        this.root.add(this.aim); this.root.add(this.aimFill);
      }
      const on = !!p;
      this.aim.visible = this.aimFill.visible = on;
      if (!on) return;
      this.aim.material.color.setHex(color || 0x6ea2ff);
      this.aimFill.material.color.setHex(color || 0x6ea2ff);
      for (const m of [this.aim, this.aimFill]) { m.position.set(p.x, 0.2, p.z); m.scale.set(r, 1, r); }
    }

    // ---------- עדכון לפריים ----------
    update(alpha, dtReal, ui) {
      const w = this.world;
      const counts = { bochur: 0, avrech: 0, askan: 0, photographer: 0, cop: 0, riot: 0, officer: 0, rider: 0 };
      let li = 0, bi = 0, hi = 0, ri = 0, ti = 0;
      const sel = ui && ui.selected ? ui.selected : null;
      const tgtSet = ui && ui.targetSet ? ui.targetSet : null;
      const legs = this.legs, blobs = this.blobs;
      const now = performance.now() / 1000;
      const sc = this.signs.map(() => 0);
      let sti = 0;
      const camYaw = this.stage.cam.yaw;

      for (const p of w.people) {
        if (p.state === 'detained' || p.state === 'gone') continue;
        const x = U.lerp(p.px, p.x, alpha), z = U.lerp(p.pz, p.z, alpha);
        const gy = this.groundY(x, z);
        const mesh = this.people[p.kind];
        if (!mesh) continue;
        const i = counts[p.kind]++;
        const sp = Math.hypot(p.vx, p.vz);
        const moving = sp > 0.25;
        const ph = p.walkPhase;
        const run = p.squad.fleeT > 0;
        if (p.kind === 'rider') {
          // רוכב על סוס
          const hq = p.squad;
          const gal = moving ? Math.abs(Math.sin(ph * 1.6)) * 0.12 : 0;
          setM(this.horses, hi++, x, gy + gal, z, p.face, moving ? Math.sin(ph * 1.6) * 0.05 : 0, 0, 1);
          setM(mesh, i, x, gy + 1.62 + gal, z - 0, p.face, 0, 0, S);
          const lx = Math.cos(p.face) * 0.26, lz = -Math.sin(p.face) * 0.26;
          setM(legs, li, x + lx, gy + 1.62 + gal, z + lz, p.face, 0.25, -0.5, S); legs.setColorAt(li++, _c.setHex(0x1b273d));
          setM(legs, li, x - lx, gy + 1.62 + gal, z - lz, p.face, 0.25, 0.5, S); legs.setColorAt(li++, _c.setHex(0x1b273d));
          setM(blobs, bi++, x, gy + 0.02, z, p.face, 0, 0, 2.6);
          void hq;
          if (sel && sel.has(p.squad.id)) setM(this.rings, ri++, x, gy + 0.03, z, 0, 0, 0, 2.6);
          if (tgtSet && tgtSet.has(p.squad.id)) setM(this.tRings, ti++, x, gy + 0.03, z, 0, 0, 0, 2.6);
          continue;
        }
        let bodyY = gy + HIP, pitch = 0, roll = 0, legSwing = 0, legPitch = 0;
        if (p.state === 'carried') {
          bodyY = gy + 0.55; pitch = -1.25;
          legPitch = -1.3;
        } else if (p.sit > 0.01) {
          const s = p.sit;
          bodyY = gy + HIP - s * 0.5 * S;
          legPitch = -s * 1.45;
          pitch = -s * 0.08;
        } else if (moving) {
          legSwing = Math.sin(ph * (run ? 1.3 : 1)) * (run ? 0.75 : 0.5);
          bodyY += Math.abs(Math.cos(ph * (run ? 1.3 : 1))) * 0.05;
          pitch = run ? 0.22 : 0.05;
        }
        if (p.state === 'held') { pitch = p.sit > 0.5 ? -0.25 : -0.12; roll = Math.sin(now * 9 + p.id) * 0.06; }
        if (p.state === 'stalled') { roll = Math.sin(now * 2 + p.id) * 0.05; }
        if (p.scare > 0) { bodyY += Math.sin(p.scare * 12) * 0.06; pitch = -0.25; }
        setM(mesh, i, x, bodyY, z, p.face, pitch, roll, S);
        // רגליים
        const lc = p.kind === 'riot' ? 0x1e2631 : p.side === 'police' ? 0x1b273d : (p.kind === 'askan' ? 0x2a2c31 : 0x15151a);
        const lx = Math.cos(p.face) * 0.11 * S, lz = -Math.sin(p.face) * 0.11 * S;
        const hipY = bodyY + (p.state === 'carried' ? 0 : 0);
        setM(legs, li, x + lx, hipY, z + lz, p.face, legSwing + legPitch, p.sit > 0.5 ? 0.12 : 0, S); legs.setColorAt(li++, _c.setHex(lc));
        setM(legs, li, x - lx, hipY, z - lz, p.face, -legSwing + legPitch, p.sit > 0.5 ? -0.12 : 0, S); legs.setColorAt(li++, _c.setHex(lc));
        setM(blobs, bi++, x, gy + 0.02, z, 0, 0, 0, p.sit > 0.5 ? 1.5 : 1.05);
        // שלט ביד
        if (p.side === 'protest' && p.kind !== 'askan' && p.kind !== 'photographer' && p.slotI % 3 === 0 && (p.state === 'free' || p.state === 'returning') && !(p.squad.fleeT > 0)) {
          const si = (p.squad.num + p.slotI) % this.signs.length;
          const sm = this.signs[si];
          if (sc[si] < 80) {
            const hx = x - Math.cos(p.face) * 0.36, hz = z + Math.sin(p.face) * 0.36;
            const top = bodyY + 1.42 * S;
            const sway = Math.sin(now * 2.2 + p.id) * 0.06;
            setM(sm, sc[si]++, hx, top + 0.1, hz, camYaw + sway, -0.32, 0, 1.3);   // שלט גדול מעט — שיהיה אפשר לקרוא
            setM(this.sticks, sti++, hx, top - 0.62, hz, 0, 0, sway, 1);
          }
        }
        if (sel && sel.has(p.squad.id) && p.state !== 'carried') setM(this.rings, ri++, x, gy + 0.03, z, 0, 0, 0, 1);
        if (tgtSet && tgtSet.has(p.squad.id) && p.state !== 'carried') setM(this.tRings, ti++, x, gy + 0.03, z, 0, 0, 0, 1);
      }
      for (const k in this.people) { this.people[k].count = counts[k]; this.people[k].instanceMatrix.needsUpdate = true; }
      legs.count = li; legs.instanceMatrix.needsUpdate = true; if (legs.instanceColor) legs.instanceColor.needsUpdate = true;
      this.signs.forEach((m, k) => { m.count = sc[k]; m.instanceMatrix.needsUpdate = true; });
      this.sticks.count = sti; this.sticks.instanceMatrix.needsUpdate = true;
      this.horses.count = hi; this.horses.instanceMatrix.needsUpdate = true;
      this.rings.count = ri; this.rings.instanceMatrix.needsUpdate = true;
      this.tRings.count = ti; this.tRings.instanceMatrix.needsUpdate = true;

      // ---- מכוניות ----
      const cc = { sedan: 0, hatch: 0, van: 0, taxi: 0, bus: 0, tram: 0 };
      let bri = 0;
      const putCar = (type, x, z, heading, color, braking) => {
        const m = this.cars[type];
        const i = cc[type];
        if (i >= m.instanceMatrix.count) return;
        cc[type]++;
        setM(m, i, x, 0, z, heading, 0, 0, 1);
        m.setColorAt(i, _c.setHex(color));
        if (braking && bri < 398) {
          const L = type === 'tram' ? 30 : type === 'bus' ? 12 : type === 'hatch' ? 3.9 : type === 'van' ? 5.2 : 4.6;
          const W = type === 'tram' ? 2.6 : type === 'bus' ? 2.5 : 1.8;
          const sx = Math.sin(heading), sz = Math.cos(heading);
          const bx = x - sx * (L / 2 + 0.04), bz = z - sz * (L / 2 + 0.04);
          const ox = Math.cos(heading) * (W / 2 - 0.3), oz = -Math.sin(heading) * (W / 2 - 0.3);
          setM(this.brakes, bri++, bx + ox, 0.72, bz + oz, heading, 0, 0, 1);
          setM(this.brakes, bri++, bx - ox, 0.72, bz - oz, heading, 0, 0, 1);
        }
      };
      // מכוניות "מפנות דרך" למכת"זית ולאמבולנס: זזות הצידה בציור כשהרכב הגדול עובר לידן
      const pushers = this._pushers || (this._pushers = []);
      pushers.length = 0;
      for (const sq of w.squads) if (sq.vehicle) pushers.push({ x: sq.vehicle.x, z: sq.vehicle.z, h: sq.vehicle.heading, l: 6.2, wd: 2.6 });
      if (w.amb) for (const a of w.amb.list) pushers.push({ x: a.x, z: a.z, h: a.heading, l: 5.6, wd: 2.2 });
      const nudge = this.nudge || (this.nudge = new Map());
      for (const c of w.traffic.cars) {
        let x = U.lerp(c.px, c.x, alpha), z = U.lerp(c.pz, c.z, alpha);
        if (c.type !== 'tram') {
          const sh = Math.sin(c.heading), ch = Math.cos(c.heading);
          let want = 0;
          for (const pu of pushers) {
            const ex = pu.x - x, ez = pu.z - z;
            const along = ex * sh + ez * ch, lat = ex * ch - ez * sh;
            const dh = pu.h - c.heading, sd = Math.abs(Math.sin(dh)), cd = Math.abs(Math.cos(dh));
            const hA = sd * pu.wd / 2 + cd * pu.l / 2, hL = cd * pu.wd / 2 + sd * pu.l / 2;
            if (Math.abs(along) > c.len / 2 + hA) continue;
            const need = c.wid / 2 + hL + 0.15 - Math.abs(lat);
            if (need > 0) want -= Math.sign(lat || 1) * Math.min(need, 1.5);
          }
          const prev = nudge.get(c.id) || 0;
          const cur = U.approach(prev, U.clamp(want, -1.5, 1.5), dtReal * 2.5);
          if (cur) { nudge.set(c.id, cur); x += ch * cur; z -= sh * cur; } else if (prev) nudge.delete(c.id);
        }
        const col = c.type === 'taxi' ? 0xf2c230 : (c.type === 'bus' || c.type === 'tram') ? 0xffffff : CAR_COLORS[c.color];
        putCar(c.type, x, z, c.heading, col, c.braking || c.v < 0.3);
      }
      // הפקק ממשיך מחוץ למפה — מכוניות עומדות מעבר לקצה
      const types = ['sedan', 'sedan', 'hatch', 'van', 'sedan', 'taxi', 'hatch', 'sedan', 'bus', 'sedan'];
      for (const lane of w.traffic.lanes) {
        const last = lane.cars[lane.cars.length - 1];
        if (!(lane.backlog >= 1 && last && last.jammed)) continue;
        const L = lane.L;
        const n = Math.min(Math.floor(lane.backlog), 40);
        let d = Math.min(-2, last.d - last.len - 2.4);
        for (let k = 0; k < n; k++) {
          const type = types[(k * 7 + L.id * 3) % types.length];
          const len = type === 'bus' ? 12 : type === 'hatch' ? 3.9 : 4.7;
          const c = d - len / 2;
          const x = L.p0.x + L.dx * c, z = L.p0.z + L.dz * c;
          putCar(type, x, z, Math.atan2(L.dx, L.dz), type === 'taxi' ? 0xf2c230 : type === 'bus' ? 0xf4f2ec : CAR_COLORS[(k * 5 + L.id) % 8], true);
          d -= len + 2.4;
        }
      }
      // אוטובוס ההסעה שהוריד מפגינים
      for (const bp of w.busProps || []) {
        let best = null, bd = 1e9;
        for (const r of w.map.roads) {
          const d = r.axis === 'x' ? Math.abs(bp.z - r.c) : Math.abs(bp.x - r.c);
          if (d < bd) { bd = d; best = r; }
        }
        if (!best) continue;
        const side = best.axis === 'x' ? Math.sign(bp.z - best.c) || 1 : Math.sign(bp.x - best.c) || 1;
        const off = best.c + side * (best.halfW - 1.6);
        if (best.axis === 'x') putCar('bus', bp.x, off, side > 0 ? Math.PI / 2 : -Math.PI / 2, 0xffd96b, false);
        else putCar('bus', off, bp.z, side > 0 ? Math.PI : 0, 0xffd96b, false);
      }
      for (const t in this.cars) {
        const m = this.cars[t];
        m.count = cc[t]; m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true;
      }
      this.brakes.count = bri; this.brakes.instanceMatrix.needsUpdate = true;

      // ---- אמבולנסים ----
      let ai = 0, ar = 0, ab = 0, ki = 0;
      if (w.amb) {
        const flash = Math.floor(now * 6) % 2 === 0;
        for (const a of w.amb.list) {
          const x = U.lerp(a.px, a.x, alpha), z = U.lerp(a.pz, a.z, alpha);
          if (a.kind === 'kugel') { setM(this.kugelMesh, ki++, x, 0, z, a.heading, 0, 0, 1); continue; }
          setM(this.ambMesh, ai++, x, 0, z, a.heading, 0, 0, 1);
          const sx = Math.sin(a.heading), sz = Math.cos(a.heading), ox = Math.cos(a.heading) * 0.42, oz = -Math.sin(a.heading) * 0.42;
          const lx = x + sx * 1.6, lz = z + sz * 1.6;
          setM(flash ? this.ambRed : this.ambBlue, flash ? ar++ : ab++, lx + ox, 2.2, lz + oz, a.heading, 0, 0, 1);
          setM(flash ? this.ambBlue : this.ambRed, flash ? ab++ : ar++, lx - ox, 2.2, lz - oz, a.heading, 0, 0, 1);
        }
      }
      this.ambMesh.count = ai; this.ambMesh.instanceMatrix.needsUpdate = true;
      this.kugelMesh.count = ki; this.kugelMesh.instanceMatrix.needsUpdate = true;
      this.ambRed.count = ar; this.ambRed.instanceMatrix.needsUpdate = true;
      this.ambBlue.count = ab; this.ambBlue.instanceMatrix.needsUpdate = true;

      // ---- מכת"זית ----
      const cs = w.squads.find(s => s.type === 'cannon');
      if (cs) {
        const V = cs.vehicle;
        this.cannon.visible = true;
        const x = U.lerp(V.px, V.x, alpha), z = U.lerp(V.pz, V.z, alpha);
        this.cannon.position.set(x, this.groundY(x, z) * 0.0, z);
        this.cannon.rotation.y = V.heading;
        this.cannonTurret.rotation.y = (V.aim !== undefined && V.state === 'spray' ? V.aim : V.heading) - V.heading;
        if (sel && sel.has(cs.id)) { setM(this.rings, ri++, x, 0.05, z, 0, 0, 0, 7); this.rings.count = ri; }
        if (tgtSet && tgtSet.has(cs.id)) { setM(this.tRings, ti++, x, 0.05, z, 0, 0, 0, 7); this.tRings.count = ti; }
        this.updateWater(V, dtReal);
      } else {
        this.cannon.visible = false;
        this.updateWater(null, dtReal);
      }

      // ---- ניידת העצורים ----
      const van = w.van;
      const vy = this.van;
      if (van.state === 'away') {
        vy.position.x = U.approach(vy.position.x, this.vanHome.x + 60, dtReal * 9);
        vy.visible = vy.position.x < this.vanHome.x + 58;
      } else {
        vy.visible = true;
        vy.position.x = U.approach(vy.position.x, this.vanHome.x, dtReal * 9);
      }

      // ---- רמזורים ----
      const L = w.traffic.light;
      for (const h of this.lightHeads) {
        const st = L[h.ax];
        h.lamps[0].m.color.copy(st === 'R' ? h.lamps[0].on : h.lamps[0].off);
        h.lamps[1].m.color.copy(st === 'Y' ? h.lamps[1].on : h.lamps[1].off);
        h.lamps[2].m.color.copy(st === 'G' ? h.lamps[2].on : h.lamps[2].off);
      }

      // ---- כוחות בדרך ----
      let pb = 0, pg = 0;
      const pbase = w.map.bases.police;
      for (const pd of w.pending) {
        const k = 1 - Math.max(0, pd.at - w.t) / 9;              // מתכווץ ככל שמתקרב הרגע
        const pulse = 1 + 0.15 * Math.sin(now * 6);
        if (pd.bus) { if (pg < 4) setM(this.pendGold, pg++, pd.x, this.groundY(pd.x, pd.z) + 0.06, pd.z, 0, 0, 0, (6 - 3 * k) * pulse); }
        else if (pb < 8) setM(this.pendBlue, pb++, pbase.x, CURB_H + 0.06 + pb * 0.01, pbase.z, 0, 0, 0, (5 + pb * 1.4 - 2 * k) * pulse);
      }
      this.pendBlue.count = pb; this.pendBlue.instanceMatrix.needsUpdate = true;
      this.pendGold.count = pg; this.pendGold.instanceMatrix.needsUpdate = true;

      this.updateVendor(dtReal);
      this.updateDriversOut(dtReal);

      // ---- סמן יעד ----
      if (this.markerT > 0) {
        this.markerT = Math.max(0, this.markerT - dtReal * 1.6);
        this.marker.material.opacity = this.markerT * 0.9;
        const s = (1 + (1 - this.markerT) * 0.8) * (this.markerR || 1);
        this.marker.scale.set(s, 1, s);
      }

      if (this.pulseT > 0) {
        this.pulseT = Math.max(0, this.pulseT - dtReal * 1.2);
        const k = (1 - this.pulseT * this.pulseT) * this.pulseR;
        this.pulse.scale.set(Math.max(0.1, k), 1, Math.max(0.1, k));
        this.pulse.material.opacity = this.pulseT * 0.9;
      }

      // ---- שקיעה: חלונות ופנסים ----
      const nf = this.stage.nightF || 0;
      for (const m of this.glowMats) m.emissiveIntensity = nf * 0.75;
      this.lampGlowMat.color.setRGB(0.55 + nf * 0.45, 0.55 + nf * 0.38, 0.52 + nf * 0.15);

      blobs.count = bi; blobs.instanceMatrix.needsUpdate = true;
    }

    updateWater(V, dt) {
      const W = this.water;
      dt = Math.min(dt, 0.05);
      if (V && V.spray) {
        const ax = Math.sin(V.aim), az = Math.cos(V.aim);
        const ox = V.x + Math.sin(V.heading) * 0.4 + ax * 1.4, oz = V.z + Math.cos(V.heading) * 0.4 + az * 1.4;
        for (let k = 0; k < 9; k++) {
          const i = W.next; W.next = (W.next + 1) % W.n;
          W.pos[i * 3] = ox; W.pos[i * 3 + 1] = 3.1; W.pos[i * 3 + 2] = oz;
          const sp = 13 + Math.random() * 3, sx = (Math.random() - 0.5) * 1.6;
          W.vel[i * 3] = ax * sp + az * sx; W.vel[i * 3 + 1] = 3 + Math.random() * 1.5; W.vel[i * 3 + 2] = az * sp - ax * sx;
          W.life[i] = 1.2;
        }
      }
      for (let i = 0; i < W.n; i++) {
        if (W.life[i] <= 0) { W.pos[i * 3 + 1] = -50; continue; }
        W.life[i] -= dt;
        W.vel[i * 3 + 1] -= 12 * dt;
        W.pos[i * 3] += W.vel[i * 3] * dt; W.pos[i * 3 + 1] += W.vel[i * 3 + 1] * dt; W.pos[i * 3 + 2] += W.vel[i * 3 + 2] * dt;
        if (W.pos[i * 3 + 1] < 0.05) { W.pos[i * 3 + 1] = 0.05; W.vel[i * 3] *= 0.3; W.vel[i * 3 + 2] *= 0.3; W.vel[i * 3 + 1] = 0; }
      }
      this.waterPts.geometry.attributes.position.needsUpdate = true;
    }

    // תצוגה מקדימה של פריסה + נתיבים שייחסמו
    setPreview(slots, lanes, x, z) {
      let gi = 0;
      if (slots) for (const s of slots) { if (gi < 40) setM(this.ghost, gi++, s.x, this.groundY(s.x, s.z) + 0.04, s.z, 0, 0, 0, 1); }
      this.ghost.count = gi; this.ghost.instanceMatrix.needsUpdate = true;
      let k = 0;
      if (lanes) {
        const lw = this.world.BAL.traffic.laneW;
        for (const L of lanes) {
          if (k >= 12) break;
          // רצועה אדומה לאורך הנתיב לפני נקודת החסימה (שם יעמוד הפקק)
          const d = this.world.map.laneD(L, x, z);
          const len = 26, c = d - len / 2 - 1;
          const p = this.world.map.lanePos(L, c);
          _e.set(0, 0, 0); _q.setFromEuler(_e);
          _p.set(p.x, 0.03, p.z);
          if (L.axis === 'x') _s.set(len, 1, lw - 0.3); else _s.set(lw - 0.3, 1, len);
          _m.compose(_p, _q, _s);
          this.laneHi.setMatrixAt(k++, _m);
        }
      }
      this.laneHi.count = k; this.laneHi.instanceMatrix.needsUpdate = true;
    }
  }

  HM.View = View;
  HM.View.S = S;
})(typeof window !== 'undefined' ? window : globalThis);
