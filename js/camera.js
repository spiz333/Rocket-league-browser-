// Chase camera with ball-cam, plus cinematic modes for menus and replays.
import * as THREE from '../vendor/three.module.min.js';
import { sdf, sdfNormal } from './sdf.js';

const _d = new THREE.Vector3();
const _p = new THREE.Vector3();
const _l = new THREE.Vector3();
const _n = new THREE.Vector3();
const _f = new THREE.Vector3();

export class CameraRig {
  constructor(camera) {
    this.camera = camera;
    this.pos = new THREE.Vector3(0, 10, -30);
    this.look = new THREE.Vector3();
    this.ballCam = true;
    this.distance = 4.6;
    this.height = 1.65;
    this.hFov = 100;
    this.shakeAmt = 0;
    this.time = 0;
    this.orbitAngle = 0;
    this.flatDir = new THREE.Vector3(0, 0, 1);
  }

  setFov(aspect) {
    const h = THREE.MathUtils.degToRad(this.hFov);
    let v = 2 * Math.atan(Math.tan(h / 2) / aspect);
    v = THREE.MathUtils.clamp(v, THREE.MathUtils.degToRad(50), THREE.MathUtils.degToRad(95));
    this.camera.fov = THREE.MathUtils.radToDeg(v);
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  shake(a) { this.shakeAmt = Math.max(this.shakeAmt, a); }

  snap() { this._snap = true; }

  follow(car, carPos, ballPos, dt) {
    this.time += dt;
    // horizontal direction the camera looks along
    if (this.ballCam) {
      _d.set(ballPos.x - carPos.x, 0, ballPos.z - carPos.z);
      if (_d.lengthSq() < 0.5) _d.copy(this.flatDir);
    } else {
      car.forward(_f);
      if (!car.onGround && car.vel.lengthSq() > 4) _f.copy(car.vel);
      _d.set(_f.x, 0, _f.z);
      if (car.onGround && car.normal.y < 0.7) {
        // on walls follow the velocity direction instead
        _d.set(car.vel.x, 0, car.vel.z);
      }
      if (_d.lengthSq() < 0.01) _d.copy(this.flatDir);
    }
    _d.normalize();
    const rate = this.ballCam ? 9 : 6;
    this.flatDir.lerp(_d, this._snap ? 1 : 1 - Math.exp(-rate * dt)).normalize();

    _p.copy(carPos).addScaledVector(this.flatDir, -this.distance);
    _p.y = carPos.y + this.height;
    // walls between car and camera: pull the camera in (and up) along the line
    const sx = carPos.x, sy = carPos.y + 0.6, sz = carPos.z;
    let tMax = 1;
    for (let i = 1; i <= 10; i++) {
      const t = i / 10;
      if (sdf(sx + (_p.x - sx) * t, sy + (_p.y - sy) * t, sz + (_p.z - sz) * t) < 0.45) { tMax = (i - 1) / 10; break; }
    }
    if (tMax < 1) {
      _p.set(sx + (_p.x - sx) * tMax, sy + (_p.y - sy) * tMax, sz + (_p.z - sz) * tMax);
      _p.y += (1 - tMax) * 1.6;
    }
    // keep inside the arena
    const s = sdf(_p.x, _p.y, _p.z);
    if (s < 0.6) {
      sdfNormal(_p.x, _p.y, _p.z, _n);
      _p.addScaledVector(_n, 0.6 - s);
    }

    // look target
    if (this.ballCam) {
      _l.copy(ballPos);
      // limit pitch so the car stays on screen
      const toCarH = Math.hypot(carPos.x - _p.x, carPos.z - _p.z);
      const carPitch = Math.atan2(carPos.y - _p.y + 0.15, toCarH);
      const lookH = Math.hypot(_l.x - _p.x, _l.z - _p.z);
      let pitch = Math.atan2(_l.y - _p.y, Math.max(0.5, lookH));
      const halfV = THREE.MathUtils.degToRad(this.camera.fov) / 2;
      const maxPitch = carPitch + halfV * 0.82;
      const minPitch = carPitch - halfV * 0.3;
      pitch = THREE.MathUtils.clamp(pitch, minPitch, maxPitch);
      const dirH = _f.set(_l.x - _p.x, 0, _l.z - _p.z);
      if (dirH.lengthSq() < 0.01) dirH.copy(this.flatDir);
      dirH.normalize();
      _l.copy(_p).addScaledVector(dirH, Math.cos(pitch) * 10);
      _l.y = _p.y + Math.sin(pitch) * 10;
    } else {
      _l.copy(carPos).addScaledVector(this.flatDir, 4);
      _l.y = carPos.y + 0.9;
    }

    const k = this._snap ? 1 : 1 - Math.exp(-14 * dt);
    this.pos.lerp(_p, k);
    this.look.lerp(_l, this._snap ? 1 : 1 - Math.exp(-16 * dt));
    this._snap = false;
    this.apply(dt);
  }

  cinematic(target, from, dt, rate = 3) {
    this.time += dt;
    this.pos.lerp(from, 1 - Math.exp(-rate * dt));
    this.look.lerp(target, 1 - Math.exp(-rate * 2 * dt));
    if (this._snap) { this.pos.copy(from); this.look.copy(target); this._snap = false; }
    this.apply(dt);
  }

  orbit(center, dt, radius = 52, height = 22, speed = 0.06) {
    this.time += dt;
    this.orbitAngle += dt * speed;
    this.pos.set(Math.sin(this.orbitAngle) * radius + center.x * 0.3, height, Math.cos(this.orbitAngle) * radius * 1.15 + center.z * 0.3);
    this.look.lerp(_l.set(center.x * 0.6, 2, center.z * 0.6), 1 - Math.exp(-2 * dt));
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
  }
}
