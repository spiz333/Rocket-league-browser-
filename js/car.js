import * as THREE from '../vendor/three.module.min.js';
import { CAR, GRAVITY } from './config.js';
import { sdf, sdfNormal } from './sdf.js';

const _fwd = new THREE.Vector3();
const _up = new THREE.Vector3();
const _left = new THREE.Vector3();
const _n = new THREE.Vector3();
const _t = new THREE.Vector3();
const _lt = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _qi = new THREE.Quaternion();
const _v = new THREE.Vector3();
const _w = new THREE.Vector3();
const _c = new THREE.Vector3();
const _r = new THREE.Vector3();
const _cn = new THREE.Vector3();
const _id = new THREE.Quaternion();
const Y = new THREE.Vector3(0, 1, 0);
const _m = new THREE.Matrix4();
const RIGHT_TIME = 0.55;

const CURVE_S = [0, 5, 10, 15, 17.5, 23];
const CURVE_K = [0.69, 0.398, 0.235, 0.1375, 0.11, 0.088];
function curvature(s) {
  if (s >= CURVE_S[CURVE_S.length - 1]) return CURVE_K[CURVE_K.length - 1];
  for (let i = 1; i < CURVE_S.length; i++) {
    if (s < CURVE_S[i]) {
      const t = (s - CURVE_S[i - 1]) / (CURVE_S[i] - CURVE_S[i - 1]);
      return CURVE_K[i - 1] + (CURVE_K[i] - CURVE_K[i - 1]) * t;
    }
  }
  return CURVE_K[0];
}

const CORNERS = [];
for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) {
  CORNERS.push(new THREE.Vector3(sx * CAR.HX, sy * CAR.HY, sz * CAR.HZ + CAR.OFFSET_Z));
}

export function emptyControls() {
  return { throttle: 0, steer: 0, pitch: 0, yaw: 0, roll: 0, jump: false, boost: false, drift: false };
}

let carId = 0;

export class Car {
  constructor(team, name, opts = {}) {
    this.id = carId++;
    this.team = team;
    this.name = name;
    this.isPlayer = !!opts.isPlayer;
    this.body = opts.body || 0;
    this.paint = opts.paint ?? null;
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.quat = new THREE.Quaternion();
    this.angVel = new THREE.Vector3();
    this.normal = new THREE.Vector3(0, 1, 0);
    this.controls = emptyControls();
    this.stats = { goals: 0, assists: 0, saves: 0, shots: 0, points: 0, demos: 0 };
    this.resetState();
    this.events = null; // callback hooks set by game
  }

  resetState() {
    this.vel.set(0, 0, 0);
    this.angVel.set(0, 0, 0);
    this.boost = 33;
    this.onGround = true;
    this.jumped = false;
    this.doubleJumped = false;
    this.sinceJump = 0;
    this.jumpHold = 0;
    this.groundLock = 0;
    this.dodging = 0;
    this.dodgeF = 0;
    this.dodgeS = 0;
    this.prevJump = false;
    this.boosting = false;
    this.supersonic = false;
    this.demolished = false;
    this.respawnTimer = 0;
    this.turtleTime = 0;
    this.lastHitTime = -10;
    this.surfaceContact = false;
    this.wheelSpin = 0;
    this.steerVis = 0;
    this.unlimitedBoost = false;
    this.assist = this.assist ?? true;
    this.righting = 0;
    this.rightFrom = this.rightFrom || new THREE.Quaternion();
    this.rightTo = this.rightTo || new THREE.Quaternion();
    this.dodgeT = 0;
    this.dodgeFrom = this.dodgeFrom || new THREE.Quaternion();
    this.dodgeAxis = this.dodgeAxis || new THREE.Vector3(1, 0, 0);
  }

  place(x, z, yaw) {
    this.resetState();
    this.pos.set(x, CAR.RIDE, z);
    this.quat.setFromAxisAngle(Y, yaw);
    this.normal.set(0, 1, 0);
  }

  forward(out) { return out.set(0, 0, 1).applyQuaternion(this.quat); }
  up(out) { return out.set(0, 1, 0).applyQuaternion(this.quat); }
  left(out) { return out.set(1, 0, 0).applyQuaternion(this.quat); }

  speed() { return this.vel.length(); }

  step(dt, now) {
    if (this.demolished) return;
    const c = this.controls;
    const fwd = this.forward(_fwd);
    const up = this.up(_up);
    const jumpPressed = c.jump && !this.prevJump;
    this.prevJump = c.jump;

    this.boosting = c.boost && (this.boost > 0 || this.unlimitedBoost);
    if (this.boosting && !this.unlimitedBoost) this.boost = Math.max(0, this.boost - CAR.BOOST_USE * dt);

    if (this.groundLock > 0) this.groundLock -= dt;

    // ---- ground detection
    let grounded = false;
    const d = sdf(this.pos.x, this.pos.y, this.pos.z);
    const midFlip = this.dodging > 0 && this.dodgeT / CAR.DODGE_TIME < 0.8;
    if (this.groundLock <= 0 && !midFlip && d < CAR.RIDE + 0.22) {
      sdfNormal(this.pos.x, this.pos.y, this.pos.z, _n);
      if (up.dot(_n) > 0.55 && this.vel.dot(_n) < 2.5) grounded = true;
    }

    if (grounded) {
      if (!this.onGround) {
        this.jumped = false;
        this.doubleJumped = false;
        this.dodging = 0;
        this.dodgeT = 0;
        if (this.events && this.events.land) this.events.land(this);
      }
      this.onGround = true;
      this.turtleTime = 0;
      this.righting = 0;
      this.normal.copy(_n);
      const n = _n;

      // align the car with the surface
      _q.setFromUnitVectors(up, n);
      _qi.copy(_id).slerp(_q, Math.min(1, 16 * dt));
      this.quat.premultiply(_qi).normalize();

      // suspension: keep at ride height
      const holdable = (-GRAVITY * n.y - (n.y < 0.95 ? CAR.STICKY : 0)) <= 0;
      if (d < CAR.RIDE) this.pos.addScaledVector(n, CAR.RIDE - d);
      else if (holdable) this.pos.addScaledVector(n, (CAR.RIDE - d) * Math.min(1, 25 * dt));

      // gravity + sticky force
      this.vel.y -= GRAVITY * dt;
      if (n.y < 0.95) this.vel.addScaledVector(n, -CAR.STICKY * dt);
      let vn = this.vel.dot(n);
      if (vn < 0 || holdable) { this.vel.addScaledVector(n, -vn); vn = 0; }

      // tangent frame
      this.forward(fwd);
      _t.copy(fwd).addScaledVector(n, -fwd.dot(n)).normalize();
      _lt.crossVectors(n, _t); // left
      const spd = this.vel.dot(_t);

      let throttle = c.throttle;
      if (this.boosting) throttle = 1;
      let a = 0;
      if (throttle !== 0 && Math.sign(throttle) !== Math.sign(spd) && Math.abs(spd) > 0.25) {
        a = Math.sign(throttle) * CAR.BRAKE * Math.abs(throttle);
        if (Math.abs(a * dt) > Math.abs(spd)) a = -spd / dt;
      } else if (throttle !== 0) {
        const s = Math.abs(spd);
        a = s < CAR.MAX_THROTTLE_SPEED ? throttle * CAR.THROTTLE_ACCEL * (1 - 0.9 * s / CAR.MAX_THROTTLE_SPEED) : 0;
      } else if (spd !== 0) {
        const dec = Math.min(CAR.COAST * dt, Math.abs(spd));
        a = -Math.sign(spd) * dec / dt;
      }
      if (this.boosting) a += CAR.BOOST_ACCEL;
      this.vel.addScaledVector(_t, a * dt);

      // steering
      const k = curvature(Math.abs(spd)) * (c.drift ? 1.3 : 1);
      const yawRate = -c.steer * spd * k;
      _q.setFromAxisAngle(n, yawRate * dt);
      this.quat.premultiply(_q).normalize();
      this.angVel.copy(n).multiplyScalar(yawRate);

      // lateral grip
      const lat = this.vel.dot(_lt);
      const grip = c.drift ? 1.8 : 13;
      this.vel.addScaledVector(_lt, -lat * Math.min(1, grip * dt));

      this.wheelSpin += spd * dt / 0.18;
      this.sinceJump = 0;

      if (jumpPressed) {
        this.vel.addScaledVector(n, CAR.JUMP_IMPULSE);
        this.jumped = true;
        this.doubleJumped = false;
        this.jumpHold = CAR.JUMP_HOLD_TIME;
        this.groundLock = 0.12;
        this.onGround = false;
        this.sinceJump = 0;
        if (this.events && this.events.jump) this.events.jump(this);
      }
    } else {
      if (this.onGround) {
        // drove off a surface without jumping: still allow a flip / double jump
        this.onGround = false;
        this.jumped = true;
        this.sinceJump = 0.2;
      }
      const flipLift = this.dodging > 0 && this.dodgeT < 0.35 ? 0.35 : 1;
      this.vel.y -= GRAVITY * dt * flipLift;
      this.sinceJump += dt;

      if (this.jumpHold > 0) {
        if (c.jump) this.vel.addScaledVector(up, CAR.JUMP_HOLD_ACCEL * dt);
        else this.jumpHold = 0;
        this.jumpHold -= dt;
      }

      if (jumpPressed && !this.doubleJumped && this.sinceJump < CAR.DOUBLE_JUMP_WINDOW && this.dodging <= 0) {
        this.doubleJumped = true;
        const f = c.fwd !== undefined ? c.fwd : c.pitch, s = c.steer;
        const mag = Math.hypot(f, s);
        if (mag > 0.5) this.startDodge(f / mag, s / mag);
        else {
          this.vel.addScaledVector(up, CAR.JUMP_IMPULSE);
          if (this.events && this.events.jump) this.events.jump(this);
        }
      }

      // rotation
      _qi.copy(this.quat).invert();
      _w.copy(this.angVel).applyQuaternion(_qi);
      if (this.righting > 0) {
        this.righting -= dt;
        const k = 1 - Math.max(0, this.righting) / RIGHT_TIME;
        this.quat.slerpQuaternions(this.rightFrom, this.rightTo, k * k * (3 - 2 * k));
        _w.set(0, 0, 0);
      } else if (this.dodging > 0) {
        // scripted flip: exactly one full turn around the dodge axis, then back to the start attitude
        this.dodgeT += dt;
        const T = CAR.DODGE_TIME;
        const k = Math.min(1, this.dodgeT / T);
        const ease = (x) => 1 - Math.pow(1 - x, 1.7);
        const ang = Math.PI * 2 * ease(k);
        if (k >= 1) {
          this.quat.copy(this.dodgeFrom);
          this.dodging = 0;
          _w.set(0, 0, 0);
        } else {
          _q.setFromAxisAngle(this.dodgeAxis, ang);
          this.quat.copy(this.dodgeFrom).multiply(_q);
          const rate = (ang - Math.PI * 2 * ease(Math.max(0, k - dt / T))) / dt;
          _w.copy(this.dodgeAxis).multiplyScalar(rate);
          this.dodging = T - this.dodgeT;
        }
        this.angVel.copy(_w).applyQuaternion(this.quat);
        _w.set(0, 0, 0); // orientation already set: skip integration below
      } else {
        const roll = c.roll !== 0 ? c.roll : (c.drift ? c.yaw : 0);
        const yaw = c.drift ? 0 : c.yaw;
        const resp = Math.min(1, 9 * dt);
        const damp = Math.min(1, 3.2 * dt);
        _w.x = c.pitch !== 0 ? _w.x + (c.pitch * CAR.AIR_PITCH - _w.x) * resp : _w.x * (1 - damp);
        _w.y = yaw !== 0 ? _w.y + (-yaw * CAR.AIR_YAW - _w.y) * resp : _w.y * (1 - damp);
        _w.z = roll !== 0 ? _w.z + (roll * CAR.AIR_ROLL - _w.z) * resp : _w.z * (1 - damp * 1.4);
      }
      const scripted = this.dodging > 0;
      if (!scripted) this.angVel.copy(_w).applyQuaternion(this.quat);
      const wl = this.angVel.length();
      if (wl > CAR.MAX_ANG && !scripted) this.angVel.multiplyScalar(CAR.MAX_ANG / wl);
      const w = scripted ? 0 : this.angVel.length();
      // landing assist: falling towards a surface without stick input -> gently turn wheels down
      if (this.assist && this.dodging <= 0 && this.righting <= 0 && c.pitch === 0 && c.roll === 0 && !c.drift && this.vel.y < 0) {
        const dd = sdf(this.pos.x, this.pos.y, this.pos.z);
        if (dd < 3.2) {
          sdfNormal(this.pos.x, this.pos.y, this.pos.z, _n);
          this.up(_up);
          _q.setFromUnitVectors(_up, _n);
          _qi.copy(_id).slerp(_q, Math.min(1, 5 * dt));
          this.quat.premultiply(_qi).normalize();
        }
      }
      if (w > 1e-5) {
        _v.copy(this.angVel).multiplyScalar(1 / w);
        _q.setFromAxisAngle(_v, w * dt);
        this.quat.premultiply(_q).normalize();
      }

      if (this.boosting) {
        this.forward(fwd);
        this.vel.addScaledVector(fwd, CAR.BOOST_ACCEL * dt);
      }
      this.wheelSpin *= 0.995;
    }

    // speed cap + integrate
    const sp = this.vel.length();
    if (sp > CAR.MAX_SPEED) this.vel.multiplyScalar(CAR.MAX_SPEED / sp);
    this.supersonic = sp > CAR.SUPERSONIC || (this.supersonic && sp > CAR.SUPERSONIC - 0.8);
    this.pos.addScaledVector(this.vel, dt);

    this.collideArena(dt, this.onGround);
    if (this.onGround) this.surfaceContact = true;
  }

  startDodge(f, s) {
    this.dodging = CAR.DODGE_TIME;
    this.dodgeF = f;
    this.dodgeS = s;
    const fwd = this.forward(_fwd);
    fwd.y = 0;
    if (fwd.lengthSq() < 1e-4) fwd.set(0, 0, 1);
    fwd.normalize();
    _left.set(fwd.z, 0, -fwd.x); // left of horizontal forward
    const spd = this.vel.length();
    if (this.vel.y < 0) this.vel.y = 0;
    else this.vel.y *= 0.65;
    this.dodgeT = 0;
    this.dodgeFrom.copy(this.quat);
    this.dodgeAxis.set(f, 0, s).normalize();
    this.angVel.set(0, 0, 0);
    const fi = f * (f < 0 ? CAR.DODGE_IMPULSE * 1.07 : CAR.DODGE_IMPULSE);
    const si = s * CAR.DODGE_IMPULSE * (1 + 0.9 * spd / CAR.MAX_SPEED);
    this.vel.addScaledVector(fwd, fi).addScaledVector(_left, -si);
    if (this.events && this.events.dodge) this.events.dodge(this);
  }

  collideArena(dt, grounded) {
    let maxPen = 0;
    let contacts = 0;
    _cn.set(0, 0, 0);
    _r.set(0, 0, 0);
    for (let i = 0; i < CORNERS.length; i++) {
      _c.copy(CORNERS[i]).applyQuaternion(this.quat).add(this.pos);
      const d = sdf(_c.x, _c.y, _c.z);
      if (d < 0.03) contacts++;
      if (d < 0) {
        sdfNormal(_c.x, _c.y, _c.z, _n);
        _cn.addScaledVector(_n, -d);
        _r.addScaledVector(_c.sub(this.pos), -d);
        if (-d > maxPen) maxPen = -d;
      }
    }
    this.surfaceContact = contacts > 0;
    if (maxPen > 0) {
      const wsum = _cn.length();
      _r.multiplyScalar(1 / Math.max(1e-6, wsum));
      _cn.normalize();
      this.pos.addScaledVector(_cn, maxPen);
      const vn = this.vel.dot(_cn);
      if (vn < 0) {
        if (grounded) {
          this.vel.addScaledVector(_cn, -vn);
        } else {
          this.vel.addScaledVector(_cn, -vn * 1.1);
          // friction on the tangential part
          _v.copy(this.vel).addScaledVector(_cn, -this.vel.dot(_cn));
          this.vel.addScaledVector(_v, -Math.min(1, 0.25 * -vn / Math.max(0.5, _v.length()) + 3 * dt));
          // tipping torque around the contact (zero for flat landings)
          if (this.dodging <= 0 && this.righting <= 0) {
            _w.crossVectors(_r, _cn).multiplyScalar(-vn * 1.4);
            this.angVel.multiplyScalar(0.75).add(_w);
          }
          if (this.events && this.events.thud && -vn > 3) this.events.thud(this, -vn);
        }
      }
    }
    // stuck on the roof or side: auto-right
    if (this.surfaceContact && !grounded && this.righting <= 0) {
      this.up(_up);
      sdfNormal(this.pos.x, this.pos.y, this.pos.z, _n);
      if (_up.dot(_n) < 0.5 && this.vel.lengthSq() < 60) {
        this.turtleTime += dt;
        if (this.turtleTime > (this.controls.jump ? 0.08 : 0.3)) {
          this.turtleTime = 0;
          // target: wheels on the surface, keep the heading
          this.forward(_t).addScaledVector(_n, -_t.dot(_n));
          if (_t.lengthSq() < 1e-4) _t.set(_n.y, -_n.x, 0).cross(_n);
          _t.normalize();
          _lt.crossVectors(_n, _t);
          _m.makeBasis(_lt, _n, _t);
          this.rightFrom.copy(this.quat);
          this.rightTo.setFromRotationMatrix(_m);
          this.righting = RIGHT_TIME;
          this.angVel.set(0, 0, 0);
          this.vel.addScaledVector(_n, 3.2);
          this.jumped = true;
          this.doubleJumped = true;
          this.groundLock = 0.15;
        }
      } else this.turtleTime = 0;
    }
  }

  // ---- network state (full state so guests can re-simulate their own car)
  netState() {
    const r = (v) => Math.round(v * 1000) / 1000;
    const f = (this.onGround ? 1 : 0) | (this.jumped ? 2 : 0) | (this.doubleJumped ? 4 : 0) | (this.boosting ? 8 : 0)
      | (this.supersonic ? 16 : 0) | (this.demolished ? 32 : 0) | (this.prevJump ? 64 : 0) | (this.surfaceContact ? 128 : 0);
    return [
      r(this.pos.x), r(this.pos.y), r(this.pos.z),
      r(this.quat.x), r(this.quat.y), r(this.quat.z), r(this.quat.w),
      r(this.vel.x), r(this.vel.y), r(this.vel.z),
      r(this.angVel.x), r(this.angVel.y), r(this.angVel.z),
      r(this.boost), f, r(this.controls.steer),
      r(this.sinceJump), r(this.jumpHold), r(this.groundLock),
      r(this.dodging), r(this.dodgeT), r(this.dodgeAxis.x), r(this.dodgeAxis.z),
      r(this.dodgeFrom.x), r(this.dodgeFrom.y), r(this.dodgeFrom.z), r(this.dodgeFrom.w),
      r(this.righting), r(this.normal.x), r(this.normal.y), r(this.normal.z),
      r(this.respawnTimer), r(this.turtleTime),
    ];
  }

  applyNetState(a) {
    this.pos.set(a[0], a[1], a[2]);
    this.quat.set(a[3], a[4], a[5], a[6]).normalize();
    this.vel.set(a[7], a[8], a[9]);
    this.angVel.set(a[10], a[11], a[12]);
    this.boost = a[13];
    const f = a[14];
    this.onGround = !!(f & 1); this.jumped = !!(f & 2); this.doubleJumped = !!(f & 4);
    this.boosting = !!(f & 8); this.supersonic = !!(f & 16); this.demolished = !!(f & 32);
    this.prevJump = !!(f & 64); this.surfaceContact = !!(f & 128);
    this.netSteer = a[15];
    this.sinceJump = a[16]; this.jumpHold = a[17]; this.groundLock = a[18];
    this.dodging = a[19]; this.dodgeT = a[20];
    this.dodgeAxis.set(a[21], 0, a[22]);
    if (this.dodgeAxis.lengthSq() > 1e-6) this.dodgeAxis.normalize(); else this.dodgeAxis.set(1, 0, 0);
    this.dodgeFrom.set(a[23], a[24], a[25], a[26]).normalize();
    this.righting = a[27];
    this.normal.set(a[28], a[29], a[30]);
    this.respawnTimer = a[31];
    this.turtleTime = a[32];
  }

  // world-space corner positions of the hitbox (for debug / effects)
  hitboxCenter(out) {
    return out.set(0, 0, CAR.OFFSET_Z).applyQuaternion(this.quat).add(this.pos);
  }
}

export { curvature };
