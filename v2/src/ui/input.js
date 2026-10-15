/* קלט: עכבר ומקלדת. בחירה, פקודות, מצלמה. מקשים לפי המיקום הפיזי (e.code) —
   עובד גם כשהמקלדת על עברית. */
(function (root) {
  'use strict';
  const HM = root.HM || (root.HM = {});
  const U = HM.U;
  const T = root.THREE;
  const $ = (id) => document.getElementById(id);

  const ray = new T.Raycaster(), ndc = new T.Vector2(), plane = new T.Plane(new T.Vector3(0, 1, 0), 0), hit = new T.Vector3();

  class Input {
    constructor(game) {
      this.g = game;
      this.selected = new Set();
      this.targetSet = new Set();
      this.keys = new Set();
      this.mouse = { x: 0, y: 0, inside: false };
      this.drag = null;
      this.hover = null;
      this.lastClick = { t: 0, id: null };
      const c = game.stage.renderer.domElement;
      this.canvas = c;
      c.addEventListener('pointerdown', (e) => this.down(e));
      root.addEventListener('pointermove', (e) => this.move(e));
      root.addEventListener('pointerup', (e) => this.up(e));
      c.addEventListener('wheel', (e) => { e.preventDefault(); this.zoom(e.deltaY > 0 ? 1.12 : 1 / 1.12); }, { passive: false });
      c.addEventListener('contextmenu', (e) => e.preventDefault());
      c.addEventListener('pointerleave', () => { this.mouse.inside = false; });
      c.addEventListener('pointerenter', () => { this.mouse.inside = true; });
      root.addEventListener('keydown', (e) => this.keyDown(e));
      root.addEventListener('keyup', (e) => this.keys.delete(e.code));
      root.addEventListener('blur', () => { this.keys.clear(); this.drag = null; $('selrect').style.display = 'none'; });
    }

    bind(world) {
      this.w = world;
      this.selected.clear();
      this.targetSet.clear();
      this.drag = null;
      this.mouse.moved = 0;   // גלילה בקצה רק אחרי שהעכבר באמת זז בתוך המשחק
    }

    get side() { return this.g.side; }
    active() { return this.g.mode === 'play' && this.w && !this.w.outcome; }

    // ---------- עכבר ----------
    groundAt(sx, sy) {
      const st = this.g.stage;
      ndc.set(sx / st.w * 2 - 1, -(sy / st.h) * 2 + 1);
      ray.setFromCamera(ndc, st.camera);
      if (!ray.ray.intersectPlane(plane, hit)) return null;
      return { x: hit.x, z: hit.z };
    }

    // החוליה הקרובה לסמן (לפי מיקום האנשים על המסך)
    pickSquad(sx, sy, sideFilter, radius) {
      const hud = this.g.hud;
      const r = radius || 26;
      let best = null, bd = r * r;
      for (const sq of this.w.squads) {
        if (sideFilter && sq.side !== sideFilter) continue;
        if (sq.broken) continue;
        const pts = sq.vehicle ? [{ x: sq.vehicle.x, z: sq.vehicle.z, y: 1.5 }] : sq.members.map(p => ({ x: p.x, z: p.z, y: 1.1 }));
        for (const p of pts) {
          const s = hud.project(p.x, p.y, p.z);
          if (!s) continue;
          const d = (s.x - sx) * (s.x - sx) + (s.y - sy) * (s.y - sy);
          if (d < bd) { bd = d; best = sq; }
        }
      }
      return best;
    }

    down(e) {
      if (this.g.mode !== 'play') return;
      HM.Audio.init();
      this.mouse.x = e.clientX; this.mouse.y = e.clientY;
      this.canvas.setPointerCapture && this.canvas.setPointerCapture(e.pointerId);
      if (e.button === 0 && !e.altKey) this.drag = { kind: 'select', x0: e.clientX, y0: e.clientY, moved: false, shift: e.shiftKey || e.ctrlKey };
      else if (e.button === 2) this.drag = { kind: 'pan', x0: e.clientX, y0: e.clientY, lx: e.clientX, ly: e.clientY, moved: false };
      else if (e.button === 1 || (e.button === 0 && e.altKey)) { e.preventDefault(); this.drag = { kind: 'rotate', lx: e.clientX, ly: e.clientY, moved: true }; }
    }

    move(e) {
      if (this.mouse.inside && this.g.mode === 'play') this.mouse.moved += Math.abs(e.clientX - this.mouse.x) + Math.abs(e.clientY - this.mouse.y);
      this.mouse.x = e.clientX; this.mouse.y = e.clientY;
      const d = this.drag;
      if (!d) return;
      const dx = e.clientX - (d.lx !== undefined ? d.lx : d.x0), dy = e.clientY - (d.ly !== undefined ? d.ly : d.y0);
      if (d.kind === 'select') {
        if (Math.abs(e.clientX - d.x0) + Math.abs(e.clientY - d.y0) > 7) d.moved = true;
        if (d.moved) {
          const r = $('selrect');
          r.style.display = 'block';
          r.style.left = Math.min(d.x0, e.clientX) + 'px'; r.style.top = Math.min(d.y0, e.clientY) + 'px';
          r.style.width = Math.abs(e.clientX - d.x0) + 'px'; r.style.height = Math.abs(e.clientY - d.y0) + 'px';
        }
      } else if (d.kind === 'pan') {
        if (Math.abs(e.clientX - d.x0) + Math.abs(e.clientY - d.y0) > 6) d.moved = true;
        if (d.moved) this.panScreen(dx, dy);
        d.lx = e.clientX; d.ly = e.clientY;
      } else if (d.kind === 'rotate') {
        const cam = this.g.stage.cam;
        cam.yaw -= dx * 0.006;
        cam.pitch = U.clamp(cam.pitch + dy * 0.004, 0.55, 1.35);
        d.lx = e.clientX; d.ly = e.clientY;
      }
    }

    up(e) {
      const d = this.drag;
      this.drag = null;
      $('selrect').style.display = 'none';
      if (!d || !this.active()) return;
      if (d.kind === 'select') {
        if (d.moved) this.boxSelect(d.x0, d.y0, e.clientX, e.clientY, d.shift);
        else this.click(e.clientX, e.clientY, d.shift);
      } else if (d.kind === 'pan' && !d.moved) {
        if (this.aim) { this.aim = null; return; }
        this.command(e.clientX, e.clientY);
      }
    }

    // ביצוע כלי שמכוונים למקום (כריזה / הסעה)
    fireAim(x, z) {
      const kind = this.aim;
      this.aim = null;
      if (kind === 'megaphone') {
        const r = this.w.cmd('police', { type: 'megaphone', x, z });
        if (r.ok) this.g.view.showMarker(x, z, 0x6ea2ff, this.w.BAL.police.megaphone.range);
      } else if (kind === 'bus') {
        const r = this.w.cmd('protest', { type: 'bus', x, z });
        if (r.ok) { this.g.view.showMarker(x, z, 0xffd96b); HM.Audio.chime(true); }
        else {
          const msg = r.reason === 'place' ? 'ההסעה צריכה לעצור על מדרכה, לא על הכביש ולא ליד תחנת המשטרה' : r.reason === 'money' ? 'אין מספיק כסף להסעה' : 'ההסעה עוד לא מוכנה';
          this.g.hud.alert(msg, 'info', 'bus', 'busfail');
          if (r.reason === 'place') this.aim = 'bus';   // נותנים לנסות שוב
        }
      }
    }
    click(sx, sy, additive) {
      if (this.aim) {
        const gp = this.groundAt(sx, sy);
        if (gp) this.fireAim(gp.x, gp.z); else this.aim = null;
        return;
      }
      // כשכבר יש בחירה, לחיצה ליד החוליות שלכם היא בדרך כלל פקודה ("קדימה לכביש") —
      // בוחרים חוליה אחרת רק בלחיצה ממש עליה (או על השלט שלה)
      const own = this.pickSquad(sx, sy, this.side, this.selected.size ? 10 : 26);
      if (own) { this.selectClick(own, additive); return; }
      if (this.selected.size) { this.command(sx, sy); return; }
      // לחיצה על מקום ריק בלי בחירה — רמז
      this.g.hud.alert('קודם בוחרים חוליה: לחצו על השלט שלה', 'info', null, 'needsel');
    }

    badgeClick(id, e) {
      if (!this.active()) return;
      HM.Audio.init();
      const sq = this.w.squadById(id);
      if (!sq) return;
      if (this.aim) {
        const c = HM.Units.centroid(sq);
        this.fireAim(c.x, c.z);
        return;
      }
      if (sq.side === this.side) {
        if (e.button === 2 && this.selected.size) { this.commandAt(HM.Units.centroid(sq).x, HM.Units.centroid(sq).z); return; }
        this.selectClick(sq, e.shiftKey || e.ctrlKey);
      } else if (this.selected.size) {
        this.commandOnEnemy(sq);
      }
    }

    selectClick(sq, additive) {
      const now = performance.now();
      if (this.lastClick.id === sq.id && now - this.lastClick.t < 350) { this.selectType(sq); this.lastClick.t = 0; return; }
      this.lastClick = { t: now, id: sq.id };
      if (additive) { if (this.selected.has(sq.id)) this.selected.delete(sq.id); else this.selected.add(sq.id); }
      else { this.selected.clear(); this.selected.add(sq.id); }
      HM.Audio.click();
      this.g.onSelect && this.g.onSelect();
      this.g.hud.updateSelection(true);
    }

    selectType(sq) {
      this.selected.clear();
      for (const s of this.w.squads) if (s.side === this.side && s.type === sq.type && !s.broken && s.members.length) this.selected.add(s.id);
      this.g.hud.updateSelection(true);
    }

    boxSelect(x0, y0, x1, y1, additive) {
      const a = Math.min(x0, x1), b = Math.max(x0, x1), c = Math.min(y0, y1), d = Math.max(y0, y1);
      if (!additive) this.selected.clear();
      for (const sq of this.w.squads) {
        if (sq.side !== this.side || sq.broken) continue;
        const pts = sq.vehicle ? [sq.vehicle] : sq.members;
        for (const p of pts) {
          const s = this.g.hud.project(p.x, 1, p.z);
          if (s && s.x >= a && s.x <= b && s.y >= c && s.y <= d) { this.selected.add(sq.id); break; }
        }
      }
      if (this.selected.size) { HM.Audio.click(); this.g.onSelect && this.g.onSelect(); }
      this.g.hud.updateSelection(true);
    }

    selectedSquads() {
      const out = [];
      for (const id of this.selected) {
        const s = this.w.squadById(id);
        if (s && !s.broken && (s.members.length || s.vehicle)) out.push(s); else this.selected.delete(id);
      }
      return out;
    }

    command(sx, sy) {
      if (!this.selected.size) return;
      const enemy = this.pickSquad(sx, sy, this.side === 'protest' ? 'police' : 'protest');
      if (enemy && this.side === 'police') { this.commandOnEnemy(enemy); return; }
      const g = this.groundAt(sx, sy);
      if (!g) return;
      this.commandAt(g.x, g.z);
    }

    commandAt(x, z) {
      const w = this.w;
      if (!w.map.inBounds(x, z, 2)) return;
      const sqs = this.selectedSquads();
      if (!sqs.length) return;
      const r = w.cmd(this.side, { type: 'move', squads: sqs.map(s => s.id), x, z });
      if (r.ok) {
        const onRoad = w.map.isRoad(x, z);
        this.g.view.showMarker(x, z, onRoad ? 0xffb347 : 0x5ee37a);
        HM.Audio.click();
        this.g.onCommand && this.g.onCommand('move', { x, z, onRoad, squads: sqs });
        if (sqs.some(s => s.fleeT > 0)) this.g.hud.alert('חוליה בורחת כרגע — היא תקשיב לפקודות בעוד רגע', 'info', null, 'fleeing');
      }
    }

    commandOnEnemy(enemy) {
      const sqs = this.selectedSquads();
      if (!sqs.length) return;
      if (this.side === 'police') {
        const r = this.w.cmd('police', { type: 'target', squads: sqs.map(s => s.id), target: enemy.id });
        if (r.ok) {
          HM.Audio.click();
          const c = HM.Units.centroid(enemy);
          this.g.view.showMarker(c.x, c.z, 0xff5a4a);
          this.g.onCommand && this.g.onCommand('target', { target: enemy.id });
        } else this.g.hud.alert('החוליות שנבחרו לא יכולות לטפל במטרה הזו כרגע', 'info', null, 'tgtfail');
      } else {
        const c = HM.Units.centroid(enemy);
        this.commandAt(c.x, c.z);
      }
    }

    stance(st) {
      if (!this.active()) return;
      const ids = this.selectedSquads().map(s => s.id);
      if (!ids.length) return;
      this.w.cmd('protest', { type: 'stance', squads: ids, stance: st });
      HM.Audio.click();
      if (st === 'sit') {
        const sq = this.w.squadById(ids[0]);
        if (sq && sq.members[0] && Math.random() < 0.6) this.g.hud.bubble(HM.TXT.pick(HM.TXT.LINES.sit), sq.members[0].x, sq.members[0].z);
      }
      this.g.onCommand && this.g.onCommand('stance', { st });
      this.g.hud.updateSelection(true);
    }
    toggleStance() {
      const sqs = this.selectedSquads().filter(s => s.type !== 'askan');
      if (!sqs.length) return;
      const sitting = sqs.filter(s => s.stance === 'sit').length * 2 >= sqs.length;
      this.stance(sitting ? 'stand' : 'sit');
    }
    permit() {
      if (!this.active()) return;
      let sq = this.selectedSquads().find(s => s.type === 'askan');
      if (!sq) sq = this.w.squads.find(s => s.side === 'protest' && s.type === 'askan' && !s.broken && s.members.length && !(s.cd.permit > 0));
      if (!sq) { this.g.hud.alert('אין עסקן פנוי. אפשר להזמין אחד מלוח התגבורת (C)', 'info', null, 'noaskan'); return; }
      const r = this.w.cmd('protest', { type: 'permit', squad: sq.id });
      if (!r.ok) {
        const msg = r.reason === 'noTarget' ? 'אין שוטרים קרובים לעסקן — קרבו אותו אליהם (עד 10 מטר)' : r.reason === 'cooldown' ? 'העסקן עוד מתאושש מהשיחה הקודמת' : 'העסקן עסוק כרגע';
        this.g.hud.alert(msg, 'info', 'askan', 'permitfail');
      }
    }

    refill() {
      if (!this.active() || this.side !== 'police') return;
      const ids = this.selectedSquads().filter(s => s.vehicle).map(s => s.id);
      if (!ids.length) { this.g.hud.alert('בחרו קודם את המכת"זית', 'info', 'cannon', 'selcannon'); return; }
      this.w.cmd('police', { type: 'refill', squads: ids });
      HM.Audio.click();
    }
    toSidewalk() {
      if (!this.active() || this.side !== 'police') return;
      const sqs = this.selectedSquads().filter(s => !s.vehicle);
      for (const s of sqs) {
        const c = HM.Units.centroid(s);
        const p = this.w.map.nearestSidewalk(c.x, c.z);
        this.w.cmd('police', { type: 'move', squads: [s.id], x: p.x, z: p.z });
      }
      if (sqs.length) HM.Audio.click();
    }

    // חוליות שנשברו / נעצרו כולן לא נשארות "בחורות" בלי שרואים
    pruneSel() {
      if (!this.w) return;
      for (const id of [...this.selected]) {
        const s = this.w.squadById(id);
        if (!s || s.broken || !(s.members.length || s.vehicle)) this.selected.delete(id);
      }
    }

    // ---------- מקלדת ----------
    keyDown(e) {
      const g = this.g;
      if (e.target && (e.target.tagName === 'INPUT')) return;
      this.keys.add(e.code);
      if (g.mode === 'menu' || g.mode === 'end') return;
      if (e.code === 'Space' || e.code === 'KeyP' || e.code === 'Escape') {
        e.preventDefault();
        if (e.code === 'Escape' && this.aim && g.mode === 'play') { this.aim = null; return; }
        this.pruneSel();
        if (e.code === 'Escape' && this.selected.size && g.mode === 'play') { this.selected.clear(); g.hud.updateSelection(true); return; }
        g.togglePause();
        return;
      }
      if (g.mode !== 'play') return;
      if (e.code === 'F1' || e.code === 'KeyH') { e.preventDefault(); g.showHelp(); return; }
      if (e.code === 'KeyT') { g.toggleSpeed(); return; }
      if (e.code === 'Home') { g.resetCam(); return; }
      if (e.code === 'KeyM') { g.toggleMute(); return; }
      if (e.code === 'Tab') { e.preventDefault(); this.cycleSelect(); return; }
      if (e.code.startsWith('Digit')) {
        const n = +e.code.slice(5);
        const sq = this.w.squads.find(s => s.side === this.side && s.num === n && !s.broken && (s.members.length || s.vehicle));
        if (sq) { this.selectClick(sq, e.shiftKey || e.ctrlKey); if (this.lastDigit === n && performance.now() - this.lastDigitT < 400) this.focus(sq); this.lastDigit = n; this.lastDigitT = performance.now(); }
        return;
      }
      if (e.code === 'KeyA' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        this.selected.clear();
        for (const s of this.w.squads) if (s.side === this.side && !s.broken && (s.members.length || s.vehicle)) this.selected.add(s.id);
        g.hud.updateSelection(true);
        return;
      }
      if (this.side === 'police') {
        if (e.code === 'KeyZ') { g.useCard('patrol'); return; }
        if (e.code === 'KeyX') { g.useCard('horses'); return; }
        if (e.code === 'KeyC') { g.useCard('cannon'); return; }
        if (e.code === 'KeyB') { g.useCard('riot'); return; }
        if (e.code === 'KeyN') { g.useCard('officer'); return; }
        if (e.code === 'KeyV') { g.useCard('megaphone'); return; }
        if (e.code === 'KeyR') { this.refill(); return; }
        if (e.code === 'KeyG') { this.toSidewalk(); return; }
      }
      if (this.side === 'protest') {
        if (e.code === 'KeyS' && this.selected.size) { this.toggleStance(); return; }
        if (e.code === 'KeyF') { this.permit(); return; }
        if (e.code === 'KeyZ') { g.useCard('bochurim'); return; }
        if (e.code === 'KeyX') { g.useCard('avrechim'); return; }
        if (e.code === 'KeyC') { g.useCard('askan'); return; }
        if (e.code === 'KeyV') { g.useCard('shofar'); return; }
        if (e.code === 'KeyB') { g.useCard('photographer'); return; }
        if (e.code === 'KeyN') { g.useCard('bus'); return; }
      }
      if (e.code === 'Equal' || e.code === 'NumpadAdd') this.zoom(1 / 1.15);
      if (e.code === 'Minus' || e.code === 'NumpadSubtract') this.zoom(1.15);
    }

    cycleSelect() {
      const mine = this.w.squads.filter(s => s.side === this.side && !s.broken && (s.members.length || s.vehicle)).sort((a, b) => a.num - b.num);
      if (!mine.length) return;
      const cur = [...this.selected][0];
      let i = mine.findIndex(s => s.id === cur);
      const next = mine[(i + 1) % mine.length];
      this.selected.clear(); this.selected.add(next.id);
      this.focus(next);
      this.g.hud.updateSelection(true);
    }

    focus(sq) {
      const c = HM.Units.centroid(sq);
      this.g.camGoal = { x: c.x, z: c.z };
    }

    // ---------- מצלמה ----------
    zoom(f) {
      const cam = this.g.stage.cam;
      cam.dist = U.clamp(cam.dist * f, 26, 170);
    }
    panScreen(dx, dy) {
      const cam = this.g.stage.cam;
      const k = cam.dist * 0.0016;
      const s = Math.sin(cam.yaw), c = Math.cos(cam.yaw);
      cam.tx -= (dx * c + dy * s) * k * 1.0;
      cam.tz -= (-dx * s + dy * c) * k * 1.0;
      this.clampCam();
      this.g.camGoal = null;
    }
    clampCam() {
      const cam = this.g.stage.cam, b = this.w ? this.w.map.bounds : { x0: -130, x1: 130, z0: -100, z1: 100 };
      cam.tx = U.clamp(cam.tx, b.x0 + 20, b.x1 - 20);
      cam.tz = U.clamp(cam.tz, b.z0 + 20, b.z1 - 20);
    }

    update(dt) {
      if (!this.w) return;
      const g = this.g, cam = g.stage.cam, K = this.keys;
      if (g.mode === 'play' || g.mode === 'paused') {
        let px = 0, pz = 0;
        if (K.has('ArrowLeft') || K.has('KeyA') && !K.has('ControlLeft')) px -= 1;
        if (K.has('ArrowRight') || K.has('KeyD')) px += 1;
        if (K.has('ArrowUp') || K.has('KeyW')) pz -= 1;
        if (K.has('ArrowDown') || (K.has('KeyS') && !this.selected.size)) pz += 1;
        // גלילה בקצה המסך (רק במסך מלא / חלון ממוקד)
        if (this.edgePan !== false && this.mouse.inside && this.mouse.moved > 30 && !this.drag && document.hasFocus()) {
          const m = 4, st = g.stage;
          if (this.mouse.x <= m) px -= 1; else if (this.mouse.x >= st.w - m) px += 1;
          if (this.mouse.y <= m) pz -= 1; else if (this.mouse.y >= st.h - m) pz += 1;
        }
        if (px || pz) {
          const sp = cam.dist * 1.1 * dt * (this.camSpeed || 1);
          const s = Math.sin(cam.yaw), c = Math.cos(cam.yaw);
          cam.tx += (px * c + pz * s) * sp;
          cam.tz += (-px * s + pz * c) * sp;
          this.clampCam();
          g.camGoal = null;
        }
        if (K.has('KeyQ')) cam.yaw += 1.4 * dt;
        if (K.has('KeyE')) cam.yaw -= 1.4 * dt;
      }
      if (g.camGoal) {
        cam.tx = U.lerp(cam.tx, g.camGoal.x, Math.min(1, dt * 5));
        cam.tz = U.lerp(cam.tz, g.camGoal.z, Math.min(1, dt * 5));
        if (Math.hypot(cam.tx - g.camGoal.x, cam.tz - g.camGoal.z) < 0.3) g.camGoal = null;
      }
      // מטרות מסומנות (לשחקן משטרה) — בהמשך
      this.targetSet.clear();
      if (this.side === 'police') {
        for (const sq of this.selectedSquads()) if (sq.target) this.targetSet.add(sq.target);
        if (this.hoverEnemy && this.selected.size) this.targetSet.add(this.hoverEnemy);
      }
      this.hoverEnemy = null;
      this.updatePreview();
    }

    // תצוגה מקדימה: לאן תיפרס החוליה ואילו נתיבים ייחסמו
    updatePreview() {
      const g = this.g, view = g.view;
      if (!view) return;
      const hintEl = $('hint');
      if (this.aim && g.mode === 'play') {
        const gp = this.mouse.inside ? this.groundAt(this.mouse.x, this.mouse.y) : null;
        view.setPreview(null, null);
        if (this.aim === 'megaphone') {
          view.setAim(gp, this.w.BAL.police.megaphone.range);
          hintEl.textContent = 'כריזה: לחצו על המקום (כל מי שבתוך העיגול יושפע) · Esc לביטול';
        } else {
          view.setAim(gp, 3, 0xffd96b);
          const ok = gp && !this.w.map.isRoad(gp.x, gp.z) && this.w.nav.foot.isWalkable(gp.x, gp.z);
          hintEl.textContent = ok ? 'הסעה: לחצו כאן — שתי חוליות ירדו מהאוטובוס בעוד 9 שניות · Esc לביטול' : 'הסעה: בחרו מקום על המדרכה (לא על הכביש) · Esc לביטול';
        }
        return;
      }
      view.setAim(null);
      if (g.mode === 'play' && this.side === 'police' && this.selected.size && !this.drag && this.mouse.inside) {
        this.policeHover(hintEl);
        return;
      }
      if (g.mode !== 'play' || !this.selected.size || this.drag || !this.mouse.inside) {
        view.setPreview(null, null);
        if (g.mode === 'play' && !this.g.tutorialHint) hintEl.textContent = '';
        return;
      }
      const sqs = this.selectedSquads();
      if (!sqs.length) { view.setPreview(null, null); return; }
      const overOwn = this.pickSquad(this.mouse.x, this.mouse.y, this.side);
      if (overOwn) { view.setPreview(null, null); if (!this.g.tutorialHint) hintEl.textContent = 'לחיצה: בחירת החוליה הזו'; return; }
      const gp = this.groundAt(this.mouse.x, this.mouse.y);
      if (!gp || !this.w.map.inBounds(gp.x, gp.z, 2)) { view.setPreview(null, null); return; }
      const w = this.w, U2 = HM.Units;
      const axis = U2.lineAxisAt(w, gp.x, gp.z);
      const walkers = sqs.filter(s => !s.vehicle);
      const widths = walkers.map(s => U2.formationWidth(w, s, axis) + 0.6);
      const total = widths.reduce((a, b) => a + b, 0);
      let off = -total / 2;
      const slots = [];
      walkers.forEach((s, i) => {
        const o = off + widths[i] / 2; off += widths[i];
        let gx = gp.x, gz = gp.z;
        if (walkers.length > 1) { if (axis === 'z') gz += o; else gx += o; }
        for (const p of U2.computeSlots(w, s, gx, gz, axis)) slots.push(p);
      });
      // אילו נתיבים ייחסמו
      const lanes = new Set();
      const rr = w.BAL.people.radius + 0.2;
      for (const s of slots) for (const L of w.map.lanes) {
        const perp = L.axis === 'x' ? s.z : s.x;
        if (Math.abs(perp - L.off) < w.BAL.traffic.laneW / 2 + rr - 0.15 && w.map.isRoad(s.x, s.z)) lanes.add(L);
      }
      view.setPreview(slots, [...lanes], gp.x, gp.z);
      if (!this.g.tutorialHint) {
        const n = lanes.size;
        hintEl.textContent = n ? `לחיצה: לחסום כאן — ${n === 1 ? 'נתיב אחד ייחסם' : n + ' נתיבים ייחסמו'}` :
          (w.map.isRoad(gp.x, gp.z) ? 'לחיצה: לשלוח לכאן' : 'לחיצה: לשלוח לכאן (על המדרכה — לא חוסם)');
      }
    }
  }

  // רמזים לשחקן משטרה: על מה הלחיצה תשפיע
  Input.prototype.policeHover = function (hintEl) {
    const view = this.g.view, w = this.w;
    view.setPreview(null, null);
    const sqs = this.selectedSquads();
    if (!sqs.length) return;
    if (this.pickSquad(this.mouse.x, this.mouse.y, 'police')) { if (!this.g.tutorialHint) hintEl.textContent = 'לחיצה: בחירת החוליה הזו'; return; }
    const enemy = this.pickSquad(this.mouse.x, this.mouse.y, 'protest');
    this.hoverEnemy = enemy ? enemy.id : null;
    if (this.g.tutorialHint) { hintEl.textContent = this.g.tutorialHint; return; }
    if (enemy) {
      const sitting = HM.Units.squadSitting(enemy);
      const types = new Set(sqs.map(s => s.type));
      const parts = [];
      if (types.has('patrol') || types.has('riot')) parts.push(sitting ? 'השוטרים יגררו אותם (יושבים — לאט)' : 'השוטרים יגררו אותם לניידת');
      if (types.has('officer')) parts.push('הקצין ילך איתם וידבר איתם');
      if (types.has('horses')) parts.push(sitting ? 'זהירות: הם יושבים — הפרשים ייעצרו וזו שערורייה!' : 'הפרשים יפזרו אותם');
      if (types.has('cannon')) parts.push('המכת"זית תתיז עליהם');
      hintEl.textContent = 'לחיצה: ' + parts.join(' · ');
      return;
    }
    const gp = this.groundAt(this.mouse.x, this.mouse.y);
    if (!gp) return;
    hintEl.textContent = w.map.isRoad(gp.x, gp.z)
      ? 'לחיצה: להציב כאן — אבל שוטרים על הכביש עוצרים גם הם את התנועה!'
      : `לחיצה: להציב כאן. שוטרים במנוחה עוצרים לבד מפגינים שחוסמים בטווח ${w.BAL.police.autoEngage} מטר`;
  };

  HM.Input = Input;
})(typeof window !== 'undefined' ? window : globalThis);
