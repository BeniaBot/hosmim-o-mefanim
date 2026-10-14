/* מיני-מפה: כבישים, בניינים, חוליות ומה שהמצלמה רואה. לחיצה מזיזה את המצלמה. */
(function (root) {
  'use strict';
  const HM = root.HM || (root.HM = {});
  const T = root.THREE;

  class Minimap {
    constructor(game) {
      this.g = game;
      this.cv = document.getElementById('minimap');
      this.ctx = this.cv.getContext('2d');
      this.t = 0;
      this.cv.addEventListener('pointerdown', (e) => this.click(e));
      this.cv.addEventListener('pointermove', (e) => { if (e.buttons & 1) this.click(e); });
    }

    bind(world) {
      this.w = world;
      const b = world.map.bounds;
      const W = this.cv.width, H = this.cv.height;
      this.k = Math.min(W / (b.x1 - b.x0), H / (b.z1 - b.z0));
      this.ox = (W - (b.x1 - b.x0) * this.k) / 2;
      this.oz = (H - (b.z1 - b.z0) * this.k) / 2;
      // שכבה סטטית
      const s = document.createElement('canvas');
      s.width = W; s.height = H;
      const g = s.getContext('2d');
      g.fillStyle = '#2a2722'; g.fillRect(0, 0, W, H);
      const m = world.map;
      g.fillStyle = '#3d3a34';
      for (const p of m.plazas) this.rect(g, p.x0, p.z0, p.x1, p.z1);
      g.fillStyle = '#56524a';
      for (const r of m.roads) {
        if (r.axis === 'x') this.rect(g, b.x0, r.c - r.halfW - m.sidewalk, b.x1, r.c + r.halfW + m.sidewalk);
        else this.rect(g, r.c - r.halfW - m.sidewalk, b.z0, r.c + r.halfW + m.sidewalk, b.z1);
      }
      g.fillStyle = '#7d7a73';
      for (const r of m.roads) {
        if (r.axis === 'x') this.rect(g, b.x0, r.c - r.halfW, b.x1, r.c + r.halfW);
        else this.rect(g, r.c - r.halfW, b.z0, r.c + r.halfW, b.z1);
      }
      for (const B of m.buildings) {
        g.fillStyle = B.style === 'wall' || B.style === 'barrier' ? '#a7adb1' : B.style === 'yeshiva' ? '#b08a4a' : B.style === 'police' ? '#3e5f96' : '#1b1916';
        this.rect(g, B.x0, B.z0, B.x1, B.z1);
      }
      this.bg = s;
    }
    px(x) { return this.ox + (x - this.w.map.bounds.x0) * this.k; }
    pz(z) { return this.oz + (z - this.w.map.bounds.z0) * this.k; }
    rect(g, x0, z0, x1, z1) { g.fillRect(this.px(x0), this.pz(z0), (x1 - x0) * this.k, (z1 - z0) * this.k); }

    update(dt) {
      if (!this.w) return;
      this.t -= dt;
      if (this.t > 0) return;
      this.t = 0.15;
      const g = this.ctx, w = this.w;
      g.drawImage(this.bg, 0, 0);
      // פקק בכניסות
      for (const k in w.map.arms) {
        const km = w.traffic.armJam[k] || 0;
        if (km < 0.05) continue;
        const a = w.map.arms[k];
        g.fillStyle = `rgba(230,70,50,${Math.min(0.9, 0.3 + km)})`;
        g.beginPath(); g.arc(this.px(a.x), this.pz(a.z), 3 + Math.min(6, km * 4), 0, Math.PI * 2); g.fill();
      }
      // מכוניות עומדות (נקודות קטנות)
      g.fillStyle = 'rgba(255,170,150,0.55)';
      for (const c of w.traffic.cars) if (c.jammed) g.fillRect(this.px(c.x) - 0.7, this.pz(c.z) - 0.7, 1.4, 1.4);
      // אמבולנסים
      if (w.amb) for (const a of w.amb.list) { g.fillStyle = '#ffffff'; g.fillRect(this.px(a.x) - 2, this.pz(a.z) - 2, 4, 4); }
      // חוליות
      const sel = this.g.input.selected;
      for (const sq of w.squads) {
        if (sq.broken && !sq.members.length) continue;
        let x, z;
        if (sq.vehicle) { x = sq.vehicle.x; z = sq.vehicle.z; }
        else if (sq.members.length) { const c = HM.Units.centroid(sq); x = c.x; z = c.z; } else continue;
        g.fillStyle = sq.side === 'protest' ? '#f2b83a' : '#5b8ff0';
        const r = sq.vehicle ? 3.2 : 2.4 + Math.min(1.5, sq.members.length * 0.25);
        g.beginPath(); g.arc(this.px(x), this.pz(z), r, 0, Math.PI * 2); g.fill();
        if (sel.has(sq.id)) { g.strokeStyle = '#7ef09a'; g.lineWidth = 1.5; g.stroke(); }
      }
      // מה שהמצלמה רואה
      const pts = this.viewQuad();
      if (pts) {
        g.strokeStyle = 'rgba(255,255,255,0.85)'; g.lineWidth = 1;
        g.beginPath();
        pts.forEach((p, i) => { const X = this.px(p.x), Z = this.pz(p.z); if (i) g.lineTo(X, Z); else g.moveTo(X, Z); });
        g.closePath(); g.stroke();
      }
    }

    viewQuad() {
      const st = this.g.stage, cam = st.camera;
      const ray = new T.Raycaster(), v = new T.Vector2(), pl = new T.Plane(new T.Vector3(0, 1, 0), 0), hit = new T.Vector3();
      const out = [];
      for (const [x, y] of [[-1, 1], [1, 1], [1, -1], [-1, -1]]) {
        v.set(x, y);
        ray.setFromCamera(v, cam);
        if (!ray.ray.intersectPlane(pl, hit)) return null;
        out.push({ x: hit.x, z: hit.z });
      }
      return out;
    }

    click(e) {
      if (!this.w) return;
      const r = this.cv.getBoundingClientRect();
      const sx = (e.clientX - r.left) / r.width * this.cv.width, sz = (e.clientY - r.top) / r.height * this.cv.height;
      const b = this.w.map.bounds;
      const x = b.x0 + (sx - this.ox) / this.k, z = b.z0 + (sz - this.oz) / this.k;
      this.g.camGoal = { x, z };
      e.stopPropagation();
    }
  }

  HM.Minimap = Minimap;
})(typeof window !== 'undefined' ? window : globalThis);
