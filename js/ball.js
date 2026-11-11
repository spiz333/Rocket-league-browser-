import * as THREE from '../vendor/three.module.min.js';
import { BALL, WORLD } from './config.js';
import { sdf, sdfNormal } from './sdf.js';

const _n = new THREE.Vector3();
const _vt = new THREE.Vector3();
const _spin = new THREE.Vector3();
const _slip = new THREE.Vector3();
const _roll = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _axis = new THREE.Vector3();

export class Ball {
  constructor() {
    this.pos = new THREE.Vector3(0, BALL.R, 0);
    this.vel = new THREE.Vector3();
    this.angVel = new THREE.Vector3();
    this.quat = new THREE.Quaternion();
    this.hidden = false;
    this.touchedGround = false;
    this.renderPos = new THREE.Vector3(0, BALL.R, 0);
    this.renderQuat = new THREE.Quaternion();
  }

  reset() {
    this.pos.set(0, BALL.R, 0);
    this.vel.set(0, 0, 0);
    this.angVel.set(0, 0, 0);
    this.hidden = false;
    this.snapPrev();
  }

  savePrev() {
    if (!this.prevPos) { this.prevPos = new THREE.Vector3(); this.prevQuat = new THREE.Quaternion(); }
    this.prevPos.copy(this.pos);
    this.prevQuat.copy(this.quat);
  }
  snapPrev() { this.savePrev(); }

  copyFrom(b) {
    this.pos.copy(b.pos);
    this.vel.copy(b.vel);
    this.angVel.copy(b.angVel);
  }
}

// Advances a ball-like object ({pos, vel, angVel, quat?}) by dt.
// Returns the impact speed of a wall bounce (0 if none).
export function stepBall(b, dt, integrateRotation = true) {
  b.vel.y -= WORLD.gravity * dt;
  b.vel.multiplyScalar(1 - BALL.DRAG * dt);
  const sp = b.vel.length();
  if (sp > BALL.MAX_SPEED) b.vel.multiplyScalar(BALL.MAX_SPEED / sp);
  b.pos.addScaledVector(b.vel, dt);

  let impact = 0;
  const R = BALL.R;
  b.touchedGround = false;
  const d = sdf(b.pos.x, b.pos.y, b.pos.z);
  if (d < R) {
    sdfNormal(b.pos.x, b.pos.y, b.pos.z, _n);
    b.pos.addScaledVector(_n, R - d);
    const vn = b.vel.dot(_n);
    if (_n.y > 0.7) b.touchedGround = true;
    if (vn < 0) {
      impact = -vn;
      _vt.copy(b.vel).addScaledVector(_n, -vn);
      // velocity of the contact point caused by spin: w x (-R n)
      _spin.crossVectors(b.angVel, _n).multiplyScalar(-R);
      _slip.copy(_vt).add(_spin);
      const slipLen = _slip.length();
      if (slipLen > 1e-4) {
        const f = Math.min(1, (BALL.SURFACE_FRICTION * impact * (1 + BALL.RESTITUTION)) / slipLen);
        _vt.addScaledVector(_slip, -f * 0.45);
      }
      const e = impact < 1.2 * Math.sqrt(WORLD.gravity / 6.5) ? 0 : BALL.RESTITUTION; // kill micro bounces so it can roll
      b.vel.copy(_vt).addScaledVector(_n, impact * e);
      // spin tends towards rolling without slipping
      _roll.crossVectors(_n, _vt).multiplyScalar(1 / R);
      b.angVel.lerp(_roll, impact > 1.2 ? 0.6 : 0.25);
    }
  }

  const w = b.angVel.length();
  if (w > 14) b.angVel.multiplyScalar(14 / w);

  if (integrateRotation && b.quat && w > 1e-4) {
    _axis.copy(b.angVel).multiplyScalar(1 / w);
    _q.setFromAxisAngle(_axis, w * dt);
    b.quat.premultiply(_q).normalize(); // without this rounding errors slowly stretch the ball
  }
  return impact;
}

// Lightweight simulator used for AI and shot prediction.
export class BallPredictor {
  constructor(samples = 100, sampleDt = 1 / 30) {
    this.samples = [];
    this.sampleDt = sampleDt;
    for (let i = 0; i < samples; i++) {
      this.samples.push({ t: 0, pos: new THREE.Vector3(), vel: new THREE.Vector3() });
    }
    this.sim = { pos: new THREE.Vector3(), vel: new THREE.Vector3(), angVel: new THREE.Vector3(), quat: null, touchedGround: false };
  }

  run(ball) {
    const s = this.sim;
    s.pos.copy(ball.pos);
    s.vel.copy(ball.vel);
    s.angVel.copy(ball.angVel);
    const sub = 2;
    const h = this.sampleDt / sub;
    for (let i = 0; i < this.samples.length; i++) {
      for (let k = 0; k < sub; k++) stepBall(s, h, false);
      const smp = this.samples[i];
      smp.t = (i + 1) * this.sampleDt;
      smp.pos.copy(s.pos);
      smp.vel.copy(s.vel);
    }
    return this.samples;
  }
}
