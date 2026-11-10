// Procedural meshes for cars, wheels and the ball (all original designs).
import * as THREE from '../vendor/three.module.min.js';
import { BALL, TEAM_COLORS } from './config.js';
import { tireTexture } from './textures.js';
import { ITEMS } from './catalog.js';

// Side profiles (z forward, y up) run from the rear bottom, over the top, to the front bottom.
const texCache = {};
export function canvasTex(key, w, h, draw) {
  if (texCache[key]) return texCache[key];
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  texCache[key] = t;
  return t;
}

export function radialTex() {
  return canvasTex('radial', 128, 128, (g) => {
    const grd = g.createRadialGradient(64, 64, 2, 64, 64, 64);
    grd.addColorStop(0, 'rgba(255,255,255,1)');
    grd.addColorStop(0.3, 'rgba(255,255,255,0.45)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, 128, 128);
  });
}

export function flameTex() {
  return canvasTex('flame', 32, 128, (g) => {
    const grd = g.createLinearGradient(0, 0, 0, 128);
    grd.addColorStop(1, 'rgba(255,255,255,1)');
    grd.addColorStop(0.75, 'rgba(255,255,255,0.85)');
    grd.addColorStop(0.3, 'rgba(255,255,255,0.35)');
    grd.addColorStop(0, 'rgba(255,255,255,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, 32, 128);
  });
}

export function numberTex(n, color) {
  return canvasTex('num' + n + color, 128, 128, (g) => {
    g.clearRect(0, 0, 128, 128);
    g.fillStyle = '#fff';
    g.beginPath(); g.arc(64, 64, 58, 0, Math.PI * 2); g.fill();
    g.fillStyle = color;
    g.font = 'italic 900 78px system-ui, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(String(n).padStart(2, '0'), 64, 68);
  });
}

// ---------- wheels ----------
const tireGeo = new THREE.CylinderGeometry(0.2, 0.2, 0.17, 28);
tireGeo.rotateZ(Math.PI / 2);
const treadGeo = new THREE.TorusGeometry(0.195, 0.012, 4, 28);
treadGeo.rotateY(Math.PI / 2);
const tireWallGeo = new THREE.TorusGeometry(0.168, 0.035, 8, 28);
tireWallGeo.rotateY(Math.PI / 2);
let tireMatCache = null;
const tireMatProxy = () => {
  if (!tireMatCache) tireMatCache = new THREE.MeshStandardMaterial({ color: 0xffffff, map: tireTexture(), roughness: 0.88, metalness: 0.0 });
  return tireMatCache;
};
const rimDiscGeo = new THREE.CylinderGeometry(0.135, 0.135, 0.02, 24);
rimDiscGeo.rotateZ(Math.PI / 2);
const hubGeo = new THREE.CylinderGeometry(0.035, 0.035, 0.05, 12);
hubGeo.rotateZ(Math.PI / 2);
const boltGeo = new THREE.CylinderGeometry(0.008, 0.008, 0.03, 6);
boltGeo.rotateZ(Math.PI / 2);

function buildRim(style, rimMat, accentMat, darkMat, side) {
  const face = new THREE.Group();
  const add = (geo, mat, rx = 0, x = 0, y = 0, z = 0) => {
    const m = new THREE.Mesh(geo, mat);
    m.rotation.x = rx;
    m.position.set(x, y, z);
    face.add(m);
    return m;
  };
  switch (style) {
    case 'turbine': {
      add(rimDiscGeo, darkMat);
      const blade = new THREE.BoxGeometry(0.02, 0.11, 0.02);
      blade.translate(0, 0.07, 0);
      for (let i = 0; i < 10; i++) { const m = add(blade, rimMat, (i / 10) * Math.PI * 2, side * 0.012); m.rotation.z = 0.0; m.rotation.y = 0.35 * side; }
      break;
    }
    case 'disc': {
      add(rimDiscGeo, rimMat);
      const hole = new THREE.CylinderGeometry(0.022, 0.022, 0.025, 10);
      hole.rotateZ(Math.PI / 2);
      for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; add(hole, darkMat, 0, side * 0.004, Math.sin(a) * 0.085, Math.cos(a) * 0.085); }
      break;
    }
    case 'mesh': {
      add(rimDiscGeo, darkMat);
      const bar = new THREE.BoxGeometry(0.012, 0.26, 0.012);
      for (let i = 0; i < 12; i++) add(bar, rimMat, (i / 12) * Math.PI * 2 + 0.26, side * 0.012);
      const ring = new THREE.TorusGeometry(0.125, 0.012, 6, 24);
      ring.rotateY(Math.PI / 2);
      add(ring, rimMat, 0, side * 0.012);
      break;
    }
    case 'tri': {
      add(rimDiscGeo, darkMat);
      const arm = new THREE.BoxGeometry(0.03, 0.13, 0.06);
      arm.translate(0, 0.065, 0);
      for (let i = 0; i < 3; i++) add(arm, rimMat, (i / 3) * Math.PI * 2, side * 0.014);
      break;
    }
    case 'retro': {
      add(rimDiscGeo, rimMat);
      const cap = new THREE.SphereGeometry(0.075, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2);
      cap.rotateZ(-side * Math.PI / 2);
      add(cap, rimMat, 0, side * 0.01);
      const ring = new THREE.TorusGeometry(0.11, 0.01, 6, 24);
      ring.rotateY(Math.PI / 2);
      add(ring, darkMat, 0, side * 0.012);
      break;
    }
    case 'split': {
      add(rimDiscGeo, darkMat);
      const spoke = new THREE.BoxGeometry(0.012, 0.24, 0.022);
      for (let i = 0; i < 5; i++) for (const o of [-0.09, 0.09]) add(spoke, rimMat, (i / 5) * Math.PI * 2 + o, side * 0.012);
      const ring = new THREE.TorusGeometry(0.128, 0.008, 6, 28);
      ring.rotateY(Math.PI / 2);
      add(ring, accentMat, 0, side * 0.014);
      break;
    }
    case 'rally': {
      add(rimDiscGeo, rimMat);
      const hole = new THREE.CylinderGeometry(0.018, 0.018, 0.025, 10);
      hole.rotateZ(Math.PI / 2);
      for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; add(hole, darkMat, 0, side * 0.004, Math.sin(a) * 0.092, Math.cos(a) * 0.092); }
      const lip = new THREE.TorusGeometry(0.13, 0.01, 6, 28);
      lip.rotateY(Math.PI / 2);
      add(lip, darkMat, 0, side * 0.01);
      break;
    }
    default: { // star
      add(rimDiscGeo, darkMat);
      const spoke = new THREE.BoxGeometry(0.022, 0.24, 0.04);
      for (let i = 0; i < 5; i++) add(spoke, rimMat, (i / 5) * Math.PI * 2, side * 0.012);
      break;
    }
  }
  const hub = add(hubGeo, accentMat, 0, side * 0.02);
  for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2; add(boltGeo, rimMat, 0, side * 0.03, Math.sin(a) * 0.045, Math.cos(a) * 0.045); }
  return face;
}

export function buildWheel(style, rimMat, accentMat, darkMat, side) {
  const spin = new THREE.Group();
  spin.add(new THREE.Mesh(tireGeo, tireMatProxy()));
  for (const sx of [-0.05, 0.05]) {
    const t = new THREE.Mesh(treadGeo, tireMatProxy());
    t.position.x = sx;
    spin.add(t);
  }
  const wall = new THREE.Mesh(tireWallGeo, tireMatProxy());
  wall.position.x = side * 0.07;
  spin.add(wall);
  const face = buildRim(style, rimMat, accentMat, darkMat, side);
  face.position.x = side * 0.075;
  spin.add(face);
  return spin;
}

export function buildWheelPreview(index) {
  const w = ITEMS.wheel[index % ITEMS.wheel.length];
  const rimMat = new THREE.MeshStandardMaterial({ color: w.rim, roughness: 0.22, metalness: 0.95 });
  const darkMat = new THREE.MeshStandardMaterial({ color: 0x1b1d22, roughness: 0.5, metalness: 0.6 });
  const accentMat = new THREE.MeshBasicMaterial({ color: 0x59f3ff });
  return buildWheel(w.style, rimMat, accentMat, darkMat, 1);
}

// ---------- cars ----------
const _inv = new THREE.Matrix4();
const _m = new THREE.Matrix4();
// Merge every mesh below `parent` (except the `skip` subtrees) into one mesh per material.
export function mergeStatic(parent, skip) {
  parent.updateMatrixWorld(true);
  _inv.copy(parent.matrixWorld).invert();
  const groups = new Map();
  const remove = [];
  parent.traverse(o => {
    if (!o.isMesh || o === parent) return;
    for (let a = o; a && a !== parent; a = a.parent) if (skip.has(a)) return;
    let g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
    _m.multiplyMatrices(_inv, o.matrixWorld);
    g.applyMatrix4(_m);
    if (_m.determinant() < 0) flipWinding(g);
    const key = o.material.uuid;
    if (!groups.has(key)) groups.set(key, { mat: o.material, geos: [], cast: o.castShadow, order: o.renderOrder });
    groups.get(key).geos.push(g);
    remove.push(o);
  });
  for (const o of remove) o.parent.remove(o);
  for (const { mat, geos, cast, order } of groups.values()) {
    const mesh = new THREE.Mesh(mergeGeometries(geos), mat);
    mesh.castShadow = cast;
    mesh.renderOrder = order;
    parent.add(mesh);
  }
}

function flipWinding(g) {
  for (const name of ['position', 'normal', 'uv']) {
    const a = g.attributes[name];
    if (!a) continue;
    const n = a.itemSize, arr = a.array;
    for (let t = 0; t < a.count; t += 3) {
      for (let k = 0; k < n; k++) {
        const i1 = (t + 1) * n + k, i2 = (t + 2) * n + k;
        const tmp = arr[i1]; arr[i1] = arr[i2]; arr[i2] = tmp;
      }
    }
  }
}

function mergeGeometries(geos) {
  let count = 0;
  for (const g of geos) count += g.attributes.position.count;
  const pos = new Float32Array(count * 3), nor = new Float32Array(count * 3), uv = new Float32Array(count * 2);
  let o = 0;
  for (const g of geos) {
    const n = g.attributes.position.count;
    pos.set(g.attributes.position.array, o * 3);
    if (g.attributes.normal) nor.set(g.attributes.normal.array, o * 3);
    if (g.attributes.uv) uv.set(g.attributes.uv.array, o * 2);
    o += n;
    g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  out.computeBoundingSphere();
  return out;
}

// ---------- ball ----------
// A tech ball: twelve pentagonal armour panels separated by glowing grooves,
// each panel carrying a small lens. Built as a displaced high-res sphere.
export function buildBallMesh(quality = 'high') {
  const geo = quality === 'low' ? new THREE.SphereGeometry(BALL.R, 72, 54) : new THREE.SphereGeometry(BALL.R, 128, 96);
  const pos = geo.attributes.position;
  const t = (1 + Math.sqrt(5)) / 2;
  const centers = [
    [-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0],
    [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t],
    [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1],
  ].map(v => new THREE.Vector3(...v).normalize());
  const colors = new Float32Array(pos.count * 3);
  const glow = new Float32Array(pos.count);
  const v = new THREE.Vector3();
  const panel = new THREE.Color(0xd9dee6), panelDark = new THREE.Color(0x9aa3b0), groove = new THREE.Color(0x10141c), lens = new THREE.Color(0x0d1a24), rim = new THREE.Color(0x2b3340);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i).normalize();
    let d1 = -2, d2 = -2, i1 = 0;
    for (let k = 0; k < 12; k++) {
      const d = v.dot(centers[k]);
      if (d > d1) { d2 = d1; d1 = d; i1 = k; } else if (d > d2) d2 = d;
    }
    const a1 = Math.acos(Math.min(1, d1)), a2 = Math.acos(Math.min(1, d2));
    const edge = a2 - a1;                 // 0 on the seam between two panels
    let r = BALL.R, g = 0;
    if (edge < 0.05) { r *= 0.965; c.copy(groove); g = 1 - edge / 0.05; }
    else if (edge < 0.075) { r *= 0.985 + (edge - 0.05) * 0.5; c.copy(rim); }
    else {
      c.copy(i1 % 2 ? panel : panelDark).lerp(panel, 0.4);
      // ring and lens at the panel centre
      if (a1 < 0.09) { c.copy(lens); r *= 1.0; g = 0.7 * (1 - a1 / 0.09); }
      else if (a1 < 0.13) { c.copy(rim); r *= 1.012; }
      else r *= 1.006;
    }
    v.multiplyScalar(r);
    pos.setXYZ(i, v.x, v.y, v.z);
    colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
    glow[i] = g;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.setAttribute('glow', new THREE.BufferAttribute(glow, 1));
  geo.computeVertexNormals();

  const glowColor = new THREE.Color(0x59f3ff);
  const glowUniform = { value: glowColor };
  const glowAmount = { value: 1.0 };
  const mat = new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.3, metalness: 0.4, clearcoat: 0.6, clearcoatRoughness: 0.15, envMapIntensity: 1.3 });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.glowColor = glowUniform;
    shader.uniforms.glowAmount = glowAmount;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float glow;\nvarying float vGlow;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvGlow = glow;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 glowColor;\nuniform float glowAmount;\nvarying float vGlow;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += glowColor * vGlow * glowAmount;');
  };
  const mesh = new THREE.Mesh(geo, mat);
  mesh.castShadow = true;
  const group = new THREE.Group();
  group.add(mesh);
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: radialTex(), color: 0x7ff6ff, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0 }));
  halo.scale.set(BALL.R * 4.2, BALL.R * 4.2, 1);
  group.add(halo);
  const base = new THREE.Color(0x59f3ff);
  const teamCols = TEAM_COLORS.map(tc => new THREE.Color(tc.glow));
  function setGlow(flash, team) {
    const target = team === undefined ? base : teamCols[team];
    glowColor.lerp(target, 0.08);
    glowAmount.value = 0.9 + flash * 4;
    halo.material.color.copy(glowColor);
  }
  return { group, mesh, halo, mat, setGlow };
}

export function buildShadowMesh(size) {
  const tex = canvasTex('shadow', 64, 64, (g) => {
    const grd = g.createRadialGradient(32, 32, 2, 32, 32, 32);
    grd.addColorStop(0, 'rgba(0,0,0,0.65)');
    grd.addColorStop(0.6, 'rgba(0,0,0,0.3)');
    grd.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, 64, 64);
  });
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(size, size),
    new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false })
  );
  m.rotation.x = -Math.PI / 2;
  m.renderOrder = 1;
  return m;
}
