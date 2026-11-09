// Match orchestration: physics stepping, rules, scoring, effects and views.
import * as THREE from 'three';
import { ARENA, BALL, CAR, BOOST_PADS, KICKOFF_SPOTS, KICKOFF_SETS, BOT_NAMES, TEAM_COLORS, PHYS_STEP } from './config.js';
import { Ball, stepBall, BallPredictor } from './ball.js';
import { Car } from './car.js';
import { Bot, assignRoles } from './ai.js';
import { buildCarMesh, buildBallMesh, buildShadowMesh } from './models.js';
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

    this.ball = new Ball();
    this.ballView = buildBallMesh();
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
  }

  // ---------- setup ----------
  setup(opts) {
    this.opts = { mode: 'match', teamSize: 2, difficulty: 'normal', duration: 300, body: 0, paint: null, replays: true, ...opts };
    for (const v of this.views.values()) this.scene.remove(v.root);
    this.views.clear();
    this.hud.clearLabels();
    this.cars = [];
    this.bots = [];
    this.player = null;
    const names = shuffle([...BOT_NAMES]);
    const o = this.opts;
    const sizes = o.mode === 'training' ? [1, 0] : [o.teamSize, o.teamSize];
    for (const team of [0, 1]) {
      for (let i = 0; i < sizes[team]; i++) {
        const isPlayer = o.mode !== 'attract' && team === 0 && i === 0;
        const car = new Car(team, isPlayer ? 'Jij' : names.pop(), {
          isPlayer,
          body: isPlayer ? o.body : (Math.random() * 3) | 0,
          paint: isPlayer ? o.paint : null,
        });
        car.events = this.carEvents();
        this.cars.push(car);
        if (isPlayer) this.player = car;
        else this.bots.push(new Bot(car, o.difficulty));
        const view = buildCarMesh(team, car.body, car.paint, this.quality);
        this.scene.add(view.root);
        this.views.set(car, view);
        car.renderPos = new THREE.Vector3();
      }
    }
    this.replayProxies.cars = this.cars.map(() => ({ pos: new THREE.Vector3(), quat: new THREE.Quaternion(), boosting: false, demolished: false }));
    for (const c of this.cars) {
      c.stats = { goals: 0, assists: 0, saves: 0, shots: 0, points: 0, demos: 0 };
      c.unlimitedBoost = o.mode === 'training';
    }
    this.score = [0, 0];
    this.timeLeft = o.mode === 'match' ? o.duration : 0;
    this.overtime = false;
    this.timeUp = false;
    this.matchOver = false;
    this.fx.clear();
    this.kickoffReset(o.mode === 'attract' ? 0.01 : 3);
    this.updateJumbo();
  }

  carEvents() {
    return {
      jump: (car) => { if (car === this.player) this.audio.jump(); },
      dodge: (car) => { if (car === this.player) this.audio.dodge(); },
      land: (car) => { if (car === this.player) this.audio.land(0.6); },
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
  update(dt) {
    if (this.paused) return;
    const o = this.opts;
    switch (this.state) {
      case 'countdown': {
        this.countdown -= dt;
        const n = Math.ceil(this.countdown);
        if (o.mode !== 'attract' && n !== this.lastCount && n > 0 && n <= 3) {
          this.hud.message(String(n), 'count', 0.9);
          this.audio.countdown(false);
        }
        this.lastCount = n;
        if (this.countdown <= 0) {
          if (o.mode !== 'attract') {
            this.hud.message(this.overtime ? 'VERLENGING!' : 'GO!', 'go', 0.8);
            this.audio.countdown(true);
          }
          this.setState('playing');
        }
        this.readControls(dt);
        break;
      }
      case 'playing': {
        this.readControls(dt);
        this.simulate(dt);
        if (o.mode === 'match') this.tickClock(dt);
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
        this.replayT += dt * 0.8;
        if (!this.replayBoom && this.replayT >= this.goalTime) {
          this.replayBoom = true;
          this.goalExplosion(this.replayProxies.ball.pos, this.lastGoalTeam, false);
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
  }

  readControls(dt) {
    const frozen = this.state === 'countdown';
    if (this.player) {
      this.input.read(this.player.controls, this.player.onGround);
    }
    if (!frozen) {
      assignRoles(this);
      for (const b of this.bots) b.update(dt, this);
    }
  }

  simulate(dt) {
    this.acc += Math.min(dt, 0.1);
    let steps = 0;
    while (this.acc >= PHYS_STEP && steps < 12) {
      this.physicsStep(PHYS_STEP);
      this.acc -= PHYS_STEP;
      steps++;
    }
    if (steps >= 12) this.acc = 0;
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
        this.audio.bounce(impact, this.nearFactor(this.ball.pos));
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
        if (-vrel > 4) this.audio.hit(-vrel * 0.6, this.nearFactor(a.pos));
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
    this.fx.burst(vic.pos, 90, 14, 0xff8a2a, { life: 1.1, size: 0.9, drag: 2, whiteMix: 0.5, grow: 0.8 });
    this.fx.burst(vic.pos, 40, 6, 0x333333, { life: 1.6, size: 1.6, drag: 1.5, grow: 1.5, alpha: 0.6 });
    this.fx.ring(vic.pos, UP, 0xffa040, 6, 0.5);
    this.audio.demolish();
    this.rig.shake(vic === this.player || atk === this.player ? 0.6 : 0.15 * this.nearFactor(vic.pos));
    if (atk) {
      atk.stats.demos++;
      atk.stats.points += 25;
      if (this.opts.mode !== 'attract') this.hud.feed(`<b class="t${atk.team}">${atk.name}</b> 💥 <b class="t${vic.team}">${vic.name}</b>`, atk.team);
      if (atk === this.player) this.hud.subMessage('DEMOLITIE!', 1.2);
    }
    if (vic === this.player && navigator.vibrate && this.input.settings.vibrate) navigator.vibrate([30, 40, 60]);
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
          if (car === this.player) this.audio.pickup(pd.big);
          _v.set(pd.x, pd.big ? 1.3 : 0.3, pd.z);
          this.fx.burst(_v, pd.big ? 40 : 10, pd.big ? 6 : 3, 0x59f3ff, { life: 0.6, size: pd.big ? 0.6 : 0.35, up: true, drag: 2.5 });
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
    this.ball.lastTeam = car.team;
    this.audio.hit(strength, this.nearFactor(at));
    if (strength > 6) {
      this.fx.burst(at, Math.min(40, 6 + strength), 3 + strength * 0.25, 0xfff2b0, { life: 0.45, size: 0.3, drag: 3, whiteMix: 0.6 });
    }
    if (car === this.player && navigator.vibrate && this.input.settings.vibrate && strength > 10) navigator.vibrate(15);
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
      if (car === this.player) this.hud.subMessage('SCHOT OP DOEL', 1.0);
    }
    if (pt.prevThreat === car.team && g !== car.team) {
      car.stats.saves++;
      car.stats.points += 50;
      this.hud.feed(`<b class="t${car.team}">${car.name}</b> redt!`, car.team);
      if (car === this.player) this.hud.message('REDDING!', 'save t' + car.team, 1.2);
    }
  }

  // ---------- goals ----------
  onGoal(goalTeam) {
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
    this.goalExplosion(this.ball.pos, scoringTeam, true);
    this.ball.hidden = true;
    this.goalTimer = 0;
    this.setState('goal');
    if (this.opts.mode === 'attract') return;

    const ours = this.player ? this.player.team === scoringTeam : true;
    this.audio.goal(ours);
    const sub = scorer ? `${scorer === this.player ? 'Jij scoort' : scorer.name + ' scoort'}${assist ? ' • assist ' + assist.name : ''}` : 'Eigen doelpunt!';
    this.hud.message('GOAL!', 'goal t' + scoringTeam, 2.8, sub);
    this.hud.feed(scorer ? `⚽ <b class="t${scoringTeam}">${scorer.name}</b>${assist ? ` <small>(${assist.name})</small>` : ''}` : `⚽ eigen goal`, scoringTeam);
    if (navigator.vibrate && this.input.settings.vibrate) navigator.vibrate(ours ? [40, 60, 120] : 60);
    if (this.overtime) this.matchOver = true;
  }

  goalExplosion(pos, team, physical) {
    const tc = TEAM_COLORS[team];
    this.fx.burst(pos, 220, 26, tc.glow, { life: 1.6, size: 1.0, drag: 1.6, whiteMix: 0.7, grow: 0.5 });
    this.fx.burst(pos, 80, 10, 0xffffff, { life: 1.0, size: 1.4, drag: 2.5, grow: 2 });
    this.fx.ring(pos, _v.set(0, 0, 1), tc.glow, 18, 0.9);
    this.fx.ring(pos, UP, 0xffffff, 12, 0.7);
    this.rig.shake(1.1);
    if (this.arena.crowdMat) this.arena.crowdMat.uniforms.excite.value = 1.0;
    if (!physical) return;
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

  afterGoal() {
    if (this.matchOver) return this.endMatch();
    if (this.timeUp && this.score[0] !== this.score[1]) return this.endMatch();
    if (this.timeUp) { this.overtime = true; this.timeLeft = 0; }
    this.kickoffReset(this.opts.mode === 'attract' ? 0.5 : 3);
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
        this.hud.subMessage('Laatste aanraking telt… bal moet de grond raken', 2.5);
      }
    }
    if (this.timeUp && !this.overtime && this.ball.touchedGround) {
      this.audio.whistle();
      if (this.score[0] === this.score[1]) {
        this.overtime = true;
        this.timeLeft = 0;
        this.hud.message('VERLENGING', 'overtime', 2);
        this.kickoffReset(3);
      } else this.endMatch();
    }
  }

  endMatch() {
    this.matchOver = true;
    this.setState('ended');
    this.audio.whistle();
    if (this.onEnd) this.onEnd(this.results());
  }

  results() {
    return {
      score: [...this.score],
      playerTeam: this.player ? this.player.team : 0,
      cars: this.cars.map(c => ({ name: c.name, team: c.team, isPlayer: c.isPlayer, ...c.stats })),
    };
  }

  clockText() {
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

  // ---------- views ----------
  render(dt, time) {
    const replay = this.state === 'replay';
    if (replay) this.recorder.apply(this.replayT, this.replayProxies.ball, this.replayProxies.cars);

    // ball
    const b = replay ? this.replayProxies.ball : this.ball;
    const bv = this.ballView.group;
    bv.visible = !b.hidden;
    bv.position.copy(b.pos);
    this.ballView.mesh.quaternion.copy(b.quat);
    this.ballShadow.visible = !b.hidden && b.pos.y < 30;
    this.ballShadow.position.set(b.pos.x, 0.03, b.pos.z);
    const ss = 1 + b.pos.y * 0.05;
    this.ballShadow.scale.set(ss, ss, ss);
    this.ballShadow.material.opacity = Math.max(0.15, 1 - b.pos.y / 22);
    if (!replay && !b.hidden && this.ball.vel.lengthSq() > 600) {
      const tc = this.ball.lastTeam !== undefined ? TEAM_COLORS[this.ball.lastTeam].glow : 0xffffff;
      _c.set(tc);
      this.fx.spawn(b.pos.x, b.pos.y, b.pos.z, 0, 0, 0, 0.35, 1.3, _c.r, _c.g, _c.b, 0.35, { grow: -2 });
    }

    // cars
    this.cars.forEach((car, i) => {
      const view = this.views.get(car);
      const src = replay ? this.replayProxies.cars[i] : car;
      view.root.visible = !src.demolished;
      if (src.demolished) return;
      view.root.position.copy(src.pos);
      view.root.quaternion.copy(src.quat);
      car.renderPos.copy(src.pos);
      // wheels
      const steer = replay ? 0 : car.controls.steer;
      car.steerVis += (steer - car.steerVis) * Math.min(1, 12 * dt);
      for (const w of view.wheels) {
        w.spin.rotation.x = car.wheelSpin;
        if (w.front) w.pivot.rotation.y = -car.steerVis * 0.45;
      }
      view.glow.visible = replay ? true : car.onGround;
      // boost flames + trail
      const boosting = src.boosting;
      view.flames.visible = boosting;
      if (boosting) {
        const s = 0.8 + Math.random() * 0.5;
        view.flames.scale.set(1, 1, s);
        _v.set(0, -0.02, -0.95).applyQuaternion(src.quat).add(src.pos);
        _v2.set(0, 0, -1).applyQuaternion(src.quat);
        const n = this.quality === 'high' ? 2 : 1;
        for (let k = 0; k < n; k++) {
          this.fx.spawn(_v.x, _v.y, _v.z,
            _v2.x * 6 + (Math.random() - 0.5), _v2.y * 6 + (Math.random() - 0.5), _v2.z * 6 + (Math.random() - 0.5),
            0.35, 0.45, 0.45, 0.85, 1.0, 0.8, { drag: 2, grow: 1.2 });
        }
      }
      if (!replay && car.supersonic) {
        _v.set((Math.random() - 0.5) * 0.6, 0.1, -0.7).applyQuaternion(src.quat).add(src.pos);
        this.fx.spawn(_v.x, _v.y, _v.z, 0, 0, 0, 0.3, 0.35, 1, 1, 1, 0.6, { grow: -0.8 });
      }
    });

    this.padsView.update(this.pads, time);
    if (this.arena.crowdMat) {
      const u = this.arena.crowdMat.uniforms;
      u.time.value = time;
      u.excite.value = Math.max(0.12, u.excite.value - dt * 0.25);
    }
  }
}
