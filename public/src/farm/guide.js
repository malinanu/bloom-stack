// Tutorial guide: a glowing chevron by the player's feet pointing at the next objective, plus a ring on it.
import * as THREE from 'three';

export class Guide {
  constructor(scene) {
    const shape = new THREE.Shape();
    shape.moveTo(0, 0.55);
    shape.lineTo(0.42, 0.05);
    shape.lineTo(0.2, 0.05);
    shape.lineTo(0.2, -0.45);
    shape.lineTo(-0.2, -0.45);
    shape.lineTo(-0.2, 0.05);
    shape.lineTo(-0.42, 0.05);
    shape.closePath();
    const geo = new THREE.ShapeGeometry(shape).rotateX(-Math.PI / 2);
    this.arrow = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0xeaffd8, transparent: true, opacity: 0.9, depthWrite: false }));
    this.arrow.renderOrder = 3;
    this.arrow.visible = false;
    scene.add(this.arrow);

    this.ring = new THREE.Mesh(
      new THREE.RingGeometry(0.85, 1.05, 32).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0xfff3a0, transparent: true, opacity: 0.8, depthWrite: false }),
    );
    this.ring.renderOrder = 3;
    this.ring.visible = false;
    scene.add(this.ring);
    this.time = 0;
    this.target = null;
  }

  /** @param {{x:number,z:number}|null} target */
  set(target) {
    this.target = target;
  }

  update(dt, playerPos) {
    this.time += dt;
    const t = this.target;
    if (!t) {
      this.arrow.visible = false;
      this.ring.visible = false;
      return;
    }
    const dx = t.x - playerPos.x;
    const dz = t.z - playerPos.z;
    const d = Math.hypot(dx, dz);
    this.ring.visible = true;
    this.ring.position.set(t.x, 0.06, t.z);
    const pulse = 1 + Math.sin(this.time * 5) * 0.08;
    this.ring.scale.setScalar((t.r || 1.2) * pulse);
    this.ring.material.opacity = 0.55 + Math.sin(this.time * 5) * 0.25;

    this.arrow.visible = d > 2.2;
    if (!this.arrow.visible) return;
    const yaw = Math.atan2(dx, dz);
    const bob = 1.15 + Math.sin(this.time * 6) * 0.15;
    this.arrow.position.set(playerPos.x + (dx / d) * bob, 0.07, playerPos.z + (dz / d) * bob);
    // Shape points along +z after rotateX; rotate it to face the target.
    this.arrow.rotation.y = yaw + Math.PI;
  }
}
