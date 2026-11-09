// Procedural meshes for cars and the ball (all original designs).
import * as THREE from '../vendor/three.module.min.js';
import { BALL, TEAM_COLORS } from './config.js';

export const BODY_TYPES = [
  {
    name: 'Raptor',
    width: 0.86,
    profile: [[-0.74, -0.13], [-0.76, 0.1], [-0.6, 0.15], [0.2, 0.13], [0.72, 0.03], [0.78, -0.07], [0.74, -0.13]],
    cabin: [[-0.5, 0.12], [-0.3, 0.33], [0.06, 0.34], [0.32, 0.12]],
    cabinWidth: 0.66,
    spoiler: { z: -0.66, y: 0.27, w: 0.86, d: 0.18 },
  },
  {
    name: 'Brute',
    width: 0.92,
    profile: [[-0.72, -0.14], [-0.73, 0.16], [-0.1, 0.19], [0.55, 0.16], [0.76, 0.08], [0.77, -0.14]],
    cabin: [[-0.55, 0.17], [-0.48, 0.42], [0.14, 0.42], [0.34, 0.17]],
    cabinWidth: 0.8,
    spoiler: null,
  },
  {
    name: 'Dart',
    width: 0.84,
    profile: [[-0.78, -0.12], [-0.8, 0.06], [-0.5, 0.11], [0.25, 0.09], [0.84, -0.02], [0.86, -0.08], [0.8, -0.12]],
    cabin: [[-0.42, 0.09], [-0.22, 0.27], [0.02, 0.27], [0.28, 0.08]],
    cabinWidth: 0.6,
    spoiler: { z: -0.72, y: 0.22, w: 0.92, d: 0.22 },
  },
];

export const PAINTS = [
  { name: 'Team', color: null },
  { name: 'Grafiet', color: 0x2c2f36 },
  { name: 'Wit', color: 0xe8ecf2 },
  { name: 'Limoen', color: 0x8be03a },
  { name: 'Paars', color: 0x8a4dff },
  { name: 'Goud', color: 0xf2b630 },
  { name: 'Turquoise', color: 0x1fd1c1 },
  { name: 'Roze', color: 0xff5fb7 },
];

function extrudeProfile(points, width, bevel) {
  const shape = new THREE.Shape();
  shape.moveTo(points[0][0], points[0][1]);
  for (let i = 1; i < points.length; i++) shape.lineTo(points[i][0], points[i][1]);
  shape.closePath();
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: width - bevel * 2,
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 2,
    curveSegments: 1,
  });
  geo.translate(0, 0, -(width - bevel * 2) / 2);
  geo.rotateY(-Math.PI / 2);
  geo.computeVertexNormals();
  return geo;
}

let underglowTex = null;
function getUnderglowTexture() {
  if (underglowTex) return underglowTex;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(64, 64, 4, 64, 64, 64);
  grd.addColorStop(0, 'rgba(255,255,255,0.9)');
  grd.addColorStop(0.5, 'rgba(255,255,255,0.35)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 128, 128);
  underglowTex = new THREE.CanvasTexture(c);
  return underglowTex;
}

let flameTex = null;
function getFlameTexture() {
  if (flameTex) return flameTex;
  const c = document.createElement('canvas');
  c.width = 32; c.height = 128;
  const g = c.getContext('2d');
  const grd = g.createLinearGradient(0, 0, 0, 128);
  grd.addColorStop(1, 'rgba(255,255,255,1)');
  grd.addColorStop(0.75, 'rgba(160,240,255,0.9)');
  grd.addColorStop(0.3, 'rgba(60,140,255,0.4)');
  grd.addColorStop(0, 'rgba(40,60,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 32, 128);
  flameTex = new THREE.CanvasTexture(c);
  return flameTex;
}

const wheelGeo = new THREE.CylinderGeometry(0.2, 0.2, 0.16, 18);
wheelGeo.rotateZ(Math.PI / 2);
const rimGeo = new THREE.CylinderGeometry(0.12, 0.12, 0.17, 6);
rimGeo.rotateZ(Math.PI / 2);
const tireMat = new THREE.MeshStandardMaterial({ color: 0x15161a, roughness: 0.9, metalness: 0.0 });

export function buildCarMesh(team, bodyIndex = 0, paint = null, quality = 'high') {
  const type = BODY_TYPES[bodyIndex % BODY_TYPES.length];
  const tc = TEAM_COLORS[team];
  const root = new THREE.Group();
  const model = new THREE.Group();
  root.add(model);
  // model origin = physics center (CAR.RIDE above the surface)
  model.position.y = 0.0; // wheels touch the surface at -CAR.RIDE

  const bodyColor = paint != null ? paint : tc.main;
  const bodyMat = new THREE.MeshStandardMaterial({ color: bodyColor, roughness: 0.32, metalness: 0.55 });
  const trimMat = new THREE.MeshStandardMaterial({ color: 0x1b1d22, roughness: 0.6, metalness: 0.3 });
  const glassMat = new THREE.MeshStandardMaterial({ color: 0x0a0f18, roughness: 0.08, metalness: 0.9 });
  const accentMat = new THREE.MeshBasicMaterial({ color: tc.glow });

  const body = new THREE.Mesh(extrudeProfile(type.profile, type.width, 0.05), bodyMat);
  model.add(body);
  const cabin = new THREE.Mesh(extrudeProfile(type.cabin, type.cabinWidth, 0.04), glassMat);
  model.add(cabin);

  // team stripe over hood and roof
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.012, 1.2), accentMat);
  const topY = Math.max(...type.profile.map(p => p[1]));
  stripe.position.set(0, topY + 0.015, 0.05);
  stripe.rotation.x = 0.06;
  model.add(stripe);

  // side skirts (team glow line)
  for (const sx of [-1, 1]) {
    const skirt = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.04, 1.1), accentMat);
    skirt.position.set(sx * (type.width / 2 + 0.005), -0.06, 0);
    model.add(skirt);
  }

  // bumpers/trim
  const front = new THREE.Mesh(new THREE.BoxGeometry(type.width * 0.95, 0.07, 0.08), trimMat);
  front.position.set(0, -0.1, 0.75);
  model.add(front);
  const rear = new THREE.Mesh(new THREE.BoxGeometry(type.width * 0.95, 0.08, 0.08), trimMat);
  rear.position.set(0, -0.08, -0.73);
  model.add(rear);

  // lights
  const headMat = new THREE.MeshBasicMaterial({ color: 0xeaf6ff });
  const tailMat = new THREE.MeshBasicMaterial({ color: 0xff2a3a });
  for (const sx of [-1, 1]) {
    const h = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.04, 0.03), headMat);
    h.position.set(sx * type.width * 0.3, 0.0, 0.775);
    model.add(h);
    const t = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.05, 0.03), tailMat);
    t.position.set(sx * type.width * 0.3, 0.04, -0.765);
    model.add(t);
  }

  // spoiler
  if (type.spoiler) {
    const sp = type.spoiler;
    const wing = new THREE.Mesh(new THREE.BoxGeometry(sp.w, 0.03, sp.d), trimMat);
    wing.position.set(0, sp.y, sp.z);
    wing.rotation.x = -0.12;
    model.add(wing);
    for (const sx of [-1, 1]) {
      const strut = new THREE.Mesh(new THREE.BoxGeometry(0.03, sp.y - 0.08, 0.06), trimMat);
      strut.position.set(sx * sp.w * 0.32, (sp.y + 0.08) / 2, sp.z + 0.02);
      model.add(strut);
    }
    const lip = new THREE.Mesh(new THREE.BoxGeometry(sp.w, 0.012, 0.02), accentMat);
    lip.position.set(0, sp.y + 0.02, sp.z - sp.d / 2);
    model.add(lip);
  } else {
    // roof light bar for the truck
    const bar = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.04, 0.06), accentMat);
    bar.position.set(0, 0.45, 0.02);
    model.add(bar);
  }

  // exhausts
  const exGeo = new THREE.CylinderGeometry(0.05, 0.06, 0.12, 10);
  exGeo.rotateX(Math.PI / 2);
  const exMat = new THREE.MeshStandardMaterial({ color: 0x777b85, roughness: 0.3, metalness: 0.9 });
  for (const sx of [-1, 1]) {
    const ex = new THREE.Mesh(exGeo, exMat);
    ex.position.set(sx * 0.16, -0.04, -0.78);
    model.add(ex);
  }

  // wheels
  const rimMat = new THREE.MeshStandardMaterial({ color: 0xb8bec9, roughness: 0.25, metalness: 0.9 });
  const wheels = [];
  const wx = type.width / 2 - 0.02;
  for (const [sx, sz] of [[-1, 1], [1, 1], [-1, -1], [1, -1]]) {
    const pivot = new THREE.Group();
    pivot.position.set(sx * wx, -0.18, sz * 0.46);
    const spin = new THREE.Group();
    const tire = new THREE.Mesh(wheelGeo, tireMat);
    const rim = new THREE.Mesh(rimGeo, rimMat);
    spin.add(tire, rim);
    pivot.add(spin);
    model.add(pivot);
    wheels.push({ pivot, spin, front: sz > 0 });
  }

  // boost flame
  const flameGeo = new THREE.ConeGeometry(0.11, 0.9, 12, 1, true);
  flameGeo.translate(0, 0.45, 0);
  flameGeo.rotateX(-Math.PI / 2); // base at the exhaust, tip points backwards (-z)
  const flameMat = new THREE.MeshBasicMaterial({
    map: getFlameTexture(), transparent: true, blending: THREE.AdditiveBlending,
    depthWrite: false, side: THREE.DoubleSide,
  });
  const flames = new THREE.Group();
  for (const sx of [-1, 1]) {
    const f = new THREE.Mesh(flameGeo, flameMat);
    f.position.set(sx * 0.16, -0.04, -0.82);
    flames.add(f);
  }
  flames.visible = false;
  model.add(flames);

  // underglow
  const glowMat = new THREE.MeshBasicMaterial({
    map: getUnderglowTexture(), color: tc.glow, transparent: true, opacity: 0.55,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const glow = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 2.2), glowMat);
  glow.rotation.x = -Math.PI / 2;
  glow.position.y = -0.35;
  model.add(glow);

  root.traverse(o => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; } });

  return { root, model, wheels, flames, bodyMat, glow };
}

export function buildBallMesh() {
  const geo = new THREE.IcosahedronGeometry(BALL.R, 2);
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  // original icosahedron vertices
  const t = (1 + Math.sqrt(5)) / 2;
  const base = [
    [-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0],
    [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t],
    [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1],
  ].map(v => new THREE.Vector3(...v).normalize());
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), m = new THREE.Vector3();
  const light = new THREE.Color(0xe9edf3);
  const mid = new THREE.Color(0xc9d0db);
  const dark = new THREE.Color(0x1d2433);
  for (let i = 0; i < pos.count; i += 3) {
    a.fromBufferAttribute(pos, i); b.fromBufferAttribute(pos, i + 1); c.fromBufferAttribute(pos, i + 2);
    m.copy(a).add(b).add(c).normalize();
    let best = -1;
    for (const v of base) best = Math.max(best, m.dot(v));
    const ang = Math.acos(Math.min(1, best));
    const col = ang < 0.26 ? dark : ((i / 3) % 2 ? light : mid);
    for (let k = 0; k < 3; k++) {
      colors[(i + k) * 3] = col.r; colors[(i + k) * 3 + 1] = col.g; colors[(i + k) * 3 + 2] = col.b;
    }
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const mat = new THREE.MeshStandardMaterial({
    vertexColors: true, flatShading: true, roughness: 0.35, metalness: 0.25,
    emissive: 0x101820,
  });
  const mesh = new THREE.Mesh(geo, mat);
  const group = new THREE.Group();
  group.add(mesh);

  // glowing seams
  const edges = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.IcosahedronGeometry(BALL.R * 1.003, 0)),
    new THREE.LineBasicMaterial({ color: 0x5ff2ff, transparent: true, opacity: 0.85 })
  );
  mesh.add(edges);
  return { group, mesh };
}

export function buildShadowMesh(size) {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(32, 32, 2, 32, 32, 32);
  grd.addColorStop(0, 'rgba(0,0,0,0.65)');
  grd.addColorStop(0.6, 'rgba(0,0,0,0.3)');
  grd.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(c);
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(size, size),
    new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false })
  );
  m.rotation.x = -Math.PI / 2;
  m.renderOrder = 1;
  return m;
}
