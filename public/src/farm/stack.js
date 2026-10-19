// The tower of flower bunches on the gardener's back. It lags behind movement like a spring, so it sways.
import * as THREE from 'three';
import { FLOWER_TYPES, STACK_LIMIT } from '../core/economy.js';
import { bunchGeometry, makeFlowerMaterial, textTexture } from './models.js';
import { TYPE_COLOR } from './flowers.js';

const ITEM_H = 0.1;
const MAX_ITEMS = STACK_LIMIT;
const FLY_TIME = 0.32;

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3(1, 1, 1);
const _c = new THREE.Color();

export class Stack {
  constructor(scene) {
    const mat = makeFlowerMaterial();
    this.meshes = {};
    for (const type of FLOWER_TYPES) {
      const mesh = new THREE.InstancedMesh(bunchGeometry(type), mat, MAX_ITEMS);
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.frustumCulled = false;
      mesh.castShadow = true;
      for (let i = 0; i < MAX_ITEMS; i++) mesh.setColorAt(i, _c.setHex(TYPE_COLOR[type]));
      mesh.count = 0;
      scene.add(mesh);
      this.meshes[type] = mesh;
    }
    this.items = []; // { type, t, from: Vector3, jitter }
    this.capacity = 10;
    this.sway = new THREE.Vector2();
    this.swayVel = new THREE.Vector2();
    this.lastVel = new THREE.Vector3();
    this.base = new THREE.Vector3();
    this.yaw = 0;
    this.time = 0;

    this.maxLabel = new THREE.Sprite(new THREE.SpriteMaterial({
      map: textTexture('MAX', { w: 256, h: 128, size: 92, color: '#ffe14d', stroke: '#b3261e' }),
      depthTest: false,
    }));
    this.maxLabel.scale.set(1.3, 0.65, 1);
    this.maxLabel.renderOrder = 10;
    this.maxLabel.visible = false;
    scene.add(this.maxLabel);
  }

  get count() { return this.items.length; }
  get limit() { return Math.min(this.capacity, MAX_ITEMS); }
  get full() { return this.items.length >= this.limit; }
  get space() { return Math.max(0, this.limit - this.items.length); }

  /** Restore saved items instantly (no fly-in). */
  load(types) {
    this.items = types.slice(0, MAX_ITEMS).map((type) => ({ type, t: 1, from: new THREE.Vector3(), jitter: Math.random() - 0.5 }));
  }

  types() {
    return this.items.map((it) => it.type);
  }

  countOf(type) {
    let n = 0;
    for (const it of this.items) if (it.type === type) n++;
    return n;
  }

  push(type, from) {
    if (this.items.length >= this.limit) return false;
    this.items.push({ type, t: 0, from: from.clone(), jitter: Math.random() - 0.5 });
    return true;
  }

  /** Take the top item that has landed. Returns { type, pos } or null. */
  pop() {
    for (let i = this.items.length - 1; i >= 0; i--) {
      if (this.items[i].t < 1) continue;
      const pos = this.slotPos(i, new THREE.Vector3());
      const [it] = this.items.splice(i, 1);
      return { type: it.type, pos };
    }
    return null;
  }

  slotPos(i, out) {
    const h = i * ITEM_H;
    const bend = (h / 2.6) ** 2;
    return out.set(this.base.x + this.sway.x * bend, this.base.y + h, this.base.z + this.sway.y * bend);
  }

  topPos(out = new THREE.Vector3()) {
    return this.slotPos(this.items.length, out);
  }

  update(dt, player) {
    this.time += dt;
    // Anchor on the gardener's back.
    const p = player.pos;
    this.yaw = player.yaw;
    this.base.set(p.x - Math.sin(player.yaw) * 0.42, 0.85, p.z - Math.cos(player.yaw) * 0.42);

    // Spring: acceleration pushes the top the other way, then it settles with a wobble.
    const ax = (player.vel.x - this.lastVel.x) / Math.max(dt, 1e-3);
    const az = (player.vel.z - this.lastVel.z) / Math.max(dt, 1e-3);
    this.lastVel.copy(player.vel);
    const k = 38;
    const c = 5.5;
    this.swayVel.x += (-k * this.sway.x - c * this.swayVel.x - ax * 0.09) * dt;
    this.swayVel.y += (-k * this.sway.y - c * this.swayVel.y - az * 0.09) * dt;
    this.sway.addScaledVector(this.swayVel, dt);
    this.sway.clampLength(0, 0.9);

    const counts = Object.fromEntries(FLOWER_TYPES.map((t) => [t, 0]));
    this.items.forEach((it, i) => {
      this.slotPos(i, _p);
      if (it.t < 1) {
        it.t = Math.min(1, it.t + dt / FLY_TIME);
        const t = it.t;
        const target = _p.clone();
        _p.lerpVectors(it.from, target, t);
        _p.y += Math.sin(Math.PI * t) * 1.2;
      }
      const h = i * ITEM_H;
      const lean = (h / 2.6) * 0.35;
      _q.setFromEuler(_e.set(-this.sway.y * lean, this.yaw + it.jitter * 0.5, this.sway.x * lean, 'YXZ'));
      _m.compose(_p, _q, _s);
      const mesh = this.meshes[it.type];
      mesh.setMatrixAt(counts[it.type]++, _m);
    });
    for (const type of FLOWER_TYPES) {
      const mesh = this.meshes[type];
      mesh.count = counts[type];
      mesh.instanceMatrix.needsUpdate = true;
    }

    const showMax = this.full && this.items.length > 0;
    this.maxLabel.visible = showMax;
    if (showMax) {
      this.topPos(this.maxLabel.position);
      this.maxLabel.position.y += 0.45 + Math.sin(this.time * 6) * 0.06;
      const s = 1 + Math.sin(this.time * 8) * 0.06;
      this.maxLabel.scale.set(1.3 * s, 0.65 * s, 1);
    }
  }
}
