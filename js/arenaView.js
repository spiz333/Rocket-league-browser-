// Visual construction of the stadium. Geometry follows the collision SDF.
import * as THREE from '../vendor/three.module.min.js';
import { ARENA, TEAM_COLORS, BOOST_PADS } from './config.js';
import { MAPS } from './maps.js';
import { buildScenery } from './scenery.js';
import { grassNormal, softNormal, metalNormal } from './textures.js';

const { W, L, H, RC, RW, GW, GH, GD } = ARENA;

// ---------- perimeter of the rounded rectangle (top view) ----------
function buildPerimeter() {
  const pts = [];
  const cx = W - RC, cz = L - RC;
  const push = (x, z, nx, nz) => pts.push({ x, z, nx, nz });
  const line = (x0, z0, x1, z1, nx, nz, breaks) => {
    const len = Math.hypot(x1 - x0, z1 - z0);
    const ts = new Set([0]);
    const n = Math.ceil(len / 2.5);
    for (let i = 1; i < n; i++) ts.add(i / n);
    for (const b of breaks || []) ts.add(b);
    [...ts].sort((a, b) => a - b).forEach(t => push(x0 + (x1 - x0) * t, z0 + (z1 - z0) * t, nx, nz));
  };
  const arc = (ox, oz, a0, a1) => {
    const n = 14;
    for (let i = 0; i < n; i++) {
      const a = a0 + (a1 - a0) * (i / n);
      push(ox + RC * Math.cos(a), oz + RC * Math.sin(a), Math.cos(a), Math.sin(a));
    }
  };
  const gb = (x0, x1) => {
    const len = x1 - x0;
    return [(-GW - x0) / len, (GW - x0) / len, (-GW - 0.01 - x0) / len].filter(t => t > 0 && t < 1);
  };
  line(cx, L, -cx, L, 0, 1, gb(cx, -cx).map(t => t));
  arc(-cx, cz, Math.PI / 2, Math.PI);
  line(-W, cz, -W, -cz, -1, 0);
  arc(-cx, -cz, Math.PI, Math.PI * 1.5);
  line(-cx, -L, cx, -L, 0, -1, gb(-cx, cx));
  arc(cx, -cz, Math.PI * 1.5, Math.PI * 2);
  line(W, -cz, W, cz, 1, 0);
  arc(cx, cz, 0, Math.PI / 2);
  pts.push({ ...pts[0] }); // close loop
  let u = 0;
  for (let i = 0; i < pts.length; i++) {
    if (i > 0) u += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z);
    pts[i].u = u;
  }
  return pts;
}

function fillet(y0, center, from, to, steps) {
  const out = [];
  for (let i = 0; i <= steps; i++) {
    const th = from + (to - from) * (i / steps);
    out.push({ d: RW - RW * Math.sin(th), y: center - RW * Math.cos(th), nh: Math.sin(th), ny: Math.cos(th) });
  }
  return out;
}

function profileRange(yMin, yMax) {
  const full = [
    ...fillet(0, RW, 0, Math.PI / 2, 8),
    ...[5.2, GH, 8.5, 11, 12.5].map(y => ({ d: 0, y, nh: 1, ny: 0 })),
    ...fillet(0, H - RW, Math.PI / 2, Math.PI, 8),
  ];
  // dedupe & filter
  const res = [];
  for (const p of full) {
    if (p.y < yMin - 1e-6 || p.y > yMax + 1e-6) continue;
    if (res.length && Math.abs(res[res.length - 1].y - p.y) < 1e-4 && Math.abs(res[res.length - 1].d - p.d) < 1e-4) continue;
    res.push(p);
  }
  // make sure the band edges exist
  const at = (y) => ({ d: 0, y, nh: 1, ny: 0 });
  if (res.length === 0 || res[0].y > yMin + 1e-4) res.unshift(at(yMin));
  if (res[res.length - 1].y < yMax - 1e-4) res.push(at(yMax));
  let v = 0;
  for (let i = 0; i < res.length; i++) {
    if (i > 0) v += Math.hypot(res[i].y - res[i - 1].y, res[i].d - res[i - 1].d);
    res[i].v = v;
  }
  return res;
}

function teamTint(z, a, b) {
  const t = THREE.MathUtils.smoothstep(z, -8, 8);
  return a.clone().lerp(b, t);
}

function buildWall(perim, profile, colorFn, skipMouth = true, uvScale = 4) {
  const cols = perim.length, rows = profile.length;
  const positions = new Float32Array(cols * rows * 3);
  const normals = new Float32Array(cols * rows * 3);
  const uvs = new Float32Array(cols * rows * 2);
  const colors = new Float32Array(cols * rows * 3);
  let k = 0;
  for (let i = 0; i < cols; i++) {
    const P = perim[i];
    for (let j = 0; j < rows; j++) {
      const Q = profile[j];
      const x = P.x - P.nx * Q.d, z = P.z - P.nz * Q.d, y = Q.y;
      positions[k * 3] = x; positions[k * 3 + 1] = y; positions[k * 3 + 2] = z;
      normals[k * 3] = -P.nx * Q.nh; normals[k * 3 + 1] = Q.ny; normals[k * 3 + 2] = -P.nz * Q.nh;
      uvs[k * 2] = P.u / uvScale; uvs[k * 2 + 1] = Q.v / uvScale;
      const c = colorFn(x, y, z);
      colors[k * 3] = c.r; colors[k * 3 + 1] = c.g; colors[k * 3 + 2] = c.b;
      k++;
    }
  }
  const idx = [];
  for (let i = 0; i < cols - 1; i++) {
    for (let j = 0; j < rows - 1; j++) {
      const a = i * rows + j, b = (i + 1) * rows + j, c = (i + 1) * rows + j + 1, d = i * rows + j + 1;
      if (skipMouth) {
        const mx = (positions[a * 3] + positions[c * 3]) / 2;
        const my = (positions[a * 3 + 1] + positions[c * 3 + 1]) / 2;
        const mz = (positions[a * 3 + 2] + positions[c * 3 + 2]) / 2;
        if (Math.abs(mx) < GW && my < GH && Math.abs(mz) > L - RW - 0.05) continue;
      }
      idx.push(a, b, d, b, c, d);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.setIndex(idx);
  return geo;
}

// ---------- textures ----------
function fieldTexture(maxAniso, big, turf) {
  const cw = big ? 2048 : 1024, ch = Math.round(cw * L / W);
  const c = document.createElement('canvas');
  c.width = cw; c.height = ch;
  const g = c.getContext('2d');
  const sx = cw / (2 * W), sz = ch / (2 * L);
  const X = (x) => (x + W) * sx;
  const Z = (z) => (z + L) * sz; // top of canvas = blue goal (z = -L)

  const style = turf.style;
  // base: mowing stripes with a faint cross pattern
  const stripes = style === 'metal' ? 23 : 14;
  for (let i = 0; i < stripes; i++) {
    g.fillStyle = i % 2 ? turf.a : turf.b;
    g.fillRect(0, (i * ch) / stripes, cw, ch / stripes + 1);
  }
  const cross = 10;
  for (let i = 0; i < cross; i++) {
    if (i % 2) continue;
    g.fillStyle = 'rgba(255,255,255,0.025)';
    g.fillRect((i * cw) / cross, 0, cw / cross, ch);
  }
  if (style === 'grass') {
    const blades = Math.round(cw * ch / 60);
    for (let i = 0; i < blades; i++) {
      const x = Math.random() * cw, y = Math.random() * ch;
      const l = sx * (0.06 + Math.random() * 0.08);
      const shade = Math.random();
      g.strokeStyle = shade < 0.5 ? `rgba(20,60,25,${0.25 + shade * 0.3})` : `rgba(140,210,120,${0.08 + (shade - 0.5) * 0.25})`;
      g.lineWidth = Math.max(1, sx * 0.025);
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x + (Math.random() - 0.5) * l * 0.6, y - l);
      g.stroke();
    }
  } else if (style === 'snow') {
    const n = Math.round(cw * ch / 90);
    for (let i = 0; i < n; i++) {
      g.fillStyle = Math.random() < 0.5 ? 'rgba(150,180,215,0.35)' : 'rgba(255,255,255,0.9)';
      g.fillRect(Math.random() * cw, Math.random() * ch, sx * 0.04, sx * 0.04);
    }
  } else if (style === 'metal') {
    g.strokeStyle = 'rgba(120,170,255,0.18)';
    g.lineWidth = Math.max(1, sx * 0.05);
    for (let x = -W; x <= W; x += 4) { g.beginPath(); g.moveTo(X(x), 0); g.lineTo(X(x), ch); g.stroke(); }
    for (let z = -L; z <= L; z += 4) { g.beginPath(); g.moveTo(0, Z(z)); g.lineTo(cw, Z(z)); g.stroke(); }
  }
  // team tint halves
  const tint = g.createLinearGradient(0, 0, 0, ch);
  const ta = turf.tint ?? 0.28;
  tint.addColorStop(0, `rgba(40,120,255,${ta})`);
  tint.addColorStop(0.45, 'rgba(40,120,255,0.03)');
  tint.addColorStop(0.55, 'rgba(255,60,80,0.03)');
  tint.addColorStop(1, `rgba(255,60,80,${ta})`);
  g.fillStyle = tint;
  g.fillRect(0, 0, cw, ch);
  // subtle noise
  const img = g.getImageData(0, 0, cw, ch);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (Math.random() - 0.5) * 14;
    img.data[i] += n; img.data[i + 1] += n; img.data[i + 2] += n;
  }
  g.putImageData(img, 0, 0);

  g.strokeStyle = turf.line;
  g.lineWidth = 0.28 * sx;
  // boundary (where the floor meets the curved walls)
  const ix = W - RW, iz = L - RW, ir = RC - RW;
  g.beginPath();
  g.moveTo(X(-ix + ir), Z(-iz));
  g.lineTo(X(ix - ir), Z(-iz));
  g.arcTo(X(ix), Z(-iz), X(ix), Z(-iz + ir), ir * sx);
  g.lineTo(X(ix), Z(iz - ir));
  g.arcTo(X(ix), Z(iz), X(ix - ir), Z(iz), ir * sx);
  g.lineTo(X(-ix + ir), Z(iz));
  g.arcTo(X(-ix), Z(iz), X(-ix), Z(iz - ir), ir * sx);
  g.lineTo(X(-ix), Z(-iz + ir));
  g.arcTo(X(-ix), Z(-iz), X(-ix + ir), Z(-iz), ir * sx);
  g.stroke();
  // midline + center circle
  g.beginPath(); g.moveTo(X(-ix), Z(0)); g.lineTo(X(ix), Z(0)); g.stroke();
  g.beginPath(); g.arc(X(0), Z(0), 9 * sx, 0, Math.PI * 2); g.stroke();
  g.fillStyle = turf.line;
  g.beginPath(); g.arc(X(0), Z(0), 0.6 * sx, 0, Math.PI * 2); g.fill();
  // goal areas
  for (const s of [-1, 1]) {
    const zl = s * iz;
    g.strokeRect(X(-15), Math.min(Z(zl), Z(zl - s * 12)), 30 * sx, 12 * sz);
    g.strokeRect(X(-GW - 1.5), Math.min(Z(zl), Z(zl - s * 4.5)), (2 * GW + 3) * sx, 4.5 * sz);
    g.beginPath();
    g.arc(X(0), Z(zl - s * 12), 6 * sx, s < 0 ? 0 : Math.PI, s < 0 ? Math.PI : Math.PI * 2);
    g.stroke();
  }
  // center emblem: a stylised bolt
  g.save();
  g.translate(X(0), Z(0));
  g.scale(sx, sx);
  g.fillStyle = 'rgba(255,255,255,0.18)';
  g.beginPath();
  g.moveTo(1.2, -6); g.lineTo(-3.4, 0.8); g.lineTo(-0.2, 0.8); g.lineTo(-1.4, 6);
  g.lineTo(3.4, -1.0); g.lineTo(0.2, -1.0); g.closePath();
  g.fill();
  g.restore();

  const tex = new THREE.CanvasTexture(c);
  tex.anisotropy = maxAniso;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function panelTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = 'rgb(18,18,22)';
  g.fillRect(0, 0, 128, 128);
  // hexagon outline
  g.strokeStyle = 'rgb(150,150,165)';
  g.lineWidth = 3;
  g.strokeRect(2, 2, 124, 124);
  g.strokeStyle = 'rgb(70,70,80)';
  g.lineWidth = 2;
  g.beginPath();
  g.moveTo(64, 2); g.lineTo(64, 126);
  g.moveTo(2, 64); g.lineTo(126, 64);
  g.stroke();
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

function netTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  g.clearRect(0, 0, 64, 64);
  g.strokeStyle = 'rgba(255,255,255,0.9)';
  g.lineWidth = 3;
  g.beginPath();
  g.moveTo(0, 32); g.lineTo(32, 0); g.lineTo(64, 32); g.lineTo(32, 64); g.closePath();
  g.stroke();
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

function glowSpriteTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.2, 'rgba(255,255,255,0.6)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

export const GLOW_TEX = { tex: null };

// ---------- main builder ----------
export function buildArena(scene, renderer, quality, T = MAPS[0]) {
  const high = quality === 'high';
  const nice = quality !== 'low';
  const night = !T.sky.sun;
  const group = new THREE.Group();
  scene.add(group);
  const blue = new THREE.Color(TEAM_COLORS[0].main);
  const red = new THREE.Color(TEAM_COLORS[1].main);
  const perim = buildPerimeter();
  GLOW_TEX.tex = glowSpriteTexture();

  // floor
  const ix = W - RW, iz = L - RW, ir = RC - RW;
  const shape = new THREE.Shape();
  shape.moveTo(-ix + ir, -iz);
  shape.lineTo(ix - ir, -iz);
  shape.absarc(ix - ir, -iz + ir, ir, -Math.PI / 2, 0, false);
  shape.lineTo(ix, iz - ir);
  shape.absarc(ix - ir, iz - ir, ir, 0, Math.PI / 2, false);
  shape.lineTo(-ix + ir, iz);
  shape.absarc(-ix + ir, iz - ir, ir, Math.PI / 2, Math.PI, false);
  shape.lineTo(-ix, -iz + ir);
  shape.absarc(-ix + ir, -iz + ir, ir, Math.PI, Math.PI * 1.5, false);
  const floorGeo = new THREE.ShapeGeometry(shape, 12);
  const fp = floorGeo.attributes.position;
  const fuv = floorGeo.attributes.uv;
  for (let i = 0; i < fp.count; i++) {
    const x = fp.getX(i), y = fp.getY(i);
    fuv.setXY(i, (x + W) / (2 * W), (y + L) / (2 * L));
  }
  floorGeo.rotateX(-Math.PI / 2);
  // fine surface detail: a tiling normal map on top of the painted field
  const aniso = renderer.capabilities.getMaxAnisotropy();
  const style = T.turf.style;
  const detail = nice ? (style === 'metal' ? metalNormal() : style === 'snow' ? softNormal() : grassNormal()).clone() : null;
  if (detail) {
    const rep = style === 'metal' ? [17, 23] : [70, 95];
    detail.repeat.set(rep[0], rep[1]);
    detail.anisotropy = aniso;
    detail.needsUpdate = true;
  }
  const floorMat = new THREE.MeshStandardMaterial({
    map: fieldTexture(aniso, high, T.turf),
    normalMap: detail,
    normalScale: new THREE.Vector2(style === 'metal' ? 0.5 : 0.85, style === 'metal' ? 0.5 : 0.85),
    roughness: style === 'metal' ? 0.32 : style === 'snow' ? 0.62 : 0.9,
    metalness: style === 'metal' ? 0.55 : 0.0,
    envMapIntensity: style === 'metal' ? 1.2 : 0.35,
  });
  const floor = new THREE.Mesh(floorGeo, floorMat);
  floor.receiveShadow = true;
  group.add(floor);

  // lower boards (solid)
  const boardsGeo = buildWall(perim, profileRange(0, 5.2), (x, y, z) => {
    const c = teamTint(z, blue, red).multiplyScalar(0.18 + 0.12 * (y / 5.2));
    return c.lerp(new THREE.Color(T.board), 0.45);
  }, true, 3);
  const boards = new THREE.Mesh(boardsGeo, new THREE.MeshStandardMaterial({
    vertexColors: true, roughness: 0.4, metalness: 0.45, map: panelTexture(),
    normalMap: nice ? (() => { const t = metalNormal().clone(); t.repeat.set(1, 1); t.needsUpdate = true; return t; })() : null,
    normalScale: new THREE.Vector2(0.6, 0.6),
  }));
  boards.receiveShadow = true;
  group.add(boards);

  // neon strip on top of the boards
  const stripGeo = buildWall(perim, profileRange(5.2, 5.45).map((p, i) => ({ ...p, d: 0.03 })), (x, y, z) => teamTint(z, blue, red).multiplyScalar(1.6), true, 3);
  group.add(new THREE.Mesh(stripGeo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide })));

  // glass upper walls (additive panels)
  const glassGeo = buildWall(perim, profileRange(5.45, H), (x, y, z) => teamTint(z, blue, red).multiplyScalar(0.55), true, 5);
  const glassMat = new THREE.MeshBasicMaterial({
    vertexColors: true, map: panelTexture(), transparent: true, opacity: T.glass,
    blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
  });
  const glass = new THREE.Mesh(glassGeo, glassMat);
  glass.renderOrder = 2;
  group.add(glass);

  // ceiling rim
  const rimPts = perim.map(p => new THREE.Vector3(p.x - p.nx * RW, H - 0.02, p.z - p.nz * RW));
  const rim = new THREE.Line(new THREE.BufferGeometry().setFromPoints(rimPts), new THREE.LineBasicMaterial({ color: 0x9fb8ff, transparent: true, opacity: 0.5 }));
  group.add(rim);

  // goals
  const netTex = netTexture();
  for (const side of [-1, 1]) {
    const team = side < 0 ? 0 : 1;
    const tc = TEAM_COLORS[team];
    const gz = side * L;
    const g = new THREE.Group();
    group.add(g);
    // goal floor
    const gf = new THREE.Mesh(new THREE.PlaneGeometry(GW * 2, GD + RW + 0.2), new THREE.MeshStandardMaterial({ color: new THREE.Color(tc.dark).multiplyScalar(0.6), roughness: 0.8 }));
    gf.rotation.x = -Math.PI / 2;
    gf.receiveShadow = true;
    gf.position.set(0, 0.002, gz + side * (GD - RW - 0.2) / 2);
    g.add(gf);
    // goal line
    const gl = new THREE.Mesh(new THREE.PlaneGeometry(GW * 2, 0.3), new THREE.MeshBasicMaterial({ color: 0xffffff }));
    gl.rotation.x = -Math.PI / 2;
    gl.position.set(0, 0.006, gz + side * 0.15);
    g.add(gl);
    // back panel
    const back = new THREE.Mesh(new THREE.PlaneGeometry(GW * 2, GH), new THREE.MeshBasicMaterial({ color: new THREE.Color(tc.dark).multiplyScalar(0.5) }));
    back.position.set(0, GH / 2, gz + side * GD);
    back.rotation.y = side > 0 ? Math.PI : 0;
    g.add(back);
    // nets
    const netMat = new THREE.MeshBasicMaterial({ map: netTex, color: tc.glow, transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending });
    const mkNet = (w, h, rx) => { const t = netTex.clone(); t.repeat.set(w / 1.2, h / 1.2); t.needsUpdate = true; const m = netMat.clone(); m.map = t; return new THREE.Mesh(new THREE.PlaneGeometry(w, h), m); };
    const backNet = mkNet(GW * 2, GH);
    backNet.position.set(0, GH / 2, gz + side * (GD - 0.05));
    g.add(backNet);
    for (const sx of [-1, 1]) {
      const sn = mkNet(GD, GH);
      sn.rotation.y = Math.PI / 2;
      sn.position.set(sx * GW, GH / 2, gz + side * GD / 2);
      g.add(sn);
    }
    const top = mkNet(GW * 2, GD);
    top.rotation.x = Math.PI / 2;
    top.position.set(0, GH, gz + side * GD / 2);
    g.add(top);
    // frame
    const frameMat = new THREE.MeshStandardMaterial({ color: 0xf2f4f8, emissive: tc.glow, emissiveIntensity: 0.6, roughness: 0.3, metalness: 0.6 });
    const postGeo = new THREE.CylinderGeometry(0.3, 0.3, GH + 0.3, 12);
    for (const sx of [-1, 1]) {
      const post = new THREE.Mesh(postGeo, frameMat);
      post.position.set(sx * (GW + 0.25), (GH + 0.3) / 2, gz + side * 0.25);
      g.add(post);
    }
    const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, GW * 2 + 0.8, 12), frameMat);
    bar.rotation.z = Math.PI / 2;
    bar.position.set(0, GH + 0.3, gz + side * 0.25);
    g.add(bar);
    // goal glow light
    const gLight = new THREE.PointLight(tc.glow, nice ? 30 : 0, 16, 2);
    gLight.position.set(0, GH * 0.6, gz + side * (GD - 1));
    if (nice) g.add(gLight);
  }

  // outer ground
  if (T.ground != null && T.props !== 'beach' && T.props !== 'city') {
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(1400, 1400), new THREE.MeshStandardMaterial({ color: T.ground, roughness: 1 }));
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.05;
    ground.receiveShadow = true;
    group.add(ground);
  }

  // stands: stepped tiers around the arena
  let crowdMat = null;
  const tiers = 9;
  if (T.stands) {
  const standProfile = [];
  for (let t = 0; t < tiers; t++) {
    const o = 7 + t * 2.4;
    const y = 1.5 + t * 1.6;
    standProfile.push({ o, y, ny: 0, nh: -1 });
    standProfile.push({ o, y: y + 1.6, ny: 0, nh: -1 });
    standProfile.push({ o, y: y + 1.6, ny: 1, nh: 0 });
    standProfile.push({ o: o + 2.4, y: y + 1.6, ny: 1, nh: 0 });
  }
  const sPerim = perim.filter((_, i) => i % 1 === 0);
  const scols = sPerim.length, srows = standProfile.length;
  const sp = new Float32Array(scols * srows * 3), sn = new Float32Array(scols * srows * 3), sc = new Float32Array(scols * srows * 3);
  let k = 0;
  for (let i = 0; i < scols; i++) {
    const P = sPerim[i];
    // push the perimeter outward using a larger rounded rect
    for (let j = 0; j < srows; j++) {
      const Q = standProfile[j];
      sp[k * 3] = P.x + P.nx * Q.o; sp[k * 3 + 1] = Q.y; sp[k * 3 + 2] = P.z + P.nz * Q.o;
      sn[k * 3] = P.nx * Q.nh; sn[k * 3 + 1] = Q.ny; sn[k * 3 + 2] = P.nz * Q.nh;
      const tint = teamTint(P.z, blue, red).multiplyScalar(0.12).add(new THREE.Color(T.standColor));
      const shade = (j % 4 < 2) ? 0.7 : 1.0;
      sc[k * 3] = tint.r * shade; sc[k * 3 + 1] = tint.g * shade; sc[k * 3 + 2] = tint.b * shade;
      k++;
    }
  }
  const sIdx = [];
  for (let i = 0; i < scols - 1; i++) for (let j = 0; j < srows - 1; j++) {
    const a = i * srows + j, b = (i + 1) * srows + j, c = (i + 1) * srows + j + 1, d = i * srows + j + 1;
    sIdx.push(a, d, b, b, d, c);
  }
  const standGeo = new THREE.BufferGeometry();
  standGeo.setAttribute('position', new THREE.BufferAttribute(sp, 3));
  standGeo.setAttribute('normal', new THREE.BufferAttribute(sn, 3));
  standGeo.setAttribute('color', new THREE.BufferAttribute(sc, 3));
  standGeo.setIndex(sIdx);
  group.add(new THREE.Mesh(standGeo, new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide })));

  // crowd
  const crowdCount = high ? 6000 : nice ? 4000 : 2000;
  const cp = new Float32Array(crowdCount * 3), cc = new Float32Array(crowdCount * 3), cph = new Float32Array(crowdCount);
  const totalU = perim[perim.length - 1].u;
  const palette = [0xffffff, 0xffd166, 0x9ad1ff, 0xff9aa2, 0xc3f584, 0xd0b3ff, 0x333333];
  const tmp = new THREE.Color();
  for (let i = 0; i < crowdCount; i++) {
    const u = Math.random() * totalU;
    let s = 1;
    while (s < perim.length - 1 && perim[s].u < u) s++;
    const A = perim[s - 1], B = perim[s];
    const f = (u - A.u) / Math.max(1e-4, B.u - A.u);
    const x = A.x + (B.x - A.x) * f, z = A.z + (B.z - A.z) * f;
    const nx = A.nx + (B.nx - A.nx) * f, nz = A.nz + (B.nz - A.nz) * f;
    const t = Math.floor(Math.random() * tiers);
    const o = 7 + t * 2.4 + 0.4 + Math.random() * 1.6;
    cp[i * 3] = x + nx * o; cp[i * 3 + 1] = 1.5 + t * 1.6 + 1.6 + 0.45; cp[i * 3 + 2] = z + nz * o;
    if (Math.random() < 0.45) tmp.set(z < 0 ? TEAM_COLORS[0].glow : TEAM_COLORS[1].glow);
    else tmp.set(palette[(Math.random() * palette.length) | 0]);
    tmp.multiplyScalar(0.55 + Math.random() * 0.45);
    cc[i * 3] = tmp.r; cc[i * 3 + 1] = tmp.g; cc[i * 3 + 2] = tmp.b;
    cph[i] = Math.random() * Math.PI * 2;
  }
  const crowdGeo = new THREE.BufferGeometry();
  crowdGeo.setAttribute('position', new THREE.BufferAttribute(cp, 3));
  crowdGeo.setAttribute('color', new THREE.BufferAttribute(cc, 3));
  crowdGeo.setAttribute('phase', new THREE.BufferAttribute(cph, 1));
  crowdMat = new THREE.ShaderMaterial({
    uniforms: { time: { value: 0 }, excite: { value: 0.1 }, scale: { value: 400 } },
    vertexShader: `
      attribute vec3 color; attribute float phase;
      uniform float time; uniform float excite; uniform float scale;
      varying vec3 vColor;
      void main(){
        vColor = color;
        vec3 p = position;
        p.y += abs(sin(time * (5.0 + phase) + phase * 3.0)) * excite;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_PointSize = clamp(0.9 * scale / -mv.z, 1.0, 14.0);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      varying vec3 vColor;
      void main(){
        vec2 d = gl_PointCoord - 0.5;
        if (dot(d,d) > 0.25) discard;
        gl_FragColor = vec4(vColor, 1.0);
      }`,
  });
  const crowd = new THREE.Points(crowdGeo, crowdMat);
  group.add(crowd);
  }

  // light towers
  const poleMat = new THREE.MeshStandardMaterial({ color: 0x2a2e38, roughness: 0.7, metalness: 0.5 });
  if (T.towers) {
  const glowMat = new THREE.SpriteMaterial({ map: GLOW_TEX.tex, color: 0xdfe9ff, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true });
  const panelMat = new THREE.MeshBasicMaterial({ color: 0xf4f8ff });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const px = sx * (W + 26), pz = sz * (L + 22);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.9, 42, 8), poleMat);
    pole.position.set(px, 21, pz);
    group.add(pole);
    const head = new THREE.Group();
    head.position.set(px, 43, pz);
    head.lookAt(0, 0, 0);
    const panel = new THREE.Mesh(new THREE.BoxGeometry(9, 5, 0.6), panelMat);
    head.add(panel);
    group.add(head);
    const spr = new THREE.Sprite(glowMat);
    spr.scale.set(26, 26, 1);
    spr.position.set(px * 0.97, 43, pz * 0.97);
    group.add(spr);
  }
  }

  // soft light beams from the towers onto the pitch
  if (nice && T.beams) {
    const beamGeo = new THREE.CylinderGeometry(1.2, 10, 1, 24, 1, true);
    beamGeo.translate(0, -0.5, 0);
    const beamMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      uniforms: { color: { value: new THREE.Color(0x9fb6ff) } },
      vertexShader: `varying float vY; void main(){ vY = position.y; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `uniform vec3 color; varying float vY; void main(){ float a = pow(1.0 + vY, 2.0) * 0.05; gl_FragColor = vec4(color * a, a); }`,
    });
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const from = new THREE.Vector3(sx * (W + 26) * 0.97, 43, sz * (L + 22) * 0.97);
      const to = new THREE.Vector3(sx * W * 0.3, 0, sz * L * 0.35);
      const beam = new THREE.Mesh(beamGeo, beamMat);
      const len = from.distanceTo(to) * 0.8;
      beam.scale.set(1, len, 1);
      beam.position.copy(from);
      beam.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), to.clone().sub(from).normalize());
      beam.renderOrder = 3;
      group.add(beam);
    }
  }

  // neon rim where the walls meet the ceiling
  const rimGeo = buildWall(perim, profileRange(H - 0.35, H).map(p => ({ ...p })), (x, y, z) => teamTint(z, blue, red).multiplyScalar(night ? 1.4 : 0.9), false, 3);
  group.add(new THREE.Mesh(rimGeo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide, transparent: true, opacity: 0.8 })));

  // jumbotron above the center
  const jumboCanvas = document.createElement('canvas');
  jumboCanvas.width = 512; jumboCanvas.height = 192;
  const jumboTex = new THREE.CanvasTexture(jumboCanvas);
  jumboTex.colorSpace = THREE.SRGBColorSpace;
  const jumboMat = new THREE.MeshBasicMaterial({ map: jumboTex });
  const jumbo = new THREE.Group();
  const jFrame = new THREE.Mesh(new THREE.BoxGeometry(10.4, 4.2, 10.4), new THREE.MeshStandardMaterial({ color: 0x15171d, metalness: 0.6, roughness: 0.4 }));
  jumbo.add(jFrame);
  for (let i = 0; i < 4; i++) {
    const s = new THREE.Mesh(new THREE.PlaneGeometry(9.8, 3.7), jumboMat);
    const a = i * Math.PI / 2;
    s.position.set(Math.sin(a) * 5.22, 0, Math.cos(a) * 5.22);
    s.rotation.y = a;
    jumbo.add(s);
  }
  jumbo.position.set(0, H + 16, 0);
  group.add(jumbo);
  const cable = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 30, 6), poleMat);
  cable.position.set(0, H + 16 + 17, 0);
  group.add(cable);

  function drawJumbo(blueScore, redScore, timeText) {
    const g = jumboCanvas.getContext('2d');
    g.fillStyle = '#05070c';
    g.fillRect(0, 0, 512, 192);
    g.fillStyle = TEAM_COLORS[0].css;
    g.fillRect(0, 0, 180, 192);
    g.fillStyle = TEAM_COLORS[1].css;
    g.fillRect(332, 0, 180, 192);
    g.fillStyle = '#fff';
    g.font = 'bold 120px system-ui, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(String(blueScore), 90, 100);
    g.fillText(String(redScore), 422, 100);
    g.font = 'bold 54px system-ui, sans-serif';
    g.fillText(timeText, 256, 100);
    jumboTex.needsUpdate = true;
  }
  drawJumbo(0, 0, '5:00');

  // sky
  const skyGeo = new THREE.SphereGeometry(400, 24, 16);
  const sun = T.sky.sun;
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: {
      top: { value: new THREE.Color(T.sky.top) }, hor: { value: new THREE.Color(T.sky.hor) }, low: { value: new THREE.Color(T.sky.low) },
      sunDir: { value: new THREE.Vector3(...(sun ? sun.dir : [0, 1, 0])).normalize() },
      sunColor: { value: new THREE.Color(sun ? sun.color : 0x000000) }, sunSize: { value: sun ? sun.size : 0 },
    },
    vertexShader: `varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `uniform vec3 top; uniform vec3 hor; uniform vec3 low; uniform vec3 sunDir; uniform vec3 sunColor; uniform float sunSize;
      varying vec3 vP; void main(){
      vec3 d = normalize(vP);
      float h = d.y;
      vec3 c = h > 0.0 ? mix(hor, top, pow(h, 0.55)) : mix(hor, low, min(1.0, -h * 6.0));
      if (sunSize > 0.0) {
        float a = dot(d, sunDir);
        c += sunColor * smoothstep(1.0 - sunSize * 0.12, 1.0 - sunSize * 0.08, a) * 2.0;
        c += sunColor * pow(max(0.0, a), 60.0) * 0.6 + sunColor * pow(max(0.0, a), 6.0) * 0.18;
      }
      gl_FragColor = vec4(c, 1.0);
    }`,
  });
  const sky = new THREE.Mesh(skyGeo, skyMat);
  group.add(sky);
  const starCount = T.sky.stars || 0;
  const stp = new Float32Array(starCount * 3);
  for (let i = 0; i < starCount; i++) {
    const th = Math.random() * Math.PI * 2, ph = Math.random() * 0.45 * Math.PI;
    stp[i * 3] = Math.cos(th) * Math.cos(ph) * 380;
    stp[i * 3 + 1] = Math.sin(ph) * 380 + 20;
    stp[i * 3 + 2] = Math.sin(th) * Math.cos(ph) * 380;
  }
  if (starCount) {
    const stars = new THREE.Points(new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(stp, 3)), new THREE.PointsMaterial({ color: 0xffffff, size: 1.2, sizeAttenuation: false, fog: false }));
    group.add(stars);
  }

  const update = buildScenery(group, T, quality);

  function dispose() {
    scene.remove(group);
    group.traverse(o => {
      if (o.geometry) o.geometry.dispose();
      const mats = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : [];
      for (const m of mats) {
        for (const k of ['map', 'emissiveMap', 'alphaMap', 'normalMap']) if (m[k]) m[k].dispose();
        m.dispose();
      }
    });
  }

  return { group, crowdMat, drawJumbo, glassMat, update, dispose, dustColor: T.dust, theme: T };
}

// ---------- boost pads ----------
export class BoostPadsView {
  constructor(scene) {
    this.items = [];
    const baseGeoBig = new THREE.CylinderGeometry(1.5, 1.7, 0.12, 24);
    const baseGeoSmall = new THREE.CylinderGeometry(0.9, 1.0, 0.08, 18);
    const ringGeoBig = new THREE.RingGeometry(1.1, 1.4, 32);
    const ringGeoSmall = new THREE.RingGeometry(0.55, 0.78, 24);
    ringGeoBig.rotateX(-Math.PI / 2);
    ringGeoSmall.rotateX(-Math.PI / 2);
    const baseMat = new THREE.MeshStandardMaterial({ color: 0x2b3140, roughness: 0.5, metalness: 0.6 });
    const orbGeo = new THREE.IcosahedronGeometry(0.75, 1);
    for (const p of BOOST_PADS) {
      const g = new THREE.Group();
      g.position.set(p.x, 0, p.z);
      const base = new THREE.Mesh(p.big ? baseGeoBig : baseGeoSmall, baseMat);
      base.position.y = 0.04;
      g.add(base);
      const ringMat = new THREE.MeshBasicMaterial({ color: 0x59f3ff, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false });
      const ring = new THREE.Mesh(p.big ? ringGeoBig : ringGeoSmall, ringMat);
      ring.position.y = p.big ? 0.11 : 0.09;
      g.add(ring);
      let orb = null, glow = null;
      if (p.big) {
        orb = new THREE.Mesh(orbGeo, new THREE.MeshBasicMaterial({ color: 0x8ff8ff, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }));
        orb.position.y = 1.4;
        g.add(orb);
        glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: GLOW_TEX.tex, color: 0x59f3ff, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
        glow.scale.set(4.5, 4.5, 1);
        glow.position.y = 1.4;
        g.add(glow);
      }
      scene.add(g);
      this.items.push({ g, ring, ringMat, orb, glow, big: p.big });
    }
  }

  update(pads, time) {
    for (let i = 0; i < this.items.length; i++) {
      const it = this.items[i];
      const active = pads[i].active;
      it.ringMat.opacity = active ? 0.85 + Math.sin(time * 4 + i) * 0.15 : 0.12;
      if (it.orb) {
        it.orb.visible = active;
        it.glow.visible = active;
        it.orb.rotation.y = time * 1.6;
        it.orb.rotation.x = time * 0.7;
        it.orb.position.y = 1.4 + Math.sin(time * 2 + i) * 0.15;
        it.glow.position.y = it.orb.position.y;
      }
    }
  }
}
