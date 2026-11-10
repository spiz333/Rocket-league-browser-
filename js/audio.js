// Fully synthesized sound effects and procedurally generated (original) music.
const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);

export class Audio {
  constructor() {
    this.ctx = null;
    this.enabled = true;
    this.sfxVol = 0.8;
    this.musicVol = 0.5;
    this.engine = null;
    this.music = null;
    this.wantSong = null;
  }

  init() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = this.ctx = new AC();
    this.master = ctx.createGain();
    this.master.gain.value = this.enabled ? 1 : 0;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14; comp.ratio.value = 4;
    this.master.connect(comp);
    comp.connect(ctx.destination);
    this.sfx = ctx.createGain();
    this.sfx.gain.value = this.sfxVol;
    this.sfx.connect(this.master);
    this.musicBus = ctx.createGain();
    this.musicBus.gain.value = this.musicVol * 0.5;
    this.musicBus.connect(this.master);

    // shared noise buffer
    const len = ctx.sampleRate * 2;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;

    // engine: two detuned saws + sub through a soft clipper
    const o1 = ctx.createOscillator(); o1.type = 'sawtooth';
    const o2 = ctx.createOscillator(); o2.type = 'sawtooth'; o2.detune.value = 14;
    const o3 = ctx.createOscillator(); o3.type = 'square';
    const shaper = ctx.createWaveShaper();
    const curve = new Float32Array(256);
    for (let i = 0; i < 256; i++) { const x = i / 128 - 1; curve[i] = Math.tanh(x * 2.2); }
    shaper.curve = curve;
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 600; f.Q.value = 3;
    const g = ctx.createGain(); g.gain.value = 0;
    const sub = ctx.createGain(); sub.gain.value = 0.5;
    o1.connect(shaper); o2.connect(shaper); o3.connect(sub); sub.connect(shaper);
    shaper.connect(f); f.connect(g); g.connect(this.sfx);
    o1.start(); o2.start(); o3.start();
    this.engine = { o1, o2, o3, f, g };

    // boost: hiss + rumble
    const bn = ctx.createBufferSource(); bn.buffer = this.noise; bn.loop = true;
    const bf = ctx.createBiquadFilter(); bf.type = 'bandpass'; bf.frequency.value = 1600; bf.Q.value = 0.8;
    const rumble = ctx.createBiquadFilter(); rumble.type = 'lowpass'; rumble.frequency.value = 180;
    const bg = ctx.createGain(); bg.gain.value = 0;
    bn.connect(bf); bn.connect(rumble); bf.connect(bg); rumble.connect(bg); bg.connect(this.sfx);
    bn.start();
    this.boostSnd = { bf, bg, on: false };

    // crowd ambience
    const cn = ctx.createBufferSource(); cn.buffer = this.noise; cn.loop = true;
    const cf = ctx.createBiquadFilter(); cf.type = 'bandpass'; cf.frequency.value = 650; cf.Q.value = 0.35;
    const cg = ctx.createGain(); cg.gain.value = 0.03;
    cn.connect(cf); cf.connect(cg); cg.connect(this.sfx);
    cn.start();
    this.crowd = { cg, cf };

    this.music = new Music(ctx, this.musicBus, this.noise);
    if (this.wantSong) this.music.play(this.wantSong);
  }

  setEnabled(on) {
    this.enabled = on;
    if (this.master) this.master.gain.setTargetAtTime(on ? 1 : 0, this.ctx.currentTime, 0.05);
  }

  setVolumes(music, sfx) {
    this.musicVol = music; this.sfxVol = sfx;
    if (!this.ctx) return;
    this.sfx.gain.setTargetAtTime(sfx, this.ctx.currentTime, 0.05);
    this.musicBus.gain.setTargetAtTime(music * (this.inMatch ? 0.32 : 0.5), this.ctx.currentTime, 0.2);
  }

  playMusic(song) {
    this.wantSong = song;
    this.inMatch = song === 'match';
    if (!this.ctx) return;
    this.musicBus.gain.setTargetAtTime(this.musicVol * (this.inMatch ? 0.32 : 0.5), this.ctx.currentTime, 0.3);
    this.music.play(song);
  }

  updateEngine(speed, throttle, boosting, active) {
    if (!this.ctx || !this.engine) return;
    const t = this.ctx.currentTime;
    const e = this.engine;
    // gearbox: rpm climbs within each gear
    const gear = Math.min(4, Math.floor(speed / 5.8));
    const rpm = (speed - gear * 5.8) / 5.8;
    const base = 48 + gear * 9 + rpm * 70 + Math.abs(throttle) * 10;
    e.o1.frequency.setTargetAtTime(base, t, 0.04);
    e.o2.frequency.setTargetAtTime(base * 1.005, t, 0.04);
    e.o3.frequency.setTargetAtTime(base * 0.5, t, 0.04);
    e.f.frequency.setTargetAtTime(380 + speed * 55 + (boosting ? 500 : 0), t, 0.06);
    e.g.gain.setTargetAtTime(active ? 0.035 + Math.abs(throttle) * 0.03 + speed * 0.0016 : 0, t, 0.08);
    const b = this.boostSnd;
    b.bg.gain.setTargetAtTime(active && boosting ? 0.2 : 0, t, boosting ? 0.03 : 0.08);
    b.bf.frequency.setTargetAtTime(1300 + speed * 50, t, 0.1);
    if (active && boosting && !b.on) this._noiseBurst(0.35, 900, 0.7, 0.18, 'bandpass', 0, 2600);
    b.on = active && boosting;
  }

  crowdLevel(level) {
    if (!this.ctx) return;
    this.crowd.cg.gain.setTargetAtTime(0.03 + level * 0.25, this.ctx.currentTime, level > 0.3 ? 0.1 : 1.2);
  }

  _noiseBurst(dur, freq, q, gain, type = 'bandpass', delay = 0, sweepTo = null) {
    const ctx = this.ctx;
    const t = ctx.currentTime + delay;
    const s = ctx.createBufferSource(); s.buffer = this.noise;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(freq, t); f.Q.value = q;
    if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + Math.min(0.02, dur * 0.2));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(this.sfx);
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
    g.gain.exponentialRampToValueAtTime(gain, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.sfx);
    o.start(t); o.stop(t + dur + 0.05);
  }

  hit(strength, near = 1) {
    if (!this.ctx) return;
    const s = Math.min(1, strength / 25) * near;
    if (s < 0.02) return;
    this._tone(130 + s * 60, 0.22, 'sine', 0.7 * s, 38);              // body thump
    this._noiseBurst(0.09 + s * 0.1, 1100 + s * 1400, 1.4, 0.45 * s);  // knock
    this._tone(1700 + Math.random() * 300, 0.12, 'triangle', 0.06 * s, 1300); // metallic ping
  }

  bounce(strength, near = 1) {
    if (!this.ctx) return;
    const s = Math.min(1, strength / 20) * near;
    if (s < 0.05) return;
    this._tone(85, 0.18, 'sine', 0.38 * s, 42);
    this._noiseBurst(0.07, 520, 1, 0.12 * s);
  }

  jump() { if (this.ctx) { this._noiseBurst(0.22, 500, 1.2, 0.14, 'bandpass', 0, 2400); this._tone(180, 0.12, 'sine', 0.08, 320); } }
  dodge() { if (this.ctx) this._noiseBurst(0.38, 2600, 0.8, 0.16, 'bandpass', 0, 500); }
  land(s = 1) { if (this.ctx) { this._tone(70, 0.14, 'sine', 0.2 * s, 38); this._noiseBurst(0.08, 300, 1, 0.06 * s, 'lowpass'); } }

  pickup(big) {
    if (!this.ctx) return;
    if (big) [660, 880, 1320].forEach((f, i) => this._tone(f, 0.22, 'triangle', 0.12, f * 1.5, i * 0.05));
    else this._tone(980, 0.08, 'triangle', 0.09, 1400);
  }

  countdown(final) {
    if (!this.ctx) return;
    if (final) { this._tone(880, 0.7, 'square', 0.1); this._tone(1320, 0.7, 'sine', 0.1); this._tone(440, 0.7, 'sawtooth', 0.05); }
    else this._tone(440, 0.22, 'square', 0.09);
  }

  goal(ours) {
    if (!this.ctx) return;
    this._noiseBurst(1.8, 260, 0.5, 0.9, 'lowpass');                  // explosion
    this._tone(55, 1.1, 'sine', 0.8, 28);
    const horn = ours ? [57, 61, 64] : [57, 60, 63];                    // stadium horn chord
    horn.forEach((n) => { this._tone(midi(n), 1.3, 'sawtooth', 0.06, null, 0.15); this._tone(midi(n + 12), 1.3, 'square', 0.025, null, 0.15); });
    const fan = ours ? [72, 76, 79, 84] : [67, 70, 74, 79];
    fan.forEach((n, i) => this._tone(midi(n), 0.5, 'triangle', 0.08, null, 0.35 + i * 0.09));
    this.crowdLevel(1);
    setTimeout(() => this.crowdLevel(0), 3000);
    if (this.music) this.music.duck(2.5);
  }

  demolish() {
    if (!this.ctx) return;
    this._noiseBurst(1.0, 240, 0.6, 0.8, 'lowpass');
    this._tone(110, 0.55, 'sawtooth', 0.22, 32);
    this._noiseBurst(0.4, 3000, 1, 0.12, 'highpass', 0.05);
  }

  whistle() {
    if (!this.ctx) return;
    this._tone(2400, 0.25, 'sine', 0.15, 2600);
    this._tone(2400, 0.6, 'sine', 0.15, 2550, 0.32);
  }

  click() { if (this.ctx) this._tone(1300, 0.05, 'triangle', 0.07, 900); }
  hover() { if (this.ctx) this._tone(2200, 0.03, 'sine', 0.025); }
}

// ---------------- procedural music ----------------
// Two original loops (menu + match) built from simple chord progressions,
// synthesized drums, bass, pads and an arpeggio.
const SONGS = {
  menu: {
    bpm: 98,
    chords: [[50, 53, 57, 60], [46, 50, 53, 57], [41, 45, 48, 52], [48, 52, 55, 59]], // Dm9-ish, Bbmaj7, Fmaj7, Cmaj7
    kick: 'x...x.....x.x...', snare: '....x.......x...', hat: '..x...x...x...xx',
    arp: [0, 2, 1, 3, 2, 1, 3, 2], arpOct: 24, arpEvery: 2, bassPat: 'x..x..x.x..x.x..', padVol: 0.05, arpVol: 0.035,
  },
  match: {
    bpm: 124,
    chords: [[45, 48, 52, 55], [41, 45, 48, 52], [48, 52, 55, 59], [43, 47, 50, 55]], // Am7, Fmaj7, Cmaj7, G
    kick: 'x...x...x...x...', snare: '....x.......x..x', hat: 'x.xxx.xxx.xxx.xx',
    arp: [0, 1, 2, 3, 2, 1, 2, 3], arpOct: 24, arpEvery: 1, bassPat: 'x.x.xx.x.x.xx.x.', padVol: 0.035, arpVol: 0.028,
  },
};

class Music {
  constructor(ctx, out, noise) {
    this.ctx = ctx;
    this.out = ctx.createGain();
    this.out.connect(out);
    this.noise = noise;
    this.song = null;
    this.step = 0;
    this.nextTime = 0;
    this.timer = null;
    // gentle echo for the lead
    this.delay = ctx.createDelay(1);
    this.delay.delayTime.value = 0.36;
    const fb = ctx.createGain(); fb.gain.value = 0.3;
    this.delay.connect(fb); fb.connect(this.delay);
    this.delay.connect(this.out);
  }

  play(name) {
    const song = SONGS[name];
    if (!song || this.song === song) return;
    this.song = song;
    this.step = 0;
    this.nextTime = this.ctx.currentTime + 0.1;
    this.out.gain.cancelScheduledValues(this.ctx.currentTime);
    this.out.gain.setValueAtTime(0.0001, this.ctx.currentTime);
    this.out.gain.exponentialRampToValueAtTime(1, this.ctx.currentTime + 1.5);
    if (!this.timer) this.timer = setInterval(() => this.schedule(), 25);
  }

  duck(seconds) {
    const t = this.ctx.currentTime;
    this.out.gain.cancelScheduledValues(t);
    this.out.gain.setTargetAtTime(0.15, t, 0.1);
    this.out.gain.setTargetAtTime(1, t + seconds, 0.6);
  }

  schedule() {
    if (!this.song || this.ctx.state !== 'running') return;
    const spb = 60 / this.song.bpm / 4; // seconds per 16th
    while (this.nextTime < this.ctx.currentTime + 0.12) {
      this.playStep(this.step, this.nextTime, spb);
      this.nextTime += spb;
      this.step++;
    }
  }

  playStep(step, t, spb) {
    const s = this.song;
    const i = step % 16;
    const bar = Math.floor(step / 16) % s.chords.length;
    const chord = s.chords[bar];
    if (s.kick[i] === 'x') this.kick(t);
    if (s.snare[i] === 'x') this.snare(t);
    if (s.hat[i] === 'x') this.hat(t, i % 4 === 2 ? 0.05 : 0.025);
    if (s.bassPat[i] === 'x') this.bass(midi(chord[0] - 12 + (i === 14 ? 7 : 0)), t, spb * 1.6);
    if (i === 0) this.pad(chord, t, spb * 16, s.padVol);
    if (i % s.arpEvery === 0) {
      const k = s.arp[(i / s.arpEvery) % s.arp.length];
      const lift = (Math.floor(step / 64) % 2) * 12;
      this.pluck(midi(chord[k] + s.arpOct - 12 + lift), t, spb * 1.5, s.arpVol);
    }
  }

  env(g, t, a, peak, dur) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  }

  kick(t) {
    const o = this.ctx.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(140, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.18);
    const g = this.ctx.createGain(); this.env(g, t, 0.004, 0.5, 0.3);
    o.connect(g); g.connect(this.out); o.start(t); o.stop(t + 0.32);
  }

  snare(t) {
    const s = this.ctx.createBufferSource(); s.buffer = this.noise;
    const f = this.ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1800; f.Q.value = 0.6;
    const g = this.ctx.createGain(); this.env(g, t, 0.003, 0.22, 0.2);
    s.connect(f); f.connect(g); g.connect(this.out); s.start(t, Math.random()); s.stop(t + 0.22);
    const o = this.ctx.createOscillator(); o.type = 'triangle'; o.frequency.setValueAtTime(220, t); o.frequency.exponentialRampToValueAtTime(140, t + 0.1);
    const g2 = this.ctx.createGain(); this.env(g2, t, 0.003, 0.12, 0.12);
    o.connect(g2); g2.connect(this.out); o.start(t); o.stop(t + 0.14);
  }

  hat(t, v) {
    const s = this.ctx.createBufferSource(); s.buffer = this.noise;
    const f = this.ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 7500;
    const g = this.ctx.createGain(); this.env(g, t, 0.002, v, 0.05);
    s.connect(f); f.connect(g); g.connect(this.out); s.start(t, Math.random()); s.stop(t + 0.06);
  }

  bass(freq, t, dur) {
    const o = this.ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = freq;
    const f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.Q.value = 6;
    f.frequency.setValueAtTime(900, t); f.frequency.exponentialRampToValueAtTime(160, t + dur);
    const g = this.ctx.createGain(); this.env(g, t, 0.006, 0.16, dur);
    o.connect(f); f.connect(g); g.connect(this.out); o.start(t); o.stop(t + dur + 0.02);
  }

  pad(chord, t, dur, vol) {
    for (const n of chord) {
      for (const det of [-8, 8]) {
        const o = this.ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = midi(n); o.detune.value = det;
        const f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 900;
        const g = this.ctx.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.linearRampToValueAtTime(vol * 0.5, t + dur * 0.25);
        g.gain.linearRampToValueAtTime(0.0001, t + dur);
        o.connect(f); f.connect(g); g.connect(this.out); o.start(t); o.stop(t + dur + 0.05);
      }
    }
  }

  pluck(freq, t, dur, vol) {
    const o = this.ctx.createOscillator(); o.type = 'square'; o.frequency.value = freq;
    const f = this.ctx.createBiquadFilter(); f.type = 'lowpass';
    f.frequency.setValueAtTime(3200, t); f.frequency.exponentialRampToValueAtTime(500, t + dur);
    const g = this.ctx.createGain(); this.env(g, t, 0.004, vol, dur);
    o.connect(f); f.connect(g); g.connect(this.out); g.connect(this.delay);
    o.start(t); o.stop(t + dur + 0.02);
  }
}
