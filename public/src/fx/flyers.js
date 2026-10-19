// Things that arc through the air: flowers onto the stack, bunches onto the table, coins to the player.
// One InstancedMesh per kind; `to` may be a function so a flyer can chase a moving target.
import * as THREE from 'three';

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _to = new THREE.Vector3();
const _c = new THREE.Color();

export class Flyers {
  constructor(scene) {
    this.scene = scene;
    this.kinds = new Map();
  }

  addKind(name, geometry, material, { max = 64, scale = 1, color = null } = {}) {
    const mesh = new THREE.InstancedMesh(geometry, material, max);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.frustumCulled = false;
    mesh.castShadow = true;
    mesh.count = 0;
    if (color !== null) {
      for (let i = 0; i < max; i++) mesh.setColorAt(i, _c.setHex(color));
    }
    this.scene.add(mesh);
    this.kinds.set(name, { mesh, list: [], max, scale });
  }

  /**
   * @param {string} kind
   * @param {THREE.Vector3} from
   * @param {THREE.Vector3 | (() => THREE.Vector3)} to
   * @param {{ dur?: number, arc?: number, spin?: number, scaleTo?: number, delay?: number, onArrive?: () => void }} o
   */
  launch(kind, from, to, { dur = 0.35, arc = 1.2, spin = 0, scaleTo = 1, delay = 0, yaw = Math.random() * 6.28, onArrive = null } = {}) {
    const k = this.kinds.get(kind);
    if (k.list.length >= k.max) {
      onArrive?.(); // never lose an item just because too many are in flight
      return;
    }
    k.list.push({ from: from.clone(), to, t: -delay / dur, dur, arc, spin, scaleTo, yaw, onArrive });
  }

  inFlight(kind) {
    return this.kinds.get(kind)?.list.length ?? 0;
  }

  update(dt) {
    const arrived = [];
    for (const k of this.kinds.values()) {
      let n = 0;
      const keep = [];
      for (const f of k.list) {
        f.t += dt / f.dur;
        if (f.t >= 1) { if (f.onArrive) arrived.push(f.onArrive); continue; }
        keep.push(f);
        if (f.t < 0) continue;
        const t = f.t;
        const target = typeof f.to === 'function' ? f.to() : f.to;
        _to.copy(target);
        _p.lerpVectors(f.from, _to, t);
        _p.y += Math.sin(Math.PI * t) * f.arc;
        _q.setFromEuler(_e.set(f.spin * t * 6, f.yaw + f.spin * t * 4, 0));
        _s.setScalar(k.scale * (1 + (f.scaleTo - 1) * t));
        _m.compose(_p, _q, _s);
        k.mesh.setMatrixAt(n++, _m);
      }
      k.list = keep;
      k.mesh.count = n;
      k.mesh.instanceMatrix.needsUpdate = true;
    }
    // Callbacks run after the loop because they may launch new flyers.
    for (const cb of arrived) cb();
  }
}
