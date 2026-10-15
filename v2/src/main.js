/* זרימת המשחק: מסכים, לולאה ראשית, הגדרות, הדרכה קצרה ומסך סיום. */
(function (root) {
  'use strict';
  const HM = root.HM;
  const U = HM.U;
  const $ = (id) => document.getElementById(id);

  // אחסון מקומי — עטוף, כי בחלון פרטי הוא עלול לזרוק שגיאה
  const store = {
    get(k, d) { try { const v = root.localStorage.getItem('hm2-' + k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { root.localStorage.setItem('hm2-' + k, JSON.stringify(v)); } catch (e) { /* בלי אחסון — לא נורא */ } }
  };

  const SCREENS = ['loading', 'menu', 'howto', 'settings', 'pause', 'end'];
  const MAP_ORDER = ['barilan', 'kvish4', 'gesher'];

  // התקדמות: כוכבים לכל צד/מפה/קושי. מפה נפתחת אחרי ניצחון במפה שלפניה (באותו צד).
  const Prog = {
    data() { return store.get('prog', {}); },
    stars(side, map, diff) { const d = this.data(); return ((d[side] || {})[map] || {})[diff] || 0; },
    best(side, map) { const d = ((this.data()[side] || {})[map]) || {}; return Math.max(0, d.easy || 0, d.normal || 0, d.hard || 0); },
    record(side, map, diff, stars) {
      const d = this.data();
      d[side] = d[side] || {}; d[side][map] = d[side][map] || {};
      const before = d[side][map][diff] || 0;
      if (stars > before) d[side][map][diff] = stars;
      store.set('prog', d);
      return stars > before;
    },
    unlocked(side, map) {
      if (/[?&]unlock=1/.test(root.location.search || '') || store.get('unlockAll', false)) return true;
      const i = MAP_ORDER.indexOf(map);
      return i <= 0 || this.best(side, MAP_ORDER[i - 1]) > 0;
    }
  };
  function showScr(id) { for (const s of SCREENS) $(s).classList.toggle('hidden', s !== id); }

  const G = {
    mode: 'loading', side: 'protest', mapId: 'barilan', diff: store.get('diff', 'easy'),
    speed: 1, acc: 0, camGoal: null, tutorialHint: null,
    settings: { vol: store.get('vol', 70), quality: store.get('quality', 'medium'), muted: store.get('muted', false), music: store.get('music', true) },

    boot() {
      if (!root.THREE) { $('loadMsg').textContent = 'שגיאה: קובץ הגרפיקה לא נטען.'; return; }
      $('loadMsg').textContent = HM.TXT.pick(HM.TXT.LOADING);
      this.newQuote();
      try {
        this.stage = new HM.Stage($('c'), this.settings.quality);
      } catch (e) {
        $('loadMsg').textContent = 'המחשב לא הצליח להפעיל גרפיקה תלת-ממדית (WebGL).';
        console.error(e);
        return;
      }
      HM.Audio.vol = this.settings.vol / 100;
      HM.Audio.muted = this.settings.muted;
      HM.Audio.musicOn = this.settings.music;
      this.hud = new HM.HUD(this);
      this.input = new HM.Input(this);
      this.minimap = new HM.Minimap(this);
      this.wireMenus();
      this.wireMenuKeys();
      root.addEventListener('resize', () => this.stage.resize());
      // אם כרטיס המסך מאבד את ההקשר — הודעה ברורה במקום מסך שחור
      const cv = this.stage.renderer.domElement;
      cv.addEventListener('webglcontextlost', (e) => {
        e.preventDefault();
        this.glLost = true;
        if (this.mode === 'play') this.mode = 'paused';
        $('glLost').classList.remove('hidden');
      });
      cv.addEventListener('webglcontextrestored', () => { root.location.reload(); });
      $('btnGlReload').onclick = () => root.location.reload();
      // ממתינים לגופנים לפני ציור שלטים
      const ready = document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve();
      Promise.race([ready, new Promise(r => setTimeout(r, 1500))]).then(() => {
        try { this.startDemo(); } catch (e) {
          $('loadMsg').textContent = 'שגיאה בטעינת המשחק: ' + e.message;
          console.error(e);
          return;
        }
        this.last = performance.now();
        requestAnimationFrame((t) => this.loop(t));
        setTimeout(() => { this.mode = 'menu'; showScr('menu'); }, 250);
      });
    },

    // ---------- תפריטים ----------
    wireMenus() {
      const seg = (id, attr, cb) => {
        const box = $(id);
        box.querySelectorAll('.segBtn').forEach(b => {
          b.onclick = () => {
            if (b.disabled) return;
            box.querySelectorAll('.segBtn').forEach(x => x.classList.toggle('active', x === b));
            cb(b.dataset[attr]);
            HM.Audio.init(); HM.Audio.click();
            this.updateStartSum();
          };
        });
      };
      seg('sideSeg', 'side', v => { this.side = v; });
      seg('mapSeg', 'map', v => { this.mapId = v; });
      seg('diffSeg', 'diff', v => { this.diff = v; store.set('diff', v); });
      $('diffSeg').querySelectorAll('.segBtn').forEach(b => b.classList.toggle('active', b.dataset.diff === this.diff));
      seg('qualSeg', 'q', v => {
        if (v === this.settings.quality) return;
        store.set('quality', v);
        $('qualNote').textContent = 'האיכות משתנה — טוענים מחדש…';
        setTimeout(() => root.location.reload(), 400);
      });
      $('qualSeg').querySelectorAll('.segBtn').forEach(b => b.classList.toggle('active', b.dataset.q === this.settings.quality));
      $('btnStart').onclick = () => { HM.Audio.init(); this.startGame(); };
      $('btnHow').onclick = () => { showScr('howto'); };
      $('btnHowBack').onclick = () => { showScr(this.mode === 'paused' ? 'pause' : (this.howReturn || 'menu')); this.howReturn = null; };
      $('btnSettings').onclick = () => showScr('settings');
      $('unlockAll').checked = store.get('unlockAll', false);
      $('unlockAll').onchange = (e) => { store.set('unlockAll', !!e.target.checked); this.updateMapButtons(); };
      $('btnSetBack').onclick = () => showScr('menu');
      $('musicOn').checked = this.settings.music;
      $('musicOn').onchange = (e) => { this.settings.music = !!e.target.checked; store.set('music', this.settings.music); HM.Audio.init(); HM.Audio.setMusic(this.settings.music); };
      const vol = (v) => { this.settings.vol = +v; store.set('vol', +v); HM.Audio.setVolume(+v / 100); $('volSlider').value = v; $('volSlider2').value = v; };
      $('volSlider').oninput = (e) => vol(e.target.value);
      $('volSlider2').oninput = (e) => vol(e.target.value);
      $('volSlider').value = this.settings.vol; $('volSlider2').value = this.settings.vol;
      $('btnResume').onclick = () => this.togglePause();
      $('btnRestart').onclick = () => this.startGame();
      $('btnQuit').onclick = () => this.toMenu();
      $('btnPauseHow').onclick = () => { this.howReturn = 'pause'; showScr('howto'); };
      // כפתור שנלחץ לא נשאר "בפוקוס" — אחרת רווח/Enter ילחצו עליו שוב
      document.addEventListener('click', (e) => { const b = e.target.closest && e.target.closest('button'); if (b) b.blur(); });
      root.addEventListener('keyup', (e) => { if (e.code === 'Space') e.preventDefault(); });
      $('btnAgain').onclick = () => this.startGame();
      $('btnEndMenu').onclick = () => this.toMenu();
      $('btnMute').classList.toggle('off', this.settings.muted);
      this.updateStartSum();
    },

    // כפתורי המפות: כוכבים לפי הצד והקושי שנבחרו, ונעילה עד ניצחון במפה הקודמת
    updateMapButtons() {
      const names = { barilan: 'צומת בר אילן', kvish4: 'כביש 4', gesher: 'גשר המיתרים' };
      document.querySelectorAll('#mapSeg .segBtn').forEach(b => {
        const id = b.dataset.map, def = HM.MAP_DEFS[id];
        const open = Prog.unlocked(this.side, id);
        const st = Prog.stars(this.side, id, this.diff);
        b.disabled = !open;
        const span = b.querySelector('span');
        if (!open) {
          const prev = MAP_ORDER[MAP_ORDER.indexOf(id) - 1];
          span.textContent = 'נפתח אחרי ניצחון ב' + names[prev];
          b.title = 'נצחו קודם ב' + names[prev] + ' (בצד הזה)';
        } else {
          span.textContent = def.city + (st ? ' · ' + '★'.repeat(st) + '☆'.repeat(3 - st) : '');
          b.title = def.blurb;
        }
      });
      if (!Prog.unlocked(this.side, this.mapId)) {
        this.mapId = 'barilan';
        document.querySelectorAll('#mapSeg .segBtn').forEach(b => b.classList.toggle('active', b.dataset.map === 'barilan'));
      }
    },

    updateStartSum() {
      this.updateMapButtons();
      const side = this.side === 'protest' ? 'מארגני ההפגנה' : 'מפקד המשטרה';
      const map = HM.MAP_DEFS[this.mapId] ? HM.MAP_DEFS[this.mapId].name : '';
      const diff = { easy: 'קל', normal: 'רגיל', hard: 'קשה' }[this.diff];
      $('btnStart').innerHTML = (this.side === 'protest' ? 'התחילו את ההפגנה' : 'התחילו את המבצע') + ' <span class="kbdHint">Enter</span>';
      $('startSum').textContent = `${side} · ${map} · ${diff}`;
    },

    // ---------- משחק רקע בתפריט ----------
    startDemo() {
      this.setWorld(new HM.World({ seed: (Math.random() * 1e9) | 0, protest: 'ai', police: 'ai', difficulty: 'normal' }));
      this.demo = true;
      this.stage.cam.dist = 92; this.stage.cam.pitch = 0.78; this.stage.cam.tx = 0; this.stage.cam.tz = 0;
    },

    setWorld(world) {
      if (this.view) this.view.dispose();
      this.world = world;
      this.view = new HM.View(this.stage, world);
      // מכינים מראש את כל תוכניות הציור (גם של דברים שעוד מוסתרים — מים, אמבולנס, עיגולים),
      // כדי שהכנה ראשונה בכרטיס המסך לא תיתקע באמצע משחק
      try { this.stage.renderer.compile(this.stage.scene, this.stage.camera); } catch (e) { /* לא קריטי */ }
      this.input.bind(world);
      this.acc = 0;
    },

    startGame() {
      HM.Audio.init();
      clearTimeout(this.endTimer);
      // ?seed=123 בכתובת — משחק שחוזר על עצמו (לבדיקות ולשחזור באגים)
      const qs = /[?&]seed=(\d+)/.exec(root.location.search || '');
      const seed = qs ? +qs[1] : (Math.random() * 1e9) | 0;
      const w = new HM.World({ seed, map: this.mapId, protest: this.side === 'protest' ? 'human' : 'ai', police: this.side === 'police' ? 'human' : 'ai', difficulty: this.diff });
      this.setWorld(w);
      this.demo = false;
      this.hud.bind(w, this.side);
      this.minimap.bind(w);
      this.resetCam();
      this.input.aim = null;
      this.speed = 1; $('btnSpeed').textContent = '×1';
      $('hud').classList.remove('hidden');
      showScr(null);
      this.mode = 'play';
      this.endShown = false;
      this.tutorial = store.get('tutDone-' + this.side, false) ? null : { step: 0, t: 0 };
      this.startTutorial();
    },

    // ---------- מקלדת בתפריטים ובמסכים ----------
    // רץ לפני מקשי המשחק (שלב הלכידה): מה שמטופל כאן לא מגיע למשחק
    wireMenuKeys() {
      this.menuRow = 0;
      const vis = (id) => !$(id).classList.contains('hidden');
      const take = (e) => { e.preventDefault(); e.stopPropagation(); };
      root.addEventListener('keydown', (e) => {
        const t = e.target;
        if (t && t.tagName === 'INPUT' && t.type === 'range' && e.code.startsWith('Arrow')) return;   // המחוון מקבל את החיצים
        if (vis('howto')) { if (['Escape', 'Enter', 'F1', 'KeyH', 'Space'].includes(e.code)) { take(e); $('btnHowBack').click(); } return; }
        if (vis('settings')) { if (e.code === 'Escape') { take(e); $('btnSetBack').click(); } return; }
        if (vis('end')) {
          if (e.code === 'Enter' || e.code === 'Space') { take(e); $('btnAgain').click(); }
          else if (e.code === 'Escape') { take(e); $('btnEndMenu').click(); }
          return;
        }
        if (vis('pause')) {
          if (e.code === 'KeyR') { take(e); $('btnRestart').click(); }
          else if (e.code === 'KeyQ') { take(e); $('btnQuit').click(); }
          else if (e.code === 'KeyH' || e.code === 'F1') { take(e); $('btnPauseHow').click(); }
          return;   // רווח / P / Esc — ממשיכים לשחק (מטופל במקשי המשחק)
        }
        if (vis('menu')) {
          const rows = ['sideSeg', 'mapSeg', 'diffSeg'];
          const onBtn = document.activeElement && document.activeElement.tagName === 'BUTTON';
          if (e.code === 'Enter' && !onBtn) { take(e); $('btnStart').click(); return; }
          if (e.code === 'ArrowDown' || e.code === 'ArrowUp') {
            take(e);
            this.menuRow = (this.menuRow + (e.code === 'ArrowDown' ? 1 : rows.length - 1)) % rows.length;
            this.showMenuRow();
            return;
          }
          if (e.code === 'ArrowLeft' || e.code === 'ArrowRight') {
            take(e);
            const btns = [...$(rows[this.menuRow]).querySelectorAll('.segBtn')].filter(b => !b.disabled);
            if (!btns.length) return;
            let i = btns.findIndex(b => b.classList.contains('active'));
            // מימין לשמאל: האפשרות הראשונה בצד ימין, ולכן שמאלה = הבאה
            i = (Math.max(0, i) + (e.code === 'ArrowLeft' ? 1 : btns.length - 1)) % btns.length;
            btns[i].click();
            this.showMenuRow();
            return;
          }
          if (e.code === 'KeyH' || e.code === 'F1') { take(e); $('btnHow').click(); }
        }
      }, true);
    },
    showMenuRow() { ['sideSeg', 'mapSeg', 'diffSeg'].forEach((id, k) => $(id).classList.toggle('kbd', k === this.menuRow)); },
    // עזרה באמצע משחק: עוצרים ומראים את מסך ההסבר
    showHelp() {
      if (this.mode === 'play' && !(this.world && this.world.outcome)) this.togglePause();
      if (this.mode !== 'paused') return;
      this.howReturn = 'pause';
      showScr('howto');
    },
    resetCam() {
      const cam = this.stage.cam;
      this.camGoal = null;
      if (this.side === 'police') { cam.tx = 12; cam.tz = -13; cam.dist = 80; cam.yaw = 0; cam.pitch = 0.98; }   // גם התחנה וגם הצומת בתמונה
      else { cam.tx = -8; cam.tz = 13; cam.dist = 76; cam.yaw = 0; cam.pitch = 0.98; }   // החוליות בחצר הישיבה — לא מתחת ללוחות התחתונים
    },

    newQuote() { $('menuQuote').textContent = HM.TXT.pickNot(HM.TXT.QUOTES, $('menuQuote').textContent); },

    toMenu() {
      clearTimeout(this.endTimer);
      this.newQuote();
      this.tutorial = null;
      $('hud').classList.add('hidden');
      HM.Audio.stopAll();
      this.startDemo();
      this.mode = 'menu';
      showScr('menu');
      this.hud.clearDynamic();
      $('hint').textContent = '';
      this.tutorialHint = null;
      this.updateStartSum();   // מפה שנפתחה עכשיו — הכפתור שלה נפתח מיד
    },

    togglePause() {
      if (this.mode === 'play' && this.world && this.world.outcome) return;   // המשחק נגמר — מסך הסיום בדרך
      if (this.mode === 'play') { this.mode = 'paused'; $('pauseFun').textContent = HM.TXT.pickNot(HM.TXT.PAUSE, $('pauseFun').textContent); showScr('pause'); HM.Audio.stopAll(); }
      else if (this.mode === 'paused') { this.mode = 'play'; showScr(null); }
    },
    toggleSpeed() {
      this.speed = this.speed === 1 ? 2 : 1;
      $('btnSpeed').textContent = '×' + this.speed;
    },
    toggleMute() {
      this.settings.muted = !this.settings.muted;
      store.set('muted', this.settings.muted);
      HM.Audio.setMuted(this.settings.muted);
      $('btnMute').classList.toggle('off', this.settings.muted);
    },

    useCard(k) {
      if (this.mode !== 'play' || !this.world || this.world.outcome) return;
      HM.Audio.init();
      const w = this.world;
      if (k === 'shofar') {
        const r = w.cmd(this.side, { type: 'shofar' });
        if (!r.ok) this.hud.alert('השופר עוד לא מוכן', 'info', 'shofar', 'shofarNo');
        return;
      }
      if (k === 'bus') {
        const Bs = w.BAL.protest.bus;
        if (w.busCD > 0 || w.t < Bs.firstAt) { this.hud.alert('ההסעה עוד לא מוכנה', 'info', 'bus', 'busNo'); return; }
        if (w.money.protest < Bs.cost) { this.hud.alert('אין מספיק כסף להסעה', 'info', 'bus', 'busNo'); return; }
        this.input.aim = this.input.aim === 'bus' ? null : 'bus';
        HM.Audio.click();
        return;
      }
      if (k === 'megaphone') {
        const Mg = w.BAL.police.megaphone;
        if (w.megaCD > 0 || w.t < Mg.firstAt) { this.hud.alert('הכריזה עוד לא מוכנה', 'info', 'megaphone', 'megaNo'); return; }
        this.input.aim = this.input.aim === 'megaphone' ? null : 'megaphone';
        HM.Audio.click();
        if (this.tutorial && this.tutorial.step === 3 && this.side === 'police') this.setTut(4);
        return;
      }
      const r = w.cmd(this.side, { type: 'buy', unit: k });
      if (r.ok) {
        HM.Audio.chime(true);
        this.onBuy && this.onBuy(k);
      } else {
        const msg = r.reason === 'money' ? 'אין מספיק כסף בקופה — הכסף נכנס כל שנייה, ומהר יותר כשהמד גבוה' : r.reason === 'max' ? 'הגעתם למספר המקסימלי מהסוג הזה' : 'אי אפשר עכשיו';
        this.hud.alert(msg, 'info', null, 'buyNo' + r.reason);
      }
    },

    // ---------- הדרכה קצרה (במשחק הראשון) ----------
    startTutorial() {
      if (!this.tutorial) { this.tutorialHint = null; return; }
      this.setTut(0);
    },
    setTut(step) {
      this.tutorial.step = step;
      const S = this.side === 'police' ? [
        'שלב 1 מתוך 4: לחצו על השלט הכחול של חוליית שוטרים כדי לבחור אותה',
        'שלב 2 מתוך 4: כשהמפגינים יוצאים לכביש — לחצו על אחת החוליות שלהם. השוטרים יגררו אותם לניידת',
        'שלב 3 מתוך 4: מפגינים שעומדים? פרשים (X) מפזרים אותם. יושבים? רק שוטרים או מכת"זית (C)',
        'שלב 4 מתוך 4: הכריזה (V) מורידה מורל לכל מי שבאזור. ניידת מלאה = 10 מפגינים יוצאים מהמשחק'
      ] : [
        'שלב 1 מתוך 4: לחצו על השלט הצהוב של אחת החוליות כדי לבחור אותה',
        'שלב 2 מתוך 4: עכשיו לחצו על הכביש — החוליה תיפרס לרוחבו. האדום מראה אילו נתיבים ייחסמו',
        'שלב 3 מתוך 4: לחצו "לשבת על הכביש" (או S) — כך קשה יותר לפנות אתכם',
        'שלב 4 מתוך 4: הפקק מעלה את מד הכותרות למעלה. הזמינו עוד חוליות מהלוח בצד ימין (Z / X / C)'
      ];
      this.tutorialHint = S[step] || null;
      $('hint').textContent = this.tutorialHint || '';
      if (step === 3 || (this.side === 'police' && step === 2)) this.tutorial.t = 14;
      if (step >= S.length) { this.tutorial = null; store.set('tutDone-' + this.side, true); }
    },
    onSelect() { if (this.tutorial && this.tutorial.step === 0) this.setTut(1); },
    onCommand(kind, d) {
      if (!this.tutorial) return;
      if (this.side === 'police') {
        if (this.tutorial.step === 1 && kind === 'target') this.setTut(2);
        return;
      }
      if (this.tutorial.step === 1 && kind === 'move' && d.onRoad) this.setTut(2);
      else if (this.tutorial.step === 2 && kind === 'stance' && d.st === 'sit') this.setTut(3);
    },
    onBuy() { if (this.tutorial && this.tutorial.step >= 2 && this.tutorial.step <= 3) this.setTut(this.tutorial.step + 1); },
    tickTutorial(dt) {
      if (!this.tutorial) return;
      const st = this.tutorial.step;
      if ((st === 3) || (this.side === 'police' && st === 2)) { this.tutorial.t -= dt; if (this.tutorial.t <= 0) this.setTut(st + 1); }
    },

    // ---------- סיום ----------
    showEnd(o) {
      const w = this.world, E = HM.TXT.END[this.side] || HM.TXT.END.protest;
      const win = o.winner === this.side;
      const txt = E[o.reason] || { title: win ? 'ניצחון' : 'הפסד', sub: '' };
      $('endTitle').textContent = txt.title;
      $('endSub').textContent = HM.TXT.fmt(Array.isArray(txt.sub) ? HM.TXT.pick(txt.sub) : txt.sub, { km: w.stats.jamPeak.toFixed(1), place: w.map.name, H: Math.floor(w.Hpeak) });
      $('endBadge').textContent = HM.TXT.endBadge(this.side, o, w.stats, this.hud.honks, w.t);
      $('endFun').textContent = this.hud.honks > 20 ? HM.TXT.fmt(HM.TXT.pick(HM.TXT.END_FUN), { honks: U.fmtNum(this.hud.honks) }) : '';
      $('endPlace').textContent = w.map.name + ' · ' + U.fmtTime(w.t);
      $('endEdition').textContent = win ? 'מהדורה מיוחדת' : 'מהדורת ערב';
      let st = '';
      for (let i = 0; i < 3; i++) st += i < (win ? o.stars : 0) ? '★' : '<span class="off">★</span>';
      $('endStars').innerHTML = st;
      const S = w.stats;
      const cells = this.side === 'police' ? [
        [Math.floor(w.Hpeak), 'שיא מד הכותרות'],
        [w.stats.jamPeak.toFixed(1), 'שיא הפקק (ק"מ)'],
        [U.fmtTime(w.t), 'משך המבצע'],
        [S.dragged, 'פינויים'],
        [S.removed, 'נלקחו לתחנה'],
        [S.scandals, 'שערוריות בחדשות']
      ] : [
        [w.stats.jamPeak.toFixed(1), 'שיא הפקק (ק"מ)'],
        [Math.floor(w.Hpeak), 'שיא מד הכותרות'],
        [U.fmtTime(w.t), 'משך ההפגנה'],
        [S.dragged, 'נגררו לניידת'],
        [S.removed, 'נלקחו לתחנה'],
        [S.bought.protest, 'חוליות שהוזמנו']
      ];
      $('endStats').innerHTML = cells.map(c => `<div class="stat"><b>${c[0]}</b><span>${c[1]}</span></div>`).join('');
      // התקדמות
      let extra = '';
      if (win) {
        const mapIdx = MAP_ORDER.indexOf(w.map.id);
        const nextMap = MAP_ORDER[mapIdx + 1];
        const wasOpen = nextMap ? Prog.unlocked(this.side, nextMap) : true;
        const better = Prog.record(this.side, w.map.id, this.diff, o.stars);
        if (nextMap && !wasOpen && Prog.unlocked(this.side, nextMap)) extra = 'נפתחה מפה חדשה: ' + HM.MAP_DEFS[nextMap].name + '!';
        else if (better) extra = 'שיא חדש במפה הזו!';
      }
      $('endUnlock').textContent = extra;
      $('endUnlock').classList.toggle('hidden', !extra);
      showScr('end');
      HM.Audio.stopAll();
      HM.Audio.sting(win);
      HM.Audio.duckMusic(3.5);
      this.mode = 'end';
    },

    // ---------- לולאה ----------
    loop(tms) {
      requestAnimationFrame((t) => this.loop(t));
      const now = tms;
      const dtReal = Math.min(0.1, (now - this.last) / 1000);
      this.last = now;
      const w = this.world;
      if (!w) return;
      const DT = w.BAL.dt;
      const running = (this.mode === 'play' && !w.outcome) || this.mode === 'menu' || (this.mode === 'loading');
      if (running) {
        this.acc += dtReal * (this.mode === 'play' ? this.speed : 1);
        let n = 0;
        while (this.acc >= DT && n < 10) {
          w.step(DT);
          this.acc -= DT;
          n++;
        }
        if (n >= 10) this.acc = 0;
        const evs = w.events.drain();
        if (!this.demo) this.hud.handleEvents(evs);
        if (this.demo && w.outcome) this.startDemo();
      }
      const alpha = running ? U.clamp(this.acc / DT, 0, 1) : 1;
      if (this.mode === 'menu') this.stage.cam.yaw += dtReal * 0.04;
      this.input.update(dtReal);
      this.view.update(alpha, dtReal, { selected: this.demo ? null : this.input.selected, targetSet: this.input.targetSet });
      this.stage.setDay(w.t / w.sunset);
      if (!this.demo && this.mode !== 'menu') { this.hud.update(dtReal); this.minimap.update(dtReal); }
      if (this.mode === 'play') this.tickTutorial(dtReal);
      if (!this.demo && w.outcome && !this.endShown) {
        this.endShown = true;
        $('hint').textContent = '';
        clearTimeout(this.endTimer);
        this.endTimer = setTimeout(() => { if (this.world === w && !this.demo) this.showEnd(w.outcome); }, 1400);
      }
      HM.Audio.setMood(this.mode !== 'play' || this.demo ? 'menu' : (w.H > 75 || w.sunset - w.t < 60) ? 'tense' : 'game');
      this.adaptQuality(dtReal);
      if (!this.glLost) this.stage.render();
    },

    // רזולוציה מסתגלת: אם המחשב מתקשה — מורידים מעט חדות
    adaptQuality(dt) {
      const q = this.aq || (this.aq = { t: 0, frames: 0, low: 0, high: 0 });
      q.t += dt; q.frames++;
      if (q.t < 1) return;
      const fps = q.frames / q.t;
      q.t = 0; q.frames = 0;
      this.fps = fps;
      const st = this.stage;
      if (fps < 42) { q.low++; q.high = 0; } else if (fps > 57) { q.high++; q.low = 0; } else { q.low = 0; q.high = 0; }
      if (q.low >= 3 && st.dpr > 0.7) { st.dpr = Math.max(0.7, st.dpr - 0.15); st.renderer.setPixelRatio(st.dpr); st.resize(); q.low = 0; }
      if (q.high >= 8 && st.dpr < st.maxDpr) { st.dpr = Math.min(st.maxDpr, st.dpr + 0.1); st.renderer.setPixelRatio(st.dpr); st.resize(); q.high = 0; }
    }
  };

  HM.Game = G;
  root.addEventListener('load', () => G.boot());
})(typeof window !== 'undefined' ? window : globalThis);
