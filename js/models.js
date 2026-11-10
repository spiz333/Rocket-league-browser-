// Procedural meshes for cars, wheels and the ball (all original designs).
import * as THREE from '../vendor/three.module.min.js';
import { BALL, TEAM_COLORS } from './config.js';
import { flakeNormal, tireTexture, carbonTexture } from './textures.js';

// Side profiles (z forward, y up) run from the rear bottom, over the top, to the front bottom.
export const BODY_TYPES = [
  {
    name: 'Raptor', desc: 'Balanced wedge',
    width: 0.86,
    profile: [[-0.75, -0.13], [-0.77, 0.08], [-0.62, 0.15], [-0.2, 0.15], [0.25, 0.12], [0.6, 0.05], [0.8, -0.04], [0.78, -0.13]],
    cabin: [[-0.5, 0.12], [-0.3, 0.33], [0.06, 0.34], [0.32, 0.12]],
    cabinWidth: 0.66,
    spoiler: { z: -0.66, y: 0.27, w: 0.86, d: 0.18 },
  },
  {
    name: 'Brute', desc: 'Heavy-duty truck',
    width: 0.94,
    profile: [[-0.73, -0.14], [-0.74, 0.16], [-0.3, 0.2], [0.4, 0.19], [0.66, 0.15], [0.78, 0.06], [0.78, -0.14]],
    cabin: [[-0.55, 0.17], [-0.48, 0.43], [0.14, 0.43], [0.36, 0.17]],
    cabinWidth: 0.82,
    spoiler: null,
  },
  {
    name: 'Dart', desc: 'Low and long',
    width: 0.84,
    profile: [[-0.8, -0.12], [-0.82, 0.05], [-0.55, 0.11], [0.0, 0.1], [0.45, 0.04], [0.86, -0.04], [0.85, -0.12]],
    cabin: [[-0.42, 0.09], [-0.22, 0.27], [0.02, 0.27], [0.28, 0.08]],
    cabinWidth: 0.6,
    spoiler: { z: -0.74, y: 0.22, w: 0.94, d: 0.22 },
  },
  {
    name: 'Hornet', desc: 'Compact hot hatch',
    width: 0.88,
    profile: [[-0.68, -0.14], [-0.7, 0.12], [-0.62, 0.22], [-0.1, 0.2], [0.4, 0.14], [0.72, 0.04], [0.76, -0.14]],
    cabin: [[-0.62, 0.2], [-0.56, 0.4], [0.02, 0.41], [0.3, 0.16]],
    cabinWidth: 0.74,
    spoiler: { z: -0.6, y: 0.47, w: 0.78, d: 0.16, roof: true },
  },
  {
    name: 'Phantom', desc: 'Muscle coupe',
    width: 0.9,
    profile: [[-0.8, -0.13], [-0.81, 0.11], [-0.6, 0.14], [-0.1, 0.14], [0.35, 0.16], [0.7, 0.12], [0.84, 0.02], [0.84, -0.13]],
    cabin: [[-0.5, 0.13], [-0.32, 0.32], [0.0, 0.33], [0.28, 0.15]],
    cabinWidth: 0.68,
    spoiler: { z: -0.74, y: 0.2, w: 0.88, d: 0.12, lip: true },
  },
];

export const PAINTS = [
  { name: 'Team', color: null },
  { name: 'Graphite', color: 0x2c2f36 },
  { name: 'Pearl', color: 0xe8ecf2 },
  { name: 'Lime', color: 0x8be03a },
  { name: 'Violet', color: 0x8a4dff },
  { name: 'Gold', color: 0xf2b630 },
  { name: 'Teal', color: 0x1fd1c1 },
  { name: 'Pink', color: 0xff5fb7 },
  { name: 'Crimson', color: 0xb3122a },
  { name: 'Cobalt', color: 0x1747c9 },
  { name: 'Sunburst', color: 0xff8a1f },
  { name: 'Forest', color: 0x2f6b3a },
];

export const WHEELS = [
  { name: 'Star', style: 'star', rim: 0xc9ced8 },
  { name: 'Turbine', style: 'turbine', rim: 0x9aa4b5 },
  { name: 'Disc', style: 'disc', rim: 0xe9edf3 },
  { name: 'Mesh', style: 'mesh', rim: 0xd9b45a },
  { name: 'Tri', style: 'tri', rim: 0x2a2d33 },
  { name: 'Retro', style: 'retro', rim: 0xf2f2f2 },
];

export const BOOSTS = [
  { name: 'Nitro', core: [0.75, 0.95, 1.0], outer: 0x46c8ff },
  { name: 'Inferno', core: [1.0, 0.75, 0.35], outer: 0xff4a1c },
  { name: 'Toxic', core: [0.75, 1.0, 0.5], outer: 0x3dff6e },
  { name: 'Plasma', core: [0.9, 0.7, 1.0], outer: 0xa040ff },
  { name: 'Solar', core: [1.0, 0.95, 0.6], outer: 0xffc21a },
  { name: 'Team', core: null, outer: null },
];

export const DECALS = [
  { name: 'None' },
  { name: 'Stripes' },
  { name: 'Bolt' },
  { name: 'Number' },
  { name: 'Split' },
];

export function defaultLook() {
  return { body: 0, paint: 0, wheel: 0, boost: 0, decal: 1, number: 7 };
}

function bodyShape(points) {
  const shape = new THREE.Shape();
  const top = points.slice(1, -1).map(p => new THREE.Vector2(p[0], p[1]));
  shape.moveTo(points[0][0], points[0][1]);
  shape.lineTo(top[0].x, top[0].y);
  shape.splineThru(top);
  shape.lineTo(points[points.length - 1][0], points[points.length - 1][1]);
  shape.closePath();
  return shape;
}

function extrudeProfile(points, width, bevel, segs = 2, smooth = true) {
  const shape = smooth ? bodyShape(points) : (() => {
    const sh = new THREE.Shape();
    sh.moveTo(points[0][0], points[0][1]);
    for (let i = 1; i < points.length; i++) sh.lineTo(points[i][0], points[i][1]);
    sh.closePath();
    return sh;
  })();
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: width - bevel * 2,
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: segs,
    curveSegments: smooth ? 14 : 1,
  });
  geo.translate(0, 0, -(width - bevel * 2) / 2);
  geo.rotateY(-Math.PI / 2);
  geo.computeVertexNormals();
  return geo;
}

// height of the body top at a given z (follows the smoothed profile)
function topAt(type, z) {
  const pts = type.profile.slice(1, -1);
  for (let i = 1; i < pts.length; i++) {
    if (z <= pts[i][0]) {
      const t = (z - pts[i - 1][0]) / (pts[i][0] - pts[i - 1][0]);
      return pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * Math.min(1, Math.max(0, t));
    }
  }
  return pts[pts.length - 1][1];
}

const texCache = {};
function canvasTex(key, w, h, draw) {
  if (texCache[key]) return texCache[key];
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  texCache[key] = t;
  return t;
}

function radialTex() {
  return canvasTex('radial', 128, 128, (g) => {
    const grd = g.createRadialGradient(64, 64, 2, 64, 64, 64);
    grd.addColorStop(0, 'rgba(255,255,255,1)');
    grd.addColorStop(0.3, 'rgba(255,255,255,0.45)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, 128, 128);
  });
}

function flameTex() {
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

function numberTex(n, color) {
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

function buildWheel(style, rimMat, accentMat, darkMat, side) {
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
  const w = WHEELS[index % WHEELS.length];
  const rimMat = new THREE.MeshStandardMaterial({ color: w.rim, roughness: 0.22, metalness: 0.95 });
  const darkMat = new THREE.MeshStandardMaterial({ color: 0x1b1d22, roughness: 0.5, metalness: 0.6 });
  const accentMat = new THREE.MeshBasicMaterial({ color: 0x59f3ff });
  return buildWheel(w.style, rimMat, accentMat, darkMat, 1);
}

// ---------- cars ----------
export function buildCarMesh(team, look = {}, quality = 'high') {
  look = { ...defaultLook(), ...look };
  const type = BODY_TYPES[(look.body | 0) % BODY_TYPES.length];
  const tc = TEAM_COLORS[team];
  const nice = quality !== 'low';
  const root = new THREE.Group();
  const model = new THREE.Group();
  root.add(model);

  const paint = typeof look.paintColor === 'number' ? look.paintColor : (PAINTS[look.paint] ? PAINTS[look.paint].color : null);
  const bodyColor = paint != null ? paint : tc.main;
  // metallic paint: sparkling flakes under a mirror-like clear coat
  const bodyMat = nice
    ? new THREE.MeshPhysicalMaterial({
      color: bodyColor, roughness: 0.28, metalness: 0.6,
      normalMap: flakeNormal(), normalScale: new THREE.Vector2(0.18, 0.18),
      clearcoat: 1, clearcoatRoughness: 0.025, envMapIntensity: 1.6,
      iridescence: quality === 'high' ? 0.12 : 0, iridescenceIOR: 1.4,
    })
    : new THREE.MeshStandardMaterial({ color: bodyColor, roughness: 0.25, metalness: 0.6, envMapIntensity: 1.4 });
  const trimMat = new THREE.MeshStandardMaterial({ color: 0x17191e, roughness: 0.45, metalness: 0.4 });
  const carbonMat = nice
    ? new THREE.MeshPhysicalMaterial({ color: 0xffffff, map: carbonTexture(), roughness: 0.4, metalness: 0.3, clearcoat: 0.8, clearcoatRoughness: 0.08 })
    : new THREE.MeshStandardMaterial({ color: 0x0f1013, roughness: 0.35, metalness: 0.6 });
  const glassMat = new THREE.MeshPhysicalMaterial({ color: 0x0a101c, roughness: 0.03, metalness: 0.35, clearcoat: 1, clearcoatRoughness: 0.0, envMapIntensity: 2.2 });
  const accentMat = new THREE.MeshBasicMaterial({ color: tc.glow });
  const teamMat = new THREE.MeshStandardMaterial({ color: tc.main, roughness: 0.35, metalness: 0.4, emissive: tc.dark, emissiveIntensity: 0.4 });
  const wheel = WHEELS[(look.wheel | 0) % WHEELS.length];
  const rimMat = new THREE.MeshStandardMaterial({ color: wheel.rim, roughness: 0.14, metalness: 1.0, envMapIntensity: 1.8 });

  const body = new THREE.Mesh(extrudeProfile(type.profile, type.width, nice ? 0.055 : 0.05, nice ? 4 : 2), bodyMat);
  model.add(body);
  const cabin = new THREE.Mesh(extrudeProfile(type.cabin, type.cabinWidth, 0.045, nice ? 3 : 2, false), glassMat);
  model.add(cabin);
  const roofY = Math.max(...type.cabin.map(p => p[1]));
  const roofPts = type.cabin.filter(p => p[1] >= roofY - 0.02);
  const roofZ0 = Math.min(...roofPts.map(p => p[0]));
  const roofZ1 = Math.max(...roofPts.map(p => p[0]));
  const roof = new THREE.Mesh(new THREE.BoxGeometry(type.cabinWidth - 0.04, 0.025, Math.max(0.12, roofZ1 - roofZ0)), bodyMat);
  roof.position.set(0, roofY + 0.035, (roofZ0 + roofZ1) / 2);
  model.add(roof);
  // window frame pillars
  for (const sx of [-1, 1]) {
    const pillar = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.025, 0.5), trimMat);
    pillar.position.set(sx * (type.cabinWidth / 2 + 0.005), type.cabin[0][1] + 0.01, (type.cabin[0][0] + type.cabin[3][0]) / 2);
    model.add(pillar);
  }

  // hood vents
  for (const sx of [-1, 1]) {
    const vz = 0.42;
    const vent = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.012, 0.12), carbonMat);
    vent.position.set(sx * 0.18, topAt(type, vz) + 0.045, vz);
    vent.rotation.x = 0.12;
    model.add(vent);
  }
  // side intakes
  for (const sx of [-1, 1]) {
    const intake = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.07, 0.2), carbonMat);
    intake.position.set(sx * (type.width / 2 + 0.005), -0.02, -0.2);
    model.add(intake);
    const skirt = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.035, 1.05), accentMat);
    skirt.position.set(sx * (type.width / 2 + 0.012), -0.09, 0);
    model.add(skirt);
  }

  // decals
  const decal = DECALS[(look.decal | 0) % DECALS.length].name;
  if (decal === 'Stripes') {
    for (const sx of [-1, 1]) {
      for (let z = -0.7; z < 0.76; z += 0.1) {
        const seg = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.01, 0.105), teamMat);
        seg.position.set(sx * 0.075, topAt(type, z) + 0.052, z);
        const dz = 0.05, slope = (topAt(type, z + dz) - topAt(type, z - dz)) / (2 * dz);
        seg.rotation.x = -Math.atan(slope);
        model.add(seg);
      }
    }
  } else if (decal === 'Bolt') {
    const sh = new THREE.Shape();
    sh.moveTo(-0.45, 0.02); sh.lineTo(-0.05, 0.05); sh.lineTo(-0.1, -0.01); sh.lineTo(0.45, 0.02); sh.lineTo(0.0, -0.04); sh.lineTo(0.05, 0.01); sh.closePath();
    const g = new THREE.ShapeGeometry(sh);
    for (const sx of [-1, 1]) {
      const m = new THREE.Mesh(g, teamMat);
      m.rotation.y = sx * Math.PI / 2;
      m.position.set(sx * (type.width / 2 + 0.058), 0.02, 0);
      if (sx < 0) m.scale.x = -1;
      model.add(m);
    }
  } else if (decal === 'Number') {
    const num = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.2), new THREE.MeshBasicMaterial({ map: numberTex(look.number ?? 7, TEAM_COLORS[team].css), transparent: true }));
    num.rotation.x = -Math.PI / 2;
    num.position.set(0, roofY + 0.05, (roofZ0 + roofZ1) / 2);
    model.add(num);
    for (const sx of [-1, 1]) {
      const d = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 0.22), num.material);
      d.rotation.y = sx * Math.PI / 2;
      d.position.set(sx * (type.width / 2 + 0.058), 0.02, -0.05);
      model.add(d);
    }
  } else if (decal === 'Split') {
    const half = new THREE.Mesh(new THREE.BoxGeometry(type.width + 0.012, 0.14, 0.5), teamMat);
    half.position.set(0, -0.06, -0.48);
    model.add(half);
  }

  // wheel arches
  const archGeo = new THREE.TorusGeometry(0.25, 0.042, 6, 16, Math.PI);
  archGeo.rotateY(Math.PI / 2);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const arch = new THREE.Mesh(archGeo, carbonMat);
    arch.position.set(sx * (type.width / 2 - 0.02), -0.17, sz * 0.46);
    model.add(arch);
  }

  // front splitter, grille, rear diffuser
  const splitter = new THREE.Mesh(new THREE.BoxGeometry(type.width * 1.02, 0.03, 0.16), carbonMat);
  splitter.position.set(0, -0.15, 0.76);
  model.add(splitter);
  const grille = new THREE.Mesh(new THREE.BoxGeometry(type.width * 0.5, 0.07, 0.03), trimMat);
  grille.position.set(0, -0.07, 0.8);
  model.add(grille);
  const diffuser = new THREE.Mesh(new THREE.BoxGeometry(type.width * 0.9, 0.06, 0.12), carbonMat);
  diffuser.position.set(0, -0.12, -0.74);
  model.add(diffuser);
  for (let i = -2; i <= 2; i++) {
    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.015, 0.07, 0.12), trimMat);
    fin.position.set(i * 0.12, -0.13, -0.75);
    model.add(fin);
  }

  // mirrors
  for (const sx of [-1, 1]) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.04, 0.05), bodyMat);
    m.position.set(sx * (type.cabinWidth / 2 + 0.05), type.cabin[0][1] + 0.06, 0.18);
    model.add(m);
  }

  // lights + glow sprites
  const headMat = new THREE.MeshBasicMaterial({ color: 0xf2f9ff });
  const tailMat = new THREE.MeshBasicMaterial({ color: 0xff2238 });
  const glowFront = new THREE.SpriteMaterial({ map: radialTex(), color: 0xcfe6ff, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.8 });
  const glowRear = new THREE.SpriteMaterial({ map: radialTex(), color: 0xff3045, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.7 });
  const frontZ = type.profile[type.profile.length - 2][0];
  for (const sx of [-1, 1]) {
    const h = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.035, 0.03), headMat);
    h.position.set(sx * type.width * 0.3, 0.0, frontZ - 0.01);
    h.rotation.y = sx * -0.15;
    model.add(h);
    const hs = new THREE.Sprite(glowFront);
    hs.scale.set(0.35, 0.22, 1);
    hs.position.set(sx * type.width * 0.3, 0.0, frontZ + 0.03);
    model.add(hs);
    const t = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.045, 0.03), tailMat);
    t.position.set(sx * type.width * 0.28, 0.05, -0.775);
    model.add(t);
    const ts = new THREE.Sprite(glowRear);
    ts.scale.set(0.3, 0.18, 1);
    ts.position.set(sx * type.width * 0.28, 0.05, -0.81);
    model.add(ts);
  }
  const tailBar = new THREE.Mesh(new THREE.BoxGeometry(type.width * 0.36, 0.015, 0.03), tailMat);
  tailBar.position.set(0, 0.05, -0.775);
  model.add(tailBar);

  // spoiler / roof parts
  if (type.spoiler) {
    const sp = type.spoiler;
    const wing = new THREE.Mesh(new THREE.BoxGeometry(sp.w, sp.lip ? 0.05 : 0.03, sp.d), sp.lip ? bodyMat : carbonMat);
    wing.position.set(0, sp.y, sp.z);
    wing.rotation.x = sp.lip ? 0.25 : -0.12;
    model.add(wing);
    if (!sp.lip && !sp.roof) {
      for (const sx of [-1, 1]) {
        const strut = new THREE.Mesh(new THREE.BoxGeometry(0.03, sp.y - 0.08, 0.06), trimMat);
        strut.position.set(sx * sp.w * 0.32, (sp.y + 0.08) / 2, sp.z + 0.02);
        model.add(strut);
        const plate = new THREE.Mesh(new THREE.BoxGeometry(0.015, 0.09, sp.d + 0.04), bodyMat);
        plate.position.set(sx * sp.w / 2, sp.y + 0.01, sp.z);
        model.add(plate);
      }
    }
    const lip = new THREE.Mesh(new THREE.BoxGeometry(sp.w, 0.012, 0.02), accentMat);
    lip.position.set(0, sp.y + 0.02, sp.z - sp.d / 2);
    model.add(lip);
  } else {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.045, 0.07), trimMat);
    bar.position.set(0, roofY + 0.07, roofZ0 + 0.05);
    model.add(bar);
    for (let i = -2; i <= 2; i++) {
      const l = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.03, 0.02), accentMat);
      l.position.set(i * 0.11, roofY + 0.07, roofZ0 + 0.09);
      model.add(l);
    }
  }

  // antenna with a team-coloured topper
  const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.35, 4), trimMat);
  ant.position.set(-type.cabinWidth * 0.3, roofY + 0.2, roofZ0 - 0.02);
  model.add(ant);
  const topper = new THREE.Mesh(new THREE.SphereGeometry(0.035, 10, 8), accentMat);
  topper.position.set(-type.cabinWidth * 0.3, roofY + 0.38, roofZ0 - 0.02);
  model.add(topper);

  // exhausts
  const exGeo = new THREE.CylinderGeometry(0.05, 0.06, 0.12, 12, 1, true);
  exGeo.rotateX(Math.PI / 2);
  const exMat = new THREE.MeshStandardMaterial({ color: 0xc4cad4, roughness: 0.1, metalness: 1.0, envMapIntensity: 2, side: THREE.DoubleSide });
  for (const sx of [-1, 1]) {
    const ex = new THREE.Mesh(exGeo, exMat);
    ex.position.set(sx * 0.16, -0.05, -0.79);
    model.add(ex);
  }

  // wheels
  const wheels = [];
  const wx = type.width / 2 - 0.03;
  for (const [sx, sz] of [[-1, 1], [1, 1], [-1, -1], [1, -1]]) {
    const pivot = new THREE.Group();
    pivot.position.set(sx * wx, -0.18, sz * 0.46);
    const spin = buildWheel(wheel.style, rimMat, accentMat, carbonMat, sx);
    pivot.add(spin);
    model.add(pivot);
    wheels.push({ pivot, spin, front: sz > 0 });
  }

  // boost flames: hot core + wider coloured flame
  const boost = BOOSTS[(look.boost | 0) % BOOSTS.length];
  const outerColor = boost.outer ?? tc.glow;
  const coreRGB = boost.core ?? new THREE.Color(tc.glow).lerp(new THREE.Color(0xffffff), 0.5).toArray();
  const flameGeo = new THREE.ConeGeometry(0.11, 0.9, 14, 1, true);
  flameGeo.translate(0, 0.45, 0);
  flameGeo.rotateX(-Math.PI / 2);
  const flameMat = new THREE.MeshBasicMaterial({
    map: flameTex(), color: new THREE.Color().fromArray(coreRGB), transparent: true, blending: THREE.AdditiveBlending,
    depthWrite: false, side: THREE.DoubleSide,
  });
  const outerMat = flameMat.clone();
  outerMat.color = new THREE.Color(outerColor);
  outerMat.opacity = 0.6;
  const flames = new THREE.Group();
  for (const sx of [-1, 1]) {
    const f = new THREE.Mesh(flameGeo, flameMat);
    f.position.set(sx * 0.16, -0.05, -0.83);
    flames.add(f);
    const o = new THREE.Mesh(flameGeo, outerMat);
    o.scale.set(1.7, 1.7, 1.35);
    o.position.copy(f.position);
    flames.add(o);
  }
  const flare = new THREE.Sprite(new THREE.SpriteMaterial({ map: radialTex(), color: outerColor, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
  flare.scale.set(0.9, 0.6, 1);
  flare.position.set(0, -0.05, -0.86);
  flames.add(flare);
  flames.visible = false;
  model.add(flames);
  const oc = new THREE.Color(outerColor);
  const boostRGB = [oc.r * 0.6 + 0.4, oc.g * 0.6 + 0.4, oc.b * 0.6 + 0.4];

  // underglow
  const glowMat = new THREE.MeshBasicMaterial({
    map: radialTex(), color: tc.glow, transparent: true, opacity: 0.5,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const glow = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 2.2), glowMat);
  glow.rotation.x = -Math.PI / 2;
  glow.position.y = -0.35;
  model.add(glow);

  root.traverse(o => {
    if (o.isMesh) {
      const lit = o.material && !o.material.isMeshBasicMaterial;
      o.castShadow = lit;
      o.receiveShadow = false;
    }
  });

  // performance: bake all static parts into one mesh per material (≈130 draw calls -> ≈25)
  const skip = new Set([flames, glow, ...wheels.map(w => w.pivot)]);
  mergeStatic(model, skip);
  for (const w of wheels) mergeStatic(w.spin, new Set());
  if (!nice) model.children.filter(o => o.isSprite).forEach(o => model.remove(o)); // no light glows on Fast

  return { root, model, wheels, flames, bodyMat, glow, boostRGB };
}

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
