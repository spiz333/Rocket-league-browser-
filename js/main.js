import * as THREE from '../vendor/three.module.min.js';
import { buildArena, BoostPadsView } from './arenaView.js';
import { Particles } from './effects.js';
import { Audio } from './audio.js';
import { Input, ACTIONS, DEFAULT_KEYS, DEFAULT_PAD, keyLabel, padLabel, STICK_ACTIONS } from './input.js';
import { Hud } from './hud.js';
import { CameraRig } from './camera.js';
import { Game } from './game.js';
import { buildCarMesh, defaultLook, BODY_TYPES, liveryThumb, bodySilhouette } from './cars.js';
import { ITEMS, SLOTS, RARITY, itemId, itemPrice, defaultInventory, dailyShop, msToMidnightUTC, creditsForMatch, STARTING_CREDITS } from './catalog.js';
import { TEAM_COLORS, BOT_NAMES, MUTATORS } from './config.js';
import { MAPS, getMap } from './maps.js';
import { Net, errorText, cleanCode } from './net.js';
import { EffectComposer } from '../vendor/postprocessing/EffectComposer.js';
import { RenderPass } from '../vendor/postprocessing/RenderPass.js';
import { UnrealBloomPass } from '../vendor/postprocessing/UnrealBloomPass.js';
import { OutputPass } from '../vendor/postprocessing/OutputPass.js';
import { ShaderPass } from '../vendor/postprocessing/ShaderPass.js';

const $ = (id) => document.getElementById(id);
const isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
if (isTouch) document.body.classList.add('touch');

// ---------- settings ----------
const STORE_KEY = 'nitro-strikers-settings-v3';
const DEFAULTS = {
  teamSize: 2, difficulty: 'normal', duration: 300, map: 'random',
  sound: 1, musicVol: 50, sfxVol: 80, autoGas: 1, invertPitch: 0, vibrate: 1,
  quality: isTouch ? 'low' : 'high', perfVersion: 2, replays: 1, ballCam: 1, minimap: 1, showFps: 0,
  camFov: 100, camDist: 4.6, camHeight: 1.65, camAngle: -3, camStiff: 50, camSwivel: 4.5, camShake: 1, stickFlip: 0,
  steerCurve: 1.3, btnSize: 'normal', assist: 1, name: '', look: defaultLook(),
  profile: { xp: 0, level: 1, matches: 0, wins: 0, goals: 0 },
  credits: STARTING_CREDITS, inventory: defaultInventory(), mutator: 'none', challengeBest: 0,
  keys: null, pad: null,
};
let settings = { ...DEFAULTS };
try {
  const raw = localStorage.getItem(STORE_KEY);
  const old = localStorage.getItem('nitro-strikers-settings-v1');
  if (raw) settings = { ...DEFAULTS, ...JSON.parse(raw) };
  else if (old) {
    // carry over a few things from the previous version
    const o = JSON.parse(old);
    settings = { ...DEFAULTS, name: o.name || '', look: { ...defaultLook(), body: o.body | 0, paint: o.paint | 0 }, autoGas: o.autoGas ?? 1, invertPitch: o.invertPitch ?? 0 };
  }
  settings.look = { ...defaultLook(), ...settings.look };
  settings.profile = { ...DEFAULTS.profile, ...settings.profile };
  settings.inventory = [...new Set([...(settings.inventory || []), ...defaultInventory()])];
  if (typeof settings.credits !== 'number') settings.credits = STARTING_CREDITS;
  // old 'decal' slot became 'livery'
  if (settings.look.decal !== undefined && settings.look.livery === undefined) settings.look.livery = settings.look.decal;
  for (const k of Object.keys(SLOTS)) {
    const max = k === 'body' ? BODY_TYPES.length : ITEMS[k].length;
    settings.look[k] = Math.max(0, Math.min(max - 1, settings.look[k] | 0));
  }
  // v3.2: phones start on the fast preset (the older default was too heavy for many phones)
  if (settings.perfVersion !== DEFAULTS.perfVersion) {
    settings.perfVersion = DEFAULTS.perfVersion;
    if (isTouch) settings.quality = 'low';
    saveSettings();
  }
} catch (_) { /* storage unavailable */ }
function saveSettings() {
  if (typeof settings === 'undefined') return;
  try { localStorage.setItem(STORE_KEY, JSON.stringify(settings)); } catch (_) { /* ignore */ }
}
const quality = settings.quality;

// ---------- renderer & scene ----------
const canvas = $('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: quality !== 'low', powerPreference: 'high-performance' });
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
const useShadows = quality !== 'low';
renderer.shadowMap.enabled = useShadows;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
let dynScale = 1; // automatic resolution scaling when the frame rate drops
function pixelRatio() {
  const cap = { low: 1.0, medium: 1.5, high: 2 }[settings.quality] || 1.0;
  return Math.min(window.devicePixelRatio || 1, cap) * dynScale;
}
renderer.setPixelRatio(pixelRatio());

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0x0b0e1e, 140, 420);
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1200);

const hemi = new THREE.HemisphereLight(0xc4d6ff, 0x20202e, 1.5);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xffffff, 2.2);
sun.position.set(30, 60, 20);
scene.add(sun);
if (useShadows) {
  sun.castShadow = true;
  const sz = quality === 'high' ? 2048 : 1024;
  sun.shadow.mapSize.set(sz, sz);
  const sc = sun.shadow.camera;
  sc.left = -52; sc.right = 52; sc.top = 62; sc.bottom = -62; sc.near = 10; sc.far = 220;
  sun.shadow.bias = -0.0008;
  sun.shadow.normalBias = 0.03;
  sun.target.position.set(0, 0, 0);
  scene.add(sun.target);
}
const fill = new THREE.DirectionalLight(0x8fa4ff, 0.7);
fill.position.set(-30, 25, -40);
scene.add(fill);

const pmrem = new THREE.PMREMGenerator(renderer);
let envTex = null;
function buildEnvironment(T) {
  // A small HDR-ish world for reflections: the map's sky, a bright sun or floodlights,
  // the stands and the pitch. This is what makes the paint and chrome shine.
  const env = new THREE.Scene();
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false,
    uniforms: { top: { value: new THREE.Color(T.sky.top) }, hor: { value: new THREE.Color(T.sky.hor) }, low: { value: new THREE.Color(T.env.floor) } },
    vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `uniform vec3 top; uniform vec3 hor; uniform vec3 low; varying vec3 vP;
      void main(){ float h = normalize(vP).y; vec3 c = h > 0.0 ? mix(hor, top, pow(h, 0.6)) : mix(hor * 0.6, low * 0.7, min(1.0, -h * 4.0));
        gl_FragColor = vec4(c * 1.2, 1.0); }`,
  });
  env.add(new THREE.Mesh(new THREE.SphereGeometry(80, 32, 16), skyMat));
  // stands ring
  const stands = new THREE.Mesh(new THREE.CylinderGeometry(60, 60, 18, 48, 1, true), new THREE.MeshBasicMaterial({ color: new THREE.Color(T.standColor ?? 0x1a1d27).multiplyScalar(1.4), side: THREE.BackSide }));
  stands.position.y = -2;
  env.add(stands);
  // team coloured boards
  for (const [team, z] of [[0, -1], [1, 1]]) {
    const b = new THREE.Mesh(new THREE.PlaneGeometry(90, 4), new THREE.MeshBasicMaterial({ color: new THREE.Color(TEAM_COLORS[team].main).multiplyScalar(1.6) }));
    b.position.set(0, -8, z * 58);
    b.lookAt(0, -8, 0);
    env.add(b);
  }
  // bright light sources
  const hot = new THREE.MeshBasicMaterial({ color: new THREE.Color(T.env.panels).multiplyScalar(6) });
  if (T.sky.sun) {
    const d = new THREE.Vector3(...T.sky.sun.dir).normalize();
    const sunM = new THREE.Mesh(new THREE.SphereGeometry(5, 16, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(T.sky.sun.color).multiplyScalar(14) }));
    sunM.position.copy(d.multiplyScalar(70));
    env.add(sunM);
  }
  for (let i = 0; i < 4; i++) {
    const p = new THREE.Mesh(new THREE.PlaneGeometry(16, 6), hot);
    const a = i * Math.PI / 2 + Math.PI / 4;
    p.position.set(Math.sin(a) * 55, T.sky.sun ? 26 : 32, Math.cos(a) * 55);
    p.lookAt(0, 0, 0);
    env.add(p);
  }
  // a long soft strip light overhead gives the cars a nice highlight line
  const strip = new THREE.Mesh(new THREE.PlaneGeometry(70, 3), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffffff).multiplyScalar(T.sky.sun ? 1.5 : 3) }));
  strip.rotation.x = Math.PI / 2;
  strip.position.y = 50;
  env.add(strip);
  if (envTex) envTex.dispose();
  envTex = pmrem.fromScene(env, 0.02).texture;
  scene.environment = envTex;
  scene.environmentIntensity = T.sky.sun ? 0.85 : 0.75;
  env.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
}

// ---------- maps ----------
let arena = null;
let booted = false;
let mapId = null;
function loadMap(id) {
  const T = getMap(id);
  if (mapId === T.id && arena) return;
  if (arena) arena.dispose();
  mapId = T.id;
  arena = buildArena(scene, renderer, quality, T);
  scene.fog.color.set(T.fog.color);
  scene.fog.near = T.fog.near;
  scene.fog.far = T.fog.far;
  const l = T.light;
  hemi.color.set(l.hemiSky); hemi.groundColor.set(l.hemiGround); hemi.intensity = l.hemi;
  sun.color.set(l.sun); sun.intensity = l.sunI; sun.position.set(...l.sunPos);
  fill.color.set(l.fill); fill.intensity = l.fillI;
  renderer.toneMappingExposure = l.exposure;
  buildEnvironment(T);
  if (booted) {
    game.arena = arena;
    game.jumboDirty = true;
    onResize();
  }
}
function resolveMap(id) {
  if (id && id !== 'random') return id;
  return MAPS[(Math.random() * MAPS.length) | 0].id;
}
loadMap(resolveMap(settings.map));

const padsView = new BoostPadsView(scene);
const particles = new Particles(scene, quality === 'high' ? 2600 : 1400);
const audio = new Audio();
const hud = new Hud();
const input = new Input($('controls'));
const rig = new CameraRig(camera);
const game = new Game({ scene, rig, audio, particles, hud, input, arena, padsView, quality, shadows: useShadows });
booted = true;

// bloom for the neon look (highest quality only)
let composer = null;
let bloom = null;
if (quality === 'high') {
  // multisampled target so edges stay smooth with post-processing on
  const rt = new THREE.WebGLRenderTarget(window.innerWidth, window.innerHeight, { type: THREE.HalfFloatType, samples: 4 });
  composer = new EffectComposer(renderer, rt);
  composer.addPass(new RenderPass(scene, camera));
  bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.45, 0.42, 0.88);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());
  // final grade: a touch of contrast, saturation and a soft vignette
  composer.addPass(new ShaderPass({
    uniforms: { tDiffuse: { value: null } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `uniform sampler2D tDiffuse; varying vec2 vUv;
      void main(){
        vec4 c = texture2D(tDiffuse, vUv);
        float l = dot(c.rgb, vec3(0.299, 0.587, 0.114));
        c.rgb = mix(vec3(l), c.rgb, 1.12);
        c.rgb = (c.rgb - 0.5) * 1.06 + 0.5;
        vec2 d = vUv - 0.5;
        c.rgb *= 1.0 - dot(d, d) * 0.55;
        gl_FragColor = vec4(clamp(c.rgb, 0.0, 1.0), c.a);
      }`,
  }));
}

function applySettings() {
  input.setBindings(settings.keys, settings.pad);
  input.settings.autoGas = !!+settings.autoGas;
  input.settings.invertPitch = !!+settings.invertPitch;
  input.settings.vibrate = !!+settings.vibrate;
  input.settings.steerCurve = +settings.steerCurve || 1.3;
  document.body.classList.toggle('btn-small', settings.btnSize === 'small');
  document.body.classList.toggle('btn-large', settings.btnSize === 'large');
  document.body.classList.toggle('no-minimap', !+settings.minimap);
  document.body.classList.toggle('show-fps', !!+settings.showFps);
  if (game.player) { game.player.assist = !!+settings.assist; game.player.latchPitch = !!+settings.assist; }
  audio.setEnabled(!!+settings.sound);
  audio.setVolumes(settings.musicVol / 100, settings.sfxVol / 100);
  input.settings.stickFlip = !!+settings.stickFlip;
  rig.hFov = +settings.camFov;
  rig.distance = +settings.camDist;
  rig.height = +settings.camHeight;
  rig.angle = +settings.camAngle;
  rig.stiffness = settings.camStiff / 100;
  rig.swivel = +settings.camSwivel;
  rig.shakeScale = +settings.camShake ? 1 : 0;
  renderer.setPixelRatio(pixelRatio());
  game.opts.replays = !!+settings.replays;
  onResize();
}

// ---------- resize ----------
function onResize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setPixelRatio(pixelRatio());
  renderer.setSize(w, h);
  if (composer) {
    composer.setPixelRatio(renderer.getPixelRatio());
    composer.setSize(w, h);
    bloom.resolution.set(w / 2, h / 2);
  }
  rig.setFov(w / h);
  const buf = renderer.getDrawingBufferSize(new THREE.Vector2());
  particles.setScale(buf.y, camera.fov);
  if (arena && arena.crowdMat) arena.crowdMat.uniforms.scale.value = buf.y / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2));
  input.layout();
}
window.addEventListener('resize', onResize);
window.addEventListener('orientationchange', () => setTimeout(onResize, 200));

// ---------- screens ----------
const screens = ['main', 'play', 'online', 'lobby', 'garage', 'shop', 'settings', 'help', 'pause', 'end'];
let current = 'main';
let previous = 'main';
let appMode = 'menu'; // menu | garage | match
let lastMatch = null;

function showScreen(name) {
  if (name !== current) previous = current;
  current = name;
  for (const s of screens) $('screen-' + s).classList.toggle('hidden', s !== name);
  syncSegments();
  if (name === 'garage' || name === 'shop') enterGarage();
  else if (appMode === 'garage') exitGarage();
  if (name === 'main') { refreshProfile(); refreshCredits(); }
  if (name === 'settings') renderBinds();
  // controller users: focus the first control of the new screen
  if (document.body.classList.contains('pad-nav')) requestAnimationFrame(() => { const f = focusables()[0]; if (f) f.focus({ preventScroll: true }); });
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
  document.querySelectorAll('input[data-range]').forEach(r => { r.value = settings[r.dataset.range]; });
  document.querySelectorAll('output[data-out]').forEach(o => {
    const k = o.dataset.out, v = settings[k];
    o.textContent = k === 'camFov' ? v + '°' : k === 'camAngle' ? v + '°' : k === 'camStiff' ? v + '%' : String(v);
  });
  document.querySelectorAll('.map-grid').forEach(g => g.querySelectorAll('.map-card').forEach(c => c.classList.toggle('sel', c.dataset.map === settings.map)));
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
      if (opt === 'quality') $('quality-note').textContent = 'Reload the page to fully apply the graphics change.';
      applySettings();
    });
  });
  document.querySelectorAll('input[data-range]').forEach(r => {
    r.addEventListener('input', () => {
      settings[r.dataset.range] = +r.value;
      audio.init();
      applySettings();
      syncSegments();
      saveSettings();
    });
  });
  // map pickers
  const cards = [{ id: 'random', name: 'Random' }, ...MAPS];
  document.querySelectorAll('.map-grid[data-maps]').forEach(grid => {
    grid.innerHTML = cards.map(m => {
      const p = m.preview;
      const sky = p ? `background: linear-gradient(180deg, ${p[0]}, ${p[1]})` : '';
      const field = p ? `background: repeating-linear-gradient(90deg, ${p[2]} 0 10px, ${shade(p[2])} 10px 20px)` : 'background:#2a3350';
      return `<button class="map-card${m.id === 'random' ? ' random' : ''}" data-map="${m.id}" title="${m.desc || 'Surprise me'}"><i class="sky" style="${sky}"></i><i class="field" style="${field}"></i><span>${m.name}</span></button>`;
    }).join('');
    grid.addEventListener('click', e => {
      const c = e.target.closest('.map-card');
      if (!c) return;
      settings.map = c.dataset.map;
      saveSettings();
      audio.init(); audio.click();
      syncSegments();
      if (session && session.isHost) broadcastLobby();
    });
  });
  // hover blips on desktop
  document.addEventListener('pointerover', e => {
    if (e.pointerType !== 'mouse') return;
    const t = e.target.closest('.btn, .tile, .chip, .map-card, .g-item, .seg button');
    if (t && t !== lastHover) { lastHover = t; audio.hover(); }
  });
}
let lastHover = null;
function shade(hex) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.max(0, (n >> 16) - 18), g = Math.max(0, ((n >> 8) & 255) - 18), b = Math.max(0, (n & 255) - 18);
  return `rgb(${r},${g},${b})`;
}

document.addEventListener('click', e => {
  const go = e.target.closest('[data-go]');
  const act = e.target.closest('[data-action]');
  const back = e.target.closest('[data-back]');
  if (go || act || back) { audio.init(); audio.click(); }
  if (go) showScreen(go.dataset.go);
  if (back) showScreen(previous === 'settings' || previous === 'help' || !previous ? (appMode === 'match' ? 'pause' : 'main') : previous);
  if (!act) return;
  switch (act.dataset.action) {
    case 'start': startMatch({ mode: 'match' }); break;
    case 'training': startMatch({ mode: 'training' }); break;
    case 'challenge': startMatch({ mode: 'challenge' }); break;
    case 'resume': resume(); break;
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
    case 'binds-reset':
      settings.keys = null; settings.pad = null; saveSettings();
      input.setBindings(null, null); renderBinds();
      break;
    case 'cam-reset':
      for (const k of ['camFov', 'camDist', 'camHeight', 'camAngle', 'camStiff', 'camSwivel', 'camShake']) settings[k] = DEFAULTS[k];
      saveSettings(); applySettings(); syncSegments();
      break;
  }
});

function xpForLevel(level) { return 400 + level * 150; }
function refreshProfile() {
  $('profile-name').textContent = settings.name || 'Player';
  $('profile-car').textContent = BODY_TYPES[settings.look.body % BODY_TYPES.length].name;
  const pr = settings.profile;
  $('profile-level').textContent = pr.level;
  $('best-score').textContent = 'best ' + (settings.challengeBest | 0);
  $('profile-xp-fill').style.width = `${Math.min(100, (pr.xp / xpForLevel(pr.level)) * 100)}%`;
}

// awards XP after a match and animates the bar on the end screen
function awardXp(res) {
  const me = res.cars.find(c => c.isPlayer);
  const box = $('xp-box');
  if (!me) { box.classList.add('hidden'); $('cr-gain').textContent = ''; return; }
  const won = res.score[res.playerTeam] > res.score[1 - res.playerTeam];
  let credits = res.mode === 'challenge' ? res.score[0] * 30 : creditsForMatch(me.points, won, res.mode);
  if (res.mode === 'challenge' && res.score[0] > (settings.challengeBest | 0)) { settings.challengeBest = res.score[0]; credits += 100; }
  addCredits(credits);
  $('cr-gain').innerHTML = credits ? `+${credits} ${COIN}` : '';
  box.classList.remove('hidden', 'levelup');
  const pr = settings.profile;
  const gain = Math.round(me.points * 0.6 + (won ? 150 : 60) + me.goals * 20);
  pr.matches++; if (won) pr.wins++; pr.goals += me.goals;
  const startLevel = pr.level, startXp = pr.xp;
  pr.xp += gain;
  while (pr.xp >= xpForLevel(pr.level)) { pr.xp -= xpForLevel(pr.level); pr.level++; }
  saveSettings();
  $('xp-gain').textContent = `+${gain} XP`;
  // animate: fill the old level, then the new one
  const fill = $('xp-fill');
  let lvl = startLevel, xp = startXp, remaining = gain;
  $('xp-level').textContent = lvl;
  fill.style.transition = 'none';
  fill.style.width = `${(xp / xpForLevel(lvl)) * 100}%`;
  $('xp-text').textContent = `LEVEL ${lvl} · ${pr.wins} WINS / ${pr.matches} MATCHES`;
  const stepFill = () => {
    const need = xpForLevel(lvl) - xp;
    const take = Math.min(need, remaining);
    xp += take; remaining -= take;
    fill.style.transition = 'width 0.9s ease-out';
    fill.style.width = `${(xp / xpForLevel(lvl)) * 100}%`;
    if (xp >= xpForLevel(lvl)) {
      setTimeout(() => {
        lvl++; xp = 0;
        $('xp-level').textContent = lvl;
        box.classList.remove('levelup'); void box.offsetWidth; box.classList.add('levelup');
        audio.pickup(true);
        fill.style.transition = 'none';
        fill.style.width = '0%';
        $('xp-text').textContent = `LEVEL UP! LEVEL ${lvl}`;
        if (remaining > 0) setTimeout(stepFill, 60);
      }, 950);
    }
  };
  setTimeout(stepFill, 400);
}

// rotating tips on the main menu
const TIPS = [
  'Swipe across JUMP to flip — up is a front flip.',
  'Flip into the ball for your hardest shots.',
  'Big energy cells refill your boost to 100.',
  'Hit an opponent at top speed to wreck them.',
  'Keep boost for defence — rotate back after you attack.',
  'Drive up the curved walls to reach high balls.',
  'Hold DRIFT in the air to roll with the stick.',
  'Toggle BALL CAM when you lose track of the ball.',
  'Share your room link to play online with friends.',
  'Every match earns XP — level up by playing.',
];
let tipIdx = (Math.random() * TIPS.length) | 0;
function nextTip() {
  const el = $('tips');
  el.style.opacity = 0;
  setTimeout(() => { el.innerHTML = `<b>TIP</b>${TIPS[tipIdx % TIPS.length]}`; tipIdx++; el.style.opacity = 1; }, 400);
}
setInterval(() => { if (current === 'main') nextTip(); }, 7000);

// ---------- economy ----------
const COIN = '<svg class="coin" viewBox="0 0 20 20"><circle cx="10" cy="10" r="9" fill="#ffc53a" stroke="#a86a00" stroke-width="2"/><path d="M12.8 6.6a4 4 0 1 0 0 6.8" fill="none" stroke="#7a4b00" stroke-width="2.2" stroke-linecap="round"/></svg>';
function owns(slot, i) { return settings.inventory.includes(itemId(slot, i)); }
function refreshCredits() {
  document.querySelectorAll('.credits').forEach(el => { el.innerHTML = `${COIN}<b>${settings.credits.toLocaleString('en-US')}</b>`; });
}
function addCredits(n) {
  settings.credits += n;
  saveSettings();
  refreshCredits();
}
function buy(slot, i, price) {
  if (owns(slot, i)) return true;
  if (settings.credits < price) { audio.whistle(); return false; }
  settings.credits -= price;
  settings.inventory.push(itemId(slot, i));
  saveSettings();
  refreshCredits();
  audio.pickup(true);
  return true;
}

// ---------- garage & shop (shared 3D showroom) ----------
let preview = null;
let previewSpin = 0;
let showroomTab = 'body';
let tryOn = null;             // look being previewed (may include unowned items)
let shopSel = null;           // { slot, index, price } selected in the shop
const SLOT_ICONS = {
  topper: ['∅', '👑', '🚧', '😇', '😈', '🧢', '🦈', '🥳'],
  goalfx: ['💥', '🎆', '◎', '🎊', '⚡', '☀'],
  trail: ['✨', '🔥', '❄', '🌈', '💡', '🌟'],
};
function hex(c) { return '#' + c.toString(16).padStart(6, '0'); }
function itemIcon(slot, i) {
  const it = ITEMS[slot] ? ITEMS[slot][i] : null;
  const team = 0;
  switch (slot) {
    case 'body': return bodySilhouette(i);
    case 'livery': {
      const p = ITEMS.paint[settings.look.paint | 0];
      return `<img class="thumb" src="${liveryThumb(i, p.color != null ? p.color : TEAM_COLORS[team].main, team)}" alt="">`;
    }
    case 'paint': return `<i class="sw ${it.color == null ? 'team' : ''}" style="${it.color == null ? '' : 'background:' + hex(it.color)}"></i>`;
    case 'finish': {
      const bg = { Gloss: 'linear-gradient(135deg,#3a76ff,#a9c6ff 45%,#1c3f9c)', Matte: '#3a5fae', Satin: 'linear-gradient(135deg,#3561c0,#7c9be0)', Pearl: 'linear-gradient(135deg,#ffd6f0,#c7f1ff,#fff3c4)', Chrome: 'linear-gradient(135deg,#fff,#8a93a3 40%,#f1f3f7 60%,#5b6372)' }[it.name];
      return `<i class="sw" style="background:${bg}"></i>`;
    }
    case 'wheel': {
      const n = { star: 5, turbine: 10, disc: 0, mesh: 12, tri: 3, retro: 0, split: 10, rally: 0 }[it.style] ?? 5;
      let spokes = '';
      for (let k = 0; k < n; k++) { const a = (k / n) * Math.PI * 2; spokes += `<line x1="20" y1="20" x2="${(20 + Math.sin(a) * 12).toFixed(1)}" y2="${(20 - Math.cos(a) * 12).toFixed(1)}" stroke="${hex(it.rim)}" stroke-width="2.4"/>`; }
      return `<svg viewBox="0 0 40 40" class="sil"><circle cx="20" cy="20" r="18" fill="#15161b"/><circle cx="20" cy="20" r="13" fill="${n ? '#23262e' : hex(it.rim)}"/>${spokes}<circle cx="20" cy="20" r="3.5" fill="#59f3ff"/></svg>`;
    }
    case 'boost': return `<i class="sw ${it.outer == null ? 'team' : ''}" style="${it.outer == null ? '' : 'background:radial-gradient(circle at 50% 60%,#fff,' + hex(it.outer) + ' 55%,#0a0d18)'}"></i>`;
    default: return `<span class="ico">${(SLOT_ICONS[slot] || [])[i] || '•'}</span>`;
  }
}
function itemCard(slot, i, opts = {}) {
  const it = ITEMS[slot][i];
  const rar = RARITY[it.rarity] || RARITY.common;
  const owned = owns(slot, i);
  const price = Math.round(itemPrice(slot, i) * (1 - (opts.discount || 0)));
  const sel = opts.selected ? ' sel' : '';
  const tag = owned ? (opts.equipped ? '<span class="tag eq">EQUIPPED</span>' : '<span class="tag own">OWNED</span>')
    : `<span class="tag price">${COIN}${price.toLocaleString('en-US')}</span>`;
  return `<button class="g-item${sel}${owned ? '' : ' locked'}" data-slot="${slot}" data-i="${i}" data-price="${price}" style="--rar:${rar.color}">
    <span class="rar-bar"></span><span class="g-ico">${itemIcon(slot, i)}</span><span class="g-name">${it.name}</span>${tag}
    ${opts.discount ? `<span class="deal">-${Math.round(opts.discount * 100)}%</span>` : ''}</button>`;
}
function refreshPreview() {
  if (appMode !== 'garage') return;
  if (preview) { scene.remove(preview.root); preview.root.traverse(o => { if (o.isMesh && o.geometry) o.geometry.dispose(); }); }
  preview = buildCarMesh(0, tryOn || settings.look, quality);
  preview.root.position.set(0, 0.38, 0);
  preview.flames.visible = showroomTab === 'boost';
  scene.add(preview.root);
}
function renderGarage() {
  const slot = showroomTab;
  const list = slot === 'body' ? ITEMS.body : ITEMS[slot];
  const sel = (tryOn || settings.look)[slot] | 0;
  $('garage-items').innerHTML = list.map((_, i) => itemCard(slot, i, { selected: i === sel, equipped: (settings.look[slot] | 0) === i })).join('');
  document.querySelectorAll('#garage-tabs button').forEach(b => b.classList.toggle('sel', b.dataset.tab === slot));
  showItemInfo(slot, sel, 'garage');
}
function showItemInfo(slot, i, where) {
  const it = ITEMS[slot][i];
  const rar = RARITY[it.rarity] || RARITY.common;
  const owned = owns(slot, i);
  const info = $(where + '-info');
  const price = shopSel && shopSel.slot === slot && shopSel.index === i ? shopSel.price : itemPrice(slot, i);
  info.innerHTML = `<span class="rar-name" style="color:${rar.color}">${rar.name} · ${SLOTS[slot].label}</span>
    <b>${it.name}</b><span class="desc">${it.desc || ''}</span>
    ${owned ? ((settings.look[slot] | 0) === i ? '<span class="note">Equipped</span>' : `<button class="btn primary" data-equip="${slot}:${i}">EQUIP</button>`)
      : `<button class="btn primary buy" data-buy="${slot}:${i}:${price}" ${settings.credits < price ? 'disabled' : ''}>BUY ${COIN}${price.toLocaleString('en-US')}</button>
         ${settings.credits < price ? '<span class="note">Win matches to earn more credits.</span>' : ''}`}`;
}
function onItemClick(e, where) {
  const b = e.target.closest('.g-item');
  if (!b) return;
  const slot = b.dataset.slot, i = +b.dataset.i;
  audio.click();
  tryOn = { ...settings.look, [slot]: i };
  if (owns(slot, i) && where === 'garage') { settings.look = { ...settings.look, [slot]: i }; saveSettings(); refreshProfile(); }
  shopSel = { slot, index: i, price: +b.dataset.price };
  if (where === 'garage') renderGarage(); else renderShop();
  showItemInfo(slot, i, where);
  refreshPreview();
}
$('garage-tabs').addEventListener('click', e => {
  const b = e.target.closest('button');
  if (!b) return;
  showroomTab = b.dataset.tab;
  tryOn = null; shopSel = null;
  audio.click();
  renderGarage();
  refreshPreview();
});
$('garage-items').addEventListener('click', e => onItemClick(e, 'garage'));
document.addEventListener('click', e => {
  const buyBtn = e.target.closest('[data-buy]');
  const eqBtn = e.target.closest('[data-equip]');
  if (buyBtn) {
    const [slot, i, price] = buyBtn.dataset.buy.split(':');
    if (buy(slot, +i, +price)) {
      settings.look = { ...settings.look, [slot]: +i };
      saveSettings();
      refreshProfile();
      if (current === 'shop') renderShop(); else renderGarage();
      showItemInfo(slot, +i, current === 'shop' ? 'shop' : 'garage');
      refreshPreview();
    }
  }
  if (eqBtn) {
    const [slot, i] = eqBtn.dataset.equip.split(':');
    settings.look = { ...settings.look, [slot]: +i };
    saveSettings();
    audio.click();
    refreshProfile();
    if (current === 'shop') renderShop(); else renderGarage();
    showItemInfo(slot, +i, current === 'shop' ? 'shop' : 'garage');
  }
});

let shopTab = 'featured';
function renderShop() {
  const grid = $('shop-items');
  document.querySelectorAll('#shop-tabs button').forEach(b => b.classList.toggle('sel', b.dataset.tab === shopTab));
  if (shopTab === 'featured') {
    grid.innerHTML = dailyShop().map(d => itemCard(d.slot, d.index, { discount: d.discount, selected: shopSel && shopSel.slot === d.slot && shopSel.index === d.index })).join('');
  } else {
    const list = ITEMS[shopTab];
    grid.innerHTML = list.map((it, i) => it.free ? '' : itemCard(shopTab, i, { selected: shopSel && shopSel.slot === shopTab && shopSel.index === i })).join('');
  }
  const ms = msToMidnightUTC();
  $('shop-timer').textContent = `New items in ${Math.floor(ms / 3600000)}h ${Math.floor(ms / 60000) % 60}m`;
  if (!shopSel) $('shop-info').innerHTML = '<span class="desc">Tap an item to preview it on your car.</span>';
}
$('shop-tabs').addEventListener('click', e => {
  const b = e.target.closest('button');
  if (!b) return;
  shopTab = b.dataset.tab;
  audio.click();
  renderShop();
});
$('shop-items').addEventListener('click', e => onItemClick(e, 'shop'));

function enterGarage() {
  appMode = 'garage';
  game.paused = true;
  for (const v of game.views.values()) v.root.visible = false;
  game.ballView.group.visible = false;
  game.ballShadow.visible = false;
  tryOn = null; shopSel = null;
  if (current === 'shop') renderShop(); else renderGarage();
  refreshCredits();
  refreshPreview();
  rig.snap();
}
function exitGarage() {
  appMode = 'menu';
  tryOn = null;
  if (preview) { scene.remove(preview.root); preview = null; }
  game.paused = false;
}

// ---------- match flow ----------
function startMatch(opts, setupOverride = null, map = null) {
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
  loadMap(map || resolveMap(settings.map));
  game.paused = false;
  game.setup(setupOverride || {
    mode: opts.mode,
    teamSize: settings.teamSize,
    difficulty: settings.difficulty,
    duration: settings.duration,
    look: settings.look,
    playerName: settings.name || 'You',
    replays: !!+settings.replays,
    mutator: opts.mode === 'match' ? settings.mutator : 'none',
  });
  game.net = session ? session.net : null;
  if (game.player) { game.player.assist = !!+settings.assist; game.player.latchPitch = !!+settings.assist; }
  rig.ballCam = !!+settings.ballCam;
  updateCamButton();
  const ts = game.opts.teamSize;
  const mut = MUTATORS.find(m => m.id === game.opts.mutator);
  const modeText = opts.mode === 'training' ? 'PRACTICE' : opts.mode === 'challenge' ? 'STRIKER CHALLENGE'
    : `${session ? 'ONLINE · ' : ''}${ts} V ${ts}${mut && mut.id !== 'none' ? ' · ' + mut.name.toUpperCase() : ''}`;
  hud.setMode(modeText);
  hud.setScore(0, 0);
  hud.clearMessage();
  hud.clearLabels();
  hud.show(true);
  if (opts.mode === 'match' || opts.mode === 'online') hud.showIntro(game.cars, game.player, getMap(mapId).name, modeText, 2.8);
  if (opts.mode === 'challenge') hud.message('SCORE AS MANY AS YOU CAN', 'overtime', 2.5);
  $('controls').classList.remove('hidden');
  input.enabled = true;
  input.reset();
  document.body.classList.add('in-match');
  audio.playMusic('match');
}

function pause() {
  if (appMode !== 'match' || game.state === 'ended' || game.paused || current === 'pause') return;
  if (!session) game.paused = true; // online matches keep running for everybody
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
  quitMatchView();
  showScreen('main');
}

function quitMatchView() {
  appMode = 'menu';
  game.paused = false;
  hud.show(false);
  hud.clearMessage();
  $('controls').classList.add('hidden');
  document.body.classList.remove('in-match', 'replay');
  input.enabled = false;
  audio.updateEngine(0, 0, false, false);
  game.net = null;
  startAttract();
}

function startAttract() {
  game.setup({ mode: 'attract', teamSize: 2, difficulty: 'hard', duration: 0, replays: false });
  rig.ballCam = true;
  audio.playMusic('menu');
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
  title.textContent = res.mode === 'challenge' ? 'TIME!' : (won ? 'VICTORY' : 'DEFEAT');
  title.className = won ? 'win' : 'loss';
  $('end-score').innerHTML = `<span class="t0">${res.score[0]}</span> – <span class="t1">${res.score[1]}</span>`;
  const winner = res.score[0] > res.score[1] ? 0 : 1;
  const sorted = [...res.cars].sort((a, b) => a.team - b.team || b.points - a.points);
  let mvp = null;
  for (const c of res.cars) if (c.team === winner && (!mvp || c.points > mvp.points)) mvp = c;
  const tbody = $('end-table').querySelector('tbody');
  tbody.innerHTML = sorted.map(c => `<tr class="t${c.team}${c.isPlayer ? ' me' : ''}"><td>${escapeHtml(c.name)}${c === mvp ? '<span class="mvp">★ MVP</span>' : ''}</td><td>${c.points}</td><td>${c.goals}</td><td>${c.assists}</td><td>${c.saves}</td><td>${c.shots}</td></tr>`).join('');
  hud.clearMessage();
  awardXp(res);
  const online = !!session;
  $('btn-end-again').classList.toggle('hidden', online && !session.isHost);
  $('btn-end-quit').textContent = online ? (session.isHost ? 'LOBBY' : 'LEAVE') : 'MAIN MENU';
  $('end-note').textContent = online && !session.isHost ? 'Waiting for the host to start another match…' : '';
  showScreen('end');
}

game.onStateChange = (s) => {
  if (s === 'replay') replayCar.has = false;
  document.body.classList.toggle('replay', s === 'replay');
  if (s === 'replay') hud.clearMessage();
};

$('btn-pause').addEventListener('click', () => { audio.click(); pause(); });
$('btn-cam').addEventListener('click', () => toggleBallCam());
function updateCamButton() {
  $('btn-cam').classList.toggle('active', rig.ballCam);
  $('cam-state').textContent = rig.ballCam ? 'ON' : 'OFF';
}
function toggleBallCam() {
  rig.ballCam = !rig.ballCam;
  settings.ballCam = rig.ballCam ? 1 : 0;
  saveSettings();
  updateCamButton();
}
input.on('ballcam', () => { if (appMode === 'match') toggleBallCam(); });
input.on('pause', () => {
  if (appMode !== 'match') return;
  if (current === 'pause') resume(); else pause();
});
// ---------- controller: menu navigation ----------
function focusables() {
  const root = current ? $('screen-' + current) : null;
  if (!root) return [];
  return [...root.querySelectorAll('button, input, select, [data-go], [data-action], .map-card, .g-item')]
    .filter(el => el.offsetParent !== null && !el.disabled && !el.closest('.hidden'));
}
input.on('padnav', (dir) => {
  if (!current || input.capturing) return;
  document.body.classList.add('pad-nav');
  const els = focusables();
  if (!els.length) return;
  const cur = document.activeElement;
  if (!els.includes(cur)) { els[0].focus(); return; }
  if (cur.type === 'range' && (dir === 'left' || dir === 'right')) {
    const st = +cur.step || 1;
    cur.value = Math.max(+cur.min, Math.min(+cur.max, +cur.value + (dir === 'left' ? -st : st)));
    cur.dispatchEvent(new Event('input', { bubbles: true }));
    return;
  }
  const r = cur.getBoundingClientRect();
  const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
  let best = null, bs = Infinity;
  for (const el of els) {
    if (el === cur) continue;
    const q = el.getBoundingClientRect();
    const x = q.left + q.width / 2 - cx, y = q.top + q.height / 2 - cy;
    const along = dir === 'left' ? -x : dir === 'right' ? x : dir === 'up' ? -y : y;
    const across = dir === 'left' || dir === 'right' ? Math.abs(y) : Math.abs(x);
    if (along <= 4) continue;
    const sc = along + across * 2.2;
    if (sc < bs) { bs = sc; best = el; }
  }
  if (best) { best.focus({ preventScroll: true }); best.scrollIntoView({ block: 'nearest', inline: 'nearest' }); audio.hover(); }
});
input.on('padbutton', (i) => {
  if (!current || input.capturing) return;
  if (i === 0) {
    const el = document.activeElement;
    if (el && el !== document.body && focusables().includes(el)) { el.click(); document.body.classList.add('pad-nav'); }
    else { const f = focusables()[0]; if (f) { f.focus(); document.body.classList.add('pad-nav'); } }
  } else if (i === 1) {
    if (current === 'pause') { resume(); return; }
    const b = $('screen-' + current).querySelector('.back, [data-back]');
    if (b) b.click();
  }
});
window.addEventListener('pointermove', () => document.body.classList.remove('pad-nav'), { passive: true });

// ---------- key / button bindings ----------
function renderBinds() {
  const tb = $('bind-rows');
  if (!tb) return;
  const keys = input.keyBinds, pad = input.padBinds;
  tb.innerHTML = ACTIONS.map(([id, label]) => `<tr><td>${label}</td>
    <td><button class="bind" data-bind="${id}:0">${keyLabel(keys[id][0])}</button></td>
    <td><button class="bind" data-bind="${id}:1">${keyLabel(keys[id][1])}</button></td>
    <td>${STICK_ACTIONS.has(id) ? '<span class="bind fixed">Left stick</span>' : `<button class="bind pad" data-bind="${id}:pad">${padLabel(pad[id])}</button>`}</td></tr>`).join('');
}
document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-bind]');
  if (!b || input.capturing) return;
  const [id, slot] = b.dataset.bind.split(':');
  b.classList.add('listening');
  b.textContent = slot === 'pad' ? 'Press a button…' : 'Press a key…';
  // let this click finish before we start listening (so it isn't captured itself)
  setTimeout(() => input.capture((code) => {
    if (!settings.keys) settings.keys = JSON.parse(JSON.stringify(input.keyBinds));
    if (!settings.pad) settings.pad = { ...input.padBinds };
    if (code === 'Backspace' || code === 'Delete') {
      if (slot === 'pad') settings.pad[id] = -1; else settings.keys[id][+slot] = '';
    } else if (code) {
      if (slot === 'pad') { if (code.startsWith('Pad')) settings.pad[id] = +code.slice(3); }
      else if (!code.startsWith('Pad')) settings.keys[id][+slot] = code;
    }
    saveSettings();
    input.setBindings(settings.keys, settings.pad);
    renderBinds();
  }), 0);
});

input.on('any', () => {
  if (appMode === 'match' && game.state === 'replay' && game.role !== 'client') game.skipReplay();
  if (appMode === 'match') document.body.classList.add('played');
});
document.addEventListener('visibilitychange', () => { if (document.hidden && !session) pause(); });
$('btn-rotate-ignore').addEventListener('click', () => document.body.classList.add('ignore-rotate'));

// ---------- online multiplayer ----------
let session = null; // { net, isHost, players: [{id,name,team,look}], inMatch }

function playerName() {
  const n = ($('player-name').value || settings.name || '').trim().slice(0, 14);
  return n || 'Player';
}
function setOnlineStatus(t) { $('online-status').textContent = t || ''; }

function newSession(isHost) {
  const net = new Net();
  session = { net, isHost, players: [], inMatch: false, myId: isHost ? 'host' : null };
  document.body.classList.toggle('net-host', isHost);
  document.body.classList.toggle('net-guest', !isHost);
  net.on('message', (from, msg) => onNetMessage(from, msg));
  net.on('leave', (id) => onPeerLeft(id));
  net.on('hostlost', () => {
    if (!session) return;
    const wasMatch = appMode === 'match';
    leaveSession();
    if (wasMatch) quitMatchView();
    showScreen('online');
    setOnlineStatus('The host left the game.');
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
  setOnlineStatus('Creating room…');
  leaveSession();
  const sess = newSession(true);
  try {
    await sess.net.host();
  } catch (e) {
    leaveSession();
    setOnlineStatus(errorText(e));
    return;
  }
  sess.players = [{ id: 'host', name: playerName(), team: 0, look: settings.look }];
  if (settings.map === 'random') settings.map = resolveMap('random');
  setOnlineStatus('');
  renderLobby();
  showScreen('lobby');
}

async function joinRoom(code) {
  code = cleanCode(code);
  if (code.length !== 5) { setOnlineStatus('Enter a 5-character code.'); return; }
  settings.name = playerName(); saveSettings();
  setOnlineStatus('Connecting to ' + code + '…');
  leaveSession();
  const sess = newSession(false);
  try {
    await sess.net.join(code);
  } catch (e) {
    leaveSession();
    setOnlineStatus(errorText(e));
    return;
  }
  sess.net.send('host', { t: 'hello', name: playerName(), look: settings.look });
  setOnlineStatus('Connected! Waiting for the lobby…');
}

function lobbyMessage() {
  return { t: 'lobby', code: session.net.code, players: session.players, opts: { teamSize: settings.teamSize, difficulty: settings.difficulty, duration: settings.duration, map: settings.map } };
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
    if (msg.opts.map) settings.map = msg.opts.map;
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
    ? (humans > 1 ? `${humans} players in the room. Ready? Press START.` : 'Waiting for friends… you can also start against bots.')
    : 'Waiting for the host to start the match…';
}

function escapeHtml(t) {
  return String(t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function shareRoom() {
  if (!session) return;
  const url = location.origin + location.pathname + '?join=' + session.net.code;
  const text = `Join my Nitro Strikers match! Code: ${session.net.code}`;
  if (navigator.share) navigator.share({ title: 'Nitro Strikers', text, url }).catch(() => {});
  else if (navigator.clipboard) navigator.clipboard.writeText(url).then(() => { $('share-note').textContent = 'Link copied!'; }).catch(() => { $('share-note').textContent = url; });
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
    if (p) hud.feed(`${escapeHtml(p.name)} left the match`);
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
        const name = String(msg.name || 'Player').replace(/[<>&"'`]/g, '').slice(0, 14) || 'Player';
        session.players.push({ id: from, name, team, look: Game.cleanLook(msg.look) });
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
    case 'busy': leaveSession(); setOnlineStatus('A match is already running in this room. Try again in a bit.'); break;
    case 'full': leaveSession(); setOnlineStatus('This room is full.'); break;
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
    for (const h of humans) roster.push({ team, name: h.name, owner: h.id, look: h.look });
    for (let i = humans.length; i < settings.teamSize; i++) roster.push({ team, name: names.pop(), owner: null, look: Game.randomLook() });
  }
  return roster;
}

function onlineSetup(roster, opts, role, localOwner) {
  return {
    mode: 'match', online: true, role, roster, localOwner,
    teamSize: opts.teamSize, difficulty: opts.difficulty, duration: opts.duration,
    replays: !!+settings.replays, mutator: opts.mutator || 'none',
  };
}

function hostStartMatch() {
  if (!session || !session.isHost) return;
  const roster = buildRoster();
  const map = resolveMap(settings.map);
  const opts = { teamSize: settings.teamSize, difficulty: settings.difficulty, duration: settings.duration, mutator: settings.mutator };
  session.inMatch = true;
  session.net.broadcast({ t: 'start', roster, opts, map });
  startMatch({ mode: 'online' }, onlineSetup(roster, opts, 'host', 'host'), map);
}

function guestStartMatch(msg) {
  if (current === 'pause') hideScreens();
  session.inMatch = true;
  startMatch({ mode: 'online' }, onlineSetup(msg.roster, msg.opts, 'client', session.myId), msg.map);
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
let frameAvg = 16;
let scaleTimer = 0;
const _target = new THREE.Vector3();
const _from = new THREE.Vector3();

// Frame pacing: rAF timestamps jitter by a millisecond or two, which makes motion
// look uneven. Snap each frame to the measured display refresh interval and carry
// the tiny difference forward, so the simulation stays in sync with real time.
let refreshDt = 1 / 60;
let pacingErr = 0;
const recentDt = [];
function pacedDt(raw) {
  recentDt.push(raw);
  if (recentDt.length > 40) recentDt.shift();
  if (recentDt.length === 40 && (frameCount % 20) === 0) {
    const sorted = [...recentDt].sort((a, b) => a - b);
    refreshDt = sorted[20];
  }
  if (raw > 0.25) { pacingErr = 0; return 0.05; } // tab was hidden
  let dt = raw;
  if (Math.abs(raw - refreshDt) < refreshDt * 0.3) dt = refreshDt;
  else if (Math.abs(raw - refreshDt * 2) < refreshDt * 0.3) dt = refreshDt * 2;
  pacingErr += raw - dt;
  if (Math.abs(pacingErr) > refreshDt * 0.5) { dt += pacingErr; pacingErr = 0; }
  return Math.max(0, Math.min(0.05, dt));
}
let frameCount = 0;

function frame(now) {
  requestAnimationFrame(frame);
  frameCount++;
  const rawDt = Math.max(0, (now - last) / 1000);
  const dt = pacedDt(rawDt);
  last = now;
  elapsed += dt;
  adaptResolution(rawDt, dt);
  input.pollPads();

  if (appMode === 'garage') {
    previewSpin += dt * 0.4;
    const r = 3.6;
    _from.set(Math.sin(previewSpin) * r, 1.25, Math.cos(previewSpin) * r);
    // aim slightly to the left of the car so it sits on the right, clear of the menu
    const rx = Math.cos(previewSpin), rz = -Math.sin(previewSpin);
    const off = window.innerWidth > window.innerHeight ? 1.15 : 0;
    _target.set(-rx * off, 0.45, -rz * off);
    rig.cinematic(_target, _from, dt, 6);
    if (preview) {
      for (const w of preview.wheels) w.spin.rotation.x += dt * 2;
      if (preview.flames.visible) preview.flames.scale.set(1, 1, 0.85 + Math.random() * 0.4);
    }
    padsView.update(game.pads, elapsed);
    if (arena.update) arena.update(dt, elapsed, camera);
  } else {
    game.update(dt);
    if (game.state !== 'replay') game.computeRenderState();
    updateCamera(dt);
    game.render(dt, elapsed);
    if (appMode === 'match') updateHud(dt);
  }
  particles.update(dt);
  if (composer) composer.render(); else renderer.render(scene, camera);
}

let fpsTimer = 0;
function adaptResolution(rawDt, dt) {
  if (rawDt > 0.25) return; // tab switch etc.
  frameAvg += (rawDt * 1000 - frameAvg) * 0.05;
  fpsTimer += dt;
  if (+settings.showFps && fpsTimer > 0.5) {
    fpsTimer = 0;
    $('fps').textContent = `${Math.round(1000 / frameAvg)} FPS · ${Math.round(dynScale * 100)}%`;
  }
  scaleTimer += dt;
  if (scaleTimer < 1) return;
  scaleTimer = 0;
  let next = dynScale;
  const minScale = isTouch ? 0.5 : 0.6;
  if (frameAvg > 22 && dynScale > minScale) next = Math.max(minScale, dynScale - (frameAvg > 30 ? 0.15 : 0.08));
  else if (frameAvg < 14.5 && dynScale < 1) next = Math.min(1, dynScale + 0.05);
  if (next !== dynScale) { dynScale = next; onResize(); }
}

let replayGoalCam = false;
// stand-in for the scorer's car during replays (heading/speed come from the recording)
const _rv = new THREE.Vector3();
const replayCar = {
  quat: new THREE.Quaternion(), vel: new THREE.Vector3(), normal: new THREE.Vector3(0, 1, 0),
  onGround: true, boosting: false, lastPos: new THREE.Vector3(), has: false,
  forward(out) { return out.set(0, 0, 1).applyQuaternion(this.quat); },
  speed() { return this.vel.length(); },
};
function updateReplayCar(p, dt) {
  replayCar.quat.copy(p.quat);
  if (replayCar.has && dt > 0) {
    _rv.copy(p.pos).sub(replayCar.lastPos).divideScalar(dt);
    if (_rv.lengthSq() < 2500) replayCar.vel.lerp(_rv, 0.2);
  } else replayCar.vel.set(0, 0, 0);
  replayCar.lastPos.copy(p.pos);
  replayCar.has = true;
  replayCar.onGround = p.pos.y < 0.7;
  replayCar.boosting = p.boosting;
}
let replaySideX = 1;
let attractTimer = 0;
let attractFollow = null;
function updateCamera(dt) {
  const st = game.state;
  rig.lookInput.x = 0; rig.lookInput.y = 0; rig.lookInput.rear = false;
  if (appMode === 'menu') {
    attractTimer -= dt;
    if (attractTimer <= 0) {
      attractTimer = 9;
      const choices = game.cars.filter(c => !c.demolished);
      attractFollow = Math.random() < 0.65 && choices.length ? choices[(Math.random() * choices.length) | 0] : null;
      rig.snap();
    }
    if (attractFollow && !attractFollow.demolished && st !== 'goal') rig.follow(attractFollow, attractFollow.renderPos, game.ball.renderPos, dt);
    else rig.orbit(game.ball.renderPos, dt);
    return;
  }
  if (st === 'replay') {
    const idx = game.goalScorer ? game.cars.indexOf(game.goalScorer) : -1;
    const proxyBall = game.replayProxies.ball;
    const nearGoal = game.replayT > game.goalTime - 0.9;
    if (nearGoal) {
      const side = proxyBall.pos.z > 0 ? 1 : -1;
      if (!replayGoalCam) { replayGoalCam = true; rig.snap(); replaySideX = proxyBall.pos.x > 0 ? -1 : 1; }
      _from.set(replaySideX * 14, 2.6, side * 36);
      rig.cinematic(proxyBall.pos, _from, dt, 8);
      return;
    }
    replayGoalCam = false;
    if (idx >= 0 && !game.replayProxies.cars[idx].demolished) {
      const p = game.replayProxies.cars[idx];
      updateReplayCar(p, dt);
      const saved = rig.ballCam;
      rig.ballCam = true;
      rig.follow(replayCar, p.pos, proxyBall.pos, dt);
      rig.ballCam = saved;
    } else {
      _from.copy(proxyBall.pos).add(_target.set(0, 6, proxyBall.pos.z > 0 ? -14 : 14));
      rig.cinematic(proxyBall.pos, _from, dt, 4);
    }
    return;
  }
  const p = game.player;
  const li = rig.lookInput;
  const canLook = input.enabled && st !== 'goal';
  li.x = canLook ? input.look.x : 0; li.y = canLook ? input.look.y : 0; li.rear = canLook && input.held.rear;
  if (p && !p.demolished) rig.follow(p, p.renderPos, game.ball.renderPos, dt);
  else {
    _from.copy(rig.pos);
    rig.cinematic(game.ball.renderPos, _from, dt, 2);
  }
}

let lastBoostState = false;
function updateHud(dt) {
  hud.update(dt);
  hud.setScore(game.score[0], game.score[1]);
  hud.setClock(game.clockText(), game.overtime, game.opts.mode === 'match' ? game.timeLeft : undefined);
  if ((frameCount & 7) === 0) hud.setTeams(game.cars);
  const p = game.player;
  if (p) {
    hud.setBoost(p.boost, p.unlimitedBoost);
    if ((frameCount & 3) === 0) hud.setSpeed(p.speed() * 3.6 * 4.2);
    hud.speedFx(game.state === 'playing' && !p.demolished ? Math.max(0, Math.min(1, (p.speed() - 17) / 6)) * (p.boosting ? 1 : 0.6) : 0);
    const active = (game.state === 'playing' || game.state === 'goal') && !game.paused && !p.demolished;
    if ((frameCount & 1) === 0 || p.boosting !== lastBoostState) audio.updateEngine(p.speed(), p.controls.throttle, p.boosting, active);
    lastBoostState = p.boosting;
  }
  const replay = game.state === 'replay';
  hud.updateLabels(game.cars, camera, replay ? null : p, game.ball.renderPos, !rig.ballCam && game.state === 'playing');
  if (+settings.minimap && !replay) hud.drawMinimap(game.cars, game.ball.hidden ? null : game.ball.renderPos, p, dt);
}

// ---------- boot ----------
$('player-name').value = settings.name || '';
$('join-code').addEventListener('input', (e) => { e.target.value = cleanCode(e.target.value); });
for (const id of ['player-name', 'join-code']) {
  $(id).addEventListener('keydown', (e) => e.stopPropagation());
  $(id).addEventListener('keyup', (e) => e.stopPropagation());
}
$('player-name').addEventListener('change', () => { settings.name = playerName(); saveSettings(); refreshProfile(); });
setupSegments();
applySettings();
nextTip();
refreshCredits();
startAttract();
showScreen('main');
{
  const joinCode = cleanCode(new URLSearchParams(location.search).get('join'));
  if (joinCode) { $('join-code').value = joinCode; showScreen('online'); setOnlineStatus('Enter your name and press JOIN.'); }
}
// start the menu music on the first interaction (browsers block audio before that)
window.addEventListener('pointerdown', () => audio.init(), { once: true });
window.addEventListener('keydown', () => audio.init(), { once: true });
requestAnimationFrame((t) => { last = t; frame(t); });
setTimeout(() => $('loading').classList.add('done'), 150);

if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

// handy for debugging from the console
window.__nitro = { game, rig, settings, renderer, loadMap, get session() { return session; } };
