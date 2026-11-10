// Rule-based bots: rotation roles, intercepts, dodges and (on hard) aerials.
import * as THREE from '../vendor/three.module.min.js';
import { ARENA, BALL, CAR, WORLD, DIFFICULTY, BOOST_PADS } from './config.js';

const { L, W, GW } = ARENA;
const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _qi = new THREE.Quaternion();
const _a = new THREE.Vector3();

function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

function localOf(car, p, out) {
  _qi.copy(car.quat).invert();
  return out.copy(p).sub(car.pos).applyQuaternion(_qi);
}

// Role assignment per team, run once per frame by the game.
export function assignRoles(game) {
  const ball = game.ball;
  for (const team of [0, 1]) {
    const cars = game.cars.filter(c => c.team === team && !c.demolished);
    if (!cars.length) continue;
    const attackDir = team === 0 ? 1 : -1;
    const scored = cars.map(c => {
      _v.copy(ball.pos).sub(c.pos);
      const dist = Math.hypot(_v.x, _v.z);
      const ahead = (c.pos.z - ball.pos.z) * attackDir; // >0 means car is past the ball
      let score = dist + Math.max(0, ahead) * 1.6;
      const fwd = c.forward(_v2);
      const facing = (fwd.x * _v.x + fwd.z * _v.z) / (dist || 1);
      score += (1 - facing) * 4;
      if (c.role === 'attack') score *= 0.85; // hysteresis
      return { c, score };
    }).sort((a, b) => a.score - b.score);
    scored.forEach((s, i) => {
      s.c.role = i === 0 ? 'attack' : (i === scored.length - 1 && scored.length > 1 ? 'defend' : 'support');
    });
  }
}

export class Bot {
  constructor(car, difficulty = 'normal') {
    this.car = car;
    this.setDifficulty(difficulty);
    this.target = new THREE.Vector3();
    this.think = 0;
    this.seq = null;
    this.stuck = 0;
    this.reverse = 0;
    this.aimErr = 0;
    this.interceptT = 1;
    this.wantBoost = false;
    this.mode = 'drive';
    this.aerialTarget = new THREE.Vector3();
  }

  setDifficulty(d) {
    this.diffKey = d;
    this.diff = DIFFICULTY[d] || DIFFICULTY.normal;
  }

  update(dt, game) {
    const car = this.car;
    const c = car.controls;
    c.throttle = 0; c.steer = 0; c.pitch = 0; c.yaw = 0; c.roll = 0;
    c.jump = false; c.boost = false; c.drift = false; c.fwd = undefined;
    if (car.demolished) { this.seq = null; return; }

    if (this.seq) {
      if (this.runSeq(dt, game)) return;
    }

    const ball = game.ball;
    const attackDir = car.team === 0 ? 1 : -1;
    const ownGoalZ = -attackDir * L;

    this.think -= dt;
    if (this.think <= 0) {
      this.think = this.diff.reaction * (0.6 + Math.random() * 0.8);
      this.aimErr = (Math.random() * 2 - 1) * this.diff.aimError;
      this.decide(game, attackDir, ownGoalZ);
    }

    // airborne without a sequence: land nicely
    if (!car.onGround) {
      this.airRecover(c);
      return;
    }

    this.driveTo(this.target, c, game);

    // contact decisions (only for the active attacker / kickoff)
    if (this.mode === 'ball' || this.mode === 'kickoff') this.tryHit(game, attackDir, c);

    // unstick
    if (car.speed() < 1.2 && Math.abs(c.throttle) > 0.5 && car.onGround) this.stuck += dt; else this.stuck = 0;
    if (this.stuck > 1.2) { this.reverse = 0.8; this.stuck = 0; }
    if (this.reverse > 0) {
      this.reverse -= dt;
      c.throttle = -1; c.steer = -c.steer; c.boost = false;
    }
  }

  decide(game, attackDir, ownGoalZ) {
    const car = this.car;
    const ball = game.ball;
    const role = car.role || 'attack';
    this.mode = 'drive';
    this.wantBoost = false;
    this.arriveT = 0;

    if (game.kickoff) {
      const taker = game.kickoffTaker(car.team);
      if (taker === car) {
        this.mode = 'kickoff';
        this.target.set(0, 0, -attackDir * 0.6);
        this.wantBoost = true;
        return;
      }
      // others grab some boost / hang back
      this.target.set(car.pos.x * 0.6, 0, ownGoalZ * 0.55);
      if (Math.abs(car.pos.x) > 10 && car.pos.z * attackDir < -30) this.target.set(Math.sign(car.pos.x) * 28, 0, ownGoalZ * 0.83);
      this.wantBoost = true;
      return;
    }

    const threat = game.threat === car.team; // ball heading into our goal
    const ballOwnDist = Math.abs(ball.pos.z - ownGoalZ);

    if (role === 'attack' || threat && role !== 'support' || (ballOwnDist < 14 && role === 'defend')) {
      this.planIntercept(game, attackDir, ownGoalZ);
      return;
    }

    if (role === 'support') {
      // stay behind the play, pick up boost if low
      if (this.car.boost < 35) {
        const pad = this.nearestBigPad(game, attackDir);
        if (pad) { this.target.set(pad.x, 0, pad.z); this.wantBoost = false; return; }
      }
      const z = clamp(ball.pos.z - attackDir * 16, -L + 8, L - 8);
      const x = clamp(ball.pos.x * 0.5, -W + 6, W - 6);
      this.target.set(x, 0, z);
      this.arriveT = 0.0001;
      return;
    }

    // defend: sit in goal, face the ball
    const gx = clamp(ball.pos.x * 0.25, -GW + 2, GW - 2);
    this.target.set(gx, 0, ownGoalZ + attackDir * 3.5);
    this.mode = 'goalie';
    if (this.car.boost < 25 && ballOwnDist > 55) {
      const pad = this.nearestBigPad(game, attackDir);
      if (pad) { this.target.set(pad.x, 0, pad.z); this.mode = 'drive'; }
    }
  }

  nearestBigPad(game, attackDir) {
    let best = null, bd = Infinity;
    BOOST_PADS.forEach((p, i) => {
      if (!p.big || !game.pads[i].active) return;
      if (p.z * attackDir > 5) return; // only our half
      const d = Math.hypot(p.x - this.car.pos.x, p.z - this.car.pos.z);
      if (d < bd) { bd = d; best = p; }
    });
    return bd < 45 ? best : null;
  }

  planIntercept(game, attackDir, ownGoalZ) {
    const car = this.car;
    const pred = game.prediction;
    const canAerial = this.diff.aerial && car.boost > 30;
    const reach = canAerial ? 9 : 2.0 + this.diff.jumpSkill * 2.2;
    const curSpeed = car.speed();
    const topSpeed = car.boost > 15 && this.diff.boost > 0.5 ? 20 : CAR.MAX_THROTTLE_SPEED * this.diff.speed;
    const fwd = car.forward(_v2);
    let hit = null, best = null, bestSlack = Infinity;
    for (let i = 0; i < pred.length; i++) {
      const s = pred[i];
      if (s.pos.y > reach) continue;
      const dx = s.pos.x - car.pos.x, dz = s.pos.z - car.pos.z;
      const dist = Math.max(0, Math.hypot(dx, dz) - 1.6);
      const ang = Math.acos(clamp((fwd.x * dx + fwd.z * dz) / (Math.hypot(dx, dz) || 1), -1, 1));
      const avg = Math.max(6, (curSpeed + topSpeed) / 2);
      const tNeed = dist / avg + ang * 0.35 + (s.pos.y > 3 ? 0.6 : 0);
      if (tNeed <= s.t) { hit = s; break; }
      if (tNeed - s.t < bestSlack) { bestSlack = tNeed - s.t; best = s; }
    }
    const ballPos = hit ? hit.pos : (best ? best.pos : game.ball.pos);
    this.interceptT = hit ? hit.t : 3;
    this.interceptPos = ballPos;

    // shot direction: toward the opponent goal, but clear away from our goal when deep
    const goalX = clamp(ballPos.x * 0.4, -GW + 1.8, GW - 1.8);
    _a.set(goalX - ballPos.x, 0, attackDir * L - ballPos.z).normalize();
    const nearOwn = Math.abs(ballPos.z - ownGoalZ) < 30;
    if (nearOwn) {
      _v.set(ballPos.x - 0, 0, ballPos.z - ownGoalZ).normalize();
      _a.lerp(_v, 0.6).normalize();
    }
    // aim error
    const ce = Math.cos(this.aimErr), se = Math.sin(this.aimErr);
    const ax = _a.x * ce - _a.z * se, az = _a.x * se + _a.z * ce;
    _a.set(ax, 0, az);

    const dist = Math.hypot(ballPos.x - car.pos.x, ballPos.z - car.pos.z);
    this.shotDir = this.shotDir || new THREE.Vector3();
    this.shotDir.copy(_a);
    const inOwnGoal = car.pos.z * attackDir < -L + 0.5;
    if (inOwnGoal && Math.abs(ballPos.z - ownGoalZ) > 3) {
      // leave the goal through the mouth before heading anywhere
      this.target.set(clamp(ballPos.x, -GW + 2, GW - 2), 0, ownGoalZ + attackDir * 6);
      this.mode = 'drive';
      this.wantBoost = false;
      this.arriveT = 0;
      return;
    }
    // 1) on the wrong side of the ball: get goal-side again
    const ahead = (car.pos.x - ballPos.x) * _a.x + (car.pos.z - ballPos.z) * _a.z;
    if (ahead > 1.0 && !(dist < 3.5 && Math.abs(car.pos.z - ownGoalZ) < Math.abs(ballPos.z - ownGoalZ))) {
      const gx = clamp(ballPos.x * 0.3, -GW, GW);
      _v.set(gx - ballPos.x, 0, ownGoalZ - ballPos.z);
      const toGoal = _v.length();
      _v.normalize();
      if (toGoal < 16) {
        // ball is close to our goal: race back to the far post
        this.target.set(-Math.sign(ballPos.x || 1) * GW * 0.5, 0, ownGoalZ + attackDir * 2.5);
      } else {
        const side = Math.sign((car.pos.x - ballPos.x) * _v.z - (car.pos.z - ballPos.z) * _v.x) || 1;
        const k = Math.min(9, toGoal * 0.5);
        this.target.set(ballPos.x + _v.x * k + _v.z * side * 4, 0, ballPos.z + _v.z * k - _v.x * side * 4);
      }
      this.target.x = clamp(this.target.x, -W + 2.5, W - 2.5);
      this.target.z = clamp(this.target.z, -L + 2, L - 2);
      this.mode = 'drive';
      this.wantBoost = true;
      this.arriveT = 0;
      return;
    }
    // 3) approach: line up behind the ball, then drive through it
    const toBx = (ballPos.x - car.pos.x) / (dist || 1), toBz = (ballPos.z - car.pos.z) / (dist || 1);
    const align = toBx * _a.x + toBz * _a.z;
    this.approachLimit = 99;
    if (dist < 8 && align > 0.72) {
      this.target.set(ballPos.x + _a.x * 2, 0, ballPos.z + _a.z * 2);
    } else {
      const back = clamp(dist * 0.45, BALL.R + 0.8, 12) * (1.4 - 0.4 * align);
      this.target.set(ballPos.x - _a.x * back, 0, ballPos.z - _a.z * back);
      // badly lined up and close: slow down so we can curve in behind the ball
      if (dist < 16 && align < 0.5) this.approachLimit = 9 + dist * 0.4;
    }
    this.target.x = clamp(this.target.x, -W + 1.5, W - 1.5);
    this.target.z = clamp(this.target.z, -L - 3, L + 3);
    this.mode = 'ball';
    this.wantBoost = dist > 9 || this.interceptT < 1.2;
    this.arriveT = hit && hit.pos.y > 2.6 ? this.interceptT : 0;

    // hard bots: go for aerials
    if (canAerial && hit && hit.pos.y > 4 && car.onGround && car.normal.y > 0.9) {
      const local = localOf(car, hit.pos, _v);
      const ang = Math.atan2(local.x, local.z);
      const hd = Math.hypot(hit.pos.x - car.pos.x, hit.pos.z - car.pos.z);
      if (Math.abs(ang) < 0.3 && hit.t > 0.9 && hit.t < 2.6 && hd < hit.t * 15 && hd > 3) {
        this.aerialTarget.copy(hit.pos).addScaledVector(_a, -BALL.R * 0.8);
        this.aerialEnd = hit.t + 0.3;
        this.seq = { type: 'aerial', t: 0 };
      }
    }
  }

  driveTo(target, c, game) {
    const car = this.car;
    const local = localOf(car, target, _v);
    const angle = Math.atan2(local.x, local.z);
    const dist = Math.hypot(local.x, local.z);
    const speed = car.vel.dot(car.forward(_v2));
    c.steer = clamp(-angle * 3.2, -1, 1);
    c.throttle = 1;
    const absA = Math.abs(angle);
    if (absA > 1.5 && speed > 7 && dist < 25) c.drift = true;
    // slow down for tight turns close to the target so we don't orbit it
    if (absA > 0.45 && dist < 16 && this.mode !== 'kickoff') {
      const vmax = 3.5 + dist * 0.9 * (1.7 - Math.min(absA, 1.5));
      if (speed > vmax) { c.throttle = -0.45; c.drift = absA > 1.0; }
      else if (speed < vmax * 0.6) c.throttle = 1;
      else c.throttle = 0.3;
    }

    if (this.mode === 'goalie') {
      // stop near the spot and face the ball
      if (dist < 3) {
        const bl = localOf(car, game.ball.pos, _v2);
        const ba = Math.atan2(bl.x, bl.z);
        c.steer = clamp(-ba * 3, -1, 1);
        c.throttle = Math.abs(ba) > 0.4 ? (speed > 3 ? -0.3 : 0.6) : (speed > 0.5 ? -0.4 : 0);
        if (Math.abs(ba) > 2.2) c.throttle = 0.7;
      } else if (dist < 10) c.throttle = speed > dist * 1.5 ? -0.5 : 1;
    } else if (this.arriveT > 0 && this.mode !== 'ball') {
      // support: don't overshoot
      if (dist < 8) c.throttle = speed > dist ? -0.2 : 0.5;
    } else if (this.mode === 'ball' && this.arriveT > 0) {
      // wait for a bouncing ball to come down
      const want = dist / Math.max(0.2, this.arriveT);
      if (speed > want * 1.4 + 3 && dist < 25) c.throttle = 0;
    }

    if (this.mode === 'ball' && this.approachLimit < 99 && speed > this.approachLimit) { c.throttle = Math.min(c.throttle, 0); c.boost = false; }
    const maxSpd = this.diff.speed < 1 ? CAR.MAX_THROTTLE_SPEED * this.diff.speed : 99;
    if (speed > maxSpd && !this.wantBoost) c.throttle = Math.min(c.throttle, 0);

    const canBoost = this.wantBoost && Math.random() < this.diff.boost + 0.2;
    if (canBoost && Math.abs(angle) < 0.35 && speed < Math.min(22, this.approachLimit || 99) && car.onGround && car.normal.y > 0.6) c.boost = car.boost > 0;
    if (this.mode === 'kickoff' && Math.abs(angle) < 0.6) c.boost = true;
  }

  tryHit(game, attackDir, c) {
    const car = this.car;
    const ball = game.ball;
    const rel = _v.copy(ball.pos).sub(car.pos);
    const hd = Math.hypot(rel.x, rel.z);
    const local = localOf(car, ball.pos, _v2);
    const ang = Math.atan2(local.x, local.z);
    const speed = car.speed();
    const closing = -(car.vel.x - ball.vel.x) * (-rel.x / (hd || 1)) - (car.vel.z - ball.vel.z) * (-rel.z / (hd || 1));

    if (this.mode === 'kickoff') {
      if (hd < 6.5 && speed > 9 && Math.random() < this.diff.dodge + 0.25) {
        this.seq = { type: 'dodge', t: 0, f: 1, s: clamp(-ang * 2, -0.4, 0.4) };
      }
      return;
    }
    if (!car.onGround || car.normal.y < 0.7) return;
    const h = ball.pos.y;
    const tArrive = hd / Math.max(4, closing);
    // dodge into a low ball when it is lined up with the shot
    const sd = this.shotDir;
    const lined = sd ? (rel.x * sd.x + rel.z * sd.z) / (hd || 1) : 1;
    const goalDist = Math.abs(ball.pos.z - attackDir * L) + Math.abs(ball.pos.x) * 0.5;
    if (h < 1.3 && hd < 3.4 + speed * 0.05 && Math.abs(ang) < 0.35 && lined > 0.7 && goalDist > 26 && speed > 6 && Math.random() < this.diff.dodge * 0.25) {
      this.seq = { type: 'dodge', t: 0, f: 1, s: clamp(-ang * 1.6, -0.6, 0.6) };
      return;
    }
    // jump for bouncing balls
    if (h > 2.3 && h < 2.3 + this.diff.jumpSkill * 3.0 && hd < 2.6 + speed * 0.12 && Math.abs(ang) < 0.6) {
      const timeToTop = h > 4.2 ? 0.45 : 0.3;
      if (tArrive < timeToTop + 0.15) {
        this.seq = { type: h > 4.0 ? 'double' : 'single', t: 0 };
      }
    }
  }

  airRecover(c) {
    // try to land on the wheels: align up with world up / nearest surface
    const car = this.car;
    _qi.copy(car.quat).invert();
    const upL = _v.set(0, 1, 0).applyQuaternion(_qi); // world up in local frame
    c.pitch = clamp(upL.z * 2.5, -1, 1);   // nose down if up vector points forward
    c.roll = clamp(-upL.x * 2.5, -1, 1);
    c.steer = 0; c.yaw = 0;
    c.throttle = 1;
  }

  runSeq(dt, game) {
    const s = this.seq;
    const c = this.car.controls;
    const car = this.car;
    s.t += dt;
    if (s.type === 'dodge') {
      c.throttle = 1;
      if (s.t < 0.07) c.jump = true;
      else if (s.t < 0.11) c.jump = false;
      else if (s.t < 0.2) { c.jump = true; c.fwd = s.f; c.pitch = s.f; c.steer = s.s; c.yaw = 0; }
      else if (s.t < 0.9) { c.jump = false; c.boost = false; }
      else { this.seq = null; return false; }
      return true;
    }
    if (s.type === 'single' || s.type === 'double') {
      c.throttle = 1;
      if (s.t < 0.2) c.jump = true;
      else if (s.type === 'double' && s.t < 0.24) c.jump = false;
      else if (s.type === 'double' && s.t < 0.32) c.jump = true;
      else c.jump = false;
      // nose toward the ball
      const local = localOf(car, game.ball.pos, _v);
      c.pitch = clamp(-Math.atan2(local.y, local.z) * 1.5, -1, 1) * 0.5;
      c.fwd = 0; c.steer = 0;
      if (s.t > 1.0 || (car.onGround && s.t > 0.3)) { this.seq = null; return false; }
      return true;
    }
    if (s.type === 'aerial') {
      const T = Math.max(0.15, this.aerialEnd - s.t);
      // required acceleration to reach the target in T
      _a.copy(this.aerialTarget).sub(car.pos).addScaledVector(car.vel, -T).multiplyScalar(2 / (T * T));
      _a.y += WORLD.gravity;
      const need = _a.length();
      _a.normalize();
      if (s.t < 0.22) { c.jump = true; }
      else if (s.t < 0.26) c.jump = false;
      else if (s.t < 0.32) { c.jump = true; c.fwd = 0; c.steer = 0; }
      _qi.copy(car.quat).invert();
      const dl = _v.copy(_a).applyQuaternion(_qi);
      const wl = _v2.copy(car.angVel).applyQuaternion(_qi);
      c.pitch = clamp(-Math.atan2(dl.y, dl.z) * 3.2 + wl.x * 0.35, -1, 1);
      c.yaw = clamp(-Math.atan2(dl.x, dl.z) * 3.2 - wl.y * 0.35, -1, 1);
      const leftY = _v2.set(1, 0, 0).applyQuaternion(car.quat).y;
      c.roll = clamp(-leftY * 1.5, -1, 1);
      c.steer = c.yaw;
      c.fwd = 0;
      const aligned = dl.z > 0.85;
      c.boost = aligned && need > 2 && car.boost > 0;
      c.throttle = 1;
      if (s.t > this.aerialEnd + 0.4 || (car.onGround && s.t > 0.4) || car.pos.distanceTo(game.ball.pos) < 1.5) {
        this.seq = null;
        return false;
      }
      return true;
    }
    this.seq = null;
    return false;
  }
}
