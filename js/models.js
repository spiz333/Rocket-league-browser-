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

function extrudeProfile(points, width, bevel, segs = 2) {
  const shape = new THREE.Shape();
  shape.moveTo(points[0][0], points[0][1]);
  for (let i = 1; i < points.length; i++) shape.lineTo(points[i][0], points[i][1]);
  shape.closePath();
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: width - bevel * 2,
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: segs,
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

// ---------- wheels ----------
const tireGeo = new THREE.CylinderGeometry(0.2, 0.2, 0.17, 24);
tireGeo.rotateZ(Math.PI / 2);
const tireWallGeo = new THREE.TorusGeometry(0.17, 0.035, 8, 24);
tireWallGeo.rotateY(Math.PI / 2);
const rimDiscGeo = new THREE.CylinderGeometry(0.13, 0.13, 0.02, 20);
rimDiscGeo.rotateZ(Math.PI / 2);
const spokeGeo = new THREE.BoxGeometry(0.02, 0.22, 0.035);
const hubGeo = new THREE.CylinderGeometry(0.035, 0.035, 0.05, 10);
hubGeo.rotateZ(Math.PI / 2);
const tireMat = new THREE.MeshStandardMaterial({ color: 0x141518, roughness: 0.92, metalness: 0.0 });

function buildWheel(rimMat, accentMat, side) {
  const spin = new THREE.Group();
  spin.add(new THREE.Mesh(tireGeo, tireMat));
  const wall = new THREE.Mesh(tireWallGeo, tireMat);
  wall.position.x = side * 0.07;
  spin.add(wall);
  const face = new THREE.Group();
  face.position.x = side * 0.075;
  face.add(new THREE.Mesh(rimDiscGeo, rimMat));
  for (let i = 0; i < 5; i++) {
    const sp = new THREE.Mesh(spokeGeo, rimMat);
    sp.rotation.x = (i / 5) * Math.PI * 2;
    sp.position.x = side * 0.012;
    face.add(sp);
  }
  const hub = new THREE.Mesh(hubGeo, accentMat);
  hub.position.x = side * 0.02;
  face.add(hub);
  spin.add(face);
  return spin;
}

let glowTex = null;
function getGlowTexture() {
  if (glowTex) return glowTex;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.25, 'rgba(255,255,255,0.5)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  glowTex = new THREE.CanvasTexture(c);
  return glowTex;
}

export function buildCarMesh(team, bodyIndex = 0, paint = null, quality = 'high') {
  const type = BODY_TYPES[bodyIndex % BODY_TYPES.length];
  const tc = TEAM_COLORS[team];
  const nice = quality !== 'low';
  const root = new THREE.Group();
  const model = new THREE.Group();
  root.add(model);
  // model origin = physics center (CAR.RIDE above the surface)
  model.position.y = 0.0;

  const bodyColor = paint != null ? paint : tc.main;
  const bodyMat = nice
    ? new THREE.MeshPhysicalMaterial({ color: bodyColor, roughness: 0.3, metalness: 0.45, clearcoat: 1, clearcoatRoughness: 0.06 })
    : new THREE.MeshStandardMaterial({ color: bodyColor, roughness: 0.32, metalness: 0.55 });
  const trimMat = new THREE.MeshStandardMaterial({ color: 0x17191e, roughness: 0.55, metalness: 0.35 });
  const carbonMat = new THREE.MeshStandardMaterial({ color: 0x0f1013, roughness: 0.35, metalness: 0.6 });
  const glassMat = new THREE.MeshPhysicalMaterial({ color: 0x0b1220, roughness: 0.05, metalness: 0.2, clearcoat: 1, clearcoatRoughness: 0.02, envMapIntensity: 1.6 });
  const accentMat = new THREE.MeshBasicMaterial({ color: tc.glow });
  const rimMat = new THREE.MeshStandardMaterial({ color: 0xc9ced8, roughness: 0.22, metalness: 0.95 });

  const bevel = nice ? 0.055 : 0.05;
  const body = new THREE.Mesh(extrudeProfile(type.profile, type.width, bevel, nice ? 4 : 2), bodyMat);
  model.add(body);
  const cabin = new THREE.Mesh(extrudeProfile(type.cabin, type.cabinWidth, 0.045, nice ? 3 : 2), glassMat);
  model.add(cabin);
  // roof panel in body colour on top of the glass
  const roofY = Math.max(...type.cabin.map(p => p[1]));
  const roofZ0 = Math.min(...type.cabin.filter(p => p[1] >= roofY - 0.02).map(p => p[0]));
  const roofZ1 = Math.max(...type.cabin.filter(p => p[1] >= roofY - 0.02).map(p => p[0]));
  const roof = new THREE.Mesh(new THREE.BoxGeometry(type.cabinWidth - 0.04, 0.025, Math.max(0.12, roofZ1 - roofZ0)), bodyMat);
  roof.position.set(0, roofY + 0.035, (roofZ0 + roofZ1) / 2);
  model.add(roof);

  // racing stripes (team colour)
  const topY = Math.max(...type.profile.map(p => p[1]));
  for (const sx of [-1, 1]) {
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.012, 1.25), accentMat);
    stripe.position.set(sx * 0.07, topY + 0.02, 0.0);
    stripe.rotation.x = 0.055;
    model.add(stripe);
  }
  // glowing side skirts
  for (const sx of [-1, 1]) {
    const skirt = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.035, 1.05), accentMat);
    skirt.position.set(sx * (type.width / 2 + 0.01), -0.08, 0);
    model.add(skirt);
  }

  // wheel arches
  const archGeo = new THREE.TorusGeometry(0.25, 0.04, 6, 14, Math.PI);
  archGeo.rotateY(Math.PI / 2);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const arch = new THREE.Mesh(archGeo, carbonMat);
    arch.position.set(sx * (type.width / 2 - 0.02), -0.17, sz * 0.46);
    model.add(arch);
  }

  // front splitter, rear diffuser, intake
  const splitter = new THREE.Mesh(new THREE.BoxGeometry(type.width * 1.02, 0.03, 0.16), carbonMat);
  splitter.position.set(0, -0.15, 0.74);
  model.add(splitter);
  const grille = new THREE.Mesh(new THREE.BoxGeometry(type.width * 0.5, 0.07, 0.03), trimMat);
  grille.position.set(0, -0.07, 0.79);
  model.add(grille);
  const diffuser = new THREE.Mesh(new THREE.BoxGeometry(type.width * 0.9, 0.06, 0.12), carbonMat);
  diffuser.position.set(0, -0.12, -0.73);
  model.add(diffuser);
  for (let i = -2; i <= 2; i++) {
    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.015, 0.07, 0.12), trimMat);
    fin.position.set(i * 0.12, -0.13, -0.74);
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
  const glowFront = new THREE.SpriteMaterial({ map: getGlowTexture(), color: 0xcfe6ff, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.8 });
  const glowRear = new THREE.SpriteMaterial({ map: getGlowTexture(), color: 0xff3045, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.7 });
  for (const sx of [-1, 1]) {
    const h = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.035, 0.03), headMat);
    h.position.set(sx * type.width * 0.3, 0.0, 0.775);
    h.rotation.y = sx * -0.15;
    model.add(h);
    const hs = new THREE.Sprite(glowFront);
    hs.scale.set(0.35, 0.22, 1);
    hs.position.set(sx * type.width * 0.3, 0.0, 0.81);
    model.add(hs);
    const t = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.045, 0.03), tailMat);
    t.position.set(sx * type.width * 0.28, 0.05, -0.765);
    model.add(t);
    const ts = new THREE.Sprite(glowRear);
    ts.scale.set(0.3, 0.18, 1);
    ts.position.set(sx * type.width * 0.28, 0.05, -0.8);
    model.add(ts);
  }
  const tailBar = new THREE.Mesh(new THREE.BoxGeometry(type.width * 0.36, 0.015, 0.03), tailMat);
  tailBar.position.set(0, 0.05, -0.765);
  model.add(tailBar);

  // spoiler or roof light bar
  if (type.spoiler) {
    const sp = type.spoiler;
    const wing = new THREE.Mesh(new THREE.BoxGeometry(sp.w, 0.03, sp.d), carbonMat);
    wing.position.set(0, sp.y, sp.z);
    wing.rotation.x = -0.12;
    model.add(wing);
    for (const sx of [-1, 1]) {
      const strut = new THREE.Mesh(new THREE.BoxGeometry(0.03, sp.y - 0.08, 0.06), trimMat);
      strut.position.set(sx * sp.w * 0.32, (sp.y + 0.08) / 2, sp.z + 0.02);
      model.add(strut);
      const plate = new THREE.Mesh(new THREE.BoxGeometry(0.015, 0.09, sp.d + 0.04), bodyMat);
      plate.position.set(sx * sp.w / 2, sp.y + 0.01, sp.z);
      model.add(plate);
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
  const exMat = new THREE.MeshStandardMaterial({ color: 0x8a8f99, roughness: 0.25, metalness: 0.95, side: THREE.DoubleSide });
  for (const sx of [-1, 1]) {
    const ex = new THREE.Mesh(exGeo, exMat);
    ex.position.set(sx * 0.16, -0.05, -0.78);
    model.add(ex);
  }

  // wheels
  const wheels = [];
  const wx = type.width / 2 - 0.03;
  for (const [sx, sz] of [[-1, 1], [1, 1], [-1, -1], [1, -1]]) {
    const pivot = new THREE.Group();
    pivot.position.set(sx * wx, -0.18, sz * 0.46);
    const spin = buildWheel(rimMat, accentMat, sx);
    pivot.add(spin);
    model.add(pivot);
    wheels.push({ pivot, spin, front: sz > 0 });
  }

  // boost flames: hot core + wider outer flame
  const flameGeo = new THREE.ConeGeometry(0.11, 0.9, 14, 1, true);
  flameGeo.translate(0, 0.45, 0);
  flameGeo.rotateX(-Math.PI / 2);
  const flameMat = new THREE.MeshBasicMaterial({
    map: getFlameTexture(), transparent: true, blending: THREE.AdditiveBlending,
    depthWrite: false, side: THREE.DoubleSide,
  });
  const outerMat = flameMat.clone();
  outerMat.color = new THREE.Color(tc.glow);
  outerMat.opacity = 0.55;
  const flames = new THREE.Group();
  for (const sx of [-1, 1]) {
    const f = new THREE.Mesh(flameGeo, flameMat);
    f.position.set(sx * 0.16, -0.05, -0.82);
    flames.add(f);
    const o = new THREE.Mesh(flameGeo, outerMat);
    o.scale.set(1.7, 1.7, 1.35);
    o.position.copy(f.position);
    flames.add(o);
  }
  const flareMat = new THREE.SpriteMaterial({ map: getGlowTexture(), color: tc.glow, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true });
  const flare = new THREE.Sprite(flareMat);
  flare.scale.set(0.9, 0.6, 1);
  flare.position.set(0, -0.05, -0.85);
  flames.add(flare);
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

  root.traverse(o => {
    if (o.isMesh) {
      const lit = o.material && !o.material.isMeshBasicMaterial;
      o.castShadow = lit;
      o.receiveShadow = false;
    }
  });

  return { root, model, wheels, flames, bodyMat, glow };
}

export function buildBallMesh() {
  const geo = new THREE.IcosahedronGeometry(BALL.R, 3);
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
  mesh.castShadow = true;
  const group = new THREE.Group();
  group.add(mesh);
  // soft halo that flashes when the ball is hit
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: getGlowTexture(), color: 0x7ff6ff, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0 }));
  halo.scale.set(BALL.R * 4.2, BALL.R * 4.2, 1);
  group.add(halo);

  // glowing seams
  const edges = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.IcosahedronGeometry(BALL.R * 1.003, 0)),
    new THREE.LineBasicMaterial({ color: 0x5ff2ff, transparent: true, opacity: 0.85 })
  );
  mesh.add(edges);
  return { group, mesh, halo, mat };
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
