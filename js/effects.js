// Pooled additive particle system + shockwave rings.
import * as THREE from '../vendor/three.module.min.js';

export class Particles {
  constructor(scene, max = 2000) {
    this.max = max;
    this.count = 0;
    this.pos = new Float32Array(max * 3);
    this.vel = new Float32Array(max * 3);
    this.col = new Float32Array(max * 4);
    this.size = new Float32Array(max);
    this.life = new Float32Array(max);
    this.maxLife = new Float32Array(max);
    this.grow = new Float32Array(max);
    this.drag = new Float32Array(max);
    this.grav = new Float32Array(max);
    this.alpha0 = new Float32Array(max);
    this.next = 0;

    const geo = new THREE.BufferGeometry();
    this.posAttr = new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage);
    this.colAttr = new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage);
    this.sizeAttr = new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('position', this.posAttr);
    geo.setAttribute('pcolor', this.colAttr);
    geo.setAttribute('psize', this.sizeAttr);
    this.material = new THREE.ShaderMaterial({
      uniforms: { scale: { value: 500 } },
      vertexShader: `
        attribute vec4 pcolor; attribute float psize;
        uniform float scale;
        varying vec4 vColor;
        void main(){
          vColor = pcolor;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = psize * scale / max(0.1, -mv.z);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        varying vec4 vColor;
        void main(){
          vec2 d = gl_PointCoord - 0.5;
          float r = dot(d, d) * 4.0;
          if (r > 1.0) discard;
          float a = (1.0 - r);
          gl_FragColor = vec4(vColor.rgb, vColor.a * a * a);
        }`,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.points = new THREE.Points(geo, this.material);
    this.points.frustumCulled = false;
    scene.add(this.points);
    for (let i = 0; i < max; i++) this.life[i] = 0;

    this.rings = [];
    this.ringGeo = new THREE.RingGeometry(0.8, 1, 48);
    this.scene = scene;
  }

  setScale(viewportHeight, fov) {
    this.material.uniforms.scale.value = viewportHeight / (2 * Math.tan(THREE.MathUtils.degToRad(fov) / 2));
  }

  spawn(x, y, z, vx, vy, vz, life, size, r, g, b, a = 1, opts) {
    const i = this.next;
    this.next = (this.next + 1) % this.max;
    this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z;
    this.vel[i * 3] = vx; this.vel[i * 3 + 1] = vy; this.vel[i * 3 + 2] = vz;
    this.col[i * 4] = r; this.col[i * 4 + 1] = g; this.col[i * 4 + 2] = b; this.col[i * 4 + 3] = a;
    this.alpha0[i] = a;
    this.size[i] = size;
    this.life[i] = life;
    this.maxLife[i] = life;
    this.grow[i] = opts?.grow ?? 0;
    this.drag[i] = opts?.drag ?? 0;
    this.grav[i] = opts?.grav ?? 0;
  }

  burst(pos, count, speed, color, opts = {}) {
    const c = new THREE.Color(color);
    for (let i = 0; i < count; i++) {
      let x = Math.random() * 2 - 1, y = Math.random() * 2 - 1, z = Math.random() * 2 - 1;
      const l = Math.hypot(x, y, z) || 1;
      const s = speed * (0.3 + Math.random() * 0.7) / l;
      if (opts.up) y = Math.abs(y);
      const mix = opts.whiteMix ? Math.random() * opts.whiteMix : 0;
      this.spawn(pos.x, pos.y, pos.z, x * s, y * s + (opts.lift || 0), z * s,
        (opts.life || 1) * (0.5 + Math.random() * 0.5), (opts.size || 0.5) * (0.6 + Math.random() * 0.8),
        c.r + (1 - c.r) * mix, c.g + (1 - c.g) * mix, c.b + (1 - c.b) * mix, opts.alpha ?? 1,
        { drag: opts.drag ?? 1.5, grav: opts.grav ?? 0, grow: opts.grow ?? 0 });
    }
  }

  ring(pos, normal, color, maxScale = 14, life = 0.7) {
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    const m = new THREE.Mesh(this.ringGeo, mat);
    m.position.copy(pos);
    m.lookAt(pos.clone().add(normal));
    this.scene.add(m);
    this.rings.push({ m, t: 0, life, maxScale });
  }

  update(dt) {
    for (let i = 0; i < this.max; i++) {
      if (this.life[i] <= 0) {
        if (this.col[i * 4 + 3] !== 0) { this.col[i * 4 + 3] = 0; this.size[i] = 0; }
        continue;
      }
      this.life[i] -= dt;
      const k = i * 3;
      const dr = Math.max(0, 1 - this.drag[i] * dt);
      this.vel[k] *= dr; this.vel[k + 1] = this.vel[k + 1] * dr - this.grav[i] * dt; this.vel[k + 2] *= dr;
      this.pos[k] += this.vel[k] * dt; this.pos[k + 1] += this.vel[k + 1] * dt; this.pos[k + 2] += this.vel[k + 2] * dt;
      this.size[i] = Math.max(0, this.size[i] + this.grow[i] * dt);
      const f = Math.max(0, this.life[i] / this.maxLife[i]);
      this.col[i * 4 + 3] = this.alpha0[i] * f;
    }
    this.posAttr.needsUpdate = true;
    this.colAttr.needsUpdate = true;
    this.sizeAttr.needsUpdate = true;

    for (let i = this.rings.length - 1; i >= 0; i--) {
      const r = this.rings[i];
      r.t += dt;
      const f = r.t / r.life;
      const s = 1 + (r.maxScale - 1) * (1 - Math.pow(1 - f, 3));
      r.m.scale.set(s, s, s);
      r.m.material.opacity = 0.9 * (1 - f);
      if (f >= 1) {
        this.scene.remove(r.m);
        r.m.material.dispose();
        this.rings.splice(i, 1);
      }
    }
  }

  clear() {
    this.life.fill(0);
  }
}
