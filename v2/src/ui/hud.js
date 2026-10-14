/* הממשק שעל המסך: פס עליון, לוח תגבורת, לוח חוליה נבחרת, שלטים מעל חוליות,
   תוויות פקק, בועות דיבור, התראות ומבזקים. */
(function (root) {
  'use strict';
  const HM = root.HM || (root.HM = {});
  const U = HM.U;
  const T = root.THREE;
  const $ = (id) => document.getElementById(id);
  const TX = () => HM.TXT;

  const _v = new T.Vector3();

  class HUD {
    constructor(game) {
      this.g = game;
      this.badges = new Map();
      this.jamTags = {};
      this.bubbles = [];
      this.floaters = [];
      this.textT = 0;
      this.newsDone = new Set();
      this.hoverExplain = null;
      this.lastAlertKey = {};
      this.honkBubbleT = 0;
      $('btnPause').onclick = () => game.togglePause();
      $('btnSpeed').onclick = () => game.toggleSpeed();
      $('btnMute').onclick = () => game.toggleMute();
    }

    // ---------- התחלת משחק ----------
    bind(world, side) {
      this.w = world;
      this.side = side;
      this.clearDynamic();
      this.newsDone.clear();
      $('moneyLbl').textContent = side === 'protest' ? 'קופת ההפגנה' : 'תקציב המבצע';
      this.buildCards();
      $('news').innerHTML = '';
      $('alerts').innerHTML = '';
      this.news(TX().fmt(TX().NEWS.start, { place: world.map.name }));
      this.updateSelection(true);
      this.updateText();
    }

    clearDynamic() {
      for (const [, b] of this.badges) b.el.remove();
      this.badges.clear();
      for (const k in this.jamTags) this.jamTags[k].remove();
      this.jamTags = {};
      for (const b of this.bubbles) b.el.remove();
      this.bubbles = [];
      for (const f of this.floaters) f.el.remove();
      this.floaters = [];
    }

    buildCards() {
      const box = $('buyCards');
      box.innerHTML = '';
      this.cards = [];
      const list = this.side === 'protest'
        ? [['bochurim', 'Z'], ['avrechim', 'X'], ['askan', 'C'], ['shofar', 'V']]
        : [['patrol', 'Z'], ['horses', 'X'], ['cannon', 'C']];
      for (const [k, key] of list) {
        const info = TX().UNITS[k];
        const el = document.createElement('button');
        el.className = 'card';
        const cost = k === 'shofar' ? '' : (this.side === 'protest' ? this.w.BAL.protest[k].cost : this.w.BAL.police[k].cost);
        el.innerHTML = `<span class="ckey">${key}</span>${HM.ICONS[k].replace('class="ic"', 'class="cic"')}<span class="cname">${info.name}</span>` +
          `<span class="ccost">${cost ? '₪' + cost : 'חינם'}</span><span class="why"></span>`;
        el.title = info.explain;
        el.onmouseenter = () => { this.hoverExplain = info.name + ': ' + info.explain; };
        el.onmouseleave = () => { this.hoverExplain = null; };
        el.onclick = () => this.g.useCard(k);
        box.appendChild(el);
        this.cards.push({ k, el, why: el.querySelector('.why'), cd: null });
      }
    }

    // ---------- עדכון ----------
    update(dt) {
      if (!this.w) return;
      this.textT -= dt;
      if (this.textT <= 0) { this.textT = 0.1; this.updateText(); this.updateSelection(false); }
      this.updateBadges();
      this.updateJamTags();
      this.updateBubbles(dt);
    }

    updateText() {
      const w = this.w, side = this.side;
      $('money').textContent = U.fmtNum(w.money[side]);
      $('income').textContent = '+' + w.income[side].toFixed(1) + ' לשנייה';
      $('meterVal').textContent = Math.floor(w.H);
      $('meterFill').style.width = w.H.toFixed(1) + '%';
      const r = $('meterRate');
      if (w.Hrate > 0.005) {
        const perMin = w.Hrate * 60;
        const eta = (100 - w.H) / w.Hrate;
        r.textContent = `▲ ${perMin.toFixed(perMin < 10 ? 1 : 0)} לדקה` + (eta < w.sunset - w.t ? ` · בקצב הזה: ניצחון בעוד ${U.fmtTime(eta)}` : '');
        r.className = 'up';
      } else if (w.Hrate < -0.02 && w.H > 0) { r.textContent = '▼ יורד — אין פקק'; r.className = 'down'; }
      else { r.textContent = ''; r.className = ''; }
      const km = w.traffic.jamKm;
      $('jamLine').textContent = km < 0.05 ? 'אין פקק — המד לא עולה. חסמו נתיבים!' :
        `פקק: ${km.toFixed(1)} ק"מ` + (km < w.BAL.headline.deadzoneKm ? ' (קטן מדי — עוד לא מעניין את החדשות)' : '');
      const left = w.sunset - w.t;
      $('sunTime').textContent = U.fmtTime(left);
      $('sunTime').classList.toggle('late', left < 60);
      const f = U.clamp(w.t / w.sunset, 0, 1);
      const a = Math.PI * (1 - f) * 0.92 + 0.12;
      $('sunDot').setAttribute('cx', (60 - Math.cos(a) * 52).toFixed(1));   // נע מימין (מזרח) לשמאל
      $('sunDot').setAttribute('cy', (50 - Math.sin(a) * 40).toFixed(1));
      // כרטיסי קנייה
      for (const c of this.cards) {
        let ok = true, why = '';
        if (c.k === 'shofar') {
          const cd = w.shofarCD, first = w.BAL.protest.shofar.firstAt - w.t;
          if (first > 0) { ok = false; why = `מוכן בעוד ${Math.ceil(first)} שנ'`; }
          else if (cd > 0) { ok = false; why = `עוד ${Math.ceil(cd)} שנ'`; }
          else why = 'מוכן!';
        } else {
          const can = w.canBuy(side, c.k);
          ok = can.ok;
          if (!ok) why = can.reason === 'money' ? `חסר ₪${Math.ceil((side === 'protest' ? w.BAL.protest[c.k].cost : w.BAL.police[c.k].cost) - w.money[side])}` : can.reason === 'max' ? 'הגעתם למקסימום' : '';
          else why = TX().UNITS[c.k].short;
        }
        c.el.classList.toggle('dis', !ok);
        c.why.textContent = why;
      }
      $('selExplain').textContent = this.hoverExplain || this.selExplainDefault || '';
      // מזרימים קהל לפי מספר המפגינים על הכביש
      let onRoad = 0;
      for (const p of w.people) if (p.side === 'protest' && (p.state === 'free' || p.state === 'held') && w.map.isRoad(p.x, p.z)) onRoad++;
      HM.Audio.setCrowd(onRoad);
      const spraying = w.squads.some(s => s.vehicle && s.vehicle.spray);
      HM.Audio.setSpray(spraying);
    }

    squadState(sq) {
      const S = TX().STATE;
      if (sq.vehicle) {
        const st = sq.vehicle.state;
        return st === 'spray' ? S.spray : st === 'refill' ? S.refill : st === 'return' ? S.ret : st === 'drive' ? S.drive : S.idle;
      }
      if (sq.side === 'police') {
        if (sq.type === 'horses') return sq.mode === 'charge' ? S.charging : sq.mode === 'regroup' ? S.regroup : S.idle;
        if (sq.members.some(c => c.state === 'stalled')) return S.stalled;
        return sq.target ? S.arresting : sq.moving ? S.moving : S.idle;
      }
      if (sq.fleeT > 0) return S.fleeing;
      if (!sq.members.length) return S.away;
      if (sq.moving) return S.moving;
      const sitting = sq.members.filter(p => p.sit > 0.7).length;
      const anySit = sq.members.some(p => p.sit > 0.05 && p.sit < 0.95);
      if (anySit) return sq.stance === 'sit' ? S.sittingDown : S.standingUp;
      const c = HM.Units.centroid(sq);
      const onRoad = this.w.map.isRoad(c.x, c.z);
      if (sitting * 2 >= sq.members.length) return onRoad ? S.sitting : S.sitting;
      return onRoad ? S.blocking : S.sidewalk;
    }

    // ---------- שלטים מעל חוליות ----------
    updateBadges() {
      const w = this.w, seen = new Set();
      const sel = this.g.input ? this.g.input.selected : new Set();
      const tgt = this.g.input ? this.g.input.targetSet : new Set();
      for (const sq of w.squads) {
        if (sq.broken && !sq.members.length) continue;
        seen.add(sq.id);
        let b = this.badges.get(sq.id);
        const mine = sq.side === this.side;
        if (!b) {
          const el = document.createElement('div');
          el.className = 'badge ' + (sq.side === 'protest' ? 'prot' : 'pol');
          el.addEventListener('pointerdown', (e) => { e.stopPropagation(); this.g.input.badgeClick(sq.id, e); });
          el.addEventListener('dblclick', (e) => { e.stopPropagation(); this.g.input.selectType(sq); });
          el.addEventListener('contextmenu', (e) => e.preventDefault());
          $('badges').appendChild(el);
          b = { el, key: '' };
          this.badges.set(sq.id, b);
        }
        const c = HM.Units.centroid(sq);
        const y = sq.vehicle ? 4.4 : sq.type === 'horses' ? 3.6 : 2.6;
        const p = this.project(c.x, y, c.z);
        if (!p || this.underHud(p.x, p.y)) { b.el.style.display = 'none'; b.vis = false; continue; }
        b.el.style.display = '';
        b.vis = true; b.sx = p.x; b.sy = p.y;
        const st = this.squadState(sq);
        const n = sq.vehicle ? '' : sq.members.length;
        const out = sq.vehicle ? 0 : this.awayCount(sq);
        const mor = sq.side === 'protest' ? Math.round(sq.morale / sq.maxMorale * 10) : -1;
        const key = `${n}|${out}|${st}|${mor}|${sel.has(sq.id)}|${tgt.has(sq.id)}|${sq.vehicle ? Math.round(sq.vehicle.tank) : ''}`;
        if (key !== b.key) {
          b.key = key;
          b.el.classList.toggle('sel', sel.has(sq.id));
          b.el.classList.toggle('tgt', tgt.has(sq.id));
          let html = `<span class="n">${sq.num}</span>${HM.ICONS[sq.type]}`;
          if (!mine) {
            // יריב: רק מה שחשוב לדעת
            const notable = st === TX().STATE.charging || st === TX().STATE.spray || st === TX().STATE.stalled || st === TX().STATE.arresting || st === TX().STATE.ret || st === TX().STATE.refill;
            html += sq.vehicle ? '' : `<span>${n}</span>`;
            if (notable) html += `<span class="st">${st}</span>`;
            if (sq.vehicle) html += `<span class="st">${Math.round(sq.vehicle.tank / w.BAL.police.cannon.tank * 100)}% מים</span>`;
            b.el.innerHTML = html;
            b.wpx = b.el.offsetWidth || 60;
            continue;
          }
          if (!sq.vehicle) html += `<span>${n}${out ? `<small style="opacity:.6">+${out}</small>` : ''}</span>`;
          if (mine && sq.side === 'protest') html += `<span class="mor${mor <= 2.5 ? ' low' : ''}"><b style="width:${mor * 10}%"></b></span>`;
          if (sq.vehicle) html += `<span class="st">${st} · ${Math.round(sq.vehicle.tank / w.BAL.police.cannon.tank * 100)}%</span>`;
          else html += `<span class="st">${st}</span>`;
          b.el.innerHTML = html;
          b.wpx = b.el.offsetWidth || 90;
        }
      }
      for (const [id, b] of this.badges) if (!seen.has(id)) { b.el.remove(); this.badges.delete(id); }
      // מניעת חפיפה: שלט שעולה על שלט אחר — עולה למעלה
      const vis = [...this.badges.values()].filter(b => b.vis).sort((a, b) => b.sy - a.sy);
      const placed = [];
      for (const b of vis) {
        let y = b.sy;
        const w2 = (b.wpx || 90) / 2 + 2;
        for (let tries = 0; tries < 6; tries++) {
          const hit = placed.find(o => Math.abs(o.x - b.sx) < w2 + o.w2 && Math.abs(o.y - y) < 23);
          if (!hit) break;
          y = hit.y - 24;
        }
        placed.push({ x: b.sx, y, w2 });
        b.el.style.transform = `translate(${b.sx.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -100%)`;
      }
    }

    // האם נקודה על המסך מוסתרת ע"י לוחות הממשק
    underHud(x, y) {
      const now = performance.now();
      if (!this.hudRects || now - this.hudRectsT > 500) {
        this.hudRectsT = now;
        this.hudRects = ['moneyBox', 'meterBox', 'sunBox', 'ctrlBox', 'buyPanel', 'selPanel', 'newsPanel']
          .map(id => $(id)).filter(e => e && e.offsetParent !== null).map(e => e.getBoundingClientRect());
      }
      for (const r of this.hudRects) if (x > r.left - 30 && x < r.right + 30 && y > r.top - 4 && y < r.bottom + 26) return true;
      return false;
    }

    awayCount(sq) {
      let n = 0;
      for (const p of this.w.people) if (p.squad === sq && (p.state === 'carried' || p.state === 'detained' || p.state === 'returning')) n++;
      return n;
    }

    project(x, y, z) {
      const st = this.g.stage;
      _v.set(x, y, z).project(st.camera);
      if (_v.z > 1) return null;
      return { x: (_v.x * 0.5 + 0.5) * st.w, y: (-_v.y * 0.5 + 0.5) * st.h, inside: Math.abs(_v.x) <= 1 && Math.abs(_v.y) <= 1 };
    }

    // ---------- תוויות פקק בכניסות ----------
    updateJamTags() {
      const w = this.w, st = this.g.stage;
      for (const k in w.map.arms) {
        const arm = w.map.arms[k];
        const km = w.traffic.armJam[k] || 0;
        let el = this.jamTags[k];
        if (km < 0.04) { if (el) el.style.display = 'none'; continue; }
        if (!el) { el = document.createElement('div'); el.className = 'jamTag'; $('badges').appendChild(el); this.jamTags[k] = el; }
        el.style.display = '';
        // נקודה בכניסה: במרחק שמתאים לאורך הפקק הנראה
        const j = w.map.junctions[0];
        const dx = arm.x - j.x, dz = arm.z - j.z, d = Math.hypot(dx, dz);
        const along = U.clamp(20 + km * 1000 * 0.4, 22, d);
        const px = j.x + dx / d * along, pz = j.z + dz / d * along;
        let p = this.project(px, 2, pz);
        if (!p) { el.style.display = 'none'; continue; }
        const m = 90;
        const cx = U.clamp(p.x, m, st.w - m), cy = U.clamp(p.y, 130, st.h - 200);
        // חץ לכיוון הכניסה כשהיא מחוץ למסך
        let arrow = '';
        if (p.x < m) arrow = '◄'; else if (p.x > st.w - m) arrow = '►'; else if (p.y < 130) arrow = '▲'; else if (p.y > st.h - 200) arrow = '▼';
        const txt = `פקק ${km.toFixed(1)} ק"מ · ${arm.name}`;
        const key = txt + arrow;
        if (el.dataset.k !== key) {
          el.dataset.k = key;
          el.innerHTML = '';
          const span = document.createElement('span'); span.textContent = txt;
          if (arrow === '►' || arrow === '▲' || arrow === '▼') { el.appendChild(span); if (arrow) el.appendChild(document.createTextNode(' ' + arrow)); }
          else { if (arrow) el.appendChild(document.createTextNode(arrow + ' ')); el.appendChild(span); }
          el.style.direction = 'ltr';
          span.style.direction = 'rtl'; span.style.unicodeBidi = 'isolate';
        }
        el.classList.toggle('small', km < 0.3);
        el.style.transform = `translate(${cx.toFixed(0)}px, ${cy.toFixed(0)}px) translate(-50%, -50%)`;
      }
    }

    // ---------- בועות ----------
    bubble(text, x, z, kind, y, force) {
      const now = performance.now();
      if (!force) {
        if (now - (this.lastBubbleT || 0) < 450) return;
        if (this.bubbles.some(o => Math.abs(o.x - x) < 4 && Math.abs(o.z - z) < 4)) return;
      }
      this.lastBubbleT = now;
      if (this.bubbles.length > 6) { const old = this.bubbles.shift(); old.el.remove(); }
      const el = document.createElement('div');
      el.className = 'bubble ' + (kind || '');
      el.textContent = text;
      $('floaters').appendChild(el);
      this.bubbles.push({ el, x, z, y: y || 2.9, t: 2.4 });
    }
    floater(text, x, z, color) {
      const el = document.createElement('div');
      el.className = 'floater';
      el.textContent = text;
      if (color) el.style.color = color;
      $('floaters').appendChild(el);
      this.floaters.push({ el, x, z, t: 1.8 });
    }
    updateBubbles(dt) {
      for (let i = this.bubbles.length - 1; i >= 0; i--) {
        const b = this.bubbles[i];
        b.t -= dt;
        if (b.t <= 0) { b.el.remove(); this.bubbles.splice(i, 1); continue; }
        const p = this.project(b.x, b.y, b.z);
        if (!p) { b.el.style.display = 'none'; continue; }
        b.el.style.display = '';
        b.el.style.opacity = Math.min(1, b.t * 2).toFixed(2);
        b.el.style.transform = `translate(${p.x.toFixed(0)}px, ${p.y.toFixed(0)}px) translate(-50%, -100%)`;
      }
      for (let i = this.floaters.length - 1; i >= 0; i--) {
        const f = this.floaters[i];
        f.t -= dt;
        if (f.t <= 0) { f.el.remove(); this.floaters.splice(i, 1); continue; }
        const p = this.project(f.x, 3 + (1.8 - f.t) * 1.6, f.z);
        if (!p) continue;
        f.el.style.opacity = Math.min(1, f.t).toFixed(2);
        f.el.style.transform = `translate(${p.x.toFixed(0)}px, ${p.y.toFixed(0)}px) translate(-50%, -100%)`;
      }
    }

    // ---------- התראות ומבזקים ----------
    alert(text, kind, icon, key) {
      if (key) {
        const now = performance.now();
        if (this.lastAlertKey[key] && now - this.lastAlertKey[key] < 4000) return;
        this.lastAlertKey[key] = now;
      }
      const box = $('alerts');
      while (box.children.length >= 2) box.removeChild(box.firstChild);
      const el = document.createElement('div');
      el.className = 'alert ' + (kind || '');
      el.innerHTML = (icon ? HM.ICONS[icon] : '') + '<span></span>';
      el.querySelector('span').textContent = text;
      box.appendChild(el);
      setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 520); }, 3600);
    }
    news(text) {
      const box = $('news');
      const el = document.createElement('div');
      el.className = 'newsItem';
      el.textContent = text;
      box.insertBefore(el, box.firstChild);
      while (box.children.length > 3) box.removeChild(box.lastChild);
    }

    // ---------- אירועים מהסימולציה ----------
    handleEvents(evs) {
      const w = this.w, L = TX().LINES, N = TX().NEWS, A = HM.Audio, mine = this.side;
      for (const e of evs) {
        switch (e.type) {
          case 'incoming': {
            if (e.side !== 'police') break;
            const nm = { patrol: 'ניידת שוטרים בדרך', horses: 'פרשים בדרך!', cannon: 'מכת"זית בדרך!' }[e.unit];
            if (nm) this.alert(`${nm} — מגיעים בעוד ${Math.round(e.eta)} שניות`, mine === 'protest' ? 'warn' : 'info', e.unit === 'patrol' ? 'siren' : e.unit, 'inc' + e.unit);
            A.siren();
            if (e.unit !== 'patrol') this.news(N.policeArrive);
            break;
          }
          case 'arrived':
            if (e.side === 'police') {
              const nm = { patrol: 'השוטרים הגיעו', horses: 'הפרשים הגיעו', cannon: 'המכת"זית הגיעה' }[e.unit];
              if (nm) this.alert(nm + ' — יוצאים מהתחנה', mine === 'protest' ? 'warn' : 'info', e.unit, 'arr' + e.unit);
              if (e.unit === 'horses') A.hooves();
            } else if (e.side === mine && w.t > 1) {
              this.alert(`${TX().UNITS[e.unit].name} יוצאים מהישיבה`, 'good', e.unit, 'arrp' + e.squad);
            }
            break;
          case 'grab':
            if (Math.random() < 0.12) this.bubble(TX().pick(L.copGrab), e.x, e.z, 'cop', 3.1);
            break;
          case 'dragged':
            if (Math.random() < 0.35) this.bubble(TX().pick(L.dragged), e.x, e.z);
            A.thud();
            break;
          case 'released':
            if (Math.random() < 0.5) this.bubble(TX().pick(L.released), e.x, e.z);
            break;
          case 'detained':
            break;
          case 'vanDeparted':
            this.alert(`הניידת התמלאה ויצאה לתחנה עם ${e.n} עצורים — הם לא יחזרו`, mine === 'protest' ? 'warn' : 'good', 'van');
            this.news(TX().fmt(N.vanDeparted, { n: e.n }));
            break;
          case 'vanBack':
            this.alert('ניידת העצורים חזרה לצומת', 'info', 'van', 'vanBack');
            break;
          case 'flee': {
            const sq = w.squadById(e.squad);
            if (e.reason === 'horses') { this.bubble(TX().pick(L.horses), e.x, e.z); A.hooves(); }
            else if (e.reason === 'water') this.bubble(TX().pick(L.water), e.x, e.z);
            if (sq && sq.side === mine) this.alert(`חוליה ${sq.num} בורחת${e.reason === 'horses' ? ' מהפרשים' : e.reason === 'water' ? ' מהמים' : ''}!`, 'warn', null, 'flee' + sq.id);
            break;
          }
          case 'broken': {
            if (this.side === 'protest') this.alert(`חוליה ${e.num} נשברה והלכה הביתה`, 'warn', null);
            break;
          }
          case 'permit': {
            this.bubble(TX().pick(L.permit), e.x, e.z, '', 3.1);
            const pol = w.squadById(e.police);
            if (pol && pol.members[0]) setTimeout(() => this.bubble(TX().pick(L.copStall), pol.members[0].x, pol.members[0].z, 'cop', 3.1), 600);
            A.click();
            break;
          }
          case 'shofar':
            A.shofar();
            this.news(N.shofar);
            this.alert('תקיעת שופר! כולם מתעוררים', 'good', 'shofar');
            for (const sq of w.squads) if (sq.side === 'protest' && sq.members.length && Math.random() < 0.5) { const c = HM.Units.centroid(sq); this.bubble(TX().pick(L.shofar), c.x, c.z); }
            break;
          case 'headline':
            if (e.reason === 'horseScandal') { this.news(N.horseScandal); this.floater('+' + e.amount + ' כותרות!', e.x, e.z); this.alert('שערורייה: פרשים מול יושבים — המד קפץ!', mine === 'protest' ? 'good' : 'warn', 'news'); }
            else if (e.reason === 'askanArrest') { this.news(N.askanArrest); this.floater('+' + e.amount + ' כותרות', e.x, e.z); }
            break;
          case 'nearMiss':
            this.bubble(TX().pick(L.nearMiss), e.x, e.z);
            A.honk(1.4);
            if (e.side === mine) this.alert('כמעט! רכב בלם ברגע האחרון — היכנסו לכביש כשהרמזור אדום', 'warn', 'car', 'near');
            break;
          case 'honk': {
            const tgt = this.g.stage.cam;
            const d = Math.hypot(e.x - tgt.tx, e.z - tgt.tz);
            if (d < 70) A.honk(1 - d / 80);
            this.honkBubbleT -= 1;
            if (e.front && Math.random() < 0.1) this.bubble(TX().pick(L.driver), e.x, e.z, 'driver', 2.4);
            break;
          }
          case 'cannonEmpty':
            this.alert('המכת"זית התרוקנה — חוזרת למלא מים', mine === 'protest' ? 'good' : 'info', 'cannon');
            this.news(N.cannonEmpty);
            break;
          case 'cannonReady':
            this.alert('המכת"זית מלאה ומוכנה', mine === 'protest' ? 'warn' : 'info', 'cannon', 'cready');
            break;
          case 'rejoin':
            break;
        }
      }
      this.checkNews();
    }

    checkNews() {
      const w = this.w, N = TX().NEWS;
      for (const [km, s] of N.jam) {
        const k = 'jam' + km;
        if (!this.newsDone.has(k) && w.traffic.jamKm >= km) { this.newsDone.add(k); this.news(TX().fmt(s, { place: w.map.name })); }
      }
      for (const [h, s] of N.headline) {
        const k = 'h' + h;
        if (!this.newsDone.has(k) && w.H >= h) {
          this.newsDone.add(k);
          this.news(TX().fmt(s, { place: w.map.name }));
          this.alert(TX().fmt(s, { place: w.map.name }), this.side === 'protest' ? 'good' : 'warn', 'news');
        }
      }
      const left = w.sunset - w.t;
      if (!this.newsDone.has('sun60') && left <= 60) { this.newsDone.add('sun60'); this.alert('דקה אחת לשקיעה!', 'warn', 'sun'); }
    }

    // ---------- לוח החוליה הנבחרת ----------
    updateSelection(force) {
      const inp = this.g.input;
      if (!inp || !this.w) return;
      const ids = [...inp.selected].filter(id => { const s = this.w.squadById(id); return s && !s.broken && (s.members.length || s.vehicle); });
      const sqs = ids.map(id => this.w.squadById(id));
      const key = sqs.map(s => s.id + ':' + s.members.length + ':' + this.squadState(s) + ':' + Math.round(s.morale / 5) + ':' + (s.cd.permit > 0 ? Math.ceil(s.cd.permit) : 0) + ':' + this.awayCount(s)).join(',');
      if (!force && key === this.selKey) return;
      this.selKey = key;
      if (!sqs.length) {
        $('selEmpty').classList.remove('hidden');
        $('selBody').classList.add('hidden');
        this.selExplainDefault = '';
        $('selEmpty').textContent = this.side === 'protest'
          ? 'לחצו על השלט הצהוב של חוליה כדי לבחור אותה. גרירה עם העכבר בוחרת כמה חוליות.'
          : 'לחצו על חוליה כדי לבחור אותה.';
        return;
      }
      $('selEmpty').classList.add('hidden');
      $('selBody').classList.remove('hidden');
      const U2 = HM.Units;
      let head = '';
      for (const s of sqs.slice(0, 6)) {
        const info = TX().UNITS[s.type];
        const away = this.awayCount(s);
        let dots = '';
        for (let i = 0; i < s.members.length; i++) dots += '<i></i>';
        for (let i = 0; i < away; i++) dots += '<i class="away"></i>';
        const mor = s.morale / s.maxMorale;
        head += `<div class="sqChip"><span class="num">${s.num}</span>${HM.ICONS[s.type]}<span>${info.name}</span><span class="dots">${dots}</span>` +
          (s.side === 'protest' ? `<span class="mor${mor < 0.3 ? ' low' : ''}" title="מורל"><b style="width:${Math.round(mor * 100)}%"></b></span>` : '') +
          `<span style="color:#ffd38a;font-size:12px">${this.squadState(s)}</span></div>`;
      }
      if (sqs.length > 6) head += `<div class="sqChip">+${sqs.length - 6}</div>`;
      $('selHead').innerHTML = head;
      // פעולות
      const acts = $('selActions');
      acts.innerHTML = '';
      const add = (label, key, explain, fn, disabled) => {
        const b = document.createElement('button');
        b.className = 'act';
        b.innerHTML = `${label}<span class="k">${key}</span>`;
        b.disabled = !!disabled;
        b.onclick = (e) => { e.stopPropagation(); fn(); };
        b.onmouseenter = () => { this.hoverExplain = explain; };
        b.onmouseleave = () => { this.hoverExplain = null; };
        acts.appendChild(b);
      };
      if (this.side === 'protest') {
        const sitters = sqs.filter(s => s.type !== 'askan');
        if (sitters.length) {
          const sitting = sitters.filter(s => s.stance === 'sit').length * 2 >= sitters.length;
          if (sitting) add('לקום', 'S', 'קמים על הרגליים — אפשר לזוז שוב, אבל הפרשים יכולים לפזר אתכם.', () => this.g.input.stance('stand'));
          else add('לשבת על הכביש', 'S', 'יושבים: קשה הרבה יותר לגרור אתכם, והפרשים לא מתקרבים. אבל לוקח זמן לקום.', () => this.g.input.stance('sit'));
        }
        const ask = sqs.find(s => s.type === 'askan');
        if (ask) {
          const cd = ask.cd.permit || 0;
          add(cd > 0 ? `יש לי אישור! (${Math.ceil(cd)})` : 'יש לי אישור!', 'F', TX().UNITS.askan.explain, () => this.g.input.permit(), cd > 0);
        }
      }
      this.selExplainDefault = sqs.length === 1 ? TX().UNITS[sqs[0].type].explain : 'לחיצה על הכביש שולחת את כל החוליות הנבחרות — הן נפרסות זו לצד זו.';
    }
  }

  HM.HUD = HUD;
})(typeof window !== 'undefined' ? window : globalThis);
