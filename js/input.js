// Touch (virtual stick + buttons), keyboard/mouse and gamepad input with rebindable controls.
const DEAD = 0.12;
const NO_PADS = [];

function dz(v) {
  const a = Math.abs(v);
  if (a < DEAD) return 0;
  return Math.sign(v) * Math.min(1, (a - DEAD) / (1 - DEAD));
}

// [id, label, hold?]  hold actions are read every frame, the others fire once per press
export const ACTIONS = [
  ['forward', 'Drive forward · nose down'],
  ['reverse', 'Reverse · nose up'],
  ['left', 'Steer left'],
  ['right', 'Steer right'],
  ['jump', 'Jump'],
  ['boost', 'Boost'],
  ['slide', 'Powerslide'],
  ['airroll', 'Air roll (hold + steer)'],
  ['rollLeft', 'Air roll left'],
  ['rollRight', 'Air roll right'],
  ['ballcam', 'Ball cam'],
  ['rear', 'Look behind'],
  ['scoreboard', 'Scoreboard'],
  ['pause', 'Pause'],
];
// actions the stick covers on a gamepad (not rebindable there)
export const STICK_ACTIONS = new Set(['left', 'right']);
export const DEFAULT_KEYS = {
  forward: ['KeyW', 'ArrowUp'], reverse: ['KeyS', 'ArrowDown'], left: ['KeyA', 'ArrowLeft'], right: ['KeyD', 'ArrowRight'],
  jump: ['Space', 'Mouse2'], boost: ['ShiftLeft', 'Mouse0'], slide: ['ControlLeft', ''], airroll: ['KeyE', ''],
  rollLeft: ['', ''], rollRight: ['', ''], ballcam: ['KeyC', ''], rear: ['KeyR', ''], scoreboard: ['Tab', ''], pause: ['Escape', 'KeyP'],
};
// standard gamepad layout indices: 0 A/✕ 1 B/○ 2 X/□ 3 Y/△ 4 LB 5 RB 6 LT 7 RT 8 View 9 Menu 10 LS 11 RS 12-15 d-pad
export const DEFAULT_PAD = {
  forward: 7, reverse: 6, left: -1, right: -1, jump: 0, boost: 1, slide: 2, airroll: 2,
  rollLeft: 4, rollRight: 5, ballcam: 3, rear: 11, scoreboard: 8, pause: 9,
};
const PAD_NAMES = ['A', 'B', 'X', 'Y', 'LB', 'RB', 'LT', 'RT', 'View', 'Menu', 'L-stick', 'R-stick', 'D-up', 'D-down', 'D-left', 'D-right', 'Home'];
export function padLabel(i) { return i == null || i < 0 ? '—' : (PAD_NAMES[i] || 'Button ' + i); }
export function keyLabel(code) {
  if (!code) return '—';
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code.startsWith('Numpad')) return 'Num ' + code.slice(6);
  const map = {
    Mouse0: 'Left mouse', Mouse1: 'Middle mouse', Mouse2: 'Right mouse', Mouse3: 'Mouse 4', Mouse4: 'Mouse 5',
    Space: 'Space', ShiftLeft: 'L-Shift', ShiftRight: 'R-Shift', ControlLeft: 'L-Ctrl', ControlRight: 'R-Ctrl',
    AltLeft: 'L-Alt', AltRight: 'R-Alt', ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→',
    Escape: 'Esc', Tab: 'Tab', Enter: 'Enter', Backspace: 'Backspace', CapsLock: 'Caps',
  };
  return map[code] || code;
}
const EDGE = ['ballcam', 'pause'];
const CHAT_KEYS = ['Digit1', 'Digit2', 'Digit3', 'Digit4'];

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
    this.listeners = {};
    this.settings = { autoGas: true, invertPitch: false, vibrate: true, steerCurve: 1.3, stickFlip: false };
    this.flipQueue = null;
    this.lastOnGround = true;
    this.lastJumpOut = false;
    this.touchActive = false;
    this.prevPad = [];
    this.pad = { connected: false, steer: 0, up: 0, lookX: 0, lookY: 0, buttons: [] };
    this.look = { x: 0, y: 0 };
    this.held = { scoreboard: false, rear: false };
    this.capturing = null;
    this.enabled = true;
    this.setBindings(null, null);
    this._bind();
  }

  on(evt, fn) { (this.listeners[evt] ||= []).push(fn); }
  emit(evt, ...a) { (this.listeners[evt] || []).forEach(f => f(...a)); }

  setBindings(keys, pad) {
    this.keyBinds = {};
    this.padBinds = {};
    for (const [id] of ACTIONS) {
      const k = keys && Array.isArray(keys[id]) ? keys[id] : DEFAULT_KEYS[id];
      this.keyBinds[id] = [k[0] || '', k[1] || ''];
      const pv = pad && typeof pad[id] === 'number' ? pad[id] : DEFAULT_PAD[id];
      this.padBinds[id] = pv;
    }
    this.codeMap = new Map();
    for (const [id, codes] of Object.entries(this.keyBinds)) {
      for (const c of codes) if (c) { if (!this.codeMap.has(c)) this.codeMap.set(c, []); this.codeMap.get(c).push(id); }
    }
  }

  // wait for the next key / mouse button / pad button and hand it to fn (rebinding)
  capture(fn) { this.capturing = fn; }

  down(action) {
    const b = this.keyBinds[action];
    return (b[0] && this.keys.has(b[0])) || (b[1] && this.keys.has(b[1]));
  }

  _press(code) {
    const acts = this.codeMap.get(code);
    if (acts) for (const a of acts) if (EDGE.includes(a)) this.emit(a);
    const ci = CHAT_KEYS.indexOf(code);
    if (ci >= 0) this.emit('chat', ci);
  }

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
      if (this.capturing) {
        e.preventDefault();
        const fn = this.capturing; this.capturing = null;
        fn(e.code === 'Escape' ? null : e.code);
        return;
      }
      const typing = e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA');
      if (typing) return;
      if (e.repeat) { if (this._gameKey(e.code)) e.preventDefault(); return; }
      this.keys.add(e.code);
      this._press(e.code);
      if (this._gameKey(e.code)) e.preventDefault();
      this.emit('any');
    });
    window.addEventListener('keyup', e => this.keys.delete(e.code));
    window.addEventListener('mousedown', e => {
      if (!this.capturing) return;
      e.preventDefault(); e.stopPropagation();
      const fn = this.capturing; this.capturing = null;
      fn('Mouse' + e.button);
    }, true);
    window.addEventListener('mouseup', e => this.keys.delete('Mouse' + e.button));
    window.addEventListener('gamepadconnected', () => { this.padConnected = true; this.emit('pad', true); });
    window.addEventListener('gamepaddisconnected', () => this.emit('pad', false));
    window.addEventListener('blur', () => { this.keys.clear(); this.rightTouches.clear(); this._resetStick(); });
  }

  _gameKey(code) {
    return this.enabled && (this.codeMap.has(code) || ['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(code));
  }

  _down(e) {
    if (!this.enabled) return;
    if (e.pointerType === 'mouse') {
      this.keys.add('Mouse' + e.button);
      this._press('Mouse' + e.button);
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
      const t = { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, lock: null, down: performance.now(), swiped: false };
      if (this._hit('jump', e.clientX, e.clientY)) t.lock = 'jump';
      this.rightTouches.set(e.pointerId, t);
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
      // swipe on the jump button = jump + flip in that direction
      if (t.lock === 'jump' && !t.swiped) {
        const dx = t.x - t.sx, dy = t.y - t.sy;
        const len = Math.hypot(dx, dy);
        if (len > 22) {
          t.swiped = true;
          this._queueFlip(-dy / len, dx / len);
        }
      }
      this._updateButtons();
    }
  }

  _up(e) {
    if (e.pointerType === 'mouse') {
      this.keys.delete('Mouse' + e.button);
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
    this.rects = null;
    if (this.stick.id !== null) return;
    const w = window.innerWidth, h = window.innerHeight;
    const x = Math.max(95, w * 0.15), y = h - Math.max(95, h * 0.28);
    this.stickBase.style.transform = `translate(${x}px, ${y}px)`;
    this.stickKnob.style.transform = 'translate(0px, 0px)';
  }

  // button rectangles are cached: reading layout on every touch move causes jank
  _rect(name) {
    if (!this.rects) this.rects = {};
    let r = this.rects[name];
    if (!r || r.width === 0) { r = this.buttons[name].getBoundingClientRect(); this.rects[name] = r; }
    return r;
  }

  _hit(name, x, y) {
    const r = this._rect(name);
    if (r.width === 0) return false;
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    return Math.hypot(x - cx, y - cy) < r.width / 2 * 1.18;
  }

  _hitCached(t) { return this._hit('jump', t.x, t.y); }

  _queueFlip(f, s) {
    // snap to 8 directions so flips are predictable
    const a = Math.round(Math.atan2(s, f) / (Math.PI / 4)) * (Math.PI / 4);
    f = Math.cos(a); s = Math.sin(a);
    const T = 1, F = 0, D = 2;
    const seq = this.lastOnGround && !this.lastJumpOut ? [T, T, T, F, F, D, D, D, D, D] : [F, F, D, D, D, D, D];
    this.flipQueue = { f, s, seq, i: 0 };
    if (this.settings.vibrate && navigator.vibrate) navigator.vibrate(12);
  }

  _updateButtons() {
    const next = { jump: false, boost: false, drift: false };
    for (const name of Object.keys(this.buttons)) {
      for (const t of this.rightTouches.values()) {
        if (t.lock === 'jump') { if (name === 'jump') next.jump = true; continue; }
        if (this._hit(name, t.x, t.y)) next[name] = true;
      }
    }
    if (next.jump && !this.pressed.jump && this.settings.vibrate && navigator.vibrate) navigator.vibrate(8);
    for (const k of Object.keys(next)) {
      if (next[k] !== this.pressed[k]) this.buttons[k].classList.toggle('pressed', next[k]);
    }
    this.pressed = next;
  }

  reset() {
    this.flipQueue = null;
    this.rightTouches.clear();
    this._updateButtons();
    this._resetStick();
    for (const k of [...this.keys]) if (k.startsWith('Mouse')) this.keys.delete(k);
  }

  // Poll gamepads once per frame (menus + matches): menu navigation, rebinding, button edges.
  pollPads() {
    const pads = navigator.getGamepads ? navigator.getGamepads() : NO_PADS;
    const P = this.pad;
    P.connected = false; P.steer = 0; P.up = 0; P.lookX = 0; P.lookY = 0;
    const cur = [];
    for (const p of pads) {
      if (!p || !p.connected) continue;
      P.connected = true;
      const ax = dz(p.axes[0] || 0), ay = dz(-(p.axes[1] || 0));
      if (Math.abs(ax) > Math.abs(P.steer)) P.steer = ax;
      if (Math.abs(ay) > Math.abs(P.up)) P.up = ay;
      const lx = dz(p.axes[2] || 0), ly = dz(-(p.axes[3] || 0));
      if (Math.abs(lx) > Math.abs(P.lookX)) P.lookX = lx;
      if (Math.abs(ly) > Math.abs(P.lookY)) P.lookY = ly;
      p.buttons.forEach((b, i) => { const v = b.value || (b.pressed ? 1 : 0); if (v > (cur[i] || 0)) cur[i] = v; });
    }
    P.buttons = cur;
    const was = this.prevPad;
    const pressed = (i) => (cur[i] || 0) > 0.5 && !((was[i] || 0) > 0.5);
    // left stick / d-pad as menu directions
    const navDir = P.up > 0.6 ? 'up' : P.up < -0.6 ? 'down' : P.steer < -0.6 ? 'left' : P.steer > 0.6 ? 'right' : null;
    const now = performance.now();
    if (this.capturing) {
      for (let i = 0; i < cur.length; i++) if (pressed(i)) { const fn = this.capturing; this.capturing = null; fn('Pad' + i); break; }
    } else if (P.connected) {
      for (let i = 0; i < cur.length; i++) if (pressed(i)) {
        this.emit('padbutton', i);
        for (const a of EDGE) if (this.padBinds[a] === i) this.emit(a);
        if (i >= 12 && i <= 15 && this.enabled) this.emit('chat', i - 12);
        if (i === 0 || i === 9) this.emit('any');
      }
      const dpad = pressed(12) ? 'up' : pressed(13) ? 'down' : pressed(14) ? 'left' : pressed(15) ? 'right' : null;
      if (dpad) this.emit('padnav', dpad);
      // stick: first step immediately, then auto-repeat while held
      if (navDir && navDir !== this.lastNav) { this.emit('padnav', navDir); this.nextNavT = now + 420; }
      else if (navDir && now >= this.nextNavT) { this.emit('padnav', navDir); this.nextNavT = now + 170; }
      this.lastNav = navDir;
    }
    this.prevPad = cur;
    this.look.x = P.lookX; this.look.y = P.lookY;
    const pb = (a) => { const i = this.padBinds[a]; return i >= 0 && (cur[i] || 0) > 0.5; };
    this.held.scoreboard = this.down('scoreboard') || pb('scoreboard');
    this.held.rear = this.down('rear') || pb('rear');
  }

  // Fill a controls object for the player car
  read(c, onGround) {
    const k = this.keys;
    let steer = 0, up = 0, roll = 0;
    // a fresh tap on SPRING in the air waits a moment to see whether it becomes a swipe-flip
    let touchJump = false;
    const now = performance.now();
    for (const t of this.rightTouches.values()) {
      if (t.lock === 'jump') {
        if (t.swiped || this.lastOnGround || this.lastJumpOut || now - t.down > 90) touchJump = true;
      } else if (this._hitCached(t)) touchJump = true;
    }
    // a tap on the JUMP button is a plain (double) jump; stick-direction flips are for pads/keyboards
    let noDodge = touchJump && !this.settings.stickFlip;
    let jump = touchJump || this.down('jump');
    let boost = this.pressed.boost || this.down('boost');
    let drift = this.pressed.drift || this.down('slide');
    let airRoll = this.down('airroll');
    let throttle = 0;

    if (this.down('left')) steer -= 1;
    if (this.down('right')) steer += 1;
    if (this.down('forward')) up += 1;
    if (this.down('reverse')) up -= 1;
    if (this.down('rollLeft')) roll -= 1;
    if (this.down('rollRight')) roll += 1;
    throttle = up;

    // touch stick (with a response curve for finer steering)
    if (this.stick.id !== null || this.touchActive) {
      const curve = (v) => Math.sign(v) * Math.pow(Math.abs(v), this.settings.steerCurve);
      const sx = curve(dz(this.stick.x)), sy = dz(-this.stick.y);
      if (this.stick.id !== null) {
        steer = Math.abs(sx) > Math.abs(steer) ? sx : steer;
        up = Math.abs(sy) > Math.abs(up) ? sy : up;
      }
      if (this.touchActive && this.settings.autoGas) {
        // auto throttle only while the thumb is on the stick; let go = coast to a stop
        if (this.stick.id !== null) throttle = sy < -0.45 ? sy : 1;
        else if (!k.size) throttle = 0;
      } else if (this.stick.id !== null) {
        throttle = Math.abs(sy) > Math.abs(throttle) ? sy : throttle;
      }
    }

    // gamepad (state read in pollPads)
    const P = this.pad;
    if (P.connected) {
      const pb = this.padBinds, B = P.buttons;
      const val = (a) => (pb[a] >= 0 ? B[pb[a]] || 0 : 0);
      const on = (a) => val(a) > 0.4;
      if (Math.abs(P.steer) > Math.abs(steer)) steer = P.steer;
      if (Math.abs(P.up) > Math.abs(up)) up = P.up;
      const trig = val('forward') - val('reverse');
      if (Math.abs(trig) > 0.05) throttle = trig;
      if (on('jump')) jump = true;
      if (on('boost')) boost = true;
      if (on('slide')) drift = true;
      if (on('airroll')) airRoll = true;
      if (on('rollLeft')) roll = -1;
      if (on('rollRight')) roll = 1;
    }

    let fwd = up;
    if (this.flipQueue) {
      const q = this.flipQueue;
      const ph = q.seq[q.i++];
      if (ph === 0) jump = false;
      else if (ph === 1) jump = true;
      else { jump = true; fwd = q.f; steer = q.s; noDodge = false; }
      if (q.i >= q.seq.length) this.flipQueue = null;
    }

    if (!this.enabled) { steer = up = throttle = roll = fwd = 0; jump = boost = drift = airRoll = false; this.flipQueue = null; }

    const pitch = this.settings.invertPitch ? -up : up;
    this.lastOnGround = onGround;
    this.lastJumpOut = jump;
    c.throttle = throttle;
    c.steer = steer;
    c.pitch = pitch;
    c.fwd = fwd;
    c.noDodge = noDodge;
    c.yaw = steer;
    c.roll = roll;
    c.airRoll = airRoll;
    c.jump = jump;
    c.boost = boost;
    c.drift = drift;
    return c;
  }
}
