import * as THREE from '../vendor/three.module.min.js';
import { buildArena, BoostPadsView } from './arenaView.js';
import { Particles } from './effects.js';
import { Audio } from './audio.js';
import { Input } from './input.js';
import { Hud } from './hud.js';
import { CameraRig } from './camera.js';
import { Game } from './game.js';
import { PAINTS, buildCarMesh } from './models.js';
import { TEAM_COLORS, BOT_NAMES } from './config.js';
import { Net, errorText, cleanCode } from './net.js';
import { EffectComposer } from '../vendor/postprocessing/EffectComposer.js';
import { RenderPass } from '../vendor/postprocessing/RenderPass.js';
import { UnrealBloomPass } from '../vendor/postprocessing/UnrealBloomPass.js';
import { OutputPass } from '../vendor/postprocessing/OutputPass.js';

const $ = (id) => document.getElementById(id);
const isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
if (isTouch) document.body.classList.add('touch');

// ---------- settings ----------
const STORE_KEY = 'nitro-strikers-settings-v1';
const DEFAULTS = {
  teamSize: 2, difficulty: 'normal', duration: 300, body: 0, paint: 0,
  sound: 1, autoGas: 1, invertPitch: 0, vibrate: 1, quality: isTouch ? 'medium' : 'high', gfx: 2,
  replays: 1, camDist: 4.6, ballCam: 1,
  steerCurve: 1.3, btnSize: 'normal', assist: 1, name: '',
};
let settings = { ...DEFAULTS };
try {
  const raw = localStorage.getItem(STORE_KEY);
  if (raw) {
    const saved = JSON.parse(raw);
    // graphics presets changed in v2: start from the new default
    if (saved.gfx !== DEFAULTS.gfx) { delete saved.quality; saved.gfx = DEFAULTS.gfx; }
    settings = { ...DEFAULTS, ...saved };
  }
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
const useShadows = quality !== 'low';
renderer.shadowMap.enabled = useShadows;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
function pixelRatio() {
  const cap = { low: 1.25, medium: 1.6, high: 2 }[settings.quality] || 1.25;
  return Math.min(window.devicePixelRatio || 1, cap);
}
renderer.setPixelRatio(pixelRatio());

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0x0b0e1e, 140, 420);
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 900);

scene.add(new THREE.HemisphereLight(0xc4d6ff, 0x20202e, 1.5));
const sun = new THREE.DirectionalLight(0xffffff, 2.2);
sun.position.set(30, 60, 20);
scene.add(sun);
if (useShadows) {
  sun.castShadow = true;
  const sz = quality === 'high' ? 2048 : 1024;
  sun.shadow.mapSize.set(sz, sz);
  const sc = sun.shadow.camera;
  sc.left = -52; sc.right = 52; sc.top = 62; sc.bottom = -62; sc.near = 10; sc.far = 160;
  sun.shadow.bias = -0.0008;
  sun.shadow.normalBias = 0.03;
  sun.target.position.set(0, 0, 0);
  scene.add(sun.target);
}
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
const game = new Game({ scene, rig, audio, particles, hud, input, arena, padsView, quality, shadows: useShadows });

// bloom for the neon look (highest quality only)
let composer = null;
let bloom = null;
if (quality === 'high') {
  composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.55, 0.45, 0.82);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());
}

function applySettings() {
  input.settings.autoGas = !!+settings.autoGas;
  input.settings.invertPitch = !!+settings.invertPitch;
  input.settings.vibrate = !!+settings.vibrate;
  input.settings.steerCurve = +settings.steerCurve || 1.3;
  document.body.classList.toggle('btn-small', settings.btnSize === 'small');
  document.body.classList.toggle('btn-large', settings.btnSize === 'large');
  if (game.player) game.player.assist = !!+settings.assist;
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
  if (composer) {
    composer.setPixelRatio(renderer.getPixelRatio());
    composer.setSize(w, h);
    bloom.resolution.set(w / 2, h / 2);
  }
  rig.setFov(w / h);
  const buf = renderer.getDrawingBufferSize(new THREE.Vector2());
  particles.setScale(buf.y, camera.fov);
  arena.crowdMat.uniforms.scale.value = buf.y / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2));
  input.layout();
}
window.addEventListener('resize', onResize);
window.addEventListener('orientationchange', () => setTimeout(onResize, 200));

// ---------- screens ----------
const screens = ['main', 'play', 'online', 'lobby', 'garage', 'settings', 'help', 'pause', 'end'];
let current = 'main';
let previous = 'main';
let appMode = 'menu'; // menu | garage | match
let lastMatch = null;

function showScreen(name) {
  if (name !== current) previous = current;
  current = name;
  for (const s of screens) $('screen-' + s).classList.toggle('hidden', s !== name);
  syncSegments();
  if (name === 'garage') enterGarage();
  else if (appMode === 'garage') exitGarage();
}
function hideScreens() {
  for (const s of screens) $('screen-' + s).classList.add('hidden');
  current = null;
}

function syncSegments() {
  document.querySelectorAll('.seg[data-opt]').forEach(seg => {
    const opt = seg.dataset.opt;
    seg.querySelectorAll('button').forEach(b => b.classList.toggle('sel', String(settings[opt]) === b.dataset.val));
  });
}

function setupSegments() {
  syncSegments();
  document.querySelectorAll('.seg[data-opt]').forEach(seg => {
    const opt = seg.dataset.opt;
    seg.addEventListener('click', e => {
      const b = e.target.closest('button');
      if (!b) return;
      const raw = b.dataset.val;
      settings[opt] = isNaN(+raw) ? raw : +raw;
      syncSegments();
      if (session && session.isHost && ['teamSize', 'difficulty', 'duration'].includes(opt)) lobbyOptsChanged();
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
      if (session) { if (session.isHost) hostStartMatch(); }
      else if (lastMatch) startMatch(lastMatch);
      break;
    case 'quit':
      if (session && session.isHost && current === 'end') hostBackToLobby();
      else quitToMenu();
      break;
    case 'host': hostRoom(); break;
    case 'join': joinRoom($('join-code').value); break;
    case 'share': shareRoom(); break;
    case 'leave': leaveSession(); showScreen('online'); break;
    case 'switch-team': switchTeam(); break;
    case 'net-start': hostStartMatch(); break;
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
  preview.root.position.set(0, 0.38, 0);
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
function startMatch(opts, setupOverride = null) {
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
  game.setup(setupOverride || {
    mode: opts.mode,
    teamSize: settings.teamSize,
    difficulty: settings.difficulty,
    duration: settings.duration,
    body: settings.body,
    paint,
    replays: !!+settings.replays,
  });
  game.net = session ? session.net : null;
  if (game.player) game.player.assist = !!+settings.assist;
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
  if (appMode !== 'match' || game.state === 'ended' || game.paused || current === 'pause') return;
  // online matches keep running for everybody
  if (!session) game.paused = true;
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
  if (session) leaveSession();
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
  const online = !!session;
  $('btn-end-again').classList.toggle('hidden', online && !session.isHost);
  $('btn-end-quit').textContent = online ? (session.isHost ? 'LOBBY' : 'VERLATEN') : 'HOOFDMENU';
  $('end-note').textContent = online && !session.isHost ? 'Wachten tot de host een nieuwe wedstrijd start…' : '';
  showScreen('end');
}

game.onStateChange = (s) => {
  document.body.classList.toggle('replay', s === 'replay');
  if (s === 'replay') hud.clearMessage();
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
  if (current === 'pause') resume(); else pause();
});
input.on('any', () => {
  if (appMode === 'match' && game.state === 'replay' && game.role !== 'client') game.skipReplay();
  if (appMode === 'match') document.body.classList.add('played');
});
document.addEventListener('visibilitychange', () => { if (document.hidden && !session) pause(); });
$('btn-rotate-ignore').addEventListener('click', () => document.body.classList.add('ignore-rotate'));

// ---------- online multiplayer ----------
let session = null; // { net, isHost, players: [{id,name,team,body,paint}], inMatch }
const lobbyEl = (id) => $(id);

function playerName() {
  const n = ($('player-name').value || settings.name || '').trim().slice(0, 14);
  return n || 'Speler';
}
function myPaint() { return PAINTS[settings.paint] ? PAINTS[settings.paint].color : null; }
function setOnlineStatus(t) { $('online-status').textContent = t || ''; }

function newSession(isHost) {
  const net = new Net();
  session = { net, isHost, players: [], inMatch: false, myId: isHost ? 'host' : null };
  document.body.classList.toggle('net-host', isHost);
  document.body.classList.toggle('net-guest', !isHost);
  net.on('message', (from, msg) => onNetMessage(from, msg));
  net.on('join', () => {});
  net.on('leave', (id) => onPeerLeft(id));
  net.on('hostlost', () => {
    if (!session) return;
    const wasMatch = appMode === 'match';
    leaveSession();
    if (wasMatch) quitToMenu();
    showScreen('online');
    setOnlineStatus('De host heeft het spel verlaten.');
  });
  net.on('error', (e) => setOnlineStatus(errorText(e)));
  return session;
}

function leaveSession() {
  if (!session) return;
  try { if (!session.isHost) session.net.send('host', { t: 'bye' }); } catch (_) { /* ignore */ }
  session.net.close();
  session = null;
  game.net = null;
  document.body.classList.remove('net-host', 'net-guest');
}

async function hostRoom() {
  settings.name = playerName(); saveSettings();
  setOnlineStatus('Kamer maken…');
  leaveSession();
  const sess = newSession(true);
  try {
    await sess.net.host();
  } catch (e) {
    leaveSession();
    setOnlineStatus(errorText(e));
    return;
  }
  sess.players = [{ id: 'host', name: playerName(), team: 0, body: settings.body, paint: myPaint() }];
  setOnlineStatus('');
  renderLobby();
  showScreen('lobby');
}

async function joinRoom(code) {
  code = cleanCode(code);
  if (code.length !== 5) { setOnlineStatus('Vul een code van 5 tekens in.'); return; }
  settings.name = playerName(); saveSettings();
  setOnlineStatus('Verbinden met ' + code + '…');
  leaveSession();
  const sess = newSession(false);
  try {
    await sess.net.join(code);
  } catch (e) {
    leaveSession();
    setOnlineStatus(errorText(e));
    return;
  }
  sess.net.send('host', { t: 'hello', name: playerName(), body: settings.body, paint: myPaint() });
  setOnlineStatus('Verbonden! Wachten op de lobby…');
}

function lobbyMessage() {
  return { t: 'lobby', code: session.net.code, players: session.players, opts: { teamSize: settings.teamSize, difficulty: settings.difficulty, duration: settings.duration } };
}
function broadcastLobby() {
  if (!session || !session.isHost) return;
  session.net.broadcast(lobbyMessage());
  renderLobby();
}
function lobbyOptsChanged() {
  // never make teams smaller than the number of humans on them
  const need = Math.max(1, ...[0, 1].map(t => session.players.filter(p => p.team === t).length));
  if (settings.teamSize < need) { settings.teamSize = need; syncSegments(); }
  broadcastLobby();
}

function renderLobby(msg) {
  if (!session) return;
  const players = msg ? msg.players : session.players;
  const opts = msg ? msg.opts : { teamSize: settings.teamSize };
  $('room-code').textContent = msg ? msg.code : session.net.code;
  if (msg && !session.isHost) {
    settings.teamSize = msg.opts.teamSize; settings.difficulty = msg.opts.difficulty; settings.duration = msg.opts.duration;
    syncSegments();
  }
  for (const team of [0, 1]) {
    const ul = $('lobby-team' + team);
    const list = players.filter(p => p.team === team);
    let html = list.map(p => `<li class="${p.id === session.myId ? 'me' : ''}">${escapeHtml(p.name)}${p.id === 'host' ? ' <small>host</small>' : ''}</li>`).join('');
    for (let i = list.length; i < opts.teamSize; i++) html += '<li class="bot">Bot</li>';
    ul.innerHTML = html;
  }
  const humans = players.length;
  $('lobby-status').textContent = session.isHost
    ? (humans > 1 ? `${humans} spelers in de kamer. Klaar? Druk op START.` : 'Wachten op vrienden… je kunt ook alvast starten tegen bots.')
    : 'Wachten tot de host de wedstrijd start…';
}

function escapeHtml(t) {
  return String(t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function shareRoom() {
  if (!session) return;
  const url = location.origin + location.pathname + '?join=' + session.net.code;
  const text = `Doe mee met mijn Nitro Strikers-wedstrijd! Code: ${session.net.code}`;
  if (navigator.share) navigator.share({ title: 'Nitro Strikers', text, url }).catch(() => {});
  else if (navigator.clipboard) navigator.clipboard.writeText(url).then(() => { $('share-note').textContent = 'Link gekopieerd!'; }).catch(() => { $('share-note').textContent = url; });
  else $('share-note').textContent = url;
}

function switchTeam() {
  if (!session) return;
  if (session.isHost) hostSwitchTeam('host');
  else session.net.send('host', { t: 'team' });
}

function hostSwitchTeam(id) {
  const p = session.players.find(x => x.id === id);
  if (!p) return;
  const other = 1 - p.team;
  const count = session.players.filter(x => x.team === other).length;
  if (count >= 3) return;
  p.team = other;
  if (count + 1 > settings.teamSize) { settings.teamSize = count + 1; syncSegments(); }
  broadcastLobby();
}

function onPeerLeft(id) {
  if (!session || !session.isHost) return;
  const p = session.players.find(x => x.id === id);
  session.players = session.players.filter(x => x.id !== id);
  if (session.inMatch) {
    game.dropRemote(id);
    if (p) hud.feed(`${escapeHtml(p.name)} heeft het spel verlaten`);
  }
  broadcastLobby();
}

function onNetMessage(from, msg) {
  if (!session || !msg || typeof msg !== 'object') return;
  if (session.isHost) {
    switch (msg.t) {
      case 'hello': {
        if (session.inMatch) { session.net.send(from, { t: 'busy' }); return; }
        if (session.players.some(p => p.id === from)) return;
        const c0 = session.players.filter(p => p.team === 0).length, c1 = session.players.filter(p => p.team === 1).length;
        if (c0 >= 3 && c1 >= 3) { session.net.send(from, { t: 'full' }); return; }
        const team = c0 <= c1 ? 0 : 1;
        const name = String(msg.name || 'Speler').replace(/[<>&"'`]/g, '').slice(0, 14) || 'Speler';
        session.players.push({ id: from, name, team, body: (msg.body | 0) % 3, paint: typeof msg.paint === 'number' ? msg.paint : null });
        const n = session.players.filter(p => p.team === team).length;
        if (n > settings.teamSize) { settings.teamSize = n; syncSegments(); }
        session.net.send(from, { t: 'welcome', id: from });
        broadcastLobby();
        audio.click();
        break;
      }
      case 'team': hostSwitchTeam(from); break;
      case 'i': game.receiveInput(from, msg); break;
      case 'bye': session.net.kick(from); onPeerLeft(from); break;
      default: break;
    }
    return;
  }
  // guest
  switch (msg.t) {
    case 'welcome': session.myId = msg.id; break;
    case 'lobby':
      if (appMode !== 'match' || current === 'end') {
        renderLobby(msg);
        if (current !== 'lobby' && (current === 'online' || current === 'end')) {
          if (appMode === 'match') quitMatchView();
          showScreen('lobby');
        }
      }
      session.lastLobby = msg;
      break;
    case 'start': guestStartMatch(msg); break;
    case 's': if (appMode === 'match' && game.role === 'client') game.receiveSnapshot(msg); break;
    case 'e': if (appMode === 'match' && game.role === 'client') game.applyFx(msg.e); break;
    case 'busy': leaveSession(); setOnlineStatus('Er wordt al gespeeld in deze kamer. Probeer het straks opnieuw.'); break;
    case 'full': leaveSession(); setOnlineStatus('Deze kamer is vol.'); break;
    case 'tolobby':
      quitMatchView();
      if (session.lastLobby) renderLobby(session.lastLobby);
      showScreen('lobby');
      break;
    default: break;
  }
}

function buildRoster() {
  const names = [...BOT_NAMES].sort(() => Math.random() - 0.5);
  const roster = [];
  for (const team of [0, 1]) {
    const humans = session.players.filter(p => p.team === team);
    for (const h of humans) roster.push({ team, name: h.name, owner: h.id, body: h.body, paint: h.paint });
    for (let i = humans.length; i < settings.teamSize; i++) roster.push({ team, name: names.pop(), owner: null, body: (Math.random() * 3) | 0, paint: null });
  }
  return roster;
}

function onlineSetup(roster, opts, role, localOwner) {
  return {
    mode: 'match', online: true, role, roster, localOwner,
    teamSize: opts.teamSize, difficulty: opts.difficulty, duration: opts.duration,
    replays: !!+settings.replays,
  };
}

function hostStartMatch() {
  if (!session || !session.isHost) return;
  const roster = buildRoster();
  const opts = { teamSize: settings.teamSize, difficulty: settings.difficulty, duration: settings.duration };
  session.inMatch = true;
  session.net.broadcast({ t: 'start', roster, opts });
  startMatch({ mode: 'online' }, onlineSetup(roster, opts, 'host', 'host'));
}

function guestStartMatch(msg) {
  if (current === 'pause') hideScreens();
  session.inMatch = true;
  startMatch({ mode: 'online' }, onlineSetup(msg.roster, msg.opts, 'client', session.myId));
}

function quitMatchView() {
  appMode = 'menu';
  hud.show(false);
  hud.clearMessage();
  $('controls').classList.add('hidden');
  document.body.classList.remove('in-match', 'replay');
  input.enabled = false;
  audio.updateEngine(0, 0, false, false);
  game.net = null;
  startAttract();
}

function hostBackToLobby() {
  session.inMatch = false;
  session.net.broadcast({ t: 'tolobby' });
  quitMatchView();
  broadcastLobby();
  showScreen('lobby');
}

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
  if (composer) composer.render(); else renderer.render(scene, camera);
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
$('player-name').value = settings.name || '';
$('join-code').addEventListener('input', (e) => { e.target.value = cleanCode(e.target.value); });
for (const id of ['player-name', 'join-code']) {
  $(id).addEventListener('keydown', (e) => e.stopPropagation());
  $(id).addEventListener('keyup', (e) => e.stopPropagation());
}
setupSegments();
applySettings();
startAttract();
showScreen('main');
{
  const joinCode = cleanCode(new URLSearchParams(location.search).get('join'));
  if (joinCode) { $('join-code').value = joinCode; showScreen('online'); setOnlineStatus('Vul je naam in en druk op MEEDOEN.'); }
}
requestAnimationFrame((t) => { last = t; frame(t); });
setTimeout(() => $('loading').classList.add('done'), 150);

if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

// handy for debugging from the console
window.__nitro = { game, rig, settings, renderer, get session() { return session; } };
