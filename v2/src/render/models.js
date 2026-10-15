/* בניית גיאומטריות: כל דגם הוא גיאומטריה אחת ממוזגת עם צבעי קודקוד,
   כך שאפשר לצייר מאות עותקים בפקודת ציור אחת (InstancedMesh). */
(function (root) {
  'use strict';
  const HM = root.HM || (root.HM = {});
  const T = root.THREE;

  const _m = new T.Matrix4(), _q = new T.Quaternion(), _e = new T.Euler(), _s = new T.Vector3(), _p = new T.Vector3();
  const colorCache = new Map();
  function lin(hex) {
    let c = colorCache.get(hex);
    if (!c) { c = new T.Color(hex).convertSRGBToLinear(); colorCache.set(hex, c); }
    return c;
  }

  // חלק אחד: גיאומטריה + צבע + מיקום/סיבוב/קנה מידה
  function part(geo, hex, x, y, z, rx, ry, rz, sx, sy, sz) {
    _e.set(rx || 0, ry || 0, rz || 0);
    _q.setFromEuler(_e);
    _p.set(x || 0, y || 0, z || 0);
    _s.set(sx || 1, sy || 1, sz || 1);
    _m.compose(_p, _q, _s);
    let g = geo.index ? geo.toNonIndexed() : geo.clone();
    g.applyMatrix4(_m);
    g.deleteAttribute('uv');
    const n = g.attributes.position.count, col = new Float32Array(n * 3), c = lin(hex);
    for (let i = 0; i < n; i++) { col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
    g.setAttribute('color', new T.BufferAttribute(col, 3));
    return g;
  }

  function merge(parts) {
    let n = 0;
    for (const g of parts) n += g.attributes.position.count;
    const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), col = new Float32Array(n * 3);
    let o = 0;
    for (const g of parts) {
      pos.set(g.attributes.position.array, o * 3);
      nor.set(g.attributes.normal.array, o * 3);
      col.set(g.attributes.color.array, o * 3);
      o += g.attributes.position.count;
      g.dispose();
    }
    const out = new T.BufferGeometry();
    out.setAttribute('position', new T.BufferAttribute(pos, 3));
    out.setAttribute('normal', new T.BufferAttribute(nor, 3));
    out.setAttribute('color', new T.BufferAttribute(col, 3));
    out.computeBoundingSphere();
    return out;
  }

  const box = (w, h, d) => new T.BoxGeometry(w, h, d);
  const cyl = (rt, rb, h, seg) => new T.CylinderGeometry(rt, rb, h, seg || 10);
  const sph = (r, ws, hs) => new T.SphereGeometry(r, ws || 10, hs || 8);

  const SKIN = 0xe9c3a0, BLACK = 0x18181c, WHITE = 0xf3f1ec, HAT = 0x111114;

  // ---------- אנשים (מהמותניים ומעלה; 0 = גובה המותן) ----------
  function haredHat(parts, wide) {
    parts.push(part(cyl(wide ? 0.25 : 0.215, wide ? 0.25 : 0.215, 0.025, 14), HAT, 0, 0.935, 0));
    parts.push(part(cyl(0.125, 0.14, wide ? 0.2 : 0.17, 12), HAT, 0, 1.03, 0.0));
    parts.push(part(box(0.27, 0.035, 0.2), 0x2a2a2e, 0, 1.0, 0)); // סרט הכובע
  }
  function head(parts, beard, beardLong) {
    parts.push(part(cyl(0.06, 0.07, 0.1, 8), SKIN, 0, 0.66, 0));
    parts.push(part(sph(0.135, 12, 10), SKIN, 0, 0.8, 0, 0, 0, 0, 1, 1.08, 1));
    // פאות
    parts.push(part(box(0.025, 0.12, 0.03), 0x2b2118, 0.13, 0.75, 0.03));
    parts.push(part(box(0.025, 0.12, 0.03), 0x2b2118, -0.13, 0.75, 0.03));
    if (beard) {
      parts.push(part(box(0.22, beardLong ? 0.2 : 0.11, 0.1), 0x2b2118, 0, beardLong ? 0.66 : 0.71, 0.09));
    }
    // משקפיים קטנים — מוסיפים חיים בלי פרטים
    parts.push(part(box(0.2, 0.025, 0.02), 0x222222, 0, 0.82, 0.125));
  }
  function arms(parts, hex, raiseRight) {
    parts.push(part(box(0.12, 0.56, 0.14), hex, 0.29, 0.3, 0, 0, 0, 0.06));
    parts.push(part(box(0.09, 0.09, 0.1), SKIN, 0.31, 0.0, 0.0));
    if (raiseRight) {
      // יד עם טלפון ליד האוזן
      parts.push(part(box(0.12, 0.42, 0.14), hex, -0.27, 0.5, 0.06, -0.3, 0, -0.55));
      parts.push(part(box(0.09, 0.09, 0.1), SKIN, -0.2, 0.73, 0.1));
      parts.push(part(box(0.04, 0.15, 0.08), 0x101010, -0.165, 0.79, 0.08));
    } else {
      parts.push(part(box(0.12, 0.56, 0.14), hex, -0.29, 0.3, 0, 0, 0, -0.06));
      parts.push(part(box(0.09, 0.09, 0.1), SKIN, -0.31, 0.0, 0.0));
    }
  }

  function bochur() {
    const p = [];
    p.push(part(box(0.46, 0.62, 0.27), WHITE, 0, 0.32, 0));          // חולצה לבנה
    p.push(part(box(0.47, 0.13, 0.28), BLACK, 0, 0.05, 0));          // חגורה
    p.push(part(box(0.3, 0.05, 0.04), 0xffffff, 0, 0.6, 0.12));      // צווארון
    p.push(part(box(0.24, 0.2, 0.02), 0xdcd8cf, 0, -0.04, 0.145));   // ציציות
    arms(p, WHITE);
    head(p, false);
    haredHat(p, false);
    return merge(p);
  }
  function avrech() {
    const p = [];
    p.push(part(cyl(0.24, 0.3, 1.08, 12), BLACK, 0, 0.1, 0));        // פראק ארוך
    p.push(part(box(0.14, 0.3, 0.04), WHITE, 0, 0.47, 0.22));        // חזית החולצה
    p.push(part(box(0.5, 0.1, 0.3), BLACK, 0, 0.58, 0));             // כתפיים
    arms(p, BLACK);
    head(p, true, true);
    haredHat(p, true);
    return merge(p);
  }
  function askan() {
    const p = [];
    p.push(part(cyl(0.24, 0.29, 1.02, 12), 0x34373f, 0, 0.12, 0));   // מעיל אפור כהה
    p.push(part(box(0.14, 0.3, 0.04), WHITE, 0, 0.47, 0.22));
    p.push(part(box(0.05, 0.26, 0.02), 0x7a1f2b, 0, 0.42, 0.245));   // עניבה
    p.push(part(box(0.5, 0.1, 0.3), 0x34373f, 0, 0.58, 0));
    arms(p, 0x34373f, true);
    head(p, true, false);
    haredHat(p, true);
    // תיק מסמכים
    p.push(part(box(0.32, 0.24, 0.08), 0x5a3a22, 0.36, -0.12, 0.02));
    return merge(p);
  }
  function photographer() {
    const p = [];
    p.push(part(cyl(0.24, 0.29, 1.02, 12), 0x26272b, 0, 0.12, 0));   // מעיל
    p.push(part(box(0.14, 0.3, 0.04), WHITE, 0, 0.47, 0.22));
    p.push(part(box(0.5, 0.1, 0.3), 0x26272b, 0, 0.58, 0));
    // שתי ידיים מחזיקות מצלמה מול הפנים
    p.push(part(box(0.12, 0.44, 0.14), 0x26272b, 0.22, 0.52, 0.12, -1.0, 0, 0.3));
    p.push(part(box(0.12, 0.44, 0.14), 0x26272b, -0.22, 0.52, 0.12, -1.0, 0, -0.3));
    p.push(part(box(0.3, 0.2, 0.16), 0x151515, 0, 0.8, 0.2));                  // מצלמה
    p.push(part(cyl(0.07, 0.08, 0.2, 10), 0x2c2c2c, 0, 0.8, 0.36, Math.PI / 2, 0, 0));  // עדשה
    p.push(part(box(0.04, 0.04, 0.02), 0xe23c3c, 0.1, 0.89, 0.28));            // נורה
    p.push(part(box(0.06, 0.6, 0.02), 0x8a1f1f, 0.14, 0.35, 0.2, 0, 0, 0.4));  // רצועה
    head(p, true, false);
    haredHat(p, false);
    return merge(p);
  }
  function riot() {
    const p = [];
    p.push(part(box(0.5, 0.64, 0.3), 0x2b3542, 0, 0.32, 0));             // מדים כהים
    p.push(part(box(0.54, 0.44, 0.34), 0x161c25, 0, 0.38, 0));           // שריון
    p.push(part(box(0.5, 0.13, 0.3), 0x10151c, 0, 0.05, 0));
    arms(p, 0x2b3542);
    p.push(part(cyl(0.06, 0.07, 0.1, 8), SKIN, 0, 0.66, 0));
    p.push(part(sph(0.135, 12, 10), SKIN, 0, 0.8, 0, 0, 0, 0, 1, 1.08, 1));
    p.push(part(sph(0.17, 12, 8), 0x1a2230, 0, 0.86, -0.01, 0, 0, 0, 1.05, 0.92, 1.1)); // קסדה
    p.push(part(box(0.3, 0.14, 0.03), 0x9fb6cc, 0, 0.8, 0.17));          // מגן פנים
    // מגן שקוף
    p.push(part(box(0.62, 0.95, 0.04), 0xb7c9db, 0.05, 0.25, 0.32));
    return merge(p);
  }
  function officer() {
    const p = [];
    p.push(part(box(0.46, 0.62, 0.27), 0xf1f2f4, 0, 0.32, 0));       // חולצה לבנה
    p.push(part(box(0.06, 0.34, 0.02), 0x1f2d44, 0, 0.42, 0.145));   // עניבה
    p.push(part(box(0.47, 0.13, 0.28), 0x172238, 0, 0.05, 0));
    p.push(part(box(0.14, 0.05, 0.02), 0xe2b93b, -0.13, 0.55, 0.14)); // דרגות
    arms(p, 0xf1f2f4);
    p.push(part(cyl(0.06, 0.07, 0.1, 8), SKIN, 0, 0.66, 0));
    p.push(part(sph(0.135, 12, 10), SKIN, 0, 0.8, 0, 0, 0, 0, 1, 1.08, 1));
    p.push(part(cyl(0.16, 0.14, 0.12, 12), 0x172238, 0, 0.93, 0));
    p.push(part(box(0.24, 0.025, 0.14), 0x101826, 0, 0.885, 0.12));
    p.push(part(box(0.2, 0.03, 0.02), 0xe2b93b, 0, 0.91, 0.17));     // סרט זהב
    return merge(p);
  }
  function cop() {
    const p = [];
    p.push(part(box(0.46, 0.62, 0.27), 0x86a9cf, 0, 0.32, 0));       // חולצה תכלת
    p.push(part(box(0.5, 0.42, 0.31), 0x1f2d44, 0, 0.36, 0));        // אפוד
    p.push(part(box(0.47, 0.13, 0.28), 0x172238, 0, 0.05, 0));
    p.push(part(box(0.08, 0.06, 0.02), 0xe2b93b, 0.12, 0.5, 0.16));  // תג
    arms(p, 0x86a9cf);
    p.push(part(cyl(0.06, 0.07, 0.1, 8), SKIN, 0, 0.66, 0));
    p.push(part(sph(0.135, 12, 10), SKIN, 0, 0.8, 0, 0, 0, 0, 1, 1.08, 1));
    p.push(part(cyl(0.15, 0.14, 0.12, 12), 0x172238, 0, 0.93, 0));  // כובע מצחייה
    p.push(part(box(0.24, 0.025, 0.14), 0x101826, 0, 0.885, 0.12));
    p.push(part(box(0.06, 0.04, 0.02), 0xe2b93b, 0, 0.95, 0.15));
    return merge(p);
  }
  function rider() {
    const p = [];
    p.push(part(box(0.46, 0.6, 0.27), 0x86a9cf, 0, 0.32, 0));
    p.push(part(box(0.5, 0.42, 0.31), 0x1f2d44, 0, 0.36, 0));
    arms(p, 0x86a9cf);
    p.push(part(cyl(0.06, 0.07, 0.1, 8), SKIN, 0, 0.66, 0));
    p.push(part(sph(0.135, 12, 10), SKIN, 0, 0.8, 0, 0, 0, 0, 1, 1.08, 1));
    p.push(part(sph(0.165, 12, 8), 0x1d2a40, 0, 0.86, 0, 0, 0, 0, 1, 0.8, 1.1)); // קסדה
    p.push(part(box(0.26, 0.03, 0.12), 0x101826, 0, 0.83, 0.13));
    return merge(p);
  }
  // רגל: ציר בחלק העליון, נמשכת למטה
  function leg() {
    const p = [];
    p.push(part(box(0.17, 0.82, 0.19), 0xffffff, 0, -0.41, 0));
    p.push(part(box(0.18, 0.1, 0.3), 0x0c0c0c, 0, -0.86, 0.05));
    return merge(p);
  }
  function horse() {
    const p = [], C = 0x6e4a2e, D = 0x3a2416, L = 0x5c3d25;
    // גוף מעוגל לאורך z
    p.push(part(cyl(0.34, 0.36, 1.35, 12), C, 0, 1.3, 0, Math.PI / 2, 0, 0, 1, 1, 1.05));
    p.push(part(sph(0.38, 12, 10), C, 0, 1.33, 0.62, 0, 0, 0, 0.95, 1.0, 1.0));    // חזה
    p.push(part(sph(0.4, 12, 10), C, 0, 1.36, -0.62, 0, 0, 0, 0.95, 1.0, 1.0));    // אחוריים
    // צוואר וראש
    p.push(part(cyl(0.17, 0.26, 0.95, 10), C, 0, 1.78, 0.95, 0.62, 0, 0));
    p.push(part(box(0.24, 0.26, 0.6), C, 0, 2.12, 1.32, 0.5, 0, 0));
    p.push(part(box(0.2, 0.18, 0.2), L, 0, 1.97, 1.58, 0.5, 0, 0));               // חוטם
    p.push(part(box(0.06, 0.16, 0.06), D, 0.08, 2.36, 1.15, -0.2, 0, 0));          // אוזניים
    p.push(part(box(0.06, 0.16, 0.06), D, -0.08, 2.36, 1.15, -0.2, 0, 0));
    p.push(part(box(0.07, 0.62, 0.2), D, 0, 1.98, 0.86, 0.62, 0, 0));              // רעמה
    p.push(part(cyl(0.05, 0.11, 0.75, 6), D, 0, 1.05, -1.08, -0.45, 0, 0));       // זנב
    // אוכף ושמיכה
    p.push(part(box(0.76, 0.06, 0.8), 0x1d2a40, 0, 1.68, -0.05));
    p.push(part(box(0.78, 0.36, 0.7), 0x26385a, 0, 1.5, -0.05));
    // רגליים (צרות יותר)
    for (const [x, z, rx] of [[0.2, 0.6, 0.08], [-0.2, 0.6, -0.05], [0.2, -0.62, -0.08], [-0.2, -0.62, 0.06]]) {
      p.push(part(box(0.13, 0.98, 0.15), C, x, 0.55, z, rx, 0, 0));
      p.push(part(box(0.15, 0.1, 0.17), 0x1e1e1e, x, 0.05, z + rx * 0.4));
    }
    return merge(p);
  }

  // ---------- רכבים (אורך לאורך z, חזית ל-+z, 0 = קרקע) ----------
  function wheels(p, w, len, r) {
    const fz = len / 2 - 0.85, rz = -len / 2 + 0.85;
    for (const z of [fz, rz]) for (const x of [w / 2 - 0.05, -w / 2 + 0.05]) {
      p.push(part(cyl(r, r, 0.24, 12), 0x141414, x, r, z, 0, 0, Math.PI / 2));
    }
  }
  function lights(p, w, len, y) {
    p.push(part(box(0.32, 0.12, 0.05), 0xfff2c4, w / 2 - 0.3, y, len / 2 + 0.01));
    p.push(part(box(0.32, 0.12, 0.05), 0xfff2c4, -w / 2 + 0.3, y, len / 2 + 0.01));
    p.push(part(box(0.3, 0.12, 0.05), 0x8a1414, w / 2 - 0.3, y, -len / 2 - 0.01));
    p.push(part(box(0.3, 0.12, 0.05), 0x8a1414, -w / 2 + 0.3, y, -len / 2 - 0.01));
  }
  const GLASS = 0x26313d;
  // גוף רכב מפרופיל צד (z = אורך, y = גובה), נמתח לרוחב x
  function profile(pts, width, hex, y0) {
    const sh = new T.Shape();
    sh.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) sh.lineTo(pts[i][0], pts[i][1]);
    sh.closePath();
    const g = new T.ExtrudeGeometry(sh, { depth: width, bevelEnabled: true, bevelThickness: 0.05, bevelSize: 0.05, bevelSegments: 1, curveSegments: 1 });
    // הצורה ב-XY: X = אורך, Y = גובה; מסובבים כך ש-X → z
    g.translate(0, y0 || 0, -width / 2);
    g.rotateY(-Math.PI / 2);
    return part(g, hex, 0, 0, 0);
  }
  function car(type) {
    const p = [];
    if (type === 'sedan' || type === 'taxi') {
      const w = 1.8, L = 4.6, h = L / 2;
      // גוף תחתון: חרטום נמוך, תא, תא מטען
      p.push(profile([[-h, 0.32], [h, 0.32], [h, 0.78], [h - 0.15, 0.92], [h - 1.05, 0.98], [-h + 0.9, 0.98], [-h + 0.05, 0.9], [-h, 0.72]], w, 0xffffff));
      // חלונות (זכוכית) — נטויים
      p.push(profile([[h - 1.15, 0.97], [-h + 1.05, 0.97], [-h + 1.45, 1.42], [h - 1.75, 1.42]], w - 0.18, GLASS));
      // גג
      p.push(profile([[-h + 1.47, 1.41], [h - 1.77, 1.41], [h - 1.82, 1.5], [-h + 1.55, 1.5]], w - 0.2, 0xffffff));
      p.push(part(box(w + 0.04, 0.16, 0.18), 0x2b2b2b, 0, 0.4, h - 0.02));
      p.push(part(box(w + 0.04, 0.16, 0.18), 0x2b2b2b, 0, 0.4, -h + 0.02));
      lights(p, w, L, 0.74);
      wheels(p, w, L, 0.33);
      if (type === 'taxi') p.push(part(box(0.62, 0.18, 0.28), 0xfdfdfd, 0, 1.6, -0.15));
    } else if (type === 'hatch') {
      const w = 1.72, L = 3.9, h = L / 2;
      p.push(profile([[-h, 0.32], [h, 0.32], [h, 0.76], [h - 0.15, 0.9], [h - 0.85, 0.98], [-h + 0.05, 0.98], [-h, 0.8]], w, 0xffffff));
      p.push(profile([[h - 0.95, 0.97], [-h + 0.12, 0.97], [-h + 0.3, 1.44], [h - 1.55, 1.44]], w - 0.18, GLASS));
      p.push(profile([[-h + 0.3, 1.43], [h - 1.57, 1.43], [h - 1.62, 1.52], [-h + 0.36, 1.52]], w - 0.2, 0xffffff));
      lights(p, w, L, 0.72);
      wheels(p, w, L, 0.31);
    } else if (type === 'van') {
      const w = 1.96, L = 5.2, h = L / 2;
      p.push(profile([[-h, 0.34], [h, 0.34], [h, 0.95], [h - 0.55, 1.35], [h - 1.1, 2.05], [-h, 2.05]], w, 0xffffff));
      p.push(profile([[h - 0.6, 1.36], [h - 1.08, 1.98], [h - 1.4, 1.98], [h - 1.4, 1.36]], w + 0.02, GLASS));
      p.push(part(box(w + 0.03, 0.42, 2.4), GLASS, 0, 1.62, -0.85));
      lights(p, w, L, 0.78);
      wheels(p, w, L, 0.36);
    } else if (type === 'bus') {
      const w = 2.5, L = 12;
      p.push(part(box(w, 2.55, L), 0xffffff, 0, 1.68, 0));
      p.push(part(box(w + 0.02, 0.85, L - 1.6), GLASS, 0, 2.2, -0.3));
      p.push(part(box(w - 0.2, 1.2, 0.06), GLASS, 0, 2.05, L / 2 + 0.01));
      p.push(part(box(w + 0.03, 0.22, L), 0x2b7a78, 0, 1.08, 0));       // פס צבע
      p.push(part(box(w - 0.3, 0.12, L - 1), 0xe6e6e6, 0, 3.0, 0));
      lights(p, w, L, 0.7);
      for (const z of [L / 2 - 1.6, -L / 2 + 2.2]) for (const x of [w / 2 - 0.05, -w / 2 + 0.05]) {
        p.push(part(cyl(0.48, 0.48, 0.3, 12), 0x141414, x, 0.48, z, 0, 0, Math.PI / 2));
      }
    }
    return merge(p);
  }
  // אמבולנס: ואן לבן עם פס אדום (בלי סמלים של ארגון אמיתי)
  function ambulance() {
    const p = [], w = 2.05, L = 5.6, h = L / 2;
    p.push(part(box(w, 1.75, L - 1.0), 0xf7f7f5, 0, 1.25, -0.5));
    p.push(part(box(w, 1.0, 1.0), 0xf7f7f5, 0, 0.82, h - 0.5));
    p.push(part(box(w - 0.12, 0.55, 0.06), GLASS, 0, 1.6, h - 1.02, -0.35));
    p.push(part(box(w + 0.03, 0.28, L - 0.2), 0xd8332b, 0, 1.0, 0));
    p.push(part(box(w + 0.03, 0.12, L - 0.2), 0xd8332b, 0, 1.75, -0.3));
    p.push(part(box(w + 0.02, 0.42, 1.6), GLASS, 0, 1.62, 0.2));
    lights(p, w, L, 0.8);
    wheels(p, w, L, 0.37);
    return merge(p);
  }

  // משאית הקוגל: משאית חלוקה עם קוגל ענק על הגג
  function kugelTruck() {
    const p = [], w = 2.0, L = 5.4, h = L / 2;
    p.push(part(box(w, 1.6, L - 1.3), 0xf2e3c2, 0, 1.2, -0.6));            // ארגז
    p.push(part(box(w, 1.05, 1.2), 0xd8892e, 0, 0.85, h - 0.6));             // תא נהג כתום
    p.push(part(box(w - 0.12, 0.5, 0.06), GLASS, 0, 1.2, h - 0.02, -0.3));
    p.push(part(box(w + 0.02, 0.3, L - 1.4), 0xd8892e, 0, 0.6, -0.6));       // פס
    // הקוגל: עוגה עגולה וחומה, עם שכבה עליונה כהה ו"אדים"
    p.push(part(cyl(0.85, 0.9, 0.55, 18), 0xb0702f, 0, 2.3, -0.6));
    p.push(part(cyl(0.8, 0.85, 0.12, 18), 0x7a4a1c, 0, 2.62, -0.6));
    for (const [sx, sz] of [[0.25, -0.4], [-0.3, -0.75], [0.05, -0.2]]) p.push(part(sph(0.12, 6, 5), 0xffffff, sx, 2.95, sz - 0.2, 0, 0, 0, 1, 1.6, 1));
    lights(p, w, L, 0.7);
    wheels(p, w, L, 0.37);
    return merge(p);
  }

  // רכבת קלה: גוף ארוך עם שלושה קרונות מחוברים
  function tram() {
    const p = [], W = 2.65, L = 30, H = 3.3;
    const secs = [[-15, -5.2], [-4.8, 4.8], [5.2, 15]];
    for (const [a, c] of secs) {
      const len = c - a, cz = (a + c) / 2;
      p.push(part(box(W, H - 0.5, len), 0xf2f3f4, 0, 0.5 + (H - 0.5) / 2, cz));
      p.push(part(box(W + 0.02, 1.0, len - 0.6), GLASS, 0, 2.15, cz));
      p.push(part(box(W + 0.03, 0.22, len), 0x3c6e9e, 0, 1.25, cz));
      p.push(part(box(W - 0.1, 0.35, len - 0.2), 0x55595f, 0, 0.32, cz));
    }
    // מפרקים
    for (const z of [-5, 5]) p.push(part(box(W - 0.2, H - 0.7, 0.45), 0x3a3d42, 0, 1.85, z));
    // חזיתות מעוגלות
    for (const sg of [-1, 1]) {
      p.push(part(box(W - 0.1, 1.2, 0.5), GLASS, 0, 2.2, sg * 15.15));
      p.push(part(box(0.5, 0.18, 0.1), 0xfff2c4, 0.8, 1.0, sg * 15.25));
      p.push(part(box(0.5, 0.18, 0.1), 0xfff2c4, -0.8, 1.0, sg * 15.25));
    }
    // פנטוגרף
    p.push(part(box(0.9, 0.08, 1.4), 0x2a2a2a, 0, H + 0.45, 0));
    p.push(part(box(0.08, 0.7, 0.08), 0x2a2a2a, 0, H + 0.12, 0.4, 0.5, 0, 0));
    return merge(p);
  }

  // מכת"זית: גוף (צריח בנפרד)
  function cannonBody() {
    const p = [], W = 2.5, L = 7.4, BL = 0x2c4f86, WH = 0xeef0f2;
    p.push(part(box(W, 1.9, 2.0), WH, 0, 1.6, L / 2 - 1.0));             // תא נהג
    p.push(part(box(W - 0.1, 0.7, 0.06), GLASS, 0, 2.05, L / 2 + 0.01));
    p.push(part(box(W + 0.02, 0.35, 2.02), BL, 0, 1.05, L / 2 - 1.0));
    p.push(part(box(W, 2.1, L - 2.2), WH, 0, 1.7, -1.1));                // מיכל
    p.push(part(box(W + 0.02, 0.4, L - 2.2), BL, 0, 1.2, -1.1));
    p.push(part(box(0.9, 0.12, 0.25), 0x3a73d6, 0.45, 2.62, L / 2 - 0.8)); // אורות כחולים
    p.push(part(box(0.9, 0.12, 0.25), 0xd63a3a, -0.45, 2.62, L / 2 - 0.8));
    p.push(part(box(W, 0.3, L), 0x333333, 0, 0.45, 0));
    for (const z of [L / 2 - 1.2, -L / 2 + 1.4, -L / 2 + 2.6]) for (const x of [W / 2 - 0.05, -W / 2 + 0.05]) {
      p.push(part(cyl(0.5, 0.5, 0.34, 12), 0x141414, x, 0.5, z, 0, 0, Math.PI / 2));
    }
    return merge(p);
  }
  function cannonTurret() {
    const p = [];
    p.push(part(cyl(0.45, 0.5, 0.4, 12), 0xd8dadc, 0, 0.2, 0));
    p.push(part(cyl(0.11, 0.14, 1.6, 8), 0x55595f, 0, 0.42, 0.75, Math.PI / 2 - 0.12));
    return merge(p);
  }
  // ניידת עצורים (מיניבוס משטרתי)
  function policeVan() {
    const p = [], W = 2.2, L = 6.2, BL = 0x1f3a6e, WH = 0xf1f2f4;
    p.push(part(box(W, 2.1, L), WH, 0, 1.45, 0));
    p.push(part(box(W + 0.02, 0.38, L), BL, 0, 1.0, 0));
    p.push(part(box(W + 0.02, 0.45, L - 2.2), 0x2a3440, 0, 1.95, -0.6));
    p.push(part(box(W - 0.2, 0.6, 0.06), GLASS, 0, 1.85, L / 2 + 0.01));
    p.push(part(box(1.0, 0.13, 0.3), 0x3a73d6, 0.3, 2.56, L / 2 - 0.7));
    p.push(part(box(1.0, 0.13, 0.3), 0xd63a3a, -0.3, 2.56, L / 2 - 0.7));
    wheels(p, W, L, 0.4);
    return merge(p);
  }
  function patrolCar() {
    const p = [], w = 1.85, L = 4.7, BL = 0x1f3a6e;
    p.push(part(box(w, 0.6, L), 0xf1f2f4, 0, 0.62, 0));
    p.push(part(box(w + 0.02, 0.2, L), BL, 0, 0.62, 0));
    p.push(part(box(w - 0.12, 0.46, 2.3), GLASS, 0, 1.15, -0.15));
    p.push(part(box(w - 0.1, 0.07, 2.0), 0xf1f2f4, 0, 1.4, -0.2));
    p.push(part(box(0.5, 0.12, 0.26), 0x3a73d6, 0.26, 1.5, -0.1));
    p.push(part(box(0.5, 0.12, 0.26), 0xd63a3a, -0.26, 1.5, -0.1));
    lights(p, w, L, 0.7);
    wheels(p, w, L, 0.33);
    return merge(p);
  }

  // ---------- סביבה ----------
  function tree() {
    const p = [];
    p.push(part(cyl(0.13, 0.19, 2.2, 7), 0x6b5440, 0, 1.1, 0));
    p.push(part(new T.IcosahedronGeometry(1.5, 1), 0x6f8f4e, 0, 3.1, 0, 0, 0, 0, 1, 0.85, 1));
    p.push(part(new T.IcosahedronGeometry(1.05, 1), 0x7fa05a, 0.5, 3.55, 0.35));
    p.push(part(new T.IcosahedronGeometry(0.95, 1), 0x5f8044, -0.55, 3.35, -0.3));
    return merge(p);
  }
  function lamp() {
    const p = [];
    p.push(part(cyl(0.07, 0.1, 6.2, 8), 0x5b6068, 0, 3.1, 0));
    p.push(part(box(0.08, 0.08, 1.5), 0x5b6068, 0, 6.1, 0.7));
    p.push(part(box(0.32, 0.12, 0.55), 0x3d4148, 0, 6.05, 1.4));
    return merge(p);
  }
  function lampGlow() {
    return merge([part(box(0.26, 0.04, 0.46), 0xffffff, 0, 5.98, 1.4)]);
  }
  function solarHeater() {
    const p = [];
    p.push(part(box(1.0, 0.06, 1.8), 0x2f3d5a, 0, 0.75, 0, -0.6));
    p.push(part(cyl(0.3, 0.3, 1.5, 10), 0xdcdcdc, 0, 1.2, -0.7, 0, 0, Math.PI / 2));
    p.push(part(box(0.9, 0.7, 0.05), 0x9a9a9a, 0, 0.4, -0.75));
    return merge(p);
  }
  function trafficLight() {
    const p = [];
    p.push(part(cyl(0.08, 0.1, 3.4, 8), 0x3b3f45, 0, 1.7, 0));
    p.push(part(box(0.36, 1.0, 0.3), 0x22262b, 0, 3.6, 0));
    return merge(p);
  }
  function bollard() {
    return merge([part(cyl(0.09, 0.11, 0.85, 8), 0x3b3f45, 0, 0.42, 0), part(cyl(0.1, 0.1, 0.1, 8), 0xd9d9d9, 0, 0.72, 0)]);
  }
  function barrier() {
    const p = [];
    p.push(part(box(2.2, 0.1, 0.06), 0x2a5fa8, 0, 1.0, 0));
    p.push(part(box(2.2, 0.1, 0.06), 0xf2f2f2, 0, 0.75, 0));
    p.push(part(box(0.08, 1.05, 0.5), 0x9aa0a8, -1.0, 0.52, 0));
    p.push(part(box(0.08, 1.05, 0.5), 0x9aa0a8, 1.0, 0.52, 0));
    return merge(p);
  }

  // מוכר בייגלה עם עגלה ושמשייה (דמות שלמה, הקרקע ב-0) — בדיחה חיה בפקקים גדולים
  function vendor() {
    const p = [], W = 0.9;   // גובה המותן
    p.push(part(box(0.14, 0.86, 0.16), 0x3a3a40, 0.11, 0.43, 0));
    p.push(part(box(0.14, 0.86, 0.16), 0x3a3a40, -0.11, 0.43, 0));
    p.push(part(box(0.16, 0.08, 0.26), 0x222222, 0.11, 0.04, 0.04));
    p.push(part(box(0.16, 0.08, 0.26), 0x222222, -0.11, 0.04, 0.04));
    p.push(part(box(0.46, 0.62, 0.27), 0x8fb4d8, 0, W + 0.32, 0));          // חולצה תכלת
    p.push(part(box(0.42, 0.78, 0.02), 0xf6f3ea, 0, W + 0.12, 0.145));      // סינר
    p.push(part(box(0.12, 0.5, 0.14), 0x8fb4d8, 0.27, W + 0.42, 0.22, -1.15, 0, 0));   // ידיים קדימה, דוחפות
    p.push(part(box(0.12, 0.5, 0.14), 0x8fb4d8, -0.27, W + 0.42, 0.22, -1.15, 0, 0));
    p.push(part(cyl(0.06, 0.07, 0.1, 8), SKIN, 0, W + 0.66, 0));
    p.push(part(sph(0.135, 12, 10), SKIN, 0, W + 0.8, 0, 0, 0, 0, 1, 1.08, 1));
    p.push(part(cyl(0.15, 0.15, 0.09, 12), 0x2f4a35, 0, W + 0.94, 0));      // כובע מצחייה
    p.push(part(box(0.24, 0.025, 0.14), 0x2f4a35, 0, W + 0.9, 0.14));
    // העגלה
    const cz = 0.95;
    p.push(part(box(0.66, 0.42, 0.95), 0x9a6b3c, 0, 0.78, cz));
    p.push(part(box(0.7, 0.05, 0.99), 0x7a522c, 0, 1.0, cz));
    for (const sx of [-0.36, 0.36]) for (const sz of [-0.3, 0.3]) p.push(part(cyl(0.16, 0.16, 0.06, 12), 0x1d1d1d, sx, 0.16, cz + sz, 0, 0, Math.PI / 2));
    p.push(part(box(0.05, 0.6, 0.05), 0x555555, 0.3, 0.45, cz - 0.3));
    p.push(part(box(0.05, 0.6, 0.05), 0x555555, -0.3, 0.45, cz - 0.3));
    p.push(part(box(0.05, 0.6, 0.05), 0x555555, 0.3, 0.45, cz + 0.4));
    p.push(part(box(0.05, 0.6, 0.05), 0x555555, -0.3, 0.45, cz + 0.4));
    // בייגלה על המגש
    const tor = new T.TorusGeometry(0.085, 0.034, 6, 12); tor.rotateX(Math.PI / 2);
    for (let i = 0; i < 9; i++) p.push(part(tor, 0xc98b4a, -0.2 + (i % 3) * 0.2, 1.06 + (i > 5 ? 0.05 : 0), cz - 0.28 + Math.floor(i / 3) * 0.28));
    // שמשייה בפסים אדום-לבן
    p.push(part(cyl(0.025, 0.025, 1.5, 6), 0xdddddd, 0, 1.75, cz));
    for (let k = 0; k < 8; k++) p.push(part(new T.ConeGeometry(0.95, 0.32, 2, 1, true, k * Math.PI / 4, Math.PI / 4), k % 2 ? 0xf4f1ea : 0xc8322a, 0, 2.55, cz));
    return merge(p);
  }

  // נהג שיצא מהמכונית לראות מה קורה (דמות שלמה, הקרקע ב-0)
  function driverOut(shirt) {
    const p = [], W = 0.9;
    p.push(part(box(0.14, 0.86, 0.16), 0x2d3240, 0.11, 0.43, 0));
    p.push(part(box(0.14, 0.86, 0.16), 0x2d3240, -0.11, 0.43, 0));
    p.push(part(box(0.16, 0.08, 0.26), 0x222222, 0.11, 0.04, 0.04));
    p.push(part(box(0.16, 0.08, 0.26), 0x222222, -0.11, 0.04, 0.04));
    p.push(part(box(0.48, 0.64, 0.28), shirt, 0, W + 0.32, 0));
    // יד אחת על המותן, אחת מורמת בתנועת "נו?!"
    p.push(part(box(0.12, 0.5, 0.14), shirt, 0.3, W + 0.32, 0.02, 0, 0, 0.5));
    p.push(part(box(0.12, 0.46, 0.14), shirt, -0.3, W + 0.66, 0.06, -0.2, 0, -0.9));
    p.push(part(box(0.09, 0.09, 0.1), SKIN, -0.48, W + 0.86, 0.1));
    p.push(part(cyl(0.06, 0.07, 0.1, 8), SKIN, 0, W + 0.66, 0));
    p.push(part(sph(0.135, 12, 10), SKIN, 0, W + 0.8, 0, 0, 0, 0, 1, 1.08, 1));
    p.push(part(cyl(0.1, 0.1, 0.02, 10), 0x1e2a4a, 0, W + 0.94, -0.02));   // כיפה
    return merge(p);
  }

  HM.Models = {
    vendor, driverOut, kugelTruck,
    lin, part, merge, box, cyl, sph, tram, ambulance,
    bochur, avrech, askan, photographer, riot, officer, cop, rider, leg, horse, car, cannonBody, cannonTurret, policeVan, patrolCar,
    tree, lamp, lampGlow, solarHeater, trafficLight, bollard, barrier
  };
})(typeof window !== 'undefined' ? window : globalThis);
