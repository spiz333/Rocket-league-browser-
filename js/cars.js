// Car models: smooth lofted bodies (superellipse cross-sections along the length),
// painted livery textures, paint finishes, wheels, toppers and boost flames.
// All shapes and designs are original.
import * as THREE from '../vendor/three.module.min.js';
import { TEAM_COLORS } from './config.js';
import { ITEMS } from './catalog.js';
import { canvasTex, radialTex, flameTex, buildWheel, mergeStatic } from './models.js';
import { flakeNormal, carbonTexture } from './textures.js';

// stations: [z, halfWidth, yBottom, yTop, squareness]
export const BODY_TYPES = [
  { name: 'Raptor',
    body: [[-0.80, 0.36, -0.10, 0.08, 3.6], [-0.72, 0.44, -0.14, 0.16, 3.2], [-0.48, 0.465, -0.15, 0.19, 3.0], [-0.15, 0.44, -0.15, 0.17, 3.0], [0.25, 0.44, -0.15, 0.12, 3.0], [0.48, 0.455, -0.15, 0.09, 3.0], [0.72, 0.41, -0.13, 0.03, 3.2], [0.86, 0.30, -0.09, -0.03, 3.8]],
    cabin: [[-0.52, 0.30, 0.08, 0.16, 3], [-0.36, 0.32, 0.08, 0.33, 2.8], [0.0, 0.32, 0.08, 0.345, 2.8], [0.2, 0.31, 0.06, 0.28, 2.8], [0.34, 0.28, 0.04, 0.12, 3]],
    spoiler: { type: 'wing', z: -0.66, y: 0.29, w: 0.88, d: 0.18 } },
  { name: 'Brute',
    body: [[-0.78, 0.44, -0.13, 0.16, 5], [-0.7, 0.48, -0.15, 0.2, 5], [-0.2, 0.48, -0.15, 0.21, 5], [0.4, 0.48, -0.15, 0.2, 5], [0.66, 0.47, -0.14, 0.16, 5], [0.82, 0.43, -0.12, 0.08, 5], [0.86, 0.38, -0.1, 0.02, 5]],
    cabin: [[-0.56, 0.42, 0.16, 0.2, 4.5], [-0.5, 0.43, 0.16, 0.44, 4.5], [0.12, 0.43, 0.16, 0.45, 4.5], [0.34, 0.41, 0.16, 0.2, 4.5]],
    spoiler: { type: 'lightbar' } },
  { name: 'Dart',
    body: [[-0.82, 0.34, -0.09, 0.05, 3.5], [-0.7, 0.43, -0.12, 0.1, 3.0], [-0.4, 0.44, -0.13, 0.12, 2.8], [0.1, 0.42, -0.13, 0.09, 2.8], [0.5, 0.43, -0.13, 0.05, 2.8], [0.78, 0.38, -0.11, -0.01, 3], [0.9, 0.27, -0.08, -0.05, 3.6]],
    cabin: [[-0.42, 0.27, 0.06, 0.1, 3], [-0.25, 0.29, 0.06, 0.27, 2.6], [0.02, 0.28, 0.05, 0.28, 2.6], [0.28, 0.25, 0.03, 0.08, 3]],
    spoiler: { type: 'wing', z: -0.74, y: 0.24, w: 0.94, d: 0.22 } },
  { name: 'Hornet',
    body: [[-0.70, 0.42, -0.13, 0.18, 3.6], [-0.62, 0.46, -0.15, 0.22, 3.4], [-0.2, 0.45, -0.15, 0.2, 3.2], [0.35, 0.45, -0.15, 0.14, 3.2], [0.65, 0.42, -0.14, 0.07, 3.4], [0.78, 0.36, -0.11, 0.0, 3.8]],
    cabin: [[-0.64, 0.36, 0.14, 0.22, 3], [-0.58, 0.37, 0.14, 0.41, 3], [0.02, 0.36, 0.12, 0.42, 3], [0.3, 0.33, 0.08, 0.15, 3]],
    spoiler: { type: 'roof', z: -0.6, y: 0.45, w: 0.72, d: 0.16 } },
  { name: 'Phantom',
    body: [[-0.82, 0.42, -0.12, 0.12, 4], [-0.72, 0.46, -0.14, 0.15, 3.6], [-0.3, 0.45, -0.15, 0.15, 3.4], [0.3, 0.45, -0.15, 0.17, 3.6], [0.7, 0.44, -0.14, 0.13, 4], [0.86, 0.40, -0.12, 0.04, 4.4]],
    cabin: [[-0.5, 0.31, 0.1, 0.14, 3], [-0.34, 0.33, 0.1, 0.32, 2.8], [-0.02, 0.33, 0.1, 0.33, 2.8], [0.24, 0.3, 0.1, 0.15, 3]],
    spoiler: { type: 'lip', z: -0.76, y: 0.17, w: 0.86, d: 0.1 } },
  { name: 'Comet',
    body: [[-0.76, 0.30, -0.06, 0.06, 2.2], [-0.6, 0.44, -0.13, 0.16, 2.3], [-0.1, 0.47, -0.15, 0.2, 2.4], [0.4, 0.45, -0.15, 0.14, 2.4], [0.72, 0.36, -0.12, 0.04, 2.3], [0.84, 0.2, -0.07, -0.02, 2.2]],
    cabin: [[-0.42, 0.3, 0.1, 0.18, 2.2], [-0.2, 0.35, 0.1, 0.42, 2.2], [0.12, 0.33, 0.1, 0.38, 2.2], [0.36, 0.22, 0.08, 0.12, 2.2]],
    spoiler: { type: 'fins' } },
  { name: 'Manta',
    body: [[-0.82, 0.40, -0.10, 0.12, 4.5], [-0.7, 0.48, -0.13, 0.15, 4], [-0.3, 0.47, -0.14, 0.14, 3.6], [0.2, 0.44, -0.14, 0.08, 3.6], [0.6, 0.42, -0.13, 0.0, 3.8], [0.9, 0.36, -0.1, -0.07, 4.5]],
    cabin: [[-0.3, 0.24, 0.04, 0.1, 2.6], [-0.14, 0.26, 0.04, 0.24, 2.4], [0.08, 0.25, 0.03, 0.24, 2.4], [0.3, 0.2, 0.0, 0.03, 2.6]],
    spoiler: { type: 'wing', z: -0.74, y: 0.3, w: 1.0, d: 0.2 } },
];

export function defaultLook() {
  return { body: 0, paint: 0, finish: 0, livery: 1, wheel: 0, boost: 0, topper: 0, goalfx: 0, trail: 0, number: 7 };
}

// ---------- loft geometry ----------
function cr(p0, p1, p2, p3, t) {
  const t2 = t * t, t3 = t2 * t;
  return 0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
}
function sample(st, z) {
  if (z <= st[0][0]) return st[0];
  const n = st.length;
  if (z >= st[n - 1][0]) return st[n - 1];
  let i = 0;
  while (i < n - 2 && z > st[i + 1][0]) i++;
  const p0 = st[Math.max(0, i - 1)], p1 = st[i], p2 = st[i + 1], p3 = st[Math.min(n - 1, i + 2)];
  const t = (z - p1[0]) / (p2[0] - p1[0]);
  const out = [z];
  for (let k = 1; k < 5; k++) out.push(cr(p0[k], p1[k], p2[k], p3[k], t));
  return out;
}

function loft(st, { rings = 40, seg = 36, taper = 0.12, phi0 = 0, phi1 = 1, caps = true, grow = 0 } = {}) {
  const z0 = st[0][0], z1 = st[st.length - 1][0];
  const pos = [], uv = [], idx = [];
  const ringPts = seg + 1;
  for (let i = 0; i <= rings; i++) {
    const t = i / rings;
    const z = z0 + (z1 - z0) * t;
    const [, w0, yb, yt, n] = sample(st, z);
    const w = w0 + grow, mid = (yb + yt) / 2, h = (yt - yb) / 2 + grow;
    const e = 2 / Math.max(1.5, n);
    for (let j = 0; j <= seg; j++) {
      const phi = phi0 + (phi1 - phi0) * (j / seg);
      const th = phi * Math.PI * 2 - Math.PI / 2;
      const c = Math.cos(th), s = Math.sin(th);
      let x = w * Math.sign(c) * Math.pow(Math.abs(c), e);
      const y = mid + h * Math.sign(s) * Math.pow(Math.abs(s), e);
      if (s > 0) x *= 1 - taper * s * s; // upper body leans inward
      pos.push(x, y, z);
      uv.push(phi, t);
    }
  }
  for (let i = 0; i < rings; i++) for (let j = 0; j < seg; j++) {
    const a = i * ringPts + j, b = a + ringPts, c = a + 1, d = b + 1;
    idx.push(a, c, b, c, d, b);
  }
  if (caps) {
    for (const end of [0, rings]) {
      const base = end * ringPts;
      let cx = 0, cy = 0;
      for (let j = 0; j < seg; j++) { cx += pos[(base + j) * 3]; cy += pos[(base + j) * 3 + 1]; }
      const zc = pos[base * 3 + 2] + (end ? 0.015 : -0.015);
      const ci = pos.length / 3;
      pos.push(cx / seg, cy / seg, zc);
      uv.push(0.5, end ? 1 : 0);
      for (let j = 0; j < seg; j++) {
        if (end) idx.push(ci, base + j, base + j + 1);
        else idx.push(ci, base + j + 1, base + j);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// ---------- livery textures ----------
const LIGHT = (hex) => {
  const c = new THREE.Color(hex);
  return c.r * 0.3 + c.g * 0.59 + c.b * 0.11 > 0.55;
};
const css = (hex) => '#' + new THREE.Color(hex).getHexString();
function seeded(seed) { let s = seed % 2147483647 || 1; return () => { s = (s * 16807) % 2147483647; return s / 2147483647; }; }

// draw on both flanks: local x>0 points up towards the roof, y runs front (0) -> rear (512)
function sides(g, fn) {
  for (const [cx, mirror] of [[128, false], [384, true]]) {
    g.save();
    g.translate(cx, 0);
    if (mirror) g.scale(-1, 1);
    fn(g);
    g.restore();
  }
}

function liveryTexture(livery, paintHex, team, number) {
  const tc = TEAM_COLORS[team];
  const key = `liv:${livery}:${paintHex}:${team}:${number}`;
  return canvasTex(key, 512, 512, (g) => {
    const base = css(paintHex);
    const team1 = tc.css, glow = css(tc.glow);
    const contrast = LIGHT(paintHex) ? '#15171c' : '#f4f6fa';
    g.fillStyle = base;
    g.fillRect(0, 0, 512, 512);
    const rnd = seeded(livery * 97 + team * 13 + 5);
    switch (ITEMS.livery[livery]?.name) {
      case 'Racing Stripes':
        g.fillStyle = contrast;
        g.fillRect(256 - 40, 0, 26, 512); g.fillRect(256 + 14, 0, 26, 512);
        g.fillStyle = team1;
        g.fillRect(256 - 44, 0, 4, 512); g.fillRect(256 + 40, 0, 4, 512);
        break;
      case 'Bolt':
        sides(g, (c) => {
          c.fillStyle = team1; c.strokeStyle = contrast; c.lineWidth = 5;
          c.beginPath(); c.moveTo(-10, 40); c.lineTo(30, 190); c.lineTo(-5, 200); c.lineTo(40, 470); c.lineTo(-30, 260); c.lineTo(5, 250); c.lineTo(-40, 40); c.closePath();
          c.fill(); c.stroke();
        });
        break;
      case 'Number':
        for (const [x, y, flip] of [[128, 250, false], [384, 250, true], [256, 110, false]]) {
          g.save(); g.translate(x, y); if (flip) g.scale(-1, 1); g.rotate(Math.PI / 2 * (x === 256 ? 0 : (flip ? -1 : 1)));
          g.fillStyle = '#fff'; g.beginPath(); g.arc(0, 0, 54, 0, Math.PI * 2); g.fill();
          g.lineWidth = 8; g.strokeStyle = team1; g.stroke();
          g.fillStyle = '#111'; g.font = 'italic 900 62px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
          g.fillText(String(number).padStart(2, '0'), 0, 4);
          g.restore();
        }
        break;
      case 'Split':
        g.fillStyle = team1; g.fillRect(0, 290, 512, 222);
        g.fillStyle = contrast; g.fillRect(0, 282, 512, 8);
        break;
      case 'Flames':
        sides(g, (c) => {
          for (let k = 0; k < 7; k++) {
            const off = -70 + k * 22, len = 160 + rnd() * 160;
            const grd = c.createLinearGradient(0, 0, 0, len);
            grd.addColorStop(0, '#fff3b0'); grd.addColorStop(0.35, '#ffb21e'); grd.addColorStop(0.75, '#ff4a12'); grd.addColorStop(1, 'rgba(160,0,0,0)');
            c.fillStyle = grd;
            c.beginPath(); c.moveTo(off - 14, 0);
            c.bezierCurveTo(off - 24, len * 0.4, off + 30, len * 0.6, off + 4, len);
            c.bezierCurveTo(off + 12, len * 0.55, off + 14, len * 0.3, off + 16, 0);
            c.closePath(); c.fill();
          }
        });
        break;
      case 'Tiger':
        g.fillStyle = '#111317';
        for (let k = 0; k < 46; k++) {
          const x = rnd() * 512, y = rnd() * 512, l = 40 + rnd() * 70, a = (rnd() - 0.5) * 0.6;
          g.save(); g.translate(x, y); g.rotate(a);
          g.beginPath(); g.moveTo(-l / 2, 0); g.quadraticCurveTo(0, -10 - rnd() * 8, l / 2, 0); g.quadraticCurveTo(0, 6, -l / 2, 0); g.fill();
          g.restore();
        }
        break;
      case 'Pixel Camo': {
        const c0 = new THREE.Color(paintHex), shades = [0.55, 0.75, 1.0, 1.25].map(f => css(c0.clone().multiplyScalar(f).getHex()));
        for (let y = 0; y < 512; y += 16) for (let x = 0; x < 512; x += 16) {
          const n = Math.sin(x * 0.031 + y * 0.017) + Math.sin(x * 0.011 - y * 0.043) + rnd() * 0.8;
          g.fillStyle = shades[Math.max(0, Math.min(3, Math.floor((n + 2) / 1.2)))];
          g.fillRect(x, y, 16, 16);
        }
        break;
      }
      case 'Checker':
        for (let y = 400; y < 512; y += 24) for (let x = 0; x < 512; x += 24) {
          g.fillStyle = ((x + y) / 24) % 2 ? '#101010' : '#f5f5f5';
          g.fillRect(x, y, 24, 24);
        }
        g.fillStyle = team1; g.fillRect(0, 392, 512, 8);
        break;
      case 'Fade': {
        const grd = g.createLinearGradient(0, 0, 0, 512);
        grd.addColorStop(0, glow); grd.addColorStop(0.55, base); grd.addColorStop(1, base);
        g.fillStyle = grd; g.fillRect(0, 0, 512, 512);
        break;
      }
      case 'Circuit': {
        g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(0, 0, 512, 512);
        g.strokeStyle = glow; g.fillStyle = glow; g.lineWidth = 3;
        for (let k = 0; k < 26; k++) {
          let x = rnd() * 512, y = rnd() * 512;
          g.beginPath(); g.moveTo(x, y);
          for (let s = 0; s < 4; s++) { if (s % 2) x += (rnd() - 0.5) * 120; else y += (rnd() - 0.5) * 120; g.lineTo(x, y); }
          g.stroke();
          g.beginPath(); g.arc(x, y, 5, 0, Math.PI * 2); g.fill();
        }
        break;
      }
      case 'Pinstripe':
        sides(g, (c) => {
          c.strokeStyle = contrast; c.lineWidth = 4;
          for (const off of [-8, 4]) { c.beginPath(); c.moveTo(off, 30); c.lineTo(off, 480); c.stroke(); }
          c.strokeStyle = team1; c.beginPath(); c.moveTo(-2, 30); c.bezierCurveTo(30, 10, 60, 40, 40, 70); c.stroke();
        });
        g.strokeStyle = contrast; g.lineWidth = 3;
        g.beginPath(); g.moveTo(236, 20); g.lineTo(236, 180); g.moveTo(276, 20); g.lineTo(276, 180); g.stroke();
        break;
      case 'Galaxy': {
        const grd = g.createLinearGradient(0, 0, 512, 512);
        grd.addColorStop(0, '#120a3a'); grd.addColorStop(0.5, '#2a0f5e'); grd.addColorStop(1, '#06183d');
        g.fillStyle = grd; g.fillRect(0, 0, 512, 512);
        for (let k = 0; k < 14; k++) {
          const x = rnd() * 512, y = rnd() * 512, r = 40 + rnd() * 90;
          const n = g.createRadialGradient(x, y, 0, x, y, r);
          n.addColorStop(0, `hsla(${200 + rnd() * 120},90%,60%,0.35)`); n.addColorStop(1, 'rgba(0,0,0,0)');
          g.fillStyle = n; g.fillRect(x - r, y - r, r * 2, r * 2);
        }
        for (let k = 0; k < 500; k++) { g.fillStyle = `rgba(255,255,255,${0.3 + rnd() * 0.7})`; g.fillRect(rnd() * 512, rnd() * 512, rnd() < 0.1 ? 3 : 1.5, rnd() < 0.1 ? 3 : 1.5); }
        break;
      }
      default: break;
    }
    // subtle panel lines so even plain paint has some detail
    g.strokeStyle = 'rgba(0,0,0,0.18)'; g.lineWidth = 2;
    for (const y of [150, 330]) { g.beginPath(); g.moveTo(60, y); g.lineTo(200, y); g.moveTo(312, y); g.lineTo(452, y); g.stroke(); }
  });
}

// ---------- paint finishes ----------
function paintMaterial(finish, quality, map) {
  const nice = quality !== 'low';
  const name = ITEMS.finish[finish]?.name || 'Gloss';
  if (!nice) {
    const p = { Gloss: [0.28, 0.55], Matte: [0.85, 0.05], Satin: [0.5, 0.4], Pearl: [0.3, 0.45], Chrome: [0.08, 1] }[name];
    return new THREE.MeshStandardMaterial({ map, roughness: p[0], metalness: p[1], envMapIntensity: 1.4 });
  }
  const m = new THREE.MeshPhysicalMaterial({ map, color: 0xffffff });
  switch (name) {
    case 'Matte': Object.assign(m, { roughness: 0.82, metalness: 0.05, clearcoat: 0, envMapIntensity: 0.6 }); break;
    case 'Satin': Object.assign(m, { roughness: 0.48, metalness: 0.45, clearcoat: 0.35, clearcoatRoughness: 0.35, envMapIntensity: 1.1 }); break;
    case 'Pearl': Object.assign(m, { roughness: 0.25, metalness: 0.35, clearcoat: 1, clearcoatRoughness: 0.04, iridescence: 1, iridescenceIOR: 1.6, iridescenceThicknessRange: [200, 600], envMapIntensity: 1.5 }); break;
    case 'Chrome': Object.assign(m, { roughness: 0.06, metalness: 1, clearcoat: 1, clearcoatRoughness: 0.0, envMapIntensity: 2.2 }); break;
    default:
      Object.assign(m, { roughness: 0.28, metalness: 0.58, clearcoat: 1, clearcoatRoughness: 0.025, envMapIntensity: 1.6 });
      m.normalMap = flakeNormal(); m.normalScale = new THREE.Vector2(0.16, 0.16);
      if (quality === 'high') { m.iridescence = 0.1; m.iridescenceIOR = 1.4; }
  }
  return m;
}

// ---------- toppers ----------
function buildTopper(index, tc) {
  const name = ITEMS.topper[index]?.name;
  if (!name || name === 'None') return null;
  const g = new THREE.Group();
  const std = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.35, metalness: 0.2, ...extra });
  let spinner = null;
  switch (name) {
    case 'Crown': {
      const gold = std(0xffc53a, { metalness: 1, roughness: 0.2, envMapIntensity: 1.8 });
      const band = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.12, 0.07, 20, 1, true), gold);
      band.material.side = THREE.DoubleSide;
      g.add(band);
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        const spike = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.09, 6), gold);
        spike.position.set(Math.sin(a) * 0.12, 0.08, Math.cos(a) * 0.12);
        g.add(spike);
        const gem = new THREE.Mesh(new THREE.SphereGeometry(0.016, 8, 6), new THREE.MeshBasicMaterial({ color: i % 2 ? 0xff2a5a : 0x3ad7ff }));
        gem.position.set(Math.sin(a) * 0.127, 0.0, Math.cos(a) * 0.127);
        g.add(gem);
      }
      break;
    }
    case 'Traffic Cone': {
      const cone = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.28, 16), std(0xff6a1a));
      cone.position.y = 0.16;
      g.add(cone);
      const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.062, 0.072, 0.05, 16), std(0xf6f6f6));
      ring.position.y = 0.15;
      g.add(ring);
      const base = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.025, 0.22), std(0xff6a1a));
      base.position.y = 0.012;
      g.add(base);
      break;
    }
    case 'Halo': {
      const halo = new THREE.Mesh(new THREE.TorusGeometry(0.14, 0.02, 8, 32), new THREE.MeshBasicMaterial({ color: 0xfff1a0 }));
      halo.rotation.x = Math.PI / 2;
      halo.position.y = 0.26;
      g.add(halo);
      const gl = new THREE.Sprite(new THREE.SpriteMaterial({ map: radialTex(), color: 0xffe68a, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false }));
      gl.scale.set(0.6, 0.3, 1); gl.position.y = 0.26;
      g.add(gl);
      break;
    }
    case 'Horns': {
      for (const sx of [-1, 1]) {
        const horn = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.22, 10), std(0xf1e6cf));
        horn.position.set(sx * 0.13, 0.1, 0.05);
        horn.rotation.z = -sx * 0.6;
        horn.rotation.x = -0.25;
        g.add(horn);
      }
      break;
    }
    case 'Propeller Cap': {
      const cap = new THREE.Mesh(new THREE.SphereGeometry(0.12, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), std(tc.main));
      g.add(cap);
      const brim = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.012, 0.12), std(tc.dark));
      brim.position.set(0, 0.005, 0.15);
      g.add(brim);
      spinner = new THREE.Group();
      spinner.position.y = 0.14;
      const blade = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.008, 0.05), std(0xffd23a));
      spinner.add(blade);
      const hub = new THREE.Mesh(new THREE.SphereGeometry(0.02, 8, 6), std(0xff3a3a));
      spinner.add(hub);
      g.add(spinner);
      break;
    }
    case 'Shark Fin': {
      const sh = new THREE.Shape();
      sh.moveTo(-0.15, 0); sh.quadraticCurveTo(0.0, 0.05, 0.09, 0.26); sh.quadraticCurveTo(0.04, 0.08, 0.15, 0); sh.closePath();
      const fin = new THREE.Mesh(new THREE.ExtrudeGeometry(sh, { depth: 0.03, bevelEnabled: false }), std(0x6d7c8f));
      fin.rotation.y = -Math.PI / 2;
      fin.position.x = 0.015;
      g.add(fin);
      break;
    }
    case 'Party Hat': {
      const tex = canvasTex('partyhat', 64, 64, (c) => {
        for (let i = 0; i < 8; i++) { c.fillStyle = ['#ff4fa8', '#ffd23a', '#3ad7ff', '#7dff6e'][i % 4]; c.fillRect(0, i * 8, 64, 8); }
      });
      const hat = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.26, 16), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.5 }));
      hat.position.y = 0.13;
      hat.rotation.z = 0.15;
      g.add(hat);
      const pom = new THREE.Mesh(new THREE.SphereGeometry(0.035, 10, 8), std(0xffffff));
      pom.position.set(-0.035, 0.26, 0);
      g.add(pom);
      break;
    }
    default: return null;
  }
  return { group: g, spinner };
}

// ---------- the car ----------
export function buildCarMesh(team, look = {}, quality = 'high') {
  look = { ...defaultLook(), ...look };
  const type = BODY_TYPES[(look.body | 0) % BODY_TYPES.length];
  const tc = TEAM_COLORS[team];
  const nice = quality !== 'low';
  const root = new THREE.Group();
  const model = new THREE.Group();
  root.add(model);

  const paintItem = ITEMS.paint[look.paint | 0] || ITEMS.paint[0];
  const paintHex = paintItem.color != null ? paintItem.color : tc.main;
  const bodyMat = paintMaterial(look.finish | 0, quality, liveryTexture(look.livery | 0, paintHex, team, look.number ?? 7));
  const trimMat = new THREE.MeshStandardMaterial({ color: 0x17191e, roughness: 0.45, metalness: 0.4 });
  const carbonMat = nice
    ? new THREE.MeshPhysicalMaterial({ color: 0xffffff, map: carbonTexture(), roughness: 0.4, metalness: 0.3, clearcoat: 0.8, clearcoatRoughness: 0.08 })
    : new THREE.MeshStandardMaterial({ color: 0x0f1013, roughness: 0.35, metalness: 0.6 });
  const glassMat = new THREE.MeshPhysicalMaterial({ color: 0x0a101c, roughness: 0.03, metalness: 0.35, clearcoat: 1, clearcoatRoughness: 0.0, envMapIntensity: 2.2 });
  const accentMat = new THREE.MeshBasicMaterial({ color: tc.glow });
  const wheelItem = ITEMS.wheel[(look.wheel | 0) % ITEMS.wheel.length];
  const rimMat = new THREE.MeshStandardMaterial({ color: wheelItem.rim, roughness: 0.14, metalness: 1.0, envMapIntensity: 1.8 });

  const rings = nice ? 44 : 26, seg = nice ? 40 : 24;
  const body = new THREE.Mesh(loft(type.body, { rings, seg, taper: 0.14 }), bodyMat);
  model.add(body);
  const cabin = new THREE.Mesh(loft(type.cabin, { rings: Math.round(rings * 0.6), seg, taper: 0.28 }), glassMat);
  model.add(cabin);
  // roof panel in body paint over the top of the glass
  const roof = new THREE.Mesh(loft(type.cabin, { rings: Math.round(rings * 0.6), seg: Math.round(seg / 2), taper: 0.28, phi0: 0.39, phi1: 0.61, caps: false, grow: 0.006 }), bodyMat);
  model.add(roof);

  const at = (z) => sample(type.body, z);
  const roofTop = Math.max(...type.cabin.map(s => s[3]));
  const roofZ = type.cabin.reduce((a, s) => (s[3] > a[1] ? [s[0], s[3]] : a), [0, -1])[0];
  const front = type.body[type.body.length - 1][0], rear = type.body[0][0];

  // fender flares framing the wheels
  const archGeo = new THREE.TorusGeometry(0.235, 0.035, 6, 18, Math.PI);
  archGeo.rotateY(Math.PI / 2);
  for (const sz of [-1, 1]) for (const sx of [-1, 1]) {
    const s = at(sz * 0.46);
    const arch = new THREE.Mesh(archGeo, carbonMat);
    arch.position.set(sx * (s[1] - 0.005), -0.18, sz * 0.46);
    model.add(arch);
  }
  // side skirts with team glow
  for (const sx of [-1, 1]) {
    const s = at(0);
    const skirt = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.035, 0.5), accentMat);
    skirt.position.set(sx * (s[1] - 0.02), s[2] + 0.01, 0);
    model.add(skirt);
  }
  // front: splitter, intake and lights
  const fs = at(front - 0.08);
  const splitter = new THREE.Mesh(new THREE.BoxGeometry(fs[1] * 2.05, 0.025, 0.14), carbonMat);
  splitter.position.set(0, fs[2] - 0.01, front - 0.05);
  model.add(splitter);
  const grille = new THREE.Mesh(new THREE.BoxGeometry(fs[1] * 0.9, 0.06, 0.03), trimMat);
  grille.position.set(0, fs[2] + 0.05, front - 0.01);
  model.add(grille);
  const headMat = new THREE.MeshBasicMaterial({ color: 0xf2f9ff });
  const tailMat = new THREE.MeshBasicMaterial({ color: 0xff2238 });
  const glowFront = new THREE.SpriteMaterial({ map: radialTex(), color: 0xcfe6ff, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.8 });
  const glowRear = new THREE.SpriteMaterial({ map: radialTex(), color: 0xff3045, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.7 });
  const hz = front - 0.1, hs = at(hz), hy = (hs[2] + hs[3]) / 2 + 0.02;
  const rz = rear + 0.06, rs = at(rz), ry = (rs[2] + rs[3]) / 2 + 0.03;
  for (const sx of [-1, 1]) {
    const h = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.035, 0.05), headMat);
    h.position.set(sx * hs[1] * 0.6, hy, hz + 0.035);
    h.rotation.y = sx * -0.25;
    model.add(h);
    const hg = new THREE.Sprite(glowFront);
    hg.scale.set(0.35, 0.22, 1); hg.position.set(sx * hs[1] * 0.6, hy, hz + 0.09);
    model.add(hg);
    const t = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.04, 0.04), tailMat);
    t.position.set(sx * rs[1] * 0.62, ry, rz - 0.04);
    model.add(t);
    const tg = new THREE.Sprite(glowRear);
    tg.scale.set(0.3, 0.18, 1); tg.position.set(sx * rs[1] * 0.62, ry, rz - 0.08);
    model.add(tg);
  }
  // rear diffuser + exhausts
  const diffuser = new THREE.Mesh(new THREE.BoxGeometry(rs[1] * 1.7, 0.05, 0.1), carbonMat);
  diffuser.position.set(0, rs[2] + 0.01, rz - 0.02);
  model.add(diffuser);
  const exGeo = new THREE.CylinderGeometry(0.045, 0.055, 0.1, 12, 1, true);
  exGeo.rotateX(Math.PI / 2);
  const exMat = new THREE.MeshStandardMaterial({ color: 0xc4cad4, roughness: 0.1, metalness: 1.0, envMapIntensity: 2, side: THREE.DoubleSide });
  for (const sx of [-1, 1]) {
    const ex = new THREE.Mesh(exGeo, exMat);
    ex.position.set(sx * 0.16, rs[2] + 0.06, rz - 0.06);
    model.add(ex);
  }
  // mirrors
  const cs = sample(type.cabin, type.cabin[type.cabin.length - 1][0] - 0.06);
  for (const sx of [-1, 1]) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.04, 0.05), bodyMat);
    m.position.set(sx * (cs[1] + 0.06), cs[2] + 0.06, cs[0]);
    model.add(m);
  }

  // spoilers & roof parts
  const sp = type.spoiler || {};
  if (sp.type === 'wing' || sp.type === 'roof') {
    const wing = new THREE.Mesh(new THREE.BoxGeometry(sp.w, 0.03, sp.d), carbonMat);
    wing.position.set(0, sp.y, sp.z);
    wing.rotation.x = -0.12;
    model.add(wing);
    if (sp.type === 'wing') {
      for (const sx of [-1, 1]) {
        const strut = new THREE.Mesh(new THREE.BoxGeometry(0.03, sp.y - 0.06, 0.06), trimMat);
        strut.position.set(sx * sp.w * 0.3, (sp.y + 0.06) / 2, sp.z + 0.02);
        model.add(strut);
        const plate = new THREE.Mesh(new THREE.BoxGeometry(0.015, 0.1, sp.d + 0.04), bodyMat);
        plate.position.set(sx * sp.w / 2, sp.y + 0.01, sp.z);
        model.add(plate);
      }
    }
    const lip = new THREE.Mesh(new THREE.BoxGeometry(sp.w, 0.012, 0.02), accentMat);
    lip.position.set(0, sp.y + 0.02, sp.z - sp.d / 2);
    model.add(lip);
  } else if (sp.type === 'lip') {
    const lip = new THREE.Mesh(new THREE.BoxGeometry(sp.w, 0.04, sp.d), bodyMat);
    lip.position.set(0, sp.y, sp.z);
    lip.rotation.x = 0.3;
    model.add(lip);
  } else if (sp.type === 'lightbar') {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.045, 0.07), trimMat);
    bar.position.set(0, roofTop + 0.05, roofZ + 0.12);
    model.add(bar);
    for (let i = -2; i <= 2; i++) {
      const l = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.03, 0.02), headMat);
      l.position.set(i * 0.11, roofTop + 0.05, roofZ + 0.16);
      model.add(l);
    }
  } else if (sp.type === 'fins') {
    for (const sx of [-1, 1]) {
      const sh = new THREE.Shape();
      sh.moveTo(0, 0); sh.lineTo(-0.22, 0); sh.lineTo(-0.3, 0.16); sh.closePath();
      const fin = new THREE.Mesh(new THREE.ExtrudeGeometry(sh, { depth: 0.02, bevelEnabled: false }), bodyMat);
      fin.rotation.y = -Math.PI / 2;
      fin.position.set(sx * 0.3 - 0.01, at(-0.6)[3] - 0.02, -0.5);
      model.add(fin);
    }
  }

  // antenna (skipped when a topper sits on the roof)
  const topper = buildTopper(look.topper | 0, tc);
  if (topper) {
    topper.group.position.set(0, roofTop + 0.01, roofZ);
    model.add(topper.group);
  } else {
    const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.35, 4), trimMat);
    ant.position.set(-0.18, roofTop + 0.16, roofZ - 0.12);
    model.add(ant);
    const ball = new THREE.Mesh(new THREE.SphereGeometry(0.035, 10, 8), accentMat);
    ball.position.set(-0.18, roofTop + 0.34, roofZ - 0.12);
    model.add(ball);
  }

  // wheels
  const wheels = [];
  for (const [sx, sz] of [[-1, 1], [1, 1], [-1, -1], [1, -1]]) {
    const s = at(sz * 0.46);
    const pivot = new THREE.Group();
    pivot.position.set(sx * (s[1] - 0.04), -0.18, sz * 0.46);
    const spin = buildWheel(wheelItem.style, rimMat, accentMat, carbonMat, sx);
    pivot.add(spin);
    model.add(pivot);
    wheels.push({ pivot, spin, front: sz > 0 });
  }

  // boost flames
  const boost = ITEMS.boost[(look.boost | 0) % ITEMS.boost.length];
  const outerColor = boost.outer ?? tc.glow;
  const coreRGB = boost.core ?? new THREE.Color(tc.glow).lerp(new THREE.Color(0xffffff), 0.5).toArray();
  const flameGeo = new THREE.ConeGeometry(0.11, 0.9, 14, 1, true);
  flameGeo.translate(0, 0.45, 0);
  flameGeo.rotateX(-Math.PI / 2);
  const flameMat = new THREE.MeshBasicMaterial({ map: flameTex(), color: new THREE.Color().fromArray(coreRGB), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  const outerMat = flameMat.clone();
  outerMat.color = new THREE.Color(outerColor);
  outerMat.opacity = 0.6;
  const flames = new THREE.Group();
  for (const sx of [-1, 1]) {
    const f = new THREE.Mesh(flameGeo, flameMat);
    f.position.set(sx * 0.16, rs[2] + 0.06, rz - 0.1);
    flames.add(f);
    const o = new THREE.Mesh(flameGeo, outerMat);
    o.scale.set(1.7, 1.7, 1.35);
    o.position.copy(f.position);
    flames.add(o);
  }
  const flare = new THREE.Sprite(new THREE.SpriteMaterial({ map: radialTex(), color: outerColor, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
  flare.scale.set(0.9, 0.6, 1);
  flare.position.set(0, rs[2] + 0.06, rz - 0.12);
  flames.add(flare);
  flames.visible = false;
  model.add(flames);
  const oc = new THREE.Color(outerColor);
  const boostRGB = [oc.r * 0.6 + 0.4, oc.g * 0.6 + 0.4, oc.b * 0.6 + 0.4];

  // underglow
  const glow = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 2.2), new THREE.MeshBasicMaterial({
    map: radialTex(), color: tc.glow, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  glow.rotation.x = -Math.PI / 2;
  glow.position.y = -0.35;
  model.add(glow);

  root.traverse(o => {
    if (o.isMesh) {
      o.castShadow = o.material && !o.material.isMeshBasicMaterial;
      o.receiveShadow = false;
    }
  });

  // performance: bake all static parts into one mesh per material
  const skip = new Set([flames, glow, ...wheels.map(w => w.pivot)]);
  if (topper && topper.spinner) skip.add(topper.spinner);
  mergeStatic(model, skip);
  for (const w of wheels) mergeStatic(w.spin, new Set());
  if (!nice) model.children.filter(o => o.isSprite).forEach(o => model.remove(o));

  return { root, model, wheels, flames, bodyMat, glow, boostRGB, spinner: topper ? topper.spinner : null, look };
}

// ---------- small previews for menus ----------
const thumbCache = new Map();
export function liveryThumb(livery, paintHex, team) {
  const key = `${livery}:${paintHex}:${team}`;
  if (thumbCache.has(key)) return thumbCache.get(key);
  const src = liveryTexture(livery, paintHex, team, 7).image;
  const c = document.createElement('canvas');
  c.width = 96; c.height = 64;
  const g = c.getContext('2d');
  // show the left flank and the roof strip: a recognisable crop of the texture
  g.drawImage(src, 64, 0, 256, 512, 0, 0, 96, 64);
  const url = c.toDataURL();
  thumbCache.set(key, url);
  return url;
}

// side silhouette of a body as an SVG path (for menu icons)
export function bodySilhouette(index) {
  const t = BODY_TYPES[index % BODY_TYPES.length];
  const pts = [];
  const z0 = t.body[0][0], z1 = t.body[t.body.length - 1][0];
  const X = (z) => 6 + ((z - z0) / (z1 - z0)) * 88, Y = (y) => 36 - y * 60;
  for (let i = 0; i <= 24; i++) {
    const z = z0 + (z1 - z0) * (i / 24);
    const s = sample(t.body, z);
    let top = s[3];
    const c = t.cabin;
    if (z >= c[0][0] && z <= c[c.length - 1][0]) top = Math.max(top, sample(c, z)[3]);
    pts.push(`${X(z).toFixed(1)},${Y(top).toFixed(1)}`);
  }
  for (let i = 24; i >= 0; i--) {
    const z = z0 + (z1 - z0) * (i / 24);
    pts.push(`${X(z).toFixed(1)},${Y(sample(t.body, z)[2]).toFixed(1)}`);
  }
  const wheels = [-0.46, 0.46].map(z => `<circle cx="${X(z).toFixed(1)}" cy="${Y(-0.18).toFixed(1)}" r="12" fill="#14161b" stroke="#c9ced8" stroke-width="3"/>`).join('');
  return `<svg viewBox="0 0 100 60" class="sil"><polygon points="${pts.join(' ')}" fill="currentColor"/>${wheels}</svg>`;
}
