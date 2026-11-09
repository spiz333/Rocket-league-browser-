import * as THREE from 'three';
import { buildArena, BoostPadsView } from './arenaView.js';
import { Particles } from './effects.js';
import { Audio } from './audio.js';
import { Input } from './input.js';
import { Hud } from './hud.js';
import { CameraRig } from './camera.js';
import { Game } from './game.js';
import { PAINTS, buildCarMesh } from './models.js';
import { TEAM_COLORS } from './config.js';

const $ = (id) => document.getElementById(id);
const isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
if (isTouch) document.body.classList.add('touch');

// ---------- settings ----------
const STORE_KEY = 'nitro-strikers-settings-v1';
const DEFAULTS = {
  teamSize: 2, difficulty: 'normal', duration: 300, body: 0, paint: 0,
  sound: 1, autoGas: 1, invertPitch: 0, vibrate: 1, quality: isTouch ? 'low' : 'high',
  replays: 1, camDist: 4.6, ballCam: 1,
};
let settings = { ...DEFAULTS };
try {
  const raw = localStorage.getItem(STORE_KEY);
  if (raw) settings = { ...DEFAULTS, ...JSON.parse(raw) };
} catch (_) { /* storage unavailable */ }
function saveSettings() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(settings)); } catch (_) { /* ignore */ }
}
const quality = settings.quality;

// ---------- renderer & scene ----------
const canvas = $('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: quality === 'high', powerPreference: 'high-performance' });
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
function pixelRatio() {
  return Math.min(window.devicePixelRatio || 1, settings.quality === 'high' ? 2 : 1.25);
}
renderer.setPixelRatio(pixelRatio());

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0x0b0e1e, 140, 420);
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 900);

scene.add(new THREE.HemisphereLight(0xc4d6ff, 0x20202e, 1.5));
const sun = new THREE.DirectionalLight(0xffffff, 2.2);
sun.position.set(30, 60, 20);
scene.add(sun);
const fill = new THREE.DirectionalLight(0x8fa4ff, 0.7);
fill.position.set(-30, 25, -40);
scene.add(fill);

// environment map for nice reflections on cars & ball
{
  const env = new THREE.Scene();
  const box = new THREE.Mesh(new THREE.BoxGeometry(100, 100, 100), new THREE.MeshBasicMaterial({ color: 0x1a2140, side: THREE.BackSide }));
  env.add(box);
  const floorEnv = new THREE.Mesh(new THREE.PlaneGeometry(100, 100), new THREE.MeshBasicMaterial({ color: 0x15301c }));
  floorEnv.rotation.x = -Math.PI / 2;
  floorEnv.position.y = -20;
  env.add(floorEnv);
  const lightMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  for (let i = 0; i < 4; i++) {
    const p = new THREE.Mesh(new THREE.PlaneGeometry(20, 8), lightMat);
    const a = i * Math.PI / 2 + Math.PI / 4;
    p.position.set(Math.sin(a) * 45, 30, Math.cos(a) * 45);
    p.lookAt(0, 0, 0);
    env.add(p);
  }
  const blueP = new THREE.Mesh(new THREE.PlaneGeometry(60, 6), new THREE.MeshBasicMaterial({ color: TEAM_COLORS[0].main }));
  blueP.position.set(0, -5, -49); env.add(blueP);
  const redP = new THREE.Mesh(new THREE.PlaneGeometry(60, 6), new THREE.MeshBasicMaterial({ color: TEAM_COLORS[1].main }));
  redP.position.set(0, -5, 49); redP.rotation.y = Math.PI; env.add(redP);
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(env, 0.04).texture;
  scene.environmentIntensity = 0.8;
  pmrem.dispose();
}

const arena = buildArena(scene, renderer, quality);
const padsView = new BoostPadsView(scene);
const particles = new Particles(scene, quality === 'high' ? 2600 : 1400);
const audio = new Audio();
const hud = new Hud();
const input = new Input($('controls'));
const rig = new CameraRig(camera);
const game = new Game({ scene, rig, audio, particles, hud, input, arena, padsView, quality });

function applySettings() {
  input.settings.autoGas = !!+settings.autoGas;
  input.settings.invertPitch = !!+settings.invertPitch;
  input.settings.vibrate = !!+settings.vibrate;
  audio.setEnabled(!!+settings.sound);
  rig.distance = +settings.camDist;
  rig.height = 1.2 + rig.distance * 0.1;
  renderer.setPixelRatio(pixelRatio());
  game.opts.replays = !!+settings.replays;
  onResize();
}

// ---------- resize ----------
function onResize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h);
  rig.setFov(w / h);
  const buf = renderer.getDrawingBufferSize(new THREE.Vector2());
  particles.setScale(buf.y, camera.fov);
  arena.crowdMat.uniforms.scale.value = buf.y / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2));
  input.layout();
}
window.addEventListener('resize', onResize);
window.addEventListener('orientationchange', () => setTimeout(onResize, 200));

// ---------- screens ----------
const screens = ['main', 'play', 'garage', 'settings', 'help', 'pause', 'end'];
let current = 'main';
let previous = 'main';
let appMode = 'menu'; // menu | garage | match
let lastMatch = null;

function showScreen(name) {
  if (name !== current) previous = current;
  current = name;
  for (const s of screens) $('screen-' + s).classList.toggle('hidden', s !== name);
  if (name === 'garage') enterGarage();
  else if (appMode === 'garage') exitGarage();
}
function hideScreens() {
  for (const s of screens) $('screen-' + s).classList.add('hidden');
  current = null;
}

function setupSegments() {
  document.querySelectorAll('.seg[data-opt]').forEach(seg => {
    const opt = seg.dataset.opt;
    const sync = () => seg.querySelectorAll('button').forEach(b => b.classList.toggle('sel', String(settings[opt]) === b.dataset.val));
    sync();
    seg.addEventListener('click', e => {
      const b = e.target.closest('button');
      if (!b) return;
      const raw = b.dataset.val;
      settings[opt] = isNaN(+raw) ? raw : +raw;
      sync();
      saveSettings();
      audio.init();
      audio.click();
      if (opt === 'quality') $('quality-note').textContent = 'Laad de pagina opnieuw om de graphics volledig aan te passen.';
      if (opt === 'body' || opt === 'paint') refreshPreview();
      applySettings();
    });
  });
  const paints = $('paints');
  PAINTS.forEach((p, i) => {
    const el = document.createElement('div');
    el.className = 'paint' + (p.color == null ? ' team' : '');
    if (p.color != null) el.style.background = '#' + p.color.toString(16).padStart(6, '0');
    el.innerHTML = `<span>${p.name}</span>`;
    el.addEventListener('click', () => {
      settings.paint = i;
      saveSettings();
      audio.click();
      paints.querySelectorAll('.paint').forEach((x, j) => x.classList.toggle('sel', j === i));
      refreshPreview();
    });
    if (i === settings.paint) el.classList.add('sel');
    paints.appendChild(el);
  });
}

document.addEventListener('click', e => {
  const go = e.target.closest('[data-go]');
  const act = e.target.closest('[data-action]');
  const back = e.target.closest('[data-back]');
  if (go || act || back) { audio.init(); audio.click(); }
  if (go) showScreen(go.dataset.go);
  if (back) showScreen(previous === 'settings' ? 'main' : previous);
  if (!act) return;
  switch (act.dataset.action) {
    case 'start':
      startMatch({ mode: 'match' });
      break;
    case 'training':
      startMatch({ mode: 'training' });
      break;
    case 'resume':
      resume();
      break;
    case 'restart':
      if (lastMatch) startMatch(lastMatch);
      break;
    case 'quit':
      quitToMenu();
      break;
  }
});

// ---------- garage preview ----------
let preview = null;
let previewSpin = 0;
function refreshPreview() {
  if (appMode !== 'garage') return;
  if (preview) scene.remove(preview.root);
  const paint = PAINTS[settings.paint] ? PAINTS[settings.paint].color : null;
  preview = buildCarMesh(0, settings.body, paint, quality);
  preview.root.position.set(0, 0.36, 0);
  preview.root.scale.setScalar(1);
  scene.add(preview.root);
}
function enterGarage() {
  appMode = 'garage';
  game.paused = true;
  for (const v of game.views.values()) v.root.visible = false;
  game.ballView.group.visible = false;
  game.ballShadow.visible = false;
  refreshPreview();
  rig.snap();
}
function exitGarage() {
  appMode = 'menu';
  if (preview) { scene.remove(preview.root); preview = null; }
  game.paused = false;
}

// ---------- match flow ----------
function startMatch(opts) {
  audio.init();
  if (isTouch && document.documentElement.requestFullscreen && !document.fullscreenElement) {
    document.documentElement.requestFullscreen({ navigationUI: 'hide' })
      .then(() => screen.orientation && screen.orientation.lock && screen.orientation.lock('landscape').catch(() => {}))
      .catch(() => {});
  }
  if (appMode === 'garage') exitGarage();
  appMode = 'match';
  lastMatch = opts;
  hideScreens();
  const paint = PAINTS[settings.paint] ? PAINTS[settings.paint].color : null;
  game.paused = false;
  game.setup({
    mode: opts.mode,
    teamSize: settings.teamSize,
    difficulty: settings.difficulty,
    duration: settings.duration,
    body: settings.body,
    paint,
    replays: !!+settings.replays,
  });
  rig.ballCam = !!+settings.ballCam;
  $('btn-cam').classList.toggle('active', rig.ballCam);
  hud.setScore(0, 0);
  hud.clearMessage();
  hud.show(true);
  $('controls').classList.remove('hidden');
  input.enabled = true;
  input.reset();
  document.body.classList.add('in-match');
}

function pause() {
  if (appMode !== 'match' || game.state === 'ended' || game.paused) return;
  game.paused = true;
  input.enabled = false;
  input.reset();
  audio.updateEngine(0, 0, false, false);
  showScreen('pause');
}
function resume() {
  hideScreens();
  game.paused = false;
  input.enabled = true;
  input.reset();
}
function quitToMenu() {
  appMode = 'menu';
  game.paused = false;
  hud.show(false);
  hud.clearMessage();
  $('controls').classList.add('hidden');
  document.body.classList.remove('in-match', 'replay');
  input.enabled = false;
  audio.updateEngine(0, 0, false, false);
  startAttract();
  showScreen('main');
}

function startAttract() {
  game.setup({ mode: 'attract', teamSize: 2, difficulty: 'hard', duration: 0, replays: false });
  rig.ballCam = true;
}

game.onEnd = (res) => {
  input.enabled = false;
  input.reset();
  audio.updateEngine(0, 0, false, false);
  setTimeout(() => showEnd(res), 1600);
};

function showEnd(res) {
  if (appMode !== 'match') return;
  const my = res.playerTeam;
  const won = res.score[my] > res.score[1 - my];
  const title = $('end-title');
  title.textContent = won ? 'OVERWINNING!' : 'NEDERLAAG';
  title.className = won ? 'win' : 'loss';
  $('end-score').innerHTML = `<span class="t0">${res.score[0]}</span> – <span class="t1">${res.score[1]}</span>`;
  const winner = res.score[0] > res.score[1] ? 0 : 1;
  const sorted = [...res.cars].sort((a, b) => a.team - b.team || b.points - a.points);
  let mvp = null;
  for (const c of res.cars) if (c.team === winner && (!mvp || c.points > mvp.points)) mvp = c;
  const tbody = $('end-table').querySelector('tbody');
  tbody.innerHTML = sorted.map(c => `<tr class="t${c.team}${c.isPlayer ? ' me' : ''}"><td>${c.name}${c === mvp ? '<span class="mvp">★ MVP</span>' : ''}</td><td>${c.points}</td><td>${c.goals}</td><td>${c.assists}</td><td>${c.saves}</td><td>${c.shots}</td></tr>`).join('');
  hud.clearMessage();
  showScreen('end');
}

game.onStateChange = (s) => {
  document.body.classList.toggle('replay', s === 'replay');
};

$('btn-pause').addEventListener('click', () => { audio.click(); pause(); });
$('btn-cam').addEventListener('click', () => toggleBallCam());
function toggleBallCam() {
  rig.ballCam = !rig.ballCam;
  settings.ballCam = rig.ballCam ? 1 : 0;
  saveSettings();
  $('btn-cam').classList.toggle('active', rig.ballCam);
}
input.on('ballcam', () => { if (appMode === 'match') toggleBallCam(); });
input.on('pause', () => {
  if (appMode !== 'match') return;
  if (game.paused && current === 'pause') resume(); else pause();
});
input.on('any', () => {
  if (appMode === 'match' && game.state === 'replay') game.skipReplay();
  if (appMode === 'match') document.body.classList.add('played');
});
document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });
$('btn-rotate-ignore').addEventListener('click', () => document.body.classList.add('ignore-rotate'));

// ---------- main loop ----------
let last = performance.now();
let elapsed = 0;
const _target = new THREE.Vector3();
const _from = new THREE.Vector3();

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
  last = now;
  elapsed += dt;

  if (appMode === 'garage') {
    previewSpin += dt * 0.5;
    _target.set(0, 0.5, 0);
    const r = 4.2;
    _from.set(Math.sin(previewSpin) * r, 1.6, Math.cos(previewSpin) * r);
    rig.cinematic(_target, _from, dt, 6);
    if (preview) {
      for (const w of preview.wheels) w.spin.rotation.x += dt * 2;
    }
    padsView.update(game.pads, elapsed);
  } else {
    game.update(dt);
    updateCamera(dt);
    game.render(dt, elapsed);
    if (appMode === 'match') updateHud(dt);
  }
  particles.update(dt);
  renderer.render(scene, camera);
}

let attractTimer = 0;
let attractFollow = null;
function updateCamera(dt) {
  const st = game.state;
  if (appMode === 'menu') {
    attractTimer -= dt;
    if (attractTimer <= 0) {
      attractTimer = 9;
      const choices = game.cars.filter(c => !c.demolished);
      attractFollow = Math.random() < 0.65 && choices.length ? choices[(Math.random() * choices.length) | 0] : null;
      rig.snap();
    }
    if (attractFollow && !attractFollow.demolished && st !== 'goal') rig.follow(attractFollow, attractFollow.pos, game.ball.pos, dt);
    else rig.orbit(game.ball.pos, dt);
    return;
  }
  if (st === 'replay') {
    const idx = game.goalScorer ? game.cars.indexOf(game.goalScorer) : -1;
    const proxyBall = game.replayProxies.ball;
    if (idx >= 0 && !game.replayProxies.cars[idx].demolished) {
      const p = game.replayProxies.cars[idx];
      const saved = rig.ballCam;
      rig.ballCam = true;
      rig.follow(game.goalScorer, p.pos, proxyBall.pos, dt);
      rig.ballCam = saved;
    } else {
      _from.copy(proxyBall.pos).add(_target.set(0, 6, proxyBall.pos.z > 0 ? -14 : 14));
      rig.cinematic(proxyBall.pos, _from, dt, 4);
    }
    return;
  }
  const p = game.player;
  if (p && !p.demolished) rig.follow(p, p.pos, game.ball.pos, dt);
  else {
    _from.copy(rig.pos);
    rig.cinematic(game.ball.pos, _from, dt, 2);
  }
}

function updateHud(dt) {
  hud.update(dt);
  hud.setScore(game.score[0], game.score[1]);
  hud.setClock(game.clockText(), game.overtime);
  const p = game.player;
  if (p) {
    hud.setBoost(p.boost, p.unlimitedBoost);
    hud.setSpeed(p.speed() * 3.6 * 4.2);
    const active = (game.state === 'playing' || game.state === 'goal') && !game.paused && !p.demolished;
    audio.updateEngine(p.speed(), p.controls.throttle, p.boosting, active);
  }
  hud.updateLabels(game.cars, camera, game.state === 'replay' ? null : p, game.ball.pos, !rig.ballCam && game.state === 'playing');
}

// ---------- boot ----------
setupSegments();
applySettings();
startAttract();
showScreen('main');
requestAnimationFrame((t) => { last = t; frame(t); });
setTimeout(() => $('loading').classList.add('done'), 150);

if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

// handy for debugging from the console
window.__nitro = { game, rig, settings, renderer };
