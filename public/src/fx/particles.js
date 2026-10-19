// GPU-instanced tumbling quads for petal bursts, confetti and sparkles. One draw call for everything.
import * as THREE from 'three';

const MAX = 900;
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _c = new THREE.Color();

export const PALETTES = {
  tulip: [0xff5c9a, 0xff8fb8, 0xffffff, 0x6cc04a],
  rose: [0xe0233a, 0xff4d5e, 0x6cc04a],
  peony: [0xf39ad6, 0xe58ee8, 0xffd1ec, 0x6cc04a],
  confetti: [0xffd23f, 0xff5c9a, 0x3ec1ff, 0x7be36b, 0xffffff, 0xb17bff],
  cash: [0x6cd66a, 0xb6f5a6, 0xffe066],
  dust: [0xd9c7a0, 0xc8b48a],
};

export class Particles {
  constructor(scene) {
    const geo = new THREE.PlaneGeometry(1, 0.7);
    const mat = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, toneMapped: false });
    this.mesh = new THREE.InstancedMesh(geo, mat, MAX);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAX * 3), 3);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    this.mesh.renderOrder = 5;
    scene.add(this.mesh);
    this.list = [];
  }

  setScene(scene) {
    scene.add(this.mesh);
  }

  /**
   * @param {THREE.Vector3} pos
   * @param {{ count?: number, palette?: number[], speed?: number, up?: number, size?: number, life?: number, gravity?: number, spread?: number }} o
   */
  burst(pos, { count = 10, palette = PALETTES.confetti, speed = 3, up = 4, size = 0.14, life = 0.9, gravity = 9, spread = 0.2 } = {}) {
    for (let i = 0; i < count && this.list.length < MAX; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = speed * (0.4 + Math.random() * 0.6);
      this.list.push({
        x: pos.x + (Math.random() - 0.5) * spread,
        y: pos.y + (Math.random() - 0.5) * spread,
        z: pos.z + (Math.random() - 0.5) * spread,
        vx: Math.cos(a) * s,
        vy: up * (0.6 + Math.random() * 0.6),
        vz: Math.sin(a) * s,
        rx: Math.random() * 6, ry: Math.random() * 6, rz: Math.random() * 6,
        wx: (Math.random() - 0.5) * 14, wy: (Math.random() - 0.5) * 14, wz: (Math.random() - 0.5) * 14,
        size: size * (0.7 + Math.random() * 0.6),
        life: life * (0.7 + Math.random() * 0.5),
        age: 0,
        gravity,
        color: palette[(Math.random() * palette.length) | 0],
      });
    }
  }

  update(dt) {
    let n = 0;
    const out = [];
    for (const p of this.list) {
      p.age += dt;
      if (p.age >= p.life) continue;
      p.vy -= p.gravity * dt;
      const drag = Math.exp(-1.5 * dt);
      p.vx *= drag; p.vz *= drag;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      if (p.y < 0.03) { p.y = 0.03; p.vy *= -0.2; p.vx *= 0.5; p.vz *= 0.5; }
      p.rx += p.wx * dt; p.ry += p.wy * dt; p.rz += p.wz * dt;
      const k = 1 - Math.max(0, (p.age - p.life * 0.6) / (p.life * 0.4));
      _q.setFromEuler(_e.set(p.rx, p.ry, p.rz));
      _s.setScalar(p.size * k);
      _m.compose(_p.set(p.x, p.y, p.z), _q, _s);
      this.mesh.setMatrixAt(n, _m);
      this.mesh.setColorAt(n, _c.setHex(p.color));
      n++;
      out.push(p);
    }
    this.list = out;
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  clear() {
    this.list.length = 0;
    this.mesh.count = 0;
  }
}
