// In-match HUD (DOM based): scoreboard, clock, boost, messages, name tags.
import * as THREE from 'three';
import { TEAM_COLORS } from './config.js';

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
    this.feedEl = $('feed');
    this.center = $('center-msg');
    this.sub = $('sub-msg');
    this.labelsEl = $('labels');
    this.arrow = $('ball-arrow');
    this.boostRing = $('boost-ring');
    this.boostNum = $('boost-num');
    this.speedVal = $('speed-val');
    this.labels = new Map();
    this.msgTimer = 0;
    this.subTimer = 0;
    this.lastBoost = -1;
    this.lastClock = '';
    this.ringLen = 2 * Math.PI * 42;
    this.boostRing.style.strokeDasharray = `${this.ringLen}`;
  }

  show(on) { this.root.classList.toggle('hidden', !on); }

  setScore(b, r) {
    if (this.scoreB.textContent !== String(b)) { this.scoreB.textContent = b; this._pop(this.scoreB); }
    if (this.scoreR.textContent !== String(r)) { this.scoreR.textContent = r; this._pop(this.scoreR); }
  }

  _pop(el) {
    el.classList.remove('pop');
    void el.offsetWidth;
    el.classList.add('pop');
  }

  setClock(text, overtime) {
    if (text !== this.lastClock) {
      this.clock.textContent = text;
      this.lastClock = text;
    }
    this.clock.classList.toggle('overtime', !!overtime);
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

  clearMessage() {
    this.center.className = '';
    this.sub.className = '';
    this.msgTimer = 0;
    this.subTimer = 0;
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

  // name tags above cars + ball indicator
  updateLabels(cars, camera, player, ballPos, showArrow) {
    const w = window.innerWidth, h = window.innerHeight;
    const seen = new Set();
    for (const car of cars) {
      if (car === player) continue;
      let el = this.labels.get(car);
      if (!el) {
        el = document.createElement('div');
        el.className = 'name-tag t' + car.team;
        el.textContent = car.name;
        this.labelsEl.appendChild(el);
        this.labels.set(car, el);
      }
      seen.add(car);
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

    // off-screen ball arrow
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
        this.arrow.style.transform = `translate(${px}px, ${py}px) translate(-50%,-50%) rotate(${-ang}rad)`;
        this.arrow.style.opacity = '1';
      } else this.arrow.style.opacity = '0';
    } else this.arrow.style.opacity = '0';
  }

  clearLabels() {
    for (const el of this.labels.values()) el.remove();
    this.labels.clear();
  }
}

export function teamCss(team) { return TEAM_COLORS[team].css; }
