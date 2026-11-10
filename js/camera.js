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
const UP = new THREE.Vector3(0, 1, 0);
const _t1 = new THREE.Vector3();
const _t2 = new THREE.Vector3();

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
    this.push = new THREE.Vector3();
    this.wallBlend = 0;
    this.angle = -3;       // extra tilt in car cam (degrees)
    this.stiffness = 0.5;  // 0 = loose, 1 = locked to the car
    this.swivel = 4.5;     // max turn speed of the camera (rad/s)
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

  shake(a) { this.shakeAmt = Math.max(this.shakeAmt, a * (this.shakeScale ?? 1)); }
  snap() { this._snap = true; }

  follow(car, carPos, ballPos, dt) {
    this.time += dt;
    const onWall = car.onGround ? 1 - THREE.MathUtils.smoothstep(car.normal.y, 0.35, 0.85) : 0;
    // ---- desired heading
    car.forward(_f);
    const vel = car.vel;
    const vh = Math.hypot(vel.x, vel.z);
    if ((!car.onGround || onWall > 0.3) && vh > 3) _d.set(vel.x, 0, vel.z);
    else _d.set(_f.x, 0, _f.z);
    // on a wall the car can point straight up: keep the old heading then
    const carYaw = _d.lengthSq() > 0.09 ? yawOf(_d) : this.yaw;
    const dx = ballPos.x - carPos.x, dz = ballPos.z - carPos.z;
    const flatDist = Math.hypot(dx, dz);
    let want = carYaw;
    if (this.ballCam && flatDist > 0.5) {
      const w = THREE.MathUtils.smoothstep(flatDist, 2.5, 8);
      want = carYaw + wrap(Math.atan2(dx, dz) - carYaw) * w;
    }
    if (this._snap) this.yaw = want;
    else {
      const diff = wrap(want - this.yaw);
      const maxTurn = this.swivel * dt;
      const step = diff * (1 - Math.exp(-(4 + this.stiffness * 8) * dt));
      this.yaw = wrap(this.yaw + THREE.MathUtils.clamp(step, -maxTurn, maxTurn));
    }
    const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);

    // ---- camera offset relative to the car
    _o.set(-fx * this.distance, this.height, -fz * this.distance);
    if (onWall > 0) {
      // on walls: stand off the surface and trail the car along the wall
      _t1.copy(_f).addScaledVector(car.normal, -_f.dot(car.normal));
      if (_t1.lengthSq() < 1e-3) _t1.set(0, 1, 0).addScaledVector(car.normal, -car.normal.y);
      _t1.normalize();
      _t2.copy(car.normal).multiplyScalar(this.distance * 0.75 + 0.5)
        .addScaledVector(_t1, -this.distance * 0.6)
        .addScaledVector(UP, this.height * 0.5);
      _o.lerp(_t2, onWall);
    }
    const k = this._snap ? 1 : 1 - Math.exp(-(6 + this.stiffness * 16) * dt);
    this.offset.lerp(_o, k);
    _p.copy(carPos).add(this.offset);

    // ---- keep the camera inside the arena by sliding it along walls (never into the car)
    _l.copy(_p);
    for (let i = 0; i < 3; i++) {
      const s = sdf(_l.x, _l.y, _l.z);
      if (s >= 0.8) break;
      sdfNormal(_l.x, _l.y, _l.z, _n);
      _l.addScaledVector(_n, 0.8 - s);
    }
    _l.sub(_p);
    this.push.lerp(_l, this._snap ? 1 : 1 - Math.exp(-12 * dt));
    _p.add(this.push);
    // hard guarantee: never inside a wall
    const s2 = sdf(_p.x, _p.y, _p.z);
    if (s2 < 0.35) { sdfNormal(_p.x, _p.y, _p.z, _n); _p.addScaledVector(_n, 0.35 - s2); }
    // don't sit on top of the car
    _l.copy(_p).sub(carPos);
    const dCar = _l.length();
    if (dCar < 1.8) {
      if (dCar < 1e-3) _l.copy(car.onGround ? car.normal : UP);
      _l.normalize();
      _p.copy(carPos).addScaledVector(_l, 1.8);
      _p.y = Math.max(_p.y, carPos.y + 0.8);
    }

    // ---- look target
    const tilt = THREE.MathUtils.degToRad(this.angle);
    if (this.ballCam) {
      const toCarH = Math.hypot(carPos.x - _p.x, carPos.z - _p.z);
      const carPitch = Math.atan2(carPos.y - _p.y + 0.15, Math.max(0.5, toCarH));
      const lookH = Math.hypot(ballPos.x - _p.x, ballPos.z - _p.z);
      let pitch = Math.atan2(ballPos.y - _p.y, Math.max(0.5, lookH));
      const halfV = THREE.MathUtils.degToRad(this.camera.fov) / 2;
      pitch = THREE.MathUtils.clamp(pitch, carPitch - halfV * 0.3, carPitch + halfV * 0.8);
      this.pitch = this._snap ? pitch : this.pitch + (pitch - this.pitch) * (1 - Math.exp(-8 * dt));
    } else {
      const target = Math.atan2(carPos.y + 0.9 - _p.y, 4 + this.distance) + tilt;
      this.pitch = this._snap ? target : this.pitch + (target - this.pitch) * (1 - Math.exp(-10 * dt));
    }
    _d.set(fx * Math.cos(this.pitch), Math.sin(this.pitch), fz * Math.cos(this.pitch));
    // on walls the camera sits beside the car, so aim at a point just past the car instead
    // ...and do the same whenever a wall has pushed the camera far from where it wanted to be
    const aim = Math.max(onWall, Math.min(1, this.push.length() / 1.2));
    this.wallBlend += (aim - this.wallBlend) * (1 - Math.exp(-6 * dt));
    if (this.wallBlend > 0.01) {
      if (this.ballCam) {
        _l.copy(ballPos).sub(carPos);
        const bl = _l.length();
        _l.multiplyScalar(bl > 1e-3 ? Math.min(bl, 2.5) / bl : 0).add(carPos); // keep the car centred, lean towards the ball
      } else _l.copy(carPos).addScaledVector(_f, 4);
      _l.sub(_p).normalize();
      _d.lerp(_l, this.wallBlend).normalize();
    }
    _l.copy(_p).addScaledVector(_d, 10);

    this.pos.copy(_p);
    this.look.copy(_l);

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
