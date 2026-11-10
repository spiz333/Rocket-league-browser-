// Chase camera (ball cam / car cam) plus cinematic modes for menus and replays.
// The camera offset is smoothed relative to the car, so it never lags behind at speed,
// and its heading turns at a limited rate so ball cam can't whip around.
import * as THREE from '../vendor/three.module.min.js';
import { sdf, sdfNormal } from './sdf.js';

const _d = new THREE.Vector3();
const _p = new THREE.Vector3();
const _l = new THREE.Vector3();
const _n = new THREE.Vector3();
const _f = new THREE.Vector3();
const _o = new THREE.Vector3();

function yawOf(v) { return Math.atan2(v.x, v.z); }
function wrap(a) { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; }

export class CameraRig {
  constructor(camera) {
    this.camera = camera;
    this.pos = new THREE.Vector3(0, 10, -30);
    this.look = new THREE.Vector3();
    this.ballCam = true;
    this.distance = 4.6;
    this.height = 1.65;
    this.hFov = 100;
    this.baseFov = 70;
    this.speedFov = 0;
    this.shakeAmt = 0;
    this.time = 0;
    this.orbitAngle = 0;
    this.yaw = 0;
    this.pitch = 0.0;
    this.offset = new THREE.Vector3(0, 2, -4);
    this.lookOffset = new THREE.Vector3(0, 1, 6);
    this._snap = true;
  }

  setFov(aspect) {
    const h = THREE.MathUtils.degToRad(this.hFov);
    let v = 2 * Math.atan(Math.tan(h / 2) / aspect);
    v = THREE.MathUtils.clamp(v, THREE.MathUtils.degToRad(50), THREE.MathUtils.degToRad(95));
    this.baseFov = THREE.MathUtils.radToDeg(v);
    this.camera.fov = this.baseFov + this.speedFov;
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  shake(a) { this.shakeAmt = Math.max(this.shakeAmt, a); }
  snap() { this._snap = true; }

  follow(car, carPos, ballPos, dt) {
    this.time += dt;
    // ---- desired heading
    let want;
    const dx = ballPos.x - carPos.x, dz = ballPos.z - carPos.z;
    const flatDist = Math.hypot(dx, dz);
    car.forward(_f);
    const vel = car.vel;
    // car heading: forward on the ground, velocity in the air / on walls
    if (!car.onGround && vel.x * vel.x + vel.z * vel.z > 9) _d.set(vel.x, 0, vel.z);
    else if (car.onGround && car.normal.y < 0.7) _d.set(vel.x, 0, vel.z).lengthSq() > 4 ? _d.set(vel.x, 0, vel.z) : _d.set(_f.x, 0, _f.z);
    else _d.set(_f.x, 0, _f.z);
    if (_d.lengthSq() < 1e-4) _d.set(Math.sin(this.yaw), 0, Math.cos(this.yaw));
    const carYaw = yawOf(_d);
    if (this.ballCam && flatDist > 0.5) {
      const ballYaw = Math.atan2(dx, dz);
      // when the ball is almost on top of us, lean towards the car heading to avoid spinning
      const w = THREE.MathUtils.smoothstep(flatDist, 2.5, 8);
      want = carYaw + wrap(ballYaw - carYaw) * w;
    } else want = carYaw;

    if (this._snap) this.yaw = want;
    else {
      const diff = wrap(want - this.yaw);
      const maxTurn = (this.ballCam ? 4.2 : 6.5) * dt;
      const step = diff * (1 - Math.exp(-(this.ballCam ? 7 : 9) * dt));
      this.yaw = wrap(this.yaw + THREE.MathUtils.clamp(step, -maxTurn, maxTurn));
    }
    const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);

    // ---- camera offset relative to the car (smoothed in car-relative space)
    _o.set(-fx * this.distance, this.height, -fz * this.distance);
    // pull in when a wall is behind the car
    const sx = carPos.x, sy = carPos.y + 0.6, sz = carPos.z;
    let tMax = 1;
    for (let i = 1; i <= 10; i++) {
      const t = i / 10;
      if (sdf(sx + _o.x * t, sy + (_o.y - 0.6) * t, sz + _o.z * t) < 0.45) { tMax = (i - 1) / 10; break; }
    }
    if (tMax < 1) { _o.multiplyScalar(Math.max(0.25, tMax)); _o.y += (1 - tMax) * 1.4; }
    const k = this._snap ? 1 : 1 - Math.exp(-14 * dt);
    this.offset.lerp(_o, k);
    _p.copy(carPos).add(this.offset);
    const s = sdf(_p.x, _p.y, _p.z);
    if (s < 0.6) { sdfNormal(_p.x, _p.y, _p.z, _n); _p.addScaledVector(_n, 0.6 - s); }

    // ---- look target
    if (this.ballCam) {
      const toCarH = Math.hypot(carPos.x - _p.x, carPos.z - _p.z);
      const carPitch = Math.atan2(carPos.y - _p.y + 0.15, Math.max(0.5, toCarH));
      const lookH = Math.hypot(ballPos.x - _p.x, ballPos.z - _p.z);
      let pitch = Math.atan2(ballPos.y - _p.y, Math.max(0.5, lookH));
      const halfV = THREE.MathUtils.degToRad(this.camera.fov) / 2;
      pitch = THREE.MathUtils.clamp(pitch, carPitch - halfV * 0.3, carPitch + halfV * 0.8);
      this.pitch = this._snap ? pitch : this.pitch + (pitch - this.pitch) * (1 - Math.exp(-8 * dt));
    } else {
      const target = Math.atan2(carPos.y + 0.9 - _p.y, 4 + this.distance);
      this.pitch = this._snap ? target : this.pitch + (target - this.pitch) * (1 - Math.exp(-10 * dt));
    }
    _l.set(_p.x + fx * Math.cos(this.pitch) * 10, _p.y + Math.sin(this.pitch) * 10, _p.z + fz * Math.cos(this.pitch) * 10);

    this.pos.copy(_p);
    this.look.copy(_l);

    // a little extra field of view at high speed
    const sp = car.vel.length();
    const wantFov = THREE.MathUtils.clamp((sp - 12) / 11, 0, 1) * 7 + (car.boosting ? 2 : 0);
    this.speedFov += (wantFov - this.speedFov) * (1 - Math.exp(-3 * dt));
    this._snap = false;
    this.apply(dt);
  }

  cinematic(target, from, dt, rate = 3) {
    this.time += dt;
    this.pos.lerp(from, 1 - Math.exp(-rate * dt));
    this.look.lerp(target, 1 - Math.exp(-rate * 2 * dt));
    if (this._snap) { this.pos.copy(from); this.look.copy(target); this._snap = false; }
    this.speedFov *= Math.exp(-3 * dt);
    this.apply(dt);
  }

  orbit(center, dt, radius = 27, height = 11, speed = 0.06) {
    this.time += dt;
    this.orbitAngle += dt * speed;
    this.pos.set(Math.sin(this.orbitAngle) * radius + center.x * 0.3, height, Math.cos(this.orbitAngle) * radius * 1.15 + center.z * 0.3);
    this.look.lerp(_l.set(center.x * 0.6, 2, center.z * 0.6), 1 - Math.exp(-2 * dt));
    this.speedFov *= Math.exp(-3 * dt);
    this.apply(dt);
  }

  apply(dt) {
    this.camera.position.copy(this.pos);
    if (this.shakeAmt > 0.001) {
      const s = this.shakeAmt;
      this.camera.position.x += (Math.random() - 0.5) * s;
      this.camera.position.y += (Math.random() - 0.5) * s;
      this.camera.position.z += (Math.random() - 0.5) * s;
      this.shakeAmt *= Math.exp(-6 * dt);
    }
    this.camera.lookAt(this.look);
    const f = this.baseFov + this.speedFov;
    if (Math.abs(this.camera.fov - f) > 0.05) {
      this.camera.fov = f;
      this.camera.updateProjectionMatrix();
    }
  }
}
