// Procedural detail textures (normal maps etc.), generated once and cached.
import * as THREE from '../vendor/three.module.min.js';

const cache = new Map();

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

// tileable value noise
function noiseField(size, cells, seed = 1) {
  let s = seed * 9301 + 49297;
  const rnd = () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
  const grid = [];
  for (let i = 0; i < cells * cells; i++) grid.push(rnd());
  const at = (x, y) => grid[((y % cells) + cells) % cells * cells + (((x % cells) + cells) % cells)];
  const out = new Float32Array(size * size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const fx = (x / size) * cells, fy = (y / size) * cells;
    const x0 = Math.floor(fx), y0 = Math.floor(fy);
    const tx = fx - x0, ty = fy - y0;
    const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
    const a = at(x0, y0), b = at(x0 + 1, y0), c = at(x0, y0 + 1), d = at(x0 + 1, y0 + 1);
    out[y * size + x] = (a + (b - a) * sx) * (1 - sy) + (c + (d - c) * sx) * sy;
  }
  return out;
}

// turn a height field into a tangent-space normal map
function heightToNormal(h, size, strength) {
  const c = makeCanvas(size, size);
  const g = c.getContext('2d');
  const img = g.createImageData(size, size);
  const H = (x, y) => h[((y + size) % size) * size + ((x + size) % size)];
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const dx = (H(x + 1, y) - H(x - 1, y)) * strength;
    const dy = (H(x, y + 1) - H(x, y - 1)) * strength;
    const l = Math.hypot(dx, dy, 1);
    const i = (y * size + x) * 4;
    img.data[i] = ((-dx / l) * 0.5 + 0.5) * 255;
    img.data[i + 1] = ((-dy / l) * 0.5 + 0.5) * 255;
    img.data[i + 2] = ((1 / l) * 0.5 + 0.5) * 255;
    img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

function cached(key, make) {
  if (!cache.has(key)) cache.set(key, make());
  return cache.get(key);
}

// fine grass: many short blades + clumps
export function grassNormal() {
  return cached('grass', () => {
    const size = 256;
    const h = noiseField(size, 16, 3);
    const fine = noiseField(size, 64, 7);
    for (let i = 0; i < h.length; i++) h[i] = h[i] * 0.4 + fine[i] * 0.6;
    // blade streaks
    let s = 17;
    const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
    for (let k = 0; k < 2600; k++) {
      const x = (rnd() * size) | 0, y = (rnd() * size) | 0, len = 2 + ((rnd() * 4) | 0), v = 0.4 + rnd() * 0.6;
      for (let j = 0; j < len; j++) h[((y - j + size) % size) * size + x] += v * (1 - j / len);
    }
    return heightToNormal(h, size, 1.6);
  });
}

// soft bumps for snow / sand
export function softNormal() {
  return cached('soft', () => {
    const size = 256;
    const a = noiseField(size, 8, 11), b = noiseField(size, 32, 5);
    for (let i = 0; i < a.length; i++) a[i] = a[i] * 0.7 + b[i] * 0.3;
    return heightToNormal(a, size, 2.2);
  });
}

// brushed / plated metal
export function metalNormal() {
  return cached('metal', () => {
    const size = 256;
    const h = new Float32Array(size * size);
    const n = noiseField(size, 128, 23);
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const plate = (x % 64 < 2 || y % 64 < 2) ? -1.5 : 0;
      h[y * size + x] = n[y * size + x] * 0.25 + plate + Math.sin(y * 0.9) * 0.05;
    }
    return heightToNormal(h, size, 1.2);
  });
}

// metallic paint flakes: fine random sparkle under the clear coat
export function flakeNormal() {
  return cached('flake', () => {
    const size = 128;
    const c = makeCanvas(size, size);
    const g = c.getContext('2d');
    const img = g.createImageData(size, size);
    for (let i = 0; i < size * size; i++) {
      const dx = (Math.random() - 0.5) * 0.6, dy = (Math.random() - 0.5) * 0.6;
      const l = Math.hypot(dx, dy, 1);
      img.data[i * 4] = ((dx / l) * 0.5 + 0.5) * 255;
      img.data[i * 4 + 1] = ((dy / l) * 0.5 + 0.5) * 255;
      img.data[i * 4 + 2] = ((1 / l) * 0.5 + 0.5) * 255;
      img.data[i * 4 + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(6, 6);
    return t;
  });
}

// tyre: tread blocks around the circumference, lettering-like ribs on the wall
export function tireTexture() {
  return cached('tire', () => {
    const c = makeCanvas(256, 64);
    const g = c.getContext('2d');
    g.fillStyle = '#16171b';
    g.fillRect(0, 0, 256, 64);
    for (let x = 0; x < 256; x += 8) {
      g.fillStyle = '#0b0b0e';
      g.fillRect(x, 6, 4, 22);
      g.fillRect(x + 4, 36, 4, 22);
    }
    g.fillStyle = 'rgba(255,255,255,0.05)';
    g.fillRect(0, 30, 256, 4);
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  });
}

// carbon-fibre weave for trim parts
export function carbonTexture() {
  return cached('carbon', () => {
    const c = makeCanvas(64, 64);
    const g = c.getContext('2d');
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
      const v = (x + y) % 2 ? 26 : 14;
      const grd = (x + y) % 2 ? g.createLinearGradient(x * 8, 0, x * 8 + 8, 0) : g.createLinearGradient(0, y * 8, 0, y * 8 + 8);
      grd.addColorStop(0, `rgb(${v},${v},${v + 4})`);
      grd.addColorStop(0.5, `rgb(${v + 22},${v + 22},${v + 28})`);
      grd.addColorStop(1, `rgb(${v},${v},${v + 4})`);
      g.fillStyle = grd;
      g.fillRect(x * 8, y * 8, 8, 8);
    }
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(4, 4);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  });
}
