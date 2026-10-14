/* המפות: הגדרה כנתונים + בנייה של מבנה ריצה (נתיבים, צמתים, בדיקות שטח).
   צירים: x = מזרח, z = דרום. נסיעה בצד ימין. יחידות = מטרים. */
(function (root) {
  'use strict';
  const HM = root.HM || (root.HM = {});

  const DEFS = {};

  // ---------------- צומת בר אילן (מסוגנן) ----------------
  DEFS.barilan = {
    id: 'barilan',
    name: 'צומת בר אילן',
    city: 'ירושלים',
    blurb: 'צומת עירוני עמוס: כביש ראשי רחב וכביש צר שחוצה אותו.',
    tip: { protest: 'צומת עם רמזורים: היכנסו לכביש כשהרמזור אדום לכיוון שלכם. מרכז הצומת עוצר את כל הכיוונים.',
           police: 'מרכז הצומת הוא המקום הכי מסוכן — שם חסימה אחת עוצרת את כל הכיוונים.' },
    bounds: { x0: -130, x1: 130, z0: -100, z1: 100 },
    sunset: 480,
    sidewalk: 4.5,
    roads: [
      { id: 'main', axis: 'x', c: 0, lanesPos: 2, lanesNeg: 2, speed: 12.5, inflow: 0.26 },
      { id: 'cross', axis: 'z', c: 0, lanesPos: 1, lanesNeg: 1, speed: 10, inflow: 0.17 }
    ],
    // שמות הכניסות לצומת (לפי הכיוון שממנו הרכבים מגיעים)
    arms: { W: 'הכניסה המערבית', E: 'הכניסה המזרחית', N: 'הכניסה הצפונית', S: 'הכניסה הדרומית' },
    buildings: [
      // צפון-מערב (רחוק מהמצלמה — גבוה)
      { x0: -36, x1: -9, z0: -30, z1: -13, h: 14, style: 'apt' },
      { x0: -70, x1: -40, z0: -32, z1: -13, h: 16, style: 'apt' },
      { x0: -104, x1: -74, z0: -30, z1: -13, h: 12, style: 'apt' },
      { x0: -130, x1: -108, z0: -32, z1: -13, h: 15, style: 'apt' },
      { x0: -34, x1: -9, z0: -70, z1: -36, h: 17, style: 'apt' },
      { x0: -74, x1: -40, z0: -72, z1: -38, h: 13, style: 'apt' },
      { x0: -110, x1: -80, z0: -70, z1: -36, h: 15, style: 'apt' },
      { x0: -130, x1: -114, z0: -80, z1: -38, h: 16, style: 'apt' },
      // צפון-מזרח: תחנת המשטרה
      { x0: 10, x1: 42, z0: -56, z1: -41, h: 8, style: 'police', sign: 'משטרה — מוצב הצומת' },
      { x0: 48, x1: 76, z0: -30, z1: -13, h: 18, style: 'apt' },
      { x0: 80, x1: 106, z0: -28, z1: -13, h: 12, style: 'apt' },
      { x0: 110, x1: 130, z0: -34, z1: -13, h: 15, style: 'apt' },
      { x0: 9, x1: 32, z0: -92, z1: -60, h: 14, style: 'apt' },
      { x0: 48, x1: 76, z0: -72, z1: -36, h: 12, style: 'apt' },
      { x0: 82, x1: 112, z0: -70, z1: -34, h: 17, style: 'apt' },
      // דרום-מערב (קרוב למצלמה): הישיבה וחנויות נמוכות
      { x0: -42, x1: -10, z0: 35, z1: 50, h: 10, style: 'yeshiva', sign: 'ישיבת שערי הצומת' },
      { x0: -70, x1: -46, z0: 13, z1: 25, h: 5, style: 'shop', sign: 'מאפיית השכונה' },
      { x0: -102, x1: -74, z0: 13, z1: 24, h: 4.5, style: 'shop', sign: 'כלי בית' },
      { x0: -130, x1: -106, z0: 13, z1: 25, h: 5, style: 'shop' },
      { x0: -72, x1: -46, z0: 32, z1: 60, h: 8, style: 'apt' },
      { x0: -106, x1: -78, z0: 30, z1: 58, h: 9, style: 'apt' },
      // דרום-מזרח (קרוב למצלמה): חנויות
      { x0: 9, x1: 34, z0: 13, z1: 24, h: 5, style: 'shop', sign: 'מכולת הצומת' },
      { x0: 38, x1: 66, z0: 13, z1: 25, h: 5, style: 'shop', sign: 'פלאפל ושווארמה' },
      { x0: 70, x1: 100, z0: 13, z1: 24, h: 6, style: 'shop', sign: 'ספרי קודש' },
      { x0: 104, x1: 130, z0: 13, z1: 25, h: 5, style: 'shop', sign: 'חנות צעצועים' },
      { x0: 9, x1: 32, z0: 30, z1: 60, h: 9, style: 'apt' },
      { x0: 38, x1: 68, z0: 30, z1: 60, h: 8, style: 'apt' },
      { x0: 74, x1: 106, z0: 30, z1: 58, h: 9, style: 'apt' }
    ],
    // אזורים פתוחים מיוחדים (רצפה שונה בציור)
    plazas: [
      { x0: -40, x1: -10, z0: 11.5, z1: 33, kind: 'yeshiva' },
      { x0: 9, x1: 44, z0: -39, z1: -11.5, kind: 'police' }
    ],
    // אזורים שרכבי משטרה מורשים לנסוע בהם מלבד הכביש (חניה + יציאה לכביש)
    vehicleZones: [
      { x0: 9, x1: 44, z0: -39, z1: -11.5 },
      { x0: 13, x1: 25, z0: -12, z1: -6 }
    ],
    bases: {
      protest: { x: -25, z: 26, rally: { x: -24, z: 16 }, name: 'ישיבת שערי הצומת' },
      police: { x: 30, z: -31, rally: { x: 24, z: -16 }, name: 'מוצב המשטרה' },
      van: { x: 17, z: -24 }
    }
  };

  // ---------------- כביש 4 (בני ברק, מסוגנן) ----------------
  // כביש מהיר רחב בלי צומת: קירות אקוסטיים בצדדים עם כמה פתחים, מעקה בטון באמצע,
  // ומעבר חציה עם רמזור להולכי רגל — החלון היחיד שבו התנועה עוצרת לבד.
  const KW = 11.1, KS = 4.5;                 // חצי רוחב הכביש, רוחב מדרכה
  const kWall = (x0, x1, side) => ({ x0, x1, z0: side < 0 ? -(KW + KS + 0.6) : KW + KS, z1: side < 0 ? -(KW + KS) : KW + KS + 0.6, h: 4.2, style: 'wall' });
  DEFS.kvish4 = {
    id: 'kvish4',
    name: 'כביש 4',
    city: 'בני ברק',
    blurb: 'כביש מהיר רחב: שלושה נתיבים לכל כיוון, קירות אקוסטיים ומעבר חציה אחד עם רמזור.',
    tip: { protest: 'כביש מהיר: התנועה עוצרת רק ברמזור להולכי רגל. לכביש מגיעים רק דרך הפתחים בקירות.',
           police: 'המפגינים מגיעים לכביש רק דרך הפתחים בקירות האקוסטיים — שם כדאי להציב שוטרים.' },
    bounds: { x0: -150, x1: 150, z0: -95, z1: 95 },
    sunset: 480,
    sidewalk: KS,
    roads: [
      { id: 'hwy', axis: 'x', c: 0, lanesPos: 3, lanesNeg: 3, median: 1.2, speed: 19, inflow: 0.24 }
    ],
    crossings: [{ road: 'hwy', at: 0, w: 6 }],
    // רמזור להולכי רגל: רוב הזמן ירוק לרכבים
    lights: [{ g: 'x', t: 26 }, { g: 'xy', t: 3 }, { g: null, t: 11 }],
    arms: { W: 'מכיוון רמת גן', E: 'מכיוון פתח תקווה' },
    walls: [
      // מעקה בטון באמצע הכביש (פתוח במעבר החציה)
      { x0: -150, x1: -4, z0: -0.35, z1: 0.35, h: 0.9, style: 'barrier' },
      { x0: 4, x1: 150, z0: -0.35, z1: 0.35, h: 0.9, style: 'barrier' },
      // קירות אקוסטיים — צפון (עם פתח ליציאת ניידות המשטרה)
      kWall(-150, -80, -1), kWall(-74, -10, -1), kWall(10, 14, -1), kWall(24, 70, -1), kWall(76, 150, -1),
      // קירות אקוסטיים — דרום
      kWall(-150, -80, 1), kWall(-74, -10, 1), kWall(10, 70, 1), kWall(76, 150, 1)
    ],
    buildings: [
      // דרום (קרוב למצלמה): הישיבה ושכונה נמוכה
      { x0: -42, x1: -10, z0: 44, z1: 58, h: 10, style: 'yeshiva', sign: 'ישיבת נתיבות הכביש' },
      { x0: -74, x1: -48, z0: 21, z1: 33, h: 7, style: 'apt' },
      { x0: -112, x1: -82, z0: 21, z1: 34, h: 8, style: 'apt' },
      { x0: -150, x1: -118, z0: 21, z1: 33, h: 7, style: 'apt' },
      { x0: 8, x1: 36, z0: 21, z1: 32, h: 5, style: 'shop', sign: 'מכולת המחלף' },
      { x0: 42, x1: 68, z0: 21, z1: 33, h: 7, style: 'apt' },
      { x0: 80, x1: 110, z0: 21, z1: 34, h: 8, style: 'apt' },
      { x0: 116, x1: 150, z0: 21, z1: 33, h: 7, style: 'apt' },
      { x0: -74, x1: -46, z0: 40, z1: 70, h: 15, style: 'apt' },
      { x0: -112, x1: -82, z0: 42, z1: 72, h: 17, style: 'apt' },
      { x0: 8, x1: 36, z0: 40, z1: 70, h: 16, style: 'apt' },
      { x0: 44, x1: 72, z0: 42, z1: 72, h: 14, style: 'apt' },
      { x0: 82, x1: 112, z0: 42, z1: 70, h: 18, style: 'apt' },
      // צפון (רחוק): תחנת המשטרה ובתים גבוהים
      { x0: 12, x1: 44, z0: -58, z1: -44, h: 8, style: 'police', sign: 'משטרה — מוצב המחלף' },
      { x0: -40, x1: -10, z0: -36, z1: -21, h: 18, style: 'apt' },
      { x0: -78, x1: -46, z0: -36, z1: -21, h: 20, style: 'apt' },
      { x0: -118, x1: -84, z0: -36, z1: -21, h: 17, style: 'apt' },
      { x0: 52, x1: 70, z0: -36, z1: -21, h: 19, style: 'apt' },
      { x0: 80, x1: 112, z0: -36, z1: -21, h: 16, style: 'apt' },
      { x0: 118, x1: 150, z0: -36, z1: -21, h: 20, style: 'apt' },
      { x0: -40, x1: -8, z0: -72, z1: -44, h: 21, style: 'apt' },
      { x0: -80, x1: -48, z0: -74, z1: -44, h: 18, style: 'apt' },
      { x0: 52, x1: 84, z0: -72, z1: -44, h: 22, style: 'apt' }
    ],
    plazas: [
      { x0: -42, x1: -8, z0: 17, z1: 42, kind: 'yeshiva' },
      { x0: 10, x1: 46, z0: -42, z1: -17, kind: 'police' }
    ],
    vehicleZones: [
      { x0: 10, x1: 46, z0: -42, z1: -17 },
      { x0: 14, x1: 24, z0: -17.5, z1: -10.5 }
    ],
    bases: {
      protest: { x: -26, z: 32, rally: { x: -26, z: 21 }, name: 'ישיבת נתיבות הכביש' },
      police: { x: 30, z: -32, rally: { x: 30, z: -20 }, name: 'מוצב המחלף' },
      van: { x: 38, z: -26 }
    },
    // נקודות חסימה למפגינים הממוחשבים
    spots: [
      { x: 0, z: 0, pri: 3, cap: 3 },
      { x: -40, z: 5.9, pri: 2, cap: 1 }, { x: -40, z: -5.9, pri: 2, cap: 1 },
      { x: 40, z: 5.9, pri: 2, cap: 1 }, { x: 40, z: -5.9, pri: 2, cap: 1 }
    ]
  };

  // ---------------- גשר המיתרים (הכניסה לירושלים, מסוגנן) ----------------
  // צומת עם רכבת קלה בשטח ההפרדה. רכבת שנתקעת — מקפיצה את הכותרות.
  DEFS.gesher = {
    id: 'gesher',
    name: 'גשר המיתרים',
    city: 'ירושלים',
    blurb: 'הכניסה לעיר: צומת עם רכבת קלה באמצע הכביש. רכבת שנתקעת — שווה כותרות.',
    tip: { protest: 'רכבת קלה תקועה מעלה את המד מהר. שורה לרוחב כל הכביש עוצרת גם אותה.',
           police: 'רכבת קלה תקועה מעלה את המד מהר — פנו קודם את מי שחוסם את המסילה.' },
    bounds: { x0: -130, x1: 130, z0: -100, z1: 100 },
    sunset: 480,
    sidewalk: 4.5,
    roads: [
      { id: 'main', axis: 'x', c: 0, lanesPos: 2, lanesNeg: 2, median: 6.4, tram: true, tramSpeed: 11, speed: 12.5, inflow: 0.24 },
      { id: 'cross', axis: 'z', c: 0, lanesPos: 1, lanesNeg: 1, speed: 10, inflow: 0.17 }
    ],
    tram: { every: [48, 75], len: 30 },
    arms: { W: 'מכיוון הכניסה לעיר', E: 'מכיוון מרכז העיר', N: 'הכניסה הצפונית', S: 'הכניסה הדרומית' },
    landmark: 'bridge',
    buildings: [
      { x0: -103, x1: -97, z0: -19.7, z1: -14.7, h: 2, style: 'pylon' },   // בסיס התורן של הגשר
      // צפון-מערב
      { x0: -38, x1: -9, z0: -32, z1: -16, h: 14, style: 'apt' },
      { x0: -72, x1: -44, z0: -34, z1: -16, h: 16, style: 'apt' },
      { x0: -38, x1: -9, z0: -72, z1: -40, h: 18, style: 'apt' },
      { x0: -76, x1: -44, z0: -74, z1: -42, h: 13, style: 'apt' },
      // צפון-מזרח: תחנת המשטרה
      { x0: 10, x1: 42, z0: -58, z1: -44, h: 8, style: 'police', sign: 'משטרה — מוצב הכניסה לעיר' },
      { x0: 50, x1: 78, z0: -34, z1: -16, h: 17, style: 'apt' },
      { x0: 84, x1: 112, z0: -32, z1: -16, h: 12, style: 'apt' },
      { x0: 50, x1: 80, z0: -74, z1: -42, h: 15, style: 'apt' },
      { x0: 116, x1: 130, z0: -34, z1: -16, h: 14, style: 'apt' },
      // דרום-מערב (קרוב למצלמה): הישיבה
      { x0: -42, x1: -10, z0: 38, z1: 52, h: 10, style: 'yeshiva', sign: 'ישיבת שער העיר' },
      { x0: -72, x1: -48, z0: 16, z1: 28, h: 5, style: 'shop', sign: 'מאפיית הכניסה' },
      { x0: -74, x1: -48, z0: 34, z1: 62, h: 9, style: 'apt' },
      // דרום-מזרח
      { x0: 9, x1: 34, z0: 16, z1: 27, h: 5, style: 'shop', sign: 'מכולת הגשר' },
      { x0: 40, x1: 66, z0: 16, z1: 28, h: 6, style: 'shop', sign: 'פלאפל הכניסה' },
      { x0: 72, x1: 100, z0: 16, z1: 27, h: 5, style: 'shop', sign: 'ספרי קודש' },
      { x0: 9, x1: 32, z0: 34, z1: 62, h: 9, style: 'apt' },
      { x0: 40, x1: 70, z0: 34, z1: 62, h: 8, style: 'apt' },
      { x0: 106, x1: 130, z0: 16, z1: 28, h: 6, style: 'apt' }
    ],
    plazas: [
      { x0: -40, x1: -10, z0: 14.7, z1: 36, kind: 'yeshiva' },
      { x0: 9, x1: 44, z0: -42, z1: -14.7, kind: 'police' }
    ],
    vehicleZones: [
      { x0: 9, x1: 44, z0: -42, z1: -14.7 },
      { x0: 13, x1: 25, z0: -15, z1: -9 }
    ],
    bases: {
      protest: { x: -25, z: 28, rally: { x: -24, z: 19 }, name: 'ישיבת שער העיר' },
      police: { x: 30, z: -31, rally: { x: 24, z: -19 }, name: 'מוצב הכניסה לעיר' },
      van: { x: 17, z: -26 }
    },
    spots: [
      { x: 0, z: 0, pri: 3, cap: 2 },
      { x: -22, z: 0, pri: 3, cap: 2 },
      { x: 22, z: 0, pri: 2, cap: 2 },
      { x: 0, z: -20, pri: 1, cap: 1 }, { x: 0, z: 20, pri: 1, cap: 1 }
    ]
  };

  // ---------------- בניית מבנה הריצה ----------------
  function buildMap(id, BAL) {
    const def = DEFS[id];
    if (!def) throw new Error('unknown map ' + id);
    const laneW = BAL.traffic.laneW;
    const b = def.bounds;
    const m = {
      def, id: def.id, name: def.name, bounds: b, sidewalk: def.sidewalk,
      roads: [], lanes: [], junctions: [],
      // קירות אקוסטיים ומעקות נחשבים כמכשולים (כמו בניינים) לניווט
      buildings: def.buildings.concat(def.walls || []), plazas: def.plazas || [],
      bases: def.bases, arms: {}, sunset: def.sunset, vehicleZones: def.vehicleZones || [],
      lights: def.lights || null, spots: def.spots || null, tram: def.tram || null
    };

    def.roads.forEach(r => {
      const median = r.median || 0;
      const halfW = laneW * (r.lanesPos + r.lanesNeg) / 2 + median / 2;
      m.roads.push(Object.assign({}, r, { halfW, median }));
    });

    // צמתים — כל זוג כבישים ניצבים שנחתכים
    const xs = m.roads.filter(r => r.axis === 'x'), zs = m.roads.filter(r => r.axis === 'z');
    xs.forEach(rx => zs.forEach(rz => {
      m.junctions.push({
        x: rz.c, z: rx.c,
        x0: rz.c - rz.halfW, x1: rz.c + rz.halfW,
        z0: rx.c - rx.halfW, z1: rx.c + rx.halfW,
        roads: [rx.id, rz.id]
      });
    }));
    // מעבר חציה עם רמזור על כביש אחד (בלי כביש חוצה)
    (def.crossings || []).forEach(cr => {
      const r = m.roads.find(q => q.id === cr.road);
      if (r.axis === 'x') m.junctions.push({ x: cr.at, z: r.c, x0: cr.at - cr.w / 2, x1: cr.at + cr.w / 2, z0: r.c - r.halfW, z1: r.c + r.halfW, roads: [r.id], crossing: true });
      else m.junctions.push({ x: r.c, z: cr.at, x0: r.c - r.halfW, x1: r.c + r.halfW, z0: cr.at - cr.w / 2, z1: cr.at + cr.w / 2, roads: [r.id], crossing: true });
    });

    // נתיבים
    let laneId = 0;
    m.roads.forEach(r => {
      const make = (dir, i, tram) => {
        const L = { id: laneId++, road: r.id, axis: r.axis, dir, speed: tram ? (r.tramSpeed || 11) : r.speed, inflow: tram ? 0 : r.inflow, tram: !!tram };
        // היסט מהמרכז: חצי שטח הפרדה + הנתיבים; פסי רכבת באמצע שטח ההפרדה
        const o = tram ? r.median / 4 : r.median / 2 + laneW * (i + 0.5);
        if (r.axis === 'x') {
          L.off = r.c + dir * o;      // נסיעה מזרחה = צד דרומי (z חיובי)
          L.p0 = { x: dir > 0 ? b.x0 : b.x1, z: L.off };
          L.dx = dir; L.dz = 0;
          L.len = b.x1 - b.x0;
          L.arm = dir > 0 ? 'W' : 'E';
        } else {
          L.off = r.c - dir * o;      // נסיעה דרומה = צד מערבי (x שלילי)
          L.p0 = { x: L.off, z: dir > 0 ? b.z0 : b.z1 };
          L.dx = 0; L.dz = dir;
          L.len = b.z1 - b.z0;
          L.arm = dir > 0 ? 'N' : 'S';
        }
        L.inner = i === 0;
        // קטעי הצמתים לאורך הנתיב (מרחק מנקודת הכניסה)
        L.boxes = [];
        m.junctions.forEach(j => {
          if (!j.roads.includes(r.id)) return;
          let a, c;
          if (r.axis === 'x') { a = dir > 0 ? j.x0 - b.x0 : b.x1 - j.x1; c = a + (j.x1 - j.x0); }
          else { a = dir > 0 ? j.z0 - b.z0 : b.z1 - j.z1; c = a + (j.z1 - j.z0); }
          L.boxes.push({ d0: a, d1: c, stopD: a - 1.2, j });
        });
        L.boxes.sort((p, q) => p.d0 - q.d0);
        m.lanes.push(L);
      };
      for (let i = 0; i < r.lanesPos; i++) make(1, i);
      for (let i = 0; i < r.lanesNeg; i++) make(-1, i);
      if (r.tram) { make(1, 0, true); make(-1, 0, true); }
    });

    // נקודות הכניסות (לתוויות פקק ולהתראות)
    const armPos = {
      W: { x: b.x0 + 14, z: 0 }, E: { x: b.x1 - 14, z: 0 },
      N: { x: 0, z: b.z0 + 12 }, S: { x: 0, z: b.z1 - 12 }
    };
    Object.keys(def.arms || {}).forEach(k => {
      const lanes = m.lanes.filter(l => l.arm === k && !l.tram);
      if (!lanes.length) return;
      m.arms[k] = { id: k, name: def.arms[k], x: armPos[k].x, z: armPos[k].z, lanes };
    });

    // ---- בדיקות שטח ----
    m.roadAt = function (x, z) {
      for (const r of m.roads) {
        if (r.axis === 'x') { if (Math.abs(z - r.c) <= r.halfW && x >= b.x0 && x <= b.x1) return r; }
        else if (Math.abs(x - r.c) <= r.halfW && z >= b.z0 && z <= b.z1) return r;
      }
      return null;
    };
    m.isRoad = (x, z) => !!m.roadAt(x, z);
    m.junctionAt = function (x, z) {
      for (const j of m.junctions) if (x >= j.x0 && x <= j.x1 && z >= j.z0 && z <= j.z1) return j;
      return null;
    };
    m.inBuilding = function (x, z, pad) {
      pad = pad || 0;
      for (const B of m.buildings) {
        if (x > B.x0 - pad && x < B.x1 + pad && z > B.z0 - pad && z < B.z1 + pad) return B;
      }
      return null;
    };
    m.inBounds = (x, z, pad) => { pad = pad || 0; return x >= b.x0 + pad && x <= b.x1 - pad && z >= b.z0 + pad && z <= b.z1 - pad; };
    // מדרכה = רצועה לצד כביש, לא על הכביש
    m.isSidewalk = function (x, z) {
      if (m.isRoad(x, z)) return false;
      for (const r of m.roads) {
        if (r.axis === 'x') { if (Math.abs(z - r.c) <= r.halfW + def.sidewalk) return true; }
        else if (Math.abs(x - r.c) <= r.halfW + def.sidewalk) return true;
      }
      return false;
    };
    // נתיבים שאדם בנקודה הזו חוסם
    m.lanesAt = function (x, z, rad) {
      const out = [];
      for (const L of m.lanes) {
        if (L.tram) continue;
        const hw = laneW / 2 + rad;
        if (L.axis === 'x') { if (Math.abs(z - L.off) < hw) out.push(L); }
        else if (Math.abs(x - L.off) < hw) out.push(L);
      }
      return out;
    };
    // מרחק לאורך נתיב (מנקודת הכניסה) של נקודה
    m.laneD = function (L, x, z) {
      return L.axis === 'x' ? (x - L.p0.x) * L.dx : (z - L.p0.z) * L.dz;
    };
    m.lanePos = function (L, d) {
      return { x: L.p0.x + L.dx * d, z: L.p0.z + L.dz * d };
    };
    // הנקודה הקרובה ביותר על מדרכה (לבריחה / חזרה)
    m.nearestSidewalk = function (x, z) {
      let best = null, bd = 1e9;
      for (const r of m.roads) {
        const edge = r.halfW + def.sidewalk * 0.55;
        let cx, cz;
        if (r.axis === 'x') { cx = x; cz = r.c + (z >= r.c ? edge : -edge); }
        else { cz = z; cx = r.c + (x >= r.c ? edge : -edge); }
        if (m.isRoad(cx, cz) || m.inBuilding(cx, cz, 0.6)) continue;
        const d = (cx - x) * (cx - x) + (cz - z) * (cz - z);
        if (d < bd) { bd = d; best = { x: cx, z: cz }; }
      }
      if (best) return best;
      // בפינות של צמתים אין מדרכה "ישרה" — מחפשים בטבעות
      for (let r = 1.5; r <= 24; r += 1.5) {
        let bp = null, bd2 = 1e9;
        for (let k = 0; k < 24; k++) {
          const a = k / 24 * Math.PI * 2;
          const px = x + Math.cos(a) * r, pz = z + Math.sin(a) * r;
          if (m.isRoad(px, pz) || m.inBuilding(px, pz, 0.8) || !m.inBounds(px, pz, 2)) continue;
          // מעדיפים מדרכה אמיתית ולא חצר
          const d = (px - x) * (px - x) + (pz - z) * (pz - z) + (m.isSidewalk(px, pz) ? 0 : 40);
          if (d < bd2) { bd2 = d; bp = { x: px, z: pz }; }
        }
        if (bp) return bp;
      }
      return { x, z };
    };
    return m;
  }

  HM.MAP_DEFS = DEFS;
  HM.buildMap = buildMap;
})(typeof window !== 'undefined' ? window : globalThis);
