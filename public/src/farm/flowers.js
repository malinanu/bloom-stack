// Flower fields: one InstancedMesh per flower type, a spatial grid for fast harvesting, cut + regrow.
import * as THREE from 'three';
import { FIELDS } from './layout.js';
import { FLOWERS } from '../core/economy.js';
import { tulipGeometry, roseGeometry, peonyGeometry, makeFlowerMaterial } from './models.js';
import { ease } from '../core/tween.js';

export const FLOWER_COLORS = {
  tulip: [0xff4f93, 0xff6aa8, 0xf2468a, 0xff86b9, 0xff5aa0],
  rose: [0xe0233a, 0xd11f3f, 0xf03a4c, 0xc8183a],
  peony: [0xf39ad6, 0xec8ce0, 0xffb6dd, 0xf7a8cf],
};

// Representative colour per type, used for carried bunches, bouquets, HUD and particles.
export const TYPE_COLOR = { tulip: 0xff5c9a, rose: 0xe0233a, peony: 0xf08ad8 };

const GROWN = 0;
const CUT = 1;
const GROWING = 2;
const LOCKED = 3;
const GROW_TIME = 0.55;
const CELL = 1;

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _c = new THREE.Color();
const UP = new THREE.Vector3(0, 1, 0);

function rand(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

export class Flowers {
  constructor(scene, unlocked) {
    this.material = makeFlowerMaterial({ wind: 0.09 });
    const geos = { tulip: tulipGeometry(), rose: roseGeometry(), peony: peonyGeometry() };
    this.types = {};
    this.grid = new Map();
    this.fieldSlots = new Map(); // field id -> [{ type, i }]
    const r = rand(42);

    const slots = { tulip: [], rose: [], peony: [] };
    for (const field of FIELDS) {
      const [x0, z0, x1, z1] = field.rect;
      const list = [];
      const sp = field.spacing;
      for (let z = z0 + sp / 2; z < z1; z += sp * 0.87) {
        const row = Math.round((z - z0) / (sp * 0.87));
        for (let x = x0 + sp / 2 + (row % 2) * sp * 0.5; x < x1; x += sp) {
          const s = slots[field.type];
          const locked = field.requires !== null && !unlocked.includes(field.requires);
          s.push({
            x: x + (r() - 0.5) * sp * 0.45,
            z: z + (r() - 0.5) * sp * 0.45,
            rot: r() * Math.PI * 2,
            base: 0.85 + r() * 0.35,
            state: locked ? LOCKED : GROWN,
            timer: 0,
            field: field.id,
          });
          list.push({ type: field.type, i: s.length - 1 });
        }
      }
      this.fieldSlots.set(field.id, list);
    }

    for (const type of Object.keys(slots)) {
      const items = slots[type];
      const mesh = new THREE.InstancedMesh(geos[type], this.material, Math.max(1, items.length));
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.receiveShadow = false;
      mesh.castShadow = false;
      mesh.frustumCulled = false; // instances span the whole map and change scale constantly
      items.forEach((it, i) => {
        mesh.setColorAt(i, _c.setHex(FLOWER_COLORS[type][(r() * FLOWER_COLORS[type].length) | 0]));
        this.setMatrix(mesh, it, i, it.state === GROWN ? 1 : 0);
        const key = this.cellKey(it.x, it.z);
        if (!this.grid.has(key)) this.grid.set(key, []);
        this.grid.get(key).push({ type, i });
      });
      mesh.instanceMatrix.needsUpdate = true;
      scene.add(mesh);
      this.types[type] = { mesh, items, active: new Set(), dirty: false };
    }
    this.time = 0;
  }

  cellKey(x, z) {
    return `${Math.floor(x / CELL)},${Math.floor(z / CELL)}`;
  }

  setMatrix(mesh, it, i, scale) {
    _q.setFromAxisAngle(UP, it.rot);
    _s.setScalar(Math.max(1e-4, scale * it.base));
    _m.compose(_p.set(it.x, 0, it.z), _q, _s);
    mesh.setMatrixAt(i, _m);
  }

  /** Grow a newly bought field in, as a wave spreading from `origin`. */
  unlockField(fieldId, origin) {
    for (const { type, i } of this.fieldSlots.get(fieldId) || []) {
      const t = this.types[type];
      const it = t.items[i];
      if (it.state !== LOCKED) continue;
      it.state = GROWING;
      it.timer = -Math.hypot(it.x - origin.x, it.z - origin.z) * 0.06;
      t.active.add(i);
    }
  }

  /**
   * Cut grown flowers within `radius` of (x, z), at most `max` of them.
   * @param {(type: string, x: number, z: number) => void} onCut
   */
  harvest(x, z, radius, max, onCut) {
    if (max <= 0) return 0;
    let n = 0;
    const r2 = radius * radius;
    const c0x = Math.floor((x - radius) / CELL);
    const c1x = Math.floor((x + radius) / CELL);
    const c0z = Math.floor((z - radius) / CELL);
    const c1z = Math.floor((z + radius) / CELL);
    for (let cx = c0x; cx <= c1x; cx++) {
      for (let cz = c0z; cz <= c1z; cz++) {
        const cell = this.grid.get(`${cx},${cz}`);
        if (!cell) continue;
        for (const { type, i } of cell) {
          const t = this.types[type];
          const it = t.items[i];
          if (it.state !== GROWN) continue;
          const dx = it.x - x;
          const dz = it.z - z;
          if (dx * dx + dz * dz > r2) continue;
          it.state = CUT;
          it.timer = FLOWERS[type].regrow * (0.85 + Math.random() * 0.3);
          t.active.add(i);
          this.setMatrix(t.mesh, it, i, 0);
          t.dirty = true;
          onCut(type, it.x, it.z);
          if (++n >= max) return n;
        }
      }
    }
    return n;
  }

  /** Nearest grown flower of one of `types` (for the guide arrow), or null. */
  nearestGrown(x, z, types) {
    let best = null;
    let bestD = Infinity;
    for (const type of types) {
      const t = this.types[type];
      // Sample every 7th flower: plenty for pointing the way, and cheap.
      for (let i = 0; i < t.items.length; i += 7) {
        const it = t.items[i];
        if (it.state !== GROWN) continue;
        const d = (it.x - x) ** 2 + (it.z - z) ** 2;
        if (d < bestD) { bestD = d; best = it; }
      }
    }
    return best ? { x: best.x, z: best.z, dist: Math.sqrt(bestD) } : null;
  }

  update(dt) {
    this.time += dt;
    this.material.userData.uniforms.uTime.value = this.time;
    for (const t of Object.values(this.types)) {
      for (const i of t.active) {
        const it = t.items[i];
        if (it.state === CUT) {
          it.timer -= dt;
          if (it.timer <= 0) { it.state = GROWING; it.timer = 0; }
          continue;
        }
        if (it.state === GROWING) {
          it.timer += dt;
          const k = Math.min(1, Math.max(0, it.timer / GROW_TIME));
          this.setMatrix(t.mesh, it, i, ease.outBack(k));
          t.dirty = true;
          if (k >= 1) { it.state = GROWN; t.active.delete(i); }
        }
      }
      if (t.dirty) {
        t.mesh.instanceMatrix.needsUpdate = true;
        t.dirty = false;
      }
    }
  }
}
