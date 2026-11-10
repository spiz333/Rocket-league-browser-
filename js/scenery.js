// Scenery around the arena (per map), sky decorations and weather.
import * as THREE from '../vendor/three.module.min.js';
import { ARENA } from './config.js';

const { W, L } = ARENA;
const rand = (a, b) => a + Math.random() * (b - a);

function ringPos(minR, maxR, avoidStands = 40) {
  // random point in an elliptical ring around the stadium
  for (let i = 0; i < 20; i++) {
    const a = Math.random() * Math.PI * 2;
    const r = rand(minR, maxR);
    const x = Math.sin(a) * r * 1.0, z = Math.cos(a) * r * 1.18;
    if (Math.abs(x) < W + avoidStands && Math.abs(z) < L + avoidStands) continue;
    return [x, z];
  }
  return [maxR, 0];
}

function instanced(geo, mat, n, place) {
  const m = new THREE.InstancedMesh(geo, mat, n);
  const o = new THREE.Object3D();
  for (let i = 0; i < n; i++) {
    place(o, i);
    o.updateMatrix();
    m.setMatrixAt(i, o.matrix);
  }
  m.instanceMatrix.needsUpdate = true;
  return m;
}

function softTex(size = 128, inner = 0.0) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(size / 2, size / 2, size * inner, size / 2, size / 2, size / 2);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.5, 'rgba(255,255,255,0.55)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(c);
}

function windowTex() {
  const c = document.createElement('canvas');
  c.width = 64; c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#0b0c14';
  g.fillRect(0, 0, 64, 128);
  const cols = ['#ffd88a', '#9fd8ff', '#ff9ad8', '#fff1c8'];
  for (let y = 4; y < 128; y += 8) for (let x = 4; x < 64; x += 8) {
    if (Math.random() < 0.42) {
      g.fillStyle = cols[(Math.random() * cols.length) | 0];
      g.globalAlpha = 0.5 + Math.random() * 0.5;
      g.fillRect(x, y, 4, 5);
    }
  }
  g.globalAlpha = 1;
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function buildScenery(group, T, quality) {
  const nice = quality !== 'low';
  const updaters = [];
  const flat = (color, opts = {}) => new THREE.MeshLambertMaterial({ color, flatShading: true, ...opts });

  // ---------- clouds ----------
  if (T.sky.clouds) {
    const tex = softTex(128);
    const mat = new THREE.SpriteMaterial({ map: tex, color: T.sky.overcast ? 0xe8eef6 : 0xffffff, transparent: true, depthWrite: false, opacity: T.sky.overcast ? 0.9 : 0.85, fog: false });
    for (let i = 0; i < T.sky.clouds; i++) {
      const cluster = new THREE.Group();
      const a = Math.random() * Math.PI * 2, r = rand(220, 340);
      cluster.position.set(Math.sin(a) * r, rand(70, 150), Math.cos(a) * r);
      const n = 4 + ((Math.random() * 4) | 0);
      for (let k = 0; k < n; k++) {
        const s = new THREE.Sprite(mat);
        const sc = rand(40, 80);
        s.scale.set(sc * 1.6, sc, 1);
        s.position.set(rand(-40, 40), rand(-6, 8), rand(-20, 20));
        cluster.add(s);
      }
      group.add(cluster);
      updaters.push((dt) => { cluster.position.x += dt * 1.5; if (cluster.position.x > 380) cluster.position.x = -380; });
    }
  }

  // ---------- planet (space map) ----------
  if (T.sky.planet) {
    const planetMat = new THREE.ShaderMaterial({
      fog: false,
      uniforms: { light: { value: new THREE.Vector3(0.7, 0.35, -0.6).normalize() } },
      vertexShader: `varying vec3 vN; varying vec3 vP; void main(){ vN = normalize(mat3(modelMatrix) * normal); vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `uniform vec3 light; varying vec3 vN; varying vec3 vP;
        void main(){
          float d = max(0.0, dot(vN, light));
          float bands = sin(vP.y * 0.09 + sin(vP.x * 0.02) * 2.0) * 0.5 + 0.5;
          vec3 base = mix(vec3(0.85,0.45,0.25), vec3(0.98,0.8,0.55), bands);
          vec3 c = base * (0.08 + d * 1.1);
          float rim = pow(1.0 - abs(dot(vN, vec3(0.0,0.0,1.0))), 3.0);
          c += vec3(0.4,0.6,1.0) * rim * 0.25;
          gl_FragColor = vec4(c, 1.0);
        }`,
    });
    const planet = new THREE.Mesh(new THREE.SphereGeometry(120, 48, 32), planetMat);
    planet.position.set(-220, 90, 330);
    group.add(planet);
    const ring = new THREE.Mesh(new THREE.RingGeometry(150, 220, 96), new THREE.MeshBasicMaterial({ color: 0xd8c4a0, transparent: true, opacity: 0.35, side: THREE.DoubleSide, fog: false }));
    ring.position.copy(planet.position);
    ring.rotation.set(1.2, 0.3, 0.2);
    group.add(ring);
    // floating rocks
    const rockGeo = new THREE.IcosahedronGeometry(1, 0);
    const rocks = instanced(rockGeo, flat(0x5a5f6e), 70, (o) => {
      const [x, z] = ringPos(90, 260, 30);
      o.position.set(x, rand(-40, 70), z);
      o.rotation.set(rand(0, 6), rand(0, 6), rand(0, 6));
      o.scale.setScalar(rand(1.5, 7));
    });
    group.add(rocks);
    updaters.push((dt) => { rocks.rotation.y += dt * 0.01; });
    // platform under the arena
    const plat = new THREE.Mesh(new THREE.CylinderGeometry(95, 70, 18, 48), new THREE.MeshStandardMaterial({ color: 0x1a2030, metalness: 0.7, roughness: 0.4 }));
    plat.scale.z = 1.15;
    plat.position.y = -9.2;
    group.add(plat);
    const lights = new THREE.Mesh(new THREE.TorusGeometry(95, 0.6, 6, 96), new THREE.MeshBasicMaterial({ color: 0x59f3ff }));
    lights.rotation.x = Math.PI / 2;
    lights.scale.y = 1.15;
    lights.position.y = -0.4;
    group.add(lights);
  }

  // ---------- props ----------
  switch (T.props) {
    case 'trees': {
      const trunk = new THREE.CylinderGeometry(0.6, 0.9, 6, 6);
      trunk.translate(0, 3, 0);
      const crown = new THREE.IcosahedronGeometry(5, 0);
      crown.translate(0, 9, 0);
      const n = nice ? 140 : 70;
      const places = [];
      for (let i = 0; i < n; i++) places.push([...ringPos(78, 190, 38), rand(0.7, 1.5)]);
      group.add(instanced(trunk, flat(0x5a3d26), n, (o, i) => { o.position.set(places[i][0], 0, places[i][1]); o.scale.setScalar(places[i][2]); }));
      const cols = [0x3f8a37, 0x4f9a3a, 0x356f2e];
      for (let c = 0; c < 3; c++) {
        const idx = places.filter((_, i) => i % 3 === c);
        group.add(instanced(crown, flat(cols[c]), idx.length, (o, i) => { o.position.set(idx[i][0], 0, idx[i][1]); o.scale.set(idx[i][2], idx[i][2] * rand(0.9, 1.2), idx[i][2]); o.rotation.y = rand(0, 6); }));
      }
      // rolling hills
      const hill = new THREE.SphereGeometry(1, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2);
      group.add(instanced(hill, flat(0x5f8f45), 14, (o, i) => {
        const a = (i / 14) * Math.PI * 2 + rand(-0.1, 0.1), r = rand(300, 380);
        o.position.set(Math.sin(a) * r, -2, Math.cos(a) * r);
        o.scale.set(rand(70, 130), rand(25, 55), rand(60, 110));
      }));
      break;
    }
    case 'pines': {
      const n = nice ? 170 : 90;
      const places = [];
      for (let i = 0; i < n; i++) places.push([...ringPos(75, 200, 38), rand(0.8, 1.6)]);
      const trunk = new THREE.CylinderGeometry(0.4, 0.6, 3, 5); trunk.translate(0, 1.5, 0);
      group.add(instanced(trunk, flat(0x4a3424), n, (o, i) => { o.position.set(places[i][0], 0, places[i][1]); o.scale.setScalar(places[i][2]); }));
      for (let layer = 0; layer < 3; layer++) {
        const cone = new THREE.ConeGeometry(4.2 - layer * 1.1, 5, 7);
        cone.translate(0, 4.5 + layer * 3, 0);
        group.add(instanced(cone, flat(layer === 2 ? 0xe8eef4 : 0x2c5a40), n, (o, i) => { o.position.set(places[i][0], 0, places[i][1]); o.scale.setScalar(places[i][2]); }));
      }
      // snowy mountains
      const mount = new THREE.ConeGeometry(1, 1, 7, 1);
      mount.translate(0, 0.5, 0);
      const mpos = [];
      for (let i = 0; i < 16; i++) { const a = (i / 16) * Math.PI * 2 + rand(-0.15, 0.15); mpos.push([Math.sin(a) * rand(330, 400), Math.cos(a) * rand(330, 400), rand(90, 170), rand(70, 130)]); }
      group.add(instanced(mount, flat(0x6d7f95), 16, (o, i) => { o.position.set(mpos[i][0], -5, mpos[i][1]); o.scale.set(mpos[i][3], mpos[i][2], mpos[i][3]); o.rotation.y = rand(0, 6); }));
      const cap = new THREE.ConeGeometry(1, 1, 7, 1);
      cap.translate(0, 0.5, 0);
      group.add(instanced(cap, flat(0xf4f8fc), 16, (o, i) => { o.position.set(mpos[i][0], -5 + mpos[i][2] * 0.62, mpos[i][1]); o.scale.set(mpos[i][3] * 0.38, mpos[i][2] * 0.38, mpos[i][3] * 0.38); o.rotation.y = rand(0, 6); }));
      break;
    }
    case 'dunes': {
      const hill = new THREE.SphereGeometry(1, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2);
      group.add(instanced(hill, flat(0xd6a167), 40, (o) => {
        const [x, z] = ringPos(90, 320, 45);
        o.position.set(x, -1, z);
        o.scale.set(rand(25, 60), rand(6, 18), rand(25, 55));
        o.rotation.y = rand(0, 6);
      }));
      // mesas on the horizon
      const mesa = new THREE.CylinderGeometry(0.8, 1, 1, 7);
      mesa.translate(0, 0.5, 0);
      group.add(instanced(mesa, flat(0xa4583a), 12, (o, i) => {
        const a = (i / 12) * Math.PI * 2 + rand(-0.2, 0.2), r = rand(340, 400);
        o.position.set(Math.sin(a) * r, -2, Math.cos(a) * r);
        o.scale.set(rand(25, 55), rand(35, 70), rand(25, 55));
      }));
      // cacti
      const cactus = new THREE.CylinderGeometry(0.7, 0.8, 7, 7); cactus.translate(0, 3.5, 0);
      const arm = new THREE.CylinderGeometry(0.45, 0.5, 3, 6); arm.translate(1.4, 4.5, 0);
      const cpos = []; for (let i = 0; i < 40; i++) cpos.push([...ringPos(72, 170, 36), rand(0.8, 1.4), rand(0, 6)]);
      const green = flat(0x4f7a3a);
      group.add(instanced(cactus, green, 40, (o, i) => { o.position.set(cpos[i][0], 0, cpos[i][1]); o.scale.setScalar(cpos[i][2]); o.rotation.y = cpos[i][3]; }));
      group.add(instanced(arm, green, 40, (o, i) => { o.position.set(cpos[i][0], 0, cpos[i][1]); o.scale.setScalar(cpos[i][2]); o.rotation.y = cpos[i][3]; }));
      break;
    }
    case 'city': {
      const box = new THREE.BoxGeometry(1, 1, 1);
      box.translate(0, 0.5, 0);
      const tex = windowTex();
      const n = nice ? 160 : 90;
      const mat = new THREE.MeshLambertMaterial({ color: 0x9aa0c0, map: tex, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 1.1 });
      group.add(instanced(box, mat, n, (o) => {
        const [x, z] = ringPos(90, 330, 45);
        const h = rand(40, 170);
        o.position.set(x, -90, z);
        o.scale.set(rand(14, 30), h + 90, rand(14, 30));
      }));
      // rooftop the arena sits on
      const roof = new THREE.Mesh(new THREE.BoxGeometry(150, 90, 170), new THREE.MeshStandardMaterial({ color: 0x1c1d26, roughness: 0.6, metalness: 0.4 }));
      roof.position.y = -45.05;
      group.add(roof);
      // blinking antenna lights
      const blink = new THREE.MeshBasicMaterial({ color: 0xff2a3a });
      const lightsGeo = new THREE.SphereGeometry(0.8, 6, 4);
      const ant = instanced(lightsGeo, blink, 30, (o) => { const [x, z] = ringPos(110, 320, 45); o.position.set(x, rand(50, 90), z); });
      group.add(ant);
      updaters.push((dt, t) => { blink.color.setScalar(0); blink.color.r = Math.sin(t * 3) > 0 ? 1 : 0.15; });
      break;
    }
    case 'beach': {
      // ocean with gentle waves
      const seaGeo = new THREE.PlaneGeometry(1600, 1600, 80, 80);
      seaGeo.rotateX(-Math.PI / 2);
      const seaMat = new THREE.ShaderMaterial({
        uniforms: { time: { value: 0 }, deep: { value: new THREE.Color(0x0f5f9a) }, shallow: { value: new THREE.Color(0x35c6d6) }, fogColor: { value: new THREE.Color(T.fog.color) } },
        vertexShader: `uniform float time; varying float vD; varying float vH; varying float vFog;
          void main(){ vec3 p = position; float d = length(p.xz); vD = d;
            p.y += sin(p.x * 0.05 + time * 1.2) * 0.6 + cos(p.z * 0.04 + time * 0.9) * 0.6; vH = p.y;
            vec4 mv = modelViewMatrix * vec4(p, 1.0); vFog = smoothstep(180.0, 620.0, -mv.z);
            gl_Position = projectionMatrix * mv; }`,
        fragmentShader: `uniform vec3 deep; uniform vec3 shallow; uniform vec3 fogColor; varying float vD; varying float vH; varying float vFog;
          void main(){ float s = smoothstep(260.0, 140.0, vD); vec3 c = mix(deep, shallow, s);
            c += vec3(0.9) * smoothstep(0.9, 1.2, vH) * 0.35; c = mix(c, fogColor, vFog); gl_FragColor = vec4(c, 1.0); }`,
      });
      const sea = new THREE.Mesh(seaGeo, seaMat);
      sea.position.y = -1.2;
      group.add(sea);
      updaters.push((dt, t) => { seaMat.uniforms.time.value = t; });
      // sand island
      const island = new THREE.Mesh(new THREE.CylinderGeometry(135, 160, 3, 64), flat(0xe8d29a));
      island.scale.z = 1.15;
      island.position.y = -1.62;
      group.add(island);
      // palm trees
      const n = nice ? 60 : 30;
      const ppos = []; for (let i = 0; i < n; i++) ppos.push([...ringPos(78, 140, 36), rand(0.9, 1.4), rand(0, 6), rand(-0.25, 0.25)]);
      const trunk = new THREE.CylinderGeometry(0.4, 0.7, 12, 6); trunk.translate(0, 6, 0);
      group.add(instanced(trunk, flat(0x8a6a44), n, (o, i) => { o.position.set(ppos[i][0], 0, ppos[i][1]); o.scale.setScalar(ppos[i][2]); o.rotation.set(ppos[i][4], ppos[i][3], ppos[i][4] * 0.5); }));
      const leaf = new THREE.ConeGeometry(1.2, 7, 4, 1);
      leaf.translate(0, 3.5, 0);
      leaf.rotateZ(-1.9);
      leaf.translate(0, 12, 0);
      for (let k = 0; k < 6; k++) {
        group.add(instanced(leaf, flat(k % 2 ? 0x3e9a46 : 0x2f8a3c), n, (o, i) => { o.position.set(ppos[i][0], 0, ppos[i][1]); o.scale.setScalar(ppos[i][2]); o.rotation.set(ppos[i][4], ppos[i][3] + k * Math.PI / 3, ppos[i][4] * 0.5); }));
      }
      break;
    }
    default: break;
  }

  // ---------- weather ----------
  let weather = null;
  if (T.weather) {
    const isSnow = T.weather === 'snow';
    const n = isSnow ? (nice ? 2600 : 1400) : (nice ? 1600 : 900);
    const box = { x: 90, y: 50, z: 100 };
    const posArr = new Float32Array(n * (isSnow ? 3 : 6));
    const seeds = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const x = rand(-box.x, box.x), y = rand(0, box.y), z = rand(-box.z, box.z);
      if (isSnow) { posArr[i * 3] = x; posArr[i * 3 + 1] = y; posArr[i * 3 + 2] = z; }
      else { posArr.set([x, y, z, x - 0.15, y + 1.2, z], i * 6); }
      seeds[i] = Math.random();
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(posArr, 3).setUsage(THREE.DynamicDrawUsage));
    const obj = isSnow
      ? new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xffffff, size: 0.35, map: softTex(32, 0.2), transparent: true, depthWrite: false, opacity: 0.95 }))
      : new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: 0x9fb4d8, transparent: true, opacity: 0.45, depthWrite: false }));
    obj.frustumCulled = false;
    group.add(obj);
    weather = (dt, t) => {
      const a = geo.attributes.position.array;
      if (isSnow) {
        for (let i = 0; i < n; i++) {
          a[i * 3 + 1] -= dt * (1.6 + seeds[i] * 1.4);
          a[i * 3] += Math.sin(t * 0.8 + seeds[i] * 20) * dt * 0.6;
          if (a[i * 3 + 1] < 0) a[i * 3 + 1] += box.y;
        }
      } else {
        for (let i = 0; i < n; i++) {
          const k = i * 6;
          const v = dt * (38 + seeds[i] * 12);
          a[k + 1] -= v; a[k + 4] -= v; a[k] -= v * 0.12; a[k + 3] -= v * 0.12;
          if (a[k + 1] < 0) { const y = box.y; a[k + 1] += y; a[k + 4] += y; a[k] += y * 0.12; a[k + 3] += y * 0.12; }
        }
      }
      geo.attributes.position.needsUpdate = true;
    };
    updaters.push(weather);
  }

  return (dt, t) => { for (const u of updaters) u(dt, t); };
}
