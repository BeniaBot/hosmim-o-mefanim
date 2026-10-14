/* ניווט: רשת הליכה + חיפוש מסלול (A*) + קו ראייה.
   יש שתי רשתות: להולכי רגל (הכול חוץ מבניינים) ולרכבים (כבישים ורחבות הבסיסים). */
(function (root) {
  'use strict';
  const HM = root.HM || (root.HM = {});

  class Grid {
    constructor(map, cell, walkFn) {
      const b = map.bounds;
      this.cell = cell;
      this.x0 = b.x0; this.z0 = b.z0;
      this.w = Math.ceil((b.x1 - b.x0) / cell);
      this.h = Math.ceil((b.z1 - b.z0) / cell);
      this.walk = new Uint8Array(this.w * this.h);
      for (let j = 0; j < this.h; j++) {
        for (let i = 0; i < this.w; i++) {
          const x = this.x0 + (i + 0.5) * cell, z = this.z0 + (j + 0.5) * cell;
          this.walk[j * this.w + i] = walkFn(x, z) ? 1 : 0;
        }
      }
      // מבני עזר ל-A* (מוקצים פעם אחת)
      const n = this.w * this.h;
      this.g = new Float32Array(n);
      this.parent = new Int32Array(n);
      this.stamp = new Uint32Array(n);
      this.closed = new Uint32Array(n);
      this.cur = 0;
      this.heap = new Int32Array(n);
      this.heapF = new Float32Array(n);
    }
    ci(x) { return Math.floor((x - this.x0) / this.cell); }
    cj(z) { return Math.floor((z - this.z0) / this.cell); }
    ok(i, j) { return i >= 0 && j >= 0 && i < this.w && j < this.h && this.walk[j * this.w + i] === 1; }
    isWalkable(x, z) { return this.ok(this.ci(x), this.cj(z)); }
    center(i, j) { return { x: this.x0 + (i + 0.5) * this.cell, z: this.z0 + (j + 0.5) * this.cell }; }

    // קו ראייה בין שתי נקודות (דגימה בצעדים של חצי תא)
    los(ax, az, bx, bz) {
      const dx = bx - ax, dz = bz - az;
      const L = Math.sqrt(dx * dx + dz * dz);
      const n = Math.ceil(L / (this.cell * 0.5));
      for (let k = 1; k <= n; k++) {
        const t = k / n;
        if (!this.isWalkable(ax + dx * t, az + dz * t)) return false;
      }
      return true;
    }

    // התא ההליך הקרוב ביותר לנקודה (חיפוש טבעתי)
    nearestWalkable(x, z) {
      const i0 = this.ci(x), j0 = this.cj(z);
      if (this.ok(i0, j0)) return { x, z };
      for (let r = 1; r < 40; r++) {
        let best = null, bd = 1e9;
        for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) {
          if (Math.abs(di) !== r && Math.abs(dj) !== r) continue;
          if (!this.ok(i0 + di, j0 + dj)) continue;
          const c = this.center(i0 + di, j0 + dj);
          const d = (c.x - x) * (c.x - x) + (c.z - z) * (c.z - z);
          if (d < bd) { bd = d; best = c; }
        }
        if (best) return best;
      }
      return { x, z };
    }

    // A* עם שמונה שכנים. מחזיר רשימת נקודות (בלי נקודת ההתחלה), מוחלקת.
    path(ax, az, bx, bz) {
      if (this.los(ax, az, bx, bz)) return [{ x: bx, z: bz }];
      const s = this.nearestWalkable(ax, az), t = this.nearestWalkable(bx, bz);
      const si = this.ci(s.x), sj = this.cj(s.z), ti = this.ci(t.x), tj = this.cj(t.z);
      if (!this.ok(si, sj) || !this.ok(ti, tj)) return [{ x: bx, z: bz }];
      const W = this.w;
      this.cur++;
      const cur = this.cur, g = this.g, parent = this.parent, stamp = this.stamp, closed = this.closed;
      const heap = this.heap, heapF = this.heapF;
      let hn = 0;
      const push = (idx, f) => {
        let k = hn++;
        heap[k] = idx; heapF[k] = f;
        while (k > 0) {
          const p = (k - 1) >> 1;
          if (heapF[p] <= heapF[k]) break;
          const ti2 = heap[p]; heap[p] = heap[k]; heap[k] = ti2;
          const tf = heapF[p]; heapF[p] = heapF[k]; heapF[k] = tf;
          k = p;
        }
      };
      const pop = () => {
        const top = heap[0];
        hn--;
        if (hn > 0) {
          heap[0] = heap[hn]; heapF[0] = heapF[hn];
          let k = 0;
          for (;;) {
            const l = 2 * k + 1, r = l + 1;
            let m = k;
            if (l < hn && heapF[l] < heapF[m]) m = l;
            if (r < hn && heapF[r] < heapF[m]) m = r;
            if (m === k) break;
            const ti2 = heap[m]; heap[m] = heap[k]; heap[k] = ti2;
            const tf = heapF[m]; heapF[m] = heapF[k]; heapF[k] = tf;
            k = m;
          }
        }
        return top;
      };
      const hfun = (i, j) => {
        const dx = Math.abs(i - ti), dz = Math.abs(j - tj);
        return (dx + dz) + (1.4142 - 2) * Math.min(dx, dz);
      };
      const start = sj * W + si, goal = tj * W + ti;
      stamp[start] = cur; g[start] = 0; parent[start] = -1;
      push(start, hfun(si, sj));
      let found = false, iter = 0;
      while (hn > 0 && iter++ < 60000) {
        const idx = pop();
        if (closed[idx] === cur) continue;
        closed[idx] = cur;
        if (idx === goal) { found = true; break; }
        const i = idx % W, j = (idx - i) / W;
        for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
          if (!di && !dj) continue;
          const ni = i + di, nj = j + dj;
          if (!this.ok(ni, nj)) continue;
          if (di && dj && (!this.ok(i + di, j) || !this.ok(i, j + dj))) continue; // לא חותכים פינות
          const nIdx = nj * W + ni;
          if (closed[nIdx] === cur) continue;
          const ng = g[idx] + (di && dj ? 1.4142 : 1);
          if (stamp[nIdx] !== cur || ng < g[nIdx]) {
            stamp[nIdx] = cur; g[nIdx] = ng; parent[nIdx] = idx;
            push(nIdx, ng + hfun(ni, nj));
          }
        }
      }
      if (!found) return [{ x: t.x, z: t.z }];
      const cells = [];
      for (let k = goal; k !== -1; k = parent[k]) cells.push(k);
      cells.reverse();
      const pts = cells.map(k => this.center(k % W, Math.floor(k / W)));
      pts[pts.length - 1] = { x: t.x, z: t.z };
      // החלקה: מדלגים על נקודות כל עוד יש קו ראייה
      const out = [];
      let ax2 = ax, az2 = az, k = 0;
      while (k < pts.length) {
        let far = k;
        for (let q = pts.length - 1; q > k; q--) {
          if (this.los(ax2, az2, pts[q].x, pts[q].z)) { far = q; break; }
        }
        out.push(pts[far]);
        ax2 = pts[far].x; az2 = pts[far].z;
        k = far + 1;
      }
      return out;
    }
  }

  function buildNav(map) {
    const foot = new Grid(map, 1, (x, z) => !map.inBuilding(x, z, 0.45));
    const inZone = (x, z) => map.vehicleZones.some(p => x >= p.x0 && x <= p.x1 && z >= p.z0 && z <= p.z1);
    const car = new Grid(map, 1, (x, z) => !map.inBuilding(x, z, 1.4) && (map.isRoad(x, z) || inZone(x, z)));
    return { foot, car };
  }

  HM.Grid = Grid;
  HM.buildNav = buildNav;
})(typeof window !== 'undefined' ? window : globalThis);
