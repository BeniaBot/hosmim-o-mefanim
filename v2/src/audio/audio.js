/* קול: הכול מסונתז בזמן אמת (Web Audio) — אין קבצי קול. */
(function (root) {
  'use strict';
  const HM = root.HM || (root.HM = {});

  const A = {
    ctx: null, master: null, vol: 0.7, muted: false, noiseBuf: null,
    crowd: null, spray: null, lastHonk: 0, lastSiren: 0,

    init() {
      if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
      const AC = root.AudioContext || root.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : this.vol;
      const comp = this.ctx.createDynamicsCompressor();
      this.master.connect(comp); comp.connect(this.ctx.destination);
      const len = this.ctx.sampleRate * 2;
      this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      this.startLoops();
    },
    setVolume(v) { this.vol = v; if (this.master && !this.muted) this.master.gain.setTargetAtTime(v, this.ctx.currentTime, 0.05); },
    setMuted(m) { this.muted = m; if (this.master) this.master.gain.setTargetAtTime(m ? 0 : this.vol, this.ctx.currentTime, 0.05); },
    ok() { return this.ctx && this.ctx.state === 'running'; },

    env(g, t, a, peak, dcy) {
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(peak, t + a);
      g.gain.exponentialRampToValueAtTime(0.0001, t + a + dcy);
    },
    noise() { const s = this.ctx.createBufferSource(); s.buffer = this.noiseBuf; s.loop = true; return s; },

    startLoops() {
      const c = this.ctx;
      // המולת קהל: רעש מסונן + פעימות של קריאות
      const n = this.noise();
      const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 520; bp.Q.value = 0.8;
      const g = c.createGain(); g.gain.value = 0;
      const lfo = c.createOscillator(); lfo.frequency.value = 1.6;
      const lg = c.createGain(); lg.gain.value = 0;
      lfo.connect(lg); lg.connect(g.gain);
      n.connect(bp); bp.connect(g); g.connect(this.master);
      n.start(); lfo.start();
      this.crowd = { g, lg };
      // מים
      const n2 = this.noise();
      const hp = c.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 900;
      const g2 = c.createGain(); g2.gain.value = 0;
      n2.connect(hp); hp.connect(g2); g2.connect(this.master);
      n2.start();
      this.spray = g2;
      // זמזום עיר רחוק (תנועה) — שקט מאוד, נותן תחושת מקום
      const n3 = this.noise();
      const lp3 = c.createBiquadFilter(); lp3.type = 'lowpass'; lp3.frequency.value = 180;
      const g3 = c.createGain(); g3.gain.value = 0;
      n3.connect(lp3); lp3.connect(g3); g3.connect(this.master);
      n3.start();
      this.hum = g3;
    },
    setHum(on) { if (this.hum) this.hum.gain.setTargetAtTime(on ? 0.05 : 0, this.ctx.currentTime, 0.8); },
    // סירנת אמבולנס: שני טונים מתחלפים
    ambSiren() {
      if (!this.ok()) return;
      const c = this.ctx, t = c.currentTime + 0.01;
      const o = c.createOscillator(); o.type = 'triangle';
      const g = c.createGain();
      for (let k = 0; k < 6; k++) o.frequency.setValueAtTime(k % 2 ? 660 : 880, t + k * 0.42);
      o.connect(g); g.connect(this.master);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.04, t + 0.1);
      g.gain.setValueAtTime(0.04, t + 2.4); g.gain.exponentialRampToValueAtTime(0.0001, t + 2.6);
      o.start(t); o.stop(t + 2.7);
    },
    setCrowd(level) {
      if (!this.crowd) return;
      const t = this.ctx.currentTime;
      const v = Math.min(0.11, level * 0.006);
      this.crowd.g.gain.setTargetAtTime(v * 0.6, t, 0.4);
      this.crowd.lg.gain.setTargetAtTime(v * 0.5, t, 0.4);
    },
    setSpray(on) { if (this.spray) this.spray.gain.setTargetAtTime(on ? 0.09 : 0, this.ctx.currentTime, 0.08); },

    honk(vol) {
      if (!this.ok()) return;
      const now = this.ctx.currentTime;
      if (now - this.lastHonk < 0.35) return;
      this.lastHonk = now;
      const c = this.ctx, t = now + 0.01;
      const f = 330 + Math.random() * 160, dur = 0.18 + Math.random() * 0.35;
      const g = c.createGain();
      const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1400;
      for (const m of [1, 1.26]) {
        const o = c.createOscillator(); o.type = 'square'; o.frequency.value = f * m;
        o.connect(lp); o.start(t); o.stop(t + dur + 0.05);
      }
      lp.connect(g); g.connect(this.master);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.05 * (vol || 1), t + 0.02);
      g.gain.setValueAtTime(0.05 * (vol || 1), t + dur);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.05);
    },
    siren() {
      if (!this.ok()) return;
      const c = this.ctx, t = c.currentTime + 0.01;
      if (t - this.lastSiren < 3) return;
      this.lastSiren = t;
      const o = c.createOscillator(); o.type = 'sine';
      const g = c.createGain();
      o.frequency.setValueAtTime(620, t);
      for (let k = 0; k < 3; k++) {
        o.frequency.linearRampToValueAtTime(980, t + k * 0.9 + 0.45);
        o.frequency.linearRampToValueAtTime(620, t + k * 0.9 + 0.9);
      }
      o.connect(g); g.connect(this.master);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.045, t + 0.15);
      g.gain.setValueAtTime(0.045, t + 2.4);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 2.8);
      o.start(t); o.stop(t + 2.9);
    },
    shofar() {
      if (!this.ok()) return;
      const c = this.ctx, t0 = c.currentTime + 0.02;
      const blast = (t, d, f0, f1) => {
        const o = c.createOscillator(); o.type = 'sawtooth';
        const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1100; lp.Q.value = 3;
        const g = c.createGain();
        const vib = c.createOscillator(); vib.frequency.value = 5.5;
        const vg = c.createGain(); vg.gain.value = 4;
        vib.connect(vg); vg.connect(o.frequency);
        o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + d * 0.6);
        o.connect(lp); lp.connect(g); g.connect(this.master);
        g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.12, t + 0.08);
        g.gain.setValueAtTime(0.12, t + d - 0.1); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
        o.start(t); o.stop(t + d + 0.05); vib.start(t); vib.stop(t + d + 0.05);
      };
      blast(t0, 0.7, 210, 300);
      blast(t0 + 0.85, 1.5, 220, 320);
    },
    thud() {
      if (!this.ok()) return;
      const c = this.ctx, t = c.currentTime + 0.01;
      const o = c.createOscillator(); o.type = 'sine';
      const g = c.createGain();
      o.frequency.setValueAtTime(160, t); o.frequency.exponentialRampToValueAtTime(60, t + 0.18);
      o.connect(g); g.connect(this.master);
      this.env(g, t, 0.01, 0.08, 0.2);
      o.start(t); o.stop(t + 0.25);
    },
    hooves() {
      if (!this.ok()) return;
      const c = this.ctx, t0 = c.currentTime + 0.01;
      for (let k = 0; k < 8; k++) {
        const t = t0 + k * 0.13 + (k % 2) * 0.04;
        const s = c.createBufferSource(); s.buffer = this.noiseBuf;
        const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 900; bp.Q.value = 4;
        const g = c.createGain();
        s.connect(bp); bp.connect(g); g.connect(this.master);
        this.env(g, t, 0.003, 0.12, 0.06);
        s.start(t, Math.random()); s.stop(t + 0.1);
      }
    },
    click() {
      if (!this.ok()) return;
      const c = this.ctx, t = c.currentTime + 0.005;
      const o = c.createOscillator(); o.type = 'triangle'; o.frequency.value = 900;
      const g = c.createGain();
      o.connect(g); g.connect(this.master);
      this.env(g, t, 0.003, 0.05, 0.06);
      o.start(t); o.stop(t + 0.08);
    },
    chime(good) {
      if (!this.ok()) return;
      const c = this.ctx, t = c.currentTime + 0.01;
      const notes = good ? [660, 880] : [440, 330];
      notes.forEach((f, i) => {
        const o = c.createOscillator(); o.type = 'sine'; o.frequency.value = f;
        const g = c.createGain();
        o.connect(g); g.connect(this.master);
        this.env(g, t + i * 0.11, 0.01, 0.06, 0.35);
        o.start(t + i * 0.11); o.stop(t + i * 0.11 + 0.4);
      });
    },
    sting(win) {
      if (!this.ok()) return;
      const c = this.ctx, t = c.currentTime + 0.05;
      const notes = win ? [523, 659, 784, 1047] : [392, 349, 311, 262];
      notes.forEach((f, i) => {
        const o = c.createOscillator(); o.type = 'triangle'; o.frequency.value = f;
        const g = c.createGain();
        o.connect(g); g.connect(this.master);
        this.env(g, t + i * 0.16, 0.02, 0.12, i === notes.length - 1 ? 0.9 : 0.3);
        o.start(t + i * 0.16); o.stop(t + i * 0.16 + 1.0);
      });
    },
    stopAll() { this.setCrowd(0); this.setSpray(false); this.setHum(false); }
  };

  HM.Audio = A;
})(typeof window !== 'undefined' ? window : globalThis);
