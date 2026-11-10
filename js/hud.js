// In-match HUD (DOM based): scoreboard, clock, boost, callouts, minimap, name tags.
import * as THREE from '../vendor/three.module.min.js';
import { TEAM_COLORS, ARENA } from './config.js';

const $ = (id) => document.getElementById(id);
const _v = new THREE.Vector3();

export function formatTime(t, overtime) {
  const s = Math.max(0, overtime ? Math.floor(t) : Math.ceil(t));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return (overtime ? '+' : '') + m + ':' + String(r).padStart(2, '0');
}

export class Hud {
  constructor() {
    this.root = $('hud');
    this.scoreB = $('score-blue');
    this.scoreR = $('score-red');
    this.clock = $('clock');
    this.mode = $('sb-mode');
    this.dots = [$('dots0'), $('dots1')];
    this.feedEl = $('feed');
    this.callEl = $('callouts');
    this.center = $('center-msg');
    this.sub = $('sub-msg');
    this.labelsEl = $('labels');
    this.arrow = $('ball-arrow');
    this.boostRing = $('boost-ring');
    this.boostNum = $('boost-num');
    this.speedVal = $('speed-val');
    this.minimap = $('minimap');
    this.mctx = this.minimap.getContext('2d');
    this.labels = new Map();
    this.msgTimer = 0;
    this.subTimer = 0;
    this.lastBoost = -1;
    this.lastClock = '';
    this.lastDots = '';
    this.mapTimer = 0;
    this.ringLen = 2 * Math.PI * 42;
    this.boostRing.style.strokeDasharray = `${this.ringLen}`;
  }

  show(on) { this.root.classList.toggle('hidden', !on); }

  setMode(text) { this.mode.textContent = text; }

  setScore(b, r) {
    if (this.scoreB.textContent !== String(b)) { this.scoreB.textContent = b; this._pop(this.scoreB); }
    if (this.scoreR.textContent !== String(r)) { this.scoreR.textContent = r; this._pop(this.scoreR); }
  }

  _pop(el) {
    el.classList.remove('pop');
    void el.offsetWidth;
    el.classList.add('pop');
  }

  setClock(text, overtime, secondsLeft) {
    if (text !== this.lastClock) {
      this.clock.textContent = text;
      this.lastClock = text;
    }
    this.clock.classList.toggle('overtime', !!overtime);
    this.clock.classList.toggle('low', !overtime && secondsLeft !== undefined && secondsLeft <= 10 && secondsLeft > 0);
  }

  setTeams(cars) {
    const key = cars.map(c => c.team + (c.demolished ? 'x' : 'o')).join('');
    if (key === this.lastDots) return;
    this.lastDots = key;
    for (const t of [0, 1]) {
      this.dots[t].innerHTML = cars.filter(c => c.team === t).map(c => `<i class="${c.demolished ? 'out' : ''}"></i>`).join('');
    }
  }

  setBoost(v, unlimited) {
    const b = Math.round(v);
    if (b === this.lastBoost && !unlimited) return;
    this.lastBoost = b;
    this.boostNum.textContent = unlimited ? '∞' : b;
    const frac = unlimited ? 1 : v / 100;
    this.boostRing.style.strokeDashoffset = `${this.ringLen * (1 - frac)}`;
    this.boostRing.classList.toggle('low', b < 15 && !unlimited);
  }

  setSpeed(kmh) { this.speedVal.textContent = Math.round(kmh); }

  message(text, cls = '', dur = 1.5, sub = '') {
    this.center.textContent = text;
    this.center.className = 'show ' + cls;
    this.msgTimer = dur;
    if (sub) this.subMessage(sub, dur);
  }

  subMessage(text, dur = 1.5) {
    this.sub.textContent = text;
    this.sub.className = 'show';
    this.subTimer = dur;
  }

  // small "+points" banner under the scoreboard
  callout(text, points) {
    const el = document.createElement('div');
    el.className = 'callout';
    el.innerHTML = `<span>${text}</span>${points ? `<b>+${points}</b>` : ''}`;
    this.callEl.appendChild(el);
    while (this.callEl.children.length > 3) this.callEl.firstChild.remove();
    setTimeout(() => el.remove(), 2600);
  }

  clearMessage() {
    this.center.className = '';
    this.sub.className = '';
    this.msgTimer = 0;
    this.subTimer = 0;
    this.callEl.innerHTML = '';
  }

  feed(html, team = -1) {
    const el = document.createElement('div');
    el.className = 'feed-item' + (team >= 0 ? ' t' + team : '');
    el.innerHTML = html;
    this.feedEl.prepend(el);
    while (this.feedEl.children.length > 4) this.feedEl.lastChild.remove();
    setTimeout(() => el.classList.add('fade'), 3500);
    setTimeout(() => el.remove(), 4200);
  }

  update(dt) {
    if (this.msgTimer > 0) {
      this.msgTimer -= dt;
      if (this.msgTimer <= 0) this.center.className = '';
    }
    if (this.subTimer > 0) {
      this.subTimer -= dt;
      if (this.subTimer <= 0) this.sub.className = '';
    }
  }

  // top-down radar of the pitch
  drawMinimap(cars, ballPos, player, dt) {
    this.mapTimer -= dt;
    if (this.mapTimer > 0) return;
    this.mapTimer = 1 / 20;
    const g = this.mctx, w = this.minimap.width, h = this.minimap.height;
    const sx = (w - 8) / (2 * ARENA.W), sz = (h - 8) / (2 * ARENA.L);
    const X = (x) => w / 2 - x * sx;          // view from the blue end
    const Y = (z) => h / 2 + z * sz * -1;
    g.clearRect(0, 0, w, h);
    g.fillStyle = 'rgba(8,12,24,0.72)';
    g.beginPath(); g.roundRect ? g.roundRect(2, 2, w - 4, h - 4, 10) : g.rect(2, 2, w - 4, h - 4); g.fill();
    g.strokeStyle = 'rgba(255,255,255,0.35)'; g.lineWidth = 1.5;
    g.beginPath(); g.moveTo(4, h / 2); g.lineTo(w - 4, h / 2); g.stroke();
    g.beginPath(); g.arc(w / 2, h / 2, 9 * sx, 0, Math.PI * 2); g.stroke();
    g.fillStyle = TEAM_COLORS[1].css; g.fillRect(w / 2 - ARENA.GW * sx, 2, ARENA.GW * 2 * sx, 3);
    g.fillStyle = TEAM_COLORS[0].css; g.fillRect(w / 2 - ARENA.GW * sx, h - 5, ARENA.GW * 2 * sx, 3);
    for (const c of cars) {
      if (c.demolished) continue;
      const p = c.renderPos || c.pos;
      c.forward(_v);
      const a = Math.atan2(-_v.x, _v.z);
      g.save();
      g.translate(X(p.x), Y(p.z));
      g.rotate(a);
      g.fillStyle = c === player ? '#ffffff' : TEAM_COLORS[c.team].css;
      g.beginPath(); g.moveTo(0, -6); g.lineTo(4, 4); g.lineTo(-4, 4); g.closePath(); g.fill();
      if (c === player) { g.strokeStyle = TEAM_COLORS[c.team].css; g.lineWidth = 2; g.stroke(); }
      g.restore();
    }
    if (ballPos) {
      g.fillStyle = '#ffcc33';
      g.beginPath(); g.arc(X(ballPos.x), Y(ballPos.z), 3.5 + Math.min(3, ballPos.y * 0.2), 0, Math.PI * 2); g.fill();
    }
  }

  // name tags above cars + off-screen ball indicator
  updateLabels(cars, camera, player, ballPos, showArrow) {
    const w = window.innerWidth, h = window.innerHeight;
    const seen = new Set();
    for (const car of cars) {
      if (car === player) continue;
      let el = this.labels.get(car);
      if (!el) {
        el = document.createElement('div');
        el.className = 'name-tag t' + car.team;
        el.innerHTML = `<span></span><i class="boost-bar"></i>`;
        el.firstChild.textContent = car.name;
        this.labelsEl.appendChild(el);
        this.labels.set(car, el);
      }
      seen.add(car);
      if (el.firstChild.textContent !== car.name) el.firstChild.textContent = car.name;
      el.lastChild.style.transform = `scaleX(${Math.max(0, Math.min(1, car.boost / 100))})`;
      _v.copy(car.renderPos || car.pos);
      _v.y += 1.1;
      const dist = _v.distanceTo(camera.position);
      _v.project(camera);
      const vis = !car.demolished && _v.z < 1 && _v.x > -1.1 && _v.x < 1.1 && _v.y > -1.1 && _v.y < 1.1 && dist < 70;
      if (vis) {
        const x = (_v.x * 0.5 + 0.5) * w, y = (-_v.y * 0.5 + 0.5) * h;
        const sc = THREE.MathUtils.clamp(10 / dist, 0.55, 1);
        el.style.transform = `translate(${x}px, ${y}px) translate(-50%, -100%) scale(${sc})`;
        el.style.opacity = '1';
      } else el.style.opacity = '0';
    }
    for (const [car, el] of this.labels) {
      if (!seen.has(car)) { el.remove(); this.labels.delete(car); }
    }

    if (showArrow && ballPos) {
      _v.copy(ballPos).project(camera);
      const behind = _v.z > 1;
      let x = _v.x, y = _v.y;
      if (behind) { x = -x; y = -y; }
      const off = behind || Math.abs(x) > 0.95 || Math.abs(y) > 0.95;
      if (off) {
        const ang = Math.atan2(y, x);
        const r = Math.min(w, h) * 0.38;
        const px = w / 2 + Math.cos(ang) * r * (w / h > 1 ? 1.6 : 1);
        const py = h / 2 - Math.sin(ang) * r;
        this.arrow.style.transform = `translate(${px}px, ${py}px) translate(-50%,-50%) rotate(${Math.PI / 2 - ang}rad)`;
        this.arrow.style.opacity = '1';
      } else this.arrow.style.opacity = '0';
    } else this.arrow.style.opacity = '0';
  }

  clearLabels() {
    for (const el of this.labels.values()) el.remove();
    this.labels.clear();
    this.lastDots = '';
  }
}

export function teamCss(team) { return TEAM_COLORS[team].css; }
