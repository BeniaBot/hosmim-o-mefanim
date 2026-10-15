/* הבמה: מצייר, מצלמה, תאורה, שמיים — והשקיעה שמתקדמת לאורך המשחק. */
(function (root) {
  'use strict';
  const HM = root.HM || (root.HM = {});
  const T = root.THREE;
  const U = HM.U;

  // נקודות מפתח לאור לאורך היום: f=0 אחר הצהריים, f=1 שקיעה
  const KEYS = [
    { f: 0.0, el: 46, sun: 0xfff3df, si: 1.25, sky: 0x86b6e2, hor: 0xd9e7f0, gnd: 0xc9b99c, hi: 0.62, fog: 0xd6e2ea },
    { f: 0.55, el: 28, sun: 0xffe7c2, si: 1.15, sky: 0x7aa8d8, hor: 0xe8e0cf, gnd: 0xc4b294, hi: 0.58, fog: 0xe0ddd0 },
    { f: 0.82, el: 12, sun: 0xffc488, si: 1.0, sky: 0x7495c8, hor: 0xf3c493, gnd: 0xbea284, hi: 0.58, fog: 0xe8c9a6 },
    { f: 1.0, el: 4, sun: 0xff9a5e, si: 0.85, sky: 0x5a6da0, hor: 0xf5a26f, gnd: 0xa08068, hi: 0.54, fog: 0xd99a7a }
  ];
  const _ca = new T.Color(), _cb = new T.Color();
  function mixHex(a, b, t, out) { _ca.setHex(a); _cb.setHex(b); out.copy(_ca).lerp(_cb, t); return out; }

  class Stage {
    constructor(canvas, quality) {
      this.quality = quality || 'high';
      const r = new T.WebGLRenderer({ canvas, antialias: this.quality !== 'low', powerPreference: 'high-performance', alpha: false });
      r.outputEncoding = T.sRGBEncoding;
      r.shadowMap.enabled = this.quality !== 'low';
      r.shadowMap.type = T.PCFShadowMap;
      r.setClearColor(0xd6e2ea);
      this.renderer = r;
      this.maxDpr = this.quality === 'high' ? 1.5 : this.quality === 'medium' ? 1.25 : 1;
      this.dpr = Math.min(root.devicePixelRatio || 1, this.maxDpr);
      r.setPixelRatio(this.dpr);

      this.scene = new T.Scene();
      this.scene.fog = new T.Fog(0xd6e2ea, 160, 420);
      this.camera = new T.PerspectiveCamera(36, 1, 1, 1200);

      this.hemi = new T.HemisphereLight(0xcfe0f0, 0xb8a88c, 0.6);
      this.scene.add(this.hemi);
      this.sun = new T.DirectionalLight(0xffffff, 1.2);
      this.sun.castShadow = r.shadowMap.enabled;
      const sz = this.quality === 'high' ? 2048 : 1024;
      this.sun.shadow.mapSize.set(sz, sz);
      const sc = this.sun.shadow.camera;
      sc.left = -75; sc.right = 75; sc.top = 75; sc.bottom = -75; sc.near = 1; sc.far = 400;
      this.sun.shadow.bias = -0.0006;
      this.sun.shadow.normalBias = 0.03;
      this.scene.add(this.sun);
      this.scene.add(this.sun.target);

      this.makeSky();
      this.cam = { tx: 0, tz: 2, dist: 78, yaw: 0, pitch: 0.92 };
      this.dayF = -1;
      this.setDay(0);
      this.resize();
    }

    makeSky() {
      const geo = new T.SphereGeometry(900, 24, 12);
      this.skyU = {
        top: { value: new T.Color(0x86b6e2) }, hor: { value: new T.Color(0xd9e7f0) }, gnd: { value: new T.Color(0xc9b99c) },
        sunDir: { value: new T.Vector3(0, 1, 0) }, sunCol: { value: new T.Color(0xffffff) }
      };
      const mat = new T.ShaderMaterial({
        uniforms: this.skyU, side: T.BackSide, depthWrite: false, fog: false,
        vertexShader: 'varying vec3 vW; void main(){ vW = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
        fragmentShader: [
          'uniform vec3 top; uniform vec3 hor; uniform vec3 gnd; uniform vec3 sunDir; uniform vec3 sunCol; varying vec3 vW;',
          'void main(){ float h = vW.y; vec3 c = h > 0.0 ? mix(hor, top, pow(clamp(h*1.6,0.0,1.0), 0.7)) : mix(hor, gnd, clamp(-h*4.0,0.0,1.0));',
          ' float s = max(dot(normalize(vW), normalize(sunDir)), 0.0); c += sunCol * (pow(s, 600.0) * 1.2 + pow(s, 8.0) * 0.25);',
          ' gl_FragColor = vec4(c, 1.0); }'
        ].join('\n')
      });
      this.sky = new T.Mesh(geo, mat);
      this.sky.frustumCulled = false;
      this.sky.renderOrder = -1;
      this.scene.add(this.sky);
    }

    setDay(f) {
      f = U.clamp(f, 0, 1);
      if (Math.abs(f - this.dayF) < 0.0015) return;
      this.dayF = f;
      let i = 0;
      while (i < KEYS.length - 2 && f > KEYS[i + 1].f) i++;
      const a = KEYS[i], b = KEYS[i + 1], t = U.smoothstep(a.f, b.f, f);
      const el = U.lerp(a.el, b.el, t) * Math.PI / 180;
      const az = U.lerp(-0.35, -0.12, f);  // מערב-דרום-מערב → מערב
      const dir = new T.Vector3(-Math.cos(el) * Math.cos(az), Math.sin(el), -Math.cos(el) * Math.sin(az) + Math.cos(el) * 0.35).normalize();
      this.sunDir = dir;
      mixHex(a.sun, b.sun, t, this.sun.color);
      this.sun.intensity = U.lerp(a.si, b.si, t);
      mixHex(a.sky, b.sky, t, this.hemi.color);
      mixHex(a.gnd, b.gnd, t, this.hemi.groundColor);
      this.hemi.intensity = U.lerp(a.hi, b.hi, t);
      mixHex(a.sky, b.sky, t, this.skyU.top.value);
      mixHex(a.hor, b.hor, t, this.skyU.hor.value);
      mixHex(a.gnd, b.gnd, t, this.skyU.gnd.value);
      this.skyU.sunDir.value.copy(dir);
      mixHex(a.sun, b.sun, t, this.skyU.sunCol.value);
      mixHex(a.fog, b.fog, t, this.scene.fog.color);
      this.renderer.setClearColor(this.scene.fog.color);
      this.nightF = U.smoothstep(0.72, 1.0, f);   // חלונות ופנסים נדלקים
    }

    resize() {
      const c = this.renderer.domElement;
      const w = Math.max(1, c.clientWidth || root.innerWidth), h = Math.max(1, c.clientHeight || root.innerHeight);
      this.renderer.setSize(w, h, false);
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
      this.w = w; this.h = h;
    }

    updateCamera() {
      const c = this.cam, cam = this.camera;
      const cp = Math.cos(c.pitch), sp = Math.sin(c.pitch);
      cam.position.set(c.tx + Math.sin(c.yaw) * cp * c.dist, sp * c.dist, c.tz + Math.cos(c.yaw) * cp * c.dist);
      cam.lookAt(c.tx, 0, c.tz);
      // הצל עוקב אחרי המצלמה
      const d = this.sunDir;
      this.sun.position.set(c.tx + d.x * 200, d.y * 200, c.tz + d.z * 200);
      this.sun.target.position.set(c.tx, 0, c.tz);
      const ext = U.clamp(c.dist * 0.95, 50, 110);
      const sc = this.sun.shadow.camera;
      if (Math.abs(sc.right - ext) > 2) { sc.left = -ext; sc.right = ext; sc.top = ext; sc.bottom = -ext; sc.updateProjectionMatrix(); }
      this.sky.position.copy(cam.position);
    }

    render() {
      this.updateCamera();
      this.renderer.render(this.scene, this.camera);
    }
  }

  HM.Stage = Stage;
})(typeof window !== 'undefined' ? window : globalThis);
