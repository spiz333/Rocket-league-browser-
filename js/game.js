// Match orchestration: physics stepping, rules, scoring, effects and views.
import * as THREE from '../vendor/three.module.min.js';
import { ARENA, BALL, CAR, BOOST_PADS, KICKOFF_SPOTS, KICKOFF_SETS, BOT_NAMES, TEAM_COLORS, PHYS_STEP, WORLD, applyMutator } from './config.js';
import { Ball, stepBall, BallPredictor } from './ball.js';
import { Car, emptyControls } from './car.js';
import { Bot, assignRoles } from './ai.js';
import { buildBallMesh, buildShadowMesh } from './models.js';
import { buildCarMesh, BODY_TYPES } from './cars.js';
import { ITEMS } from './catalog.js';
import { Recorder } from './replay.js';
import { goalAt } from './sdf.js';
import { formatTime } from './hud.js';

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _n = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _qi = new THREE.Quaternion();
const _c = new THREE.Vector3();
const _rel = new THREE.Vector3();
const _vc = new THREE.Vector3();
const _w = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);
const _pre = new THREE.Vector3();
const _col = new THREE.Color();
const _q2 = new THREE.Quaternion();
const NET_DELAY = 0.1;       // guests render others this far in the past (s)
const SNAP_RATE = 1 / 30;    // host snapshot interval (s)
const r3 = (v) => Math.round(v * 1000) / 1000;

export function packControls(c) {
  const r2 = (v) => Math.round((v || 0) * 100) / 100;
  return [r2(c.throttle), r2(c.steer), r2(c.pitch), r2(c.yaw), r2(c.roll), r2(c.fwd ?? c.pitch), (c.jump ? 1 : 0) | (c.boost ? 2 : 0) | (c.drift ? 4 : 0) | (c.noDodge ? 8 : 0) | (c.airRoll ? 16 : 0)];
}
export function unpackControls(a, c) {
  c.throttle = a[0]; c.steer = a[1]; c.pitch = a[2]; c.yaw = a[3]; c.roll = a[4]; c.fwd = a[5];
  c.jump = !!(a[6] & 1); c.boost = !!(a[6] & 2); c.drift = !!(a[6] & 4); c.noDodge = !!(a[6] & 8); c.airRoll = !!(a[6] & 16);
  return c;
}

function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = (Math.random() * (i + 1)) | 0;
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export class Game {
  constructor(env) {
    this.scene = env.scene;
    this.rig = env.rig;
    this.audio = env.audio;
    this.fx = env.particles;
    this.hud = env.hud;
    this.input = env.input;
    this.arena = env.arena;
    this.padsView = env.padsView;
    this.quality = env.quality;
    this.shadows = !!env.shadows;

    this.ball = new Ball();
    this.ballView = buildBallMesh(this.quality);
    this.scene.add(this.ballView.group);
    this.ballShadow = buildShadowMesh(2.8);
    this.scene.add(this.ballShadow);
    this.cars = [];
    this.views = new Map();
    this.bots = [];
    this.pads = BOOST_PADS.map(() => ({ active: true, timer: 0 }));
    this.predictor = new BallPredictor(96, 1 / 32);
    this.prediction = this.predictor.samples;
    this.predTimer = 0;
    this.recorder = new Recorder(7.5, 60);
    this.replayProxies = { ball: { pos: new THREE.Vector3(), quat: new THREE.Quaternion(), hidden: false }, cars: [] };
    this.state = 'idle';
    this.paused = false;
    this.time = 0;
    this.acc = 0;
    this.score = [0, 0];
    this.threat = -1;
    this.touches = [];
    this.pendingTouch = null;
    this.onEnd = null;
    this.onStateChange = null;
    this.opts = {};
    this.player = null;
    this.timeScale = 1;
    this.attractCamTimer = 0;
    this.attractCamMode = 0;
    this.attractCar = null;
    this.bounceCooldown = 0;
    this.jumboDirty = true;
    // networking
    this.role = 'local';       // local | host | client
    this.net = null;
    this.remote = new Map();   // host: peerId -> { car, input, ack, jumpLatch }
    this.snapshots = [];       // client: received snapshots
    this.netTime = 0;
    this.netTimer = 0;
    this.inputSeq = 0;
    this.inputHistory = [];
    this.ownAcc = 0;
    this.ownOffset = new THREE.Vector3();
  }

  // ---------- setup ----------
  setup(opts) {
    this.opts = { mode: 'match', teamSize: 2, difficulty: 'normal', duration: 300, body: 0, paint: null, replays: true, ...opts };
    for (const v of this.views.values()) {
      this.scene.remove(v.root);
      v.root.traverse(o => { if (o.isMesh && o.geometry) o.geometry.dispose(); });
    }
    this.views.clear();
    this.hud.clearLabels();
    this.cars = [];
    this.bots = [];
    this.player = null;
    this.remote.clear();
    this.snapshots = [];
    this.inputHistory = [];
    this.ownOffset.set(0, 0, 0);
    this.recorder.clear();
    const o = this.opts;
    applyMutator(o.mode === 'attract' ? 'none' : (o.mutator || 'none'));
    this.role = o.role || 'local';
    const roster = o.roster || Game.defaultRoster(o);
    const localOwner = o.localOwner || 'local';
    for (const entry of roster) {
      {
        const team = entry.team;
        const isPlayer = entry.owner != null && entry.owner === localOwner;
        const name = String(entry.name || 'Player').replace(/[<>&"'`]/g, '').slice(0, 16) || 'Player';
        const car = new Car(team, name, { isPlayer });
        car.look = Game.cleanLook(entry.look);
        car.owner = entry.owner ?? null;
        car.events = this.carEvents();
        this.cars.push(car);
        if (isPlayer) this.player = car;
        else if (car.owner == null && this.role !== 'client') this.bots.push(new Bot(car, o.difficulty));
        else if (car.owner != null && this.role === 'host') this.remote.set(car.owner, { car, input: emptyControls(), ack: 0, pressSeen: false });
        const view = buildCarMesh(team, car.look, this.quality);
        this.scene.add(view.root);
        if (!this.shadows) {
          view.blob = buildShadowMesh(2.0);
          view.blob.scale.set(0.85, 1.25, 1);
          view.root.add(view.blob);
          view.blob.position.y = -CAR.RIDE + 0.02;
        }
        this.views.set(car, view);
        car.renderPos = new THREE.Vector3();
      }
    }
    this.replayProxies.cars = this.cars.map(() => ({ pos: new THREE.Vector3(), quat: new THREE.Quaternion(), boosting: false, demolished: false }));
    for (const c of this.cars) {
      c.stats = { goals: 0, assists: 0, saves: 0, shots: 0, points: 0, demos: 0 };
      c.unlimitedBoost = o.mode === 'training' || o.mode === 'challenge' || WORLD.unlimitedBoost;
    }
    this.score = [0, 0];
    this.timeLeft = o.mode === 'match' ? o.duration : o.mode === 'challenge' ? 60 : 0;
    this.overtime = false;
    this.timeUp = false;
    this.matchOver = false;
    this.fx.clear();
    if (this.role === 'client') {
      this.state = 'countdown';
      this.kickoff = true;
      this.ball.reset();
    } else this.kickoffReset(o.mode === 'attract' ? 0.01 : (o.mode === 'match' ? 4.6 : 3));
    this.updateJumbo();
  }

  static randomLook() {
    const r = (n) => (Math.random() * n) | 0;
    const L = (k) => ITEMS[k].length;
    return {
      body: r(BODY_TYPES.length), paint: Math.random() < 0.6 ? 0 : r(L('paint')), finish: Math.random() < 0.7 ? 0 : r(L('finish')),
      livery: r(L('livery')), wheel: r(L('wheel')), boost: r(L('boost')), topper: Math.random() < 0.7 ? 0 : r(L('topper')),
      goalfx: r(L('goalfx')), trail: r(L('trail')), number: 1 + r(98),
    };
  }

  static cleanLook(l) {
    l = l || {};
    const n = (v, max) => Math.max(0, Math.min(max - 1, v | 0));
    const out = { body: n(l.body, BODY_TYPES.length), number: n(l.number, 100) };
    for (const k of ['paint', 'finish', 'livery', 'wheel', 'boost', 'topper', 'goalfx', 'trail']) out[k] = n(l[k], ITEMS[k].length);
    return out;
  }

  static defaultRoster(o) {
    const names = shuffle([...BOT_NAMES]);
    const sizes = o.mode === 'training' || o.mode === 'challenge' ? [1, 0] : [o.teamSize, o.teamSize];
    const roster = [];
    for (const team of [0, 1]) {
      for (let i = 0; i < sizes[team]; i++) {
        const isPlayer = o.mode !== 'attract' && team === 0 && i === 0;
        roster.push({
          team, name: isPlayer ? (o.playerName || 'You') : names.pop(), owner: isPlayer ? 'local' : null,
          look: isPlayer ? o.look : Game.randomLook(),
        });
      }
    }
    return roster;
  }

  carEvents() {
    return {
      jump: (car) => { if (car === this.player) this.audio.jump(); if (car.onGround === false && car.sinceJump === 0) this.dust(car, 10); },
      dodge: (car) => { if (car === this.player) this.audio.dodge(); },
      land: (car) => { if (car === this.player) this.audio.land(0.6); car.squash = 0.6; this.dust(car, 6); },
      thud: (car, s) => { if (car === this.player) this.audio.land(Math.min(1, s / 8)); },
    };
  }

  kickoffReset(countdown = 3) {
    this.ball.reset();
    this.ball.quat.identity();
    this.threat = -1;
    this.touches = [];
    this.pendingTouch = null;
    this.kickoff = true;
    this.acc = 0;
    this.timeScale = 1;
    for (const p of this.pads) { p.active = true; p.timer = 0; }
    const o = this.opts;
    for (const team of [0, 1]) {
      const teamCars = this.cars.filter(c => c.team === team);
      if (!teamCars.length) continue;
      const n = Math.min(3, teamCars.length);
      const sets = KICKOFF_SETS[n];
      const set = shuffle([...sets[(Math.random() * sets.length) | 0]]);
      teamCars.forEach((car, i) => {
        const spot = KICKOFF_SPOTS[set[i % set.length]];
        const sgn = team === 0 ? 1 : -1;
        const x = spot.x * sgn, z = spot.z * sgn;
        const yaw = Math.atan2(-x, -z);
        const boost = car.unlimitedBoost ? 100 : 33;
        car.place(x, z, yaw);
        car.boost = boost;
        car.controls.jump = false;
        car.prevJump = true;
      });
    }
    for (const b of this.bots) b.seq = null;
    if (o.mode === 'challenge') this.spawnChallengeBall();
    this.countdown = countdown;
    this.lastCount = 4;
    this.setState('countdown');
    this.rig.snap();
    this.input.reset();
  }

  setState(s) {
    this.state = s;
    if (this.onStateChange) this.onStateChange(s);
  }

  kickoffTaker(team) {
    let best = null, bd = Infinity;
    const attackDir = team === 0 ? 1 : -1;
    for (const c of this.cars) {
      if (c.team !== team || c.demolished) continue;
      const d = Math.hypot(c.pos.x, c.pos.z) + (c.pos.x * attackDir < -0.1 ? 0 : 0.3);
      if (d < bd - 0.01) { bd = d; best = c; }
    }
    return best;
  }

  // ---------- main update ----------
  countdownHud() {
    const n = Math.ceil(this.countdown);
    if (this.opts.mode !== 'attract' && n !== this.lastCount && n > 0 && n <= 3) {
      this.hud.message(String(n), 'count', 0.9);
      this.audio.countdown(false);
    }
    this.lastCount = n;
  }

  goHud() {
    if (this.opts.mode === 'attract') return;
    this.hud.message(this.overtime ? 'OVERTIME!' : 'GO!', 'go', 0.8);
    this.audio.countdown(true);
  }

  update(dt) {
    if (this.role === 'client') { this.updateClient(dt); return; }
    if (this.paused && this.role !== 'host') return;
    const o = this.opts;
    switch (this.state) {
      case 'countdown': {
        this.countdown -= dt;
        this.countdownHud();
        if (this.countdown <= 0) {
          this.goHud();
          this.setState('playing');
        }
        this.readControls(dt);
        break;
      }
      case 'playing': {
        this.readControls(dt);
        this.simulate(dt);
        if (o.mode === 'match') this.tickClock(dt);
        else if (o.mode === 'challenge') {
          this.timeLeft -= dt;
          if (this.challengeRespawn > 0) { this.challengeRespawn -= dt; if (this.challengeRespawn <= 0) this.spawnChallengeBall(); }
          if (this.timeLeft <= 0) { this.timeLeft = 0; this.endMatch(); }
        }
        this.recorder.record(this.time, this.ball, this.cars);
        break;
      }
      case 'goal': {
        this.goalTimer += dt;
        this.timeScale = Math.min(1, 0.3 + this.goalTimer * 0.5);
        this.readControls(dt);
        this.simulate(dt * this.timeScale);
        this.recorder.record(this.time, this.ball, this.cars);
        const wait = o.mode === 'attract' ? 2.5 : 3.0;
        if (this.goalTimer > wait) {
          if (o.replays && o.mode === 'match' && this.recorder.frames.length > 30) this.startReplay();
          else this.afterGoal();
        }
        break;
      }
      case 'replay': {
        this.replayT += dt * this.replayRate();
        if (!this.replayBoom && this.replayT >= this.goalTime) {
          this.replayBoom = true;
          this.goalExplosion(this.replayProxies.ball.pos, this.lastGoalTeam, false, this.lastGoalFx | 0);
        }
        if (this.replayT >= this.replayEnd) this.endReplay();
        break;
      }
      default:
        break;
    }

    // pads + prediction run in real time
    this.updatePads(dt);
    if (this.state === 'playing' || this.state === 'countdown') {
      this.predTimer -= dt;
      if (this.predTimer <= 0) {
        this.predTimer = 0.06;
        this.predictor.run(this.ball);
        this.threat = this.goalThreat(this.prediction);
      }
    }
    if (this.jumboDirty || this.state === 'playing') this.updateJumbo();

    if (this.role === 'host' && this.net) {
      this.netTimer -= dt;
      if (this.netTimer <= 0) {
        this.netTimer += SNAP_RATE;
        if (this.netTimer < 0) this.netTimer = SNAP_RATE;
        this.sendSnapshots();
      }
    }
  }

  readControls(dt) {
    const frozen = this.state === 'countdown';
    if (this.player) {
      this.input.read(this.player.controls, this.player.onGround);
    }
    for (const r of this.remote.values()) {
      Object.assign(r.car.controls, r.input);
      // a quick tap that started and ended between two host frames still counts
      if (r.pressSeen && !r.input.jump && !r.car.prevJump) r.car.controls.jump = true;
      r.pressSeen = false;
    }
    if (!frozen) {
      this.roleTimer = (this.roleTimer || 0) - dt;
      if (this.roleTimer <= 0) { this.roleTimer = 0.1; assignRoles(this); }
      for (const b of this.bots) b.update(dt, this);
    }
  }

  simulate(dt) {
    this.acc += Math.min(dt, 0.1);
    let steps = 0;
    while (this.acc >= PHYS_STEP && steps < 12) {
      this.savePrevAll();
      this.physicsStep(PHYS_STEP);
      this.acc -= PHYS_STEP;
      steps++;
    }
    if (steps >= 12) this.acc = 0;
  }

  savePrevAll() {
    this.ball.savePrev();
    for (const c of this.cars) c.savePrev();
  }

  // positions used for drawing: blended between the last two physics steps
  computeRenderState() {
    const a = this.role === 'client' ? 1 : Math.min(1, this.acc / PHYS_STEP);
    const b = this.ball;
    if (!b.prevPos) b.savePrev();
    b.renderPos.copy(b.prevPos).lerp(b.pos, a);
    b.renderQuat.copy(b.prevQuat).slerp(b.quat, a);
    for (const c of this.cars) {
      if (!c.prevPos) c.savePrev();
      if (!c.renderQuat) c.renderQuat = new THREE.Quaternion();
      const k = this.role === 'client' && c === this.player ? Math.min(1, this.ownAcc / PHYS_STEP) : a;
      if (c.prevPos.distanceToSquared(c.pos) > 25) c.savePrev(); // teleported
      c.renderPos.copy(c.prevPos).lerp(c.pos, k);
      c.renderQuat.copy(c.prevQuat).slerp(c.quat, k);
      if (this.role === 'client' && c === this.player) c.renderPos.add(this.ownOffset);
    }
  }

  physicsStep(h) {
    this.time += h;
    for (const car of this.cars) {
      if (car.demolished) {
        car.respawnTimer -= h;
        if (car.respawnTimer <= 0) this.respawn(car);
        continue;
      }
      car.step(h, this.time);
    }
    if (!this.ball.hidden) {
      const impact = stepBall(this.ball, h, true);
      this.bounceCooldown -= h;
      if (impact > 3 && this.bounceCooldown <= 0) {
        this.bounceCooldown = 0.08;
        this.emitFx({ k: 'bounce', s: r3(impact), p: this.ball.pos.toArray().map(r3) });
      }
      for (const car of this.cars) if (!car.demolished) this.carBall(car);
    }
    this.carCar();
    this.padPickups();
    if (!this.ball.hidden && this.state === 'playing') {
      const g = goalAt(this.ball.pos.x, this.ball.pos.y, this.ball.pos.z, BALL.R);
      if (g >= 0) this.onGoal(g);
    }
    if (this.pendingTouch && this.time >= this.pendingTouch.evalAt) this.evalTouch();
  }

  // ---------- collisions ----------
  carBall(car) {
    const ball = this.ball;
    _qi.copy(car.quat).invert();
    _rel.copy(ball.pos).sub(car.pos).applyQuaternion(_qi);
    _rel.z -= CAR.OFFSET_Z;
    const cx = Math.max(-CAR.HX, Math.min(CAR.HX, _rel.x));
    const cy = Math.max(-CAR.HY, Math.min(CAR.HY, _rel.y));
    const cz = Math.max(-CAR.HZ, Math.min(CAR.HZ, _rel.z));
    let dx = _rel.x - cx, dy = _rel.y - cy, dz = _rel.z - cz;
    let d2 = dx * dx + dy * dy + dz * dz;
    if (d2 >= BALL.R * BALL.R) return;
    let dist = Math.sqrt(d2);
    if (dist < 1e-4) {
      // ball center inside the box: push out along the local direction
      dx = _rel.x; dy = _rel.y + 0.2; dz = _rel.z;
      dist = Math.hypot(dx, dy, dz) || 1;
      dx /= dist; dy /= dist; dz /= dist;
      dist = 0;
    } else { dx /= dist; dy /= dist; dz /= dist; }
    _n.set(dx, dy, dz).applyQuaternion(car.quat);
    _c.set(cx, cy, cz + CAR.OFFSET_Z).applyQuaternion(car.quat).add(car.pos);
    ball.pos.copy(_c).addScaledVector(_n, BALL.R + 0.001);
    // keep ground shots a little flatter (more fun, more goals)
    if (car.onGround && car.normal.y > 0.8 && _n.y > 0) { _n.y *= 0.7; _n.normalize(); }

    // relative velocity at contact
    _v.copy(_c).sub(car.pos);
    _vc.crossVectors(car.angVel, _v).add(car.vel);
    _v2.copy(ball.vel).sub(_vc);
    const vn = _v2.dot(_n);
    const relPre = Math.min(46, _v2.length());
    let strength = 0;
    if (vn < 0) {
      const j = -vn / (1 / BALL.MASS + 1 / CAR.MASS);
      ball.vel.addScaledVector(_n, j / BALL.MASS);
      car.vel.addScaledVector(_n, -j / CAR.MASS);
      strength = -vn;
      // spin from tangential motion
      _w.copy(_v2).addScaledVector(_n, -vn);
      _v.crossVectors(_n, _w).multiplyScalar(-0.35 / BALL.R);
      ball.angVel.add(_v);
    }
    if (this.time - car.lastHitTime > 0.1) {
      // extra arcade hit impulse for satisfying shots
      _v.copy(ball.pos).sub(car.pos);
      _v.y *= 0.35;
      car.forward(_w);
      _v.normalize();
      _v.addScaledVector(_w, -0.35 * _v.dot(_w)).normalize();
      const rel = relPre;
      let scale;
      if (rel <= 5) scale = 0.65;
      else if (rel <= 23) scale = 0.65 - (rel - 5) / 18 * 0.1;
      else scale = 0.55 - (rel - 23) / 23 * 0.25;
      if (strength > 0.5) {
        ball.vel.addScaledVector(_v, rel * scale);
        strength = Math.max(strength, rel);
      }
      car.lastHitTime = this.time;
      if (strength > 0.5) this.onTouch(car, strength, _c);
    }
    const sp = ball.vel.length();
    if (sp > BALL.MAX_SPEED) ball.vel.multiplyScalar(BALL.MAX_SPEED / sp);
  }

  carCar() {
    const cars = this.cars;
    for (let i = 0; i < cars.length; i++) {
      const a = cars[i];
      if (a.demolished) continue;
      for (let j = i + 1; j < cars.length; j++) {
        const b = cars[j];
        if (b.demolished) continue;
        _v.copy(b.pos).sub(a.pos);
        const d = _v.length();
        const minD = 1.2;
        if (d >= minD || d < 1e-5) continue;
        _n.copy(_v).multiplyScalar(1 / d);
        const push = (minD - d) / 2;
        a.pos.addScaledVector(_n, -push);
        b.pos.addScaledVector(_n, push);
        const vrel = _v2.copy(b.vel).sub(a.vel).dot(_n);
        if (vrel >= 0) continue;
        // demolition?
        if (this.tryDemo(a, b, _n) || this.tryDemo(b, a, _v.copy(_n).negate())) continue;
        const jimp = -(1 + 0.35) * vrel / 2;
        a.vel.addScaledVector(_n, -jimp);
        b.vel.addScaledVector(_n, jimp);
        // bump bonus: the faster car launches the other one a bit
        const fa = a.vel.dot(a.forward(_w)), fb = b.vel.dot(b.forward(_w));
        if (Math.max(fa, fb) > 9) {
          const atk = fa > fb ? a : b, vic = atk === a ? b : a;
          const dir = atk === a ? _n : _v.copy(_n).negate();
          vic.vel.addScaledVector(dir, atk.speed() * 0.25).addScaledVector(UP, 2.5);
          vic.groundLock = 0.15;
          vic.onGround = false;
        }
        if (-vrel > 4) this.emitFx({ k: 'bump', s: r3(-vrel), p: a.pos.toArray().map(r3) });
      }
    }
  }

  tryDemo(atk, vic, dirToVic) {
    if (atk.team === vic.team || !atk.supersonic) return false;
    const f = atk.forward(_w);
    if (f.dot(dirToVic) < 0.6) return false;
    this.demolish(vic, atk);
    return true;
  }

  demolish(vic, atk) {
    vic.demolished = true;
    vic.respawnTimer = 3;
    vic.vel.set(0, 0, 0);
    if (atk) {
      atk.stats.demos++;
      atk.stats.points += 25;
    }
    this.emitFx({ k: 'demo', v: this.cars.indexOf(vic), c: atk ? this.cars.indexOf(atk) : -1, p: vic.pos.toArray().map(r3) });
  }

  respawn(car) {
    const sgn = car.team === 0 ? 1 : -1;
    const spot = KICKOFF_SPOTS[(Math.random() * KICKOFF_SPOTS.length) | 0];
    const x = spot.x * sgn * 1.2, z = (spot.z - 4) * sgn;
    car.place(x, z, Math.atan2(-x * 0.2, -z));
    car.boost = car.unlimitedBoost ? 100 : 33;
    car.prevJump = true;
  }

  padPickups() {
    for (let i = 0; i < BOOST_PADS.length; i++) {
      const p = this.pads[i];
      if (!p.active) continue;
      const pd = BOOST_PADS[i];
      const r = pd.big ? 2.0 : 1.3;
      for (const car of this.cars) {
        if (car.demolished || car.boost >= 100 || car.pos.y > 2.6) continue;
        const dx = car.pos.x - pd.x, dz = car.pos.z - pd.z;
        if (dx * dx + dz * dz < r * r) {
          car.boost = Math.min(100, car.boost + (pd.big ? 100 : 12));
          p.active = false;
          p.timer = pd.big ? 10 : 4;
          this.emitFx({ k: 'pad', i, c: this.cars.indexOf(car) });
          break;
        }
      }
    }
  }

  updatePads(dt) {
    for (const p of this.pads) {
      if (!p.active) {
        p.timer -= dt;
        if (p.timer <= 0) p.active = true;
      }
    }
  }

  // ---------- touches, shots, saves ----------
  onTouch(car, strength, at) {
    this.kickoff = false;
    const now = this.time;
    const last = this.touches[this.touches.length - 1];
    if (!last || last.car !== car) this.touches.push({ car, t: now });
    else last.t = now;
    if (this.touches.length > 6) this.touches.shift();
    if (!this.pendingTouch || this.pendingTouch.car !== car) {
      this.pendingTouch = { car, evalAt: now + 0.12, prevThreat: this.threat };
    } else this.pendingTouch.evalAt = now + 0.12;
    this.emitFx({ k: 'touch', c: this.cars.indexOf(car), s: r3(strength), p: at.toArray().map(r3) });
  }

  goalThreat(samples) {
    for (let i = 0; i < samples.length && samples[i].t < 3; i++) {
      const s = samples[i];
      const g = goalAt(s.pos.x, s.pos.y, s.pos.z, 0);
      if (g >= 0) return g;
    }
    return -1;
  }

  evalTouch() {
    const pt = this.pendingTouch;
    this.pendingTouch = null;
    if (this.opts.mode !== 'match') return;
    const car = pt.car;
    const samples = this.predictor.run(this.ball);
    const g = this.goalThreat(samples);
    this.threat = g;
    if (g === 1 - car.team && pt.prevThreat !== 1 - car.team) {
      car.stats.shots++;
      car.stats.points += 20;
      this.emitFx({ k: 'shot', c: this.cars.indexOf(car) });
    }
    if (pt.prevThreat === car.team && g !== car.team) {
      car.stats.saves++;
      car.stats.points += 50;
      this.emitFx({ k: 'save', c: this.cars.indexOf(car) });
    }
  }

  // ---------- goals ----------
  spawnChallengeBall() {
    const r = (a, b) => a + Math.random() * (b - a);
    this.ball.reset();
    this.ball.pos.set(r(-20, 20), 1 + r(0, 5), r(-2, 26));
    this.ball.vel.set(r(-5, 5), r(0, 6), r(-4, 3));
    this.ball.snapPrev();
  }

  onGoal(goalTeam) {
    if (this.opts.mode === 'challenge') {
      // quick-fire: count it, celebrate briefly, drop a new ball
      if (goalTeam === 1) { this.score[0]++; this.player.stats.goals++; this.player.stats.points += 100; }
      this.jumboDirty = true;
      this.emitFx({ k: 'goal', team: 0, s: goalTeam === 1 ? 0 : -1, a: -1, p: this.ball.pos.toArray().map(r3), v: Math.round(this.ball.vel.length() * 15.1), fx: this.player.look ? this.player.look.goalfx | 0 : 0 });
      this.ball.hidden = true;
      this.ball.pos.set(0, -40, 0);
      this.ball.vel.set(0, 0, 0);
      this.challengeRespawn = 0.9;
      return;
    }
    const scoringTeam = 1 - goalTeam;
    this.score[scoringTeam]++;
    this.jumboDirty = true;
    this.hud.setScore(this.score[0], this.score[1]);
    // scorer = last touch from the scoring team
    let scorer = null, scorerT = 0;
    for (let i = this.touches.length - 1; i >= 0; i--) {
      if (this.touches[i].car.team === scoringTeam) { scorer = this.touches[i].car; scorerT = this.touches[i].t; break; }
    }
    let assist = null;
    if (scorer) {
      for (let i = this.touches.length - 1; i >= 0; i--) {
        const t = this.touches[i];
        if (t.car !== scorer && t.car.team === scoringTeam && scorerT - t.t < 5 && t.t <= scorerT) { assist = t.car; break; }
      }
      scorer.stats.goals++;
      scorer.stats.points += 100;
      if (assist) { assist.stats.assists++; assist.stats.points += 50; }
    }
    this.lastGoalTeam = scoringTeam;
    this.goalTime = this.time;
    this.goalScorer = scorer;
    this.pendingTouch = null;
    this.goalShock(this.ball.pos);
    this.emitFx({ k: 'goal', team: scoringTeam, s: this.cars.indexOf(scorer), a: this.cars.indexOf(assist), p: this.ball.pos.toArray().map(r3), v: Math.round(this.ball.vel.length() * 3.6 * 4.2), fx: scorer && scorer.look ? scorer.look.goalfx | 0 : 0 });
    this.ball.hidden = true;
    this.goalTimer = 0;
    this.setState('goal');
    if (this.overtime) this.matchOver = true;
  }

  goalShock(pos) {
    for (const car of this.cars) {
      if (car.demolished) continue;
      _v.copy(car.pos).sub(pos);
      const d = _v.length();
      if (d < 16) {
        _v.normalize();
        const s = (16 - d) * 1.6;
        car.vel.addScaledVector(_v, s).addScaledVector(UP, s * 0.35);
        car.groundLock = 0.2;
        car.onGround = false;
      }
    }
  }

  goalExplosion(pos, team, physical, style = 0) {
    const tc = TEAM_COLORS[team];
    const p = pos.clone();
    const fx = this.fx;
    const q = this.quality === 'low' ? 0.45 : this.quality === 'medium' ? 0.7 : 1;
    const burst = (pp, n, ...rest) => fx.burst(pp, Math.max(4, Math.round(n * q)), ...rest);
    switch (ITEMS.goalfx[style]?.name) {
      case 'Fireworks': {
        const cols = [tc.glow, 0xffd23a, 0xff4fa8, 0x7dff6e, 0xffffff];
        for (let k = 0; k < 6; k++) {
          setTimeout(() => {
            const q = p.clone().add(_v.set((Math.random() - 0.5) * 10, 2 + Math.random() * 6, (Math.random() - 0.5) * 6));
            burst(q, 70, 14, cols[k % cols.length], { life: 1.3, size: 0.55, drag: 1.2, grav: 4, whiteMix: 0.3 });
            this.audio.bounce(18, 0.6);
          }, k * 140);
        }
        burst(p, 60, 8, 0xffffff, { life: 0.8, size: 1.2, drag: 2.5, grow: 2 });
        break;
      }
      case 'Shockwave':
        for (let k = 0; k < 4; k++) setTimeout(() => { fx.ring(p, UP, k % 2 ? 0xffffff : tc.glow, 22 + k * 6, 0.9); fx.ring(p, _v.set(0, 0, 1), tc.glow, 16 + k * 4, 0.8); }, k * 110);
        burst(p, 120, 30, tc.glow, { life: 0.9, size: 0.7, drag: 3, whiteMix: 0.5 });
        break;
      case 'Confetti': {
        const cols = [0xff4f6d, 0xffd23a, 0x3ad7ff, 0x7dff6e, 0xb46bff, 0xffffff];
        for (const c of cols) burst(p, 45, 16, c, { life: 2.6, size: 0.35, drag: 1.4, grav: 2.5, up: true, alpha: 1 });
        fx.ring(p, UP, tc.glow, 12, 0.7);
        break;
      }
      case 'Lightning':
        for (let k = 0; k < 7; k++) {
          const a = (k / 7) * Math.PI * 2;
          for (let s2 = 0; s2 < 14; s2++) {
            const r = s2 * 0.9, jitter = (Math.random() - 0.5) * 1.2;
            fx.spawn(p.x + Math.cos(a) * r + jitter, p.y + Math.sin(s2 * 1.7) * 1.2, p.z + Math.sin(a) * r + jitter, 0, 0, 0, 0.5 + s2 * 0.02, 0.8, 0.75, 0.9, 1.0, 1);
          }
        }
        burst(p, 160, 22, 0x9fd8ff, { life: 0.9, size: 0.6, drag: 2.5, whiteMix: 0.6 });
        fx.ring(p, UP, 0xbfe8ff, 16, 0.5);
        break;
      case 'Supernova':
        burst(p, 90, -10, 0xffffff, { life: 0.45, size: 1.2, drag: 0, grow: -2 });
        setTimeout(() => {
          burst(p, 260, 34, 0xffb02e, { life: 1.8, size: 1.1, drag: 1.4, whiteMix: 0.5, grow: 0.6 });
          burst(p, 120, 18, tc.glow, { life: 1.4, size: 1.4, drag: 2, grow: 1.5 });
          fx.ring(p, UP, 0xffe08a, 26, 1.1);
          fx.ring(p, _v.set(0, 0, 1), 0xffffff, 20, 0.9);
          this.rig.shake(0.8);
        }, 380);
        break;
      default:
        burst(p, 220, 26, tc.glow, { life: 1.6, size: 1.0, drag: 1.6, whiteMix: 0.7, grow: 0.5 });
        burst(p, 80, 10, 0xffffff, { life: 1.0, size: 1.4, drag: 2.5, grow: 2 });
        fx.ring(p, _v.set(0, 0, 1), tc.glow, 18, 0.9);
        fx.ring(p, UP, 0xffffff, 12, 0.7);
    }
    this.rig.shake(0.6);
    if (this.arena.crowdMat) this.arena.crowdMat.uniforms.excite.value = 1.0;
  }

  afterGoal() {
    if (this.matchOver) return this.endMatch();
    if (this.timeUp && this.score[0] !== this.score[1]) return this.endMatch();
    if (this.timeUp) { this.overtime = true; this.timeLeft = 0; }
    this.kickoffReset(this.opts.mode === 'attract' ? 0.5 : 3);
  }

  // replays run slower around the moment the ball crosses the line
  replayRate() {
    const d = (this.replayT ?? 0) - (this.goalTime ?? 0);
    return d > -0.7 && d < 0.35 ? 0.3 : 0.85;
  }

  startReplay() {
    this.replayStart = Math.max(this.recorder.start, this.goalTime - 4.2);
    this.replayEnd = Math.min(this.recorder.end, this.goalTime + 1.3);
    this.replayT = this.replayStart;
    this.replayBoom = false;
    this.fx.clear();
    this.rig.snap();
    this.setState('replay');
  }

  skipReplay() {
    if (this.state === 'replay') this.endReplay();
  }

  endReplay() {
    this.ball.hidden = false;
    this.afterGoal();
  }

  tickClock(dt) {
    if (this.overtime) {
      this.timeLeft += dt;
    } else if (!this.timeUp) {
      this.timeLeft -= dt;
      if (this.timeLeft <= 0) {
        this.timeLeft = 0;
        this.timeUp = true;
        this.emitFx({ k: 'timeup' });
      }
    }
    if (this.timeUp && !this.overtime && this.ball.touchedGround) {
      if (this.score[0] === this.score[1]) {
        this.emitFx({ k: 'whistle' });
        this.overtime = true;
        this.timeLeft = 0;
        this.emitFx({ k: 'msg', t: 'OVERTIME', cls: 'overtime', d: 2 });
        this.kickoffReset(3);
      } else this.endMatch();
    }
  }

  endMatch() {
    this.matchOver = true;
    this.setState('ended');
    this.emitFx({ k: 'end', r: this.results() });
  }

  results() {
    return {
      mode: this.opts.mode,
      score: [...this.score],
      playerTeam: this.player ? this.player.team : 0,
      cars: this.cars.map(c => ({ name: c.name, team: c.team, owner: c.owner, isPlayer: c.isPlayer, ...c.stats })),
    };
  }

  clockText() {
    if (this.opts.mode === 'challenge') return formatTime(this.timeLeft, false);
    if (this.opts.mode !== 'match') return '∞';
    return formatTime(this.timeLeft, this.overtime);
  }

  updateJumbo() {
    const text = this.clockText();
    if (text === this._jumboText && !this.jumboDirty) return;
    this._jumboText = text;
    this.jumboDirty = false;
    if (this.arena.drawJumbo) this.arena.drawJumbo(this.score[0], this.score[1], text);
  }

  nearFactor(p) {
    const d = p.distanceTo(this.rig.camera.position);
    return Math.max(0.15, Math.min(1, 1.2 - d / 60));
  }

  // ---------- effects (local + broadcast when hosting) ----------
  emitFx(e) {
    this.applyFx(e);
    if (this.role === 'host' && this.net) this.net.broadcast({ t: 'e', e });
  }

  applyFx(e) {
    const car = e.c !== undefined && e.c >= 0 ? this.cars[e.c] : null;
    const pos = e.p ? _pre.fromArray(e.p) : null;
    const show = this.opts.mode !== 'attract';
    const vib = (pattern) => { if (navigator.vibrate && this.input.settings.vibrate) navigator.vibrate(pattern); };
    switch (e.k) {
      case 'bounce': this.audio.bounce(e.s, this.nearFactor(pos)); break;
      case 'bump': this.audio.hit(e.s * 0.6, this.nearFactor(pos)); break;
      case 'touch': {
        if (!car) break;
        this.ball.lastTeam = car.team;
        this.ball.lastHit = this.time;
        this.ball.lastHitStrength = e.s;
        this.audio.hit(e.s, this.nearFactor(pos));
        if (e.s > 6) this.fx.burst(pos, Math.min(40, 6 + e.s), 3 + e.s * 0.25, 0xfff2b0, { life: 0.45, size: 0.3, drag: 3, whiteMix: 0.6 });
        if (car === this.player && e.s > 10) vib(15);
        break;
      }
      case 'pad': {
        const pd = BOOST_PADS[e.i];
        if (car === this.player) { this.audio.pickup(pd.big); this.hud.boostPop(pd.big ? 100 : 12); }
        _v.set(pd.x, pd.big ? 1.3 : 0.3, pd.z);
        this.fx.burst(_v, pd.big ? 40 : 10, pd.big ? 6 : 3, 0x59f3ff, { life: 0.6, size: pd.big ? 0.6 : 0.35, up: true, drag: 2.5 });
        if (this.role === 'client' && this.pads[e.i]) this.pads[e.i].active = false;
        break;
      }
      case 'demo': {
        const vic = this.cars[e.v];
        this.fx.burst(pos, 90, 14, 0xff8a2a, { life: 1.1, size: 0.9, drag: 2, whiteMix: 0.5, grow: 0.8 });
        this.fx.burst(pos, 40, 6, 0x333333, { life: 1.6, size: 1.6, drag: 1.5, grow: 1.5, alpha: 0.6 });
        this.fx.ring(pos, UP, 0xffa040, 6, 0.5);
        this.audio.demolish();
        this.rig.shake(vic === this.player || car === this.player ? 0.6 : 0.15 * this.nearFactor(pos));
        if (car && show) this.hud.feed(`<b class="t${car.team}">${car.name}</b> 💥 <b class="t${vic.team}">${vic.name}</b>`, car.team);
        if (car && car === this.player) this.hud.callout('DEMOLITION', 25);
        if (vic === this.player) vib([30, 40, 60]);
        break;
      }
      case 'shot': if (car === this.player) this.hud.callout('SHOT ON TARGET', 20); break;
      case 'save':
        if (!car) break;
        this.hud.feed(`🛡 <b class="t${car.team}">${car.name}</b> made a save`, car.team);
        if (car === this.player) { this.hud.message('SAVE!', 'save t' + car.team, 1.2); this.hud.callout('SAVE', 50); }
        break;
      case 'goal': {
        const team = e.team;
        const scorer = e.s >= 0 ? this.cars[e.s] : null;
        const assist = e.a >= 0 ? this.cars[e.a] : null;
        this.lastGoalFx = e.fx | 0;
        this.goalExplosion(pos, team, false, this.lastGoalFx);
        if (this.role === 'client') { this.ball.hidden = true; this.goalScorer = scorer; this.lastGoalTeam = team; }
        if (!show) break;
        const ours = this.player ? this.player.team === team : true;
        this.audio.goal(ours);
        const sub = scorer ? `${scorer === this.player ? 'YOU SCORED' : scorer.name.toUpperCase() + ' SCORED'}${assist ? '  ·  ASSIST ' + assist.name.toUpperCase() : ''}` : 'OWN GOAL';
        if (scorer && scorer === this.player) this.hud.callout('GOAL', 100);
        if (assist && assist === this.player) this.hud.callout('ASSIST', 50);
        this.hud.goal(team, 'GOAL', sub, e.v, 2.8);
        this.hud.feed(scorer ? `⚽ <b class="t${team}">${scorer.name}</b>${assist ? ` <small>(${assist.name})</small>` : ''}` : `⚽ own goal`, team);
        vib(ours ? [40, 60, 120] : 60);
        break;
      }
      case 'timeup': this.hud.subMessage('Time! The match ends when the ball hits the ground', 2.5); break;
      case 'whistle': this.audio.whistle(); break;
      case 'msg': this.hud.message(e.t, e.cls || '', e.d || 1.5); break;
      case 'end': {
        this.audio.whistle();
        const res = e.r;
        if (this.role === 'client') {
          res.cars.forEach(c => { c.isPlayer = c.owner != null && c.owner === this.opts.localOwner; });
          res.playerTeam = this.player ? this.player.team : 0;
          this.matchOver = true;
          this.setState('ended');
        }
        if (this.onEnd) this.onEnd(res);
        break;
      }
      default: break;
    }
  }

  // ---------- networking: host ----------
  sendSnapshots() {
    const b = this.ball;
    const base = {
      t: 's', tm: r3(this.time), st: this.state, cd: r3(this.countdown || 0), tl: r3(this.timeLeft || 0),
      ot: this.overtime ? 1 : 0, tu: this.timeUp ? 1 : 0, sc: this.score, ko: this.kickoff ? 1 : 0,
      rt: r3(this.replayT || 0), re: r3(this.replayEnd || 0), gt: r3(this.goalTime || 0),
      gs: this.goalScorer ? this.cars.indexOf(this.goalScorer) : -1, gT: this.lastGoalTeam ?? 0,
      b: [...b.pos.toArray().map(r3), r3(b.quat.x), r3(b.quat.y), r3(b.quat.z), r3(b.quat.w), ...b.vel.toArray().map(r3), b.hidden ? 1 : 0],
      c: this.cars.map(c => c.netState()),
      p: this.pads.map(p => (p.active ? 1 : 0)).join(''),
    };
    for (const [id, r] of this.remote) {
      if (!this.net.conns.has(id)) continue;
      base.a = r.ack;
      this.net.send(id, base);
    }
  }

  receiveInput(id, msg) {
    const r = this.remote.get(id);
    if (!r) return;
    if (msg.s <= r.ack) return;
    r.ack = msg.s;
    unpackControls(msg.c, r.input);
    if (r.input.jump) r.pressSeen = true;
  }

  // a guest left: let a bot take over the car
  dropRemote(id) {
    const r = this.remote.get(id);
    if (!r) return;
    this.remote.delete(id);
    r.car.owner = null;
    r.car.name += ' (bot)';
    this.bots.push(new Bot(r.car, this.opts.difficulty));
    this.hud.clearLabels();
  }

  // ---------- networking: guest ----------
  receiveSnapshot(s) {
    s.recv = performance.now();
    this.snapshots.push(s);
    if (this.snapshots.length > 40) this.snapshots.shift();
    const p = this.player;
    if (!p) return;
    const idx = this.cars.indexOf(p);
    const predicting = (s.st === 'playing' || s.st === 'goal');
    _pre.copy(p.pos);
    p.applyNetState(s.c[idx]);
    this.inputHistory = this.inputHistory.filter(h => h.seq > s.a);
    if (predicting && !p.demolished) {
      // replay inputs the host has not processed yet
      const saved = { ...p.controls };
      const ev = p.events;
      p.events = null;
      let acc = 0;
      for (const h of this.inputHistory) {
        Object.assign(p.controls, h.c);
        acc += h.dt;
        while (acc >= PHYS_STEP) { p.step(PHYS_STEP, this.time); acc -= PHYS_STEP; }
      }
      p.events = ev;
      Object.assign(p.controls, saved);
    }
    _pre.sub(p.pos);
    this.ownOffset.add(_pre);
    if (this.ownOffset.lengthSq() > 9) this.ownOffset.set(0, 0, 0);
  }

  updateClient(dt) {
    const snaps = this.snapshots;
    if (!snaps.length) return;
    const latest = snaps[snaps.length - 1];
    const now = performance.now();
    // clock: render other objects a little in the past for smooth interpolation
    const target = latest.tm + (now - latest.recv) / 1000 - NET_DELAY;
    this.netTime += dt;
    const err = target - this.netTime;
    if (Math.abs(err) > 0.3) this.netTime = target;
    else this.netTime += err * Math.min(1, dt * 3);
    this.time = this.netTime;

    // match state from the host
    const prev = this.state;
    if (latest.st !== prev) {
      if (latest.st === 'replay') { this.replayBoom = false; this.fx.clear(); this.rig.snap(); }
      if (latest.st === 'countdown') { this.rig.snap(); this.lastCount = 4; this.inputHistory = []; this.input.reset(); }
      if (latest.st === 'playing' && prev === 'countdown') this.goHud();
      if (latest.st !== 'ended') this.setState(latest.st);
    }
    if (this.score[0] !== latest.sc[0] || this.score[1] !== latest.sc[1]) this.jumboDirty = true;
    this.score = [...latest.sc];
    this.timeLeft = latest.tl;
    this.overtime = !!latest.ot;
    this.timeUp = !!latest.tu;
    this.kickoff = !!latest.ko;
    this.goalTime = latest.gt;
    this.replayEnd = latest.re;
    this.lastGoalTeam = latest.gT;
    this.goalScorer = latest.gs >= 0 ? this.cars[latest.gs] : null;
    if (this.state === 'countdown') {
      this.countdown = Math.max(0, latest.cd - (now - latest.recv) / 1000);
      this.countdownHud();
    }
    if (this.state === 'replay') {
      this.replayT = latest.rt + (now - latest.recv) / 1000 * this.replayRate();
      if (!this.replayBoom && this.replayT >= this.goalTime) {
        this.replayBoom = true;
        this.goalExplosion(this.replayProxies.ball.pos, this.lastGoalTeam, false, this.lastGoalFx | 0);
      }
    }
    for (let i = 0; i < this.pads.length; i++) this.pads[i].active = latest.p[i] === '1';

    // interpolate everything except our own car
    let a = snaps[0], b = snaps[0];
    for (let i = 0; i < snaps.length; i++) {
      if (snaps[i].tm <= this.netTime) a = snaps[i];
      if (snaps[i].tm >= this.netTime) { b = snaps[i]; break; }
      b = snaps[i];
    }
    const span = b.tm - a.tm;
    const k = span > 1e-4 ? Math.min(1, Math.max(0, (this.netTime - a.tm) / span)) : 1;
    this.cars.forEach((car, i) => {
      if (car === this.player) return;
      car.applyNetState(a.c[i]);
      const B = b.c[i];
      car.pos.lerp(_v.set(B[0], B[1], B[2]), k);
      car.quat.slerp(_q2.set(B[3], B[4], B[5], B[6]).normalize(), k);
      car.vel.lerp(_v.set(B[7], B[8], B[9]), k);
      car.controls.steer = car.netSteer;
      if (car.onGround) car.wheelSpin += car.vel.dot(car.forward(_w)) * dt / 0.18;
    });
    const ball = this.ball;
    const A = a.b, Bb = b.b;
    ball.pos.set(A[0], A[1], A[2]).lerp(_v.set(Bb[0], Bb[1], Bb[2]), k);
    ball.quat.set(A[3], A[4], A[5], A[6]).normalize().slerp(_q2.set(Bb[3], Bb[4], Bb[5], Bb[6]).normalize(), k);
    ball.vel.set(A[7], A[8], A[9]).lerp(_v.set(Bb[7], Bb[8], Bb[9]), k);
    ball.hidden = (k < 0.5 ? A[10] : Bb[10]) === 1;

    // our own car: read input, send it, and predict locally
    const p = this.player;
    if (p) {
      this.input.read(p.controls, p.onGround);
      this.inputSeq++;
      const c = packControls(p.controls);
      if (this.net) this.net.send('host', { t: 'i', s: this.inputSeq, c });
      const predicting = (this.state === 'playing' || this.state === 'goal') && !p.demolished;
      if (predicting) {
        this.inputHistory.push({ seq: this.inputSeq, dt, c: { ...p.controls } });
        if (this.inputHistory.length > 240) this.inputHistory.shift();
        this.ownAcc += Math.min(dt, 0.1);
        while (this.ownAcc >= PHYS_STEP) { p.savePrev(); p.step(PHYS_STEP, this.time); this.ownAcc -= PHYS_STEP; }
      } else {
        this.ownAcc = 0;
      }
    }
    this.ownOffset.multiplyScalar(Math.exp(-10 * dt));

    if (this.state === 'playing' || this.state === 'goal') this.recorder.record(this.netTime, this.ball, this.cars);
    if (this.jumboDirty || this.state === 'playing') this.updateJumbo();
  }

  // ---------- views ----------
  render(dt, time) {
    const replay = this.state === 'replay';
    if (replay) this.recorder.apply(this.replayT, this.replayProxies.ball, this.replayProxies.cars);

    // ball
    const b = replay ? this.replayProxies.ball : this.ball;
    const bPos = replay ? b.pos : this.ball.renderPos;
    const bQuat = replay ? b.quat : this.ball.renderQuat;
    const bv = this.ballView.group;
    bv.visible = !b.hidden;
    bv.position.copy(bPos);
    this.ballView.mesh.quaternion.copy(bQuat);
    this.ballShadow.visible = !b.hidden && bPos.y < 30;
    this.ballShadow.position.set(bPos.x, 0.03, bPos.z);
    const ss = 1 + bPos.y * 0.05;
    this.ballShadow.scale.set(ss, ss, ss);
    this.ballShadow.material.opacity = Math.max(0.15, 1 - bPos.y / 22) * (this.shadows ? 0.35 : 1);
    const sinceHit = this.time - (this.ball.lastHit ?? -10);
    const flash = replay ? 0 : Math.max(0, 1 - sinceHit * 3) * Math.min(1, (this.ball.lastHitStrength || 0) / 15);
    this.ballView.halo.material.opacity = flash * 0.9;
    if (this.ballView.setGlow) this.ballView.setGlow(flash, this.ball.lastTeam);
    if (!replay && !b.hidden && this.ball.vel.lengthSq() > 600) {
      const tc = this.ball.lastTeam !== undefined ? TEAM_COLORS[this.ball.lastTeam].glow : 0xffffff;
      _col.set(tc);
      this.fx.spawn(bPos.x, bPos.y, bPos.z, 0, 0, 0, 0.35, 1.3, _col.r, _col.g, _col.b, 0.35, { grow: -2 });
    }

    // cars
    this.cars.forEach((car, i) => {
      const view = this.views.get(car);
      const src = replay ? this.replayProxies.cars[i] : car;
      view.root.visible = !src.demolished;
      if (src.demolished) return;
      const pos = replay ? src.pos : car.renderPos;
      const quat = replay ? src.quat : car.renderQuat;
      view.root.position.copy(pos);
      view.root.quaternion.copy(quat);
      if (replay) car.renderPos.copy(pos);
      // squash & stretch on jumps, lean in turns
      const sq = replay ? 0 : car.squash;
      view.model.scale.set(1 + sq * 0.06, 1 - sq * 0.1, 1 + sq * 0.04);
      const lean = replay || !car.onGround ? 0 : -car.steerEff * Math.min(1, car.speed() / 14) * 0.06;
      view.model.rotation.z += (lean - view.model.rotation.z) * Math.min(1, 10 * dt);
      // wheels
      const steer = replay ? 0 : (car.steerEff ?? car.controls.steer);
      car.steerVis += (steer - car.steerVis) * Math.min(1, 14 * dt);
      for (const w of view.wheels) {
        w.spin.rotation.x = car.wheelSpin;
        if (w.front) w.pivot.rotation.y = -car.steerVis * 0.45;
      }
      view.glow.visible = replay ? true : car.onGround;
      if (view.blob) view.blob.visible = replay ? true : car.onGround;
      // boost flames + trail
      const boosting = src.boosting;
      view.flames.visible = boosting;
      if (boosting) {
        const s = 0.8 + Math.random() * 0.5;
        view.flames.scale.set(1, 1, s);
        _v.set(0, -0.02, -0.95).applyQuaternion(quat).add(pos);
        _v2.set(0, 0, -1).applyQuaternion(quat);
        const bc = view.boostRGB;
        const n = this.quality === 'high' ? 2 : 1;
        for (let k = 0; k < n; k++) {
          this.fx.spawn(_v.x, _v.y, _v.z,
            _v2.x * 6 + (Math.random() - 0.5), _v2.y * 6 + (Math.random() - 0.5), _v2.z * 6 + (Math.random() - 0.5),
            0.35, 0.45, bc[0], bc[1], bc[2], 0.8, { drag: 2, grow: 1.2 });
        }
      }
      if (!replay && car.supersonic) this.trail(car, pos, quat, time);
      if (view.spinner) view.spinner.rotation.y += dt * (8 + car.speed());
    });

    this.padsView.update(this.pads, time);
    if (this.arena.crowdMat) {
      const u = this.arena.crowdMat.uniforms;
      u.time.value = time;
      u.excite.value = Math.max(0.12, u.excite.value - dt * 0.25);
    }
    if (this.arena.update) this.arena.update(dt, time, this.rig.camera);
  }

  trail(car, pos, quat, time) {
    const name = ITEMS.trail[car.look ? car.look.trail | 0 : 0]?.name;
    _v.set((Math.random() - 0.5) * 0.6, 0.1, -0.7).applyQuaternion(quat).add(pos);
    let r = 1, g = 1, b = 1, size = 0.35, life = 0.3, grow = -0.8, a = 0.6;
    switch (name) {
      case 'Fire': r = 1; g = 0.45 + Math.random() * 0.3; b = 0.1; size = 0.55; grow = 0.6; break;
      case 'Ice': r = 0.7; g = 0.92; b = 1; size = 0.45; life = 0.5; break;
      case 'Rainbow': _col.setHSL((time * 0.6 + Math.random() * 0.1) % 1, 0.9, 0.6); r = _col.r; g = _col.g; b = _col.b; size = 0.5; life = 0.5; grow = 0; a = 0.8; break;
      case 'Neon': _col.set(TEAM_COLORS[car.team].glow); r = _col.r; g = _col.g; b = _col.b; size = 0.45; life = 0.4; a = 0.9; break;
      case 'Stardust': r = 1; g = 0.9; b = 0.6; size = 0.25; life = 0.8; grow = -0.2; a = 1; break;
      default: break;
    }
    this.fx.spawn(_v.x, _v.y, _v.z, 0, 0, 0, life, size, r, g, b, a, { grow });
  }

  dust(car, amount) {
    _v.copy(car.pos).addScaledVector(car.normal, -CAR.RIDE + 0.05);
    this.fx.burst(_v, amount, 3, this.arena.dustColor ?? 0xcfd8c0, { life: 0.5, size: 0.45, drag: 3, grow: 1.2, alpha: 0.35, up: true });
  }
}
