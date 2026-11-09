// Ring buffer of transforms for instant goal replays.
import * as THREE from '../vendor/three.module.min.js';
const STRIDE_BALL = 8;
const STRIDE_CAR = 9;

export class Recorder {
  constructor(seconds = 7, rate = 60) {
    this.max = Math.ceil(seconds * rate);
    this.minDt = 1 / rate;
    this.frames = [];
    this.lastT = -Infinity;
  }

  clear() {
    this.frames.length = 0;
    this.lastT = -Infinity;
  }

  record(t, ball, cars) {
    if (t - this.lastT < this.minDt * 0.9) return;
    this.lastT = t;
    let f;
    if (this.frames.length >= this.max) f = this.frames.shift();
    const size = STRIDE_BALL + cars.length * STRIDE_CAR;
    if (!f || f.data.length !== size) f = { t: 0, data: new Float32Array(size) };
    f.t = t;
    const d = f.data;
    d[0] = ball.pos.x; d[1] = ball.pos.y; d[2] = ball.pos.z;
    d[3] = ball.quat.x; d[4] = ball.quat.y; d[5] = ball.quat.z; d[6] = ball.quat.w;
    d[7] = ball.hidden ? 1 : 0;
    for (let i = 0; i < cars.length; i++) {
      const c = cars[i], o = STRIDE_BALL + i * STRIDE_CAR;
      d[o] = c.pos.x; d[o + 1] = c.pos.y; d[o + 2] = c.pos.z;
      d[o + 3] = c.quat.x; d[o + 4] = c.quat.y; d[o + 5] = c.quat.z; d[o + 6] = c.quat.w;
      d[o + 7] = c.boosting ? 1 : 0;
      d[o + 8] = c.demolished ? 1 : 0;
    }
    this.frames.push(f);
  }

  get start() { return this.frames.length ? this.frames[0].t : 0; }
  get end() { return this.frames.length ? this.frames[this.frames.length - 1].t : 0; }

  // Applies the interpolated state at time t to the provided proxies.
  apply(t, ballProxy, carProxies) {
    const fr = this.frames;
    if (!fr.length) return;
    let i = 1;
    while (i < fr.length - 1 && fr[i].t < t) i++;
    const a = fr[Math.max(0, i - 1)], b = fr[i];
    const span = b.t - a.t;
    const k = span > 0 ? Math.min(1, Math.max(0, (t - a.t) / span)) : 0;
    const A = a.data, B = b.data;
    const lerp = (o) => A[o] + (B[o] - A[o]) * k;
    ballProxy.pos.set(lerp(0), lerp(1), lerp(2));
    ballProxy.quat.set(A[3], A[4], A[5], A[6]).slerp(_q2.set(B[3], B[4], B[5], B[6]), k);
    ballProxy.hidden = (k < 0.5 ? A[7] : B[7]) > 0.5;
    for (let c = 0; c < carProxies.length; c++) {
      const o = STRIDE_BALL + c * STRIDE_CAR;
      if (o + STRIDE_CAR > A.length) break;
      const p = carProxies[c];
      p.pos.set(lerp(o), lerp(o + 1), lerp(o + 2));
      p.quat.set(A[o + 3], A[o + 4], A[o + 5], A[o + 6]).slerp(_q2.set(B[o + 3], B[o + 4], B[o + 5], B[o + 6]), k);
      p.boosting = (k < 0.5 ? A[o + 7] : B[o + 7]) > 0.5;
      p.demolished = (k < 0.5 ? A[o + 8] : B[o + 8]) > 0.5;
    }
  }
}

const _q2 = new THREE.Quaternion();
