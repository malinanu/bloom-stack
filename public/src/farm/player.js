// The gardener: KayKit Rogue in a straw hat with a scythe. Moves with the joystick, collides with stations.
import * as THREE from 'three';
import { BOUNDS, COLLIDERS, PLAYER_START } from './layout.js';
import { scytheMesh, strawHat } from './models.js';
import { damp } from '../core/tween.js';

const RADIUS = 0.38;

export class Player {
  /**
   * @param {{ bounds?: {minX:number,maxX:number,minZ:number,maxZ:number}, colliders?: number[][], start?: {x:number,z:number} }} opts
   *   defaults are the garden's layout; level arenas pass their own
   */
  constructor(scene, assets, { bounds = BOUNDS, colliders = COLLIDERS, start = PLAYER_START } = {}) {
    this.bounds = bounds;
    this.colliders = colliders;
    this.root = new THREE.Group();
    this.root.position.set(start.x, 0, start.z);
    this.char = assets.character('rogue', { hide: /Cape/ });
    this.root.add(this.char.model);
    scene.add(this.root);

    this.addHat();
    this.scythe = scytheMesh();
    const hand = this.char.model.getObjectByName('handslot.r');
    this.scythe.scale.setScalar(1.25);
    this.scythe.position.set(0, -0.55, 0);
    (hand || this.root).add(this.scythe);

    this.vel = new THREE.Vector3();
    this.yaw = Math.PI; // face the fields (−z)
    this.cutting = 0; // seconds of swing left
    this.swingT = 0;
    this.locked = false; // e.g. while cheering
    this.char.play('Idle_A');
  }

  get pos() {
    return this.root.position;
  }

  addHat() {
    const model = this.char.model;
    const head = model.getObjectByName('head');
    let headMesh = null;
    model.traverse((o) => { if (!headMesh && o.isMesh && /_Head$/.test(o.name)) headMesh = o; });
    if (!head || !headMesh) return;
    model.updateMatrixWorld(true);
    headMesh.geometry.computeBoundingBox();
    const box = headMesh.geometry.boundingBox.clone().applyMatrix4(headMesh.matrixWorld);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const hat = strawHat();
    const local = head.worldToLocal(new THREE.Vector3(center.x, box.max.y - size.y * 0.16, center.z));
    // The head bone is centred over the body; only the height matters (x/z can pick up stale parent offsets).
    hat.position.set(0, local.y, 0);
    // Bone space is in raw KayKit units; size is in world units (scaled by the model).
    const raw = size.x / model.scale.x;
    hat.scale.setScalar(raw * 0.95);
    head.add(hat);
  }

  /** Swing the scythe for a moment (called whenever flowers are cut). */
  swing() {
    this.cutting = 0.25;
  }

  cheer() {
    this.locked = true;
    this.char.play('Cheering', { once: true, fade: 0.15 });
    setTimeout(() => { this.locked = false; }, 1100);
  }

  update(dt, move, speed) {
    const target = new THREE.Vector3(move.x, 0, move.z).multiplyScalar(this.locked ? 0 : speed);
    this.vel.lerp(target, damp(14, dt));
    const p = this.root.position;
    p.addScaledVector(this.vel, dt);
    this.collide(p);

    const sp = this.vel.length();
    if (sp > 0.3) {
      const want = Math.atan2(this.vel.x, this.vel.z);
      let d = want - this.yaw;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      this.yaw += d * damp(14, dt);
    }
    this.root.rotation.y = this.yaw;

    if (!this.locked) {
      if (sp > 0.6) this.char.play('Running_A', { speed: THREE.MathUtils.clamp(sp / 5, 0.8, 1.4) });
      else this.char.play('Idle_A');
    }
    this.char.mixer.update(dt);

    // Scythe swing: a quick back-and-forth sweep while cutting.
    this.cutting = Math.max(0, this.cutting - dt);
    this.swingT += dt * (this.cutting > 0 ? 22 : 0);
    const amt = this.cutting > 0 ? 0.6 : 0;
    this.scythe.rotation.x = THREE.MathUtils.lerp(this.scythe.rotation.x, Math.sin(this.swingT) * amt, damp(20, dt));
  }

  /** Put the gardener somewhere new (level start), standing still and facing the field. */
  teleport(x, z, yaw = Math.PI) {
    this.root.position.set(x, 0, z);
    this.vel.set(0, 0, 0);
    this.yaw = yaw;
    this.root.rotation.y = yaw;
    this.locked = false;
  }

  collide(p) {
    const b = this.bounds;
    p.x = THREE.MathUtils.clamp(p.x, b.minX, b.maxX);
    p.z = THREE.MathUtils.clamp(p.z, b.minZ, b.maxZ);
    for (const [x0, z0, x1, z1] of this.colliders) {
      const cx = THREE.MathUtils.clamp(p.x, x0, x1);
      const cz = THREE.MathUtils.clamp(p.z, z0, z1);
      const dx = p.x - cx;
      const dz = p.z - cz;
      const d2 = dx * dx + dz * dz;
      if (d2 >= RADIUS * RADIUS) continue;
      if (d2 > 1e-8) {
        const d = Math.sqrt(d2);
        p.x = cx + (dx / d) * RADIUS;
        p.z = cz + (dz / d) * RADIUS;
      } else {
        // Centre inside the box: push out along the shallowest side.
        const opts = [[p.x - x0, -1, 0], [x1 - p.x, 1, 0], [p.z - z0, 0, -1], [z1 - p.z, 0, 1]].sort((a, b) => a[0] - b[0]);
        const [depth, sx, sz] = opts[0];
        p.x += sx * (depth + RADIUS);
        p.z += sz * (depth + RADIUS);
      }
    }
  }

  /** Point in front of the player where the scythe cuts. */
  cutPoint(out = new THREE.Vector3()) {
    return out.set(this.root.position.x + Math.sin(this.yaw) * 0.45, 0, this.root.position.z + Math.cos(this.yaw) * 0.45);
  }
}
