// Touch (virtual stick + buttons), keyboard and gamepad input.
const DEAD = 0.12;

function dz(v) {
  const a = Math.abs(v);
  if (a < DEAD) return 0;
  return Math.sign(v) * Math.min(1, (a - DEAD) / (1 - DEAD));
}

export class Input {
  constructor(root) {
    this.root = root;
    this.keys = new Set();
    this.stick = { id: null, ox: 0, oy: 0, x: 0, y: 0 };
    this.rightTouches = new Map();
    this.buttons = {
      jump: document.getElementById('btn-jump'),
      boost: document.getElementById('btn-boost'),
      drift: document.getElementById('btn-drift'),
    };
    this.pressed = { jump: false, boost: false, drift: false };
    this.stickBase = document.getElementById('stick-base');
    this.stickKnob = document.getElementById('stick-knob');
    this.stickRadius = 58;
    this.mouseBoost = false;
    this.listeners = {};
    this.settings = { autoGas: true, invertPitch: false, vibrate: true };
    this.touchActive = false;
    this.prevPad = {};
    this.enabled = true;
    this._bind();
  }

  on(evt, fn) { (this.listeners[evt] ||= []).push(fn); }
  emit(evt, ...a) { (this.listeners[evt] || []).forEach(f => f(...a)); }

  _bind() {
    const zone = this.root;
    const opts = { passive: false };
    zone.addEventListener('pointerdown', e => this._down(e), opts);
    zone.addEventListener('pointermove', e => this._move(e), opts);
    zone.addEventListener('pointerup', e => this._up(e), opts);
    zone.addEventListener('pointercancel', e => this._up(e), opts);
    zone.addEventListener('lostpointercapture', e => this._up(e), opts);
    zone.addEventListener('contextmenu', e => e.preventDefault());

    window.addEventListener('keydown', e => {
      if (e.repeat) { if (this._gameKey(e.code)) e.preventDefault(); return; }
      this.keys.add(e.code);
      if (e.code === 'KeyC' || e.code === 'KeyY') this.emit('ballcam');
      if (e.code === 'Escape' || e.code === 'KeyP') this.emit('pause');
      if (this._gameKey(e.code)) e.preventDefault();
      this.emit('any');
    });
    window.addEventListener('keyup', e => this.keys.delete(e.code));
    window.addEventListener('blur', () => { this.keys.clear(); this.rightTouches.clear(); this._resetStick(); });
  }

  _gameKey(code) {
    return ['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ShiftLeft', 'ShiftRight', 'ControlLeft'].includes(code);
  }

  _down(e) {
    if (!this.enabled) return;
    if (e.pointerType === 'mouse') {
      if (e.button === 0) this.mouseBoost = true;
      if (e.button === 2) this.keys.add('MouseRight');
      return;
    }
    e.preventDefault();
    this.touchActive = true;
    document.body.classList.add('touch');
    try { this.root.setPointerCapture(e.pointerId); } catch (_) { /* ignore */ }
    const w = window.innerWidth;
    if (e.clientX < w * 0.45 && this.stick.id === null) {
      this.stick.id = e.pointerId;
      this.stick.ox = e.clientX;
      this.stick.oy = e.clientY;
      this.stick.x = 0;
      this.stick.y = 0;
      this.stickBase.style.transform = `translate(${e.clientX}px, ${e.clientY}px)`;
      this.stickBase.classList.add('active');
      this.stickKnob.style.transform = 'translate(0px, 0px)';
    } else if (e.clientX >= w * 0.45) {
      this.rightTouches.set(e.pointerId, { x: e.clientX, y: e.clientY, fresh: true });
      this._updateButtons();
    }
    this.emit('any');
  }

  _move(e) {
    if (e.pointerType === 'mouse') return;
    e.preventDefault();
    if (e.pointerId === this.stick.id) {
      let dx = e.clientX - this.stick.ox, dy = e.clientY - this.stick.oy;
      const r = this.stickRadius;
      const len = Math.hypot(dx, dy);
      if (len > r) {
        // drag the base along so the stick never feels stuck
        const over = len - r;
        this.stick.ox += (dx / len) * over * 0.6;
        this.stick.oy += (dy / len) * over * 0.6;
        dx = e.clientX - this.stick.ox; dy = e.clientY - this.stick.oy;
        const l2 = Math.hypot(dx, dy);
        if (l2 > r) { dx = dx / l2 * r; dy = dy / l2 * r; }
        this.stickBase.style.transform = `translate(${this.stick.ox}px, ${this.stick.oy}px)`;
      }
      this.stick.x = dx / r;
      this.stick.y = dy / r;
      this.stickKnob.style.transform = `translate(${dx}px, ${dy}px)`;
    } else if (this.rightTouches.has(e.pointerId)) {
      const t = this.rightTouches.get(e.pointerId);
      t.x = e.clientX; t.y = e.clientY;
      this._updateButtons();
    }
  }

  _up(e) {
    if (e.pointerType === 'mouse') {
      if (e.button === 0) this.mouseBoost = false;
      if (e.button === 2) this.keys.delete('MouseRight');
      return;
    }
    if (e.pointerId === this.stick.id) this._resetStick();
    if (this.rightTouches.delete(e.pointerId)) this._updateButtons();
  }

  _resetStick() {
    this.stick.id = null;
    this.stick.x = 0;
    this.stick.y = 0;
    this.stickBase.classList.remove('active');
    this.layout();
  }

  // default (idle) position of the virtual stick
  layout() {
    if (this.stick.id !== null) return;
    const w = window.innerWidth, h = window.innerHeight;
    const x = Math.max(95, w * 0.15), y = h - Math.max(95, h * 0.28);
    this.stickBase.style.transform = `translate(${x}px, ${y}px)`;
    this.stickKnob.style.transform = 'translate(0px, 0px)';
  }

  _updateButtons() {
    const next = { jump: false, boost: false, drift: false };
    for (const [name, el] of Object.entries(this.buttons)) {
      const r = el.getBoundingClientRect();
      if (r.width === 0) continue;
      const cx = r.left + r.width / 2, cy = r.top + r.height / 2, rad = r.width / 2 * 1.18;
      for (const t of this.rightTouches.values()) {
        if (Math.hypot(t.x - cx, t.y - cy) < rad) next[name] = true;
      }
    }
    if (next.jump && !this.pressed.jump && this.settings.vibrate && navigator.vibrate) navigator.vibrate(8);
    for (const k of Object.keys(next)) {
      if (next[k] !== this.pressed[k]) this.buttons[k].classList.toggle('pressed', next[k]);
    }
    this.pressed = next;
  }

  reset() {
    this.rightTouches.clear();
    this._updateButtons();
    this._resetStick();
    this.mouseBoost = false;
  }

  // Fill a controls object for the player car
  read(c, onGround) {
    const k = this.keys;
    let steer = 0, up = 0, roll = 0;
    let jump = this.pressed.jump || k.has('Space') || k.has('KeyJ');
    let boost = this.pressed.boost || k.has('ShiftLeft') || k.has('ShiftRight') || k.has('KeyK') || this.mouseBoost;
    let drift = this.pressed.drift || k.has('ControlLeft') || k.has('KeyL') || k.has('MouseRight');
    let throttle = 0;

    if (k.has('KeyA') || k.has('ArrowLeft')) steer -= 1;
    if (k.has('KeyD') || k.has('ArrowRight')) steer += 1;
    if (k.has('KeyW') || k.has('ArrowUp')) up += 1;
    if (k.has('KeyS') || k.has('ArrowDown')) up -= 1;
    if (k.has('KeyQ')) roll -= 1;
    if (k.has('KeyE')) roll += 1;
    throttle = up;

    // touch stick
    if (this.stick.id !== null || this.touchActive) {
      const sx = dz(this.stick.x), sy = dz(-this.stick.y);
      if (this.stick.id !== null) {
        steer = Math.abs(sx) > Math.abs(steer) ? sx : steer;
        up = Math.abs(sy) > Math.abs(up) ? sy : up;
      }
      if (this.touchActive && this.settings.autoGas) {
        throttle = sy < -0.45 ? sy : (k.size ? throttle : 1);
      } else if (this.stick.id !== null) {
        throttle = Math.abs(sy) > Math.abs(throttle) ? sy : throttle;
      }
    }

    // gamepad
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    for (const p of pads) {
      if (!p || !p.connected) continue;
      const ax = dz(p.axes[0] || 0), ay = dz(-(p.axes[1] || 0));
      if (Math.abs(ax) > Math.abs(steer)) steer = ax;
      if (Math.abs(ay) > Math.abs(up)) up = ay;
      const b = (i) => p.buttons[i] && (p.buttons[i].pressed || p.buttons[i].value > 0.3);
      const val = (i) => (p.buttons[i] ? p.buttons[i].value : 0);
      const trig = val(7) - val(6);
      if (Math.abs(trig) > 0.05) throttle = trig;
      if (b(0)) jump = true;
      if (b(1)) boost = true;
      if (b(2)) drift = true;
      if (b(4)) roll = -1;
      if (b(5)) roll = 1;
      if (b(3) && !this.prevPad[3]) this.emit('ballcam');
      if (b(9) && !this.prevPad[9]) this.emit('pause');
      if ((b(0) && !this.prevPad[0]) || (b(9) && !this.prevPad[9])) this.emit('any');
      this.prevPad = { 0: b(0), 3: b(3), 9: b(9) };
    }

    if (!this.enabled) { steer = up = throttle = roll = 0; jump = boost = drift = false; }

    const pitch = this.settings.invertPitch ? -up : up;
    c.throttle = throttle;
    c.steer = steer;
    c.pitch = pitch;
    c.fwd = up;
    c.yaw = steer;
    c.roll = roll;
    c.jump = jump;
    c.boost = boost;
    c.drift = drift;
    return c;
  }
}
