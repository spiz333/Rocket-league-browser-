// Fully synthesized sound effects with WebAudio (no audio files needed).
export class Audio {
  constructor() {
    this.ctx = null;
    this.enabled = true;
    this.volume = 0.7;
    this.engine = null;
  }

  init() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    const ctx = this.ctx;
    this.master = ctx.createGain();
    this.master.gain.value = this.enabled ? this.volume : 0;
    const comp = ctx.createDynamicsCompressor();
    this.master.connect(comp);
    comp.connect(ctx.destination);

    // shared noise buffer
    const len = ctx.sampleRate * 2;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;

    // engine
    const o1 = ctx.createOscillator(); o1.type = 'sawtooth';
    const o2 = ctx.createOscillator(); o2.type = 'square';
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 600; f.Q.value = 2;
    const g = ctx.createGain(); g.gain.value = 0;
    o1.connect(f); o2.connect(f); f.connect(g); g.connect(this.master);
    o1.start(); o2.start();
    this.engine = { o1, o2, f, g };

    // boost hiss
    const bn = ctx.createBufferSource(); bn.buffer = this.noise; bn.loop = true;
    const bf = ctx.createBiquadFilter(); bf.type = 'bandpass'; bf.frequency.value = 1400; bf.Q.value = 0.7;
    const bg = ctx.createGain(); bg.gain.value = 0;
    bn.connect(bf); bf.connect(bg); bg.connect(this.master);
    bn.start();
    this.boostSnd = { bf, bg };

    // crowd ambience
    const cn = ctx.createBufferSource(); cn.buffer = this.noise; cn.loop = true;
    const cf = ctx.createBiquadFilter(); cf.type = 'bandpass'; cf.frequency.value = 700; cf.Q.value = 0.4;
    const cg = ctx.createGain(); cg.gain.value = 0.035;
    cn.connect(cf); cf.connect(cg); cg.connect(this.master);
    cn.start();
    this.crowd = { cg, cf };
  }

  setEnabled(on) {
    this.enabled = on;
    if (this.master) this.master.gain.setTargetAtTime(on ? this.volume : 0, this.ctx.currentTime, 0.05);
  }

  updateEngine(speed, throttle, boosting, active) {
    if (!this.ctx || !this.engine) return;
    const t = this.ctx.currentTime;
    const e = this.engine;
    const base = 55 + speed * 7 + Math.abs(throttle) * 12;
    e.o1.frequency.setTargetAtTime(base, t, 0.05);
    e.o2.frequency.setTargetAtTime(base * 0.5, t, 0.05);
    e.f.frequency.setTargetAtTime(400 + speed * 60, t, 0.08);
    e.g.gain.setTargetAtTime(active ? 0.05 + Math.abs(throttle) * 0.04 + speed * 0.002 : 0, t, 0.08);
    this.boostSnd.bg.gain.setTargetAtTime(active && boosting ? 0.22 : 0, t, 0.04);
    this.boostSnd.bf.frequency.setTargetAtTime(1200 + speed * 40, t, 0.1);
  }

  crowdLevel(level) {
    if (!this.ctx) return;
    this.crowd.cg.gain.setTargetAtTime(0.03 + level * 0.25, this.ctx.currentTime, level > 0.3 ? 0.1 : 1.2);
  }

  _noiseBurst(dur, freq, q, gain, type = 'bandpass', delay = 0) {
    const ctx = this.ctx;
    const t = ctx.currentTime + delay;
    const s = ctx.createBufferSource(); s.buffer = this.noise;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(this.master);
    s.start(t, Math.random()); s.stop(t + dur + 0.05);
  }

  _tone(freq, dur, type = 'sine', gain = 0.2, slideTo = null, delay = 0) {
    const ctx = this.ctx;
    const t = ctx.currentTime + delay;
    const o = ctx.createOscillator(); o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + dur + 0.05);
  }

  hit(strength, near = 1) {
    if (!this.ctx) return;
    const s = Math.min(1, strength / 25) * near;
    if (s < 0.02) return;
    this._noiseBurst(0.12 + s * 0.15, 900 + s * 1500, 1.2, 0.5 * s);
    this._tone(140 + s * 80, 0.18, 'sine', 0.6 * s, 50);
  }

  bounce(strength, near = 1) {
    if (!this.ctx) return;
    const s = Math.min(1, strength / 20) * near;
    if (s < 0.05) return;
    this._tone(90, 0.15, 'sine', 0.35 * s, 45);
    this._noiseBurst(0.08, 500, 1, 0.12 * s);
  }

  jump() { if (this.ctx) this._noiseBurst(0.18, 2200, 0.8, 0.08, 'highpass'); }
  dodge() { if (this.ctx) this._noiseBurst(0.3, 1600, 0.6, 0.12); }
  land(s = 1) { if (this.ctx) this._tone(70, 0.12, 'sine', 0.15 * s, 40); }

  pickup(big) {
    if (!this.ctx) return;
    if (big) { this._tone(500, 0.25, 'triangle', 0.18, 1200); this._tone(750, 0.25, 'sine', 0.1, 1500, 0.05); }
    else this._tone(900, 0.09, 'triangle', 0.1, 1300);
  }

  countdown(final) {
    if (!this.ctx) return;
    if (final) { this._tone(880, 0.6, 'square', 0.12); this._tone(1320, 0.6, 'sine', 0.1); }
    else this._tone(440, 0.22, 'square', 0.1);
  }

  goal(ours) {
    if (!this.ctx) return;
    this._noiseBurst(1.6, 300, 0.5, 0.9, 'lowpass');
    this._tone(60, 1.0, 'sine', 0.8, 30);
    const base = ours ? [523, 659, 784, 1046] : [392, 466, 523, 622];
    base.forEach((f, i) => this._tone(f, 0.7, 'sawtooth', 0.07, null, 0.25 + i * 0.09));
    this.crowdLevel(1);
    setTimeout(() => this.crowdLevel(0), 2600);
  }

  demolish() {
    if (!this.ctx) return;
    this._noiseBurst(0.9, 250, 0.6, 0.8, 'lowpass');
    this._tone(110, 0.5, 'sawtooth', 0.25, 35);
  }

  whistle() {
    if (!this.ctx) return;
    this._tone(2400, 0.25, 'sine', 0.15, 2600);
    this._tone(2400, 0.6, 'sine', 0.15, 2550, 0.32);
  }

  click() { if (this.ctx) this._tone(1200, 0.05, 'triangle', 0.08); }
}
