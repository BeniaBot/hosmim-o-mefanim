/* הממשק שעל המסך: פס עליון, לוח תגבורת, לוח חוליה נבחרת, שלטים מעל חוליות,
   תוויות פקק, בועות דיבור, התראות ומבזקים. */
(function (root) {
  'use strict';
  const HM = root.HM || (root.HM = {});
  const U = HM.U;
  const T = root.THREE;
  const $ = (id) => document.getElementById(id);
  // מספר עם סימן בתחילת טקסט עברי: בלי בידוד הוא מוצג "6.5+" — מבודדים אותו כטקסט משמאל לימין
  const ltrNum = (t) => String(t).replace(/^([+\u2212-][\d.,]+)/, '\u2066$1\u2069');
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
      this.honks = 0;
      this.tick = { q: [], t: 0, idle: 0, last: null };
      this.chatT = 6;
      this.gagT = 0;
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
      $('moneyBox').title = side === 'protest' ? 'הכסף נכנס מתרומות. ככל שמד הכותרות גבוה — נכנס יותר.' : 'התקציב נכנס כל שנייה. ככל שמד הכותרות גבוה — הלחץ הציבורי מביא יותר תקציב.';
      $('sunLbl').textContent = side === 'protest' ? 'שקיעה בעוד' : 'להחזיק עוד';
      document.querySelector('.meterGoal').textContent = side === 'protest' ? '100 = ניצחון' : '100 = הפסד';
      this.buildCards();
      $('news').innerHTML = '';
      $('alerts').innerHTML = '';
      this.honks = 0;
      this.tick = { q: [], t: 0, idle: 0, last: null };
      $('tickText').textContent = '';
      this.chatT = 6; this.gagT = 0;
      this.news(TX().fmt(TX().NEWS.start, { place: world.map.name }));
      const tip = world.map.def.tip && world.map.def.tip[side];
      if (tip) setTimeout(() => { if (this.w === world) this.alert(tip, 'info', 'flag', 'tip', 8000); }, 1200);
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
        ? [['bochurim', 'Z'], ['avrechim', 'X'], ['askan', 'C'], ['photographer', 'B'], ['bus', 'N'], ['shofar', 'V']]
        : [['patrol', 'Z'], ['horses', 'X'], ['cannon', 'C'], ['riot', 'B'], ['officer', 'N'], ['megaphone', 'V']];
      for (const [k, key] of list) {
        const info = TX().UNITS[k];
        const el = document.createElement('button');
        el.className = 'card';
        const free = k === 'shofar' || k === 'megaphone';
        const cost = free ? '' : (this.side === 'protest' ? this.w.BAL.protest[k].cost : this.w.BAL.police[k].cost);
        el.innerHTML = `<span class="ckey">${key}</span>${HM.ICONS[k].replace('class="ic"', 'class="cic"')}<span class="cname">${info.name}</span>` +
          `<span class="ccost">${cost ? '₪' + cost : 'חינם'}</span><span class="why"></span>`;
        el.title = info.explain + (TX().FLAVOR[k] ? '\n\n' + TX().FLAVOR[k] : '');
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
      this.updateTicker(dt);
      this.updateChatter(dt);
    }

    // ---------- שורת המבזקים ----------
    // כל מבזק נשאר לפחות 6 שניות; כשאין חדשות — "מילוי" כמו בטלוויזיה
    updateTicker(dt) {
      const k = this.tick;
      k.t -= dt;
      k.idle += dt;
      if (k.t > 0) return;
      let next = k.q.shift();
      if (!next && k.idle > 22 && this.w && !this.w.outcome) { next = TX().pickNot(TX().NEWS.filler, k.last); k.last = next; }
      if (!next) return;
      k.t = 6.5; k.idle = 0;
      const el = $('tickText');
      el.classList.add('fade');
      setTimeout(() => { el.textContent = next; el.title = next; el.classList.remove('fade'); }, 300);
    }

    // ---------- פטפוט מפגינים שחוסמים ----------
    updateChatter(dt) {
      const w = this.w;
      if (!w || w.outcome) return;
      this.chatT -= dt;
      if (this.gagT > 0) this.gagT -= dt;
      // נהג שיצא מהמכונית — אומר משהו פעם אחת
      const dOut = this.g.view && this.g.view.driversOut;
      if (dOut) for (const d of dOut) if (d.car && !d.said && d.x !== undefined) { d.said = true; this.bubble(TX().pick(TX().LINES.driverOut), d.x, d.z, 'driver', 2.9, true); }
      // מוכר הבייגלה (אם הוא בפקק) — הודעה פעם אחת, וקריאות מדי פעם
      const vs = this.g.view && this.g.view.vendorState;
      if (vs && vs.on && !vs.leaving) {
        if (!this.newsDone.has('vendor')) { this.newsDone.add('vendor'); this.news(TX().NEWS.vendor); }
        vs.talkT = (vs.talkT === undefined ? 1.5 : vs.talkT) - dt;
        if (vs.talkT <= 0) { vs.talkT = 6 + Math.random() * 6; this.bubble(TX().pick(TX().LINES.vendor), vs.x, vs.z, '', 3.2, true); }
      }
      if (this.chatT > 0) return;
      this.chatT = 7 + Math.random() * 7;
      const cand = w.squads.filter(s => s.side === 'protest' && !s.broken && s.members.length && !s.moving && w.map.isRoad(HM.Units.centroid(s).x, HM.Units.centroid(s).z));
      if (!cand.length) return;
      const s = cand[Math.floor(Math.random() * cand.length)];
      const c = HM.Units.centroid(s);
      this.bubble(TX().pick(TX().LINES.protest), c.x, c.z);
    }

    updateText() {
      const w = this.w, side = this.side;
      $('money').textContent = U.fmtNum(w.money[side]);
      $('income').textContent = ltrNum('+' + w.income[side].toFixed(1) + ' לשנייה');
      $('meterVal').textContent = Math.floor(w.H);
      if (this.lastH !== undefined && Math.abs(w.H - this.lastH) >= 1.5) {
        const mb = $('meterBox');
        mb.classList.remove('pulse', 'pulseDown'); void mb.offsetWidth;
        mb.classList.add(w.H > this.lastH ? 'pulse' : 'pulseDown');
      }
      this.lastH = w.H;
      $('meterFill').style.width = w.H.toFixed(1) + '%';
      const r = $('meterRate');
      const pol = side === 'police';
      if (w.Hrate > 0.005) {
        const perMin = w.Hrate * 60;
        const eta = (100 - w.H) / w.Hrate;
        r.textContent = `▲ ${perMin.toFixed(perMin < 10 ? 1 : 0)} לדקה` + (eta < w.sunset - w.t && w.H < 99.5 ? ` · בקצב הזה: ${pol ? 'הפסד' : 'ניצחון'} בעוד ${U.fmtTime(eta)}` : '');
        r.className = pol ? 'down' : 'up';
      } else if (w.Hrate < -0.02 && w.H > 0) { r.textContent = '▼ יורד — אין פקק'; r.className = pol ? 'up' : 'down'; }
      else { r.textContent = ''; r.className = ''; }
      const km = w.traffic.jamKm;
      if (pol) {
        $('jamLine').textContent = km < 0.05 ? 'הכביש זורם — המד לא עולה.' : `פקק: ${km.toFixed(1)} ק"מ — פנו את הכביש כדי לעצור את המד`;
      } else {
        $('jamLine').textContent = km < 0.05 ? 'אין פקק — המד לא עולה. חסמו נתיבים!' :
          `פקק: ${km.toFixed(1)} ק"מ` + (km < w.BAL.headline.deadzoneKm ? ' (קטן מדי — עוד לא מעניין את החדשות)' : '');
      }
      // ניידת העצורים
      const van = w.van, cap = w.BAL.police.van.cap;
      const vl = $('vanLine');
      if (van.state === 'away') { vl.className = 'vanLine away'; vl.innerHTML = `${HM.ICONS.van}<span>הניידת בתחנה · חוזרת בעוד ${Math.ceil(van.awayT)}</span>`; }
      else {
        const next = van.list.length ? Math.max(0, Math.ceil(van.list.reduce((m, e) => Math.min(m, e.at), 1e9) - w.t)) : 0;
        vl.className = 'vanLine';
        vl.innerHTML = `${HM.ICONS.van}<span>${van.list.length}/${cap}</span><span class="bar"><b style="width:${van.list.length / cap * 100}%"></b></span>` +
          (van.list.length ? `<span style="opacity:.75">משתחרר בעוד ${next}</span>` : '');
      }
      // כמה חוליות מפגינים עוד יכולות להגיע (לשחקן משטרה)
      const ai = w.ai.protest;
      $('sunSub').textContent = pol && ai ? `עוד יכולות להגיע: ${Math.max(0, ai.cfg.turnout - ai.bought)} חוליות` : '';
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
        if (c.k === 'megaphone') {
          const cd = w.megaCD, first = w.BAL.police.megaphone.firstAt - w.t;
          if (first > 0) { ok = false; why = `מוכנה בעוד ${Math.ceil(first)} שנ'`; }
          else if (cd > 0) { ok = false; why = `עוד ${Math.ceil(cd)} שנ'`; }
          else why = this.g.input && this.g.input.aim === 'megaphone' ? 'בחרו מקום…' : 'מוכנה!';
        } else if (c.k === 'bus') {
          const Bs = w.BAL.protest.bus, cd = w.busCD, first = Bs.firstAt - w.t;
          if (first > 0) { ok = false; why = `מוכנה בעוד ${Math.ceil(first)} שנ'`; }
          else if (cd > 0) { ok = false; why = `עוד ${Math.ceil(cd)} שנ'`; }
          else if (w.money.protest < Bs.cost) { ok = false; why = `חסר ₪${Math.ceil(Bs.cost - w.money.protest)}`; }
          else why = this.g.input && this.g.input.aim === 'bus' ? 'בחרו מקום…' : 'מוכנה!';
        } else if (c.k === 'shofar') {
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
      $('selFlavor').textContent = this.hoverExplain ? '' : (this.flavorDefault || '');
      // מזרימים קהל לפי מספר המפגינים על הכביש
      let onRoad = 0;
      for (const p of w.people) if (p.side === 'protest' && (p.state === 'free' || p.state === 'held') && w.map.isRoad(p.x, p.z)) onRoad++;
      const playing = this.g.mode === 'play' && !w.outcome;
      HM.Audio.setCrowd(playing ? onRoad : 0);
      HM.Audio.setHum(playing);
      const spraying = w.squads.some(s => s.vehicle && s.vehicle.spray);
      HM.Audio.setSpray(playing && spraying);
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
        if (sq.side !== this.side && !sq.vehicle && !sq.members.length) continue;   // יריב בלי אף אחד בשטח
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
            const S = TX().STATE;
            const notable = st === S.charging || st === S.spray || st === S.stalled || st === S.arresting || st === S.ret || st === S.refill ||
              st === S.sitting || st === S.fleeing || st === S.blocking;
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
        this.hudRects = ['moneyBox', 'meterBox', 'sunBox', 'ctrlBox', 'buyPanel', 'selPanel', 'newsPanel', 'minimap']
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
    // הגבול העליון לתוויות על המסך: מתחת לפס העליון (נמדד פעם בשתי שניות)
    topLimit() {
      const now = performance.now();
      if (!this._topT || now - this._topT > 2000) {
        this._topT = now;
        const r = $('topbar').getBoundingClientRect();
        this._topY = Math.max(130, r.bottom + 18);
      }
      return this._topY;
    }

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
        const cx = U.clamp(p.x, m, st.w - m);
        const topY = this.topLimit();
        let cy = U.clamp(p.y, topY, st.h - 240);   // מתחת לפס העליון, מעל הלוחות התחתונים והרמז
        if (cx < 250 && cy < 305) cy = 305;   // לא מעל המיני-מפה
        // חץ לכיוון הכניסה כשהיא מחוץ למסך
        let arrow = '';
        if (p.x < m) arrow = '◄'; else if (p.x > st.w - m) arrow = '►'; else if (p.y < topY) arrow = '▲'; else if (p.y > st.h - 240) arrow = '▼';
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
    // ציפה שמתאחדת עם ציפה דומה וקרובה (למשל תיעוד שחוזר שוב ושוב) במקום לערום טקסטים
    floaterSum(key, amount, suffix, x, z, color) {
      const f = this.floaters.find(o => o.key === key && o.t > 0.6 && (o.x - x) ** 2 + (o.z - z) ** 2 < 196);
      if (f) { f.amount += amount; f.el.textContent = ltrNum('+' + (+f.amount.toFixed(1)) + ' ' + suffix); return; }
      this.floater('+' + (+amount.toFixed(1)) + ' ' + suffix, x, z, color);
      const n = this.floaters[this.floaters.length - 1];
      n.key = key; n.amount = amount;
    }
    floater(text, x, z, color) {
      const el = document.createElement('div');
      el.className = 'floater';
      el.textContent = ltrNum(text);
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
    alert(text, kind, icon, key, ms) {
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
      setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 520); }, ms || 3600);
    }
    news(text) {
      if (Array.isArray(text)) text = TX().pick(text);
      if (this.tick) { this.tick.q.push(text); if (this.tick.q.length > 4) this.tick.q.shift(); }
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
            const nm = { patrol: 'ניידת שוטרים בדרך', horses: 'פרשים בדרך!', cannon: 'מכת"זית בדרך!', riot: 'יס"מ בדרך!', officer: 'קצין קישור בדרך' }[e.unit];
            if (nm) this.alert(`${nm} — מגיעים בעוד ${Math.round(e.eta)} שניות`, mine === 'protest' ? 'warn' : 'info', e.unit === 'patrol' ? 'siren' : e.unit, 'inc' + e.unit);
            A.siren();
            if (e.unit !== 'patrol') this.news(N.policeArrive);
            break;
          }
          case 'arrived':
            if (e.side === 'police') {
              const nm = { patrol: 'השוטרים הגיעו', horses: 'הפרשים הגיעו', cannon: 'המכת"זית הגיעה', riot: 'היס"מ הגיע', officer: 'קצין הקישור הגיע' }[e.unit];
              if (nm) this.alert(nm + ' — יוצאים מהתחנה', mine === 'protest' ? 'warn' : 'info', e.unit, 'arr' + e.unit);
              if (e.unit === 'horses') A.hooves();
            } else if (e.side === mine && w.t > 1) {
              this.alert(`${TX().UNITS[e.unit].name} יוצאים מהישיבה`, 'good', e.unit, 'arrp' + e.squad);
            } else if (e.side === 'protest' && mine === 'police' && w.t > 1) {
              this.alert(`${TX().UNITS[e.unit].name} יוצאים מהישיבה — בדרך לצומת`, 'warn', e.unit, 'arrp');
            }
            break;
          case 'wave':
            if (mine === 'police') { this.alert(`גל מפגינים: ${e.n} חוליות יוצאות מהישיבה יחד!`, 'warn', 'news', 'wave'); this.news(N.wave); }
            break;
          case 'megaphone':
            A.siren();
            this.bubble('ההתקהלות אינה חוקית!', e.x, e.z, 'cop', 3.4, true);
            this.news(N.megaphone);
            if (mine === 'police') this.alert(e.n ? `הכריזה פגעה במורל של ${e.n} חוליות` : 'אין מפגינים בטווח הכריזה', e.n ? 'good' : 'info', 'megaphone');
            else this.alert('כריזת משטרה — המורל יורד', 'warn', 'megaphone', 'mega');
            break;
          case 'autoEngage':
            break;
          case 'busIncoming':
            if (mine === 'protest') this.alert(`ההסעה בדרך — מגיעה בעוד ${Math.round(e.eta)} שניות`, 'good', 'bus');
            else { this.alert('אוטובוס מפגינים בדרך — שתי חוליות יירדו בעוד כמה שניות!', 'warn', 'bus', 'bus'); this.news(N.bus); }
            break;
          case 'busArrived':
            this.bubble('הגענו!', e.x, e.z, '', 3.2, true);
            if (mine === 'police') this.alert('אוטובוס הוריד מפגינים', 'warn', 'bus', 'busArr');
            break;
          case 'permitBlocked':
            this.bubble(TX().pick(L.officer), e.x + 1.5, e.z + 1.5, 'cop', 3.2, true);
            if (mine === 'protest') this.alert('קצין הקישור לא מאמין לעסקן — "יש לי אישור" לא עובד כשהוא לידו', 'warn', 'officer', 'pblk');
            else this.alert('הקצין שלכם ביטל את "יש לי אישור" של העסקן', 'good', 'officer', 'pblk');
            break;
          case 'ambIncoming': {
            const arm = w.map.arms[e.arm];
            this.alert(`אמבולנס בדרך${arm ? ' — ' + arm.name : ''}. לא לחסום אותו!`, 'info', 'ambulance', 'ambin');
            A.ambSiren();
            break;
          }
          case 'ambBlocked':
            if (mine === 'protest') this.alert(`אמבולנס תקוע מול חוליה ${e.num}! פנו לו דרך תוך ${Math.round(e.limit - 3)} שניות — אחרת התקשורת תתהפך`, 'warn', 'ambulance', 'ambblk');
            else this.alert('המפגינים חוסמים אמבולנס — אם לא יפנו, זה יפגע בהם', 'info', 'ambulance', 'ambblk');
            this.bubble('תנו לעבור!', e.x, e.z, 'driver', 2.8, true);
            break;
          case 'kugelIncoming':
            this.alert(mine === 'protest' ? 'משאית קוגל בדרך לישיבה! פנו לה דרך — כל ההפגנה תקבל מורל, והמאפייה תתרום לקופה' : 'משאית קוגל בדרך לישיבה — אם יפנו לה דרך, המורל שלהם יעלה',
              mine === 'protest' ? 'good' : 'info', 'car', 'kugin', 6000);
            this.news(N.kugelIn);
            break;
          case 'kugelBlocked':
            if (mine === 'protest') this.alert(`משאית הקוגל תקועה מול חוליה ${e.num}! פנו לה דרך לפני שהקוגל מתקרר`, 'warn', 'car', 'kugblk');
            this.bubble(TX().pick(L.kugel), e.x, e.z, 'driver', 3.2, true);
            break;
          case 'kugelCold':
            this.news(N.kugelCold);
            this.bubble('הקוגל התקרר. אני מודיע למשגיח.', e.x, e.z, 'driver', 3.2, true);
            if (mine === 'protest') this.alert('הקוגל התקרר — המורל לא יעלה הפעם', 'warn', 'car');
            break;
          case 'kugelDelivered':
            this.news(N.kugelOk);
            this.alert(mine === 'protest' ? `הקוגל הגיע חם! +${e.morale} מורל לכל ההפגנה, והמאפייה תרמה ₪${e.money}` : 'הקוגל הגיע לישיבה — המפגינים במורל גבוה', mine === 'protest' ? 'good' : 'warn', 'car', 'kugok');
            break;
          case 'ambScandal':
            this.news(N.ambScandal);
            this.floater('−' + e.amount + ' כותרות', e.x, e.z, mine === 'protest' ? '#ff7b6b' : '#8be59e');
            this.alert('חסמתם אמבולנס — המד ירד והמורל נפגע', mine === 'protest' ? 'warn' : 'good', 'ambulance');
            break;
          case 'tramBlocked':
            this.news(N.tram);
            this.alert('הרכבת הקלה תקועה — המד עולה מהר יותר!', mine === 'protest' ? 'good' : 'warn', 'news', 'tram');
            break;
          case 'grab':
            if (Math.random() < 0.12) this.bubble(TX().pick(L.copGrab), e.x, e.z, 'cop', 3.1);
            break;
          case 'dragged':
            // לפעמים — צמד קטן בין המפגין לשוטר ("דודי?!")
            if (this.gagT <= 0 && Math.random() < 0.12) {
              this.gagT = 45;
              const gag = TX().pick(L.gags), wNow = this.w;
              this.bubble(gag[0], e.x, e.z, '', 2.9, true);
              setTimeout(() => { if (this.w === wNow) this.bubble(gag[1], e.x + 1.2, e.z + 0.8, 'cop', 3.3, true); }, 1300);
            } else if (Math.random() < 0.35) this.bubble(TX().pick(L.dragged), e.x, e.z);
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
            else if (sq && mine === 'police') this.alert(`חוליית מפגינים ${sq.num} בורחת${e.reason === 'horses' ? ' מהפרשים' : e.reason === 'water' ? ' מהמים' : e.reason === 'megaphone' ? ' מהכריזה' : ''}`, 'good', null, 'pflee');
            break;
          }
          case 'broken': {
            if (this.side === 'protest') this.alert(`חוליה ${e.num} נשברה והלכה הביתה`, 'warn', null);
            else this.alert(`חוליית מפגינים ${e.num} נשברה והלכה הביתה`, 'good', null);
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
            if (e.reason === 'horseScandal') { this.news(N.horseScandal); this.floater('+' + e.amount + ' כותרות!', e.x, e.z, mine === 'police' ? '#ff7b6b' : null); this.alert('שערורייה: פרשים מול יושבים — המד קפץ!', mine === 'protest' ? 'good' : 'warn', 'news'); }
            else if (e.reason === 'askanArrest') { this.news(N.askanArrest); this.floater('+' + e.amount + ' כותרות', e.x, e.z, mine === 'police' ? '#ff7b6b' : null); }
            else if (e.reason === 'photoArrest') { this.news(N.photoArrest); this.floater('+' + e.amount + ' כותרות!', e.x, e.z, mine === 'police' ? '#ff7b6b' : null); }
            else if (e.reason === 'ambRespect') { this.news(N.ambRespect); this.floater('+' + e.amount + ' כבוד', e.x, e.z); }
            else if (e.reason === 'kugel') { this.floater('+' + e.amount + ' קוגל', e.x, e.z, '#ffd38a'); }
            else if (e.reason === 'documented') {
              this.floaterSum('doc', e.amount, 'תיעוד', e.x, e.z, mine === 'police' ? '#ff7b6b' : null);
              const ph = w.squads.find(q => q.type === 'photographer' && q.members.length);
              if (ph && Math.random() < 0.4) this.bubble(TX().pick(L.photo), ph.members[0].x, ph.members[0].z, '', 2.9);
              if (!this.newsDone.has('doc')) { this.newsDone.add('doc'); this.news(N.documented); }
            }
            break;
          case 'nearMiss':
            this.bubble(TX().pick(L.nearMiss), e.x, e.z);
            A.honk(1.4);
            if (e.side === mine) this.alert('כמעט! רכב בלם ברגע האחרון — היכנסו לכביש כשהרמזור אדום', 'warn', 'car', 'near');
            break;
          case 'honk': {
            this.honks++;
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

    // רשימת החוליות שלכם (כשאין בחירה) — לחיצה בוחרת
    renderRoster() {
      const box = $('selEmpty');
      const mine = this.w.squads.filter(s => s.side === this.side && !s.broken && (s.members.length || s.vehicle || this.awayCount(s)))
        .sort((a, b) => a.num - b.num);
      const key = mine.map(s => s.id + ':' + s.members.length + ':' + this.squadState(s)).join(',');
      if (key === this.rosterKey && box.childElementCount) return;
      this.rosterKey = key;
      box.innerHTML = '';
      const head = document.createElement('div');
      head.className = 'rosterHead';
      head.textContent = this.side === 'protest' ? 'החוליות שלכם — לחצו על אחת כדי לבחור אותה (או גררו מלבן על המפה)' : 'הכוחות שלכם — לחצו על אחד כדי לבחור אותו';
      box.appendChild(head);
      const row = document.createElement('div');
      row.className = 'roster';
      for (const s of mine.slice(0, 12)) {
        const b = document.createElement('button');
        b.className = 'rosterChip';
        const n = s.vehicle ? '' : s.members.length;
        b.innerHTML = `<span class="num ${s.side === 'police' ? 'pol' : ''}">${s.num}</span>${HM.ICONS[s.type]}<span>${n}</span><span class="st">${this.squadState(s)}</span>`;
        b.title = TX().UNITS[s.type].name;
        b.onclick = (e) => { e.stopPropagation(); this.g.input.selectClick(s, e.shiftKey || e.ctrlKey); };
        b.ondblclick = (e) => { e.stopPropagation(); this.g.input.focus(s); };
        row.appendChild(b);
      }
      box.appendChild(row);
    }

    // ---------- לוח החוליה הנבחרת ----------
    updateSelection(force) {
      const inp = this.g.input;
      if (!inp || !this.w) return;
      const ids = [...inp.selected].filter(id => { const s = this.w.squadById(id); return s && !s.broken && (s.members.length || s.vehicle); });
      const sqs = ids.map(id => this.w.squadById(id));
      const key = sqs.map(s => s.id + ':' + s.members.length + ':' + this.squadState(s) + ':' + Math.round(s.morale / 5) + ':' + (s.cd.permit > 0 ? Math.ceil(s.cd.permit) : 0) + ':' + this.awayCount(s)).join(',');
      // בלי בחירה — הרשימה מתעדכנת לבד (יש לה מפתח משלה)
      if (!force && key === this.selKey) { if (!sqs.length) this.renderRoster(); return; }
      this.selKey = key;
      if (!sqs.length) {
        $('selEmpty').classList.remove('hidden');
        $('selBody').classList.add('hidden');
        this.selExplainDefault = '';
        this.flavorDefault = '';
        this.renderRoster();
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
      if (this.side === 'police') {
        const can = sqs.find(s => s.type === 'cannon');
        if (can) {
          const V = can.vehicle;
          const busy = V.state === 'return' || V.state === 'refill';
          add(busy ? `ממלאת מים (${Math.round(V.tank / this.w.BAL.police.cannon.tank * 100)}%)` : 'חזרה למילוי מים', 'R', 'המכת"זית נוסעת לתחנה וממלאת את המיכל עד הסוף (12 שניות). כדאי כשהמיכל כמעט ריק.', () => this.g.input.refill(), busy);
        }
        const foot = sqs.filter(s => !s.vehicle);
        if (foot.length) add('לרדת למדרכה', 'G', 'החוליה עוזבת את מה שהיא עושה ועומדת על המדרכה הקרובה — שלא תחסום בעצמה את התנועה.', () => this.g.input.toSidewalk());
        this.selExplainDefault = sqs.length === 1 ? TX().POLICE_HELP[sqs[0].type] : 'לחיצה על חוליית מפגינים — כל הנבחרים מטפלים בה. לחיצה על המדרכה — מציבים שם.';
        this.flavorDefault = sqs.length === 1 ? (TX().FLAVOR[sqs[0].type] || '') : '';
      } else {
        this.selExplainDefault = sqs.length === 1 ? TX().UNITS[sqs[0].type].explain : 'לחיצה על הכביש שולחת את כל החוליות הנבחרות — הן נפרסות זו לצד זו.';
        this.flavorDefault = sqs.length === 1 ? (TX().FLAVOR[sqs[0].type] || '') : '';
      }
      // מציגים מיד (ולא רק בעדכון הטקסט הבא)
      $('selExplain').textContent = this.hoverExplain || this.selExplainDefault || '';
      $('selFlavor').textContent = this.hoverExplain ? '' : (this.flavorDefault || '');
    }
  }

  HM.HUD = HUD;
})(typeof window !== 'undefined' ? window : globalThis);
